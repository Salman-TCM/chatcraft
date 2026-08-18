import re
import uuid
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.services.net_security import is_ssrf_safe

_NAME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9_-]{0,63}$")

# Must stay in sync with the native tool names built in app/api/agents.py
# (_build_builtin_tools) plus the commerce tools and the "mcp__" MCP prefix —
# a custom tool can never shadow one of these.
RESERVED_TOOL_NAMES = {
    "web_search",
    "browse_url",
    "run_code",
    "http_request",
    "google_sheets",
    "send_email",
    "send_sms",
    "send_email_verification",
    "send_sms_verification",
    "verify_code",
    "list_available_models",
    "create_agent",
    "search_kb",
    "calculate_faraid",
    "list_products",
    "buy_product",
    "check_order_status",
}

MAX_HEADERS = 10
MAX_HEADER_LEN = 2000


def _validate_name(name: str) -> str:
    if not _NAME_RE.match(name):
        raise ValueError(
            "Name must start with a letter and contain only letters, numbers, "
            "underscores, and hyphens (max 64 chars)."
        )
    if name in RESERVED_TOOL_NAMES or name.startswith("mcp__"):
        raise ValueError(f"'{name}' is a reserved tool name and cannot be used.")
    return name


def _validate_webhook_url(url: str) -> str:
    if not is_ssrf_safe(url):
        raise ValueError(
            "Webhook URL is not allowed (must be http(s) and cannot target "
            "private/internal/link-local addresses)."
        )
    return url


def _validate_headers(headers: dict[str, str] | None) -> dict[str, str] | None:
    if not headers:
        return headers
    if len(headers) > MAX_HEADERS:
        raise ValueError(f"At most {MAX_HEADERS} custom headers are allowed.")
    for key, value in headers.items():
        if not isinstance(key, str) or not isinstance(value, str):
            raise ValueError("Header names and values must be strings.")
        if len(key) > 200 or len(value) > MAX_HEADER_LEN:
            raise ValueError("Header name/value too long.")
    return headers


class CreateAgentFunctionRequest(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    description: str = Field("", max_length=2000)
    parameters_schema: dict = Field(default_factory=dict)
    webhook_url: str = Field(min_length=1, max_length=2048)
    webhook_method: Literal["GET", "POST"] = "POST"
    webhook_headers: dict[str, str] | None = None

    _v_name = field_validator("name")(_validate_name)
    _v_url = field_validator("webhook_url")(_validate_webhook_url)
    _v_headers = field_validator("webhook_headers")(_validate_headers)


class UpdateAgentFunctionRequest(BaseModel):
    """Partial update — all fields optional. Omitting webhook_headers leaves it
    unchanged; pass an empty object to clear it."""

    name: str | None = Field(None, min_length=1, max_length=64)
    description: str | None = Field(None, max_length=2000)
    parameters_schema: dict | None = None
    webhook_url: str | None = Field(None, min_length=1, max_length=2048)
    webhook_method: Literal["GET", "POST"] | None = None
    webhook_headers: dict[str, str] | None = None
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def _v_name(cls, v: str | None) -> str | None:
        return _validate_name(v) if v is not None else v

    @field_validator("webhook_url")
    @classmethod
    def _v_url(cls, v: str | None) -> str | None:
        return _validate_webhook_url(v) if v is not None else v

    @field_validator("webhook_headers")
    @classmethod
    def _v_headers(cls, v: dict[str, str] | None) -> dict[str, str] | None:
        return _validate_headers(v)


class AgentFunctionOut(BaseModel):
    id: uuid.UUID
    agent_id: uuid.UUID
    name: str
    description: str
    parameters_schema: dict
    webhook_url: str
    webhook_method: str
    has_headers: bool
    is_active: bool
