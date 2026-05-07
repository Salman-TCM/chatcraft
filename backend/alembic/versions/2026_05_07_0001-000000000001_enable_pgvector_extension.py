"""enable pgvector extension

Revision ID: 000000000001
Revises:
Create Date: 2026-05-07 00:01:00.000000
"""

from alembic import op

revision: str = "000000000001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")


def downgrade() -> None:
    op.execute("DROP EXTENSION IF EXISTS vector")
