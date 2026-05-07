"""add subscriptions table

Revision ID: 000000000003
Revises: 000000000002
Create Date: 2026-05-07 00:00:03.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "000000000003"
down_revision: Union[str, None] = "000000000002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TYPE subscription_plan AS ENUM (
            'free', 'trial', 'starter', 'pro', 'enterprise'
        )
    """)
    op.execute("""
        CREATE TYPE subscription_state AS ENUM (
            'active', 'trialing', 'past_due', 'canceled',
            'unpaid', 'incomplete', 'incomplete_expired'
        )
    """)

    op.create_table(
        "subscriptions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("stripe_subscription_id", sa.String(255), unique=True, nullable=True),
        sa.Column("stripe_price_id", sa.String(255), nullable=True),
        sa.Column(
            "plan",
            sa.Enum(
                "free", "trial", "starter", "pro", "enterprise",
                name="subscription_plan",
                create_type=False,
            ),
            nullable=False,
            server_default="free",
        ),
        sa.Column(
            "status",
            sa.Enum(
                "active", "trialing", "past_due", "canceled",
                "unpaid", "incomplete", "incomplete_expired",
                name="subscription_state",
                create_type=False,
            ),
            nullable=False,
            server_default="active",
        ),
        sa.Column("current_period_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancel_at_period_end", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("canceled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    op.create_index("ix_subscriptions_user_id", "subscriptions", ["user_id"])
    op.create_index(
        "ix_subscriptions_stripe_subscription_id",
        "subscriptions",
        ["stripe_subscription_id"],
    )

    op.execute(
        """
        CREATE TRIGGER set_subscriptions_updated_at
        BEFORE UPDATE ON subscriptions
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS set_subscriptions_updated_at ON subscriptions")
    op.drop_table("subscriptions")
    op.execute("DROP TYPE IF EXISTS subscription_state")
    op.execute("DROP TYPE IF EXISTS subscription_plan")
