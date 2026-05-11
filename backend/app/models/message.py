import enum
import uuid
from decimal import Decimal

from sqlalchemy import Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class MessageRole(str, enum.Enum):
    system = "system"
    user = "user"
    assistant = "assistant"


class MessageFeedback(str, enum.Enum):
    thumbs_up = "thumbs_up"
    thumbs_down = "thumbs_down"


class Message(TimestampMixin, Base):
    __tablename__ = "messages"

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    role: Mapped[MessageRole] = mapped_column(
        Enum(MessageRole, name="message_role"), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)

    # Which model produced this assistant turn (NULL for user messages)
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Token accounting
    input_tokens: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    output_tokens: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    # Stored in USD; precision to 8 decimal places to handle sub-cent costs
    cost_usd: Mapped[Decimal] = mapped_column(
        Numeric(precision=14, scale=8), nullable=False, default=Decimal("0"), server_default="0"
    )

    # Optional user feedback on assistant turn
    feedback: Mapped[MessageFeedback | None] = mapped_column(
        Enum(MessageFeedback, name="message_feedback"), nullable=True
    )

    # Relationships
    conversation: Mapped["Conversation"] = relationship(  # type: ignore[name-defined]
        "Conversation", back_populates="messages"
    )

    def __repr__(self) -> str:
        return f"<Message id={self.id} role={self.role} model={self.model}>"
