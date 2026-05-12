"""add knowledge_base_documents and knowledge_base_chunks tables

Revision ID: 000000000008
Revises: 000000000007
Create Date: 2026-05-12 00:00:08.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

from app.models.base import drop_updated_at_trigger, set_updated_at_trigger
from app.models.knowledge_base import EMBEDDING_DIM

revision: str = "000000000008"
down_revision: Union[str, None] = "000000000007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── enums ─────────────────────────────────────────────────────────────────
    doc_type_enum = postgresql.ENUM(
        "pdf", "docx", "txt", "url", "text",
        name="document_type", create_type=False,
    )
    doc_type_enum.create(op.get_bind(), checkfirst=True)

    doc_status_enum = postgresql.ENUM(
        "pending", "processing", "ready", "error",
        name="document_status", create_type=False,
    )
    doc_status_enum.create(op.get_bind(), checkfirst=True)

    # ── knowledge_base_documents ──────────────────────────────────────────────
    op.create_table(
        "knowledge_base_documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("chatbot_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(500), nullable=False),
        sa.Column("type", sa.Enum("pdf", "docx", "txt", "url", "text", name="document_type"), nullable=False),
        sa.Column("file_url", sa.String(2048), nullable=True),
        sa.Column("source_url", sa.String(2048), nullable=True),
        sa.Column("status", sa.Enum("pending", "processing", "ready", "error", name="document_status"),
                  server_default="pending", nullable=False),
        sa.Column("chunk_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("token_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["chatbot_id"], ["chatbot_configs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_kb_documents_chatbot_id", "knowledge_base_documents", ["chatbot_id"])
    op.create_index("ix_kb_documents_status", "knowledge_base_documents", ["status"])
    op.execute(set_updated_at_trigger("knowledge_base_documents"))

    # ── knowledge_base_chunks ─────────────────────────────────────────────────
    op.create_table(
        "knowledge_base_chunks",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("token_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("embedding", Vector(EMBEDDING_DIM), nullable=True),
        sa.ForeignKeyConstraint(["document_id"], ["knowledge_base_documents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_kb_chunks_document_id", "knowledge_base_chunks", ["document_id"])
    # IVFFlat cosine index — built after embeddings are populated
    op.execute(
        f"CREATE INDEX IF NOT EXISTS ix_kb_chunks_embedding "
        f"ON knowledge_base_chunks "
        f"USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"
    )
    op.execute(set_updated_at_trigger("knowledge_base_chunks"))


def downgrade() -> None:
    op.execute(drop_updated_at_trigger("knowledge_base_chunks"))
    op.execute("DROP INDEX IF EXISTS ix_kb_chunks_embedding")
    op.drop_index("ix_kb_chunks_document_id", table_name="knowledge_base_chunks")
    op.drop_table("knowledge_base_chunks")

    op.execute(drop_updated_at_trigger("knowledge_base_documents"))
    op.drop_index("ix_kb_documents_status", table_name="knowledge_base_documents")
    op.drop_index("ix_kb_documents_chatbot_id", table_name="knowledge_base_documents")
    op.drop_table("knowledge_base_documents")

    op.execute("DROP TYPE IF EXISTS document_status")
    op.execute("DROP TYPE IF EXISTS document_type")
