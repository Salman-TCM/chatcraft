import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class CommerceStore(TimestampMixin, Base):
    __tablename__ = "commerce_stores"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), nullable=False, unique=True, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD", server_default="USD")
    primary_color: Mapped[str] = mapped_column(String(7), nullable=False, default="#6366f1", server_default="#6366f1")
    default_view_mode: Mapped[str] = mapped_column(String(10), nullable=False, default="grid", server_default="grid")
    payment_provider: Mapped[str] = mapped_column(String(50), nullable=False, default="stripe", server_default="stripe")
    # Google Sheets ID for product catalog sync
    google_sheet_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    chatbot_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chatbot_configs.id", ondelete="SET NULL"),
        nullable=True,
    )


class CommerceProduct(TimestampMixin, Base):
    __tablename__ = "commerce_products"

    store_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce_stores.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    compare_at_price: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    image_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    sku: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    in_stock: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    # {options: [{name, values}], tags: [], metadata: {}}
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict, server_default="{}")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")


class CommercePayment(TimestampMixin, Base):
    __tablename__ = "commerce_payments"

    store_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce_stores.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    contact_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="SET NULL"),
        nullable=True,
    )
    customer_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    customer_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    stripe_payment_intent_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, unique=True)
    # pending / succeeded / failed / refunded
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", server_default="pending", index=True)
    # [{product_id, name, price, quantity}]
    items: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict, server_default="{}")
