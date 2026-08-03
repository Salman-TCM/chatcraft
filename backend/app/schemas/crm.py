import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.models.crm import CustomFieldType


# ── Tags ──────────────────────────────────────────────────────────────────────

class TagCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    color: str = Field("#6366f1", pattern=r"^#[0-9A-Fa-f]{6}$")


class TagUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    color: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")


class TagResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    color: str
    created_at: datetime


# ── Custom Fields ─────────────────────────────────────────────────────────────

class CustomFieldCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    field_key: str = Field(..., min_length=1, max_length=100, pattern=r"^[a-z0-9_]+$")
    field_type: CustomFieldType
    options: list[str] | None = None
    is_required: bool = False
    default_value: str | None = None
    scope: str = Field("contact", max_length=50)
    chatbot_id: uuid.UUID | None = None


class CustomFieldUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    options: list[str] | None = None
    is_required: bool | None = None
    default_value: str | None = None


class CustomFieldResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    field_key: str
    field_type: CustomFieldType
    options: list | None
    is_required: bool
    default_value: str | None
    scope: str
    chatbot_id: uuid.UUID | None
    created_at: datetime


# ── Contacts ──────────────────────────────────────────────────────────────────

class ContactCreate(BaseModel):
    first_name: str | None = Field(None, max_length=255)
    last_name: str | None = Field(None, max_length=255)
    email: str | None = Field(None, max_length=320)
    phone: str | None = Field(None, max_length=50)
    company: str | None = Field(None, max_length=255)
    source: str | None = Field(None, max_length=100)
    public_id: str | None = Field(None, max_length=255)
    contact_id: str | None = Field(None, max_length=255)


class ContactUpdate(BaseModel):
    first_name: str | None = Field(None, max_length=255)
    last_name: str | None = Field(None, max_length=255)
    email: str | None = Field(None, max_length=320)
    phone: str | None = Field(None, max_length=50)
    company: str | None = Field(None, max_length=255)
    source: str | None = Field(None, max_length=100)


class ContactFieldValueResponse(BaseModel):
    model_config = {"from_attributes": True}

    field_id: uuid.UUID
    value: str | None


class ContactResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    public_id: str | None
    contact_id: str | None
    first_name: str | None
    last_name: str | None
    email: str | None
    phone: str | None
    company: str | None
    source: str | None
    tags: list[TagResponse]
    created_at: datetime
    updated_at: datetime


class ContactFieldsUpdate(BaseModel):
    # dict of field_key → value
    fields: dict[str, str | None]


class ContactTagsAdd(BaseModel):
    tag_ids: list[uuid.UUID] = []


# Channel values mirror the `conversation_channel` DB enum
# (see app/models/conversation.py: Conversation.channel).
ConversationChannel = Literal[
    "web", "facebook", "instagram", "whatsapp", "telegram", "discord",
    "sms", "phone", "twitter", "tiktok", "email",
]


class ContactMessageSend(BaseModel):
    chatbot_id: uuid.UUID | None = None
    channel: ConversationChannel = "web"
    text: str | None = Field(None, max_length=10000)
    message: str | None = Field(None, max_length=10000)

    @model_validator(mode="after")
    def _require_text(self) -> "ContactMessageSend":
        combined = (self.text or self.message or "").strip()
        if not combined:
            raise ValueError("text required")
        self.text = combined
        return self


# ── Pipelines ─────────────────────────────────────────────────────────────────

class PipelineStageCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    color: str = Field("#6366f1", pattern=r"^#[0-9A-Fa-f]{6}$")
    order: int = Field(0, ge=0)


class PipelineCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(None, max_length=1000)
    color: str = Field("#6366f1", pattern=r"^#[0-9A-Fa-f]{6}$")
    chatbot_id: uuid.UUID | None = None
    # Optional initial stages
    stages: list[PipelineStageCreate] = []


class PipelineUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    color: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    is_active: bool | None = None


class PipelineStageResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    color: str
    order: int


class PipelineResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    description: str | None
    color: str
    is_active: bool
    chatbot_id: uuid.UUID | None
    stages: list[PipelineStageResponse]
    created_at: datetime
    updated_at: datetime


class DealCreate(BaseModel):
    contact_id: uuid.UUID
    stage_id: uuid.UUID
    notes: str | None = None
    deal_value: float | None = None
    order: int = 0


class DealUpdate(BaseModel):
    stage_id: uuid.UUID | None = None
    notes: str | None = None
    deal_value: float | None = None
    order: int | None = None


class DealContactResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    first_name: str | None
    last_name: str | None
    email: str | None
    phone: str | None


class DealResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    pipeline_id: uuid.UUID
    stage_id: uuid.UUID
    notes: str | None
    deal_value: float | None
    order: int
    contact: DealContactResponse
    created_at: datetime
    updated_at: datetime
