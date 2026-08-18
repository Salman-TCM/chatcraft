"""Add agent_functions table and commerce_stores.agent_id

Revision ID: 000000000057
Revises: 000000000056
Create Date: 2026-08-18
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from alembic import op

revision = "000000000057"
down_revision = "000000000056"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_functions",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column(
            "agent_id",
            UUID(as_uuid=True),
            sa.ForeignKey("agents.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(64), nullable=False),
        sa.Column("description", sa.Text, nullable=False, server_default=""),
        sa.Column("parameters_schema", JSONB, nullable=False, server_default="{}"),
        sa.Column("webhook_url", sa.String(2048), nullable=False),
        sa.Column("webhook_method", sa.String(10), nullable=False, server_default="POST"),
        sa.Column("webhook_headers_encrypted", sa.Text, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            onupdate=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("agent_id", "name", name="uq_agent_function_name"),
    )

    op.add_column(
        "commerce_stores",
        sa.Column(
            "agent_id",
            UUID(as_uuid=True),
            sa.ForeignKey("agents.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("commerce_stores", "agent_id")
    op.drop_table("agent_functions")
