import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.message import MessageFeedback
from app.services.llm.costs import supported_models


# ── Chatbot schemas ──────────────────────────────────────────────────────────

class ChatbotCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    default_model: str = Field("claude-sonnet-4-6", max_length=100)
    fallback_model: str | None = Field(None, max_length=100)
    allow_model_switch: bool = False
    system_prompt: str | None = Field(None, max_length=8000)


class ChatbotUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    default_model: str | None = Field(None, max_length=100)
    fallback_model: str | None = Field(None, max_length=100)
    allow_model_switch: bool | None = None
    system_prompt: str | None = Field(None, max_length=8000)
    published: bool | None = None
    # Branding
    logo_url: str | None = Field(None, max_length=2048)
    primary_colour: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    secondary_colour: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    background_colour: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    font_family: str | None = Field(None, max_length=100)
    welcome_message: str | None = Field(None, max_length=500)
    placeholder_text: str | None = Field(None, max_length=200)
    bubble_style: str | None = Field(None, pattern=r"^(rounded|square|pill)$")
    dark_mode: bool | None = None
    ai_paused: bool | None = None
    # Voice
    tts_enabled: bool | None = None
    stt_enabled: bool | None = None
    auto_play_tts: bool | None = None
    voice_id: str | None = Field(None, max_length=100)
    voice_stability: float | None = Field(None, ge=0.0, le=1.0)
    voice_similarity_boost: float | None = Field(None, ge=0.0, le=1.0)


class ChatbotResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    default_model: str
    fallback_model: str | None
    allow_model_switch: bool
    published: bool
    system_prompt: str | None
    # Branding
    logo_url: str | None
    primary_colour: str
    secondary_colour: str
    background_colour: str
    font_family: str
    welcome_message: str | None
    placeholder_text: str
    bubble_style: str
    dark_mode: bool
    ai_paused: bool
    # Voice
    tts_enabled: bool
    stt_enabled: bool
    auto_play_tts: bool
    voice_id: str | None
    voice_stability: float
    voice_similarity_boost: float
    created_at: datetime
    updated_at: datetime


# ── Chat / message schemas ───────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=32_000)
    conversation_id: uuid.UUID | None = None
    # Model override — only honoured when chatbot.allow_model_switch is True
    model: str | None = Field(None, max_length=100)


class MessageResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    role: str
    content: str
    model: str | None
    input_tokens: int
    output_tokens: int
    cost_usd: Decimal
    feedback: MessageFeedback | None
    created_at: datetime


class ConversationResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    chatbot_id: uuid.UUID
    title: str | None
    created_at: datetime
    updated_at: datetime
    messages: list[MessageResponse] = []


class FeedbackRequest(BaseModel):
    feedback: MessageFeedback
