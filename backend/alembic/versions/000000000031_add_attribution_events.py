"""Add attribution_events table

Revision ID: 000000000031
Revises: 000000000030
Create Date: 2026-05-19
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "000000000031"
down_revision = "000000000030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "attribution_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("landing_page_id", UUID(as_uuid=True), sa.ForeignKey("landing_pages.id", ondelete="SET NULL"), nullable=True),
        sa.Column("contact_id", UUID(as_uuid=True), sa.ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("touch_type", sa.String(20), nullable=False, server_default="first"),
        sa.Column("ref", sa.String(255), nullable=True),
        sa.Column("utm_source", sa.String(255), nullable=True),
        sa.Column("utm_medium", sa.String(255), nullable=True),
        sa.Column("utm_campaign", sa.String(255), nullable=True),
        sa.Column("utm_content", sa.String(255), nullable=True),
        sa.Column("utm_term", sa.String(255), nullable=True),
        sa.Column("page_slug", sa.String(255), nullable=True),
        sa.Column("session_id", sa.String(64), nullable=True),
        sa.Column("ip_hash", sa.String(64), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_attribution_events_user_id", "attribution_events", ["user_id"])
    op.create_index("ix_attribution_events_landing_page_id", "attribution_events", ["landing_page_id"])
    op.create_index("ix_attribution_events_contact_id", "attribution_events", ["contact_id"])
    op.create_index("ix_attribution_events_occurred_at", "attribution_events", ["occurred_at"])


def downgrade() -> None:
    op.drop_table("attribution_events")
