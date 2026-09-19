"""
Agent Knowledge Base — per-agent RAG storage.

Mirrors the chatbot KB schema (knowledge_base_documents / knowledge_base_chunks)
but scopes documents to a single Agent rather than a ChatbotConfig. Reuses the
DocumentType / DocumentStatus enums from knowledge_base.py.
"""

import uuid

from pgvector.sqlalchemy import Vector
from sqlalchemy import Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.knowledge_base import EMBEDDING_DIM, DocumentStatus, DocumentType


class AgentKnowledgeDocument(TimestampMixin, Base):
    __tablename__ = "agent_kb_documents"

    agent_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(500), nullable=False)
    type: Mapped[DocumentType] = mapped_column(
        Enum(DocumentType, name="document_type", create_type=False), nullable=False
    )

    file_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    raw_content: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[DocumentStatus] = mapped_column(
        Enum(DocumentStatus, name="document_status", create_type=False),
        nullable=False,
        default=DocumentStatus.pending,
        server_default=DocumentStatus.pending.value,
        index=True,
    )

    chunk_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    token_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Bumped on every content-changing write (create excluded). Also doubles
    # as an optimistic-concurrency token: a PATCH/tool edit that names a
    # stale `expected_version` is rejected rather than silently clobbering a
    # newer edit — see agent_kb_service.set_document_content.
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")

    chunks: Mapped[list["AgentKnowledgeChunk"]] = relationship(
        "AgentKnowledgeChunk",
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="AgentKnowledgeChunk.chunk_index",
    )
    versions: Mapped[list["AgentKnowledgeDocumentVersion"]] = relationship(
        "AgentKnowledgeDocumentVersion",
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="AgentKnowledgeDocumentVersion.version.desc()",
    )

    def __repr__(self) -> str:
        return f"<AgentKBDocument id={self.id} name={self.name!r} status={self.status}>"


class AgentKnowledgeChunk(TimestampMixin, Base):
    __tablename__ = "agent_kb_chunks"

    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agent_kb_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    token_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    embedding: Mapped[list[float] | None] = mapped_column(Vector(EMBEDDING_DIM), nullable=True)

    document: Mapped["AgentKnowledgeDocument"] = relationship(
        "AgentKnowledgeDocument", back_populates="chunks"
    )

    def __repr__(self) -> str:
        return f"<AgentKBChunk doc={self.document_id} idx={self.chunk_index}>"


class AgentKnowledgeDocumentVersion(TimestampMixin, Base):
    """A snapshot of a document's content immediately before it was
    overwritten, so an edit (from the UI, the update_kb_document tool, or an
    instruction-based merge) can be reviewed or rolled back later."""

    __tablename__ = "agent_kb_document_versions"

    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agent_kb_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    version: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    # Who/what produced this prior state — "user" (dashboard edit),
    # "agent" (update_kb_document tool call), or "instruction" (the
    # instruction-based merge tool). Free text, not an enum, since this is
    # descriptive metadata only and new sources shouldn't need a migration.
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="user")
    instruction: Mapped[str | None] = mapped_column(Text, nullable=True)

    document: Mapped["AgentKnowledgeDocument"] = relationship(
        "AgentKnowledgeDocument", back_populates="versions"
    )

    def __repr__(self) -> str:
        return f"<AgentKBDocumentVersion doc={self.document_id} v={self.version}>"
