from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.services.net_security import is_ssrf_safe

_AUTH_TYPES = Literal["none", "api_key", "bearer", "basic"]
_INTEGRATION_TYPES = Literal["ecom_customer", "ecom_admin"]
_BASE_URL_RE = re.compile(r"^https://[^\s]+$")

_VALID_GROUPS: dict[str, set[str]] = {
    "ecom_customer": {"browse", "cart", "orders", "returns", "account", "store_info"},
    "ecom_admin":    {"catalog", "pricing", "orders", "customers", "inventory", "fulfillment"},
}


def _validate_base_url(v: str) -> str:
    v = v.rstrip("/")
    if not _BASE_URL_RE.match(v):
        raise ValueError("base_url must be an https:// URL")
    if not is_ssrf_safe(v):
        raise ValueError(
            "base_url points at a private/internal address — "
            "localhost, private IP ranges, and cloud metadata endpoints are blocked"
        )
    return v


# ── Credential schemas ─────────────────────────────────────────────────────────


class CredentialCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1, max_length=255)
    auth_type: _AUTH_TYPES = "bearer"
    auth_header: str | None = Field(None, max_length=100)
    auth_value: str = Field(..., min_length=1, description="Raw credential — stored encrypted")


class CredentialResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    auth_type: str
    auth_header: str | None
    # auth_value / encrypted_value are intentionally excluded
    created_at: datetime
    updated_at: datetime


# ── Integration schemas ────────────────────────────────────────────────────────


class IntegrationCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1, max_length=255)
    integration_type: _INTEGRATION_TYPES
    base_url: str = Field(..., max_length=2048)
    credential_id: uuid.UUID | None = None
    enabled_tool_groups: list[str] = Field(default_factory=list)
    enabled_tools: list[str] | None = None
    allow_destructive: bool = False

    @field_validator("base_url")
    @classmethod
    def v_url(cls, v: str) -> str:
        return _validate_base_url(v)

    @field_validator("enabled_tool_groups")
    @classmethod
    def v_groups(cls, v: list[str], info: object) -> list[str]:
        return v  # validated after integration_type is known in the API layer


class IntegrationUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(None, min_length=1, max_length=255)
    base_url: str | None = Field(None, max_length=2048)
    credential_id: uuid.UUID | None = None
    enabled_tool_groups: list[str] | None = None
    enabled_tools: list[str] | None = None
    is_active: bool | None = None
    allow_destructive: bool | None = None

    @field_validator("base_url")
    @classmethod
    def v_url(cls, v: str | None) -> str | None:
        return _validate_base_url(v) if v is not None else v


class IntegrationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    integration_type: str
    base_url: str
    credential_id: uuid.UUID | None
    auth_type: str
    auth_header: str | None
    has_credential: bool = False  # computed in API layer
    enabled_tool_groups: list[str]
    enabled_tools: list[str] | None
    is_active: bool
    allow_destructive: bool
    health_status: str
    last_tested_at: datetime | None
    last_error: str | None
    created_at: datetime
    updated_at: datetime
