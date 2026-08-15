import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Agent(TimestampMixin, Base):
    __tablename__ = "agents"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # The agent's own system instructions (replaces or supplements chatbot prompt)
    instructions: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Optional: base the agent on an existing chatbot (inherits KB + system prompt)
    chatbot_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("chatbot_configs.id", ondelete="SET NULL"),
        nullable=True,
    )

    model: Mapped[str] = mapped_column(
        String(100), nullable=False, default="claude-sonnet-4-6", server_default="claude-sonnet-4-6"
    )

    # Tool toggles: {"web_search": bool, "browser": bool, "code": bool,
    #                "http": bool, "sheets": bool, "email": bool}
    tools: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")

    memory_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    max_steps: Mapped[int] = mapped_column(Integer, nullable=False, default=10, server_default="10")
    is_published: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

    # Public sharing
    share_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    share_token: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)

    # Webhook — POST to this URL after every completed agent run
    webhook_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)

    # Shown as the first message before the visitor sends anything (public
    # share page, test chat). Mirrors ChatbotConfig.welcome_message.
    welcome_message: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # When true, the system prompt teaches the model to end every response
    # with a small set of suggested follow-up replies as tappable buttons.
    suggestions_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    # ── Design / branding fields ───────────────────────────────────────────────
    primary_colour: Mapped[str] = mapped_column(
        String(20), nullable=False, default="#6366f1", server_default="'#6366f1'"
    )
    logo_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    dark_mode: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    show_branding: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    font_family: Mapped[str] = mapped_column(
        String(100), nullable=False, default="system-ui", server_default="'system-ui'"
    )
    bubble_style: Mapped[str] = mapped_column(
        String(20), nullable=False, default="rounded", server_default="'rounded'"
    )
    placeholder_text: Mapped[str] = mapped_column(
        String(200), nullable=False, default="Type a message…", server_default="'Type a message…'"
    )

    # Relationships
    user: Mapped["User"] = relationship("User")  # type: ignore[name-defined]
    chatbot: Mapped["ChatbotConfig | None"] = relationship("ChatbotConfig")  # type: ignore[name-defined]

    def __repr__(self) -> str:
        return f"<Agent id={self.id} name={self.name!r}>"
