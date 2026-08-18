import re
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.services.net_security import is_ssrf_safe


class AgentToolsConfig(BaseModel):
    """Boolean toggles for each built-in tool. Unknown keys are rejected so
    typos or renamed tools surface at API time, not silently at run time."""

    model_config = ConfigDict(extra="forbid")

    web_search: bool = False
    browser: bool = False
    code: bool = False
    http: bool = False
    sheets: bool = False
    email: bool = False
    sms: bool = False
    verification: bool = False
    agent_builder: bool = False
    search_kb: bool = False
    faraid: bool = False
    # Exposes list_products/buy_product for the CommerceStore linked to this
    # agent via CommerceStore.agent_id — no-op if no store is linked.
    commerce: bool = False


_WEBHOOK_URL_RE = re.compile(r"^https?://[^\s]+$")


def _validate_model_id(value: str) -> str:
    """Validate the model ID against the known provider registry so we don't
    persist typos (e.g. 'pretend-model-9000') that would only fail at runtime.

    "self-hosted/<name>" is exempt — the name is whatever the user's own
    server calls it, so it can't be checked against a fixed model list."""
    from app.services.llm.router import SELF_HOSTED_PREFIX

    if value.startswith(SELF_HOSTED_PREFIX):
        if len(value) <= len(SELF_HOSTED_PREFIX):
            raise ValueError("Self-hosted model id must include a model name after the prefix")
        return value

    from app.services.llm.router import _PROVIDER_MAP  # noqa

    if value not in _PROVIDER_MAP:
        raise ValueError(f"Unknown model id: {value!r}")
    return value


def _validate_webhook_url(value: str | None) -> str | None:
    if value is None or value == "":
        return None
    if not _WEBHOOK_URL_RE.match(value):
        raise ValueError("webhook_url must be an http(s) URL")
    if not is_ssrf_safe(value):
        raise ValueError(
            "webhook_url points at a private/internal address (localhost, private IP "
            "ranges, cloud metadata endpoints, or bare Docker service names are blocked)"
        )
    return value


_HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$")
_FONT_WHITELIST = {"system-ui", "Inter", "Roboto", "Open Sans", "Lato", "Poppins", "Georgia", "monospace"}
_BUBBLE_STYLES = {"rounded", "pill", "square"}


def _validate_hex_colour(v: str | None) -> str | None:
    if v is None or v == "":
        return None
    if not _HEX_COLOR_RE.match(v):
        raise ValueError("primary_colour must be a 3- or 6-digit hex colour (e.g. #6366f1)")
    return v


class AgentCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(None, max_length=2000)
    instructions: str | None = Field(None, max_length=8000)
    chatbot_id: uuid.UUID | None = None
    model: str = Field("claude-sonnet-4-6", max_length=100)
    tools: AgentToolsConfig = Field(default_factory=AgentToolsConfig)
    memory_enabled: bool = False
    max_steps: int = Field(10, ge=1, le=30)
    is_active: bool = True
    webhook_url: str | None = Field(None, max_length=2048)
    welcome_message: str | None = Field(None, max_length=500)
    suggestions_enabled: bool = False
    # Design
    primary_colour: str = Field("#6366f1", max_length=20)
    logo_url: str | None = Field(None, max_length=2048)
    dark_mode: bool = False
    show_branding: bool = True
    font_family: str = Field("system-ui", max_length=100)
    bubble_style: str = Field("rounded", max_length=20)
    placeholder_text: str = Field("Type a message…", max_length=200)

    _v_model = field_validator("model")(lambda cls, v: _validate_model_id(v))
    _v_webhook = field_validator("webhook_url")(lambda cls, v: _validate_webhook_url(v))
    _v_colour = field_validator("primary_colour")(lambda cls, v: _validate_hex_colour(v) or "#6366f1")


class AgentUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = Field(None, max_length=2000)
    instructions: str | None = Field(None, max_length=8000)
    chatbot_id: uuid.UUID | None = None
    model: str | None = Field(None, max_length=100)
    tools: AgentToolsConfig | None = None
    memory_enabled: bool | None = None
    max_steps: int | None = Field(None, ge=1, le=30)
    is_published: bool | None = None
    is_active: bool | None = None
    webhook_url: str | None = Field(None, max_length=2048)
    welcome_message: str | None = Field(None, max_length=500)
    suggestions_enabled: bool | None = None
    # Design
    primary_colour: str | None = Field(None, max_length=20)
    logo_url: str | None = Field(None, max_length=2048)
    dark_mode: bool | None = None
    show_branding: bool | None = None
    font_family: str | None = Field(None, max_length=100)
    bubble_style: str | None = Field(None, max_length=20)
    placeholder_text: str | None = Field(None, max_length=200)

    _v_model = field_validator("model")(
        lambda cls, v: _validate_model_id(v) if v is not None else v
    )
    _v_webhook = field_validator("webhook_url")(lambda cls, v: _validate_webhook_url(v))
    _v_colour = field_validator("primary_colour")(
        lambda cls, v: _validate_hex_colour(v) if v is not None else v
    )


class AgentResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    description: str | None
    instructions: str | None
    chatbot_id: uuid.UUID | None
    model: str
    tools: dict
    memory_enabled: bool
    max_steps: int
    is_published: bool
    is_active: bool
    share_enabled: bool = False
    share_token: str | None = None
    webhook_url: str | None = None
    welcome_message: str | None = None
    suggestions_enabled: bool = False
    # Design
    primary_colour: str = "#6366f1"
    logo_url: str | None = None
    dark_mode: bool = False
    show_branding: bool = True
    font_family: str = "system-ui"
    bubble_style: str = "rounded"
    placeholder_text: str = "Type a message…"
    created_at: datetime
    updated_at: datetime
