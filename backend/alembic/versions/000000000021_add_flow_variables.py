"""add flow variables table

Revision ID: 000000000021
Revises: 000000000020
Create Date: 2026-05-19
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "000000000021"
down_revision = "000000000020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "flow_variables",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column(
            "flow_run_id",
            UUID(as_uuid=True),
            sa.ForeignKey("flow_runs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("key", sa.String(100), nullable=False),
        sa.Column("value", sa.Text, nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_flow_variables_run_id", "flow_variables", ["flow_run_id"])


def downgrade() -> None:
    op.drop_table("flow_variables")
