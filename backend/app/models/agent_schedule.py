import uuid
from datetime import datetime

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class AgentSchedule(TimestampMixin, Base):
    """Cron-style schedule that automatically runs an agent and delivers the result."""

    __tablename__ = "agent_schedules"

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
    trigger_prompt: Mapped[str] = mapped_column(Text, nullable=False)

    hour: Mapped[int] = mapped_column(Integer, nullable=False, default=8)
    minute: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Comma-separated weekday numbers 0=Mon … 6=Sun, or "*" for every day
    days_of_week: Mapped[str] = mapped_column(
        String(20), nullable=False, default="*", server_default="*"
    )

    notify_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    notify_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)

    alert_pct_threshold: Mapped[float | None] = mapped_column(Float, nullable=True)

    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

    # Correctly typed as datetime, not uuid.UUID
    last_run_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_result_preview: Mapped[str | None] = mapped_column(String(500), nullable=True)
