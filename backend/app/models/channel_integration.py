import uuid

from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class ChannelIntegration(TimestampMixin, Base):
    __tablename__ = "channel_integrations"
    __table_args__ = (UniqueConstraint("chatbot_id", "channel", name="uq_chatbot_channel"),)

    chatbot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("chatbot_configs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    channel: Mapped[str] = mapped_column(String(50), nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    # Channel-specific credentials/config (encrypted at rest in production)
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    # Random secret used to verify incoming webhooks (e.g. WhatsApp hub.verify_token)
    webhook_secret: Mapped[str | None] = mapped_column(String(200), nullable=True)

    chatbot: Mapped["ChatbotConfig"] = relationship(  # type: ignore[name-defined]
        "ChatbotConfig", back_populates="channel_integrations"
    )
