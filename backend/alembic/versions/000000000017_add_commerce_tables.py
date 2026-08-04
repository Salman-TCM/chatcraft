"""add commerce tables

Revision ID: 000000000017
Revises: 000000000016
Create Date: 2026-05-18
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from alembic import op
from app.models.base import drop_updated_at_trigger, set_updated_at_trigger

revision = "000000000017"
down_revision = "000000000016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "commerce_stores",
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
        sa.Column("slug", sa.String(200), nullable=False, unique=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("primary_color", sa.String(7), nullable=False, server_default="#6366f1"),
        sa.Column("default_view_mode", sa.String(10), nullable=False, server_default="grid"),
        sa.Column("payment_provider", sa.String(50), nullable=False, server_default="stripe"),
        sa.Column("google_sheet_id", sa.String(255), nullable=True),
    )
    op.create_index("ix_commerce_stores_user_id", "commerce_stores", ["user_id"])
    op.create_index("ix_commerce_stores_slug", "commerce_stores", ["slug"])
    op.execute(set_updated_at_trigger("commerce_stores"))

    op.create_table(
        "commerce_products",
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
            "store_id",
            UUID(as_uuid=True),
            sa.ForeignKey("commerce_stores.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("price", sa.Numeric(12, 2), nullable=False),
        sa.Column("compare_at_price", sa.Numeric(12, 2), nullable=True),
        sa.Column("image_url", sa.String(1000), nullable=True),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("sku", sa.String(100), nullable=True),
        sa.Column("in_stock", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("metadata", JSONB, nullable=False, server_default="{}"),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
    )
    op.create_index("ix_commerce_products_store_id", "commerce_products", ["store_id"])
    op.create_index("ix_commerce_products_category", "commerce_products", ["category"])
    op.execute(set_updated_at_trigger("commerce_products"))

    op.create_table(
        "commerce_payments",
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
            "store_id",
            UUID(as_uuid=True),
            sa.ForeignKey("commerce_stores.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
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
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("stripe_payment_intent_id", sa.String(255), nullable=True, unique=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("items", JSONB, nullable=False, server_default="[]"),
        sa.Column("metadata", JSONB, nullable=False, server_default="{}"),
    )
    op.create_index("ix_commerce_payments_store_id", "commerce_payments", ["store_id"])
    op.create_index("ix_commerce_payments_user_id", "commerce_payments", ["user_id"])
    op.create_index("ix_commerce_payments_status", "commerce_payments", ["status"])
    op.create_index("ix_commerce_payments_customer_email", "commerce_payments", ["customer_email"])
    op.execute(set_updated_at_trigger("commerce_payments"))


def downgrade() -> None:
    op.execute(drop_updated_at_trigger("commerce_payments"))
    op.drop_table("commerce_payments")
    op.execute(drop_updated_at_trigger("commerce_products"))
    op.drop_table("commerce_products")
    op.execute(drop_updated_at_trigger("commerce_stores"))
    op.drop_table("commerce_stores")
