from typing import Literal

from pydantic import BaseModel, Field


class UpdateUserRequest(BaseModel):
    """Superadmin partial-update of a user account.

    All fields optional — only fields explicitly present in the request
    body are applied (see `model_dump(exclude_unset=True)` at the call
    site).
    """

    role: Literal["free", "trial", "premium", "creator", "admin", "superadmin"] | None = None
    email_verified: bool | None = None
    plan: Literal["free", "trial", "starter", "pro", "enterprise"] | None = None
    subscription_status: (
        Literal[
            "active",
            "trialing",
            "past_due",
            "canceled",
            "unpaid",
            "incomplete",
            "incomplete_expired",
        ]
        | None
    ) = None


class UpdatePlatformSettingsRequest(BaseModel):
    """Superadmin partial-update of platform-wide settings.

    Mirrors the keys in `_DEFAULT_SETTINGS` in app.api.admin — any field
    left unset is left untouched.
    """

    allow_signups: bool | None = None
    require_email_verification: bool | None = None
    max_chatbots_free: int | None = Field(default=None, ge=0)
    max_messages_free: int | None = Field(default=None, ge=0)
    maintenance_mode: bool | None = None
    maintenance_message: str | None = Field(default=None, max_length=2000)
    feature_voice_lab: bool | None = None
    feature_agent_builder: bool | None = None
    feature_browser_agent: bool | None = None
    feature_social: bool | None = None


class UpdateUserFeaturesRequest(BaseModel):
    """Set (or clear) a user's `allowed_features` restriction list.

    `allowed_features=None` removes all restrictions (full access).
    Keys are validated against the canonical feature registry in
    app.core.features (ALL_FEATURE_KEYS).
    """

    allowed_features: (
        list[
            Literal[
                "wallet",
                "agent_builder",
                "flows",
                "automations",
                "analytics",
                "knowledge_base",
                "inbox",
                "forms",
                "campaigns",
                "white_label",
                "chatbots",
                "contacts",
                "keywords",
                "social",
                "sequences",
                "pipelines",
                "landing_pages",
                "stores",
                "voice_lab",
                "browser_agent",
                "mcp_servers",
            ]
        ]
        | None
    )
