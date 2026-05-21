"""add widget_licenses table

Revision ID: 000000000026
Revises: 000000000025
Create Date: 2026-05-19
"""
from alembic import op
import sqlalchemy as sa

revision = "000000000026"
down_revision = "000000000025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "widget_licenses",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.Column("widget_config_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("widget_configs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("label", sa.String(255), nullable=False, server_default=""),
        sa.Column("license_key", sa.String(64), nullable=False, unique=True),
        sa.Column("allowed_domain", sa.String(255), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="active"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_widget_licenses_widget_config_id", "widget_licenses", ["widget_config_id"])
    op.create_index("ix_widget_licenses_license_key", "widget_licenses", ["license_key"], unique=True)


def downgrade() -> None:
    op.drop_table("widget_licenses")
