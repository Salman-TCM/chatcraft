import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class UserRole(str, enum.Enum):
    free = "free"
    trial = "trial"
    premium = "premium"
    creator = "creator"
    admin = "admin"


class SubscriptionStatus(str, enum.Enum):
    active = "active"
    trialing = "trialing"
    past_due = "past_due"
    canceled = "canceled"
    unpaid = "unpaid"


class User(TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(
        String(320), unique=True, nullable=False, index=True
    )
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)

    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role"),
        nullable=False,
        default=UserRole.free,
        server_default=UserRole.free.value,
    )

    # Email state
    email_verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    email_verification_token: Mapped[str | None] = mapped_column(
        String(255), nullable=True, index=True
    )

    # Password reset
    password_reset_token: Mapped[str | None] = mapped_column(
        String(255), nullable=True, index=True
    )
    password_reset_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Stripe
    stripe_customer_id: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True, index=True
    )
    subscription_status: Mapped[SubscriptionStatus | None] = mapped_column(
        Enum(SubscriptionStatus, name="subscription_status"),
        nullable=True,
    )
    trial_ends_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Stripe Connect (creator payouts)
    stripe_connect_account_id: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True, index=True
    )

    # Google OAuth (sign-in)
    google_id: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True, index=True
    )

    # Google OAuth tokens for Sheets/Docs (user-level, separate from sign-in)
    # {sheets: {access_token, refresh_token, expires_at, email}}
    google_oauth_tokens: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=None)

    # Suspension
    is_suspended: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    suspended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    suspended_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    subscription: Mapped["Subscription | None"] = relationship(  # type: ignore[name-defined]
        "Subscription", back_populates="user", uselist=False
    )
    payments: Mapped[list["Payment"]] = relationship(  # type: ignore[name-defined]
        "Payment", back_populates="user"
    )
    chatbot_configs: Mapped[list["ChatbotConfig"]] = relationship(  # type: ignore[name-defined]
        "ChatbotConfig", back_populates="user", cascade="all, delete-orphan"
    )
    conversations: Mapped[list["Conversation"]] = relationship(  # type: ignore[name-defined]
        "Conversation", back_populates="user"
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email} role={self.role}>"
