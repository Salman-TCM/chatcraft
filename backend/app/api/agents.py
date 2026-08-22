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
import time
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any

import anthropic
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from loguru import logger
from openai import AsyncOpenAI
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.core.config import settings
from app.core.dependencies import CurrentUser, DBSession, require_feature
from app.core.features import AGENT_BUILDER
from app.core.rate_limit import limiter
from app.models.agent import Agent
from app.models.agent_conversation import AgentConversation
from app.models.agent_function import AgentFunction
from app.models.agent_knowledge_base import AgentKnowledgeDocument
from app.models.chatbot_config import ChatbotConfig
from app.models.commerce import CommerceProduct, CommerceStore
from app.models.knowledge_base import DocumentStatus
from app.models.mcp import MCPServerConfig
from app.models.usage_log import UsageLog
from app.schemas.agent import AgentCreateRequest, AgentResponse, AgentUpdateRequest
from app.services.kb.extractor import extract_docx, extract_pdf, extract_txt
from app.api.mcp_servers import _mcp_rpc
from app.services.llm.key_store import get_key as _get_user_key

router = APIRouter(
    prefix="/api/v1/agents", tags=["agents"], dependencies=[Depends(require_feature(AGENT_BUILDER))]
)
public_router = APIRouter(prefix="/api/public/agents", tags=["agents-public"])


# ─── CRUD ─────────────────────────────────────────────────────────────────────


@router.get("")
async def list_agents(user: CurrentUser, db: DBSession):
    result = await db.execute(
        select(Agent).where(Agent.user_id == user.id).order_by(Agent.created_at.desc())
    )
    agents = result.scalars().all()
    return {"success": True, "data": [AgentResponse.model_validate(a) for a in agents]}


@router.post("", status_code=status.HTTP_201_CREATED)
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
        is_active=body.is_active,
        webhook_url=body.webhook_url,
        welcome_message=body.welcome_message,
        suggestions_enabled=body.suggestions_enabled,
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
            "welcome_message": agent.welcome_message,
            "suggestions_enabled": agent.suggestions_enabled,
            "welcome_suggestions": getattr(agent, "welcome_suggestions", None) or [],
            # Design fields
            "primary_colour": getattr(agent, "primary_colour", "#6366f1") or "#6366f1",
            "logo_url": getattr(agent, "logo_url", None),
            "dark_mode": getattr(agent, "dark_mode", False),
            "show_branding": getattr(agent, "show_branding", True),
            "font_family": getattr(agent, "font_family", "system-ui") or "system-ui",
            "bubble_style": getattr(agent, "bubble_style", "rounded") or "rounded",
            "placeholder_text": getattr(agent, "placeholder_text", "Type a message…") or "Type a message…",
        },
    }


class PublicChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=100_000)
    conversation_history: list[dict] = Field(default_factory=list, max_length=200)


# Safety cap: no matter what the model requests, execute at most this many tool
# calls per LLM turn. Prevents "single-turn burst" cost surprises (e.g. Llama
# emitting 50 parallel `browse_url` blocks) even when max_steps is high.
_MAX_TOOL_CALLS_PER_TURN = 10

# Weak models sometimes just paste a tool's raw JSON payload back as their
# final answer instead of following the "explain in plain language" system
# prompt instruction. This gets appended once, right after any tool result,
# so the very next turn has the reminder immediately before it decides how
# to respond — instructions further back in the system prompt are easy for
# a small model to lose track of.
_TOOL_RESULT_FOLLOWUP_REMINDER = (
    "Reminder: respond to the user in plain, natural language based on the "
    "result above. Do not paste raw JSON, code blocks, or internal field "
    "names — describe the outcome conversationally, following any "
    "tool-specific instructions in your system prompt (e.g. citing sources, "
    "including disclaimers)."
)

# A model that skips calculate_faraid and computes a share itself almost
# always still writes the fraction out (e.g. "1/8", "7/40") even in an
# otherwise non-English reply — that notation essentially never appears in
# ordinary inheritance-law prose that isn't stating a computed share. Used as
# a safety net to catch the tool being silently bypassed on a real question.
_FRACTION_PATTERN = _re.compile(r"\d\s*/\s*\d")


def _looks_like_unverified_faraid_share(text: str) -> bool:
    return bool(_FRACTION_PATTERN.search(text))


# Sent back as a corrective user turn — never as a forced tool_choice, which
# would just make the model invent placeholder heir data to satisfy the
# forced call. This only fires once per conversation (see faraid_retry_used)
# so a model that ignores it too doesn't loop forever.
_FARAID_SELF_COMPUTE_CORRECTION = (
    "That last reply computed a Faraid share directly instead of calling "
    "calculate_faraid, which your instructions do not allow. Do not repeat "
    "that mistake: either call calculate_faraid now with the information "
    "already given, or ask the user for whatever specific piece of "
    "information is still missing. Do not state any fraction, percentage, "
    "or amount yourself."
)


# Tools an anonymous visitor to a shared agent may invoke. Everything not in this
# set — send_email, send_sms, http_request, google_sheets, create_agent,
# list_available_models, verification tools, run_code, custom webhook tools
# (AgentFunction), and all MCP tools — runs under the agent owner's identity or
# on shared infrastructure and must NOT be exposed on public shares.
#
# ⚠️  run_code intentionally NOT here. _tool_run_code is not a real sandbox: it
# allows __import__, so `import os`, subprocess, and socket are all reachable.
# Confirmed reachable from run_code: env vars (DATABASE_URL, SECRET_KEY, provider
# API keys), shell exec as the container user, arbitrary outbound TCP. Exposing
# this to anonymous visitors is a network-reachable RCE. Do NOT add run_code
# back until it's behind a real isolation boundary (Pyodide, gVisor, ephemeral
# container, or firejail with seccomp).
#
# Custom webhook tools (book_service, create_account, ...) are deliberately
# excluded even though they're the whole point of a customer-facing commerce
# agent: each one POSTs model-chosen JSON to a URL the owner configured, often
# carrying the owner's own API credentials, with no way for us to vet what that
# endpoint does with anonymous, untrusted input. list_products/buy_product are
# safe to admit here specifically because buy_product never touches payment
# data or fires a charge — it only ever returns a link to the store's own
# hosted checkout page. check_order_status is safe because it requires BOTH
# the (unguessable) order id and the matching email before returning anything —
# a bare id is not accepted as proof of ownership.
_PUBLIC_SHARE_TOOL_ALLOWLIST = {
    "browse_url",
    "search_kb",
    "web_search",  # billed to owner but read-only and rate-limited
    "calculate_faraid",  # pure calculation, no DB/network access, no owner cost
    "list_products",  # read-only, already public via /api/public/stores/{slug}/products
    "buy_product",  # only ever returns a checkout link, never touches payment data
    "check_order_status",  # requires order id + matching email, not id alone
}

# MCP tools are excluded from public shares as a class (see the SECURITY note
# below) because most of them mutate the owner's account or need a customer's
# own accessToken that an anonymous visitor doesn't have. This is a narrow,
# name-based exception for read-only catalog browsing — the same operations
# _build_tools_with_mcp's non-MCP commerce tools (list_products/buy_product)
# are already allowed to expose. Matched against the MCP tool's *original*
# name (not the server-qualified mcp__SERVER__name), so it applies to any
# server exposing a same-named catalog tool, not just one specific one. Never
# add anything here that mutates state or needs per-customer auth (cart,
# checkout, orders, refunds, account) — those still require the visitor's own
# accessToken, which the public route intentionally never has.
_PUBLIC_SHARE_SAFE_MCP_TOOL_NAMES = {
    "search_products",
    "list_products",
    "get_product",
    "product_filters",
    "check_product_stock",
    "get_product_price",
    "check_product_compatibility",
}


def _is_public_safe_mcp_tool(name: str, mcp_map: dict) -> bool:
    route = mcp_map.get(name)
    return (
        bool(route)
        and route.get("kind") == "mcp"
        and route.get("original_name") in _PUBLIC_SHARE_SAFE_MCP_TOOL_NAMES
    )


@public_router.post("/{share_token}/chat")
@limiter.limit("5/minute")
async def public_agent_chat(
    share_token: str, request: Request, body: PublicChatRequest, db: DBSession
):
    """Stream a public agent response. No authentication required."""
    agent = await _get_shared_agent(share_token, db)
    if not agent.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "success": False,
                "error": "Agent is inactive",
                "code": "AGENT_INACTIVE",
            },
        )
    system_prompt = await _build_system_prompt(
        agent, db
    )  # no user_id — never inject token for public
    tools, mcp_map = await _build_tools_with_mcp(agent, agent.user_id, db)
    # SECURITY: anonymous share visitors must not be able to invoke tools that
    # mutate the owner's account (create_agent, send_email, send_sms, sheets,
    # http_request, most MCP tools, custom webhook tools) or reveal owner
    # secrets (list_available_models). Only read-only, per-request-scoped
    # tools survive on the public route — including the narrow MCP catalog
    # exception in _PUBLIC_SHARE_SAFE_MCP_TOOL_NAMES. Filtering mcp_map the
    # same way (rather than clearing it) keeps routing info for the
    # allowlisted commerce/MCP tools while still dropping every other
    # MCP/custom-webhook route.
    tools = [
        t
        for t in tools
        if t["name"] in _PUBLIC_SHARE_TOOL_ALLOWLIST or _is_public_safe_mcp_tool(t["name"], mcp_map)
    ]
    mcp_map = {
        k: v
        for k, v in mcp_map.items()
        if k in _PUBLIC_SHARE_TOOL_ALLOWLIST or _is_public_safe_mcp_tool(k, mcp_map)
    }
    _, api_key, base_url = await _resolve_api_key(
        agent.user_id, agent.model or "claude-sonnet-4-6", db
    )
    return StreamingResponse(
        _run_agent(
            agent,
            system_prompt,
            tools,
            mcp_map,
            body.message,
            body.conversation_history,
            api_key=api_key,
            base_url=base_url,
        ),
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
                "preview": next(
                    (m["content"][:120] for m in s.messages if m.get("role") == "user"), ""
                ),
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
        select(func.count())
        .select_from(AgentConversation)
        .where(
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
    from sqlalchemy import Date, cast
    from sqlalchemy import text as sa_text

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


# ─── Chat attachments ──────────────────────────────────────────────────────────
#
# One-off text extraction for a file dropped into the agent Run chat. This is
# NOT the KB pipeline — nothing is chunked, embedded, or persisted. The
# extracted text is returned to the frontend, which folds it into the next
# chat message as plain context. Reuses the same extractor functions (and
# Bijoy/legacy-Bengali-encoding fix) as KB document ingestion.

_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024  # 10 MB
_ATTACHMENT_MAX_CHARS = 20_000  # keep one attachment from dominating the context window
_ATTACHMENT_MIME_TO_TYPE = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "text/plain": "txt",
}
_ATTACHMENT_EXT_TO_TYPE = {".pdf": "pdf", ".docx": "docx", ".txt": "txt"}


def _resolve_attachment_doc_type(content_type: str | None, filename: str | None) -> str | None:
    """Map an upload's MIME type (falling back to its extension) to pdf/docx/txt."""
    doc_type = _ATTACHMENT_MIME_TO_TYPE.get(content_type or "")
    if doc_type:
        return doc_type
    name = (filename or "").lower()
    for ext, t in _ATTACHMENT_EXT_TO_TYPE.items():
        if name.endswith(ext):
            return t
    return None


def _truncate_attachment_text(text: str) -> tuple[str, bool]:
    """Cap extracted attachment text so one file can't dominate the context window."""
    text = text.strip()
    truncated = len(text) > _ATTACHMENT_MAX_CHARS
    return (text[:_ATTACHMENT_MAX_CHARS] if truncated else text), truncated


@router.post("/{agent_id}/attachments/extract")
async def extract_attachment_text(
    agent_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
    file: UploadFile,
):
    """Extract text from an uploaded PDF/DOCX/TXT for use as chat context."""
    await _get_owned_agent(agent_id, user.id, db)

    data = await file.read()
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"success": False, "error": "Empty file", "code": "EMPTY_FILE"},
        )
    if len(data) > _ATTACHMENT_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={"success": False, "error": "File exceeds 10 MB", "code": "FILE_TOO_LARGE"},
        )

    doc_type = _resolve_attachment_doc_type(file.content_type, file.filename)
    if not doc_type:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={
                "success": False,
                "error": "Only PDF, DOCX, and TXT files are supported",
                "code": "UNSUPPORTED_TYPE",
            },
        )

    try:
        if doc_type == "pdf":
            text = extract_pdf(data)
        elif doc_type == "docx":
            text = extract_docx(data)
        else:
            text = extract_txt(data)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"success": False, "error": f"Could not read file: {exc}", "code": "EXTRACT_FAILED"},
        ) from exc

    text, truncated = _truncate_attachment_text(text)

    return {
        "success": True,
        "data": {
            "filename": file.filename or "attachment",
            "text": text,
            "truncated": truncated,
        },
    }


# ─── Chat / Run ───────────────────────────────────────────────────────────────


class AgentChatRequest(BaseModel):
    # 100k chars caps a single-turn payload well below any provider's context
    # window while blocking DoS-scale bodies and runaway token bills.
    message: str = Field(..., min_length=1, max_length=100_000)
    conversation_history: list[dict] = Field(default_factory=list, max_length=200)


@router.post("/{agent_id}/chat")
@limiter.limit("20/minute")
async def agent_chat(
    request: Request,
    agent_id: uuid.UUID,
    body: AgentChatRequest,
    user: CurrentUser,
    db: DBSession,
):
    """Stream an agent response with tool use, showing thinking steps as SSE events."""
    agent = await _get_owned_agent(agent_id, user.id, db)
    if not agent.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "success": False,
                "error": "Agent is inactive. Enable it in Configure to run.",
                "code": "AGENT_INACTIVE",
            },
        )
    system_prompt = await _build_system_prompt(agent, db, user_id=user.id)
    tools, mcp_map = await _build_tools_with_mcp(agent, user.id, db)
    _, api_key, base_url = await _resolve_api_key(user.id, agent.model or "claude-sonnet-4-6", db)

    # Load memory and inject as extra history if enabled
    history = list(body.conversation_history)
    if agent.memory_enabled and not history:
        history = await _load_agent_memory(agent.id, user.id, db)

    async def _stream_and_track():
        collected_messages: list[dict] = [{"role": "user", "content": body.message}]
        assistant_text: list[str] = []
        tool_call_count = 0

        async for chunk in _run_agent(
            agent,
            system_prompt,
            tools,
            mcp_map,
            body.message,
            history,
            api_key=api_key,
            base_url=base_url,
        ):
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
        asyncio.create_task(
            _post_run_tasks(agent, user.id, collected_messages, tool_call_count, db)
        )

    return StreamingResponse(
        _stream_and_track(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─── Agent execution loop ─────────────────────────────────────────────────────

_PROVIDER_BASE_URLS: dict[str, str] = {
    "openai": "https://api.openai.com/v1",
    "groq": "https://api.groq.com/openai/v1",
    "deepseek": "https://api.deepseek.com/v1",
    "perplexity": "https://api.perplexity.ai",
    "xai": "https://api.x.ai/v1",
}

_SETTINGS_KEY_ATTR: dict[str, str] = {
    "anthropic": "anthropic_api_key",
    "google": "google_ai_api_key",
    "openai": "openai_api_key",
    "groq": "groq_api_key",
    "deepseek": "deepseek_api_key",
    "perplexity": "perplexity_api_key",
    "xai": "xai_api_key",
}


def _model_provider(model: str) -> str:
    from app.services.llm.router import get_model_provider

    return get_model_provider(model)


async def _resolve_api_key(
    user_id: uuid.UUID, model: str, db
) -> tuple[str, str | None, str | None]:
    """Return (provider, api_key, base_url) for the given model, reading per-user keys first.

    base_url is only populated for provider == "self_hosted"; None otherwise.
    """
    provider = _model_provider(model)
    if provider == "self_hosted":
        from app.services.llm.key_store import get_base_url as _get_base_url

        user_key = await _get_user_key(user_id, provider, db)
        base_url = await _get_base_url(user_id, db)
        return provider, user_key or None, base_url
    user_key = await _get_user_key(user_id, provider, db)
    if user_key:
        return provider, user_key, None
    attr = _SETTINGS_KEY_ATTR.get(provider, "")
    fallback = getattr(settings, attr, None) if attr else None
    return provider, fallback or None, None


# kept for callers that pre-resolve (public_agent_chat, agent_chat)
async def _resolve_anthropic_key(user_id: uuid.UUID, db) -> str | None:
    _, key, _base_url = await _resolve_api_key(user_id, "claude-sonnet-4-6", db)
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
    base_url: str | None = None,
) -> AsyncIterator[str]:
    model = agent.model or "claude-sonnet-4-6"
    provider = _model_provider(model)

    if provider == "self_hosted":
        if not base_url:
            yield _sse(
                {
                    "type": "error",
                    "content": (
                        "No self-hosted endpoint configured. Add one in Settings → Model Keys."
                    ),
                }
            )
            return
    elif not api_key:
        yield _sse(
            {
                "type": "error",
                "content": f"No {provider.title()} API key configured. Add one in Settings → Model Keys.",
            }
        )
        return

    if provider == "google":
        async for chunk in _run_agent_gemini(
            agent, system_prompt, tools, mcp_map, user_message, history, api_key
        ):
            yield chunk
    elif provider == "anthropic":
        async for chunk in _run_agent_anthropic(
            agent, system_prompt, tools, mcp_map, user_message, history, api_key
        ):
            yield chunk
    else:
        resolved_base_url = (
            base_url
            if provider == "self_hosted"
            else _PROVIDER_BASE_URLS.get(provider, "https://api.openai.com/v1")
        )
        async for chunk in _run_agent_openai_compat(
            agent,
            system_prompt,
            tools,
            mcp_map,
            user_message,
            history,
            api_key or "not-needed",
            resolved_base_url,
        ):
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
    ctx = {
        "agent_id": str(agent.id),
        "user_id": str(agent.user_id),
        # Cap what _execute_tool will dispatch to whatever we actually declared
        # to the model — stops hallucinated / re-injected tool calls dead.
        "allowed_tools": {t["name"] for t in tools} | set(mcp_map.keys()),
    }

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

            _step_start = time.perf_counter()
            async with client.messages.stream(**kwargs) as stream:
                async for text in stream.text_stream:
                    yield _sse({"type": "text", "content": text})
                response = await stream.get_final_message()
            logger.bind(agent_id=str(agent.id), step=step).info(
                f"llm_round anthropic step={step} "
                f"{round((time.perf_counter() - _step_start) * 1000, 1)}ms "
                f"stop_reason={response.stop_reason}"
            )

            tool_uses: list[Any] = [b for b in response.content if b.type == "tool_use"]

            if not tool_uses or response.stop_reason == "end_turn":
                break

            # Cap per-turn burst so a runaway model can't fire 50 tool calls
            # in one iteration.
            tool_uses = tool_uses[:_MAX_TOOL_CALLS_PER_TURN]

            tool_results: list[dict] = []
            for tu in tool_uses:
                yield _sse({"type": "tool_call", "tool": tu.name, "input": tu.input})
                result_text = await _execute_tool(tu.name, tu.input, mcp_map, ctx)
                yield _sse({"type": "tool_result", "tool": tu.name, "result": result_text[:500]})
                tool_results.append(
                    {"type": "tool_result", "tool_use_id": tu.id, "content": result_text}
                )

            tool_results.append({"type": "text", "text": _TOOL_RESULT_FOLLOWUP_REMINDER})
            messages.append({"role": "assistant", "content": response.content})
            messages.append({"role": "user", "content": tool_results})

            if response.stop_reason != "tool_use":
                break
    except Exception as exc:
        msg = str(exc)
        short = msg.split("\n")[0].strip()
        yield _sse({"type": "error", "content": short or msg})
        return

    yield _sse({"type": "done"})


def _tools_to_openai(tools: list[dict]) -> list[dict]:
    """Convert Anthropic-format tool definitions to OpenAI function-calling format."""
    result = []
    for t in tools:
        result.append(
            {
                "type": "function",
                "function": {
                    "name": t["name"],
                    "description": t.get("description", ""),
                    "parameters": t.get("input_schema", {"type": "object", "properties": {}}),
                },
            }
        )
    return result


def _is_tool_generation_error(exc: Exception) -> bool:
    """Return True when the provider rejected a malformed tool call generation."""
    s = str(exc).lower()
    return (
        "tool_use_failed" in s
        or "failed to call a function" in s
        or "tool call validation failed" in s
        or "tool choice is none, but model called a tool" in s
    )


# Groq's tool_use_failed error attaches the raw generation string on the body.
# The SDK renders it inside str(exc) using Python-repr for the outer dict but
# the inner value is a JSON string, so we locate it by key and json-decode it.
_FAILED_GEN_RE = _re.compile(
    r"['\"]failed_generation['\"]\s*:\s*(['\"])(.+?)(?<!\\)\1",
    _re.DOTALL,
)


def _extract_failed_tool_call(exc: Exception) -> dict | None:
    """Try to salvage a tool call from a provider's tool_use_failed error body.

    Groq (and other OpenAI-compat providers) attach the model's raw generation
    on the error under `failed_generation`. That generation is usually the
    native OpenAI tool-call JSON: {"name": ..., "arguments": {...}}. When our
    text-mode fallback can't stop the model from emitting it, we salvage the
    call directly from the error instead of surfacing a 400 to the user.

    Returns {"name": str, "args": dict} on success, or None if we can't parse
    a recognizable tool call out of the exception.
    """
    match = _FAILED_GEN_RE.search(str(exc))
    if not match:
        return None
    raw = match.group(2)
    # str(exc) uses Python repr so the escapes are ordinary JSON escapes; no
    # extra unescaping needed beyond what json.loads already does.
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        # Some providers double-encode; try one more layer.
        try:
            data = json.loads(json.loads(f'"{raw}"'))
        except Exception:
            return None
    if not isinstance(data, dict) or "name" not in data:
        return None
    args = data.get("arguments", data.get("args", data.get("parameters", {})))
    if isinstance(args, str):
        try:
            args = json.loads(args)
        except json.JSONDecodeError:
            args = {}
    if not isinstance(args, dict):
        args = {}
    return {"name": str(data["name"]).strip(), "args": args}


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


# The primary format we teach the model — a ```tool_call code fence with JSON.
_TOOL_CALL_BLOCK_RE = _re.compile(
    r"```tool_call\s*\n(.*?)\n```",
    _re.DOTALL,
)

# Fallback formats we've seen weak models emit. Regex just LOCATES the opener;
# JSON is consumed by json.JSONDecoder.raw_decode so nested braces & trailing
# junk (semicolons, whitespace) don't break parsing.
#   <function>NAME>{...}</function>       ← Llama 3.1 via Groq
#   <function=NAME>{...}</function>       ← Llama 3.1 alt form
#   <tool_call>{...}</tool_call>          ← another common shape
_FN_TAG_OPEN_RE = _re.compile(
    r"<function\s*[=>]?\s*([A-Za-z_][A-Za-z0-9_]*)\s*[=>]?\s*",
)
_TOOL_TAG_OPEN_RE = _re.compile(r"<tool_call\s*>")
# For scrubbing the visible text, match the whole span including a closing tag.
# Body regex is intentionally permissive — .*? is fine here because we only
# use these for display-stripping, not for arg extraction.
_FN_TAG_SPAN_RE = _re.compile(r"<function[^>]*>.*?</function>", _re.DOTALL)
_TOOL_TAG_SPAN_RE = _re.compile(r"<tool_call>.*?</tool_call>", _re.DOTALL)

# Some models name the fence after the tool itself instead of the taught
# "tool_call" tag, e.g. ```http_request\n{...}\n```. Only recognized when the
# tag matches a real tool identifier (see _BUILTIN_TOOL_NAMES below) so an
# incidental ```json or ```python example block is never mistaken for a call.
_GENERIC_FENCE_RE = _re.compile(r"```([A-Za-z_][A-Za-z0-9_]*)\s*\n(.*?)\n```", _re.DOTALL)

_BUILTIN_TOOL_NAMES = frozenset(
    {
        "web_search",
        "http_request",
        "run_code",
        "browse_url",
        "google_sheets",
        "send_email",
        "send_sms",
        "send_email_verification",
        "send_sms_verification",
        "verify_code",
        "list_available_models",
        "create_agent",
        "search_kb",
        "calculate_faraid",
    }
)


# 7. <|tool_call>call:ALIAS:TOOL{k:<|"|>v<|"|>,k2:v2}<tool_call|>  — the
# self-hosted abliterated Gemma quant's own invented format: unquoted keys,
# <|"|> sentinel tokens standing in for real quote characters (so it's not
# valid JSON even after fixing quoting), a server "alias" instead of the real
# mcp__SERVER__tool identifier, and no guarantee the closing tag survives.
_ALIASED_CALL_RE = _re.compile(
    r'<\|tool_call>call:([A-Za-z0-9_.-]+):([A-Za-z0-9_.-]+)\{([^{}]*)\}(?:\s*<tool_call\|>)?',
)
_ALIASED_KV_RE = _re.compile(r'([A-Za-z0-9_]+)\s*:\s*(?:<\|"\|>(.*?)<\|"\|>|([^,]+))')


def _resolve_aliased_tool_name(alias: str, tool: str, known_tool_names: frozenset[str]) -> str:
    """Map the model's made-up `alias:tool` shorthand to the real registered
    tool name (e.g. "motoup:search_products" -> "mcp__MOTOUP_ASSISTANT__search_products")."""
    tool_l = tool.lower()
    alias_key = _re.sub(r"[^a-z0-9]", "", alias.lower())
    matches = [
        n for n in known_tool_names if n.lower() == tool_l or n.lower().endswith(f"__{tool_l}")
    ]
    if len(matches) > 1:
        matches.sort(key=lambda n: alias_key not in _re.sub(r"[^a-z0-9]", "", n.lower()))
    return matches[0] if matches else f"{alias}:{tool}"


def _parse_aliased_args(body: str) -> dict:
    args: dict[str, Any] = {}
    for m in _ALIASED_KV_RE.finditer(body):
        key = m.group(1)
        if m.group(2) is not None:
            args[key] = m.group(2)
            continue
        raw = (m.group(3) or "").strip()
        if raw.lower() == "true":
            args[key] = True
        elif raw.lower() == "false":
            args[key] = False
        elif raw.lower() == "null":
            args[key] = None
        else:
            try:
                args[key] = int(raw)
            except ValueError:
                try:
                    args[key] = float(raw)
                except ValueError:
                    args[key] = raw
    return args


def _consume_json_object(text: str, start: int) -> tuple[dict, int] | None:
    """Parse a JSON object starting at `text[start:]` and return (obj, end_idx).

    Uses json.JSONDecoder.raw_decode which handles nested braces correctly.
    Skips leading whitespace before the '{'. Returns None if no valid object.
    """
    i = start
    while i < len(text) and text[i].isspace():
        i += 1
    if i >= len(text) or text[i] != "{":
        return None
    try:
        obj, consumed = json.JSONDecoder().raw_decode(text, i)
    except json.JSONDecodeError:
        return None
    return obj, consumed


def _extract_text_tool_calls(
    text: str, known_tool_names: frozenset[str] = frozenset()
) -> tuple[list[dict], int]:
    """Pull tool call JSON out of a plain-text response.

    Handles:
      1. ```tool_call\\n{...}\\n```          — the format we teach
      2. <function>NAME>{...}</function>     — Llama 3.1 (Groq)
      3. <function=NAME>{...}</function>     — Llama 3.1 alt
      4. <tool_call>{"name":..,"arguments":..}</tool_call>
      5. A bare {"name": ..., "arguments": {...}} with no wrapper at all
      6. ```<tool_name>\\n{...}\\n```         — model names the fence after
         the tool itself instead of "tool_call" (`known_tool_names`-gated)
      7. <|tool_call>call:alias:tool{k:<|"|>v<|"|>}<tool_call|>  — the
         self-hosted abliterated Gemma quant's own invented, JSON-invalid
         format; `alias` is resolved against `known_tool_names` to find the
         real mcp__SERVER__tool identifier

    Also returns `cutoff`: the end offset of the last recognized call. Weak
    models sometimes keep generating past the call, narrating a fabricated
    "result" and answer as if the tool had already run and returned data.
    Callers MUST discard everything after `cutoff` — none of it is real.
    """
    calls: list[dict] = []
    cutoff = 0

    # 1. Backtick-fenced blocks.
    for m in _TOOL_CALL_BLOCK_RE.finditer(text):
        parsed = _consume_json_object(m.group(1), 0)
        if not parsed:
            continue
        data, _ = parsed
        if isinstance(data, dict) and "name" in data:
            calls.append(
                {
                    "name": data["name"].strip(),
                    "args": data.get("args", data.get("arguments", data.get("parameters", {}))),
                }
            )
            cutoff = max(cutoff, m.end())

    # 2 & 3. <function ...>{...}</function>
    for m in _FN_TAG_OPEN_RE.finditer(text):
        name = (m.group(1) or "").strip()
        if not name:
            continue
        parsed = _consume_json_object(text, m.end())
        if not parsed:
            continue
        args, _end = parsed
        if not isinstance(args, dict):
            continue
        calls.append({"name": name, "args": args})
        cutoff = max(cutoff, _end)

    # 4. <tool_call>{...}</tool_call>
    for m in _TOOL_TAG_OPEN_RE.finditer(text):
        parsed = _consume_json_object(text, m.end())
        if not parsed:
            continue
        data, _end = parsed
        if isinstance(data, dict) and "name" in data:
            calls.append(
                {
                    "name": data["name"].strip(),
                    "args": data.get("arguments", data.get("args", data.get("parameters", {}))),
                }
            )
            cutoff = max(cutoff, _end)

    # 6. ```<tool_name>\n{...}\n``` — fence tagged with the tool's own name.
    for m in _GENERIC_FENCE_RE.finditer(text):
        tag = m.group(1)
        if tag == "tool_call" or tag not in (known_tool_names | _BUILTIN_TOOL_NAMES):
            continue
        parsed = _consume_json_object(m.group(2), 0)
        if not parsed:
            continue
        data, _ = parsed
        if isinstance(data, dict):
            calls.append({"name": tag, "args": data})
            cutoff = max(cutoff, m.end())

    # 7. <|tool_call>call:alias:tool{...}<tool_call|>
    for m in _ALIASED_CALL_RE.finditer(text):
        alias, tool, body = m.group(1), m.group(2), m.group(3)
        name = _resolve_aliased_tool_name(alias, tool, known_tool_names)
        calls.append({"name": name, "args": _parse_aliased_args(body)})
        cutoff = max(cutoff, m.end())

    # 5. Bare JSON object, no fence/tags at all — some Groq models (e.g.
    # gpt-oss, qwen) emit a raw {"name": ..., "arguments": {...}} as the
    # entire message body.
    if not calls:
        stripped = text.strip()
        if stripped.startswith("{"):
            leading = len(text) - len(text.lstrip())
            parsed = _consume_json_object(stripped, 0)
            if parsed:
                data, consumed = parsed
                if isinstance(data, dict) and "name" in data and isinstance(data["name"], str):
                    calls.append(
                        {
                            "name": data["name"].strip(),
                            "args": data.get(
                                "args", data.get("arguments", data.get("parameters", {}))
                            ),
                        }
                    )
                    cutoff = max(cutoff, leading + consumed)

    return calls, cutoff


def _strip_recognized_fences(text: str, known_tool_names: frozenset[str] = frozenset()) -> str:
    """Remove every span _extract_text_tool_calls recognizes as a tool-call
    attempt, so the raw fence/tag never leaks into the chat bubble."""
    text = _TOOL_CALL_BLOCK_RE.sub("", text)
    text = _FN_TAG_SPAN_RE.sub("", text)
    text = _TOOL_TAG_SPAN_RE.sub("", text)
    text = _ALIASED_CALL_RE.sub("", text)
    allowed = known_tool_names | _BUILTIN_TOOL_NAMES
    text = _GENERIC_FENCE_RE.sub(lambda m: "" if m.group(1) in allowed else m.group(0), text)
    return text.strip()


# Keys models commonly use when they wrap a plain-language answer in JSON
# instead of just writing it (seen from Groq's gpt-oss / qwen models).
_TEXT_JSON_KEYS = ("response", "answer", "content", "message", "text", "output", "reply")
_JSON_FENCE_RE = _re.compile(r"^```(?:json)?\s*\n(.*)\n```$", _re.DOTALL)


def _normalize_plain_text(text: str) -> str:
    """Unwrap a JSON-encoded answer so replies read as plain text on every model.

    Some Groq models occasionally emit `{"response": "..."}` (or similar)
    instead of writing the answer directly. If the whole message is such an
    object, pull the human-readable field out of it; ordinary prose (even
    prose that happens to contain a JSON snippet) is left untouched.
    """
    stripped = text.strip()
    if not stripped:
        return text
    fence = _JSON_FENCE_RE.match(stripped)
    if fence:
        stripped = fence.group(1).strip()
    if not (stripped.startswith("{") and stripped.endswith("}")):
        return text
    try:
        data = json.loads(stripped)
    except json.JSONDecodeError:
        return text
    if not isinstance(data, dict) or "name" in data:
        return text
    for key in _TEXT_JSON_KEYS:
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            return value
    return text


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
    ctx = {
        "agent_id": str(agent.id),
        "user_id": str(agent.user_id),
        # Cap what _execute_tool will dispatch to whatever we actually declared
        # to the model — stops hallucinated / re-injected tool calls dead.
        "allowed_tools": {t["name"] for t in tools} | set(mcp_map.keys()),
    }
    text_tool_mode = False  # True once we've fallen back to JSON-in-text tool calling
    calculate_faraid_called = False
    faraid_retry_used = False  # only ever force one corrective retry, never loop forever

    def _faraid_share_leaked(text: str) -> bool:
        return (
            "calculate_faraid" in ctx["allowed_tools"]
            and not calculate_faraid_called
            and _looks_like_unverified_faraid_share(text)
        )

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
                if not _is_tool_generation_error(exc):
                    raise
                # Try to salvage the tool call from the provider's error body —
                # Groq attaches the model's raw generation on `failed_generation`
                # and it's usually a valid native-format tool call. Executing it
                # keeps the conversation alive even after text-mode fallback,
                # where the model still emits native JSON and Groq rejects with
                # "Tool choice is none, but model called a tool".
                salvaged = _extract_failed_tool_call(exc)
                if salvaged and salvaged["name"] in ctx["allowed_tools"]:
                    name = salvaged["name"]
                    inputs = salvaged["args"]
                    if name == "calculate_faraid":
                        calculate_faraid_called = True
                    yield _sse({"type": "tool_call", "tool": name, "input": inputs})
                    result_text = await _execute_tool(name, inputs, mcp_map, ctx)
                    yield _sse({"type": "tool_result", "tool": name, "result": result_text[:500]})
                    # Record what the model tried to do + the result so the
                    # next turn has coherent history in either tool mode.
                    messages.append(
                        {
                            "role": "assistant",
                            "content": (
                                f"Calling tool `{name}` with "
                                f"{json.dumps(inputs, ensure_ascii=False)}"
                            ),
                        }
                    )
                    messages.append(
                        {
                            "role": "user",
                            "content": f"[Tool result for '{name}']: {result_text}\n\n"
                            f"{_TOOL_RESULT_FOLLOWUP_REMINDER}",
                        }
                    )
                    continue  # skip to the next LLM turn
                if oai_tools and not text_tool_mode:
                    # First-time fallback: the model can't generate valid native
                    # tool calls. Switch to text-mode and retry without tools.
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
                tool_calls, cutoff = _extract_text_tool_calls(text, ctx["allowed_tools"])
                if tool_calls:
                    # Cap per-turn burst — weak models (Llama in text-mode)
                    # sometimes emit huge batches of parallel tool calls.
                    tool_calls = tool_calls[:_MAX_TOOL_CALLS_PER_TURN]
                    # Discard everything after the last recognized call —
                    # some models keep generating past it, narrating a
                    # fabricated "result" and answer as if the (real) tool
                    # had already run. None of that is trustworthy.
                    trusted_text = text[:cutoff]
                    display = _strip_recognized_fences(trusted_text, ctx["allowed_tools"])
                    if display:
                        yield _sse({"type": "text", "content": display})
                    messages.append({"role": "assistant", "content": trusted_text})
                    for tc in tool_calls:
                        name = tc["name"]
                        inputs = tc["args"]
                        if name == "calculate_faraid":
                            calculate_faraid_called = True
                        yield _sse({"type": "tool_call", "tool": name, "input": inputs})
                        result_text = await _execute_tool(name, inputs, mcp_map, ctx)
                        yield _sse(
                            {"type": "tool_result", "tool": name, "result": result_text[:500]}
                        )
                        # Append as a user message so any model understands it
                        messages.append(
                            {
                                "role": "user",
                                "content": f"[Tool result for '{name}']: {result_text}",
                            }
                        )
                    messages.append({"role": "user", "content": _TOOL_RESULT_FOLLOWUP_REMINDER})
                else:
                    if text and _faraid_share_leaked(text) and not faraid_retry_used:
                        faraid_retry_used = True
                        messages.append({"role": "assistant", "content": text})
                        messages.append(
                            {"role": "user", "content": _FARAID_SELF_COMPUTE_CORRECTION}
                        )
                        continue
                    if text:
                        yield _sse({"type": "text", "content": _normalize_plain_text(text)})
                    break
            else:
                # Native mode: usually msg.tool_calls has the calls. But weak
                # models (Llama 8B via Groq) sometimes ignore the native
                # tool_call channel and just emit <function>NAME>{...}</function>
                # tags in the text. Detect that and hand off to text-mode
                # execution so the tool actually fires instead of the raw XML
                # leaking to the user.
                if not msg.tool_calls and text:
                    salvaged, cutoff = _extract_text_tool_calls(text, ctx["allowed_tools"])
                    if salvaged:
                        salvaged = salvaged[:_MAX_TOOL_CALLS_PER_TURN]
                        trusted_text = text[:cutoff]
                        display = _strip_recognized_fences(trusted_text, ctx["allowed_tools"])
                        if display:
                            yield _sse({"type": "text", "content": display})
                        messages.append({"role": "assistant", "content": trusted_text})
                        for tc in salvaged:
                            name = tc["name"]
                            inputs = tc["args"]
                            if name == "calculate_faraid":
                                calculate_faraid_called = True
                            yield _sse({"type": "tool_call", "tool": name, "input": inputs})
                            result_text = await _execute_tool(name, inputs, mcp_map, ctx)
                            yield _sse(
                                {"type": "tool_result", "tool": name, "result": result_text[:500]}
                            )
                            messages.append(
                                {
                                    "role": "user",
                                    "content": f"[Tool result for '{name}']: {result_text}",
                                }
                            )
                        messages.append(
                            {"role": "user", "content": _TOOL_RESULT_FOLLOWUP_REMINDER}
                        )
                        continue  # loop back for the next LLM turn

                is_final_turn = not msg.tool_calls or choice.finish_reason == "stop"
                if text and is_final_turn and _faraid_share_leaked(text) and not faraid_retry_used:
                    faraid_retry_used = True
                    messages.append({"role": "assistant", "content": text})
                    messages.append({"role": "user", "content": _FARAID_SELF_COMPUTE_CORRECTION})
                    continue

                if text:
                    yield _sse({"type": "text", "content": _normalize_plain_text(text)})

                if is_final_turn:
                    break

                # Cap per-turn burst so the model can't fire 50 tool calls in
                # one iteration. We slice the OpenAI native tool_calls list.
                capped_tool_calls = list(msg.tool_calls)[:_MAX_TOOL_CALLS_PER_TURN]

                messages.append(
                    {
                        "role": "assistant",
                        "content": text,
                        "tool_calls": [
                            {
                                "id": tc.id,
                                "type": "function",
                                "function": {
                                    "name": tc.function.name.strip(),
                                    "arguments": tc.function.arguments,
                                },
                            }
                            for tc in capped_tool_calls
                        ],
                    }
                )

                for tc in capped_tool_calls:
                    name = tc.function.name.strip()
                    try:
                        inputs = json.loads(tc.function.arguments or "{}")
                    except Exception:
                        inputs = {}
                    if name == "calculate_faraid":
                        calculate_faraid_called = True
                    yield _sse({"type": "tool_call", "tool": name, "input": inputs})
                    result_text = await _execute_tool(name, inputs, mcp_map, ctx)
                    yield _sse({"type": "tool_result", "tool": name, "result": result_text[:500]})
                    messages.append({"role": "tool", "tool_call_id": tc.id, "content": result_text})
                messages.append({"role": "user", "content": _TOOL_RESULT_FOLLOWUP_REMINDER})

                if choice.finish_reason != "tool_calls":
                    break

    except Exception as exc:
        short = str(exc).split("\n")[0].strip()
        yield _sse({"type": "error", "content": short or str(exc)})
        return

    yield _sse({"type": "done"})


def _tools_to_gemini(tools: list[dict]) -> list:
    """Convert Anthropic-format tool definitions to google.genai Tool objects."""
    from google.genai import types as _gtypes

    if not tools:
        return []
    declarations = []
    for t in tools:
        schema = t.get("input_schema", {})
        props = {
            k: _gtypes.Schema(
                type=v.get("type", "string").upper(),
                description=v.get("description", ""),
            )
            for k, v in schema.get("properties", {}).items()
        }
        declarations.append(
            _gtypes.FunctionDeclaration(
                name=t["name"],
                description=t.get("description", ""),
                parameters=_gtypes.Schema(
                    type="OBJECT",
                    properties=props,
                    required=schema.get("required", []),
                ),
            )
        )
    return [_gtypes.Tool(function_declarations=declarations)]


async def _run_agent_gemini(
    agent: Agent,
    system_prompt: str,
    tools: list[dict],
    mcp_map: dict[str, Any],
    user_message: str,
    history: list[dict],
    api_key: str,
) -> AsyncIterator[str]:
    from google import genai as _genai
    from google.genai import types as _gtypes

    client = _genai.Client(api_key=api_key)
    gemini_tools = _tools_to_gemini(tools)

    # Build contents list from history + current message
    contents: list = []
    for m in history:
        role = "user" if m.get("role") == "user" else "model"
        contents.append(
            _gtypes.Content(role=role, parts=[_gtypes.Part.from_text(text=m.get("content", "") or "")])
        )
    contents.append(_gtypes.Content(role="user", parts=[_gtypes.Part.from_text(text=user_message)]))

    config = _gtypes.GenerateContentConfig(
        system_instruction=system_prompt or None,
        tools=gemini_tools if gemini_tools else None,
        max_output_tokens=4096,
    )

    step = 0
    max_steps = agent.max_steps or 10
    ctx = {
        "agent_id": str(agent.id),
        "user_id": str(agent.user_id),
        # Cap what _execute_tool will dispatch to whatever we actually declared
        # to the model — stops hallucinated / re-injected tool calls dead.
        "allowed_tools": {t["name"] for t in tools} | set(mcp_map.keys()),
    }

    try:
        while step < max_steps:
            step += 1
            response = await client.aio.models.generate_content(
                model=agent.model or "gemini-2.0-flash",
                contents=contents,
                config=config,
            )

            text_parts: list[str] = []
            function_calls: list[Any] = []
            if response.candidates:
                for part in response.candidates[0].content.parts:
                    if hasattr(part, "text") and part.text:
                        text_parts.append(part.text)
                    if (
                        hasattr(part, "function_call")
                        and part.function_call
                        and part.function_call.name
                    ):
                        function_calls.append(part.function_call)

            if text_parts:
                yield _sse({"type": "text", "content": "".join(text_parts)})

            if not function_calls:
                break

            # Cap per-turn burst — same reason as the other runners.
            function_calls = function_calls[:_MAX_TOOL_CALLS_PER_TURN]

            # Append model turn to contents
            contents.append(response.candidates[0].content)

            fn_result_parts: list[Any] = []
            for fc in function_calls:
                args = dict(fc.args) if fc.args else {}
                yield _sse({"type": "tool_call", "tool": fc.name, "input": args})
                result_text = await _execute_tool(fc.name, args, mcp_map, ctx)
                yield _sse({"type": "tool_result", "tool": fc.name, "result": result_text[:500]})
                fn_result_parts.append(
                    _gtypes.Part(
                        function_response=_gtypes.FunctionResponse(
                            name=fc.name,
                            response={"result": result_text},
                        )
                    )
                )

            contents.append(_gtypes.Content(role="user", parts=fn_result_parts))
    except Exception as exc:
        msg = str(exc)
        short = msg.split("\n")[0].strip()
        yield _sse({"type": "error", "content": short or msg})
        return

    yield _sse({"type": "done"})


# ─── Tool building (built-in + MCP) ──────────────────────────────────────────

# Some MCP servers declare the calling customer's own session credential as a
# model-fillable parameter (moto-hub's tools.js: `accessToken`, "The calling
# customer's Django JWT access token"). The model has no legitimate way to
# obtain a real one — there is no per-visitor identity threaded into agent
# chat today — so exposing it just teaches the model to ask the human to
# paste their login token into the conversation, which is unsafe regardless
# of how well the model otherwise behaves. Strip it from the schema instead;
# _execute_tool_impl short-circuits these calls with an honest explanation.
_CUSTOMER_CREDENTIAL_PARAM_NAMES = {"accessToken", "access_token"}


def _strip_customer_credential_param(input_schema: dict) -> tuple[dict, bool]:
    """Returns (schema_with_credential_param_removed, whether_one_was_found)."""
    props = dict(input_schema.get("properties", {}))
    removed = [p for p in props if p in _CUSTOMER_CREDENTIAL_PARAM_NAMES]
    if not removed:
        return input_schema, False
    for p in removed:
        props.pop(p)
    schema = dict(input_schema)
    schema["properties"] = props
    if "required" in schema:
        schema["required"] = [r for r in schema["required"] if r not in removed]
    return schema, True


async def _build_tools_with_mcp(
    agent: Agent, user_id: uuid.UUID, db: DBSession
) -> tuple[list[dict], dict[str, Any]]:
    """
    Returns (tools_list_for_anthropic, tool_route_map).
    tool_route_map: {tool_name -> {"kind": ..., ...}} — routing info _execute_tool
    uses to dispatch a call to the right backend (MCP server, custom webhook,
    or the agent's linked commerce store). All lookups here (MCP servers, custom
    tools, commerce products) are pre-fetched once, up front, since no DB session
    is threaded into the streaming loop that later calls _execute_tool.
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
                    raw_schema = tool.get("inputSchema", {"type": "object", "properties": {}})
                    schema, needs_customer_auth = _strip_customer_credential_param(raw_schema)
                    tools.append(
                        {
                            "name": tool_name,
                            "description": f"[MCP: {server.name}] {tool.get('description', '')}",
                            "input_schema": schema,
                        }
                    )
                    mcp_map[tool_name] = {
                        "kind": "mcp",
                        "server": server,
                        "original_name": tool["name"],
                        "needs_customer_auth": needs_customer_auth,
                    }
            except Exception:
                pass  # Skip unreachable MCP servers silently
    except Exception:
        pass

    # Custom webhook tools the owner defined for this agent (e.g. book_service,
    # create_account against their own external API). Never exposed on public
    # shares — see _PUBLIC_SHARE_TOOL_ALLOWLIST.
    try:
        result = await db.execute(
            select(AgentFunction).where(
                AgentFunction.agent_id == agent.id,
                AgentFunction.is_active == True,  # noqa: E712
            )
        )
        for fn in result.scalars().all():
            tools.append(
                {
                    "name": fn.name,
                    "description": fn.description,
                    "input_schema": fn.parameters_schema or {"type": "object", "properties": {}},
                }
            )
            mcp_map[fn.name] = {"kind": "custom_webhook", "function": fn}
    except Exception:
        pass

    # Commerce: list_products / buy_product for the store linked to this agent.
    # Safe to expose on public shares — buy_product only ever returns a link to
    # the store's own hosted checkout page, it never touches payment data or
    # fires a charge itself.
    if (agent.tools or {}).get("commerce"):
        try:
            store = (
                await db.execute(
                    select(CommerceStore).where(
                        CommerceStore.agent_id == agent.id,
                        CommerceStore.is_active == True,  # noqa: E712
                    )
                )
            ).scalar_one_or_none()
            if store:
                products = (
                    (
                        await db.execute(
                            select(CommerceProduct).where(
                                CommerceProduct.store_id == store.id,
                                CommerceProduct.in_stock == True,  # noqa: E712
                            )
                        )
                    )
                    .scalars()
                    .all()
                )
                tools.append(
                    {
                        "name": "list_products",
                        "description": (
                            f"List products for sale in the '{store.name}' store. Optionally "
                            "filter by category or a name/description search term — use this "
                            "for larger catalogs instead of dumping everything."
                        ),
                        "input_schema": {
                            "type": "object",
                            "properties": {
                                "category": {
                                    "type": "string",
                                    "description": "Only return products in this category",
                                },
                                "query": {
                                    "type": "string",
                                    "description": "Only return products whose name or "
                                    "description contains this text",
                                },
                            },
                        },
                    }
                )
                tools.append(
                    {
                        "name": "buy_product",
                        "description": (
                            "Get a checkout link for a product so the customer can complete "
                            "payment themselves. Never ask the customer for card details in "
                            "chat — this tool hands back a link to the store's own secure "
                            "checkout page."
                        ),
                        "input_schema": {
                            "type": "object",
                            "properties": {
                                "product_id": {
                                    "type": "string",
                                    "description": "The id of the product to buy",
                                }
                            },
                            "required": ["product_id"],
                        },
                    }
                )
                tools.append(
                    {
                        "name": "check_order_status",
                        "description": (
                            "Look up an order's status. Requires BOTH the order id and the "
                            "email used to place it — ask the customer for both, never guess."
                        ),
                        "input_schema": {
                            "type": "object",
                            "properties": {
                                "order_id": {
                                    "type": "string",
                                    "description": "The order/payment id",
                                },
                                "email": {
                                    "type": "string",
                                    "description": "The email used to place the order",
                                },
                            },
                            "required": ["order_id", "email"],
                        },
                    }
                )
                mcp_map["list_products"] = {
                    "kind": "commerce_list_products",
                    "store": store,
                    "products": products,
                }
                mcp_map["buy_product"] = {
                    "kind": "commerce_buy_product",
                    "store": store,
                    "products": products,
                }
                mcp_map["check_order_status"] = {
                    "kind": "commerce_order_status",
                    "store": store,
                }
        except Exception:
            pass

    # Load integration tools for this agent.
    try:
        from app.models.agent_integration import AgentIntegration as _AgentIntegration
        from app.services.integrations.executor import build_integration_tool_schemas

        intg_result = await db.execute(
            select(_AgentIntegration).where(
                _AgentIntegration.agent_id == agent.id,
                _AgentIntegration.user_id == user_id,
                _AgentIntegration.is_active == True,  # noqa: E712
            )
        )
        agent_integrations = intg_result.scalars().all()
        intg_dicts = [
            {
                "id": i.id,
                "integration_type": i.integration_type,
                "base_url": i.base_url,
                "auth_type": i.auth_type,
                "auth_header": i.auth_header,
                "encrypted_credential": i.encrypted_credential,
                "enabled_tool_groups": i.enabled_tool_groups or [],
                "enabled_tools": i.enabled_tools,
                "is_active": i.is_active,
                "allow_destructive": i.allow_destructive,
            }
            for i in agent_integrations
        ]
        tools.extend(build_integration_tool_schemas(intg_dicts))
    except Exception:
        pass  # Never break agent runs due to integration loading errors

    return tools, mcp_map


def _build_builtin_tools(tools_config: dict) -> list[dict]:
    defs = []

    if tools_config.get("web_search"):
        defs.append(
            {
                "name": "web_search",
                "description": "Search the web for current information. Use for facts, news, prices, or anything that may have changed recently.",
                "input_schema": {
                    "type": "object",
                    "properties": {"query": {"type": "string", "description": "Search query"}},
                    "required": ["query"],
                },
            }
        )

    if tools_config.get("browser"):
        defs.append(
            {
                "name": "browse_url",
                "description": "Fetch and extract readable text content from a URL.",
                "input_schema": {
                    "type": "object",
                    "properties": {"url": {"type": "string", "description": "URL to visit"}},
                    "required": ["url"],
                },
            }
        )

    # run_code is a real security risk (no sandbox — see _tool_run_code
    # docstring). Only expose it when the operator has explicitly opted in via
    # settings.enable_code_tool. This keeps the toggle visible in the UI so
    # existing agents don't silently break, but the tool won't actually reach
    # the model.
    if tools_config.get("code") and settings.enable_code_tool:
        defs.append(
            {
                "name": "run_code",
                "description": "Execute a Python code snippet. Returns stdout. Use for calculations, data processing, or formatting.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "code": {"type": "string", "description": "Python code to execute"}
                    },
                    "required": ["code"],
                },
            }
        )

    if tools_config.get("http"):
        defs.append(
            {
                "name": "http_request",
                "description": "Make an HTTP GET or POST request to an external API or URL.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "method": {
                            "type": "string",
                            "enum": ["GET", "POST"],
                            "description": "HTTP method",
                        },
                        "url": {"type": "string", "description": "Full URL"},
                        "headers": {"type": "object", "description": "Optional request headers"},
                        "body": {"type": "object", "description": "Optional JSON body for POST"},
                    },
                    "required": ["method", "url"],
                },
            }
        )

    if tools_config.get("sheets"):
        defs.append(
            {
                "name": "google_sheets",
                "description": "Read or write data in a Google Sheet.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "spreadsheet_id": {
                            "type": "string",
                            "description": "Google Sheet ID from its URL",
                        },
                        "operation": {
                            "type": "string",
                            "enum": ["read_range", "append_row", "update_range"],
                        },
                        "range": {
                            "type": "string",
                            "description": "A1 notation range (e.g. Sheet1!A1:D10)",
                        },
                        "values": {
                            "type": "array",
                            "description": "Rows to write for append_row or update_range",
                        },
                    },
                    "required": ["spreadsheet_id", "operation", "range"],
                },
            }
        )

    if tools_config.get("email"):
        defs.append(
            {
                "name": "send_email",
                "description": "Send an email to a recipient. Use when the user asks to send, draft, or forward an email.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "to": {"type": "string", "description": "Recipient email address"},
                        "subject": {"type": "string", "description": "Email subject line"},
                        "body": {
                            "type": "string",
                            "description": "Email body (plain text or simple HTML)",
                        },
                    },
                    "required": ["to", "subject", "body"],
                },
            }
        )

    if tools_config.get("sms"):
        defs.append(
            {
                "name": "send_sms",
                "description": "Send an SMS text message to a phone number via Twilio.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "to": {
                            "type": "string",
                            "description": "Recipient phone number in E.164 format (e.g. +14155552671)",
                        },
                        "message": {
                            "type": "string",
                            "description": "SMS message text (max 160 chars for single segment)",
                        },
                    },
                    "required": ["to", "message"],
                },
            }
        )

    if tools_config.get("verification"):
        defs.append(
            {
                "name": "send_email_verification",
                "description": (
                    "Generate a 6-digit OTP and send it to an email address. "
                    "Use this to verify a user's email before taking a sensitive action. "
                    "The code expires in 10 minutes."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "email": {
                            "type": "string",
                            "description": "Email address to send the verification code to",
                        },
                        "purpose": {
                            "type": "string",
                            "description": "Short description of what is being verified (e.g. 'account access', 'password reset')",
                        },
                    },
                    "required": ["email"],
                },
            }
        )
        defs.append(
            {
                "name": "send_sms_verification",
                "description": (
                    "Generate a 6-digit OTP and send it as an SMS to a phone number. "
                    "Use this to verify a user's phone before taking a sensitive action. "
                    "The code expires in 10 minutes."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "phone": {
                            "type": "string",
                            "description": "Recipient phone number in E.164 format (e.g. +14155552671)",
                        },
                        "purpose": {
                            "type": "string",
                            "description": "Short description of what is being verified",
                        },
                    },
                    "required": ["phone"],
                },
            }
        )
        defs.append(
            {
                "name": "verify_code",
                "description": (
                    "Check whether the code entered by the user matches the one that was sent. "
                    "Call this after the user provides the code they received by email or SMS."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "identifier": {
                            "type": "string",
                            "description": "The email address or phone number the code was sent to",
                        },
                        "code": {
                            "type": "string",
                            "description": "The 6-digit code entered by the user",
                        },
                    },
                    "required": ["identifier", "code"],
                },
            }
        )

    if tools_config.get("agent_builder"):
        defs.append(
            {
                "name": "list_available_models",
                "description": "List all LLM models available to the current user, grouped by provider. Use this to discover valid model IDs before calling create_agent.",
                "input_schema": {"type": "object", "properties": {}, "required": []},
            }
        )
        defs.append(
            {
                "name": "create_agent",
                "description": "Create a new AI agent with the given configuration.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "Agent display name"},
                        "description": {
                            "type": "string",
                            "description": "Short description of what the agent does",
                        },
                        "model": {
                            "type": "string",
                            "description": "Exact model ID (e.g. llama-3.3-70b-versatile)",
                        },
                        "instructions": {
                            "type": "string",
                            "description": "The system prompt / instructions for the agent",
                        },
                        "memory_enabled": {
                            "type": "boolean",
                            "description": "Whether the agent remembers past sessions",
                        },
                        "tool_web_search": {
                            "type": "boolean",
                            "description": "Enable web search tool",
                        },
                        "tool_http": {"type": "boolean", "description": "Enable HTTP request tool"},
                        "tool_email": {"type": "boolean", "description": "Enable send email tool"},
                        "tool_code": {
                            "type": "boolean",
                            "description": "Enable Python code execution tool",
                        },
                        "tool_sms": {"type": "boolean", "description": "Enable SMS tool"},
                        "tool_browser": {
                            "type": "boolean",
                            "description": "Enable browser/URL tool",
                        },
                        "tool_sheets": {
                            "type": "boolean",
                            "description": "Enable Google Sheets read/write tool",
                        },
                        "tool_verification": {
                            "type": "boolean",
                            "description": "Enable OTP send-and-verify tool (email/SMS)",
                        },
                        "tool_search_kb": {
                            "type": "boolean",
                            "description": "Enable knowledge base search tool",
                        },
                        "tool_agent_builder": {
                            "type": "boolean",
                            "description": "Enable agent-builder tool (lets this agent spawn new agents)",
                        },
                        "max_steps": {
                            "type": "integer",
                            "description": "Maximum reasoning turns (1–30, default 10)",
                        },
                    },
                    "required": ["name", "model", "instructions"],
                },
            }
        )

    if tools_config.get("search_kb"):
        defs.append(
            {
                "name": "search_kb",
                "description": (
                    "Search this agent's private knowledge base for relevant passages. "
                    "Use this whenever the answer might live in an uploaded document, URL, "
                    "or pasted text the user has attached to the agent. Returns the top "
                    "matching chunks with their source document names."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Natural-language query describing what you're looking for",
                        },
                        "top_k": {
                            "type": "integer",
                            "description": "Maximum number of chunks to return (default 5, max 10)",
                        },
                    },
                    "required": ["query"],
                },
            }
        )

    if tools_config.get("faraid"):
        defs.append(
            {
                "name": "calculate_faraid",
                "description": (
                    "Deterministically calculate Islamic (Faraid) inheritance shares — Hanafi rules. "
                    "This tool does the actual arithmetic; you must never compute or estimate shares "
                    "yourself. Before calling it, ask the user for every field below that they "
                    "haven't already stated — do not assume an heir is absent just because it wasn't "
                    "mentioned, and do not guess estate amounts. Only call this tool once you have "
                    "the decedent's gender, the net estate figures, and an explicit answer (present/"
                    "absent, or a count) for each heir category that could plausibly apply."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "decedent_gender": {"type": "string", "enum": ["male", "female"]},
                        "gross_estate": {
                            "type": "string",
                            "description": "Total estate value before deductions, as a decimal string, e.g. '125000.00'",
                        },
                        "funeral_expenses": {
                            "type": "string",
                            "description": "Decimal string, default '0'",
                        },
                        "debts": {"type": "string", "description": "Decimal string, default '0'"},
                        "bequest": {
                            "type": "string",
                            "description": "Wasiyyah — decimal string, default '0'. Capped at 1/3 of the estate after debts.",
                        },
                        "currency": {
                            "type": "string",
                            "description": "3-letter currency code, default 'GBP'",
                        },
                        "heirs": {
                            "type": "object",
                            "description": "Set only the fields the user actually confirmed; leave the rest unset (they default to absent/zero) only after explicitly asking.",
                            "properties": {
                                "husband": {
                                    "type": "boolean",
                                    "description": "Only valid if decedent_gender is female",
                                },
                                "wives": {
                                    "type": "integer",
                                    "description": "0-4; only valid if decedent_gender is male",
                                },
                                "sons": {"type": "integer"},
                                "daughters": {"type": "integer"},
                                "father": {"type": "boolean"},
                                "mother": {"type": "boolean"},
                                "paternal_grandfather": {"type": "boolean"},
                                "paternal_grandmother": {"type": "boolean"},
                                "maternal_grandmother": {"type": "boolean"},
                                "full_brothers": {"type": "integer"},
                                "full_sisters": {"type": "integer"},
                                "paternal_brothers": {
                                    "type": "integer",
                                    "description": "Consanguine — same father, different mother",
                                },
                                "paternal_sisters": {"type": "integer"},
                                "maternal_brothers": {
                                    "type": "integer",
                                    "description": "Uterine — same mother, different father",
                                },
                                "maternal_sisters": {"type": "integer"},
                                "grandsons_via_son": {
                                    "type": "integer",
                                    "description": "Sons of sons",
                                },
                                "granddaughters_via_son": {
                                    "type": "integer",
                                    "description": "Daughters of sons",
                                },
                            },
                        },
                    },
                    "required": ["decedent_gender", "gross_estate", "heirs"],
                },
            }
        )

    return defs


# ─── Tool execution ───────────────────────────────────────────────────────────


async def _execute_tool(name: str, inputs: dict, mcp_map: dict, ctx: dict | None = None) -> str:
    """Timed wrapper around _execute_tool_impl — logs how long each tool call
    takes so a stalled/slow tool is visible in logs even though the request
    itself may still eventually return 200 (see _run_agent's SSE streaming:
    the request-logging middleware only times the first chunk, not the full
    tool-calling loop)."""
    start = time.perf_counter()
    try:
        return await _execute_tool_impl(name, inputs, mcp_map, ctx)
    finally:
        duration_ms = round((time.perf_counter() - start) * 1000, 1)
        logger.bind(
            agent_id=(ctx or {}).get("agent_id"),
            tool=name,
            duration_ms=duration_ms,
        ).info(f"tool_call {name} {duration_ms}ms")


async def _execute_tool_impl(name: str, inputs: dict, mcp_map: dict, ctx: dict | None = None) -> str:
    # Defense-in-depth: even if the model hallucinates a tool call for a name
    # that isn't in its declared tool list (text-mode extraction, retries, etc),
    # refuse to dispatch it if the caller passed an allowlist. Public shares set
    # this; authenticated /chat leaves it None → any built-in is allowed.
    allowed = (ctx or {}).get("allowed_tools")
    if allowed is not None and name not in allowed and name not in mcp_map:
        return f"Tool '{name}' is not available in this context."
    try:
        # Integration tool (intg::{integration_id}::{tool_key})
        from app.services.integrations.executor import (
            execute_integration_tool as _exec_intg,
            is_integration_tool as _is_intg,
        )
        if _is_intg(name):
            from app.db.session import AsyncSessionLocal
            from app.models.agent_integration import AgentIntegration as _AgentIntegration

            agent_id_str = (ctx or {}).get("agent_id", "")
            user_id_str = (ctx or {}).get("user_id", "")
            integrations_data: list = []
            if agent_id_str and user_id_str:
                try:
                    async with AsyncSessionLocal() as _db:
                        _r = await _db.execute(
                            select(_AgentIntegration).where(
                                _AgentIntegration.agent_id == uuid.UUID(agent_id_str),
                                _AgentIntegration.user_id == uuid.UUID(user_id_str),
                                _AgentIntegration.is_active == True,  # noqa: E712
                            )
                        )
                        integrations_data = [
                            {
                                "id": i.id,
                                "integration_type": i.integration_type,
                                "base_url": i.base_url,
                                "auth_type": i.auth_type,
                                "auth_header": i.auth_header,
                                "encrypted_credential": i.encrypted_credential,
                                "enabled_tool_groups": i.enabled_tool_groups or [],
                                "enabled_tools": i.enabled_tools,
                                "is_active": i.is_active,
                                "allow_destructive": i.allow_destructive,
                            }
                            for i in _r.scalars().all()
                        ]
                except Exception:
                    pass
            return await _exec_intg(
                name,
                inputs,
                integrations_data,
                agent_id=agent_id_str,
                conversation_id="",
            )
        route = mcp_map.get(name)
        if route is not None:
            kind = route.get("kind")
            if kind == "mcp":
                if route.get("needs_customer_auth"):
                    return (
                        "This action requires the customer to already be logged in on the "
                        "store's own website — there is no way to access their account from "
                        "this chat. Tell the user (in your own words, don't quote this "
                        "verbatim) that they'll need to log in on the site and complete this "
                        "action from their account page, or offer to help with something "
                        "that doesn't require login, such as browsing or comparing products."
                    )
                return await _tool_mcp(route["server"], route["original_name"], inputs)
            if kind == "custom_webhook":
                return await _tool_custom_webhook(route["function"], inputs)
            if kind == "commerce_list_products":
                return _tool_list_products(route["store"], route["products"], inputs)
            if kind == "commerce_buy_product":
                return _tool_buy_product(route["store"], route["products"], inputs)
            if kind == "commerce_order_status":
                return await _tool_check_order_status(route["store"], inputs)
        # Built-in tools
        if name == "web_search":
            return await _tool_web_search(inputs.get("query", ""), ctx or {})
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
        elif name == "search_kb":
            return await _tool_search_kb(inputs, ctx or {})
        elif name == "calculate_faraid":
            return _tool_calculate_faraid(inputs)
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
        parts = [
            c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text"
        ]
        return "\n".join(parts)[:4000] or json.dumps(result)[:4000]
    return str(result)[:4000]



# ─── Built-in tool implementations ───────────────────────────────────────────


async def _tool_web_search(query: str, ctx: dict | None = None) -> str:
    user_id_str = (ctx or {}).get("user_id")

    async def _user_search_key(provider: str) -> str | None:
        if not user_id_str:
            return None
        try:
            from app.db.session import AsyncSessionLocal

            async with AsyncSessionLocal() as _db:
                return await _get_user_key(uuid.UUID(user_id_str), provider, _db)
        except Exception:
            return None

    async def _try_tavily(key: str) -> str | None:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(
                "https://api.tavily.com/search",
                json={"api_key": key, "query": query, "max_results": 5},
            )
        if r.status_code == 200:
            results = r.json().get("results", [])
            lines = [f"{x['title']}: {x['content']} ({x['url']})" for x in results]
            return "\n".join(lines) if lines else None
        return None

    async def _try_serper(key: str) -> str | None:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(
                "https://google.serper.dev/search",
                headers={"X-API-KEY": key, "Content-Type": "application/json"},
                json={"q": query, "num": 5},
            )
        if r.status_code == 200:
            results = r.json().get("organic", [])
            lines = [f"{x['title']}: {x.get('snippet', '')} ({x['link']})" for x in results[:5]]
            return "\n".join(lines) if lines else None
        return None

    async def _try_bing(key: str) -> str | None:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(
                "https://api.bing.microsoft.com/v7.0/search",
                params={"q": query, "count": 5},
                headers={"Ocp-Apim-Subscription-Key": key},
            )
        if r.status_code == 200:
            items = r.json().get("webPages", {}).get("value", [])
            lines = [f"{x['name']}: {x.get('snippet', '')} ({x['url']})" for x in items[:5]]
            return "\n".join(lines) if lines else None
        return None

    async def _try_brave(key: str) -> str | None:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(
                "https://api.search.brave.com/res/v1/web/search",
                params={"q": query, "count": 5},
                headers={"Accept": "application/json", "X-Subscription-Token": key},
            )
        if r.status_code == 200:
            results = r.json().get("web", {}).get("results", [])
            lines = [f"{x['title']}: {x.get('description', '')} ({x['url']})" for x in results[:5]]
            return "\n".join(lines) if lines else None
        return None

    async def _try_serpapi(key: str) -> str | None:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(
                "https://serpapi.com/search.json", params={"q": query, "num": 5, "api_key": key}
            )
        if r.status_code == 200:
            results = r.json().get("organic_results", [])
            lines = [f"{x['title']}: {x.get('snippet', '')} ({x['link']})" for x in results[:5]]
            return "\n".join(lines) if lines else None
        return None

    async def _try_you(key: str) -> str | None:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(
                "https://api.ydc-index.io/search",
                params={"query": query, "num_web_results": 5},
                headers={"X-API-Key": key},
            )
        if r.status_code == 200:
            hits = r.json().get("hits", [])
            lines = [
                f"{x['title']}: {' '.join(x.get('snippets', [])[:2])} ({x['url']})"
                for x in hits[:5]
            ]
            return "\n".join(lines) if lines else None
        return None

    async def _try_exa(key: str) -> str | None:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(
                "https://api.exa.ai/search",
                headers={"x-api-key": key, "Content-Type": "application/json"},
                json={"query": query, "numResults": 5, "useAutoprompt": True},
            )
        if r.status_code == 200:
            results = r.json().get("results", [])
            lines = [f"{x['title']}: {x.get('text', '')[:200]} ({x['url']})" for x in results[:5]]
            return "\n".join(lines) if lines else None
        return None

    # Try each provider — user key first, then platform .env key
    _providers = [
        ("tavily", _try_tavily, settings.tavily_api_key),
        ("serper", _try_serper, ""),
        ("bing", _try_bing, ""),
        ("brave_search", _try_brave, settings.brave_search_api_key),
        ("serpapi", _try_serpapi, ""),
        ("you", _try_you, ""),
        ("exa", _try_exa, ""),
    ]
    for provider, fn, platform_key in _providers:
        key = await _user_search_key(provider) or platform_key or None
        if not key:
            continue
        try:
            result = await fn(key)
            if result:
                return result
        except Exception:
            continue

    # Free fallback: DuckDuckGo — no key required
    try:
        from duckduckgo_search import DDGS

        loop = asyncio.get_running_loop()
        news = await loop.run_in_executor(None, lambda: list(DDGS().news(query, max_results=5)))
        if news:
            lines = [
                f"{r['title']}: {r['body']} ({r['url']})"
                + (f" [{r.get('date', '')}]" if r.get("date") else "")
                for r in news
            ]
            return "\n".join(lines)
        results = await loop.run_in_executor(None, lambda: list(DDGS().text(query, max_results=5)))
        if results:
            return "\n".join(f"{r['title']}: {r['body']} ({r['href']})" for r in results)
    except Exception:
        pass

    return "No search results found. Add a search API key in Settings → Search Integrations for better results (Tavily is free at app.tavily.com)."


from app.services.net_security import is_ssrf_safe as _is_ssrf_safe  # noqa: E402


async def _tool_http(inputs: dict) -> str:
    method = inputs.get("method", "GET").upper()
    url = inputs.get("url", "")
    headers = inputs.get("headers") or {}
    body = inputs.get("body")
    if not _is_ssrf_safe(url):
        return "Error: URL is not allowed (private/internal addresses are blocked)."
    async with httpx.AsyncClient(timeout=20, follow_redirects=False) as client:
        if method == "POST":
            resp = await client.post(url, headers=headers, json=body)
        else:
            resp = await client.get(url, headers=headers)
    try:
        return json.dumps(resp.json(), indent=2)[:3000]
    except Exception:
        return resp.text[:3000]


async def _tool_custom_webhook(fn: AgentFunction, inputs: dict) -> str:
    """Fire a user-defined custom tool (app.models.agent_function.AgentFunction).

    Features:
    - URL template substitution: {param} in the URL is replaced with the
      matching input value so /api/cart/{id}/ works automatically.
    - Credential injection: if credential_id is set, the stored credential's
      auth header is added automatically without exposing the value to the model.
    - HTTP method routing: remaining inputs go to query string (GET/DELETE) or
      JSON body (POST/PUT/PATCH).
    - SSRF re-validated at fire time on the final resolved URL.
    """
    import re as _re
    from app.services.llm.key_store import decrypt_key
    from app.services.integrations.credential_store import decrypt_credential

    # ── 1. URL template substitution ─────────────────────────────────────────
    url = fn.webhook_url
    remaining = dict(inputs)
    for match in _re.findall(r"\{(\w+)\}", url):
        value = remaining.pop(match, "")
        url = url.replace(f"{{{match}}}", str(value))

    if not _is_ssrf_safe(url):
        return "Error: this tool's webhook URL is no longer allowed."

    # ── 2. Build headers ──────────────────────────────────────────────────────
    headers: dict[str, str] = {"Content-Type": "application/json"}

    # Manual headers (encrypted JSON blob)
    if fn.webhook_headers_encrypted:
        try:
            headers.update(json.loads(decrypt_key(fn.webhook_headers_encrypted)))
        except Exception:
            return "Error: this tool's stored credentials could not be read."

    # Credential-based auth (auto-injected)
    cred_id = getattr(fn, "credential_id", None)
    if cred_id:
        try:
            from app.db.session import AsyncSessionLocal
            from app.models.agent_integration import IntegrationCredential
            async with AsyncSessionLocal() as _db:
                cred = await _db.get(IntegrationCredential, cred_id)
            if cred and cred.encrypted_value:
                value = decrypt_credential(cred.encrypted_value)
                if cred.auth_type == "bearer":
                    headers["Authorization"] = f"Bearer {value}"
                elif cred.auth_type == "api_key":
                    headers[cred.auth_header or "X-Api-Key"] = value
                elif cred.auth_type == "basic":
                    import base64
                    headers["Authorization"] = "Basic " + base64.b64encode(value.encode()).decode()
        except Exception:
            return "Error: could not load the credential for this tool."

    # ── 3. Execute ────────────────────────────────────────────────────────────
    method = (fn.webhook_method or "POST").upper()
    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=False) as client:
            if method in ("POST", "PUT", "PATCH"):
                resp = await client.request(method, url, headers=headers, json=remaining)
            elif method == "DELETE":
                resp = await client.delete(url, headers=headers, params=remaining or None)
            else:  # GET
                resp = await client.get(url, headers=headers, params=remaining or None)
    except Exception:
        return f"Error: could not reach the '{fn.name}' service."

    # ── 4. Normalise response ─────────────────────────────────────────────────
    if resp.status_code >= 500:
        return f"The '{fn.name}' service returned a server error (HTTP {resp.status_code}). Please try again."
    if resp.status_code == 401:
        return f"Authentication failed for '{fn.name}' — the stored credential may be expired."
    if resp.status_code == 403:
        return f"Access denied by '{fn.name}' — the credential does not have permission."
    if resp.status_code == 404:
        return f"'{fn.name}' returned 404 — the requested resource was not found."
    try:
        return json.dumps(resp.json(), indent=2)[:3000]
    except Exception:
        return resp.text[:3000]


def _tool_list_products(store: CommerceStore, products: list[CommerceProduct], inputs: dict) -> str:
    category = (inputs.get("category") or "").strip().lower()
    query = (inputs.get("query") or "").strip().lower()
    filtered = products
    if category:
        filtered = [p for p in filtered if (p.category or "").lower() == category]
    if query:
        filtered = [
            p
            for p in filtered
            if query in p.name.lower() or query in (p.description or "").lower()
        ]
    if not filtered:
        return f"No products found in the '{store.name}' store matching that filter."
    listing = [
        {
            "product_id": str(p.id),
            "name": p.name,
            "price": float(p.price),
            "currency": store.currency,
            "category": p.category,
            "description": p.description or "",
        }
        for p in filtered
    ]
    return json.dumps(listing, indent=2)[:3000]


async def _tool_check_order_status(store: CommerceStore, inputs: dict) -> str:
    """Look up one order by id + email. Both must match — this is the only proof
    of ownership an anonymous chat visitor can offer, so a bare order id is not
    enough to return another customer's order details."""
    from app.db.session import AsyncSessionLocal
    from app.models.commerce import CommercePayment

    order_id = str(inputs.get("order_id", "")).strip()
    email = str(inputs.get("email", "")).strip().lower()
    if not order_id or not email:
        return "Error: both order_id and email are required."
    try:
        order_uuid = uuid.UUID(order_id)
    except ValueError:
        return "No matching order found."

    async with AsyncSessionLocal() as db:
        payment = (
            await db.execute(
                select(CommercePayment).where(
                    CommercePayment.id == order_uuid,
                    CommercePayment.store_id == store.id,
                )
            )
        ).scalar_one_or_none()

    if not payment or (payment.customer_email or "").strip().lower() != email:
        return "No matching order found."

    return json.dumps(
        {
            "order_id": str(payment.id),
            "status": payment.status,
            "amount": float(payment.amount),
            "currency": payment.currency,
            "items": payment.items,
        },
        indent=2,
    )[:3000]


def _tool_buy_product(store: CommerceStore, products: list[CommerceProduct], inputs: dict) -> str:
    product_id = str(inputs.get("product_id", ""))
    match = next((p for p in products if str(p.id) == product_id), None)
    if not match:
        return "Error: unknown or out-of-stock product_id. Call list_products first."
    checkout_url = f"{settings.frontend_url}/store/{store.slug}?product={match.id}"
    return (
        f"Checkout link for '{match.name}' ({store.currency} {float(match.price):.2f}): "
        f"{checkout_url}\nShare this link with the customer to complete payment securely — "
        "do not collect card details in chat."
    )


def _tool_run_code(code: str) -> str:
    if not settings.enable_code_tool:
        return (
            "Error: the code execution tool is disabled on this deployment. "
            "The operator must set ENABLE_CODE_TOOL=true to enable it."
        )
    return _tool_run_code_impl(code)


def _tool_run_code_impl(code: str) -> str:
    """Execute user-supplied Python. NOT A SANDBOX.

    __import__ is exposed in allowed_builtins so `import os` / subprocess /
    socket / urllib all work. Callers can read the container's env vars
    (DATABASE_URL, SECRET_KEY, provider API keys), execute shell as the
    container user, and open outbound TCP to arbitrary hosts. The 10-second
    timeout and 2000-char output cap are DoS mitigations, not security
    boundaries.

    Because of the above, run_code MUST NOT be exposed on the public share
    route (see _PUBLIC_SHARE_TOOL_ALLOWLIST) and treat this tool being enabled
    on any agent as "trusted code execution as the backend container user".
    Replace with a real sandbox (Pyodide / gVisor / ephemeral container) before
    treating it as safe for untrusted input.
    """
    import concurrent.futures
    import contextlib
    import io

    allowed_builtins = {
        "print": print,
        "len": len,
        "range": range,
        "enumerate": enumerate,
        "zip": zip,
        "map": map,
        "filter": filter,
        "sorted": sorted,
        "list": list,
        "dict": dict,
        "set": set,
        "tuple": tuple,
        "str": str,
        "int": int,
        "float": float,
        "bool": bool,
        "abs": abs,
        "round": round,
        "min": min,
        "max": max,
        "sum": sum,
        "type": type,
        "isinstance": isinstance,
        "repr": repr,
        "__import__": __import__,
    }

    def _run() -> str:
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            try:
                exec(code, {"__builtins__": allowed_builtins})  # noqa: S102
            except Exception as e:
                return f"Error: {e}"
        return buf.getvalue()[:2000] or "(no output)"

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(_run)
        try:
            return future.result(timeout=10)
        except concurrent.futures.TimeoutError:
            return "Error: code execution timed out (10s limit)"


_SPA_TELLS = (
    "you need to enable javascript",
    "please enable javascript",
    "javascript is disabled",
    "javascript required",
    "we're sorry but",  # common create-react-app placeholder
    "this app requires javascript",
    "enable js to continue",
)


async def _tool_browse(url: str) -> str:
    from bs4 import BeautifulSoup

    if not _is_ssrf_safe(url):
        return "Error: URL is not allowed (private/internal addresses are blocked)."
    async with httpx.AsyncClient(
        follow_redirects=False, timeout=20, headers={"User-Agent": "ChatCraft-Agent/1.0"}
    ) as client:
        resp = await client.get(url)
    soup = BeautifulSoup(resp.content, "lxml")
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()
    text = " ".join(soup.stripped_strings)[:4000]

    # Many modern sites are client-rendered SPAs — the raw HTML contains only
    # a placeholder like "You need to enable JavaScript to run this app." and
    # returning that to the LLM makes it look like the real page content, which
    # invites hallucination. Detect the pattern and be explicit about it.
    lowered = text.lower().strip()
    if not lowered:
        return f"Could not extract any content from {url}. The response body was empty."
    if len(lowered) < 300 and any(tell in lowered for tell in _SPA_TELLS):
        return (
            f"The page at {url} is a client-side JavaScript application whose "
            f"content isn't in the raw HTML. Only a placeholder message was "
            f"returned: {text!r}. This tool cannot render JavaScript. "
            f"Do NOT invent facts about the site — tell the user the page needs "
            f"a JavaScript-capable browser to read, or suggest an alternative "
            f"source (their sitemap, RSS, or a documented API)."
        )
    return text


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
            from sqlalchemy import select as _select

            from app.db.session import AsyncSessionLocal
            from app.models.user_communication_setting import UserCommunicationSetting

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
            msg.attach(
                MIMEText(
                    f"<html><body><p>{body.replace(chr(10), '<br>')}</p></body></html>", "html"
                )
            )

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
    result = await _tool_send_email({"to": email, "subject": subject, "body": body}, ctx)
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
    if not getattr(settings, "twilio_account_sid", None) or not getattr(
        settings, "twilio_auth_token", None
    ):
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
        "anthropic": [
            "claude-sonnet-5",
            "claude-opus-4-8",
            "claude-fable-5",
            "claude-sonnet-4-6",
            "claude-opus-4-7",
            "claude-haiku-4-5-20251001",
        ],
        "openai": [
            "gpt-5.6-sol",
            "gpt-5.6-terra",
            "gpt-5.6-luna",
            "gpt-4o",
            "gpt-4o-mini",
            "gpt-5",
            "gpt-5-mini",
        ],
        "google": [
            "gemini-3.1-pro",
            "gemini-3.6-flash",
            "gemini-2.5-pro",
            "gemini-2.5-flash",
            "gemini-2.0-flash",
            "gemini-1.5-pro",
        ],
        "groq": [
            "openai/gpt-oss-120b",
            "openai/gpt-oss-20b",
            "qwen/qwen3.6-27b",
            "llama-3.3-70b-versatile",
            "llama-3.1-8b-instant",
        ],
        "deepseek": ["deepseek-v4-pro", "deepseek-v4-flash"],
        "perplexity": ["sonar-pro", "sonar", "sonar-reasoning-pro", "sonar-deep-research"],
        "xai": ["grok-4.5", "grok-4.3", "grok-3", "grok-3-fast", "grok-3-mini"],
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
    if user_keys.get("self_hosted_base_url"):
        lines.append("\nSELF-HOSTED:")
        lines.append("  - self-hosted/<your-model-name> (routes to your configured endpoint)")
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
    if not name or not model:
        return "Error: 'name' and 'model' are required."

    instructions = (inputs.get("instructions") or "").strip() or None
    tools = {
        "web_search": bool(inputs.get("tool_web_search", False)),
        "http": bool(inputs.get("tool_http", False)),
        "email": bool(inputs.get("tool_email", False)),
        "code": bool(inputs.get("tool_code", False)),
        "sms": bool(inputs.get("tool_sms", False)),
        "browser": bool(inputs.get("tool_browser", False)),
        "sheets": bool(inputs.get("tool_sheets", False)),
        "verification": bool(inputs.get("tool_verification", False)),
        "search_kb": bool(inputs.get("tool_search_kb", False)),
        "agent_builder": bool(inputs.get("tool_agent_builder", False)),
    }
    try:
        max_steps = max(1, min(30, int(inputs.get("max_steps") or 10)))
    except (TypeError, ValueError):
        max_steps = 10

    from app.core.logging import logger as _logger
    from app.db.session import AsyncSessionLocal

    try:
        async with AsyncSessionLocal() as session:
            new_agent = Agent(
                user_id=user_id,
                name=name,
                description=(inputs.get("description") or "").strip() or None,
                model=model,
                instructions=instructions,
                tools=tools,
                memory_enabled=bool(inputs.get("memory_enabled", False)),
                max_steps=max_steps,
            )
            session.add(new_agent)
            await session.commit()
            await session.refresh(new_agent)
            agent_id = str(new_agent.id)
        _logger.info(f"Agent Builder created agent '{name}' (id={agent_id}) for user {user_id}")
        return f"SUCCESS: Agent '{name}' has been created. Agent ID: {agent_id}. Tell the user to click Refresh on the Agents page to see it."
    except Exception as exc:
        _logger.error(f"Agent Builder failed to create agent '{name}': {exc}")
        return f"Error creating agent: {exc}"


async def _tool_search_kb(inputs: dict, ctx: dict) -> str:
    """Search this agent's private knowledge base (per-agent RAG)."""
    query = (inputs.get("query") or "").strip()
    if not query:
        return "Error: query is required"

    agent_id_str = ctx.get("agent_id")
    if not agent_id_str:
        return "Error: no agent context available for KB search"

    try:
        top_k = int(inputs.get("top_k") or 5)
    except (TypeError, ValueError):
        top_k = 5
    top_k = max(1, min(10, top_k))

    from app.db.session import AsyncSessionLocal
    from app.services.kb.agent_rag import AgentRAGService

    try:
        agent_uuid = uuid.UUID(agent_id_str)
    except ValueError:
        return "Error: malformed agent_id"

    async with AsyncSessionLocal() as db:
        rag = AgentRAGService(db)
        try:
            _, chunks = await rag.query(
                agent_id=agent_uuid,
                user_message=query,
                top_k=top_k,
                threshold=0.3,
                debug=True,
            )
        except Exception as exc:
            # Most common failure is the OpenAI embed call (no key / rate limit).
            # Return a clean, model-actionable message instead of the raw
            # provider SDK stack, and log the real error for operators.
            from app.core.logging import logger as _logger

            msg = str(exc)
            _logger.warning(f"search_kb query failed for agent {agent_uuid}: {exc!r}")
            if "api_key" in msg.lower() or "401" in msg or "authentication" in msg.lower():
                return (
                    "Knowledge base is unavailable: the embedding service is not "
                    "configured on this deployment. Fall back to your general knowledge "
                    "and tell the user the KB search couldn't run."
                )
            if "rate" in msg.lower() and "limit" in msg.lower():
                return (
                    "Knowledge base is temporarily rate-limited by the embedding "
                    "service. Try again in a moment or fall back to general knowledge."
                )
            return (
                "Knowledge base search failed. Fall back to your general knowledge "
                "and let the user know retrieval didn't run this time."
            )

    if not chunks:
        return "No relevant passages found in the knowledge base."

    parts = []
    for i, c in enumerate(chunks, 1):
        parts.append(
            f"[{i}] {c.document_name} (similarity {c.similarity:.2f})\n{c.content.strip()}"
        )
    return "\n\n---\n\n".join(parts)


def _tool_calculate_faraid(inputs: dict) -> str:
    """Deterministic Faraid (Islamic inheritance) calculation. Never calculates
    anything itself beyond input validation — all arithmetic happens in
    app.services.faraid.engine, on Fraction/Decimal, with no LLM involved."""
    import json

    from pydantic import ValidationError

    from app.schemas.faraid import FaraidCalculateRequest
    from app.services.faraid.engine import calculate

    try:
        request = FaraidCalculateRequest.model_validate(inputs)
    except ValidationError as exc:
        errors = [f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors()]
        return (
            "Error: invalid input — ask the user for corrected/missing information, do not guess:\n"
            + "\n".join(errors)
        )
    except ValueError as exc:
        return f"Error: invalid input — ask the user to correct this: {exc}"

    try:
        result = calculate(request)
    except ValueError as exc:
        return f"Error: {exc}"

    return json.dumps(result.model_dump(), indent=2)


# ─── System prompt builder ────────────────────────────────────────────────────


async def _build_system_prompt(
    agent: Agent,
    db: DBSession,
    user_id: uuid.UUID | None = None,
) -> str:
    parts: list[str] = []

    if agent.chatbot_id:
        result = await db.execute(select(ChatbotConfig).where(ChatbotConfig.id == agent.chatbot_id))
        chatbot = result.scalar_one_or_none()
        if chatbot and chatbot.system_prompt:
            parts.append(chatbot.system_prompt)

    if agent.instructions:
        parts.append(agent.instructions)

    if not parts:
        parts.append(
            "You are a helpful AI agent. Use the available tools to complete tasks thoroughly and accurately."
        )

    # Default tone for every agent, appended right after its own persona so
    # it can't get lost further down the prompt. Small/self-hosted models in
    # particular default to a stiff "I am an AI specialized in X" self-intro
    # and a numbered-headers-and-bullets report for every reply, even a
    # simple greeting. This doesn't ask the model to drop structure where
    # it's actually useful (a results table, a calculation breakdown) — only
    # to stop reaching for it by default.
    parts.append(
        "COMMUNICATION STYLE:\n"
        "1. Talk like a knowledgeable person having a conversation, not a "
        "formal report. Skip stock self-introductions like 'I am an AI "
        "specialized in...' — just greet the user and respond to what they "
        "actually said.\n"
        "2. Match formatting to the content. A greeting or a short answer "
        "should just be a sentence or two of plain text. Save headers, "
        "numbered sections, and bullet lists for when they genuinely help — "
        "e.g. presenting calculated results, a breakdown with several parts, "
        "or a real list of distinct options.\n"
        "3. Don't restate your full capability list unless the user actually "
        "asked what you can do. Answer the question in front of you.\n"
        "4. Be specific, not generic. Use the actual details the user gave "
        "you (names, numbers, relationships, whatever they told you) in your "
        "answer instead of a generic template reply that could apply to "
        "anyone. If you need more information before you can answer "
        "precisely, ask for exactly what's missing rather than giving a "
        "vague general-purpose answer around the gap."
    )

    # Global anti-hallucination stanza — appended to EVERY agent's prompt when
    # any tool is enabled. Weak models (Llama 8B especially) will fabricate
    # plausible-sounding emails, prices, phone numbers, and quotes when a tool
    # returns "no results" or a JavaScript-app placeholder. Tell them not to.
    agent_tools_cfg = agent.tools or {}
    if any(agent_tools_cfg.values()):
        parts.append(
            "GROUNDING RULES:\n"
            "1. When a tool returns 'no results', an error, or an unhelpful "
            "placeholder (like 'You need to enable JavaScript'), say so plainly. "
            "Do NOT fill the gap with plausible-sounding invented facts.\n"
            "2. NEVER fabricate specific facts you didn't retrieve: email "
            "addresses, phone numbers, prices, dates, URLs, product names, "
            "quoted text. If you don't have it, say you don't have it.\n"
            "3. Prefer 'I couldn't find that — here's what I tried' over "
            "'here's my best guess'.\n"
            "4. When citing information from a tool, quote the source (URL, "
            "document name, or tool name) so the user can verify."
        )

    # If the agent has ready KB documents AND the search_kb tool is enabled,
    # tell the model the KB exists so it knows to search it.
    if agent_tools_cfg.get("search_kb"):
        kb_result = await db.execute(
            select(func.count(AgentKnowledgeDocument.id)).where(
                AgentKnowledgeDocument.agent_id == agent.id,
                AgentKnowledgeDocument.status == DocumentStatus.ready,
            )
        )
        kb_doc_count = kb_result.scalar_one() or 0
        if kb_doc_count > 0:
            parts.append(
                f"You have access to a private knowledge base containing {kb_doc_count} "
                f"indexed document{'s' if kb_doc_count != 1 else ''}. When the user's request "
                f"could plausibly be answered from those documents (facts, policies, product "
                f"details, prior context), call the search_kb tool BEFORE relying on your own "
                f"general knowledge. Cite the source document name when you use retrieved content."
            )

    if agent_tools_cfg.get("faraid"):
        parts.append(
            "FARAID (ISLAMIC INHERITANCE) RULES:\n"
            "1. You have the calculate_faraid tool. It is the ONLY source of truth for shares — "
            "you must NEVER compute, estimate, or restate a share from memory or general "
            "knowledge, even a simple one.\n"
            "2. Before calling the tool, collect every piece of information it needs by asking "
            "the user directly: the decedent's gender, the estate value (and any debts, "
            "funeral costs, or bequest), and — for each heir category that could plausibly "
            "apply — whether that heir survived them (or how many, for counted heirs like sons "
            "or siblings).\n"
            "3. NEVER assume an heir is absent because the user didn't mention them. Silence is "
            "not an answer — ask explicitly, especially about heirs that are easy to forget "
            "(grandparents, siblings, multiple wives).\n"
            "4. Only call calculate_faraid once you have real answers, not placeholders. If the "
            "tool reports invalid input, relay exactly what's wrong and ask the user to correct "
            "it — do not silently substitute a guess.\n"
            "5. After the tool returns, explain the result in plain language: who gets what "
            "(fraction, percentage, and amount), why anyone was blocked, and any warnings "
            "(awl/radd adjustments, capped bequest, unresolved classical corner cases). Always "
            "include the tool's disclaimer that this is not a fatwa or legal advice."
        )

    if agent.suggestions_enabled:
        parts.append(
            "SUGGESTED REPLIES:\n"
            "After every response, end your message with 3-4 short suggested "
            "follow-up questions or actions tailored to what was just discussed "
            "— things the user would plausibly want to ask or do next. Use this "
            "exact format (including the delimiters):\n\n"
            "<<<RICH>>>\n"
            '{"type":"quick_replies","replies":["Suggestion 1","Suggestion 2","Suggestion 3"]}\n'
            "<<<END>>>\n\n"
            "Keep each suggestion under 6 words. Only use this block for "
            "suggested replies, and only once per response, at the very end."
        )

    # Agent Builder mode: prepend strict tool-use instructions so the model
    # doesn't hallucinate steps or generate code instead of calling tools.
    # Weak models (Llama 8B, etc.) will happily call create_agent on any
    # input including greetings — so lead with the "wait for intent" rule
    # before mentioning any tools.
    agent_tools = agent.tools or {}
    if agent_tools.get("agent_builder"):
        parts.insert(
            0,
            (
                "You help users create new AI agents by calling tools. You do NOT "
                "create agents on your own initiative — you wait for the user to "
                "describe what they want, then call the tools.\n\n"
                "STRICT RULES:\n"
                "1. NEVER call create_agent until the user has told you at least: "
                "(a) what the new agent is for, and (b) a name for it. If either "
                "is missing, ASK — do not guess, do not invent, do not proceed.\n"
                "2. For greetings ('hi', 'hello', 'how are you'), chit-chat, or "
                "any vague/short message, just reply conversationally and ask what "
                "kind of agent they want to build. Do NOT call any tools.\n"
                "3. NEVER fabricate an agent name, description, or tool set. If the "
                "user hasn't given you a value, ask for it.\n"
                "4. Only after you have an explicit description AND an explicit "
                "name: call list_available_models, then call create_agent with the "
                "user's exact parameters.\n"
                "5. Do NOT write Python, JavaScript, or any other code. Do NOT "
                "fake tool results or fabricate steps like 'authenticated' or "
                "'retrieved user'."
            ),
        )

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
                content = msg.get("content", "")
                # Only load turns with plain string content — skip tool-call turns
                # that carry content block lists (they'd break OpenAI-compat providers).
                if isinstance(content, str) and content.strip():
                    history.append({"role": msg["role"], "content": content})
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
    if agent.webhook_url and _is_ssrf_safe(agent.webhook_url):
        try:
            payload = {
                "agent_id": str(agent.id),
                "agent_name": agent.name,
                "messages": messages,
                "tool_calls": tool_call_count,
                "timestamp": datetime.now(UTC).isoformat(),
            }
            async with httpx.AsyncClient(timeout=5) as client:
                await client.post(agent.webhook_url, json=payload)
        except Exception:
            pass


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


async def _get_owned_agent(agent_id: uuid.UUID, user_id: uuid.UUID, db: DBSession) -> Agent:
    result = await db.execute(select(Agent).where(Agent.id == agent_id, Agent.user_id == user_id))
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


async def _get_owned_chatbot(
    chatbot_id: uuid.UUID, user_id: uuid.UUID, db: DBSession
) -> ChatbotConfig:
    result = await db.execute(
        select(ChatbotConfig).where(
            ChatbotConfig.id == chatbot_id, ChatbotConfig.user_id == user_id
        )
    )
    chatbot = result.scalar_one_or_none()
    if not chatbot:
        raise HTTPException(status_code=404, detail="Chatbot not found")
    return chatbot
