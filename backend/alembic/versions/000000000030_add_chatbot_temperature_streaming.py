"""Add temperature, streaming_mode, max_agent_steps to chatbot_configs

Revision ID: 000000000030
Revises: 000000000029
Create Date: 2026-05-19
"""
from alembic import op
import sqlalchemy as sa

revision = "000000000030"
down_revision = "000000000029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "chatbot_configs",
        sa.Column("temperature", sa.Float(), nullable=True),
    )
    op.add_column(
        "chatbot_configs",
        sa.Column(
            "streaming_mode",
            sa.String(20),
            nullable=False,
            server_default="normal",
        ),
    )
    op.add_column(
        "chatbot_configs",
        sa.Column(
            "max_agent_steps",
            sa.Integer(),
            nullable=False,
            server_default="5",
        ),
    )


def downgrade() -> None:
    op.drop_column("chatbot_configs", "max_agent_steps")
    op.drop_column("chatbot_configs", "streaming_mode")
    op.drop_column("chatbot_configs", "temperature")
