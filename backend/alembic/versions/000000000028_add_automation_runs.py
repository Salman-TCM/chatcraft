"""add automation_runs table

Revision ID: 000000000028
Revises: 000000000027
Create Date: 2026-05-19
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "000000000028"
down_revision = "000000000027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "automation_runs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("automation_id", UUID(as_uuid=True), sa.ForeignKey("automations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("trigger_type", sa.String(80), nullable=False),
        sa.Column("action_type", sa.String(80), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="success"),
        sa.Column("error", sa.Text, nullable=True),
        sa.Column("executed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_automation_runs_automation_id", "automation_runs", ["automation_id"])
    op.create_index("ix_automation_runs_executed_at", "automation_runs", ["executed_at"])


def downgrade() -> None:
    op.drop_table("automation_runs")
