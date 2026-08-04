"""add mcp and browser session tables

Revision ID: 000000000020
Revises: 000000000019
Create Date: 2026-05-18
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from alembic import op
from app.models.base import drop_updated_at_trigger, set_updated_at_trigger

revision = "000000000020"
down_revision = "000000000019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "mcp_server_configs",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "chatbot_id",
            UUID(as_uuid=True),
            sa.ForeignKey("chatbot_configs.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("server_url", sa.String(2048), nullable=False),
        sa.Column("auth_type", sa.String(50), nullable=False, server_default="none"),
        sa.Column("auth_config", JSONB, nullable=False, server_default="{}"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_mcp_server_configs_user_id", "mcp_server_configs", ["user_id"])
    op.create_index("ix_mcp_server_configs_chatbot_id", "mcp_server_configs", ["chatbot_id"])
    op.execute(set_updated_at_trigger("mcp_server_configs"))

    op.create_table(
        "browser_sessions",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("session_token", sa.String(128), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("pages_visited", sa.Integer, nullable=False, server_default="0"),
        sa.Column("max_pages", sa.Integer, nullable=False, server_default="5"),
        sa.Column("config", JSONB, nullable=False, server_default="{}"),
        sa.Column("external_session_id", sa.String(256), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_unique_constraint("uq_browser_sessions_token", "browser_sessions", ["session_token"])
    op.create_index("ix_browser_sessions_user_id", "browser_sessions", ["user_id"])
    op.execute(set_updated_at_trigger("browser_sessions"))


def downgrade() -> None:
    op.execute(drop_updated_at_trigger("browser_sessions"))
    op.drop_table("browser_sessions")
    op.execute(drop_updated_at_trigger("mcp_server_configs"))
    op.drop_table("mcp_server_configs")
