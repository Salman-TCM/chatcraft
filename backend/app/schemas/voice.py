from pydantic import BaseModel, Field


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    voice_id: str | None = None
    model_id: str = "eleven_multilingual_v2"
    stability: float = Field(0.5, ge=0.0, le=1.0)
    similarity_boost: float = Field(0.75, ge=0.0, le=1.0)
    # When True the endpoint returns a redirect to the cached S3 URL
    # rather than streaming bytes (useful for players that need a stable URL)
    use_cache_url: bool = False


class STTResponse(BaseModel):
    transcript: str
    duration_seconds: float


class VoiceItem(BaseModel):
    voice_id: str
    name: str
    category: str | None
    labels: dict
    preview_url: str | None


class VoiceUsageResponse(BaseModel):
    tts_characters: int
    stt_seconds: float
    month: str
