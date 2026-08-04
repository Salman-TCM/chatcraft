"""add superadmin to user_role enum

Revision ID: 000000000052
Revises: 000000000051
Create Date: 2026-06-08
"""

from alembic import op

revision = "000000000052"
down_revision = "000000000051"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # PostgreSQL requires IF NOT EXISTS (pg 9.6+) to make this idempotent
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'superadmin'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values without recreating the type.
    # To downgrade: ensure no rows have role='superadmin', then recreate the enum.
    op.execute("""
        ALTER TABLE users
            ALTER COLUMN role TYPE VARCHAR(50);

        DROP TYPE user_role;

        CREATE TYPE user_role AS ENUM ('free','trial','premium','creator','admin');

        ALTER TABLE users
            ALTER COLUMN role TYPE user_role
            USING role::user_role;
    """)
