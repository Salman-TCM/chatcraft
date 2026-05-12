"""add usage_logs and analytics_daily tables

Revision ID: 000000000010
Revises: 000000000009
Create Date: 2026-05-12 00:00:10.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.models.base import drop_updated_at_trigger, set_updated_at_trigger

revision: str = "000000000010"
down_revision: Union[str, None] = "000000000009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── usage_logs ────────────────────────────────────────────────────────────
    op.create_table(
        "usage_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("chatbot_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("chatbot_configs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("model", sa.String(100), nullable=True),
        sa.Column("input_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("output_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tts_chars", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("stt_secs", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("embedding_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cost_usd", sa.Numeric(12, 8), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_usage_logs_user_id", "usage_logs", ["user_id"])
    op.create_index("ix_usage_logs_chatbot_id", "usage_logs", ["chatbot_id"])
    op.create_index("ix_usage_logs_created_at", "usage_logs", ["created_at"])

    # ── analytics_daily ───────────────────────────────────────────────────────
    op.create_table(
        "analytics_daily",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("chatbot_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("chatbot_configs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("messages_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("users_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("avg_session_length", sa.Numeric(8, 2), nullable=False, server_default="0"),
        sa.Column("revenue_usd", sa.Numeric(12, 4), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("chatbot_id", "date", name="uq_analytics_daily_chatbot_date"),
    )
    op.create_index("ix_analytics_daily_chatbot_id", "analytics_daily", ["chatbot_id"])
    op.create_index("ix_analytics_daily_date", "analytics_daily", ["date"])
    op.execute(set_updated_at_trigger("analytics_daily"))


def downgrade() -> None:
    op.execute(drop_updated_at_trigger("analytics_daily"))
    op.drop_index("ix_analytics_daily_date", table_name="analytics_daily")
    op.drop_index("ix_analytics_daily_chatbot_id", table_name="analytics_daily")
    op.drop_table("analytics_daily")

    op.drop_index("ix_usage_logs_created_at", table_name="usage_logs")
    op.drop_index("ix_usage_logs_chatbot_id", table_name="usage_logs")
    op.drop_index("ix_usage_logs_user_id", table_name="usage_logs")
    op.drop_table("usage_logs")
