"""
ChatbotFunction — custom functions/tools that can be assigned to chatbots.
These appear as callable tools during AI inference (function calling).
"""

import uuid

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class ChatbotFunction(TimestampMixin, Base):
    __tablename__ = "chatbot_functions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")

    # JSON schema for function parameters (OpenAI function-calling format)
    parameters_schema: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )

    # Template for the output message sent to user after function executes
    output_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # If True, save the function result to the contact's custom fields
    save_to_contact: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    # Field key under which to save the result (e.g. "last_product_viewed")
    save_field_key: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Whether this function is active (callable by AI)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

    def __repr__(self) -> str:
        return f"<ChatbotFunction id={self.id} name={self.name!r}>"


class WidgetFunctionAssignment(Base):
    """Many-to-many: which functions are assigned to which widgets."""

    __tablename__ = "widget_function_assignments"

    widget_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("chatbot_configs.id", ondelete="CASCADE"),
        nullable=False,
        primary_key=True,
    )
    function_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("chatbot_functions.id", ondelete="CASCADE"),
        nullable=False,
        primary_key=True,
    )
