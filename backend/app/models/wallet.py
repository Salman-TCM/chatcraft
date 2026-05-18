import secrets
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class WalletProgram(TimestampMixin, Base):
    __tablename__ = "wallet_programs"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    chatbot_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chatbot_configs.id", ondelete="SET NULL"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # membership / punch_card / points / coupon / event_ticket / prepaid_balance / business_card
    type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # active / inactive / archived
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", server_default="active", index=True)
    # Type-specific configuration (max_punches, points_per_dollar, tiers, etc.)
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    # Branding overrides: background_color, label_color, foreground_color, logo_url, strip_image_url, icon_url
    brand_overrides: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    # Google Wallet class ID
    google_class_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)


class WalletCard(Base):
    __tablename__ = "wallet_cards"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default="gen_random_uuid()",
    )
    serial: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    program_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("wallet_programs.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    contact_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="SET NULL"),
        nullable=True,
    )
    customer_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    customer_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    customer_phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    # active / revoked / expired
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", server_default="active", index=True)
    # Dynamic state: {punches, points, balance, tier, redeemed, checked_in, ...}
    state: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    google_pass_object_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default="now()",
    )

    __table_args__ = (
        UniqueConstraint("program_id", "customer_email", name="uq_wallet_card_program_email"),
    )


class WalletPushSubscription(Base):
    __tablename__ = "wallet_push_subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default="gen_random_uuid()",
    )
    card_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("wallet_cards.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    # apple / google
    device_type: Mapped[str] = mapped_column(String(10), nullable=False)
    push_token: Mapped[str] = mapped_column(String(512), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default="now()",
    )
