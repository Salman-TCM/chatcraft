import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Conversation(TimestampMixin, Base):
    __tablename__ = "conversations"

    chatbot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("chatbot_configs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Authenticated user — NULL for guest sessions
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Opaque guest identifier (e.g. fingerprint or session cookie value)
    guest_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)

    title: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Relationships
    chatbot: Mapped["ChatbotConfig"] = relationship(  # type: ignore[name-defined]
        "ChatbotConfig", back_populates="conversations"
    )
    user: Mapped["User | None"] = relationship(  # type: ignore[name-defined]
        "User", back_populates="conversations"
    )
    messages: Mapped[list["Message"]] = relationship(  # type: ignore[name-defined]
        "Message", back_populates="conversation", cascade="all, delete-orphan",
        order_by="Message.created_at"
    )

    def __repr__(self) -> str:
        return f"<Conversation id={self.id} title={self.title!r}>"
