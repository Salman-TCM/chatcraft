import uuid
from typing import Literal

from pydantic import BaseModel, Field

# Fixed trigger_type values — kept in sync with the <select> options in
# frontend/app/dashboard/automations/page.tsx (TRIGGERS) and the trigger strings
# dispatched from backend/app/api/wallet.py and backend/app/api/forms.py.
AutomationTriggerType = Literal[
    "new_contact",
    "tag_added",
    "field_updated",
    "conversation_opened",
    "conversation_closed",
    "pipeline_stage_changed",
    "payment_received",
    "form_submitted",
    "wallet_card_issued",
    "wallet_punch_added",
    "wallet_points_added",
    "wallet_reward_unlocked",
    "wallet_reward_redeemed",
    "wallet_coupon_claimed",
]

# Fixed action_type values — kept in sync with the <select> options in
# frontend/app/dashboard/automations/page.tsx (ACTIONS).
AutomationActionType = Literal[
    "trigger_flow",
    "send_message",
    "add_tag",
    "set_field",
    "add_to_pipeline",
    "send_webhook",
]

# stop / pause / continue — from the model comment on Sequence.reply_behavior
# and the <select> options in frontend/app/dashboard/sequences/page.tsx.
SequenceReplyBehavior = Literal["stop", "pause", "continue"]

# exact / contains / starts_with — from the model comment on Keyword.match_type
# and the <select> options in frontend/app/dashboard/keywords/page.tsx.
KeywordMatchType = Literal["exact", "contains", "starts_with"]

# text / flow — from the model comment on Keyword.response_type and the
# response-type toggle in frontend/app/dashboard/keywords/page.tsx.
KeywordResponseType = Literal["text", "flow"]


# ── Automations ─────────────────────────────────────────────────────────────────

class AutomationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    trigger_type: AutomationTriggerType = "new_contact"
    trigger_config: dict = Field(default_factory=dict)
    action_type: AutomationActionType = "send_message"
    action_config: dict = Field(default_factory=dict)
    enabled: bool = True


class AutomationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    trigger_type: AutomationTriggerType | None = None
    trigger_config: dict | None = None
    action_type: AutomationActionType | None = None
    action_config: dict | None = None
    enabled: bool | None = None


# ── Sequences ────────────────────────────────────────────────────────────────────

class SequenceCreate(BaseModel):
    chatbot_id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    auto_enroll: bool = False
    reply_behavior: SequenceReplyBehavior = "stop"
    # [{id, delay_amount, delay_unit, message_text, flow_id, condition}] — free-form,
    # not validated further (matches Sequence.steps JSONB column).
    steps: list = Field(default_factory=list)


class SequenceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    chatbot_id: uuid.UUID | None = None
    auto_enroll: bool | None = None
    reply_behavior: SequenceReplyBehavior | None = None
    steps: list | None = None


class SequenceEnrollRequest(BaseModel):
    contact_id: uuid.UUID


# ── Keywords ─────────────────────────────────────────────────────────────────────

class KeywordCreate(BaseModel):
    chatbot_id: uuid.UUID | None = None
    keywords: list[str] = Field(min_length=1)
    match_type: KeywordMatchType = "contains"
    response_type: KeywordResponseType = "text"
    response_text: str | None = None
    flow_id: uuid.UUID | None = None
    is_active: bool = True
    priority: int = 0


class KeywordUpdate(BaseModel):
    chatbot_id: uuid.UUID | None = None
    keywords: list[str] | None = Field(default=None, min_length=1)
    match_type: KeywordMatchType | None = None
    response_type: KeywordResponseType | None = None
    response_text: str | None = None
    flow_id: uuid.UUID | None = None
    is_active: bool | None = None
    priority: int | None = None
