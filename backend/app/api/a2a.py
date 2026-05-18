"""
Google A2A (Agent-to-Agent) Protocol endpoints.

Implements:
  GET  /a2a/widgets/{widget_id}/agent.json  — Agent Card discovery
  POST /a2a/widgets/{widget_id}             — JSON-RPC 2.0 message endpoint
"""
import uuid

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select

from app.core.config import settings
from app.core.dependencies import DBSession
from app.models.chatbot_config import ChatbotConfig
from app.services.llm.router import LLMRouter
from app.services.llm.base import ChatMessage

router = APIRouter(prefix="/a2a", tags=["a2a"])


@router.get("/widgets/{widget_id}/agent.json")
async def agent_card(widget_id: str, db: DBSession):
    """
    A2A Agent Card — describes the agent's capabilities.
    Authenticated agents discover this endpoint to learn how to talk to the bot.
    """
    chatbot = await _get_chatbot(widget_id, db)
    base = settings.api_base_url.rstrip("/")

    card = {
        "name": chatbot.name,
        "description": getattr(chatbot, "description", None) or f"{chatbot.name} powered by ChatCraft AI",
        "url": f"{base}/a2a/widgets/{widget_id}",
        "version": "1.0.0",
        "provider": {
            "organization": "ChatCraft AI",
            "url": settings.frontend_url,
        },
        "capabilities": {
            "streaming": False,
            "pushNotifications": False,
            "stateTransitionHistory": False,
        },
        "authentication": {
            "schemes": ["none"],
        },
        "defaultInputModes": ["text/plain"],
        "defaultOutputModes": ["text/plain"],
        "skills": [
            {
                "id": "chat",
                "name": "Conversational AI",
                "description": "General purpose AI chat with knowledge base support",
                "tags": ["chat", "ai", "support"],
                "examples": ["How can you help me?", "What do you know about?"],
                "inputModes": ["text/plain"],
                "outputModes": ["text/plain"],
            }
        ],
    }
    return JSONResponse(content=card)


@router.post("/widgets/{widget_id}")
async def a2a_message(widget_id: str, request: Request, db: DBSession):
    """
    A2A message endpoint (JSON-RPC 2.0).
    Accepts method=message/send, routes through the chatbot's LLM.
    """
    try:
        body = await request.json()
    except Exception:
        return _rpc_error(None, -32700, "Parse error")

    rpc_id = body.get("id")
    if body.get("jsonrpc") != "2.0":
        return _rpc_error(rpc_id, -32600, "Invalid Request — jsonrpc must be '2.0'")

    method = body.get("method", "")
    if method not in ("message/send", "tasks/send"):
        return _rpc_error(rpc_id, -32601, f"Method not found: {method}")

    params = body.get("params", {})
    message = params.get("message", {})
    parts = message.get("parts", [])
    user_text = " ".join(
        p.get("text", "") for p in parts if p.get("type") == "text"
    ).strip()

    if not user_text:
        return _rpc_error(rpc_id, -32602, "Invalid params — no text parts found")

    chatbot = await _get_chatbot(widget_id, db)

    system_prompt = getattr(chatbot, "system_prompt", None) or "You are a helpful assistant."
    llm = LLMRouter(
        model=chatbot.default_model or "claude-sonnet-4-6",
        fallback_model=chatbot.fallback_model,
    )

    messages = [
        ChatMessage(role="system", content=system_prompt),
        ChatMessage(role="user", content=user_text),
    ]
    response = await llm.complete(messages, max_tokens=1024)

    return JSONResponse(content={
        "jsonrpc": "2.0",
        "id": rpc_id,
        "result": {
            "id": str(uuid.uuid4()),
            "status": {"state": "completed"},
            "artifacts": [
                {
                    "parts": [{"type": "text", "text": response.content}],
                    "index": 0,
                }
            ],
        },
    })


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _get_chatbot(widget_id: str, db: DBSession) -> ChatbotConfig:
    try:
        cid = uuid.UUID(widget_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Widget not found")
    result = await db.execute(
        select(ChatbotConfig).where(ChatbotConfig.id == cid)
    )
    chatbot = result.scalar_one_or_none()
    if not chatbot:
        raise HTTPException(status_code=404, detail="Widget not found")
    return chatbot


def _rpc_error(rpc_id: int | str | None, code: int, message: str) -> JSONResponse:
    return JSONResponse(
        content={
            "jsonrpc": "2.0",
            "id": rpc_id,
            "error": {"code": code, "message": message},
        },
        status_code=200,  # JSON-RPC always returns 200
    )
