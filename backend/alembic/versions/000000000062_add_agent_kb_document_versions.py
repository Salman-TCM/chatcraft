"""add agent_kb_documents.version and agent_kb_document_versions table

Revision ID: 000000000062
Revises: 000000000061
Create Date: 2026-09-19 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op
from app.models.base import drop_updated_at_trigger, set_updated_at_trigger

revision: str = "000000000062"
down_revision: str | None = "000000000061"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "agent_kb_documents",
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
    )

    op.create_table(
        "agent_kb_document_versions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(500), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("source", sa.String(20), server_default="user", nullable=False),
        sa.Column("instruction", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["document_id"], ["agent_kb_documents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_agent_kb_document_versions_document_id",
        "agent_kb_document_versions",
        ["document_id"],
    )
    op.execute(set_updated_at_trigger("agent_kb_document_versions"))


def downgrade() -> None:
    op.execute(drop_updated_at_trigger("agent_kb_document_versions"))
    op.drop_index(
        "ix_agent_kb_document_versions_document_id", table_name="agent_kb_document_versions"
    )
    op.drop_table("agent_kb_document_versions")

    op.drop_column("agent_kb_documents", "version")
