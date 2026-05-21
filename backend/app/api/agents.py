"""
Agent Builder API — create, configure, and run autonomous AI agents.

Each agent has:
  - Custom instructions (system prompt)
  - Optional chatbot attachment (inherits KB + base system prompt)
  - Tool toggles (web_search, browser, code, http, sheets, email)
  - Agentic loop with configurable max_steps
"""
import json
import uuid
from typing import Any, AsyncIterator

import anthropic
import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select

from app.core.config import settings
from app.core.dependencies import CurrentUser, DBSession
from app.models.agent import Agent
from app.models.chatbot_config import ChatbotConfig
from app.schemas.agent import AgentCreateRequest, AgentResponse, AgentUpdateRequest
from app.services.rag import RAGService

router = APIRouter(prefix="/api/v1/agents", tags=["agents"])


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

    # Build system prompt
    system_prompt = await _build_system_prompt(agent, db)

    # Build tool list
    tools = _build_tools(agent.tools or {})

    return StreamingResponse(
        _run_agent(agent, system_prompt, tools, body.message, body.conversation_history),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─── Agent execution loop ─────────────────────────────────────────────────────

async def _run_agent(
    agent: Agent,
    system_prompt: str,
    tools: list[dict],
    user_message: str,
    history: list[dict],
) -> AsyncIterator[str]:
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    messages: list[dict] = list(history)
    messages.append({"role": "user", "content": user_message})

    step = 0
    max_steps = agent.max_steps or 10

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

        # Collect text content and tool uses from response
        text_parts: list[str] = []
        tool_uses: list[Any] = []

        for block in response.content:
            if block.type == "text":
                text_parts.append(block.text)
            elif block.type == "tool_use":
                tool_uses.append(block)

        # Stream any text the model produced
        if text_parts:
            combined = "".join(text_parts)
            yield _sse({"type": "text", "content": combined})

        # If no tool calls, we're done
        if not tool_uses or response.stop_reason == "end_turn":
            break

        # Execute each tool call
        tool_results: list[dict] = []
        for tu in tool_uses:
            yield _sse({"type": "tool_call", "tool": tu.name, "input": tu.input})
            result_text = await _execute_tool(tu.name, tu.input)
            yield _sse({"type": "tool_result", "tool": tu.name, "result": result_text[:500]})
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tu.id,
                "content": result_text,
            })

        # Append assistant message + tool results for next loop
        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": tool_results})

        if response.stop_reason != "tool_use":
            break

    yield _sse({"type": "done"})


# ─── Tool definitions ─────────────────────────────────────────────────────────

def _build_tools(tools_config: dict) -> list[dict]:
    defs = []

    if tools_config.get("web_search"):
        defs.append({
            "name": "web_search",
            "description": "Search the web for current information. Use for facts, news, prices, or anything that may have changed recently.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"},
                },
                "required": ["query"],
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

    if tools_config.get("code"):
        defs.append({
            "name": "run_code",
            "description": "Execute a Python code snippet. Returns stdout output. Use for calculations, data processing, or formatting.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "code": {"type": "string", "description": "Python code to execute"},
                },
                "required": ["code"],
            },
        })

    if tools_config.get("browser"):
        defs.append({
            "name": "browse_url",
            "description": "Fetch and extract readable text content from a URL. Use to read web pages, articles, or documentation.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "URL to visit"},
                },
                "required": ["url"],
            },
        })

    if tools_config.get("sheets"):
        defs.append({
            "name": "google_sheets",
            "description": "Read or write data in a Google Sheet. Requires a service account configured in settings.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "spreadsheet_id": {"type": "string", "description": "Google Sheet ID from its URL"},
                    "operation": {"type": "string", "enum": ["read_range", "append_row", "update_range"], "description": "Operation to perform"},
                    "range": {"type": "string", "description": "A1 notation range (e.g. Sheet1!A1:D10)"},
                    "values": {"type": "array", "description": "Rows to write for append_row or update_range"},
                },
                "required": ["spreadsheet_id", "operation", "range"],
            },
        })

    return defs


async def _execute_tool(name: str, inputs: dict) -> str:
    try:
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
        return f"Unknown tool: {name}"
    except Exception as exc:
        return f"Tool error: {exc}"


async def _tool_web_search(query: str) -> str:
    # Use Brave Search or fall back to DuckDuckGo instant answer
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
    # Fallback: DuckDuckGo
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
    # Only allow safe builtins — no file system or network
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


# ─── System prompt builder ────────────────────────────────────────────────────

async def _build_system_prompt(agent: Agent, db: DBSession) -> str:
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

    return "\n\n".join(parts)


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


async def _get_owned_chatbot(chatbot_id: uuid.UUID, user_id: uuid.UUID, db: DBSession) -> ChatbotConfig:
    result = await db.execute(
        select(ChatbotConfig).where(ChatbotConfig.id == chatbot_id, ChatbotConfig.user_id == user_id)
    )
    chatbot = result.scalar_one_or_none()
    if not chatbot:
        raise HTTPException(status_code=404, detail="Chatbot not found")
    return chatbot
