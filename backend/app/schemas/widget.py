import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class WidgetConfigResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    chatbot_id: uuid.UUID
    allowed_domains: str | None
    position: str
    show_branding: bool
    embed_token: str
    created_at: datetime
    updated_at: datetime


class WidgetConfigUpdate(BaseModel):
    allowed_domains: str | None = Field(None, max_length=2000)
    position: str | None = Field(None, pattern=r"^(bottom-right|bottom-left|top-right|top-left)$")
    show_branding: bool | None = None


class WidgetPublicConfig(BaseModel):
    """Returned to the widget.js script — no auth required."""
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    primary_colour: str
    secondary_colour: str
    background_colour: str
    font_family: str
    welcome_message: str | None
    placeholder_text: str
    bubble_style: str
    dark_mode: bool
    logo_url: str | None
    tts_enabled: bool
    stt_enabled: bool
    auto_play_tts: bool
    allow_model_switch: bool
    voice_id: str | None
    voice_stability: float
    voice_similarity_boost: float
    position: str
    show_branding: bool
