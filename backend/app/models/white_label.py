import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class PlatformConfig(Base):
    """Single-row global platform settings (row id = 1)."""
    __tablename__ = "platform_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    platform_name: Mapped[str] = mapped_column(String(100), nullable=False, default="ChatCraft AI")
    logo_url: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    support_email: Mapped[str] = mapped_column(String(255), nullable=False, default="support@chatcraft.ai")
    stripe_account_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default="now()")


class Agency(TimestampMixin, Base):
    __tablename__ = "agencies"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default="gen_random_uuid()"
    )
    slug: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    custom_domain: Mapped[Optional[str]] = mapped_column(String(253), nullable=True, unique=True, index=True)
    custom_domain_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    logo_url: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    favicon_url: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    primary_colour: Mapped[str] = mapped_column(String(7), nullable=False, default="#6366f1", server_default="#6366f1")
    support_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    from_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    smtp_config: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    plan: Mapped[str] = mapped_column(String(20), nullable=False, default="starter", server_default="starter")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", server_default="active")
    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    tenants: Mapped[list["Tenant"]] = relationship("Tenant", back_populates="agency", cascade="all, delete-orphan")


class Tenant(TimestampMixin, Base):
    __tablename__ = "tenants"
    __table_args__ = (UniqueConstraint("agency_id", "slug", name="uq_agency_tenant_slug"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default="gen_random_uuid()"
    )
    agency_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), nullable=False)
    plan: Mapped[str] = mapped_column(String(20), nullable=False, default="starter", server_default="starter")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", server_default="active")

    agency: Mapped["Agency"] = relationship("Agency", back_populates="tenants")


class ImpersonationAuditLog(Base):
    __tablename__ = "impersonation_audit_log"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default="gen_random_uuid()"
    )
    actor_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    target_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    target_agency_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agencies.id", ondelete="CASCADE"), nullable=True
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default="now()")
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)


class ResellerSubscription(Base):
    __tablename__ = "subscriptions_reseller"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default="gen_random_uuid()"
    )
    agency_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    client_email: Mapped[str] = mapped_column(String(255), nullable=False)
    stripe_subscription_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    license_token: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    plan: Mapped[str] = mapped_column(String(20), nullable=False, default="starter")
    amount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", server_default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default="now()")
