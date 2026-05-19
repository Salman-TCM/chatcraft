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
"""
import secrets
import socket
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentUser, DBSession, RequireAdmin
from app.core.config import settings
from app.models.white_label import (
    Agency, ImpersonationAuditLog, ResellerSubscription, Tenant,
)
from app.models.user import User, UserRole

router = APIRouter(tags=["white_label"])


# ── Public: domain resolution (called by Next.js middleware) ─────────────────

@router.get("/api/public/agency-by-domain", response_model=dict)
async def agency_by_domain(host: str, db: DBSession) -> dict:
    """Resolve agency from hostname (custom domain or {slug}.platform.com)."""
    from sqlalchemy import or_
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
        return {"success": False, "data": None}
    return {
        "success": True,
        "data": {
            "id": str(a.id),
            "name": a.slug,
            "primary_colour": a.primary_colour,
            "logo_url": a.logo_url,
            "favicon_url": a.favicon_url,
        },
    }


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
        raise HTTPException(status_code=404, detail={"success": False, "error": "Agency not found", "code": "NOT_FOUND"})
    return a


async def _owner_agency(user_id: uuid.UUID, db: AsyncSession) -> Agency:
    result = await db.execute(select(Agency).where(Agency.owner_user_id == user_id))
    a = result.scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail={"success": False, "error": "No agency found for this user", "code": "NOT_FOUND"})
    return a


# ── Superadmin: Agency CRUD ───────────────────────────────────────────────────

@router.get("/api/v1/agencies", response_model=dict, dependencies=[RequireAdmin])
async def list_agencies(db: DBSession) -> dict:
    result = await db.execute(select(Agency).order_by(Agency.created_at.desc()))
    agencies = result.scalars().all()
    return {"success": True, "data": [_agency_dict(a) for a in agencies]}


@router.post("/api/v1/agencies", response_model=dict, status_code=201, dependencies=[RequireAdmin])
async def create_agency(body: dict, db: DBSession) -> dict:
    slug = (body.get("slug") or "").strip().lower().replace(" ", "-")
    if not slug:
        raise HTTPException(status_code=422, detail="slug required")
    owner_user_id = body.get("owner_user_id")
    if not owner_user_id:
        raise HTTPException(status_code=422, detail="owner_user_id required")

    a = Agency(
        slug=slug,
        primary_colour=body.get("primary_colour", "#6366f1"),
        plan=body.get("plan", "starter"),
        status=body.get("status", "active"),
        owner_user_id=uuid.UUID(str(owner_user_id)),
        support_email=body.get("support_email"),
        from_email=body.get("from_email"),
    )
    db.add(a)
    await db.commit()
    await db.refresh(a)
    return {"success": True, "data": _agency_dict(a)}


@router.get("/api/v1/agencies/{agency_id}", response_model=dict, dependencies=[RequireAdmin])
async def get_agency(agency_id: uuid.UUID, db: DBSession) -> dict:
    a = await _get_agency(agency_id, db)
    return {"success": True, "data": _agency_dict(a)}


@router.patch("/api/v1/agencies/{agency_id}", response_model=dict, dependencies=[RequireAdmin])
async def update_agency(agency_id: uuid.UUID, body: dict, db: DBSession) -> dict:
    a = await _get_agency(agency_id, db)
    updatable = {"slug", "custom_domain", "logo_url", "favicon_url", "primary_colour",
                 "support_email", "from_email", "smtp_config", "plan", "status"}
    for k, v in body.items():
        if k in updatable:
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

@router.get("/api/v1/agencies/{agency_id}/tenants", response_model=dict, dependencies=[RequireAdmin])
async def list_tenants(agency_id: uuid.UUID, db: DBSession) -> dict:
    await _get_agency(agency_id, db)
    result = await db.execute(
        select(Tenant).where(Tenant.agency_id == agency_id).order_by(Tenant.created_at.desc())
    )
    tenants = result.scalars().all()
    return {"success": True, "data": [_tenant_dict(t) for t in tenants]}


@router.post("/api/v1/agencies/{agency_id}/tenants", response_model=dict, status_code=201, dependencies=[RequireAdmin])
async def create_tenant(agency_id: uuid.UUID, body: dict, db: DBSession) -> dict:
    await _get_agency(agency_id, db)
    slug = (body.get("slug") or "").strip().lower().replace(" ", "-")
    name = (body.get("name") or "").strip()
    if not slug or not name:
        raise HTTPException(status_code=422, detail="name and slug required")
    t = Tenant(
        agency_id=agency_id,
        name=name,
        slug=slug,
        plan=body.get("plan", "starter"),
        status=body.get("status", "active"),
    )
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return {"success": True, "data": _tenant_dict(t)}


@router.delete("/api/v1/agencies/{agency_id}/tenants/{tenant_id}", response_model=dict, dependencies=[RequireAdmin])
async def delete_tenant(agency_id: uuid.UUID, tenant_id: uuid.UUID, db: DBSession) -> dict:
    await _get_agency(agency_id, db)
    t = await db.get(Tenant, tenant_id)
    if not t or t.agency_id != agency_id:
        raise HTTPException(status_code=404, detail={"success": False, "error": "Tenant not found", "code": "NOT_FOUND"})
    await db.delete(t)
    await db.commit()
    return {"success": True, "data": None}


# ── Superadmin: Agency impersonation ─────────────────────────────────────────

@router.post("/api/admin/agencies/{agency_id}/impersonate", response_model=dict, dependencies=[RequireAdmin])
async def impersonate_agency(agency_id: uuid.UUID, user: CurrentUser, request: Request, db: DBSession) -> dict:
    from jose import jwt
    a = await _get_agency(agency_id, db)
    owner = await db.get(User, a.owner_user_id)
    if not owner:
        raise HTTPException(status_code=404, detail="Agency owner not found")

    now = datetime.now(timezone.utc)
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

@router.get("/api/v1/agency/me", response_model=dict)
async def get_my_agency(user: CurrentUser, db: DBSession) -> dict:
    a = await _owner_agency(user.id, db)
    return {"success": True, "data": _agency_dict(a)}


@router.put("/api/v1/agency/me", response_model=dict)
async def update_my_agency(body: dict, user: CurrentUser, db: DBSession) -> dict:
    a = await _owner_agency(user.id, db)
    updatable = {"logo_url", "favicon_url", "primary_colour", "support_email", "from_email", "smtp_config"}
    for k, v in body.items():
        if k in updatable:
            setattr(a, k, v)
    a.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(a)
    return {"success": True, "data": _agency_dict(a)}


@router.get("/api/v1/agency/me/domain-status", response_model=dict)
async def domain_status(user: CurrentUser, db: DBSession) -> dict:
    a = await _owner_agency(user.id, db)
    if not a.custom_domain:
        return {"success": True, "data": {"domain": None, "verified": False}}
    try:
        addrs = socket.getaddrinfo(a.custom_domain, None)
        resolved = bool(addrs)
    except Exception:
        resolved = False
    return {"success": True, "data": {"domain": a.custom_domain, "verified": a.custom_domain_verified, "dns_resolves": resolved}}


@router.post("/api/v1/agency/verify-domain", response_model=dict)
async def verify_domain(body: dict, user: CurrentUser, db: DBSession) -> dict:
    a = await _owner_agency(user.id, db)
    domain = (body.get("domain") or "").strip().lower()
    if not domain:
        raise HTTPException(status_code=422, detail="domain required")
    try:
        addrs = socket.getaddrinfo(domain, None)
        resolves = bool(addrs)
    except Exception:
        resolves = False

    if resolves:
        a.custom_domain = domain
        a.custom_domain_verified = True
        a.updated_at = datetime.now(timezone.utc)
        await db.commit()

    return {"success": True, "data": {"domain": domain, "verified": resolves}}


@router.post("/api/v1/agency/send-test-email", response_model=dict)
async def send_test_email(body: dict, user: CurrentUser, db: DBSession) -> dict:
    a = await _owner_agency(user.id, db)
    if not a.smtp_config:
        raise HTTPException(status_code=422, detail="SMTP config not set")
    to_email = body.get("to") or user.email
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

@router.get("/api/v1/agency/subscriptions", response_model=dict)
async def list_reseller_subscriptions(user: CurrentUser, db: DBSession) -> dict:
    a = await _owner_agency(user.id, db)
    result = await db.execute(
        select(ResellerSubscription).where(ResellerSubscription.agency_id == a.id).order_by(ResellerSubscription.created_at.desc())
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


@router.post("/api/v1/agency/subscriptions", response_model=dict, status_code=201)
async def create_reseller_subscription(body: dict, user: CurrentUser, db: DBSession) -> dict:
    a = await _owner_agency(user.id, db)
    client_email = (body.get("client_email") or "").strip()
    if not client_email:
        raise HTTPException(status_code=422, detail="client_email required")
    license_token = secrets.token_hex(32)
    sub = ResellerSubscription(
        agency_id=a.id,
        client_email=client_email,
        plan=body.get("plan", "starter"),
        amount=int(body.get("amount", 0)),
        status="active",
        license_token=license_token,
        stripe_subscription_id=body.get("stripe_subscription_id"),
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
