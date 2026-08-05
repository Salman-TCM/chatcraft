"""add agent_kb_documents and agent_kb_chunks tables

Revision ID: 000000000053
Revises: 000000000052
Create Date: 2026-08-05 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

from alembic import op
from app.models.base import drop_updated_at_trigger, set_updated_at_trigger
from app.models.knowledge_base import EMBEDDING_DIM

revision: str = "000000000053"
down_revision: str | None = "000000000052"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── agent_kb_documents ─────────────────────────────────────────────────────
    # Reuses document_type / document_status enums created by migration 000000000008
    op.create_table(
        "agent_kb_documents",
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
        sa.Column("agent_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(500), nullable=False),
        sa.Column(
            "type",
            postgresql.ENUM(
                "pdf", "docx", "txt", "url", "text", name="document_type", create_type=False
            ),
            nullable=False,
        ),
        sa.Column("file_url", sa.String(2048), nullable=True),
        sa.Column("source_url", sa.String(2048), nullable=True),
        sa.Column("raw_content", sa.Text(), nullable=True),
        sa.Column(
            "status",
            postgresql.ENUM(
                "pending", "processing", "ready", "error", name="document_status", create_type=False
            ),
            server_default="pending",
            nullable=False,
        ),
        sa.Column("chunk_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("token_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agent_kb_documents_agent_id", "agent_kb_documents", ["agent_id"])
    op.create_index("ix_agent_kb_documents_status", "agent_kb_documents", ["status"])
    op.execute(set_updated_at_trigger("agent_kb_documents"))

    # ── agent_kb_chunks ────────────────────────────────────────────────────────
    op.create_table(
        "agent_kb_chunks",
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
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("token_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("embedding", Vector(EMBEDDING_DIM), nullable=True),
        sa.ForeignKeyConstraint(["document_id"], ["agent_kb_documents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agent_kb_chunks_document_id", "agent_kb_chunks", ["document_id"])
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_agent_kb_chunks_embedding "
        "ON agent_kb_chunks "
        "USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"
    )
    op.execute(set_updated_at_trigger("agent_kb_chunks"))


def downgrade() -> None:
    op.execute(drop_updated_at_trigger("agent_kb_chunks"))
    op.execute("DROP INDEX IF EXISTS ix_agent_kb_chunks_embedding")
    op.drop_index("ix_agent_kb_chunks_document_id", table_name="agent_kb_chunks")
    op.drop_table("agent_kb_chunks")

    op.execute(drop_updated_at_trigger("agent_kb_documents"))
    op.drop_index("ix_agent_kb_documents_status", table_name="agent_kb_documents")
    op.drop_index("ix_agent_kb_documents_agent_id", table_name="agent_kb_documents")
    op.drop_table("agent_kb_documents")
