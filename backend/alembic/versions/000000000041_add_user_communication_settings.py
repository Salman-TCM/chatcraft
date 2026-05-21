"""add user_communication_settings table

Revision ID: 000000000041
Revises: 000000000040
Create Date: 2026-05-22
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from app.models.base import set_updated_at_trigger, drop_updated_at_trigger

revision = "000000000041"
down_revision = "000000000040"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_communication_settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("config", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "type", name="uq_user_comm_setting_type"),
    )
    op.create_index("ix_user_comm_settings_user_id", "user_communication_settings", ["user_id"])
    op.execute(set_updated_at_trigger("user_communication_settings"))


def downgrade() -> None:
    op.execute(drop_updated_at_trigger("user_communication_settings"))
    op.drop_index("ix_user_comm_settings_user_id", table_name="user_communication_settings")
    op.drop_table("user_communication_settings")
