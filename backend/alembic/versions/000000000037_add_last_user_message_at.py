"""Add last_user_message_at to conversations for Meta 24-hour window enforcement

Revision ID: 000000000037
Revises: 000000000036
Create Date: 2026-05-21
"""
from alembic import op
import sqlalchemy as sa

revision = "000000000037"
down_revision = "000000000036"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "conversations",
        sa.Column("last_user_message_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_conversations_last_user_message_at",
        "conversations",
        ["last_user_message_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_conversations_last_user_message_at", "conversations")
    op.drop_column("conversations", "last_user_message_at")
