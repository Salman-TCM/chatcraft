import uuid

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class MCPServerConfig(TimestampMixin, Base):
    """MCP (Model Context Protocol) server configuration per user/chatbot."""

    __tablename__ = "mcp_server_configs"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    chatbot_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("chatbot_configs.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    server_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    # none | bearer | header
    auth_type: Mapped[str] = mapped_column(String(50), nullable=False, server_default="none")
    auth_config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

    user: Mapped["User"] = relationship("User", lazy="noload")  # type: ignore[name-defined]
    chatbot: Mapped["ChatbotConfig | None"] = relationship("ChatbotConfig", lazy="noload")  # type: ignore[name-defined]
