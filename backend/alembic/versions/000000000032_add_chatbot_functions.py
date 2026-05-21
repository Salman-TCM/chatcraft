"""Add chatbot_functions and widget_function_assignments tables

Revision ID: 000000000032
Revises: 000000000031
Create Date: 2026-05-19
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "000000000032"
down_revision = "000000000031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "chatbot_functions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text, nullable=False, server_default=""),
        sa.Column("parameters_schema", JSONB, nullable=False, server_default="{}"),
        sa.Column("output_message", sa.Text, nullable=True),
        sa.Column("save_to_contact", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("save_field_key", sa.String(100), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), onupdate=sa.text("now()"), nullable=False),
    )
    op.create_table(
        "widget_function_assignments",
        sa.Column("widget_id", UUID(as_uuid=True), sa.ForeignKey("chatbot_configs.id", ondelete="CASCADE"), nullable=False, primary_key=True),
        sa.Column("function_id", UUID(as_uuid=True), sa.ForeignKey("chatbot_functions.id", ondelete="CASCADE"), nullable=False, primary_key=True),
    )


def downgrade() -> None:
    op.drop_table("widget_function_assignments")
    op.drop_table("chatbot_functions")
