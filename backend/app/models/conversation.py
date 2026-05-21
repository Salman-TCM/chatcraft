import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String
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

    # Inbox fields (added in migration 000000000012)
    channel: Mapped[str] = mapped_column(
        Enum("web", "facebook", "instagram", "whatsapp", "telegram", "discord",
             "sms", "phone", "twitter", "tiktok", "email",
             name="conversation_channel"),
        nullable=False,
        default="web",
        server_default="web",
    )
    status: Mapped[str] = mapped_column(
        Enum("active", "closed", "human_takeover", name="conversation_status"),
        nullable=False,
        default="active",
        server_default="active",
    )
    contact_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("contacts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    unread_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    last_message_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    last_user_message_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )

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
    contact: Mapped["Contact | None"] = relationship(  # type: ignore[name-defined]
        "Contact", foreign_keys=[contact_id], lazy="selectin"
    )
    notes: Mapped[list["InternalNote"]] = relationship(  # type: ignore[name-defined]
        "InternalNote", foreign_keys="InternalNote.conversation_id",
        cascade="all, delete-orphan", order_by="InternalNote.created_at"
    )
    assignment: Mapped["InboxAssignment | None"] = relationship(  # type: ignore[name-defined]
        "InboxAssignment", foreign_keys="InboxAssignment.conversation_id",
        uselist=False, cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Conversation id={self.id} channel={self.channel} status={self.status}>"
