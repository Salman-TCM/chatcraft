"""add starting_node_id to flows

Revision ID: 000000000029
Revises: 000000000028
Create Date: 2026-05-19
"""
from alembic import op
import sqlalchemy as sa

revision = "000000000029"
down_revision = "000000000028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "flows",
        sa.Column("starting_node_id", sa.String(100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("flows", "starting_node_id")
