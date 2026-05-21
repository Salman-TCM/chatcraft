"""add user_api_keys table

Revision ID: 000000000025
Revises: 000000000024
Create Date: 2026-05-19
"""
from alembic import op
import sqlalchemy as sa

revision = "000000000025"
down_revision = "000000000024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_api_keys",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.Column("user_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("api_key_encrypted", sa.String(1000), nullable=False),
        sa.UniqueConstraint("user_id", "provider", name="uq_user_api_key_provider"),
    )


def downgrade() -> None:
    op.drop_table("user_api_keys")
