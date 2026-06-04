import secrets
import uuid

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class WidgetConfig(TimestampMixin, Base):
    __tablename__ = "widget_configs"

    chatbot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("chatbot_configs.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,   # one widget config per chatbot
        index=True,
    )

    # Comma-separated or JSON-serialised list stored as text; enforced in app layer
    allowed_domains: Mapped[str | None] = mapped_column(Text, nullable=True)

    # "bottom-right" | "bottom-left" | "top-right" | "top-left"
    position: Mapped[str] = mapped_column(
        String(20), nullable=False, default="bottom-right", server_default="bottom-right"
    )

    show_branding: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

    # Opaque token used to authenticate widget embeds — regenerated on request
    embed_token: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        default=lambda: secrets.token_urlsafe(48),
        unique=True,
        index=True,
    )

    # Persistent menu items shown in the chat widget
    # Each item: {"type": "url"|"phone"|"flow"|"postback", "label": str, "value": str}
    persistent_menu: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=None)

    # Optional embedded storefront — widget shows a "Shop" tab with this store's products
    embedded_store_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("commerce_stores.id", ondelete="SET NULL"),
        nullable=True,
        default=None,
    )

    # Relationships
    chatbot: Mapped["ChatbotConfig"] = relationship(  # type: ignore[name-defined]
        "ChatbotConfig", back_populates="widget_config"
    )
    licenses: Mapped[list["WidgetLicense"]] = relationship(  # type: ignore[name-defined]
        "WidgetLicense", back_populates="widget_config", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<WidgetConfig chatbot_id={self.chatbot_id}>"
