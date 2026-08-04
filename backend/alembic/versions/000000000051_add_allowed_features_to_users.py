"""add allowed_features to users

Revision ID: 000000000051
Revises: 000000000050
Create Date: 2026-06-08
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision = "000000000051"
down_revision = "000000000050"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("allowed_features", JSONB, nullable=True, server_default=None),
    )


def downgrade() -> None:
    op.drop_column("users", "allowed_features")
