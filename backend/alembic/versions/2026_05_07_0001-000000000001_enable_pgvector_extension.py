"""enable pgvector extension

Revision ID: 000000000001
Revises:
Create Date: 2026-05-07 00:01:00.000000
"""

from alembic import op
from app.models.base import SET_UPDATED_AT_FUNCTION_SQL

revision: str = "000000000001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute(SET_UPDATED_AT_FUNCTION_SQL)


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS set_updated_at CASCADE")
    op.execute("DROP EXTENSION IF EXISTS vector")
