import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Flow(TimestampMixin, Base):
    __tablename__ = "flows"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    chatbot_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chatbot_configs.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    # Trigger config
    trigger_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # keyword/webhook/manual
    trigger_config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    # Graph
    nodes: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    edges: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    # Webhook
    webhook_secret: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    runs: Mapped[list["FlowRun"]] = relationship(
        "FlowRun", back_populates="flow", cascade="all, delete-orphan"
    )


class FlowRun(Base):
    __tablename__ = "flow_runs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True,
        server_default="gen_random_uuid()",
    )
    flow_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("flows.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    contact_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    conversation_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="running", server_default="running"
    )  # running / waiting / completed / failed / cancelled
    current_node_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    context: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default="now()",
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    resumed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    flow: Mapped["Flow"] = relationship("Flow", back_populates="runs")
    variables: Mapped[list["FlowVariable"]] = relationship(
        "FlowVariable", back_populates="run", cascade="all, delete-orphan"
    )


class FlowVariable(Base):
    __tablename__ = "flow_variables"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True,
        server_default="gen_random_uuid()",
    )
    flow_run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("flow_runs.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    key: Mapped[str] = mapped_column(String(100), nullable=False)
    value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default="now()",
    )

    run: Mapped["FlowRun"] = relationship("FlowRun", back_populates="variables")
