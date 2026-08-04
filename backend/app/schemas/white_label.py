"""Pydantic request schemas for the White Label & Agency API."""

import uuid
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

# Agency/tenant/reseller-subscription plan tiers. Grounded in the fixed
# <select> options used across frontend/app/admin/agencies/page.tsx,
# frontend/app/agency/clients/page.tsx and frontend/app/agency/subscriptions/page.tsx,
# and confirmed by the "growth"/"unlimited" check in backend/app/api/widget.py.
AgencyPlan = Literal["starter", "growth", "unlimited"]

# Team member role/status sets, grounded in the tuples already enforced in
# this router (`role in ("agent", "manager")`, `status in ("active", "pending", "disabled")`)
# and in frontend/app/agency/team/page.tsx's TeamMember type / <select> options.
TeamMemberRole = Literal["agent", "manager"]
TeamMemberStatus = Literal["active", "pending", "disabled"]


class AgencyCreateRequest(BaseModel):
    """POST /api/v1/agencies (superadmin)."""

    slug: str = Field(min_length=1, max_length=80)
    owner_user_id: uuid.UUID
    primary_colour: str = Field(default="#6366f1", max_length=7)
    plan: AgencyPlan = "starter"
    status: str = Field(default="active", max_length=20)
    support_email: EmailStr | None = None
    from_email: EmailStr | None = None


class AgencyUpdateRequest(BaseModel):
    """PATCH /api/v1/agencies/{agency_id} (superadmin). All fields optional."""

    slug: str | None = Field(default=None, min_length=1, max_length=80)
    custom_domain: str | None = Field(default=None, max_length=253)
    logo_url: str | None = Field(default=None, max_length=2048)
    favicon_url: str | None = Field(default=None, max_length=2048)
    primary_colour: str | None = Field(default=None, max_length=7)
    support_email: EmailStr | None = None
    from_email: EmailStr | None = None
    smtp_config: dict | None = None
    plan: AgencyPlan | None = None
    status: str | None = Field(default=None, max_length=20)


class TenantCreateRequest(BaseModel):
    """POST /api/v1/agencies/{agency_id}/tenants (superadmin)."""

    name: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=1, max_length=80)
    plan: AgencyPlan = "starter"
    status: str = Field(default="active", max_length=20)


class AgencyMeUpdateRequest(BaseModel):
    """PUT /api/v1/agency/me (agency owner). All fields optional."""

    logo_url: str | None = Field(default=None, max_length=2048)
    favicon_url: str | None = Field(default=None, max_length=2048)
    primary_colour: str | None = Field(default=None, max_length=7)
    support_email: EmailStr | None = None
    from_email: EmailStr | None = None
    smtp_config: dict | None = None


class DomainVerifyRequest(BaseModel):
    """POST /api/v1/agency/verify-domain."""

    domain: str = Field(min_length=1, max_length=253)


class TestEmailRequest(BaseModel):
    """POST /api/v1/agency/send-test-email."""

    to: EmailStr | None = None


class TeamMemberInviteRequest(BaseModel):
    """POST /api/v1/agency/team."""

    member_email: EmailStr
    role: TeamMemberRole = "agent"


class TeamMemberUpdateRequest(BaseModel):
    """PATCH /api/v1/agency/team/{member_id}. All fields optional."""

    role: TeamMemberRole | None = None
    status: TeamMemberStatus | None = None


class LicenseValidateRequest(BaseModel):
    """POST /api/public/license/validate (public, called by widget embed)."""

    token: str = Field(min_length=1, max_length=256)


class PricingTierInput(BaseModel):
    """One entry in AgencyPricingUpsertRequest.tiers."""

    plan_key: str = Field(min_length=1, max_length=50)
    display_name: str = Field(min_length=1, max_length=100)
    price_monthly: int = Field(default=0, ge=0)
    price_yearly: int = Field(default=0, ge=0)
    features: dict | list | None = None
    is_active: bool = True


class AgencyPricingUpsertRequest(BaseModel):
    """PUT /api/v1/agency/pricing — replaces the full set of pricing tiers."""

    tiers: list[PricingTierInput] = Field(default_factory=list)


class ResellerSubscriptionCreateRequest(BaseModel):
    """POST /api/v1/agency/subscriptions."""

    client_email: EmailStr
    plan: AgencyPlan = "starter"
    amount: int = Field(default=0, ge=0)
    stripe_subscription_id: str | None = Field(default=None, max_length=100)
