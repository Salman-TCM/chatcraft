import enum
import uuid

from pgvector.sqlalchemy import Vector
from sqlalchemy import Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class DocumentType(str, enum.Enum):
    pdf = "pdf"
    docx = "docx"
    txt = "txt"
    url = "url"
    text = "text"  # raw paste


class DocumentStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    ready = "ready"
    error = "error"


class KnowledgeBaseDocument(TimestampMixin, Base):
    __tablename__ = "knowledge_base_documents"

    chatbot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("chatbot_configs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(500), nullable=False)
    type: Mapped[DocumentType] = mapped_column(
        Enum(DocumentType, name="document_type"), nullable=False
    )

    # S3 / Supabase Storage URL; NULL for raw-text pastes
    file_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)

    # For URL-type documents
    source_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)

    status: Mapped[DocumentStatus] = mapped_column(
        Enum(DocumentStatus, name="document_status"),
        nullable=False,
        default=DocumentStatus.pending,
        server_default=DocumentStatus.pending.value,
        index=True,
    )

    # Populated after processing completes
    chunk_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    token_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    # Human-readable error message when status=error
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    chatbot: Mapped["ChatbotConfig"] = relationship(  # type: ignore[name-defined]
        "ChatbotConfig", back_populates="kb_documents"
    )
    chunks: Mapped[list["KnowledgeBaseChunk"]] = relationship(
        "KnowledgeBaseChunk",
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="KnowledgeBaseChunk.chunk_index",
    )

    def __repr__(self) -> str:
        return f"<KBDocument id={self.id} name={self.name!r} status={self.status}>"


# Embedding dimensions for text-embedding-3-small
EMBEDDING_DIM = 1536


class KnowledgeBaseChunk(TimestampMixin, Base):
    __tablename__ = "knowledge_base_chunks"

    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("knowledge_base_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    token_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    # 1536-dim vector from text-embedding-3-small
    embedding: Mapped[list[float] | None] = mapped_column(
        Vector(EMBEDDING_DIM), nullable=True
    )

    # Relationships
    document: Mapped["KnowledgeBaseDocument"] = relationship(
        "KnowledgeBaseDocument", back_populates="chunks"
    )

    def __repr__(self) -> str:
        return f"<KBChunk doc={self.document_id} idx={self.chunk_index}>"
