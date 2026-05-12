import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.knowledge_base import DocumentStatus, DocumentType


class DocumentResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    chatbot_id: uuid.UUID
    name: str
    type: DocumentType
    file_url: str | None
    source_url: str | None
    status: DocumentStatus
    chunk_count: int
    token_count: int
    error_message: str | None
    created_at: datetime
    updated_at: datetime


class ChunkResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    chunk_index: int
    content: str
    token_count: int


class DocumentDetailResponse(DocumentResponse):
    chunks: list[ChunkResponse] = []


class UrlIngestRequest(BaseModel):
    url: str = Field(..., min_length=7, max_length=2048)
    name: str | None = Field(None, max_length=500)


class TextIngestRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=500_000)
    name: str = Field(..., min_length=1, max_length=500)


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)
    top_k: int = Field(5, ge=1, le=20)
    threshold: float = Field(0.75, ge=0.0, le=1.0)


class SearchResultItem(BaseModel):
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    document_name: str
    content: str
    similarity: float
