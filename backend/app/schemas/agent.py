import re
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


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


_WEBHOOK_URL_RE = re.compile(r"^https?://[^\s]+$")


def _validate_model_id(value: str) -> str:
    """Validate the model ID against the known provider registry so we don't
    persist typos (e.g. 'pretend-model-9000') that would only fail at runtime."""
    from app.services.llm.router import get_model_provider

    provider = get_model_provider(value)
    # get_model_provider defaults to 'anthropic' for unknown IDs — detect that by
    # explicitly checking the mapping for a hit.
    from app.services.llm.router import _PROVIDER_MAP  # noqa

    if value not in _PROVIDER_MAP:
        raise ValueError(f"Unknown model id: {value!r}")
    _ = provider  # provider is validated indirectly by _PROVIDER_MAP lookup
    return value


def _validate_webhook_url(value: str | None) -> str | None:
    if value is None or value == "":
        return None
    if not _WEBHOOK_URL_RE.match(value):
        raise ValueError("webhook_url must be an http(s) URL")
    return value


class AgentCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(None, max_length=2000)
    instructions: str | None = Field(None, max_length=8000)
    chatbot_id: uuid.UUID | None = None
    model: str = Field("claude-sonnet-4-6", max_length=100)
    tools: AgentToolsConfig = Field(default_factory=AgentToolsConfig)
    memory_enabled: bool = False
    max_steps: int = Field(10, ge=1, le=30)
    webhook_url: str | None = Field(None, max_length=2048)

    _v_model = field_validator("model")(lambda cls, v: _validate_model_id(v))
    _v_webhook = field_validator("webhook_url")(lambda cls, v: _validate_webhook_url(v))


class AgentUpdateRequest(BaseModel):
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

    _v_model = field_validator("model")(
        lambda cls, v: _validate_model_id(v) if v is not None else v
    )
    _v_webhook = field_validator("webhook_url")(lambda cls, v: _validate_webhook_url(v))


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
    created_at: datetime
    updated_at: datetime
