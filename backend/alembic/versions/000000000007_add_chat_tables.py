"""add chat tables: chatbot_configs, conversations, messages

Revision ID: 000000000007
Revises: 000000000006
Create Date: 2026-05-11 00:00:07.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op
from app.models.base import drop_updated_at_trigger, set_updated_at_trigger

revision: str = "000000000007"
down_revision: str | None = "000000000006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── chatbot_configs ──────────────────────────────────────────────────────
    op.create_table(
        "chatbot_configs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column(
            "default_model", sa.String(100), server_default="claude-sonnet-4-6", nullable=False
        ),
        sa.Column("fallback_model", sa.String(100), nullable=True),
        sa.Column("allow_model_switch", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("published", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("system_prompt", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_chatbot_configs_user_id", "chatbot_configs", ["user_id"])
    op.execute(set_updated_at_trigger("chatbot_configs"))

    # ── conversations ────────────────────────────────────────────────────────
    op.create_table(
        "conversations",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("chatbot_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("guest_id", sa.String(255), nullable=True),
        sa.Column("title", sa.String(500), nullable=True),
        sa.ForeignKeyConstraint(["chatbot_id"], ["chatbot_configs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_conversations_chatbot_id", "conversations", ["chatbot_id"])
    op.create_index("ix_conversations_user_id", "conversations", ["user_id"])
    op.create_index("ix_conversations_guest_id", "conversations", ["guest_id"])
    op.execute(set_updated_at_trigger("conversations"))

    # ── message_role enum ────────────────────────────────────────────────────
    message_role_enum = postgresql.ENUM(
        "system", "user", "assistant", name="message_role", create_type=False
    )
    message_role_enum.create(op.get_bind(), checkfirst=True)

    message_feedback_enum = postgresql.ENUM(
        "thumbs_up", "thumbs_down", name="message_feedback", create_type=False
    )
    message_feedback_enum.create(op.get_bind(), checkfirst=True)

    # ── messages ─────────────────────────────────────────────────────────────
    op.create_table(
        "messages",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "role",
            postgresql.ENUM("system", "user", "assistant", name="message_role", create_type=False),
            nullable=False,
        ),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("model", sa.String(100), nullable=True),
        sa.Column("input_tokens", sa.Integer(), server_default="0", nullable=False),
        sa.Column("output_tokens", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "cost_usd", sa.Numeric(precision=14, scale=8), server_default="0", nullable=False
        ),
        sa.Column(
            "feedback",
            postgresql.ENUM("thumbs_up", "thumbs_down", name="message_feedback", create_type=False),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_messages_conversation_id", "messages", ["conversation_id"])
    op.execute(set_updated_at_trigger("messages"))


def downgrade() -> None:
    op.execute(drop_updated_at_trigger("messages"))
    op.drop_index("ix_messages_conversation_id", table_name="messages")
    op.drop_table("messages")
    op.execute("DROP TYPE IF EXISTS message_feedback")
    op.execute("DROP TYPE IF EXISTS message_role")

    op.execute(drop_updated_at_trigger("conversations"))
    op.drop_index("ix_conversations_guest_id", table_name="conversations")
    op.drop_index("ix_conversations_user_id", table_name="conversations")
    op.drop_index("ix_conversations_chatbot_id", table_name="conversations")
    op.drop_table("conversations")

    op.execute(drop_updated_at_trigger("chatbot_configs"))
    op.drop_index("ix_chatbot_configs_user_id", table_name="chatbot_configs")
    op.drop_table("chatbot_configs")
