"""
Agent Builder API — create, configure, and run autonomous AI agents.

Each agent has:
  - Custom instructions (system prompt)
  - Optional chatbot attachment (inherits KB + base system prompt)
  - Tool toggles (web_search, browser, code, http, sheets, email, sms)
  - MCP server tools (dynamically discovered from user's configured MCP servers)
  - Agentic loop with configurable max_steps
  - Optional public share link
"""
import asyncio
import json
import re as _re
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any, AsyncIterator

import anthropic
import httpx
from openai import AsyncOpenAI
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, select

from app.core.config import settings
from app.core.dependencies import CurrentUser, DBSession
from app.models.agent import Agent
from app.models.agent_conversation import AgentConversation
from app.models.chatbot_config import ChatbotConfig
from app.models.mcp import MCPServerConfig
from app.models.usage_log import UsageLog
from app.schemas.agent import AgentCreateRequest, AgentResponse, AgentUpdateRequest
from app.services.kb.rag import RAGService
from app.services.llm.key_store import get_key as _get_user_key

router = APIRouter(prefix="/api/v1/agents", tags=["agents"])
public_router = APIRouter(prefix="/api/public/agents", tags=["agents-public"])


# ─── CRUD ─────────────────────────────────────────────────────────────────────

@router.get("")
async def list_agents(user: CurrentUser, db: DBSession):
    result = await db.execute(
        select(Agent).where(Agent.user_id == user.id).order_by(Agent.created_at.desc())
    )
    agents = result.scalars().all()
    return {"success": True, "data": [AgentResponse.model_validate(a) for a in agents]}


@router.post("")
async def create_agent(body: AgentCreateRequest, user: CurrentUser, db: DBSession):
    if body.chatbot_id:
        await _get_owned_chatbot(body.chatbot_id, user.id, db)
    agent = Agent(
        user_id=user.id,
        name=body.name,
        description=body.description,
        instructions=body.instructions,
        chatbot_id=body.chatbot_id,
        model=body.model,
        tools=body.tools.model_dump(),
        memory_enabled=body.memory_enabled,
        max_steps=body.max_steps,
    )
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return {"success": True, "data": AgentResponse.model_validate(agent)}


@router.get("/{agent_id}")
async def get_agent(agent_id: uuid.UUID, user: CurrentUser, db: DBSession):
    agent = await _get_owned_agent(agent_id, user.id, db)
    return {"success": True, "data": AgentResponse.model_validate(agent)}


@router.put("/{agent_id}")
async def update_agent(
    agent_id: uuid.UUID, body: AgentUpdateRequest, user: CurrentUser, db: DBSession
):
    agent = await _get_owned_agent(agent_id, user.id, db)
    data = body.model_dump(exclude_unset=True)
    if "tools" in data and data["tools"] is not None:
        data["tools"] = body.tools.model_dump()  # type: ignore[union-attr]
    if "chatbot_id" in data and data["chatbot_id"]:
        await _get_owned_chatbot(data["chatbot_id"], user.id, db)
    for k, v in data.items():
        setattr(agent, k, v)
    await db.commit()
    await db.refresh(agent)
    return {"success": True, "data": AgentResponse.model_validate(agent)}


@router.delete("/{agent_id}")
async def delete_agent(agent_id: uuid.UUID, user: CurrentUser, db: DBSession):
    agent = await _get_owned_agent(agent_id, user.id, db)
    await db.delete(agent)
    await db.commit()
    return {"success": True}


# ─── Share management ──────────────────────────────────────────────────────────

@router.post("/{agent_id}/share/enable")
async def enable_share(agent_id: uuid.UUID, user: CurrentUser, db: DBSession):
    """Enable public sharing and generate a share token."""
    agent = await _get_owned_agent(agent_id, user.id, db)
    if not agent.share_token:
        agent.share_token = secrets.token_urlsafe(32)
    agent.share_enabled = True
    await db.commit()
    await db.refresh(agent)
    return {"success": True, "data": {"share_token": agent.share_token, "share_enabled": True}}


@router.post("/{agent_id}/share/disable")
async def disable_share(agent_id: uuid.UUID, user: CurrentUser, db: DBSession):
    """Disable public sharing (token is preserved for re-enabling)."""
    agent = await _get_owned_agent(agent_id, user.id, db)
    agent.share_enabled = False
    await db.commit()
    return {"success": True, "data": {"share_enabled": False}}


@router.post("/{agent_id}/share/regenerate")
async def regenerate_share_token(agent_id: uuid.UUID, user: CurrentUser, db: DBSession):
    """Regenerate the share token, invalidating any existing shared links."""
    agent = await _get_owned_agent(agent_id, user.id, db)
    agent.share_token = secrets.token_urlsafe(32)
    agent.share_enabled = True
    await db.commit()
    await db.refresh(agent)
    return {"success": True, "data": {"share_token": agent.share_token, "share_enabled": True}}


# ─── Public endpoints (no auth) ────────────────────────────────────────────────

@public_router.get("/{share_token}")
async def get_public_agent(share_token: str, db: DBSession):
    """Return public-facing agent info for the share page."""
    agent = await _get_shared_agent(share_token, db)
    return {
        "success": True,
        "data": {
            "id": str(agent.id),
            "name": agent.name,
            "description": agent.description,
            "model": agent.model,
        },
    }


class PublicChatRequest(BaseModel):
    message: str
    conversation_history: list[dict] = []


@public_router.post("/{share_token}/chat")
async def public_agent_chat(share_token: str, body: PublicChatRequest, db: DBSession):
    """Stream a public agent response. No authentication required."""
    agent = await _get_shared_agent(share_token, db)
    system_prompt = await _build_system_prompt(agent, db)  # no user_id — never inject token for public
    tools, mcp_map = await _build_tools_with_mcp(agent, agent.user_id, db)
    _, api_key = await _resolve_api_key(agent.user_id, agent.model or "claude-sonnet-4-6", db)
    return StreamingResponse(
        _run_agent(agent, system_prompt, tools, mcp_map, body.message, body.conversation_history, api_key=api_key),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─── Memory endpoints ─────────────────────────────────────────────────────────

@router.get("/{agent_id}/memory")
async def list_agent_memory(agent_id: uuid.UUID, user: CurrentUser, db: DBSession):
    """Return the last 20 persisted conversation sessions for this agent."""
    agent = await _get_owned_agent(agent_id, user.id, db)
    result = await db.execute(
        select(AgentConversation)
        .where(AgentConversation.agent_id == agent.id, AgentConversation.user_id == user.id)
        .order_by(AgentConversation.created_at.desc())
        .limit(20)
    )
    sessions = result.scalars().all()
    return {
        "success": True,
        "data": [
            {
                "id": str(s.id),
                "message_count": len(s.messages),
                "tool_calls": s.tool_calls,
                "preview": next((m["content"][:120] for m in s.messages if m.get("role") == "user"), ""),
                "created_at": s.created_at.isoformat(),
            }
            for s in sessions
        ],
    }


@router.delete("/{agent_id}/memory")
async def clear_agent_memory(agent_id: uuid.UUID, user: CurrentUser, db: DBSession):
    """Wipe all memory sessions for this agent."""
    agent = await _get_owned_agent(agent_id, user.id, db)
    result = await db.execute(
        select(AgentConversation).where(
            AgentConversation.agent_id == agent.id,
            AgentConversation.user_id == user.id,
        )
    )
    for session in result.scalars().all():
        await db.delete(session)
    await db.commit()
    return {"success": True}


@router.delete("/{agent_id}/memory/{session_id}")
async def delete_memory_session(
    agent_id: uuid.UUID, session_id: uuid.UUID, user: CurrentUser, db: DBSession
):
    agent = await _get_owned_agent(agent_id, user.id, db)
    result = await db.execute(
        select(AgentConversation).where(
            AgentConversation.id == session_id,
            AgentConversation.agent_id == agent.id,
            AgentConversation.user_id == user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.delete(session)
    await db.commit()
    return {"success": True}


# ─── Analytics endpoint ───────────────────────────────────────────────────────

@router.get("/{agent_id}/analytics")
async def get_agent_analytics(agent_id: uuid.UUID, user: CurrentUser, db: DBSession):
    """Return 30-day usage stats for this agent."""
    agent = await _get_owned_agent(agent_id, user.id, db)

    # Conversation count
    conv_count_result = await db.execute(
        select(func.count()).select_from(AgentConversation).where(
            AgentConversation.agent_id == agent.id,
            AgentConversation.user_id == user.id,
        )
    )
    total_conversations = conv_count_result.scalar() or 0

    # Usage logs aggregates
    usage_result = await db.execute(
        select(
            func.count().label("runs"),
            func.coalesce(func.sum(UsageLog.input_tokens), 0).label("input_tokens"),
            func.coalesce(func.sum(UsageLog.output_tokens), 0).label("output_tokens"),
            func.coalesce(func.sum(UsageLog.cost_usd), 0).label("cost_usd"),
        ).where(UsageLog.agent_id == agent.id)
    )
    row = usage_result.one()

    # Daily run counts for chart (last 14 days)
    from sqlalchemy import cast, Date, text as sa_text
    daily_result = await db.execute(
        select(
            cast(UsageLog.created_at, Date).label("day"),
            func.count().label("runs"),
        )
        .where(
            UsageLog.agent_id == agent.id,
            UsageLog.created_at >= sa_text("now() - interval '14 days'"),
        )
        .group_by("day")
        .order_by("day")
    )
    daily = [{"date": str(r.day), "runs": r.runs} for r in daily_result]

    return {
        "success": True,
        "data": {
            "total_conversations": total_conversations,
            "total_runs": int(row.runs),
            "input_tokens": int(row.input_tokens),
            "output_tokens": int(row.output_tokens),
            "cost_usd": float(row.cost_usd),
            "daily": daily,
        },
    }


# ─── Chat / Run ───────────────────────────────────────────────────────────────

class AgentChatRequest(BaseModel):
    message: str
    conversation_history: list[dict] = []


@router.post("/{agent_id}/chat")
async def agent_chat(
    agent_id: uuid.UUID,
    body: AgentChatRequest,
    user: CurrentUser,
    db: DBSession,
):
    """Stream an agent response with tool use, showing thinking steps as SSE events."""
    agent = await _get_owned_agent(agent_id, user.id, db)
    system_prompt = await _build_system_prompt(agent, db, user_id=user.id)
    tools, mcp_map = await _build_tools_with_mcp(agent, user.id, db)
    _, api_key = await _resolve_api_key(user.id, agent.model or "claude-sonnet-4-6", db)

    # Load memory and inject as extra history if enabled
    history = list(body.conversation_history)
    if agent.memory_enabled and not history:
        history = await _load_agent_memory(agent.id, user.id, db)

    async def _stream_and_track():
        collected_messages: list[dict] = [{"role": "user", "content": body.message}]
        assistant_text: list[str] = []
        tool_call_count = 0

        async for chunk in _run_agent(agent, system_prompt, tools, mcp_map, body.message, history, api_key=api_key):
            yield chunk
            try:
                evt = json.loads(chunk[6:]) if chunk.startswith("data: ") else {}
                if evt.get("type") == "text":
                    assistant_text.append(evt.get("content", ""))
                elif evt.get("type") == "tool_call":
                    tool_call_count += 1
            except Exception:
                pass

        # Persist conversation + fire webhook after stream ends
        final_text = "".join(assistant_text)
        if final_text:
            collected_messages.append({"role": "assistant", "content": final_text})
        asyncio.create_task(_post_run_tasks(agent, user.id, collected_messages, tool_call_count, db))

    return StreamingResponse(
        _stream_and_track(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─── Agent execution loop ─────────────────────────────────────────────────────

_PROVIDER_BASE_URLS: dict[str, str] = {
    "openai":     "https://api.openai.com/v1",
    "groq":       "https://api.groq.com/openai/v1",
    "deepseek":   "https://api.deepseek.com/v1",
    "perplexity": "https://api.perplexity.ai",
    "xai":        "https://api.x.ai/v1",
}

_SETTINGS_KEY_ATTR: dict[str, str] = {
    "anthropic":  "anthropic_api_key",
    "google":     "google_ai_api_key",
    "openai":     "openai_api_key",
    "groq":       "groq_api_key",
    "deepseek":   "deepseek_api_key",
    "perplexity": "perplexity_api_key",
    "xai":        "xai_api_key",
}


def _model_provider(model: str) -> str:
    from app.services.llm.router import get_model_provider
    return get_model_provider(model)


async def _resolve_api_key(user_id: uuid.UUID, model: str, db) -> tuple[str, str | None]:
    """Return (provider, api_key) for the given model, reading per-user keys first."""
    provider = _model_provider(model)
    user_key = await _get_user_key(user_id, provider, db)
    if user_key:
        return provider, user_key
    attr = _SETTINGS_KEY_ATTR.get(provider, "")
    fallback = getattr(settings, attr, None) if attr else None
    return provider, fallback or None


# kept for callers that pre-resolve (public_agent_chat, agent_chat)
async def _resolve_anthropic_key(user_id: uuid.UUID, db) -> str | None:
    _, key = await _resolve_api_key(user_id, "claude-sonnet-4-6", db)
    return key


async def _run_agent(
    agent: Agent,
    system_prompt: str,
    tools: list[dict],
    mcp_map: dict[str, Any],
    user_message: str,
    history: list[dict],
    *,
    api_key: str | None = None,
) -> AsyncIterator[str]:
    model = agent.model or "claude-sonnet-4-6"
    provider = _model_provider(model)

    if not api_key:
        yield _sse({"type": "error", "content": f"No {provider.title()} API key configured. Add one in Settings → Model Keys."})
        return

    if provider == "google":
        async for chunk in _run_agent_gemini(agent, system_prompt, tools, mcp_map, user_message, history, api_key):
            yield chunk
    elif provider == "anthropic":
        async for chunk in _run_agent_anthropic(agent, system_prompt, tools, mcp_map, user_message, history, api_key):
            yield chunk
    else:
        base_url = _PROVIDER_BASE_URLS.get(provider, "https://api.openai.com/v1")
        async for chunk in _run_agent_openai_compat(agent, system_prompt, tools, mcp_map, user_message, history, api_key, base_url):
            yield chunk


async def _run_agent_anthropic(
    agent: Agent,
    system_prompt: str,
    tools: list[dict],
    mcp_map: dict[str, Any],
    user_message: str,
    history: list[dict],
    api_key: str,
) -> AsyncIterator[str]:
    client = anthropic.AsyncAnthropic(api_key=api_key)
    messages: list[dict] = list(history)
    messages.append({"role": "user", "content": user_message})

    step = 0
    max_steps = agent.max_steps or 10
    ctx = {"agent_id": str(agent.id), "user_id": str(agent.user_id)}

    try:
        while step < max_steps:
            step += 1
            kwargs: dict[str, Any] = {
                "model": agent.model or "claude-sonnet-4-6",
                "max_tokens": 4096,
                "system": system_prompt,
                "messages": messages,
            }
            if tools:
                kwargs["tools"] = tools

            response = await client.messages.create(**kwargs)

            text_parts: list[str] = []
            tool_uses: list[Any] = []
            for block in response.content:
                if block.type == "text":
                    text_parts.append(block.text)
                elif block.type == "tool_use":
                    tool_uses.append(block)

            if text_parts:
                yield _sse({"type": "text", "content": "".join(text_parts)})

            if not tool_uses or response.stop_reason == "end_turn":
                break

            tool_results: list[dict] = []
            for tu in tool_uses:
                yield _sse({"type": "tool_call", "tool": tu.name, "input": tu.input})
                result_text = await _execute_tool(tu.name, tu.input, mcp_map, ctx)
                yield _sse({"type": "tool_result", "tool": tu.name, "result": result_text[:500]})
                tool_results.append({"type": "tool_result", "tool_use_id": tu.id, "content": result_text})

            messages.append({"role": "assistant", "content": response.content})
            messages.append({"role": "user", "content": tool_results})

            if response.stop_reason != "tool_use":
                break
    except Exception as exc:
        msg = str(exc)
        # Trim verbose API error bodies to the first line for the UI
        short = msg.split("\n")[0].strip()
        yield _sse({"type": "error", "content": short or msg})
        return

    yield _sse({"type": "done"})


def _tools_to_openai(tools: list[dict]) -> list[dict]:
    """Convert Anthropic-format tool definitions to OpenAI function-calling format."""
    result = []
    for t in tools:
        result.append({
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t.get("description", ""),
                "parameters": t.get("input_schema", {"type": "object", "properties": {}}),
            },
        })
    return result


def _is_tool_generation_error(exc: Exception) -> bool:
    """Return True when the provider rejected a malformed tool call generation."""
    s = str(exc).lower()
    return (
        "tool_use_failed" in s
        or "failed to call a function" in s
        or "tool call validation failed" in s
    )


def _build_text_tool_instructions(oai_tools: list[dict]) -> str:
    """Build a system prompt addendum that teaches any model to call tools via JSON blocks."""
    lines = [
        "TOOL CALLING INSTRUCTIONS:",
        "When you need to use a tool, output a JSON block in this exact format (including the backticks):",
        "",
        "```tool_call",
        '{"name": "tool_name", "args": {"param": "value"}}',
        "```",
        "",
        "Available tools:",
    ]
    for t in oai_tools:
        fn = t.get("function", t)
        name = fn.get("name", "")
        desc = fn.get("description", "")
        props = fn.get("parameters", {}).get("properties", {})
        param_names = list(props.keys())
        lines.append(f"- {name}: {desc}")
        if param_names:
            lines.append(f"  Parameters: {', '.join(param_names)}")
    lines += [
        "",
        "Call ONE tool per message. Wait for the result before calling another.",
        "Do NOT use XML tags or any other format — only the ```tool_call block above.",
    ]
    return "\n".join(lines)


_TOOL_CALL_BLOCK_RE = _re.compile(
    r"```tool_call\s*\n(\{.*?\})\s*\n```",
    _re.DOTALL,
)


def _extract_text_tool_calls(text: str) -> list[dict]:
    """Pull tool call JSON blocks out of a plain-text response."""
    calls = []
    for m in _TOOL_CALL_BLOCK_RE.finditer(text):
        try:
            data = json.loads(m.group(1))
            if "name" in data:
                calls.append({
                    "name": data["name"].strip(),
                    "args": data.get("args", data.get("arguments", data.get("parameters", {}))),
                })
        except Exception:
            pass
    return calls


async def _run_agent_openai_compat(
    agent: Agent,
    system_prompt: str,
    tools: list[dict],
    mcp_map: dict[str, Any],
    user_message: str,
    history: list[dict],
    api_key: str,
    base_url: str,
) -> AsyncIterator[str]:
    client = AsyncOpenAI(api_key=api_key, base_url=base_url)
    model = agent.model or "gpt-4o"
    oai_tools = _tools_to_openai(tools) if tools else []

    messages: list[dict] = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    for h in history:
        messages.append(h)
    messages.append({"role": "user", "content": user_message})

    step = 0
    max_steps = agent.max_steps or 10
    ctx = {"agent_id": str(agent.id), "user_id": str(agent.user_id)}
    text_tool_mode = False  # True once we've fallen back to JSON-in-text tool calling

    try:
        while step < max_steps:
            step += 1
            kwargs: dict[str, Any] = {
                "model": model,
                "messages": messages,
                "max_tokens": 4096,
            }
            if oai_tools and not text_tool_mode:
                kwargs["tools"] = oai_tools
                kwargs["tool_choice"] = "auto"

            try:
                response = await client.chat.completions.create(**kwargs)
            except Exception as exc:
                if oai_tools and not text_tool_mode and _is_tool_generation_error(exc):
                    # The model can't generate valid native tool calls.
                    # Switch to text-mode: inject instructions and retry without tools.
                    text_tool_mode = True
                    instructions = _build_text_tool_instructions(oai_tools)
                    if messages and messages[0]["role"] == "system":
                        messages[0]["content"] += "\n\n" + instructions
                    else:
                        messages.insert(0, {"role": "system", "content": instructions})
                    kwargs.pop("tools", None)
                    kwargs.pop("tool_choice", None)
                    response = await client.chat.completions.create(**kwargs)
                else:
                    raise

            choice = response.choices[0]
            msg = choice.message
            text = msg.content or ""

            if text_tool_mode:
                tool_calls = _extract_text_tool_calls(text)
                if tool_calls:
                    # Strip the ```tool_call blocks from what the user sees
                    display = _TOOL_CALL_BLOCK_RE.sub("", text).strip()
                    if display:
                        yield _sse({"type": "text", "content": display})
                    messages.append({"role": "assistant", "content": text})
                    for tc in tool_calls:
                        name = tc["name"]
                        inputs = tc["args"]
                        yield _sse({"type": "tool_call", "tool": name, "input": inputs})
                        result_text = await _execute_tool(name, inputs, mcp_map, ctx)
                        yield _sse({"type": "tool_result", "tool": name, "result": result_text[:500]})
                        # Append as a user message so any model understands it
                        messages.append({"role": "user", "content": f"[Tool result for '{name}']: {result_text}"})
                else:
                    if text:
                        yield _sse({"type": "text", "content": text})
                    break
            else:
                if text:
                    yield _sse({"type": "text", "content": text})

                if not msg.tool_calls or choice.finish_reason == "stop":
                    break

                messages.append({"role": "assistant", "content": text, "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {"name": tc.function.name.strip(), "arguments": tc.function.arguments},
                    }
                    for tc in msg.tool_calls
                ]})

                for tc in msg.tool_calls:
                    name = tc.function.name.strip()
                    try:
                        inputs = json.loads(tc.function.arguments or "{}")
                    except Exception:
                        inputs = {}
                    yield _sse({"type": "tool_call", "tool": name, "input": inputs})
                    result_text = await _execute_tool(name, inputs, mcp_map, ctx)
                    yield _sse({"type": "tool_result", "tool": name, "result": result_text[:500]})
                    messages.append({"role": "tool", "tool_call_id": tc.id, "content": result_text})

                if choice.finish_reason != "tool_calls":
                    break

    except Exception as exc:
        short = str(exc).split("\n")[0].strip()
        yield _sse({"type": "error", "content": short or str(exc)})
        return

    yield _sse({"type": "done"})


def _tools_to_gemini(tools: list[dict]) -> list:
    """Convert Anthropic-format tool definitions to google.generativeai Tool objects."""
    import google.generativeai as genai  # local import to avoid startup cost
    if not tools:
        return []
    declarations = []
    for t in tools:
        schema = t.get("input_schema", {})
        declarations.append(genai.protos.FunctionDeclaration(
            name=t["name"],
            description=t.get("description", ""),
            parameters=genai.protos.Schema(
                type=genai.protos.Type.OBJECT,
                properties={
                    k: genai.protos.Schema(
                        type=genai.protos.Type[v.get("type", "string").upper()],
                        description=v.get("description", ""),
                    )
                    for k, v in schema.get("properties", {}).items()
                },
                required=schema.get("required", []),
            ),
        ))
    return [genai.protos.Tool(function_declarations=declarations)]


async def _run_agent_gemini(
    agent: Agent,
    system_prompt: str,
    tools: list[dict],
    mcp_map: dict[str, Any],
    user_message: str,
    history: list[dict],
    api_key: str,
) -> AsyncIterator[str]:
    import asyncio
    import google.generativeai as genai

    genai.configure(api_key=api_key)
    gemini_tools = _tools_to_gemini(tools)
    model_kwargs: dict[str, Any] = {"model_name": agent.model or "gemini-2.0-flash"}
    if system_prompt:
        model_kwargs["system_instruction"] = system_prompt
    if gemini_tools:
        model_kwargs["tools"] = gemini_tools

    model = genai.GenerativeModel(**model_kwargs)

    # Build history in Gemini format
    gemini_history: list[dict] = []
    for m in history:
        role = "user" if m.get("role") == "user" else "model"
        gemini_history.append({"role": role, "parts": [m.get("content", "")]})

    chat = model.start_chat(history=gemini_history)
    step = 0
    max_steps = agent.max_steps or 10
    ctx = {"agent_id": str(agent.id), "user_id": str(agent.user_id)}
    current_message: Any = user_message

    try:
        while step < max_steps:
            step += 1
            response = await asyncio.get_event_loop().run_in_executor(
                None, lambda msg=current_message: chat.send_message(msg)
            )

            text_parts: list[str] = []
            function_calls: list[Any] = []
            for part in response.parts:
                if hasattr(part, "text") and part.text:
                    text_parts.append(part.text)
                if hasattr(part, "function_call") and part.function_call.name:
                    function_calls.append(part.function_call)

            if text_parts:
                yield _sse({"type": "text", "content": "".join(text_parts)})

            if not function_calls:
                break

            fn_responses: list[Any] = []
            for fc in function_calls:
                args = dict(fc.args)
                yield _sse({"type": "tool_call", "tool": fc.name, "input": args})
                result_text = await _execute_tool(fc.name, args, mcp_map, ctx)
                yield _sse({"type": "tool_result", "tool": fc.name, "result": result_text[:500]})
                fn_responses.append(genai.protos.Part(
                    function_response=genai.protos.FunctionResponse(
                        name=fc.name,
                        response={"result": result_text},
                    )
                ))

            current_message = fn_responses
    except Exception as exc:
        msg = str(exc)
        short = msg.split("\n")[0].strip()
        yield _sse({"type": "error", "content": short or msg})
        return

    yield _sse({"type": "done"})


# ─── Tool building (built-in + MCP) ──────────────────────────────────────────

async def _build_tools_with_mcp(
    agent: Agent, user_id: uuid.UUID, db: DBSession
) -> tuple[list[dict], dict[str, Any]]:
    """
    Returns (tools_list_for_anthropic, mcp_server_map).
    mcp_server_map: {tool_name -> MCPServerConfig} for routing tool calls back to MCP servers.
    """
    tools = _build_builtin_tools(agent.tools or {})
    mcp_map: dict[str, Any] = {}

    # Discover MCP tools from user's active servers
    try:
        result = await db.execute(
            select(MCPServerConfig).where(
                MCPServerConfig.user_id == user_id,
                MCPServerConfig.is_active == True,  # noqa: E712
            )
        )
        servers = result.scalars().all()
        for server in servers:
            try:
                discovered = await _discover_mcp_tools(server)
                for tool in discovered:
                    tool_name = f"mcp__{server.name.replace(' ', '_')}__{tool['name']}"
                    tools.append({
                        "name": tool_name,
                        "description": f"[MCP: {server.name}] {tool.get('description', '')}",
                        "input_schema": tool.get("inputSchema", {"type": "object", "properties": {}}),
                    })
                    mcp_map[tool_name] = {"server": server, "original_name": tool["name"]}
            except Exception:
                pass  # Skip unreachable MCP servers silently
    except Exception:
        pass

    return tools, mcp_map


def _build_builtin_tools(tools_config: dict) -> list[dict]:
    defs = []

    if tools_config.get("web_search"):
        defs.append({
            "name": "web_search",
            "description": "Search the web for current information. Use for facts, news, prices, or anything that may have changed recently.",
            "input_schema": {
                "type": "object",
                "properties": {"query": {"type": "string", "description": "Search query"}},
                "required": ["query"],
            },
        })

    if tools_config.get("browser"):
        defs.append({
            "name": "browse_url",
            "description": "Fetch and extract readable text content from a URL.",
            "input_schema": {
                "type": "object",
                "properties": {"url": {"type": "string", "description": "URL to visit"}},
                "required": ["url"],
            },
        })

    if tools_config.get("code"):
        defs.append({
            "name": "run_code",
            "description": "Execute a Python code snippet. Returns stdout. Use for calculations, data processing, or formatting.",
            "input_schema": {
                "type": "object",
                "properties": {"code": {"type": "string", "description": "Python code to execute"}},
                "required": ["code"],
            },
        })

    if tools_config.get("http"):
        defs.append({
            "name": "http_request",
            "description": "Make an HTTP GET or POST request to an external API or URL.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "method": {"type": "string", "enum": ["GET", "POST"], "description": "HTTP method"},
                    "url": {"type": "string", "description": "Full URL"},
                    "headers": {"type": "object", "description": "Optional request headers"},
                    "body": {"type": "object", "description": "Optional JSON body for POST"},
                },
                "required": ["method", "url"],
            },
        })

    if tools_config.get("sheets"):
        defs.append({
            "name": "google_sheets",
            "description": "Read or write data in a Google Sheet.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "spreadsheet_id": {"type": "string", "description": "Google Sheet ID from its URL"},
                    "operation": {"type": "string", "enum": ["read_range", "append_row", "update_range"]},
                    "range": {"type": "string", "description": "A1 notation range (e.g. Sheet1!A1:D10)"},
                    "values": {"type": "array", "description": "Rows to write for append_row or update_range"},
                },
                "required": ["spreadsheet_id", "operation", "range"],
            },
        })

    if tools_config.get("email"):
        defs.append({
            "name": "send_email",
            "description": "Send an email to a recipient. Use when the user asks to send, draft, or forward an email.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "to": {"type": "string", "description": "Recipient email address"},
                    "subject": {"type": "string", "description": "Email subject line"},
                    "body": {"type": "string", "description": "Email body (plain text or simple HTML)"},
                },
                "required": ["to", "subject", "body"],
            },
        })

    if tools_config.get("sms"):
        defs.append({
            "name": "send_sms",
            "description": "Send an SMS text message to a phone number via Twilio.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "to": {"type": "string", "description": "Recipient phone number in E.164 format (e.g. +14155552671)"},
                    "message": {"type": "string", "description": "SMS message text (max 160 chars for single segment)"},
                },
                "required": ["to", "message"],
            },
        })

    if tools_config.get("verification"):
        defs.append({
            "name": "send_email_verification",
            "description": (
                "Generate a 6-digit OTP and send it to an email address. "
                "Use this to verify a user's email before taking a sensitive action. "
                "The code expires in 10 minutes."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "email": {"type": "string", "description": "Email address to send the verification code to"},
                    "purpose": {"type": "string", "description": "Short description of what is being verified (e.g. 'account access', 'password reset')"},
                },
                "required": ["email"],
            },
        })
        defs.append({
            "name": "send_sms_verification",
            "description": (
                "Generate a 6-digit OTP and send it as an SMS to a phone number. "
                "Use this to verify a user's phone before taking a sensitive action. "
                "The code expires in 10 minutes."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "phone": {"type": "string", "description": "Recipient phone number in E.164 format (e.g. +14155552671)"},
                    "purpose": {"type": "string", "description": "Short description of what is being verified"},
                },
                "required": ["phone"],
            },
        })
        defs.append({
            "name": "verify_code",
            "description": (
                "Check whether the code entered by the user matches the one that was sent. "
                "Call this after the user provides the code they received by email or SMS."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "identifier": {"type": "string", "description": "The email address or phone number the code was sent to"},
                    "code": {"type": "string", "description": "The 6-digit code entered by the user"},
                },
                "required": ["identifier", "code"],
            },
        })

    if tools_config.get("agent_builder"):
        defs.append({
            "name": "list_available_models",
            "description": "List all LLM models available to the current user, grouped by provider. Call this at the start of every conversation.",
            "input_schema": {"type": "object", "properties": {}, "required": []},
        })
        defs.append({
            "name": "create_agent",
            "description": "Create a new AI agent with the given configuration.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Agent display name"},
                    "description": {"type": "string", "description": "Short description of what the agent does"},
                    "model": {"type": "string", "description": "Exact model ID (e.g. llama-3.3-70b-versatile)"},
                    "instructions": {"type": "string", "description": "The system prompt / instructions for the agent"},
                    "memory_enabled": {"type": "boolean", "description": "Whether the agent remembers past sessions"},
                    "tool_web_search": {"type": "boolean", "description": "Enable web search tool"},
                    "tool_http": {"type": "boolean", "description": "Enable HTTP request tool"},
                    "tool_email": {"type": "boolean", "description": "Enable send email tool"},
                    "tool_code": {"type": "boolean", "description": "Enable Python code execution tool"},
                    "tool_sms": {"type": "boolean", "description": "Enable SMS tool"},
                    "tool_browser": {"type": "boolean", "description": "Enable browser/URL tool"},
                },
                "required": ["name", "model", "instructions"],
            },
        })

    return defs


# ─── Tool execution ───────────────────────────────────────────────────────────

async def _execute_tool(name: str, inputs: dict, mcp_map: dict, ctx: dict | None = None) -> str:
    try:
        # MCP tool
        if name in mcp_map:
            return await _tool_mcp(mcp_map[name]["server"], mcp_map[name]["original_name"], inputs)
        # Built-in tools
        if name == "web_search":
            return await _tool_web_search(inputs.get("query", ""))
        elif name == "http_request":
            return await _tool_http(inputs)
        elif name == "run_code":
            return _tool_run_code(inputs.get("code", ""))
        elif name == "browse_url":
            return await _tool_browse(inputs.get("url", ""))
        elif name == "google_sheets":
            return await _tool_sheets(inputs)
        elif name == "send_email":
            return await _tool_send_email(inputs, ctx or {})
        elif name == "send_sms":
            return await _tool_send_sms(inputs)
        elif name == "send_email_verification":
            return await _tool_send_email_verification(inputs, ctx or {})
        elif name == "send_sms_verification":
            return await _tool_send_sms_verification(inputs, ctx or {})
        elif name == "verify_code":
            return await _tool_verify_code(inputs, ctx or {})
        elif name == "list_available_models":
            return await _tool_list_available_models(ctx or {})
        elif name == "create_agent":
            return await _tool_create_agent(inputs, ctx or {})
        return f"Unknown tool: {name}"
    except Exception as exc:
        return f"Tool error: {exc}"


# ─── MCP tool execution ───────────────────────────────────────────────────────

async def _discover_mcp_tools(server: MCPServerConfig) -> list[dict]:
    result = await _mcp_rpc(server, "tools/list", {})
    return result.get("tools", [])


async def _tool_mcp(server: MCPServerConfig, tool_name: str, arguments: dict) -> str:
    result = await _mcp_rpc(server, "tools/call", {"name": tool_name, "arguments": arguments})
    content = result.get("content", [])
    if isinstance(content, list):
        parts = [c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text"]
        return "\n".join(parts)[:4000] or json.dumps(result)[:4000]
    return str(result)[:4000]


def _mcp_auth_headers(server: MCPServerConfig) -> dict:
    headers: dict = {"Content-Type": "application/json"}
    cfg = server.auth_config or {}
    if server.auth_type == "bearer":
        headers["Authorization"] = f"Bearer {cfg.get('token', '')}"
    elif server.auth_type == "header":
        headers[cfg.get("header_name", "X-API-Key")] = cfg.get("header_value", "")
    return headers


async def _mcp_rpc(server: MCPServerConfig, method: str, params: dict) -> dict:
    payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(server.server_url, headers=_mcp_auth_headers(server), json=payload)
    data = resp.json()
    if "error" in data:
        raise RuntimeError(data["error"].get("message", "MCP error"))
    return data.get("result", {})


# ─── Built-in tool implementations ───────────────────────────────────────────

async def _tool_web_search(query: str) -> str:
    if settings.brave_search_api_key:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://api.search.brave.com/res/v1/web/search",
                params={"q": query, "count": 5},
                headers={"Accept": "application/json", "X-Subscription-Token": settings.brave_search_api_key},
                timeout=15,
            )
        if resp.status_code == 200:
            data = resp.json()
            results = data.get("web", {}).get("results", [])
            lines = [f"{r['title']}: {r['description']} ({r['url']})" for r in results[:5]]
            return "\n".join(lines) or "No results."
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.duckduckgo.com/",
            params={"q": query, "format": "json", "no_html": "1"},
            timeout=15,
        )
    data = resp.json()
    abstract = data.get("AbstractText") or data.get("Answer") or ""
    related = [r.get("Text", "") for r in data.get("RelatedTopics", [])[:5] if "Text" in r]
    return (abstract + "\n" + "\n".join(related)).strip() or "No results found."


async def _tool_http(inputs: dict) -> str:
    method = inputs.get("method", "GET").upper()
    url = inputs.get("url", "")
    headers = inputs.get("headers") or {}
    body = inputs.get("body")
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
        if method == "POST":
            resp = await client.post(url, headers=headers, json=body)
        else:
            resp = await client.get(url, headers=headers)
    try:
        return json.dumps(resp.json(), indent=2)[:3000]
    except Exception:
        return resp.text[:3000]


def _tool_run_code(code: str) -> str:
    import io
    import sys
    allowed_builtins = {
        "print": print, "len": len, "range": range, "enumerate": enumerate,
        "zip": zip, "map": map, "filter": filter, "sorted": sorted,
        "list": list, "dict": dict, "set": set, "tuple": tuple, "str": str,
        "int": int, "float": float, "bool": bool, "abs": abs, "round": round,
        "min": min, "max": max, "sum": sum, "type": type, "isinstance": isinstance,
        "repr": repr, "__import__": __builtins__,  # type: ignore[dict-item]
    }
    buf = io.StringIO()
    old_stdout = sys.stdout
    sys.stdout = buf
    try:
        exec(code, {"__builtins__": allowed_builtins})  # noqa: S102
    except Exception as e:
        return f"Error: {e}"
    finally:
        sys.stdout = old_stdout
    return buf.getvalue()[:2000] or "(no output)"


async def _tool_browse(url: str) -> str:
    from bs4 import BeautifulSoup
    async with httpx.AsyncClient(follow_redirects=True, timeout=20,
                                  headers={"User-Agent": "ChatCraft-Agent/1.0"}) as client:
        resp = await client.get(url)
    soup = BeautifulSoup(resp.content, "lxml")
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()
    text = " ".join(soup.stripped_strings)[:4000]
    return text or "Could not extract content."


async def _tool_sheets(inputs: dict) -> str:
    import gspread
    from google.oauth2.service_account import Credentials
    sa_json = getattr(settings, "google_service_account_json", None)
    if not sa_json:
        return "Google service account not configured."
    creds = Credentials.from_service_account_info(
        json.loads(sa_json),
        scopes=["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"],
    )
    gc = gspread.authorize(creds)
    sh = gc.open_by_key(inputs["spreadsheet_id"])
    operation = inputs.get("operation", "read_range")
    range_name = inputs.get("range", "Sheet1!A1:Z100")
    if operation == "read_range":
        ws_name, cell_range = (range_name.split("!", 1) + ["A1:Z100"])[:2]
        ws = sh.worksheet(ws_name)
        return json.dumps(ws.get(cell_range))
    elif operation == "append_row":
        ws_name = range_name.split("!")[0]
        ws = sh.worksheet(ws_name)
        ws.append_rows(inputs.get("values", []))
        return "Row appended."
    elif operation == "update_range":
        ws_name, cell_range = (range_name.split("!", 1) + ["A1"])[:2]
        ws = sh.worksheet(ws_name)
        ws.update(cell_range, inputs.get("values", []))
        return "Range updated."
    return "Unknown operation."


async def _tool_send_email(inputs: dict, ctx: dict | None = None) -> str:
    import smtplib
    import uuid as _uuid
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    to = inputs.get("to", "")
    subject = inputs.get("subject", "(no subject)")
    body = inputs.get("body", "")
    if not to:
        return "Error: recipient email address is required."

    smtp_cfg: dict | None = None
    from_addr: str = settings.email_from or "noreply@chatcraft.ai"

    # Load user's saved SMTP config from DB
    user_id_str = (ctx or {}).get("user_id")
    if user_id_str:
        try:
            from app.db.session import AsyncSessionLocal
            from app.models.user_communication_setting import UserCommunicationSetting
            from sqlalchemy import select as _select
            async with AsyncSessionLocal() as _db:
                row = await _db.scalar(
                    _select(UserCommunicationSetting).where(
                        UserCommunicationSetting.user_id == _uuid.UUID(user_id_str),
                        UserCommunicationSetting.type == "smtp",
                    )
                )
                if row and row.config and row.config.get("smtp_host"):
                    smtp_cfg = row.config
                    from_addr = smtp_cfg.get("from_email") or smtp_cfg.get("smtp_user") or from_addr
        except Exception:
            pass

    if smtp_cfg:
        try:
            host = smtp_cfg["smtp_host"]
            port = int(smtp_cfg.get("smtp_port", 587))
            user = smtp_cfg.get("smtp_user", "")
            password = smtp_cfg.get("smtp_password", "")

            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = from_addr
            msg["To"] = to
            msg.attach(MIMEText(body, "plain"))
            msg.attach(MIMEText(f"<html><body><p>{body.replace(chr(10), '<br>')}</p></body></html>", "html"))

            with smtplib.SMTP(host, port) as srv:
                srv.ehlo()
                if port != 25:
                    srv.starttls()
                    srv.ehlo()
                if user and password:
                    srv.login(user, password)
                srv.sendmail(from_addr, [to], msg.as_string())
            return f"Email sent successfully to {to}."
        except Exception as exc:
            return f"Failed to send email: {exc}"

    # Fallback: Resend API
    if getattr(settings, "resend_api_key", None):
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.post(
                    "https://api.resend.com/emails",
                    headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                    json={"from": from_addr, "to": [to], "subject": subject, "text": body},
                )
            if r.status_code in (200, 201):
                return f"Email sent successfully to {to}."
            return f"Failed to send email via Resend: {r.text}"
        except Exception as exc:
            return f"Failed to send email: {exc}"

    return (
        "Email not configured. Go to Dashboard → Settings → Communications "
        "and add your SMTP credentials first."
    )


async def _tool_send_email_verification(inputs: dict, ctx: dict) -> str:
    import random
    email = inputs.get("email", "").strip()
    purpose = inputs.get("purpose", "verification")
    if not email:
        return "Error: email address is required."

    code = f"{random.randint(0, 999999):06d}"
    redis_key = f"agent_otp:{ctx.get('agent_id', 'x')}:{email}"

    try:
        from app.db.redis import get_async_redis
        r = get_async_redis()
        await r.setex(redis_key, 600, code)  # 10-minute TTL
    except Exception as e:
        return f"Error storing verification code: {e}"

    subject = f"Your verification code: {code}"
    body = (
        f"Your {purpose} code is: {code}\n\n"
        f"This code expires in 10 minutes. Do not share it with anyone."
    )
    result = await _tool_send_email({"to": email, "subject": subject, "body": body})
    if "sent" in result.lower():
        return f"Verification code sent to {email}. Ask the user to enter the 6-digit code."
    return result


async def _tool_send_sms_verification(inputs: dict, ctx: dict) -> str:
    import random
    phone = inputs.get("phone", "").strip()
    purpose = inputs.get("purpose", "verification")
    if not phone:
        return "Error: phone number is required."

    code = f"{random.randint(0, 999999):06d}"
    redis_key = f"agent_otp:{ctx.get('agent_id', 'x')}:{phone}"

    try:
        from app.db.redis import get_async_redis
        r = get_async_redis()
        await r.setex(redis_key, 600, code)  # 10-minute TTL
    except Exception as e:
        return f"Error storing verification code: {e}"

    message = f"Your {purpose} code is: {code}. Expires in 10 minutes."
    result = await _tool_send_sms({"to": phone, "message": message})
    if "sent" in result.lower():
        return f"Verification code sent to {phone}. Ask the user to enter the 6-digit code."
    return result


async def _tool_verify_code(inputs: dict, ctx: dict) -> str:
    identifier = inputs.get("identifier", "").strip()
    code = inputs.get("code", "").strip()
    if not identifier or not code:
        return "Error: both identifier and code are required."

    redis_key = f"agent_otp:{ctx.get('agent_id', 'x')}:{identifier}"

    try:
        from app.db.redis import get_async_redis
        r = get_async_redis()
        stored = await r.get(redis_key)
    except Exception as e:
        return f"Error checking verification code: {e}"

    if stored is None:
        return "INVALID: No verification code found for this identifier. The code may have expired (10-minute limit). Send a new code."

    if stored == code:
        await r.delete(redis_key)  # Single-use — delete after successful verify
        return f"VERIFIED: The code is correct. {identifier} has been successfully verified."

    return "INVALID: The code does not match. Ask the user to check the code and try again, or send a new code."


async def _tool_send_sms(inputs: dict) -> str:
    to = inputs.get("to", "")
    message = inputs.get("message", "")
    if not to or not message:
        return "Error: 'to' phone number and 'message' are required."
    if not getattr(settings, "twilio_account_sid", None) or not getattr(settings, "twilio_auth_token", None):
        return "SMS not configured — set Twilio credentials in settings."
    try:
        from twilio.rest import Client
        client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
        from_number = getattr(settings, "twilio_phone_number", None)
        if not from_number:
            return "SMS not configured — set TWILIO_PHONE_NUMBER in settings."
        client.messages.create(body=message, from_=from_number, to=to)
        return f"SMS sent to {to}."
    except Exception as e:
        return f"Failed to send SMS: {e}"


async def _tool_list_available_models(ctx: dict) -> str:
    user_id_str = ctx.get("user_id", "")
    if not user_id_str:
        return "Error: no user context."
    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        return "Error: invalid user_id."

    from app.db.session import AsyncSessionLocal
    from app.services.llm.key_store import get_all_keys as _get_all_keys

    _PROVIDER_SETTINGS_KEY = {
        "anthropic": "anthropic_api_key",
        "openai": "openai_api_key",
        "google": "google_ai_api_key",
        "groq": "groq_api_key",
        "deepseek": "deepseek_api_key",
        "perplexity": "perplexity_api_key",
        "xai": "xai_api_key",
    }
    _PROVIDER_MODELS = {
        "anthropic": ["claude-sonnet-4-6", "claude-opus-4-7", "claude-haiku-4-5"],
        "openai": ["gpt-4o", "gpt-4o-mini", "gpt-5", "gpt-5-mini"],
        "google": ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-pro"],
        "groq": ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
        "deepseek": ["deepseek-chat", "deepseek-reasoner"],
        "perplexity": ["sonar-pro", "sonar", "sonar-reasoning"],
        "xai": ["grok-3", "grok-3-fast", "grok-3-mini"],
    }

    async with AsyncSessionLocal() as session:
        user_keys = await _get_all_keys(user_id, session)

    lines = ["Available models (use the exact model ID when creating an agent):"]
    for provider, models in _PROVIDER_MODELS.items():
        sk = _PROVIDER_SETTINGS_KEY.get(provider, "")
        platform_key = getattr(settings, sk, "") if sk else ""
        if user_keys.get(provider) or platform_key:
            lines.append(f"\n{provider.upper()}:")
            for m in models:
                lines.append(f"  - {m}")
    if len(lines) == 1:
        return "No models available. Please add API keys in Settings → Model Keys."
    return "\n".join(lines)


async def _tool_create_agent(inputs: dict, ctx: dict) -> str:
    user_id_str = ctx.get("user_id", "")
    if not user_id_str:
        return "Error: no user context."
    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        return "Error: invalid user_id."

    name = inputs.get("name", "").strip()
    model = inputs.get("model", "").strip()
    instructions = inputs.get("instructions", "").strip()
    if not name or not model or not instructions:
        return "Error: 'name', 'model', and 'instructions' are required."

    tools = {
        "web_search": bool(inputs.get("tool_web_search", False)),
        "http": bool(inputs.get("tool_http", False)),
        "email": bool(inputs.get("tool_email", False)),
        "code": bool(inputs.get("tool_code", False)),
        "sms": bool(inputs.get("tool_sms", False)),
        "browser": bool(inputs.get("tool_browser", False)),
    }

    from app.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        agent = Agent(
            user_id=user_id,
            name=name,
            description=inputs.get("description", ""),
            model=model,
            instructions=instructions,
            tools=tools,
            memory_enabled=bool(inputs.get("memory_enabled", False)),
            max_steps=10,
        )
        session.add(agent)
        await session.commit()
        await session.refresh(agent)
        agent_id = str(agent.id)

    return f"Agent '{name}' created successfully! Agent ID: {agent_id}. The user can find it in the Agents section."


# ─── System prompt builder ────────────────────────────────────────────────────

async def _build_system_prompt(
    agent: Agent,
    db: DBSession,
    user_id: uuid.UUID | None = None,
) -> str:
    parts: list[str] = []

    if agent.chatbot_id:
        result = await db.execute(
            select(ChatbotConfig).where(ChatbotConfig.id == agent.chatbot_id)
        )
        chatbot = result.scalar_one_or_none()
        if chatbot and chatbot.system_prompt:
            parts.append(chatbot.system_prompt)

    if agent.instructions:
        parts.append(agent.instructions)

    if not parts:
        parts.append("You are a helpful AI agent. Use the available tools to complete tasks thoroughly and accurately.")

    prompt = "\n\n".join(parts)

    # Inject runtime variables if placeholders are present and we have a user context.
    # {{USER_API_TOKEN}} → a 1-hour JWT the agent can use to call the ChatCraft API.
    # {{BASE_URL}}       → the platform's public API base URL.
    # Never injected for public (unauthenticated) agent calls.
    if user_id and ("{{USER_API_TOKEN}}" in prompt or "{{BASE_URL}}" in prompt):
        from app.core.security import create_access_token
        from app.models.user import User as _User
        user = await db.get(_User, user_id)
        role = user.role.value if user else "free"
        agent_token = create_access_token(user_id, role, expires_minutes=60)
        api_base = getattr(settings, "api_url", None) or "http://localhost:8000"
        prompt = prompt.replace("{{USER_API_TOKEN}}", agent_token)
        prompt = prompt.replace("{{BASE_URL}}", api_base.rstrip("/"))

    return prompt


# ─── Memory helpers ───────────────────────────────────────────────────────────

async def _load_agent_memory(agent_id: uuid.UUID, user_id: uuid.UUID, db) -> list[dict]:
    """Load the last 5 conversation sessions and flatten them into a history list."""
    result = await db.execute(
        select(AgentConversation)
        .where(AgentConversation.agent_id == agent_id, AgentConversation.user_id == user_id)
        .order_by(AgentConversation.created_at.desc())
        .limit(5)
    )
    sessions = list(reversed(result.scalars().all()))  # oldest first
    history: list[dict] = []
    for s in sessions:
        for msg in s.messages:
            if msg.get("role") in ("user", "assistant"):
                history.append({"role": msg["role"], "content": msg["content"]})
    return history


async def _post_run_tasks(
    agent: Agent,
    user_id: uuid.UUID,
    messages: list[dict],
    tool_call_count: int,
    db,
) -> None:
    """Persist the conversation session and fire the webhook. Runs as a background task."""
    from app.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        try:
            # Persist memory session
            if agent.memory_enabled and len(messages) >= 2:
                conv = AgentConversation(
                    agent_id=agent.id,
                    user_id=user_id,
                    messages=messages,
                    tool_calls=tool_call_count,
                )
                session.add(conv)

            # Log a usage record for analytics
            # Approximate token count from text length (4 chars ≈ 1 token)
            total_chars = sum(len(m.get("content", "") or "") for m in messages)
            approx_tokens = total_chars // 4
            log = UsageLog(
                user_id=user_id,
                agent_id=agent.id,
                model=agent.model,
                input_tokens=approx_tokens // 2,
                output_tokens=approx_tokens // 2,
                cost_usd=0,
            )
            session.add(log)
            await session.commit()
        except Exception:
            pass

    # Fire webhook (fire-and-forget, never raises)
    if agent.webhook_url:
        try:
            payload = {
                "agent_id": str(agent.id),
                "agent_name": agent.name,
                "messages": messages,
                "tool_calls": tool_call_count,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            async with httpx.AsyncClient(timeout=5) as client:
                await client.post(agent.webhook_url, json=payload)
        except Exception:
            pass


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


async def _get_owned_agent(agent_id: uuid.UUID, user_id: uuid.UUID, db: DBSession) -> Agent:
    result = await db.execute(
        select(Agent).where(Agent.id == agent_id, Agent.user_id == user_id)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


async def _get_shared_agent(share_token: str, db: DBSession) -> Agent:
    result = await db.execute(
        select(Agent).where(Agent.share_token == share_token, Agent.share_enabled == True)  # noqa: E712
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found or sharing is disabled")
    return agent


async def _get_owned_chatbot(chatbot_id: uuid.UUID, user_id: uuid.UUID, db: DBSession) -> ChatbotConfig:
    result = await db.execute(
        select(ChatbotConfig).where(ChatbotConfig.id == chatbot_id, ChatbotConfig.user_id == user_id)
    )
    chatbot = result.scalar_one_or_none()
    if not chatbot:
        raise HTTPException(status_code=404, detail="Chatbot not found")
    return chatbot
