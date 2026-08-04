import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class WalletProgram(TimestampMixin, Base):
    __tablename__ = "wallet_programs"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    chatbot_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("chatbot_configs.id", ondelete="SET NULL"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # membership / punch_card / points / coupon / event_ticket / prepaid_balance / business_card
    type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # active / inactive / archived
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="active", server_default="active", index=True
    )
    # Type-specific configuration (max_punches, points_per_dollar, tiers, etc.)
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    # Branding: background_color, label_color, foreground_color, logo_url, strip_image_url, icon_url
    brand_overrides: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )
    # Google Wallet class ID
    google_class_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Public join link token (customers self-enroll via /join/{token})
    join_token: Mapped[str | None] = mapped_column(
        String(64), nullable=True, unique=True, index=True
    )
    # Staff scanner link token (/scan/{token})
    scanner_token: Mapped[str | None] = mapped_column(
        String(64), nullable=True, unique=True, index=True
    )
    # Which fields to show on the join form: ["name","email","phone","birthday","postal_code"]
    join_form_fields: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default='["name","email"]'
    )
    # Receipt scanning: {enabled, points_per_dollar, punches_per_receipt, min_amount, max_award_per_scan, max_scans_per_day, merchant_keywords, custom_prompt}
    receipt_scanning_config: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )


class WalletCard(Base):
    __tablename__ = "wallet_cards"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default="gen_random_uuid()",
    )
    serial: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    program_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("wallet_programs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    contact_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("contacts.id", ondelete="SET NULL"),
        nullable=True,
    )
    customer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    customer_email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    customer_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # active / revoked / expired
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="active", server_default="active", index=True
    )
    # Dynamic state: {punches, points, balance, tier, redeemed, checked_in, ...}
    state: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    google_pass_object_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Apple Wallet web-service authentication token (distinct from serial)
    auth_token: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default="now()",
    )

    __table_args__ = (
        UniqueConstraint("program_id", "customer_email", name="uq_wallet_card_program_email"),
    )


class WalletPushSubscription(Base):
    __tablename__ = "wallet_push_subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default="gen_random_uuid()",
    )
    card_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("wallet_cards.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # apple / google
    device_type: Mapped[str] = mapped_column(String(10), nullable=False)
    push_token: Mapped[str] = mapped_column(String(512), nullable=False)
    # Apple device library identifier (from web service registration)
    device_library_id: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default="now()",
    )


class WalletCardEvent(Base):
    """Audit log of every action applied to a card."""

    __tablename__ = "wallet_card_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default="gen_random_uuid()",
    )
    card_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("wallet_cards.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    program_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("wallet_programs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    # State fields that changed: {"punches": 3}
    delta: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    # dashboard / flow / scanner / receipt_scan / api / self_enroll
    source: Mapped[str] = mapped_column(
        String(30), nullable=False, default="dashboard", server_default="dashboard"
    )
    # For receipt scans: link to WalletReceiptScan.id
    receipt_scan_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default="now()",
    )


class WalletReceiptScan(Base):
    """Tracks submitted receipt scans for dedup and audit."""

    __tablename__ = "wallet_receipt_scans"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default="gen_random_uuid()",
    )
    card_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("wallet_cards.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    program_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("wallet_programs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Hash = sha256(program_id + merchant + date + amount + transaction_id) for dedup
    receipt_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    receipt_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    merchant_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    receipt_date: Mapped[str | None] = mapped_column(String(50), nullable=True)
    awarded_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    # points / punches
    awarded_type: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # base64 image for audit ("View receipt" link)
    image_data: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_response: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default="now()",
    )

    __table_args__ = (
        UniqueConstraint("program_id", "receipt_hash", name="uq_wallet_receipt_program_hash"),
    )


class UserWalletCredentials(Base):
    """Per-user Apple and Google Wallet signing credentials."""

    __tablename__ = "user_wallet_credentials"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    # {pass_type_id, team_id, cert_pem, key_pem, wwdr_pem, push_key_id, push_key_pem}
    apple_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # {issuer_id, service_account (JSON string)}
    google_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default="now()",
    )
