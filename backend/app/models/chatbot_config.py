import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class ChatbotConfig(TimestampMixin, Base):
    __tablename__ = "chatbot_configs"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    default_model: Mapped[str] = mapped_column(
        String(100), nullable=False, server_default="claude-sonnet-4-6"
    )
    fallback_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    allow_model_switch: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    published: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    # Optional system prompt override stored per chatbot
    system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Branding fields ───────────────────────────────────────────────────────
    logo_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    primary_colour: Mapped[str] = mapped_column(
        String(7), nullable=False, default="#6366f1", server_default="#6366f1"
    )
    secondary_colour: Mapped[str] = mapped_column(
        String(7), nullable=False, default="#f3f4f6", server_default="#f3f4f6"
    )
    background_colour: Mapped[str] = mapped_column(
        String(7), nullable=False, default="#ffffff", server_default="#ffffff"
    )
    font_family: Mapped[str] = mapped_column(
        String(100), nullable=False, default="Inter", server_default="Inter"
    )
    welcome_message: Mapped[str | None] = mapped_column(String(500), nullable=True)
    placeholder_text: Mapped[str] = mapped_column(
        String(200), nullable=False, default="Ask me anything…", server_default="Ask me anything…"
    )
    # "rounded" | "square" | "pill"
    bubble_style: Mapped[str] = mapped_column(
        String(20), nullable=False, default="rounded", server_default="rounded"
    )
    dark_mode: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    # 0 = instant reply; 1-30 = delay in seconds before bot starts "typing"
    reply_delay_seconds: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    ai_paused: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    # Temperature: 0.0 (deterministic) to 1.0 (creative); null = model default
    temperature: Mapped[float | None] = mapped_column(Float, nullable=True)
    # streaming_mode: "normal" | "fast" (fast disables rich content + function calls)
    streaming_mode: Mapped[str] = mapped_column(
        String(20), nullable=False, default="normal", server_default="normal"
    )
    # Max iterations for multi-step agent tool calls (1-20)
    max_agent_steps: Mapped[int] = mapped_column(
        Integer, nullable=False, default=5, server_default="5"
    )

    # ── Voice fields ──────────────────────────────────────────────────────────
    tts_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    stt_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    auto_play_tts: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    # ElevenLabs voice ID
    voice_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    voice_stability: Mapped[float] = mapped_column(
        nullable=False, default=0.5, server_default="0.5"
    )
    voice_similarity_boost: Mapped[float] = mapped_column(
        nullable=False, default=0.75, server_default="0.75"
    )

    # Google Docs system prompt sync — link a Google Doc to use as system prompt
    docs_system_prompt_doc_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    docs_system_prompt_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # A2A authentication — if a2a_auth_required is True, callers must supply a Bearer token
    # from a2a_allowed_tokens (list of accepted token strings, e.g. Google AI API keys)
    a2a_auth_required: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    a2a_allowed_tokens: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=None)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="chatbot_configs")  # type: ignore[name-defined]
    conversations: Mapped[list["Conversation"]] = relationship(  # type: ignore[name-defined]
        "Conversation", back_populates="chatbot", cascade="all, delete-orphan"
    )
    kb_documents: Mapped[list["KnowledgeBaseDocument"]] = relationship(  # type: ignore[name-defined]
        "KnowledgeBaseDocument", back_populates="chatbot", cascade="all, delete-orphan"
    )
    widget_config: Mapped["WidgetConfig | None"] = relationship(  # type: ignore[name-defined]
        "WidgetConfig", back_populates="chatbot", uselist=False, cascade="all, delete-orphan"
    )
    channel_integrations: Mapped[list["ChannelIntegration"]] = relationship(  # type: ignore[name-defined]
        "ChannelIntegration", back_populates="chatbot", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<ChatbotConfig id={self.id} name={self.name!r}>"
