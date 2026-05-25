"""
Voice Lab API — ElevenLabs voice cloning and conversational agent management.
"""
import io
from typing import Annotated

import httpx
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.config import settings
from app.core.dependencies import CurrentUser

router = APIRouter(prefix="/api/v1/voice-lab", tags=["voice-lab"])

_EL_BASE = "https://api.elevenlabs.io/v1"


def _el_headers() -> dict:
    if not settings.elevenlabs_api_key:
        raise HTTPException(status_code=503, detail="ElevenLabs API key not configured")
    return {"xi-api-key": settings.elevenlabs_api_key}


# ─── Voice management ────────────────────────────────────────────────────────

@router.get("/voices")
async def list_voices(current_user: CurrentUser):
    """List all voices (shared + cloned) available on the ElevenLabs account."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{_EL_BASE}/voices", headers=_el_headers())
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    data = resp.json()
    voices = [
        {
            "id": v["voice_id"],
            "name": v["name"],
            "category": v.get("category", "premade"),
            "labels": v.get("labels", {}),
            "preview_url": v.get("preview_url"),
            "cloned": v.get("category") == "cloned",
        }
        for v in data.get("voices", [])
    ]
    return {"success": True, "data": voices}


@router.post("/voices/clone")
async def clone_voice(
    current_user: CurrentUser,
    name: Annotated[str, Form()],
    description: Annotated[str, Form()] = "",
    files: list[UploadFile] = File(...),
):
    """Create a cloned voice from uploaded audio files (wav/mp3, 1–25 files)."""
    if len(files) > 25:
        raise HTTPException(status_code=400, detail="Maximum 25 audio files per clone")

    form_data = [("name", (None, name)), ("description", (None, description))]
    for f in files:
        content = await f.read()
        form_data.append(("files", (f.filename, content, f.content_type or "audio/mpeg")))

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{_EL_BASE}/voices/add",
            headers=_el_headers(),
            files=form_data,  # type: ignore[arg-type]
        )
    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    data = resp.json()
    return {"success": True, "data": {"voice_id": data.get("voice_id"), "name": name}}


@router.delete("/voices/{voice_id}")
async def delete_voice(voice_id: str, current_user: CurrentUser):
    """Delete a cloned voice."""
    async with httpx.AsyncClient() as client:
        resp = await client.delete(
            f"{_EL_BASE}/voices/{voice_id}",
            headers=_el_headers(),
        )
    if resp.status_code not in (200, 204):
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return {"success": True}


# ─── Voice preview ────────────────────────────────────────────────────────────

class PreviewRequest(BaseModel):
    voice_id: str
    text: str
    model_id: str = "eleven_multilingual_v2"
    stability: float = 0.5
    similarity_boost: float = 0.75


@router.post("/preview")
async def preview_voice(body: PreviewRequest, current_user: CurrentUser):
    """Generate a TTS preview for the given voice and return audio stream."""
    payload = {
        "text": body.text,
        "model_id": body.model_id,
        "voice_settings": {
            "stability": body.stability,
            "similarity_boost": body.similarity_boost,
        },
    }
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{_EL_BASE}/text-to-speech/{body.voice_id}",
            headers={**_el_headers(), "Accept": "audio/mpeg"},
            json=payload,
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    return StreamingResponse(
        io.BytesIO(resp.content),
        media_type="audio/mpeg",
        headers={"Content-Disposition": "inline; filename=preview.mp3"},
    )


# ─── Conversational Agents ────────────────────────────────────────────────────

class AgentRequest(BaseModel):
    name: str
    voice_id: str
    system_prompt: str = "You are a helpful assistant."
    first_message: str = "Hello! How can I help you today?"
    language: str = "en"


@router.get("/agents")
async def list_agents(current_user: CurrentUser):
    """List ElevenLabs conversational agents."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{_EL_BASE}/convai/agents",
            headers=_el_headers(),
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    data = resp.json()
    agents = [
        {
            "id": a["agent_id"],
            "name": a["name"],
            "voice_id": a.get("conversation_config", {}).get("tts", {}).get("voice_id"),
            "created_at": a.get("created_at_unix_secs"),
        }
        for a in data.get("agents", [])
    ]
    return {"success": True, "data": agents}


@router.post("/agents")
async def create_agent(body: AgentRequest, current_user: CurrentUser):
    """Create an ElevenLabs conversational agent and return its Agent ID."""
    payload = {
        "name": body.name,
        "conversation_config": {
            "agent": {
                "prompt": {
                    "prompt": body.system_prompt,
                    "llm": "claude-sonnet-4-6",
                    "temperature": 0.7,
                    "max_tokens": 1024,
                },
                "first_message": body.first_message,
                "language": body.language,
            },
            "tts": {
                "voice_id": body.voice_id,
                "model_id": "eleven_turbo_v2",
                "optimize_streaming_latency": 3,
            },
        },
        "platform_settings": {
            "auth": {"enable_auth": False},
        },
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{_EL_BASE}/convai/agents/create",
            headers=_el_headers(),
            json=payload,
        )
    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    data = resp.json()
    return {
        "success": True,
        "data": {
            "agent_id": data.get("agent_id"),
            "name": body.name,
            "widget_url": f"https://elevenlabs.io/convai/widget/{data.get('agent_id')}",
        },
    }


@router.get("/agents/{agent_id}")
async def get_agent(agent_id: str, current_user: CurrentUser):
    """Get full ElevenLabs agent config (security, client events, etc.)."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{_EL_BASE}/convai/agents/{agent_id}",
            headers=_el_headers(),
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    data = resp.json()
    conv = data.get("conversation_config", {})
    platform = data.get("platform_settings", {})
    return {
        "success": True,
        "data": {
            "agent_id": data.get("agent_id"),
            "name": data.get("name"),
            "system_prompt": conv.get("agent", {}).get("prompt", {}).get("prompt", ""),
            "first_message": conv.get("agent", {}).get("first_message", ""),
            "language": conv.get("agent", {}).get("language", "en"),
            "voice_id": conv.get("tts", {}).get("voice_id"),
            "auth_enabled": platform.get("auth", {}).get("enable_auth", False),
            "allowed_origins": platform.get("auth", {}).get("allowlist", []),
            "client_events": conv.get("client_events", []),
        },
    }


class AgentUpdateRequest(BaseModel):
    name: str | None = None
    system_prompt: str | None = None
    first_message: str | None = None
    language: str | None = None
    voice_id: str | None = None
    auth_enabled: bool | None = None
    allowed_origins: list[str] | None = None
    client_events: list[str] | None = None


@router.patch("/agents/{agent_id}")
async def update_agent(agent_id: str, body: AgentUpdateRequest, current_user: CurrentUser):
    """Update ElevenLabs agent security settings and client events."""
    # Fetch current config first
    async with httpx.AsyncClient() as client:
        get_resp = await client.get(f"{_EL_BASE}/convai/agents/{agent_id}", headers=_el_headers())
    if get_resp.status_code != 200:
        raise HTTPException(status_code=get_resp.status_code, detail=get_resp.text)
    current = get_resp.json()

    conv = current.get("conversation_config", {})
    platform = current.get("platform_settings", {})
    agent_cfg = conv.get("agent", {})
    prompt_cfg = agent_cfg.get("prompt", {})
    tts_cfg = conv.get("tts", {})

    if body.system_prompt is not None:
        prompt_cfg["prompt"] = body.system_prompt
    if body.first_message is not None:
        agent_cfg["first_message"] = body.first_message
    if body.language is not None:
        agent_cfg["language"] = body.language
    if body.voice_id is not None:
        tts_cfg["voice_id"] = body.voice_id
    if body.client_events is not None:
        conv["client_events"] = body.client_events

    agent_cfg["prompt"] = prompt_cfg
    conv["agent"] = agent_cfg
    conv["tts"] = tts_cfg

    auth_cfg = platform.get("auth", {})
    if body.auth_enabled is not None:
        auth_cfg["enable_auth"] = body.auth_enabled
    if body.allowed_origins is not None:
        auth_cfg["allowlist"] = [o.strip() for o in body.allowed_origins if o.strip()]
    platform["auth"] = auth_cfg

    payload: dict = {"conversation_config": conv, "platform_settings": platform}
    if body.name is not None:
        payload["name"] = body.name

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.patch(
            f"{_EL_BASE}/convai/agents/{agent_id}",
            headers=_el_headers(),
            json=payload,
        )
    if resp.status_code not in (200, 204):
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return {"success": True}


@router.delete("/agents/{agent_id}")
async def delete_agent(agent_id: str, current_user: CurrentUser):
    """Delete an ElevenLabs conversational agent."""
    async with httpx.AsyncClient() as client:
        resp = await client.delete(
            f"{_EL_BASE}/convai/agents/{agent_id}",
            headers=_el_headers(),
        )
    if resp.status_code not in (200, 204):
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return {"success": True}


@router.get("/agents/{agent_id}/conversations")
async def list_agent_conversations(agent_id: str, current_user: CurrentUser):
    """Fetch conversation history for an ElevenLabs conversational agent."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{_EL_BASE}/convai/conversations",
            headers=_el_headers(),
            params={"agent_id": agent_id, "page_size": 50},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    data = resp.json()
    conversations = [
        {
            "id": c.get("conversation_id"),
            "status": c.get("status"),
            "start_time": c.get("start_time_unix_secs"),
            "call_duration_secs": c.get("call_duration_secs"),
            "message_count": c.get("metadata", {}).get("conversation_initiation_client_data", {}).get("message_count"),
            "cost": c.get("metadata", {}).get("usage", {}).get("cost_tokens"),
        }
        for c in data.get("conversations", [])
    ]
    return {"success": True, "data": conversations}


@router.get("/agents/{agent_id}/conversations/{conversation_id}")
async def get_conversation_transcript(agent_id: str, conversation_id: str, current_user: CurrentUser):
    """Get the full transcript and metadata for a single conversation."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{_EL_BASE}/convai/conversations/{conversation_id}",
            headers=_el_headers(),
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    data = resp.json()
    transcript = data.get("transcript", [])
    return {
        "success": True,
        "data": {
            "conversation_id": conversation_id,
            "status": data.get("status"),
            "duration_secs": data.get("metadata", {}).get("call_duration_secs"),
            "transcript": [
                {"role": t.get("role"), "message": t.get("message"), "time_in_call_secs": t.get("time_in_call_secs")}
                for t in transcript
            ],
        },
    }


@router.get("/stats")
async def get_voice_stats(current_user: CurrentUser):
    """Return aggregate stats across all this user's conversational agents."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{_EL_BASE}/convai/agents", headers=_el_headers())
    if resp.status_code != 200:
        return {"success": True, "data": {"agent_count": 0, "total_conversations": 0}}
    agents = resp.json().get("agents", [])
    return {
        "success": True,
        "data": {
            "agent_count": len(agents),
        },
    }
