import secrets
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Form(TimestampMixin, Base):
    __tablename__ = "forms"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    chatbot_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chatbot_configs.id", ondelete="SET NULL"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # [{id, type, label, placeholder, required, options, help_text}]
    fields: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    success_message: Mapped[str] = mapped_column(
        String(500), nullable=False,
        default="Thank you! We'll be in touch.", server_default="Thank you! We'll be in touch."
    )
    submit_button_text: Mapped[str] = mapped_column(
        String(100), nullable=False, default="Submit", server_default="Submit"
    )
    # URL-safe public identifier (e.g. abc123xyz)
    public_id: Mapped[str] = mapped_column(String(24), nullable=False, unique=True, index=True)


class FormSubmission(Base):
    __tablename__ = "form_submissions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default="gen_random_uuid()",
    )
    form_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("forms.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    contact_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="SET NULL"),
        nullable=True,
    )
    data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default="now()",
    )
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)


class LandingPage(TimestampMixin, Base):
    __tablename__ = "landing_pages"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    chatbot_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chatbot_configs.id", ondelete="SET NULL"),
        nullable=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # URL slug (unique per user)
    slug: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    # Short alphanumeric ID for QR codes
    short_id: Mapped[str] = mapped_column(String(12), nullable=False, unique=True, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    html_content: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="''")
    # light / dark
    theme: Mapped[str] = mapped_column(String(20), nullable=False, default="light", server_default="light")
    primary_color: Mapped[str] = mapped_column(String(7), nullable=False, default="#6366f1", server_default="#6366f1")
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    seo_meta: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    scan_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
