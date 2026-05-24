"""add agent share token and sms tool flag

Revision ID: 000000000045
Revises: 000000000044
Create Date: 2026-05-25
"""
from alembic import op
import sqlalchemy as sa

revision = "000000000045"
down_revision = "000000000044"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("agents", sa.Column(
        "share_enabled",
        sa.Boolean(),
        nullable=False,
        server_default="false",
    ))
    op.add_column("agents", sa.Column(
        "share_token",
        sa.String(64),
        nullable=True,
    ))
    op.create_unique_constraint("uq_agents_share_token", "agents", ["share_token"])


def downgrade() -> None:
    op.drop_constraint("uq_agents_share_token", "agents", type_="unique")
    op.drop_column("agents", "share_token")
    op.drop_column("agents", "share_enabled")
