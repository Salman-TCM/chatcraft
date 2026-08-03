"""Request schemas for the /api/manage endpoints (widget/function management via API tokens)."""
import uuid
from typing import Literal

from pydantic import BaseModel, Field

# Fixed channel set — mirrors app.models.inbox.ConversationChannel, plus the
# "all" sentinel this endpoint uses to mean "every channel".
Channel = Literal[
    "all", "web", "facebook", "instagram", "whatsapp", "telegram",
    "discord", "sms", "phone", "twitter", "tiktok", "email",
]

# "rounded" | "square" | "pill" — see app.models.chatbot_config.ChatbotConfig.bubble_style
BubbleStyle = Literal["rounded", "square", "pill"]


class UpdateWidgetRequest(BaseModel):
    """PUT /api/manage/widgets/{widget_id} — partial update, all fields optional."""

    name: str | None = Field(None, min_length=1, max_length=255)
    default_model: str | None = Field(None, max_length=100)
    fallback_model: str | None = Field(None, max_length=100)
    allow_model_switch: bool | None = None
    system_prompt: str | None = Field(None, max_length=8000)
    published: bool | None = None
    ai_paused: bool | None = None
    # Branding
    primary_colour: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    secondary_colour: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    background_colour: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    font_family: str | None = Field(None, max_length=100)
    welcome_message: str | None = Field(None, max_length=500)
    placeholder_text: str | None = Field(None, max_length=200)
    bubble_style: BubbleStyle | None = None
    dark_mode: bool | None = None
    # Voice
    tts_enabled: bool | None = None
    stt_enabled: bool | None = None
    auto_play_tts: bool | None = None
    voice_id: str | None = Field(None, max_length=100)
    voice_stability: float | None = Field(None, ge=0.0, le=1.0)
    voice_similarity_boost: float | None = Field(None, ge=0.0, le=1.0)


class EnableAiChannelRequest(BaseModel):
    """POST /api/manage/widgets/{widget_id}/enable-ai"""

    channel: Channel = "all"
    enabled: bool = True


class SetWidgetFunctionsRequest(BaseModel):
    """PUT /api/manage/widgets/{bot_id}/functions"""

    function_ids: list[uuid.UUID] = Field(default_factory=list)


class CreateFunctionRequest(BaseModel):
    """POST /api/manage/functions"""

    name: str = Field(min_length=1, max_length=100)
    description: str = Field("", max_length=2000)
    parameters_schema: dict = Field(default_factory=dict)
    output_message: str | None = Field(None, max_length=2000)
    save_to_contact: bool = False
    save_field_key: str | None = Field(None, max_length=100)


class UpdateFunctionRequest(BaseModel):
    """PUT /api/manage/functions/{fn_id} — partial update, all fields optional."""

    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = Field(None, max_length=2000)
    parameters_schema: dict | None = None
    output_message: str | None = Field(None, max_length=2000)
    save_to_contact: bool | None = None
    save_field_key: str | None = Field(None, max_length=100)
    is_active: bool | None = None
