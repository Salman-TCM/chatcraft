"""add stripe_connect_account_id to users

Revision ID: 000000000005
Revises: 000000000004
Create Date: 2026-05-07 00:00:05.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "000000000005"
down_revision: Union[str, None] = "000000000004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("stripe_connect_account_id", sa.String(255), nullable=True),
    )
    op.create_unique_constraint(
        "uq_users_stripe_connect_account_id",
        "users",
        ["stripe_connect_account_id"],
    )
    op.create_index(
        "ix_users_stripe_connect_account_id",
        "users",
        ["stripe_connect_account_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_users_stripe_connect_account_id", table_name="users")
    op.drop_constraint("uq_users_stripe_connect_account_id", "users", type_="unique")
    op.drop_column("users", "stripe_connect_account_id")
