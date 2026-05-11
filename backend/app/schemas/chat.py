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


class ChatbotResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    default_model: str
    fallback_model: str | None
    allow_model_switch: bool
    published: bool
    system_prompt: str | None
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
