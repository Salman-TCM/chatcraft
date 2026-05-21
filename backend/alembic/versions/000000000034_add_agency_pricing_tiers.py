"""Add agency_pricing_tiers table

Revision ID: 000000000034
Revises: 000000000033
Create Date: 2026-05-21
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "000000000034"
down_revision = "000000000033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agency_pricing_tiers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("agency_id", UUID(as_uuid=True), sa.ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("plan_key", sa.String(50), nullable=False),
        sa.Column("display_name", sa.String(100), nullable=False),
        sa.Column("price_monthly", sa.Integer, nullable=False, server_default="0"),
        sa.Column("price_yearly", sa.Integer, nullable=False, server_default="0"),
        sa.Column("features", JSONB, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("agency_id", "plan_key", name="uq_agency_plan_key"),
    )


def downgrade() -> None:
    op.drop_table("agency_pricing_tiers")
