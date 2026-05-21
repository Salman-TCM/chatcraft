"""add white label tables

Revision ID: 000000000024
Revises: 000000000023
Create Date: 2026-05-19
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "000000000024"
down_revision = "000000000023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "platform_config",
        sa.Column("id", sa.Integer(), nullable=False, default=1),
        sa.Column("platform_name", sa.String(100), nullable=False, server_default="ChatCraft AI"),
        sa.Column("logo_url", sa.String(2048), nullable=True),
        sa.Column("support_email", sa.String(255), nullable=False, server_default="support@chatcraft.ai"),
        sa.Column("stripe_account_id", sa.String(100), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute("INSERT INTO platform_config (id) VALUES (1)")

    op.create_table(
        "agencies",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("slug", sa.String(80), nullable=False),
        sa.Column("custom_domain", sa.String(253), nullable=True),
        sa.Column("custom_domain_verified", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("logo_url", sa.String(2048), nullable=True),
        sa.Column("favicon_url", sa.String(2048), nullable=True),
        sa.Column("primary_colour", sa.String(7), nullable=False, server_default="#6366f1"),
        sa.Column("support_email", sa.String(255), nullable=True),
        sa.Column("from_email", sa.String(255), nullable=True),
        sa.Column("smtp_config", postgresql.JSONB(), nullable=True),
        sa.Column("plan", sa.String(20), nullable=False, server_default="starter"),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
        sa.UniqueConstraint("custom_domain"),
    )
    op.create_index("ix_agencies_slug", "agencies", ["slug"])
    op.create_index("ix_agencies_custom_domain", "agencies", ["custom_domain"])
    op.create_index("ix_agencies_owner_user_id", "agencies", ["owner_user_id"])

    op.create_table(
        "tenants",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("agency_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(80), nullable=False),
        sa.Column("plan", sa.String(20), nullable=False, server_default="starter"),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["agency_id"], ["agencies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("agency_id", "slug", name="uq_agency_tenant_slug"),
    )
    op.create_index("ix_tenants_agency_id", "tenants", ["agency_id"])

    op.create_table(
        "impersonation_audit_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("target_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("target_agency_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_agency_id"], ["agencies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_impersonation_audit_log_actor", "impersonation_audit_log", ["actor_user_id"])

    op.create_table(
        "subscriptions_reseller",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("agency_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("client_email", sa.String(255), nullable=False),
        sa.Column("stripe_subscription_id", sa.String(100), nullable=True),
        sa.Column("license_token", sa.String(64), nullable=False),
        sa.Column("plan", sa.String(20), nullable=False, server_default="starter"),
        sa.Column("amount", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["agency_id"], ["agencies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("license_token"),
    )
    op.create_index("ix_subscriptions_reseller_agency_id", "subscriptions_reseller", ["agency_id"])
    op.create_index("ix_subscriptions_reseller_license_token", "subscriptions_reseller", ["license_token"])


def downgrade() -> None:
    op.drop_table("subscriptions_reseller")
    op.drop_table("impersonation_audit_log")
    op.drop_table("tenants")
    op.drop_table("agencies")
    op.drop_table("platform_config")
