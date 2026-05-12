"""
ElevenLabs voice service — TTS (streaming + cache), STT, and voice listing.

TTS cache strategy:
  1. Hash (text + voice_id + model_id) → Redis key.
  2. On hit: redirect client to cached S3 URL (avoids re-generating).
  3. On miss: stream from ElevenLabs, collect bytes, upload to S3 in
     background, write URL to Redis with 24-hour TTL.

Character / seconds tracking:
  Redis keys follow the pattern:
    tts_chars:{user_id}:{YYYY-MM}  (incremented by len(text))
    stt_secs:{user_id}:{YYYY-MM}   (incremented by estimated seconds)
  Both expire at end of month + 1 day.
"""
from __future__ import annotations

import hashlib
import io
import uuid
from calendar import monthrange
from datetime import datetime, timezone
from typing import AsyncIterator

import redis.asyncio as aioredis
from elevenlabs.client import AsyncElevenLabs
from elevenlabs.types import VoiceSettings

from app.core.config import settings
from app.core.logging import logger

DEFAULT_MODEL = "eleven_multilingual_v2"
DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM"  # ElevenLabs "Rachel"
AUDIO_FORMAT = "mp3_44100_128"

_client: AsyncElevenLabs | None = None


def _get_client() -> AsyncElevenLabs:
    global _client
    if _client is None:
        _client = AsyncElevenLabs(api_key=settings.elevenlabs_api_key)
    return _client


# ── TTS ───────────────────────────────────────────────────────────────────────

def _cache_key(text: str, voice_id: str, model_id: str) -> str:
    digest = hashlib.sha256(f"{text}|{voice_id}|{model_id}".encode()).hexdigest()
    return f"tts_cache:{digest}"


async def get_cached_audio_url(
    redis: aioredis.Redis, text: str, voice_id: str, model_id: str
) -> str | None:
    key = _cache_key(text, voice_id, model_id)
    url = await redis.get(key)
    return url.decode() if url else None


async def cache_audio_url(
    redis: aioredis.Redis, text: str, voice_id: str, model_id: str, url: str
) -> None:
    key = _cache_key(text, voice_id, model_id)
    await redis.setex(key, 86400, url)  # 24-hour TTL


async def stream_tts(
    text: str,
    voice_id: str = DEFAULT_VOICE,
    model_id: str = DEFAULT_MODEL,
    stability: float = 0.5,
    similarity_boost: float = 0.75,
) -> AsyncIterator[bytes]:
    """Yield MP3 audio chunks directly from ElevenLabs."""
    voice_settings = VoiceSettings(
        stability=stability,
        similarity_boost=similarity_boost,
    )
    async for chunk in _get_client().text_to_speech.stream(
        voice_id=voice_id,
        text=text,
        model_id=model_id,
        output_format=AUDIO_FORMAT,
        voice_settings=voice_settings,
    ):
        yield chunk


async def collect_tts_bytes(
    text: str,
    voice_id: str = DEFAULT_VOICE,
    model_id: str = DEFAULT_MODEL,
    stability: float = 0.5,
    similarity_boost: float = 0.75,
) -> bytes:
    """Collect full TTS audio as bytes (for caching)."""
    parts: list[bytes] = []
    async for chunk in stream_tts(text, voice_id, model_id, stability, similarity_boost):
        parts.append(chunk)
    return b"".join(parts)


async def upload_audio_to_storage(data: bytes, filename: str) -> str:
    """Upload MP3 bytes to S3/Supabase and return a public URL."""
    from app.services.storage import upload_file
    return await upload_file(
        data=data,
        filename=filename,
        content_type="audio/mpeg",
        chatbot_id="tts-cache",
    )


# ── STT ───────────────────────────────────────────────────────────────────────

async def transcribe_audio(audio_bytes: bytes, content_type: str = "audio/webm") -> str:
    """
    Transcribe audio bytes using ElevenLabs Scribe.
    Returns the transcript text.
    """
    # ElevenLabs expects a file-like tuple: (filename, bytes, content_type)
    file_tuple = ("audio.webm", io.BytesIO(audio_bytes), content_type)
    resp = await _get_client().speech_to_text.convert(
        model_id="scribe_v1",
        file=file_tuple,
        language_code=None,   # auto-detect
        tag_audio_events=False,
    )
    return resp.text or ""


# ── Voices ────────────────────────────────────────────────────────────────────

async def list_voices() -> list[dict]:
    """Return simplified voice list from ElevenLabs."""
    resp = await _get_client().voices.get_all()
    voices = []
    for v in resp.voices:
        voices.append({
            "voice_id": v.voice_id,
            "name": v.name,
            "category": v.category,
            "labels": dict(v.labels) if v.labels else {},
            "preview_url": v.preview_url,
        })
    return voices


# ── Usage tracking ────────────────────────────────────────────────────────────

def _month_ttl() -> int:
    now = datetime.now(timezone.utc)
    _, days = monthrange(now.year, now.month)
    return (days - now.day + 2) * 86400


async def track_tts_chars(redis: aioredis.Redis, user_id: str, char_count: int) -> None:
    now = datetime.now(timezone.utc)
    key = f"tts_chars:{user_id}:{now.year}-{now.month:02d}"
    pipe = redis.pipeline()
    pipe.incrby(key, char_count)
    pipe.expire(key, _month_ttl())
    await pipe.execute()


async def track_stt_seconds(redis: aioredis.Redis, user_id: str, seconds: float) -> None:
    now = datetime.now(timezone.utc)
    key = f"stt_secs:{user_id}:{now.year}-{now.month:02d}"
    pipe = redis.pipeline()
    pipe.incrbyfloat(key, round(seconds, 2))
    pipe.expire(key, _month_ttl())
    await pipe.execute()


async def get_voice_usage(redis: aioredis.Redis, user_id: str) -> dict:
    now = datetime.now(timezone.utc)
    month = f"{now.year}-{now.month:02d}"
    tts_key = f"tts_chars:{user_id}:{month}"
    stt_key = f"stt_secs:{user_id}:{month}"
    tts_val, stt_val = await redis.mget(tts_key, stt_key)
    return {
        "tts_characters": int(tts_val or 0),
        "stt_seconds": float(stt_val or 0),
        "month": month,
    }
