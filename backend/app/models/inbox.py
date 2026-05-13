import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class ConversationChannel(str, enum.Enum):
    web = "web"
    facebook = "facebook"
    instagram = "instagram"
    whatsapp = "whatsapp"
    telegram = "telegram"
    discord = "discord"
    sms = "sms"
    phone = "phone"
    twitter = "twitter"
    tiktok = "tiktok"
    email = "email"


class ConversationStatus(str, enum.Enum):
    active = "active"
    closed = "closed"
    human_takeover = "human_takeover"


class InternalNote(TimestampMixin, Base):
    __tablename__ = "internal_notes"

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)

    author: Mapped["User | None"] = relationship("User")  # type: ignore[name-defined]


class TeamMember(TimestampMixin, Base):
    __tablename__ = "team_members"
    __table_args__ = (
        UniqueConstraint("owner_user_id", "member_email", name="uq_team_member_email"),
    )

    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    member_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
    )
    member_email: Mapped[str] = mapped_column(String(320), nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="agent", server_default="agent")
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending", server_default="pending")


class InboxAssignment(Base):
    __tablename__ = "inbox_assignments"
    __table_args__ = (
        UniqueConstraint("conversation_id", name="uq_inbox_assignment_conversation"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default="gen_random_uuid()"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    assigned_to_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    assignee: Mapped["User"] = relationship("User")  # type: ignore[name-defined]
