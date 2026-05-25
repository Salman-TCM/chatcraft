"""agent memory conversations table + webhook_url on agents

Revision ID: 000000000047
Revises: 000000000046
Create Date: 2026-05-25
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "000000000047"
down_revision = "000000000046"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Persisted memory sessions
    op.create_table(
        "agent_conversations",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("agent_id", sa.UUID(as_uuid=True), sa.ForeignKey("agents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("messages", JSONB, nullable=False, server_default="[]"),
        sa.Column("tool_calls", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_agent_conversations_agent_id", "agent_conversations", ["agent_id"])
    op.create_index("ix_agent_conversations_user_id", "agent_conversations", ["user_id"])
    op.create_index("ix_agent_conversations_created_at", "agent_conversations", ["created_at"])

    # Webhook URL on agents
    op.add_column("agents", sa.Column("webhook_url", sa.String(2048), nullable=True))

    # agent_id on usage_logs for per-agent analytics
    op.add_column("usage_logs", sa.Column("agent_id", sa.UUID(as_uuid=True), sa.ForeignKey("agents.id", ondelete="SET NULL"), nullable=True))
    op.create_index("ix_usage_logs_agent_id", "usage_logs", ["agent_id"])


def downgrade() -> None:
    op.drop_index("ix_usage_logs_agent_id", "usage_logs")
    op.drop_column("usage_logs", "agent_id")
    op.drop_column("agents", "webhook_url")
    op.drop_table("agent_conversations")
