import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class AgentToolsConfig(BaseModel):
    web_search: bool = False
    browser: bool = False
    code: bool = False
    http: bool = False
    sheets: bool = False
    email: bool = False


class AgentCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(None, max_length=2000)
    instructions: str | None = Field(None, max_length=8000)
    chatbot_id: uuid.UUID | None = None
    model: str = Field("claude-sonnet-4-6", max_length=100)
    tools: AgentToolsConfig = Field(default_factory=AgentToolsConfig)
    memory_enabled: bool = False
    max_steps: int = Field(10, ge=1, le=30)


class AgentUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = Field(None, max_length=2000)
    instructions: str | None = Field(None, max_length=8000)
    chatbot_id: uuid.UUID | None = None
    model: str | None = Field(None, max_length=100)
    tools: AgentToolsConfig | None = None
    memory_enabled: bool | None = None
    max_steps: int | None = Field(None, ge=1, le=30)
    is_published: bool | None = None
    is_active: bool | None = None


class AgentResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    description: str | None
    instructions: str | None
    chatbot_id: uuid.UUID | None
    model: str
    tools: dict
    memory_enabled: bool
    max_steps: int
    is_published: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime
