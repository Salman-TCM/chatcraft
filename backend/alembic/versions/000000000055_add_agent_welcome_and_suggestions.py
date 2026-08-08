"""add welcome_message and suggestions_enabled to agents

Revision ID: 000000000055
Revises: 000000000054
Create Date: 2026-08-08 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "000000000055"
down_revision: str | None = "000000000054"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "agents",
        sa.Column("welcome_message", sa.String(length=500), nullable=True),
    )
    op.add_column(
        "agents",
        sa.Column(
            "suggestions_enabled",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )


def downgrade() -> None:
    op.drop_column("agents", "suggestions_enabled")
    op.drop_column("agents", "welcome_message")
