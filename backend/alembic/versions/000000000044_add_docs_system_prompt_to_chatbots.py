"""add docs_system_prompt_doc_id to chatbot_configs

Revision ID: 000000000044
Revises: 000000000043
Create Date: 2026-05-25
"""

import sqlalchemy as sa

from alembic import op

revision = "000000000044"
down_revision = "000000000043"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "chatbot_configs",
        sa.Column("docs_system_prompt_doc_id", sa.String(255), nullable=True),
    )
    # Timestamp of last successful sync
    op.add_column(
        "chatbot_configs",
        sa.Column("docs_system_prompt_synced_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("chatbot_configs", "docs_system_prompt_synced_at")
    op.drop_column("chatbot_configs", "docs_system_prompt_doc_id")
