import secrets
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class WidgetLicense(TimestampMixin, Base):
    """Per-client license key granting embed access to a specific widget."""

    __tablename__ = "widget_licenses"

    widget_config_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("widget_configs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Human-readable label so owners know which client this belongs to
    label: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    # The opaque license token sent in data-license attribute
    license_key: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        default=lambda: secrets.token_urlsafe(48),
        unique=True,
        index=True,
    )
    # Optional domain restriction — if set, the key only works on this origin
    allowed_domain: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # active | revoked
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active", server_default="active"
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    widget_config: Mapped["WidgetConfig"] = relationship(  # type: ignore[name-defined]
        "WidgetConfig", back_populates="licenses"
    )
