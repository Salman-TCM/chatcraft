"""add agent integrations and integration credentials tables

Revision ID: 000000000058
Revises: 000000000057
Create Date: 2026-08-18
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "000000000058"
down_revision = "000000000057"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── integration_credentials ───────────────────────────────────────────────
    op.create_table(
        "integration_credentials",
        sa.Column("id",              postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at",      sa.DateTime(timezone=True),    server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at",      sa.DateTime(timezone=True),    server_default=sa.func.now(), nullable=False),
        sa.Column("user_id",         postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name",            sa.String(255),                nullable=False),
        sa.Column("auth_type",       sa.String(20),                 nullable=False, server_default="bearer"),
        sa.Column("auth_header",     sa.String(100),                nullable=True),
        sa.Column("encrypted_value", sa.Text(),                     nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_integration_credentials_user_id", "integration_credentials", ["user_id"])

    # ── agent_integrations ────────────────────────────────────────────────────
    op.create_table(
        "agent_integrations",
        sa.Column("id",                   postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at",           sa.DateTime(timezone=True),    server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at",           sa.DateTime(timezone=True),    server_default=sa.func.now(), nullable=False),
        sa.Column("agent_id",             postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id",              postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name",                 sa.String(255),                nullable=False),
        sa.Column("integration_type",     sa.String(50),                 nullable=False),
        sa.Column("base_url",             sa.String(2048),               nullable=False),
        sa.Column("credential_id",        postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("auth_type",            sa.String(20),                 nullable=False, server_default="none"),
        sa.Column("auth_header",          sa.String(100),                nullable=True),
        sa.Column("encrypted_credential", sa.Text(),                     nullable=True),
        sa.Column("enabled_tool_groups",  postgresql.JSONB(),            nullable=False, server_default="[]"),
        sa.Column("enabled_tools",        postgresql.JSONB(),            nullable=True),
        sa.Column("is_active",            sa.Boolean(),                  nullable=False, server_default="true"),
        sa.Column("allow_destructive",    sa.Boolean(),                  nullable=False, server_default="false"),
        sa.Column("health_status",        sa.String(20),                 nullable=False, server_default="unknown"),
        sa.Column("last_tested_at",       sa.DateTime(timezone=True),    nullable=True),
        sa.Column("last_error",           sa.Text(),                     nullable=True),
        sa.ForeignKeyConstraint(["agent_id"],      ["agents.id"],                    ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"],       ["users.id"],                     ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["credential_id"], ["integration_credentials.id"],   ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agent_integrations_agent_id", "agent_integrations", ["agent_id"])
    op.create_index("ix_agent_integrations_user_id",  "agent_integrations", ["user_id"])

    # updated_at triggers
    from app.models.base import set_updated_at_trigger
    op.execute(set_updated_at_trigger("integration_credentials"))
    op.execute(set_updated_at_trigger("agent_integrations"))


def downgrade() -> None:
    op.drop_table("agent_integrations")
    op.drop_table("integration_credentials")
