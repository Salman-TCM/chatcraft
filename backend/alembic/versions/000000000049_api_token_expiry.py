"""api token expiry

Revision ID: 000000000049
Revises: 000000000048
Create Date: 2026-05-25
"""
from alembic import op
import sqlalchemy as sa

revision = "000000000049"
down_revision = "000000000048"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "api_tokens",
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("api_tokens", "expires_at")
