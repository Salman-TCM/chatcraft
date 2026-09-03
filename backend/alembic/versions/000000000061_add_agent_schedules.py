"""add agent_schedules table

Revision ID: 000000000061
Revises: 000000000060
Create Date: 2026-09-04
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.models.base import set_updated_at_trigger, drop_updated_at_trigger

revision = "000000000061"
down_revision = "000000000060"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_schedules",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("agent_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("trigger_prompt", sa.Text(), nullable=False),
        sa.Column("hour", sa.Integer(), nullable=False, server_default="8"),
        sa.Column("minute", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("days_of_week", sa.String(20), nullable=False, server_default="*"),
        sa.Column("notify_email", sa.String(320), nullable=True),
        sa.Column("notify_phone", sa.String(30), nullable=True),
        sa.Column("alert_pct_threshold", sa.Float(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_result_preview", sa.String(500), nullable=True),
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agent_schedules_agent_id", "agent_schedules", ["agent_id"])
    op.create_index("ix_agent_schedules_user_id", "agent_schedules", ["user_id"])
    op.execute(set_updated_at_trigger("agent_schedules"))


def downgrade() -> None:
    op.execute(drop_updated_at_trigger("agent_schedules"))
    op.drop_index("ix_agent_schedules_user_id", "agent_schedules")
    op.drop_index("ix_agent_schedules_agent_id", "agent_schedules")
    op.drop_table("agent_schedules")
