"""add wallet tables

Revision ID: 000000000018
Revises: 000000000017
Create Date: 2026-05-18
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from alembic import op
from app.models.base import drop_updated_at_trigger, set_updated_at_trigger

revision = "000000000018"
down_revision = "000000000017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "wallet_programs",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "chatbot_id",
            UUID(as_uuid=True),
            sa.ForeignKey("chatbot_configs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("config", JSONB, nullable=False, server_default="{}"),
        sa.Column("brand_overrides", JSONB, nullable=False, server_default="{}"),
        sa.Column("google_class_id", sa.String(255), nullable=True),
    )
    op.create_index("ix_wallet_programs_user_id", "wallet_programs", ["user_id"])
    op.create_index("ix_wallet_programs_type", "wallet_programs", ["type"])
    op.create_index("ix_wallet_programs_status", "wallet_programs", ["status"])
    op.execute(set_updated_at_trigger("wallet_programs"))

    op.create_table(
        "wallet_cards",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("serial", sa.String(50), nullable=False, unique=True),
        sa.Column(
            "program_id",
            UUID(as_uuid=True),
            sa.ForeignKey("wallet_programs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "contact_id",
            UUID(as_uuid=True),
            sa.ForeignKey("contacts.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("customer_name", sa.String(255), nullable=True),
        sa.Column("customer_email", sa.String(255), nullable=True),
        sa.Column("customer_phone", sa.String(50), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("state", JSONB, nullable=False, server_default="{}"),
        sa.Column("google_pass_object_id", sa.String(255), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("program_id", "customer_email", name="uq_wallet_card_program_email"),
    )
    op.create_index("ix_wallet_cards_serial", "wallet_cards", ["serial"])
    op.create_index("ix_wallet_cards_program_id", "wallet_cards", ["program_id"])
    op.create_index("ix_wallet_cards_customer_email", "wallet_cards", ["customer_email"])
    op.create_index("ix_wallet_cards_status", "wallet_cards", ["status"])

    op.create_table(
        "wallet_push_subscriptions",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column(
            "card_id",
            UUID(as_uuid=True),
            sa.ForeignKey("wallet_cards.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("device_type", sa.String(10), nullable=False),
        sa.Column("push_token", sa.String(512), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_wallet_push_subs_card_id", "wallet_push_subscriptions", ["card_id"])


def downgrade() -> None:
    op.drop_table("wallet_push_subscriptions")
    op.drop_table("wallet_cards")
    op.execute(drop_updated_at_trigger("wallet_programs"))
    op.drop_table("wallet_programs")
