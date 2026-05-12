"""
Voice API
  POST /api/voice/tts        — text-to-speech (streaming MP3 or cached URL)
  POST /api/voice/stt        — speech-to-text transcript
  GET  /api/voice/voices     — list ElevenLabs voices
  GET  /api/voice/usage      — current month TTS chars + STT seconds
"""
import asyncio

from fastapi import APIRouter, HTTPException, UploadFile, status
from fastapi.responses import RedirectResponse, StreamingResponse

from app.core.dependencies import CurrentUser, RedisClient
from app.schemas.voice import (
    STTResponse,
    TTSRequest,
    VoiceItem,
    VoiceUsageResponse,
)
from app.services import voice as voice_svc

router = APIRouter(prefix="/api/voice", tags=["voice"])

# Approximate MP3 bitrate for duration estimation (128 kbps = 16 KB/s)
_MP3_BYTES_PER_SEC = 16_000


@router.post("/tts", response_model=None)
async def text_to_speech(
    body: TTSRequest,
    user: CurrentUser,
    redis: RedisClient,
) -> StreamingResponse | RedirectResponse:
    """
    Convert text to speech.
    - Returns streaming MP3 audio by default.
    - When use_cache_url=True and the audio is already cached, returns a
      302 redirect to the S3 URL instead of streaming bytes.
    """
    voice_id = body.voice_id or voice_svc.DEFAULT_VOICE

    # ── Check cache ───────────────────────────────────────────────────────────
    cached_url = await voice_svc.get_cached_audio_url(
        redis, body.text, voice_id, body.model_id
    )
    if cached_url:
        if body.use_cache_url:
            return RedirectResponse(url=cached_url, status_code=302)
        # Re-stream from cache URL via redirect — client fetches from S3
        return RedirectResponse(url=cached_url, status_code=302)

    # ── Track usage (fire-and-forget) ─────────────────────────────────────────
    asyncio.create_task(
        voice_svc.track_tts_chars(redis, str(user.id), len(body.text))
    )

    # ── Stream from ElevenLabs + collect for caching ──────────────────────────
    collected: list[bytes] = []

    async def audio_stream():
        async for chunk in voice_svc.stream_tts(
            text=body.text,
            voice_id=voice_id,
            model_id=body.model_id,
            stability=body.stability,
            similarity_boost=body.similarity_boost,
        ):
            collected.append(chunk)
            yield chunk

        # After streaming completes, cache in background
        asyncio.create_task(
            _cache_audio(
                collected, body.text, voice_id, body.model_id, redis
            )
        )

    return StreamingResponse(
        audio_stream(),
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "no-store",
            "X-Voice-ID": voice_id,
        },
    )


@router.post("/stt", response_model=STTResponse)
async def speech_to_text(
    file: UploadFile,
    user: CurrentUser,
    redis: RedisClient,
) -> STTResponse:
    """
    Transcribe an uploaded audio file.
    Accepts WebM, MP3, WAV, OGG, M4A (ElevenLabs Scribe supports all common formats).
    """
    MAX_AUDIO_BYTES = 25 * 1024 * 1024  # 25 MB
    data = await file.read()
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"success": False, "error": "Empty audio file", "code": "EMPTY_FILE"},
        )
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={"success": False, "error": "Audio file exceeds 25 MB", "code": "FILE_TOO_LARGE"},
        )

    content_type = file.content_type or "audio/webm"

    try:
        transcript = await voice_svc.transcribe_audio(data, content_type)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"success": False, "error": f"Transcription failed: {exc}", "code": "STT_ERROR"},
        )

    # Estimate duration from file size and track usage
    estimated_seconds = len(data) / _MP3_BYTES_PER_SEC
    asyncio.create_task(
        voice_svc.track_stt_seconds(redis, str(user.id), estimated_seconds)
    )

    return STTResponse(transcript=transcript, duration_seconds=round(estimated_seconds, 2))


@router.get("/voices", response_model=list[VoiceItem])
async def get_voices(user: CurrentUser) -> list[VoiceItem]:
    """Return available ElevenLabs voices for this account."""
    try:
        voices = await voice_svc.list_voices()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"success": False, "error": f"Could not fetch voices: {exc}", "code": "VOICES_ERROR"},
        )
    return [VoiceItem(**v) for v in voices]


@router.get("/usage", response_model=VoiceUsageResponse)
async def get_usage(user: CurrentUser, redis: RedisClient) -> VoiceUsageResponse:
    """Return current month's TTS character count and STT seconds for the authenticated user."""
    data = await voice_svc.get_voice_usage(redis, str(user.id))
    return VoiceUsageResponse(**data)


# ── Internal helpers ──────────────────────────────────────────────────────────

async def _cache_audio(
    chunks: list[bytes],
    text: str,
    voice_id: str,
    model_id: str,
    redis,
) -> None:
    """Upload collected audio bytes to S3 and cache the URL in Redis."""
    try:
        data = b"".join(chunks)
        import hashlib
        digest = hashlib.sha256(f"{text}|{voice_id}|{model_id}".encode()).hexdigest()[:12]
        filename = f"tts_{digest}.mp3"
        url = await voice_svc.upload_audio_to_storage(data, filename)
        await voice_svc.cache_audio_url(redis, text, voice_id, model_id, url)
    except Exception as exc:
        from app.core.logging import logger
        logger.warning(f"TTS cache upload failed: {exc!r}")
