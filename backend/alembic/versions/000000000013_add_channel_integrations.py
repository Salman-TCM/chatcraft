"""add channel_integrations table

Revision ID: 000000000013
Revises: 000000000012
Create Date: 2026-05-13
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.models.base import set_updated_at_trigger, drop_updated_at_trigger

revision = "000000000013"
down_revision = "000000000012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "channel_integrations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("chatbot_id", UUID(as_uuid=True), sa.ForeignKey("chatbot_configs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("channel", sa.String(50), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("config", JSONB, nullable=False, server_default="{}"),
        sa.Column("webhook_secret", sa.String(200), nullable=True),
        sa.UniqueConstraint("chatbot_id", "channel", name="uq_chatbot_channel"),
    )
    op.create_index("ix_channel_integrations_chatbot_id", "channel_integrations", ["chatbot_id"])
    op.execute(set_updated_at_trigger("channel_integrations"))


def downgrade() -> None:
    op.execute(drop_updated_at_trigger("channel_integrations"))
    op.drop_table("channel_integrations")
