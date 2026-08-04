"""Pydantic request schemas for the Channel Integration API
(backend/app/api/integrations.py).
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

# ── Upsert integration ──────────────────────────────────────────────────────────


class UpsertIntegrationRequest(BaseModel):
    """PUT /api/v1/chatbots/{chatbot_id}/integrations/{channel}.

    `config` holds channel-specific credentials/settings (e.g. bot_token,
    access_token, waba_id, ...) — its shape varies per channel and it is
    stored verbatim in ChannelIntegration.config (JSONB), so it stays a
    free-form dict rather than a fixed schema.
    """

    config: dict = Field(default_factory=dict)
    is_active: bool = True


# ── Telegram bot commands ───────────────────────────────────────────────────────


class TelegramCommandItem(BaseModel):
    """One entry of the Telegram Bot API `setMyCommands` list
    (see backend/app/services/channels/telegram.py:set_commands)."""

    command: str = Field(min_length=1, max_length=32)
    description: str = Field(min_length=1, max_length=256)


class SetTelegramCommandsRequest(BaseModel):
    """POST /api/v1/chatbots/{chatbot_id}/integrations/telegram/commands."""

    commands: list[TelegramCommandItem] = Field(default_factory=list)


# ── WhatsApp templates ──────────────────────────────────────────────────────────


class CreateWhatsAppTemplateRequest(BaseModel):
    """POST /api/v1/chatbots/{chatbot_id}/integrations/whatsapp/templates.

    Forwarded verbatim to the WhatsApp Cloud API
    (POST /{waba_id}/message_templates — see
    backend/app/services/channels/whatsapp.py:create_template), which
    performs its own server-side validation. No CHECK constraint or
    frontend <SelectItem> in this repo grounds a fixed set of categories/
    languages or marks these fields as locally required (the previous
    handler forwarded `body` unvalidated), so they stay optional and any
    extra provider-specific keys are passed through untouched.
    """

    model_config = ConfigDict(extra="allow")

    name: str | None = Field(default=None, max_length=512)
    language: str | None = Field(default=None, max_length=35)
    category: str | None = Field(default=None, max_length=50)
    components: list[dict] | None = None


# ── Facebook Messenger persistent menu ──────────────────────────────────────────

# Grounded in the FacebookSender.set_persistent_menu() docstring
# (backend/app/services/channels/facebook.py):
#   menu_items: list of {"type":"postback"|"web_url", "title":"...", "payload"|"url":"..."}
MessengerMenuItemType = Literal["postback", "web_url"]


class MessengerMenuItem(BaseModel):
    type: MessengerMenuItemType
    title: str = Field(min_length=1, max_length=100)
    payload: str | None = Field(default=None, max_length=1000)
    url: str | None = Field(default=None, max_length=2000)


class SetMessengerMenuRequest(BaseModel):
    """POST /api/v1/chatbots/{chatbot_id}/integrations/facebook/menu."""

    menu_items: list[MessengerMenuItem] = Field(default_factory=list)


# ── Email integration test send ─────────────────────────────────────────────────


class TestEmailIntegrationRequest(BaseModel):
    """POST /api/v1/chatbots/{chatbot_id}/integrations/email/test."""

    to: EmailStr
