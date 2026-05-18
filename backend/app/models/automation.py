import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Automation(TimestampMixin, Base):
    __tablename__ = "automations"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Trigger
    trigger_type: Mapped[str] = mapped_column(String(80), nullable=False)
    # e.g. {tag: "VIP"} for tag_added; {} for new_contact
    trigger_config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    # Action
    action_type: Mapped[str] = mapped_column(String(80), nullable=False)
    # e.g. {flow_id: "..."} for trigger_flow; {text: "Hello!"} for send_message
    action_config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    execution_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    last_executed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class Sequence(TimestampMixin, Base):
    __tablename__ = "sequences"

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
    auto_enroll: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    # stop / pause / continue (behaviour when contact replies mid-sequence)
    reply_behavior: Mapped[str] = mapped_column(String(20), nullable=False, default="stop", server_default="stop")
    # [{id, delay_amount, delay_unit, message_text, flow_id, condition}]
    steps: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)


class SequenceEnrollment(Base):
    __tablename__ = "sequence_enrollments"
    __table_args__ = (UniqueConstraint("sequence_id", "contact_id", name="uq_seq_enrollment"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default="gen_random_uuid()",
    )
    sequence_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sequences.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    contact_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    # active / completed / cancelled / paused
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", server_default="active")
    current_step: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    enrolled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()", nullable=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class Keyword(TimestampMixin, Base):
    __tablename__ = "keywords"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    chatbot_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chatbot_configs.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    # ["hello", "hi", "hey"]
    keywords: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    # exact / contains / starts_with
    match_type: Mapped[str] = mapped_column(String(20), nullable=False, default="contains", server_default="contains")
    # text / flow
    response_type: Mapped[str] = mapped_column(String(20), nullable=False, default="text", server_default="text")
    response_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    flow_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("flows.id", ondelete="SET NULL"), nullable=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
