"""add google_oauth_tokens to users

Revision ID: 000000000043
Revises: 000000000042
Create Date: 2026-05-25
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "000000000043"
down_revision = "000000000042"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "google_oauth_tokens",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
            server_default=None,
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "google_oauth_tokens")
