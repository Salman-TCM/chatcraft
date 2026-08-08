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

    _v_model = field_validator("model")(lambda cls, v: _validate_model_id(v))
    _v_webhook = field_validator("webhook_url")(lambda cls, v: _validate_webhook_url(v))


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
