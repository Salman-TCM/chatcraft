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


# ─── OpenAI Realtime ──────────────────────────────────────────────────────────

@router.websocket("/openai/{chatbot_id}")
async def openai_realtime(
    websocket: WebSocket,
    chatbot_id: str,
    db: DBSession,
    model: str = Query(default="gpt-4o-realtime-preview"),
    voice: str = Query(default="alloy"),
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
            # Inject session configuration with chatbot system prompt
            system_prompt = getattr(chatbot, "system_prompt", None) or "You are a helpful assistant."
            session_update = {
                "type": "session.update",
                "session": {
                    "modalities": ["text", "audio"],
                    "instructions": system_prompt,
                    "voice": voice if voice in OPENAI_VOICES else "alloy",
                    "input_audio_format": "pcm16",
                    "output_audio_format": "pcm16",
                    "turn_detection": {"type": "server_vad"},
                },
            }
            await upstream.send(json.dumps(session_update))

            # Bidirectional proxy
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
            session_update = {
                "type": "session.update",
                "session": {
                    "modalities": ["text", "audio"],
                    "instructions": system_prompt,
                    "voice": voice if voice in XAI_VOICES else "Eve",
                    "turn_detection": {"type": "server_vad"},
                },
            }
            await upstream.send(json.dumps(session_update))
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
