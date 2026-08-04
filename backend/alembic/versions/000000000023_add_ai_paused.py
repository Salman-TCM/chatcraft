"""add ai_paused to chatbot_configs

Revision ID: 000000000023
Revises: 000000000022
Create Date: 2026-05-19
"""

import sqlalchemy as sa

from alembic import op

revision = "000000000023"
down_revision = "000000000022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "chatbot_configs",
        sa.Column("ai_paused", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("chatbot_configs", "ai_paused")
