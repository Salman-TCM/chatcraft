"""add inbox: channel/status on conversations, assignments, team_members, internal_notes

Revision ID: 000000000012
Revises: 000000000011
Create Date: 2026-05-13 00:00:12.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op
from app.models.base import drop_updated_at_trigger, set_updated_at_trigger

revision: str = "000000000012"
down_revision: str | None = "000000000011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Create enum types explicitly first (asyncpg does not auto-create them)
    op.execute(
        "CREATE TYPE conversation_channel AS ENUM "
        "('web','facebook','instagram','whatsapp','telegram','discord','sms','phone','twitter','tiktok','email')"
    )
    op.execute("CREATE TYPE conversation_status AS ENUM ('active','closed','human_takeover')")

    # ── Extend conversations ───────────────────────────────────────────────────
    op.add_column(
        "conversations",
        sa.Column(
            "channel",
            sa.Enum(name="conversation_channel", create_type=False),
            nullable=False,
            server_default="web",
        ),
    )
    op.add_column(
        "conversations",
        sa.Column(
            "status",
            sa.Enum(name="conversation_status", create_type=False),
            nullable=False,
            server_default="active",
        ),
    )
    # Link conversation to a CRM contact (optional)
    op.add_column(
        "conversations",
        sa.Column(
            "contact_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("contacts.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "conversations",
        sa.Column(
            "unread_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "conversations",
        sa.Column(
            "last_message_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.create_index("ix_conversations_status", "conversations", ["status"])
    op.create_index("ix_conversations_channel", "conversations", ["channel"])
    op.create_index("ix_conversations_contact_id", "conversations", ["contact_id"])
    op.create_index("ix_conversations_last_message_at", "conversations", ["last_message_at"])

    # ── internal_notes ─────────────────────────────────────────────────────────
    op.create_table(
        "internal_notes",
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
        sa.Column(
            "conversation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("conversations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "author_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("content", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_internal_notes_conversation_id", "internal_notes", ["conversation_id"])
    op.execute(set_updated_at_trigger("internal_notes"))

    # ── team_members ───────────────────────────────────────────────────────────
    op.create_table(
        "team_members",
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
        sa.Column(
            "owner_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "member_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("member_email", sa.String(320), nullable=False),
        sa.Column("role", sa.String(50), nullable=False, server_default="agent"),
        sa.Column("status", sa.String(50), nullable=False, server_default="pending"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("owner_user_id", "member_email", name="uq_team_member_email"),
    )
    op.create_index("ix_team_members_owner_user_id", "team_members", ["owner_user_id"])
    op.execute(set_updated_at_trigger("team_members"))

    # ── inbox_assignments ──────────────────────────────────────────────────────
    op.create_table(
        "inbox_assignments",
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
            "conversation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("conversations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "assigned_to_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("conversation_id", name="uq_inbox_assignment_conversation"),
    )
    op.create_index(
        "ix_inbox_assignments_conversation_id", "inbox_assignments", ["conversation_id"]
    )
    op.create_index(
        "ix_inbox_assignments_assigned_to", "inbox_assignments", ["assigned_to_user_id"]
    )


def downgrade() -> None:
    op.drop_table("inbox_assignments")
    op.execute(drop_updated_at_trigger("team_members"))
    op.drop_table("team_members")
    op.execute(drop_updated_at_trigger("internal_notes"))
    op.drop_table("internal_notes")
    op.drop_index("ix_conversations_last_message_at", "conversations")
    op.drop_index("ix_conversations_contact_id", "conversations")
    op.drop_index("ix_conversations_channel", "conversations")
    op.drop_index("ix_conversations_status", "conversations")
    op.drop_column("conversations", "last_message_at")
    op.drop_column("conversations", "unread_count")
    op.drop_column("conversations", "contact_id")
    op.drop_column("conversations", "status")
    op.drop_column("conversations", "channel")
    op.execute("DROP TYPE IF EXISTS conversation_status")
    op.execute("DROP TYPE IF EXISTS conversation_channel")
