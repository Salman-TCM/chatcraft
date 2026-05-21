"""Add flow_folders table and folder_id FK on flows

Revision ID: 000000000036
Revises: 000000000035
Create Date: 2026-05-21
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "000000000036"
down_revision = "000000000035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "flow_folders",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("colour", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_flow_folders_user_id", "flow_folders", ["user_id"])

    op.add_column(
        "flows",
        sa.Column("folder_id", UUID(as_uuid=True), sa.ForeignKey("flow_folders.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_flows_folder_id", "flows", ["folder_id"])


def downgrade() -> None:
    op.drop_index("ix_flows_folder_id", "flows")
    op.drop_column("flows", "folder_id")
    op.drop_index("ix_flow_folders_user_id", "flow_folders")
    op.drop_table("flow_folders")
