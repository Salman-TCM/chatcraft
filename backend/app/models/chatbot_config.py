import uuid

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
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

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="chatbot_configs")  # type: ignore[name-defined]
    conversations: Mapped[list["Conversation"]] = relationship(  # type: ignore[name-defined]
        "Conversation", back_populates="chatbot", cascade="all, delete-orphan"
    )
    kb_documents: Mapped[list["KnowledgeBaseDocument"]] = relationship(  # type: ignore[name-defined]
        "KnowledgeBaseDocument", back_populates="chatbot", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<ChatbotConfig id={self.id} name={self.name!r}>"
