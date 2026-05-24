"""
Realtime API WebSocket proxy.

Proxies WebSocket connections from the browser to:
  - OpenAI Realtime API (10 voices, function calling, MCP tools)
  - xAI Grok Realtime API (5 voices: Eve, Ara, Leo, Rex, Sal)

Client connects to:
  ws://.../api/v1/realtime/openai/{chatbot_id}?model=gpt-4o-realtime-preview
  ws://.../api/v1/realtime/grok/{chatbot_id}

The proxy injects the chatbot's system prompt and voice configuration on session
creation, then forwards all subsequent messages bidirectionally.
"""
import asyncio
import json
import uuid

import websockets
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.core.config import settings
from app.core.dependencies import DBSession
from app.models.chatbot_config import ChatbotConfig

router = APIRouter(prefix="/api/v1/realtime", tags=["realtime"])

OPENAI_VOICES = [
    "alloy", "echo", "fable", "onyx", "nova",
    "shimmer", "ash", "ballad", "coral", "sage",
]
XAI_VOICES = ["Eve", "Ara", "Leo", "Rex", "Sal"]

_WEB_SEARCH_TOOL = {
    "type": "function",
    "name": "web_search",
    "description": "Search the web for up-to-date information. Use when the user asks about current events, facts, or anything you're unsure about.",
    "parameters": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "The search query"},
        },
        "required": ["query"],
    },
}


async def _do_web_search(query: str) -> str:
    """Execute a web search and return a text result summary."""
    try:
        import httpx
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.search.brave.com/res/v1/web/search",
                headers={"Accept": "application/json", "X-Subscription-Token": settings.brave_search_api_key or ""},
                params={"q": query, "count": 5},
            )
        if resp.status_code == 200:
            data = resp.json()
            results = data.get("web", {}).get("results", [])
            snippets = [f"{r.get('title', '')}: {r.get('description', '')}" for r in results[:5]]
            return "\n\n".join(snippets) or "No results found."
    except Exception:
        pass
    # Fallback: return empty to not block voice
    return f"Unable to search for: {query}"


# ─── OpenAI Realtime ──────────────────────────────────────────────────────────

@router.websocket("/openai/{chatbot_id}")
async def openai_realtime(
    websocket: WebSocket,
    chatbot_id: str,
    db: DBSession,
    model: str = Query(default="gpt-4o-realtime-preview"),
    voice: str = Query(default="alloy"),
    web_search: bool = Query(default=False),
):
    """Proxy WebSocket to OpenAI Realtime API."""
    if not settings.openai_api_key:
        await websocket.close(code=1008, reason="OpenAI API key not configured")
        return

    chatbot = await _get_chatbot(chatbot_id, db)
    if not chatbot:
        await websocket.close(code=1008, reason="Chatbot not found")
        return

    await websocket.accept()

    openai_url = f"wss://api.openai.com/v1/realtime?model={model}"
    openai_headers = {
        "Authorization": f"Bearer {settings.openai_api_key}",
        "OpenAI-Beta": "realtime=v1",
    }

    try:
        async with websockets.connect(openai_url, additional_headers=openai_headers) as upstream:
            system_prompt = getattr(chatbot, "system_prompt", None) or "You are a helpful assistant."
            session: dict = {
                "modalities": ["text", "audio"],
                "instructions": system_prompt,
                "voice": voice if voice in OPENAI_VOICES else "alloy",
                "input_audio_format": "pcm16",
                "output_audio_format": "pcm16",
                "turn_detection": {"type": "server_vad"},
            }
            if web_search:
                session["tools"] = [_WEB_SEARCH_TOOL]
                session["tool_choice"] = "auto"
            await upstream.send(json.dumps({"type": "session.update", "session": session}))

            if web_search:
                await _proxy_with_tools(websocket, upstream)
            else:
                await _proxy(websocket, upstream)

    except websockets.exceptions.ConnectionClosed:
        pass
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        try:
            await websocket.send_json({"type": "error", "error": {"message": str(exc)}})
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


# ─── xAI Grok Realtime ────────────────────────────────────────────────────────

@router.websocket("/grok/{chatbot_id}")
async def grok_realtime(
    websocket: WebSocket,
    chatbot_id: str,
    db: DBSession,
    voice: str = Query(default="Eve"),
    web_search: bool = Query(default=False),
):
    """Proxy WebSocket to xAI Grok Realtime API."""
    if not settings.xai_api_key:
        await websocket.close(code=1008, reason="xAI API key not configured")
        return

    chatbot = await _get_chatbot(chatbot_id, db)
    if not chatbot:
        await websocket.close(code=1008, reason="Chatbot not found")
        return

    await websocket.accept()

    grok_url = "wss://api.x.ai/v1/realtime?model=grok-3-realtime"
    grok_headers = {
        "Authorization": f"Bearer {settings.xai_api_key}",
    }

    try:
        async with websockets.connect(grok_url, additional_headers=grok_headers) as upstream:
            system_prompt = getattr(chatbot, "system_prompt", None) or "You are a helpful assistant."
            session: dict = {
                "modalities": ["text", "audio"],
                "instructions": system_prompt,
                "voice": voice if voice in XAI_VOICES else "Eve",
                "turn_detection": {"type": "server_vad"},
            }
            # Grok has built-in live search — enable it when requested
            if web_search:
                session["tools"] = [{"type": "live_search"}]
            await upstream.send(json.dumps({"type": "session.update", "session": session}))
            await _proxy(websocket, upstream)

    except websockets.exceptions.ConnectionClosed:
        pass
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        try:
            await websocket.send_json({"type": "error", "error": {"message": str(exc)}})
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


# ─── Metadata endpoints ───────────────────────────────────────────────────────

@router.get("/voices")
async def list_voices():
    """Return available voices for each Realtime provider."""
    return {
        "success": True,
        "data": {
            "openai": OPENAI_VOICES,
            "grok": XAI_VOICES,
        },
    }


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _get_chatbot(chatbot_id: str, db: DBSession) -> ChatbotConfig | None:
    try:
        cid = uuid.UUID(chatbot_id)
    except ValueError:
        return None
    result = await db.execute(select(ChatbotConfig).where(ChatbotConfig.id == cid))
    return result.scalar_one_or_none()


async def _proxy(
    client: WebSocket,
    upstream: websockets.WebSocketClientProtocol,  # type: ignore[name-defined]
) -> None:
    """Forward messages between client WebSocket and upstream WebSocket."""

    async def client_to_upstream():
        try:
            while True:
                data = await client.receive_text()
                await upstream.send(data)
        except (WebSocketDisconnect, Exception):
            pass

    async def upstream_to_client():
        try:
            async for message in upstream:
                if isinstance(message, bytes):
                    await client.send_bytes(message)
                else:
                    await client.send_text(message)
        except Exception:
            pass

    await asyncio.gather(client_to_upstream(), upstream_to_client())


async def _proxy_with_tools(
    client: WebSocket,
    upstream: websockets.WebSocketClientProtocol,  # type: ignore[name-defined]
) -> None:
    """Bidirectional proxy that intercepts OpenAI Realtime tool-call events.

    When OpenAI calls web_search, the proxy executes the search and submits
    the result back before asking OpenAI to continue the response.
    """
    # Track in-progress function calls: call_id -> {name, args_buffer}
    pending_calls: dict[str, dict] = {}

    async def client_to_upstream():
        try:
            while True:
                data = await client.receive_text()
                await upstream.send(data)
        except (WebSocketDisconnect, Exception):
            pass

    async def upstream_to_client():
        try:
            async for message in upstream:
                if isinstance(message, bytes):
                    await client.send_bytes(message)
                    continue
                try:
                    event = json.loads(message)
                except Exception:
                    await client.send_text(message)
                    continue

                etype = event.get("type", "")

                if etype == "response.function_call_arguments.delta":
                    call_id = event.get("call_id", "")
                    if call_id not in pending_calls:
                        pending_calls[call_id] = {"name": event.get("name", ""), "args": ""}
                    pending_calls[call_id]["args"] += event.get("delta", "")
                    await client.send_text(message)

                elif etype == "response.function_call_arguments.done":
                    call_id = event.get("call_id", "")
                    name = event.get("name") or pending_calls.get(call_id, {}).get("name", "")
                    raw_args = event.get("arguments") or pending_calls.get(call_id, {}).get("args", "{}")
                    pending_calls.pop(call_id, None)
                    await client.send_text(message)

                    if name == "web_search":
                        try:
                            args = json.loads(raw_args)
                            query = args.get("query", "")
                        except Exception:
                            query = ""
                        result = await _do_web_search(query)
                        # Submit function output back to OpenAI
                        await upstream.send(json.dumps({
                            "type": "conversation.item.create",
                            "item": {
                                "type": "function_call_output",
                                "call_id": call_id,
                                "output": result,
                            },
                        }))
                        # Ask OpenAI to continue generating the response
                        await upstream.send(json.dumps({"type": "response.create"}))
                else:
                    await client.send_text(message)
        except Exception:
            pass

    await asyncio.gather(client_to_upstream(), upstream_to_client())
