"""
AgentFunction — custom webhook-backed tools a user defines for one Agent
Builder agent (e.g. "book_service", "create_account" against their own
external booking/account API).

Execution POSTs/GETs the configured webhook_url with the model-supplied
arguments and returns the response text to the model. Not exposed on
public/anonymous agent shares — see _PUBLIC_SHARE_TOOL_ALLOWLIST in
app/api/agents.py, which only admits a static set of safe, owner-cost-free
tool names.
"""

import uuid

from sqlalchemy import Boolean, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class AgentFunction(TimestampMixin, Base):
    __tablename__ = "agent_functions"
    __table_args__ = (UniqueConstraint("agent_id", "name", name="uq_agent_function_name"),)

    agent_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")

    # JSON schema for the tool's input parameters (Anthropic tool-use format)
    parameters_schema: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )

    webhook_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    webhook_method: Mapped[str] = mapped_column(
        String(10), nullable=False, default="POST", server_default="'POST'"
    )
    # Fernet-encrypted JSON blob of {header_name: value} (app.services.llm.key_store).
    # Decrypted only at fire time, server-side — never returned to the client.
    webhook_headers_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)

    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

    def __repr__(self) -> str:
        return f"<AgentFunction id={self.id} name={self.name!r} agent_id={self.agent_id}>"
