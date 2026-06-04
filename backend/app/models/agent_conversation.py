import uuid

from sqlalchemy import ForeignKey, Integer, String, Text, func, DateTime
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AgentConversation(Base):
    """Persisted conversation sessions for agents with memory enabled."""
    __tablename__ = "agent_conversations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    agent_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # [{role: "user"|"assistant", content: str}]
    messages: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    tool_calls: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_at: Mapped[func.now] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
