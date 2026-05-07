"""add payment_failed_at to subscriptions

Revision ID: 000000000006
Revises: 000000000005
Create Date: 2026-05-07 00:00:06.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "000000000006"
down_revision: Union[str, None] = "000000000005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "subscriptions",
        sa.Column("payment_failed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("subscriptions", "payment_failed_at")
