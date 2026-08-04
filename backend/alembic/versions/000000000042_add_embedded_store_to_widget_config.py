"""add embedded_store_id to widget_configs

Revision ID: 000000000042
Revises: 000000000041
Create Date: 2026-05-25
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "000000000042"
down_revision = "000000000041"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "widget_configs",
        sa.Column("embedded_store_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_widget_config_embedded_store",
        "widget_configs",
        "commerce_stores",
        ["embedded_store_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_widget_config_embedded_store", "widget_configs", type_="foreignkey")
    op.drop_column("widget_configs", "embedded_store_id")
