import uuid

from sqlalchemy import String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin

COMM_TYPES = ("smtp", "sms")


class UserCommunicationSetting(TimestampMixin, Base):
    __tablename__ = "user_communication_settings"
    __table_args__ = (
        UniqueConstraint("user_id", "type", name="uq_user_comm_setting_type"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
