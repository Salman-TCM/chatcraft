import enum

from sqlalchemy import Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class PaymentStatus(str, enum.Enum):
    requires_payment_method = "requires_payment_method"
    requires_confirmation = "requires_confirmation"
    requires_action = "requires_action"
    processing = "processing"
    succeeded = "succeeded"
    canceled = "canceled"
    failed = "failed"


class Payment(TimestampMixin, Base):
    __tablename__ = "payments"

    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    stripe_payment_intent_id: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True, index=True
    )
    stripe_invoice_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True, index=True
    )

    # Amount in smallest currency unit (e.g. cents for USD)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(
        String(3), nullable=False, server_default="usd"
    )

    status: Mapped[PaymentStatus] = mapped_column(
        Enum(PaymentStatus, name="payment_status"),
        nullable=False,
        default=PaymentStatus.processing,
        server_default=PaymentStatus.processing.value,
    )

    description: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Relationship
    user: Mapped["User"] = relationship("User", back_populates="payments")  # type: ignore[name-defined]

    def __repr__(self) -> str:
        return (
            f"<Payment id={self.id} user_id={self.user_id} "
            f"amount={self.amount} {self.currency} status={self.status}>"
        )
