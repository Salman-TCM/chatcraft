import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class IntegrationCredential(TimestampMixin, Base):
    """Encrypted API credentials stored separately from integration config.

    auth_value is never returned in API responses — only its presence is
    signalled via has_credential on the integration response schema.
    """

    __tablename__ = "integration_credentials"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # none | api_key | bearer | basic
    auth_type: Mapped[str] = mapped_column(String(20), nullable=False, default="bearer")
    # Custom header name for api_key auth (e.g. "X-Api-Key")
    auth_header: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Fernet-encrypted credential value — never exposed in API responses.
    encrypted_value: Mapped[str | None] = mapped_column(Text, nullable=True)

    user: Mapped["User"] = relationship("User")  # type: ignore[name-defined]

    def __repr__(self) -> str:
        return f"<IntegrationCredential id={self.id} name={self.name!r}>"


class AgentIntegration(TimestampMixin, Base):
    """An API integration attached to an agent.

    Stores the base URL, which tool groups are enabled, and a reference to
    the encrypted credential. Destructive tools are blocked unless
    allow_destructive is explicitly set to True by the user.
    """

    __tablename__ = "agent_integrations"

    agent_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # ecom_customer | ecom_admin
    integration_type: Mapped[str] = mapped_column(String(50), nullable=False)
    base_url: Mapped[str] = mapped_column(String(2048), nullable=False)

    credential_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("integration_credentials.id", ondelete="SET NULL"),
        nullable=True,
    )
    # auth_type / auth_header duplicated here for fast access during tool execution
    # without a credential JOIN (populated from the credential on save).
    auth_type: Mapped[str] = mapped_column(String(20), nullable=False, server_default="none")
    auth_header: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Fernet-encrypted value cached here so execution needs only one row lookup.
    encrypted_credential: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Which tool groups are enabled: e.g. ["browse", "cart", "orders"]
    enabled_tool_groups: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]"
    )
    # If set, only these specific tool keys are enabled within enabled groups.
    # None means all tools in enabled groups are available.
    enabled_tools: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    # Allow destructive tools (delete, cancel, refund). Off by default.
    allow_destructive: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    # Health tracking
    health_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="unknown", server_default="'unknown'"
    )
    last_tested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    agent: Mapped["Agent"] = relationship("Agent")  # type: ignore[name-defined]
    user: Mapped["User"] = relationship("User")  # type: ignore[name-defined]
    credential: Mapped["IntegrationCredential | None"] = relationship("IntegrationCredential")

    def __repr__(self) -> str:
        return f"<AgentIntegration id={self.id} name={self.name!r} type={self.integration_type}>"
