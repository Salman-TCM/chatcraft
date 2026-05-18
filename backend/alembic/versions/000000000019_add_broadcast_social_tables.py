"""add broadcast, social, and comment automation tables

Revision ID: 000000000019
Revises: 000000000018
Create Date: 2026-05-18
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.models.base import set_updated_at_trigger, drop_updated_at_trigger

revision = "000000000019"
down_revision = "000000000018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "broadcast_campaigns",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("channel", sa.String(30), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("message_template", sa.Text, nullable=False, server_default=""),
        sa.Column("html_content", sa.Text, nullable=True),
        sa.Column("subject", sa.String(500), nullable=True),
        sa.Column("target_filter", JSONB, nullable=False, server_default="{}"),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("failed_count", sa.Integer, nullable=False, server_default="0"),
    )
    op.create_index("ix_broadcast_campaigns_user_id", "broadcast_campaigns", ["user_id"])
    op.create_index("ix_broadcast_campaigns_channel", "broadcast_campaigns", ["channel"])
    op.create_index("ix_broadcast_campaigns_status", "broadcast_campaigns", ["status"])
    op.execute(set_updated_at_trigger("broadcast_campaigns"))

    op.create_table(
        "social_accounts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("platform", sa.String(20), nullable=False),
        sa.Column("account_id", sa.String(255), nullable=False),
        sa.Column("access_token", sa.Text, nullable=False),
        sa.Column("token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("avatar_url", sa.String(1000), nullable=True),
        sa.Column("page_id", sa.String(255), nullable=True),
        sa.Column("page_access_token", sa.Text, nullable=True),
    )
    op.create_index("ix_social_accounts_user_id", "social_accounts", ["user_id"])
    op.create_index("ix_social_accounts_platform", "social_accounts", ["platform"])
    op.execute(set_updated_at_trigger("social_accounts"))

    op.create_table(
        "social_posts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_ids", JSONB, nullable=False, server_default="[]"),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("image_url", sa.String(1000), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("platform_post_ids", JSONB, nullable=False, server_default="{}"),
        sa.Column("error_log", sa.Text, nullable=True),
    )
    op.create_index("ix_social_posts_user_id", "social_posts", ["user_id"])
    op.create_index("ix_social_posts_status", "social_posts", ["status"])
    op.execute(set_updated_at_trigger("social_posts"))

    op.create_table(
        "comment_automations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("platform", sa.String(20), nullable=False),
        sa.Column("page_id", sa.String(255), nullable=False),
        sa.Column("page_name", sa.String(255), nullable=True),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("ai_prompt", sa.Text, nullable=True),
        sa.Column("response_type", sa.String(10), nullable=False, server_default="ai"),
        sa.Column("response_text", sa.Text, nullable=True),
        sa.Column("keyword_triggers", JSONB, nullable=False, server_default="[]"),
        sa.Column("delay_seconds", sa.Integer, nullable=False, server_default="0"),
        sa.Column("also_send_dm", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("dm_message", sa.Text, nullable=True),
    )
    op.create_index("ix_comment_automations_user_id", "comment_automations", ["user_id"])
    op.create_index("ix_comment_automations_page_id", "comment_automations", ["page_id"])
    op.execute(set_updated_at_trigger("comment_automations"))


def downgrade() -> None:
    op.execute(drop_updated_at_trigger("comment_automations"))
    op.drop_table("comment_automations")
    op.execute(drop_updated_at_trigger("social_posts"))
    op.drop_table("social_posts")
    op.execute(drop_updated_at_trigger("social_accounts"))
    op.drop_table("social_accounts")
    op.execute(drop_updated_at_trigger("broadcast_campaigns"))
    op.drop_table("broadcast_campaigns")
