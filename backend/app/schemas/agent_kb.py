import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.knowledge_base import DocumentStatus, DocumentType


class AgentDocumentResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    agent_id: uuid.UUID
    name: str
    type: DocumentType
    file_url: str | None
    source_url: str | None
    status: DocumentStatus
    chunk_count: int
    token_count: int
    error_message: str | None
    version: int
    created_at: datetime
    updated_at: datetime


class AgentChunkResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    chunk_index: int
    content: str
    token_count: int


class AgentDocumentDetailResponse(AgentDocumentResponse):
    chunks: list[AgentChunkResponse] = []


class AgentUrlIngestRequest(BaseModel):
    url: str = Field(..., min_length=7, max_length=2048)
    name: str | None = Field(None, max_length=500)


class AgentTextIngestRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=500_000)
    name: str = Field(..., min_length=1, max_length=500)


class AgentDocumentUpdateRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=500_000)
    name: str | None = Field(None, min_length=1, max_length=500)
    # When set, the write is rejected with 409 if the document has moved on
    # to a different version since the caller last read it (e.g. someone
    # else, or the agent, edited it in between) — see set_document_content.
    expected_version: int | None = Field(None, ge=1)


class AgentDocumentInstructRequest(BaseModel):
    instruction: str = Field(..., min_length=1, max_length=2000)
    expected_version: int | None = Field(None, ge=1)


class AgentDocumentVersionResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    version: int
    name: str
    content: str
    source: str
    instruction: str | None
    created_at: datetime


class AgentSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)
    top_k: int = Field(5, ge=1, le=20)
    threshold: float = Field(0.75, ge=0.0, le=1.0)


class AgentSearchResultItem(BaseModel):
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    document_name: str
    content: str
    similarity: float
