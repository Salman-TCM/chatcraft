"""add persistent_menu to widget_configs

Revision ID: 000000000038
Revises: 000000000037
Create Date: 2026-05-21
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "000000000038"
down_revision = "000000000037"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "widget_configs",
        sa.Column("persistent_menu", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("widget_configs", "persistent_menu")
