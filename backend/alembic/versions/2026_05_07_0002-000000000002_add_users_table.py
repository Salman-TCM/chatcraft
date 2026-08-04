"""add users table

Revision ID: 000000000002
Revises: 000000000001
Create Date: 2026-05-07 00:02:00.000000
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op
from app.models.base import drop_updated_at_trigger, set_updated_at_trigger

revision: str = "000000000002"
down_revision: str = "000000000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=True),
        sa.Column("name", sa.String(255), nullable=True),
        sa.Column("avatar_url", sa.String(2048), nullable=True),
        sa.Column(
            "role",
            sa.Enum("free", "trial", "premium", "creator", "admin", name="user_role"),
            nullable=False,
            server_default="free",
        ),
        sa.Column(
            "email_verified",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("email_verification_token", sa.String(255), nullable=True),
        sa.Column("password_reset_token", sa.String(255), nullable=True),
        sa.Column(
            "password_reset_expires_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column("stripe_customer_id", sa.String(255), nullable=True),
        sa.Column(
            "subscription_status",
            sa.Enum(
                "active",
                "trialing",
                "past_due",
                "canceled",
                "unpaid",
                name="subscription_status",
            ),
            nullable=True,
        ),
        sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("google_id", sa.String(255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # Unique constraints
    op.create_unique_constraint("uq_users_email", "users", ["email"])
    op.create_unique_constraint("uq_users_stripe_customer_id", "users", ["stripe_customer_id"])
    op.create_unique_constraint("uq_users_google_id", "users", ["google_id"])

    # Indexes for frequent lookups
    op.create_index("ix_users_email", "users", ["email"])
    op.create_index("ix_users_stripe_customer_id", "users", ["stripe_customer_id"])
    op.create_index("ix_users_google_id", "users", ["google_id"])
    op.create_index(
        "ix_users_email_verification_token",
        "users",
        ["email_verification_token"],
    )
    op.create_index("ix_users_password_reset_token", "users", ["password_reset_token"])

    # Auto-update updated_at on every row change
    op.execute(set_updated_at_trigger("users"))


def downgrade() -> None:
    op.execute(drop_updated_at_trigger("users"))

    op.drop_index("ix_users_password_reset_token", table_name="users")
    op.drop_index("ix_users_email_verification_token", table_name="users")
    op.drop_index("ix_users_google_id", table_name="users")
    op.drop_index("ix_users_stripe_customer_id", table_name="users")
    op.drop_index("ix_users_email", table_name="users")

    op.drop_constraint("uq_users_google_id", "users", type_="unique")
    op.drop_constraint("uq_users_stripe_customer_id", "users", type_="unique")
    op.drop_constraint("uq_users_email", "users", type_="unique")

    op.drop_table("users")

    op.execute("DROP TYPE IF EXISTS subscription_status")
    op.execute("DROP TYPE IF EXISTS user_role")
