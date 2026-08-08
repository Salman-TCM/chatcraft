"""add base_url column to user_api_keys for self-hosted provider

Revision ID: 000000000054
Revises: 000000000053
Create Date: 2026-08-08 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "000000000054"
down_revision: str | None = "000000000053"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user_api_keys",
        sa.Column("base_url", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("user_api_keys", "base_url")
