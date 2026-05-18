import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class BrowserSession(TimestampMixin, Base):
    """Cloud browser session for the Browser Agent feature."""

    __tablename__ = "browser_sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    session_token: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    # active | closed | expired
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="active")
    pages_visited: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    max_pages: Mapped[int] = mapped_column(Integer, nullable=False, default=5, server_default="5")
    # allow_login, private, block_private_ips, mode (direct|research|form_fill)
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    external_session_id: Mapped[str | None] = mapped_column(String(256), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship("User", lazy="noload")  # type: ignore[name-defined]
