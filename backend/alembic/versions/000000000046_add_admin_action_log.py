"""add admin_action_logs table

Revision ID: 000000000046
Revises: 000000000045
Create Date: 2026-05-25
"""

import sqlalchemy as sa

from alembic import op

revision = "000000000046"
down_revision = "000000000045"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "admin_action_logs",
        sa.Column(
            "id",
            sa.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "admin_user_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("admin_email", sa.String(320), nullable=False),
        sa.Column(
            "action", sa.String(64), nullable=False
        ),  # role_change | user_delete | impersonate | plan_change | verify_email
        sa.Column("target_user_id", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("target_email", sa.String(320), nullable=True),
        sa.Column("old_value", sa.Text, nullable=True),
        sa.Column("new_value", sa.Text, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_admin_action_logs_admin_user_id", "admin_action_logs", ["admin_user_id"])
    op.create_index("ix_admin_action_logs_created_at", "admin_action_logs", ["created_at"])


def downgrade() -> None:
    op.drop_table("admin_action_logs")
