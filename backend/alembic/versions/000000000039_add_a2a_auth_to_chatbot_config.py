"""add A2A auth fields to chatbot_configs

Revision ID: 000000000039
Revises: 000000000038
Create Date: 2026-05-21
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "000000000039"
down_revision = "000000000038"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "chatbot_configs",
        sa.Column("a2a_auth_required", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "chatbot_configs",
        sa.Column("a2a_allowed_tokens", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("chatbot_configs", "a2a_allowed_tokens")
    op.drop_column("chatbot_configs", "a2a_auth_required")
