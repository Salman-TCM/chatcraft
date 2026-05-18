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
