import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class SubscriptionPlan(str, enum.Enum):
    free = "free"
    trial = "trial"
    starter = "starter"
    pro = "pro"
    enterprise = "enterprise"


class SubscriptionState(str, enum.Enum):
    active = "active"
    trialing = "trialing"
    past_due = "past_due"
    canceled = "canceled"
    unpaid = "unpaid"
    incomplete = "incomplete"
    incomplete_expired = "incomplete_expired"


class Subscription(TimestampMixin, Base):
    __tablename__ = "subscriptions"

    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    stripe_subscription_id: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True, index=True
    )
    stripe_price_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )

    plan: Mapped[SubscriptionPlan] = mapped_column(
        Enum(SubscriptionPlan, name="subscription_plan"),
        nullable=False,
        default=SubscriptionPlan.free,
        server_default=SubscriptionPlan.free.value,
    )
    status: Mapped[SubscriptionState] = mapped_column(
        Enum(SubscriptionState, name="subscription_state"),
        nullable=False,
        default=SubscriptionState.active,
        server_default=SubscriptionState.active.value,
    )

    current_period_start: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    current_period_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    cancel_at_period_end: Mapped[bool] = mapped_column(
        nullable=False, default=False, server_default="false"
    )
    canceled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    payment_failed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationship
    user: Mapped["User"] = relationship("User", back_populates="subscription")  # type: ignore[name-defined]

    def __repr__(self) -> str:
        return f"<Subscription id={self.id} user_id={self.user_id} plan={self.plan} status={self.status}>"
