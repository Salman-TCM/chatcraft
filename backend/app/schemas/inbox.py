import uuid
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

# ── Conversations ─────────────────────────────────────────────────────────────


class ReopenConversationRequest(BaseModel):
    release_takeover: bool = False


# ── Messages ───────────────────────────────────────────────────────────────────


class SendMessageRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=10000)
    role: Literal["assistant", "system"] = "assistant"


# ── Internal Notes ─────────────────────────────────────────────────────────────


class AddNoteRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=10000)


# ── Assignment ─────────────────────────────────────────────────────────────────


class AssignConversationRequest(BaseModel):
    user_id: uuid.UUID


# ── Team Members ──────────────────────────────────────────────────────────────


class InviteTeamMemberRequest(BaseModel):
    email: EmailStr
    role: Literal["agent", "manager"] = "agent"


# ── AI Email Body Composer ─────────────────────────────────────────────────────


class AiComposeEmailRequest(BaseModel):
    tone: Literal["professional", "friendly", "formal"] = "professional"
    instruction: str | None = Field(None, max_length=2000)
