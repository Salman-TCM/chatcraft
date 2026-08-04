import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class AdminActionLog(Base):
    """Immutable audit record for every admin mutation (role changes, deletions, impersonation)."""

    __tablename__ = "admin_action_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default="gen_random_uuid()"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Who did it
    admin_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    admin_email: Mapped[str] = mapped_column(String(320), nullable=False)

    # What happened
    action: Mapped[str] = mapped_column(String(64), nullable=False)

    # Who was affected
    target_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    target_email: Mapped[str | None] = mapped_column(String(320), nullable=True)

    # Before / after values (serialised as strings)
    old_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_value: Mapped[str | None] = mapped_column(Text, nullable=True)

    admin: Mapped["User | None"] = relationship("User", foreign_keys=[admin_user_id])  # type: ignore[name-defined]
