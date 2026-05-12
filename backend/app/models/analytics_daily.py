import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class AnalyticsDaily(TimestampMixin, Base):
    __tablename__ = "analytics_daily"
    __table_args__ = (
        UniqueConstraint("chatbot_id", "date", name="uq_analytics_daily_chatbot_date"),
    )

    chatbot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chatbot_configs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    messages_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    users_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    avg_session_length: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False, default=0, server_default="0")
    revenue_usd: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False, default=0, server_default="0")

    def __repr__(self) -> str:
        return f"<AnalyticsDaily chatbot={self.chatbot_id} date={self.date}>"
