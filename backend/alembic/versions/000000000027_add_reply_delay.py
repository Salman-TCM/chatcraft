"""add reply_delay_seconds to chatbot_configs

Revision ID: 000000000027
Revises: 000000000026
Create Date: 2026-05-19
"""
from alembic import op
import sqlalchemy as sa

revision = "000000000027"
down_revision = "000000000026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "chatbot_configs",
        sa.Column(
            "reply_delay_seconds",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )


def downgrade() -> None:
    op.drop_column("chatbot_configs", "reply_delay_seconds")
