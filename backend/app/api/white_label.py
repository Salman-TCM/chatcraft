"""
White Label & Agency API.

Superadmin (admin role):
  POST   /api/v1/agencies              — create agency
  GET    /api/v1/agencies              — list agencies
  GET    /api/v1/agencies/{id}         — agency detail
  PATCH  /api/v1/agencies/{id}         — update agency
  DELETE /api/v1/agencies/{id}         — delete agency
  GET    /api/v1/agencies/{id}/tenants — list tenants
  POST   /api/v1/agencies/{id}/tenants — create tenant
  DELETE /api/v1/agencies/{id}/tenants/{tid} — delete tenant
  POST   /api/admin/agencies/{id}/impersonate — impersonation token

Agency owner:
  GET    /api/v1/agency/me             — own agency config
  PUT    /api/v1/agency/me             — update branding/settings
  GET    /api/v1/agency/me/domain-status — check DNS propagation
  POST   /api/v1/agency/verify-domain  — trigger DNS check
  POST   /api/v1/agency/send-test-email — test SMTP config
  GET    /api/v1/agency/subscriptions  — list client subscriptions
  POST   /api/v1/agency/subscriptions  — create client subscription
  GET    /api/v1/agency/pricing        — list custom pricing tiers
  PUT    /api/v1/agency/pricing        — upsert custom pricing tiers
  GET    /api/v1/agency/team           — list team members
  POST   /api/v1/agency/team           — invite team member
  PATCH  /api/v1/agency/team/{id}      — update team member role/status
  DELETE /api/v1/agency/team/{id}      — remove team member

Public:
  GET    /api/public/agency-by-domain  — resolve agency from hostname
  POST   /api/public/license/validate  — validate reseller license token
"""

import secrets
import socket
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import CurrentUser, DBSession, RequireAdmin, require_feature
from app.core.features import WHITE_LABEL
from app.models.user import User
from app.models.white_label import (
    Agency,
    AgencyPricingTier,
    AgencyTeamMember,
    ImpersonationAuditLog,
    ResellerSubscription,
    Tenant,
)
from app.schemas.white_label import (
    AgencyCreateRequest,
    AgencyMeUpdateRequest,
    AgencyPricingUpsertRequest,
    AgencyUpdateRequest,
    DomainVerifyRequest,
    LicenseValidateRequest,
    ResellerSubscriptionCreateRequest,
    TeamMemberInviteRequest,
    TeamMemberUpdateRequest,
    TenantCreateRequest,
    TestEmailRequest,
)

router = APIRouter(tags=["white_label"])


# ── Public: domain resolution (called by Next.js middleware) ─────────────────


@router.get("/api/public/agency-by-domain", response_model=dict)
async def agency_by_domain(host: str, db: DBSession) -> dict:
    """Resolve agency from hostname (custom domain or {slug}.platform.com)."""
    import json as _json

    from sqlalchemy import or_

    # Redis cache: agency:domain:{host} → JSON payload, TTL 5 min
    _redis = None
    cache_key = f"agency:domain:{host}"
    try:
        import redis.asyncio as _aioredis

        from app.core.config import settings as _settings

        _redis = _aioredis.from_url(_settings.redis_url, decode_responses=True)
        cached = await _redis.get(cache_key)
        if cached is not None:
            await _redis.aclose()
            return _json.loads(cached)
    except Exception:
        _redis = None

    result = await db.execute(
        select(Agency).where(
            or_(
                Agency.custom_domain == host,
                Agency.slug == host.split(".")[0],
            )
        )
    )
    a = result.scalar_one_or_none()
    if not a:
        response = {"success": False, "data": None}
    else:
        response = {
            "success": True,
            "data": {
                "id": str(a.id),
                "name": a.slug,
                "primary_colour": a.primary_colour,
                "logo_url": a.logo_url,
                "favicon_url": a.favicon_url,
            },
        }

    # Cache the result for 5 minutes
    if _redis is not None:
        try:
            await _redis.setex(cache_key, 300, _json.dumps(response))
            await _redis.aclose()
        except Exception:
            pass

    return response


# ── Helpers ───────────────────────────────────────────────────────────────────


def _agency_dict(a: Agency) -> dict:
    return {
        "id": str(a.id),
        "slug": a.slug,
        "custom_domain": a.custom_domain,
        "custom_domain_verified": a.custom_domain_verified,
        "logo_url": a.logo_url,
        "favicon_url": a.favicon_url,
        "primary_colour": a.primary_colour,
        "support_email": a.support_email,
        "from_email": a.from_email,
        "plan": a.plan,
        "status": a.status,
        "owner_user_id": str(a.owner_user_id),
        "created_at": a.created_at.isoformat(),
        "updated_at": a.updated_at.isoformat(),
    }


def _tenant_dict(t: Tenant) -> dict:
    return {
        "id": str(t.id),
        "agency_id": str(t.agency_id),
        "user_id": str(t.user_id) if t.user_id else None,
        "name": t.name,
        "slug": t.slug,
        "plan": t.plan,
        "status": t.status,
        "created_at": t.created_at.isoformat(),
    }


async def _get_agency(agency_id: uuid.UUID, db: AsyncSession) -> Agency:
    a = await db.get(Agency, agency_id)
    if not a:
        raise HTTPException(
            status_code=404,
            detail={"success": False, "error": "Agency not found", "code": "NOT_FOUND"},
        )
    return a


async def _owner_agency(user_id: uuid.UUID, db: AsyncSession) -> Agency:
    result = await db.execute(select(Agency).where(Agency.owner_user_id == user_id))
    a = result.scalar_one_or_none()
    if not a:
        raise HTTPException(
            status_code=404,
            detail={
                "success": False,
                "error": "No agency found for this user",
                "code": "NOT_FOUND",
            },
        )
    return a


# ── Superadmin: Agency CRUD ───────────────────────────────────────────────────


@router.get("/api/v1/agencies", response_model=dict, dependencies=[RequireAdmin])
async def list_agencies(db: DBSession) -> dict:
    result = await db.execute(select(Agency).order_by(Agency.created_at.desc()))
    agencies = result.scalars().all()
    return {"success": True, "data": [_agency_dict(a) for a in agencies]}


@router.post("/api/v1/agencies", response_model=dict, status_code=201, dependencies=[RequireAdmin])
async def create_agency(body: AgencyCreateRequest, db: DBSession) -> dict:
    slug = body.slug.strip().lower().replace(" ", "-")

    owner = await db.get(User, body.owner_user_id)
    if not owner:
        raise HTTPException(
            status_code=404,
            detail={"success": False, "error": "Owner user not found", "code": "NOT_FOUND"},
        )

    a = Agency(
        slug=slug,
        primary_colour=body.primary_colour,
        plan=body.plan,
        status=body.status,
        owner_user_id=body.owner_user_id,
        support_email=body.support_email,
        from_email=body.from_email,
    )
    db.add(a)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail={"success": False, "error": "Slug already exists", "code": "SLUG_TAKEN"},
        )
    await db.refresh(a)
    return {"success": True, "data": _agency_dict(a)}


@router.get("/api/v1/agencies/{agency_id}", response_model=dict, dependencies=[RequireAdmin])
async def get_agency(agency_id: uuid.UUID, db: DBSession) -> dict:
    a = await _get_agency(agency_id, db)
    return {"success": True, "data": _agency_dict(a)}


@router.patch("/api/v1/agencies/{agency_id}", response_model=dict, dependencies=[RequireAdmin])
async def update_agency(agency_id: uuid.UUID, body: AgencyUpdateRequest, db: DBSession) -> dict:
    a = await _get_agency(agency_id, db)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(a, k, v)
    await db.commit()
    await db.refresh(a)
    return {"success": True, "data": _agency_dict(a)}


@router.delete("/api/v1/agencies/{agency_id}", response_model=dict, dependencies=[RequireAdmin])
async def delete_agency(agency_id: uuid.UUID, db: DBSession) -> dict:
    a = await _get_agency(agency_id, db)
    await db.delete(a)
    await db.commit()
    return {"success": True, "data": None}


# ── Superadmin: Tenant CRUD ───────────────────────────────────────────────────


@router.get(
    "/api/v1/agencies/{agency_id}/tenants", response_model=dict, dependencies=[RequireAdmin]
)
async def list_tenants(agency_id: uuid.UUID, db: DBSession) -> dict:
    await _get_agency(agency_id, db)
    result = await db.execute(
        select(Tenant).where(Tenant.agency_id == agency_id).order_by(Tenant.created_at.desc())
    )
    tenants = result.scalars().all()
    return {"success": True, "data": [_tenant_dict(t) for t in tenants]}


@router.post(
    "/api/v1/agencies/{agency_id}/tenants",
    response_model=dict,
    status_code=201,
    dependencies=[RequireAdmin],
)
async def create_tenant(agency_id: uuid.UUID, body: TenantCreateRequest, db: DBSession) -> dict:
    await _get_agency(agency_id, db)
    slug = body.slug.strip().lower().replace(" ", "-")
    name = body.name.strip()
    t = Tenant(
        agency_id=agency_id,
        name=name,
        slug=slug,
        plan=body.plan,
        status=body.status,
    )
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return {"success": True, "data": _tenant_dict(t)}


@router.delete(
    "/api/v1/agencies/{agency_id}/tenants/{tenant_id}",
    response_model=dict,
    dependencies=[RequireAdmin],
)
async def delete_tenant(agency_id: uuid.UUID, tenant_id: uuid.UUID, db: DBSession) -> dict:
    await _get_agency(agency_id, db)
    t = await db.get(Tenant, tenant_id)
    if not t or t.agency_id != agency_id:
        raise HTTPException(
            status_code=404,
            detail={"success": False, "error": "Tenant not found", "code": "NOT_FOUND"},
        )
    await db.delete(t)
    await db.commit()
    return {"success": True, "data": None}


# ── Superadmin: Agency impersonation ─────────────────────────────────────────


@router.post(
    "/api/admin/agencies/{agency_id}/impersonate", response_model=dict, dependencies=[RequireAdmin]
)
async def impersonate_agency(
    agency_id: uuid.UUID, user: CurrentUser, request: Request, db: DBSession
) -> dict:
    from jose import jwt

    a = await _get_agency(agency_id, db)
    owner = await db.get(User, a.owner_user_id)
    if not owner:
        raise HTTPException(status_code=404, detail="Agency owner not found")

    now = datetime.now(UTC)
    payload = {
        "sub": str(owner.id),
        "role": owner.role.value,
        "iat": now,
        "exp": now + timedelta(minutes=15),
        "type": "access",
        "impersonated_by": str(user.id),
        "target_agency_id": str(agency_id),
    }
    token = jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)

    log = ImpersonationAuditLog(
        actor_user_id=user.id,
        target_user_id=owner.id,
        target_agency_id=agency_id,
        ip_address=request.client.host if request.client else None,
    )
    db.add(log)
    await db.commit()

    return {"success": True, "data": {"token": token, "user_id": str(owner.id)}}


# ── Agency owner endpoints ────────────────────────────────────────────────────


@router.get(
    "/api/v1/agency/me", response_model=dict, dependencies=[Depends(require_feature(WHITE_LABEL))]
)
async def get_my_agency(user: CurrentUser, db: DBSession) -> dict:
    a = await _owner_agency(user.id, db)
    return {"success": True, "data": _agency_dict(a)}


@router.put(
    "/api/v1/agency/me", response_model=dict, dependencies=[Depends(require_feature(WHITE_LABEL))]
)
async def update_my_agency(body: AgencyMeUpdateRequest, user: CurrentUser, db: DBSession) -> dict:
    a = await _owner_agency(user.id, db)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(a, k, v)
    a.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(a)
    return {"success": True, "data": _agency_dict(a)}


@router.get(
    "/api/v1/agency/me/domain-status",
    response_model=dict,
    dependencies=[Depends(require_feature(WHITE_LABEL))],
)
async def domain_status(user: CurrentUser, db: DBSession) -> dict:
    a = await _owner_agency(user.id, db)
    if not a.custom_domain:
        return {"success": True, "data": {"domain": None, "verified": False}}
    try:
        addrs = socket.getaddrinfo(a.custom_domain, None)
        resolved = bool(addrs)
    except Exception:
        resolved = False
    return {
        "success": True,
        "data": {
            "domain": a.custom_domain,
            "verified": a.custom_domain_verified,
            "dns_resolves": resolved,
        },
    }


@router.post(
    "/api/v1/agency/verify-domain",
    response_model=dict,
    dependencies=[Depends(require_feature(WHITE_LABEL))],
)
async def verify_domain(body: DomainVerifyRequest, user: CurrentUser, db: DBSession) -> dict:
    a = await _owner_agency(user.id, db)
    domain = body.domain.strip().lower()
    try:
        addrs = socket.getaddrinfo(domain, None)
        resolves = bool(addrs)
    except Exception:
        resolves = False

    if resolves:
        a.custom_domain = domain
        a.custom_domain_verified = True
        a.updated_at = datetime.now(UTC)
        await db.commit()

    return {"success": True, "data": {"domain": domain, "verified": resolves}}


@router.post(
    "/api/v1/agency/send-test-email",
    response_model=dict,
    dependencies=[Depends(require_feature(WHITE_LABEL))],
)
async def send_test_email(body: TestEmailRequest, user: CurrentUser, db: DBSession) -> dict:
    a = await _owner_agency(user.id, db)
    if not a.smtp_config:
        raise HTTPException(status_code=422, detail="SMTP config not set")
    to_email = body.to or user.email
    try:
        import smtplib
        from email.mime.text import MIMEText

        cfg = a.smtp_config
        msg = MIMEText("This is a test email from your ChatCraft agency configuration.")
        msg["Subject"] = "Test Email"
        msg["From"] = a.from_email or cfg.get("user", "")
        msg["To"] = to_email
        with smtplib.SMTP(cfg["host"], int(cfg.get("port", 587))) as server:
            server.starttls()
            server.login(cfg["user"], cfg["password"])
            server.send_message(msg)
        return {"success": True, "data": {"sent": True}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SMTP test failed: {e}")


# ── Agency reseller subscriptions ─────────────────────────────────────────────


@router.get(
    "/api/v1/agency/subscriptions",
    response_model=dict,
    dependencies=[Depends(require_feature(WHITE_LABEL))],
)
async def list_reseller_subscriptions(user: CurrentUser, db: DBSession) -> dict:
    a = await _owner_agency(user.id, db)
    result = await db.execute(
        select(ResellerSubscription)
        .where(ResellerSubscription.agency_id == a.id)
        .order_by(ResellerSubscription.created_at.desc())
    )
    subs = result.scalars().all()
    return {
        "success": True,
        "data": [
            {
                "id": str(s.id),
                "client_email": s.client_email,
                "plan": s.plan,
                "amount": s.amount,
                "status": s.status,
                "license_token": s.license_token,
                "stripe_subscription_id": s.stripe_subscription_id,
                "created_at": s.created_at.isoformat(),
            }
            for s in subs
        ],
    }


# ── Agency team management ────────────────────────────────────────────────────


def _team_member_dict(m: AgencyTeamMember) -> dict:
    return {
        "id": str(m.id),
        "agency_id": str(m.agency_id),
        "member_email": m.member_email,
        "role": m.role,
        "status": m.status,
        "invited_by": str(m.invited_by) if m.invited_by else None,
        "created_at": m.created_at.isoformat(),
    }


@router.get(
    "/api/v1/agency/team", response_model=dict, dependencies=[Depends(require_feature(WHITE_LABEL))]
)
async def list_agency_team(user: CurrentUser, db: DBSession) -> dict:
    a = await _owner_agency(user.id, db)
    result = await db.execute(
        select(AgencyTeamMember)
        .where(AgencyTeamMember.agency_id == a.id)
        .order_by(AgencyTeamMember.created_at.desc())
    )
    members = result.scalars().all()
    return {"success": True, "data": [_team_member_dict(m) for m in members]}


@router.post(
    "/api/v1/agency/team",
    response_model=dict,
    status_code=201,
    dependencies=[Depends(require_feature(WHITE_LABEL))],
)
async def invite_agency_team_member(
    body: TeamMemberInviteRequest, user: CurrentUser, db: DBSession
) -> dict:
    a = await _owner_agency(user.id, db)
    member_email = body.member_email.strip().lower()
    role = body.role

    existing = await db.execute(
        select(AgencyTeamMember).where(
            AgencyTeamMember.agency_id == a.id,
            AgencyTeamMember.member_email == member_email,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Member already invited")

    m = AgencyTeamMember(
        agency_id=a.id,
        member_email=member_email,
        role=role,
        status="pending",
        invited_by=user.id,
    )
    db.add(m)
    await db.commit()
    await db.refresh(m)
    return {"success": True, "data": _team_member_dict(m)}


@router.patch(
    "/api/v1/agency/team/{member_id}",
    response_model=dict,
    dependencies=[Depends(require_feature(WHITE_LABEL))],
)
async def update_agency_team_member(
    member_id: uuid.UUID, body: TeamMemberUpdateRequest, user: CurrentUser, db: DBSession
) -> dict:
    a = await _owner_agency(user.id, db)
    m = await db.get(AgencyTeamMember, member_id)
    if not m or m.agency_id != a.id:
        raise HTTPException(status_code=404, detail="Team member not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(m, k, v)
    await db.commit()
    await db.refresh(m)
    return {"success": True, "data": _team_member_dict(m)}


@router.delete(
    "/api/v1/agency/team/{member_id}",
    response_model=dict,
    dependencies=[Depends(require_feature(WHITE_LABEL))],
)
async def remove_agency_team_member(member_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    a = await _owner_agency(user.id, db)
    m = await db.get(AgencyTeamMember, member_id)
    if not m or m.agency_id != a.id:
        raise HTTPException(status_code=404, detail="Team member not found")
    await db.delete(m)
    await db.commit()
    return {"success": True, "data": None}


# ── Public: License token validation ─────────────────────────────────────────


@router.post("/api/public/license/validate", response_model=dict)
async def validate_license(body: LicenseValidateRequest, db: DBSession) -> dict:
    """Validate a reseller license token (called by widget embed on load)."""
    token = body.token.strip()

    result = await db.execute(
        select(ResellerSubscription).where(ResellerSubscription.license_token == token)
    )
    sub = result.scalar_one_or_none()
    if not sub:
        return {"success": False, "data": {"valid": False, "reason": "not_found"}}
    if sub.status != "active":
        return {"success": False, "data": {"valid": False, "reason": "inactive"}}

    agency = await db.get(Agency, sub.agency_id)
    return {
        "success": True,
        "data": {
            "valid": True,
            "plan": sub.plan,
            "agency_id": str(sub.agency_id),
            "agency_name": agency.slug if agency else None,
        },
    }


# ── Agency custom pricing tiers ───────────────────────────────────────────────


def _tier_dict(t: AgencyPricingTier) -> dict:
    return {
        "id": str(t.id),
        "plan_key": t.plan_key,
        "display_name": t.display_name,
        "price_monthly": t.price_monthly,
        "price_yearly": t.price_yearly,
        "features": t.features,
        "is_active": t.is_active,
        "created_at": t.created_at.isoformat(),
        "updated_at": t.updated_at.isoformat(),
    }


@router.get(
    "/api/v1/agency/pricing",
    response_model=dict,
    dependencies=[Depends(require_feature(WHITE_LABEL))],
)
async def get_agency_pricing(user: CurrentUser, db: DBSession) -> dict:
    a = await _owner_agency(user.id, db)
    result = await db.execute(
        select(AgencyPricingTier)
        .where(AgencyPricingTier.agency_id == a.id)
        .order_by(AgencyPricingTier.price_monthly)
    )
    tiers = result.scalars().all()
    return {"success": True, "data": [_tier_dict(t) for t in tiers]}


@router.put(
    "/api/v1/agency/pricing",
    response_model=dict,
    dependencies=[Depends(require_feature(WHITE_LABEL))],
)
async def upsert_agency_pricing(
    body: AgencyPricingUpsertRequest, user: CurrentUser, db: DBSession
) -> dict:
    """Replace the full set of pricing tiers for the agency."""
    a = await _owner_agency(user.id, db)

    # Delete existing tiers
    existing = await db.execute(
        select(AgencyPricingTier).where(AgencyPricingTier.agency_id == a.id)
    )
    for t in existing.scalars().all():
        await db.delete(t)

    new_tiers = []
    for td in body.tiers:
        t = AgencyPricingTier(
            agency_id=a.id,
            plan_key=td.plan_key.strip(),
            display_name=td.display_name.strip(),
            price_monthly=td.price_monthly,
            price_yearly=td.price_yearly,
            features=td.features,
            is_active=td.is_active,
        )
        db.add(t)
        new_tiers.append(t)

    await db.commit()
    for t in new_tiers:
        await db.refresh(t)
    return {"success": True, "data": [_tier_dict(t) for t in new_tiers]}


@router.post(
    "/api/v1/agency/subscriptions",
    response_model=dict,
    status_code=201,
    dependencies=[Depends(require_feature(WHITE_LABEL))],
)
async def create_reseller_subscription(
    body: ResellerSubscriptionCreateRequest, user: CurrentUser, db: DBSession
) -> dict:
    a = await _owner_agency(user.id, db)
    client_email = body.client_email.strip()
    license_token = secrets.token_hex(32)
    sub = ResellerSubscription(
        agency_id=a.id,
        client_email=client_email,
        plan=body.plan,
        amount=body.amount,
        status="active",
        license_token=license_token,
        stripe_subscription_id=body.stripe_subscription_id,
    )
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    return {
        "success": True,
        "data": {
            "id": str(sub.id),
            "client_email": sub.client_email,
            "plan": sub.plan,
            "amount": sub.amount,
            "status": sub.status,
            "license_token": sub.license_token,
            "created_at": sub.created_at.isoformat(),
        },
    }
