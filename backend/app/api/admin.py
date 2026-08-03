"""
Superadmin API — all routes require the `admin` role.
Provides platform-wide stats, user management, chatbot oversight,
subscription overrides, and short-lived impersonation tokens.
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.core.dependencies import CurrentUser, DBSession, RequireAdmin
from app.core.features import ALL_FEATURES
from app.core.security import create_access_token
from app.models.chatbot_config import ChatbotConfig
from app.models.conversation import Conversation
from app.models.message import Message, MessageRole
from app.models.payment import Payment, PaymentStatus
from app.models.subscription import Subscription, SubscriptionPlan, SubscriptionState
from app.models.usage_log import UsageLog
from app.models.user import User, UserRole
from app.schemas.admin import (
    UpdatePlatformSettingsRequest,
    UpdateUserFeaturesRequest,
    UpdateUserRequest,
)

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[RequireAdmin])


# ══════════════════════════════════════════════════════════════════════════════
# PLATFORM STATS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/stats", response_model=dict)
async def get_platform_stats(db: DBSession) -> dict:
    """High-level KPIs for the whole platform."""
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_start = today_start - timedelta(days=1)

    # ── User counts ──────────────────────────────────────────────────────────
    role_counts_res = await db.execute(
        select(User.role, func.count().label("n")).group_by(User.role)
    )
    role_counts = {str(r.role): int(r.n) for r in role_counts_res.all()}

    total_users = sum(role_counts.values())
    paying_users = (
        role_counts.get("premium", 0)
        + role_counts.get("creator", 0)
        + role_counts.get("trial", 0)
    )

    new_today_res = await db.execute(
        select(func.count()).select_from(User).where(User.created_at >= today_start)
    )
    new_today = new_today_res.scalar_one()

    new_yesterday_res = await db.execute(
        select(func.count()).select_from(User).where(
            User.created_at >= yesterday_start, User.created_at < today_start
        )
    )
    new_yesterday = new_yesterday_res.scalar_one()

    # ── Subscriptions ────────────────────────────────────────────────────────
    active_subs_res = await db.execute(
        select(func.count()).select_from(Subscription).where(
            Subscription.status.in_([SubscriptionState.active, SubscriptionState.trialing])
        )
    )
    active_subs = active_subs_res.scalar_one()

    past_due_res = await db.execute(
        select(func.count()).select_from(Subscription).where(
            Subscription.status == SubscriptionState.past_due
        )
    )
    past_due_subs = past_due_res.scalar_one()

    # ── Revenue (this month) ─────────────────────────────────────────────────
    mrr_res = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.status == PaymentStatus.succeeded,
            Payment.created_at >= month_start,
        )
    )
    mrr_cents = mrr_res.scalar_one()

    # ── AI Cost (this month) ─────────────────────────────────────────────────
    ai_cost_res = await db.execute(
        select(func.coalesce(func.sum(UsageLog.cost_usd), 0)).where(
            UsageLog.created_at >= month_start
        )
    )
    ai_cost = ai_cost_res.scalar_one()

    # ── Chatbots & messages ──────────────────────────────────────────────────
    chatbot_count_res = await db.execute(select(func.count()).select_from(ChatbotConfig))
    chatbot_count = chatbot_count_res.scalar_one()

    msgs_today_res = await db.execute(
        select(func.count()).select_from(Message).where(
            Message.created_at >= today_start,
            Message.role == MessageRole.user,
        )
    )
    msgs_today = msgs_today_res.scalar_one()

    msgs_month_res = await db.execute(
        select(func.count()).select_from(Message).where(
            Message.created_at >= month_start,
            Message.role == MessageRole.user,
        )
    )
    msgs_month = msgs_month_res.scalar_one()

    return {
        "success": True,
        "data": {
            "users": {
                "total": total_users,
                "paying": paying_users,
                "by_role": role_counts,
                "new_today": new_today,
                "new_yesterday": new_yesterday,
            },
            "subscriptions": {
                "active": active_subs,
                "past_due": past_due_subs,
            },
            "revenue": {
                "mrr_cents": int(mrr_cents),
            },
            "ai": {
                "cost_usd_this_month": str(ai_cost),
            },
            "platform": {
                "chatbot_count": chatbot_count,
                "messages_today": msgs_today,
                "messages_this_month": msgs_month,
            },
        },
    }


@router.get("/signups-per-day", response_model=dict)
async def get_signups_per_day(
    db: DBSession,
    days: Annotated[int, Query(ge=7, le=90)] = 30,
) -> dict:
    since = (datetime.now(timezone.utc) - timedelta(days=days - 1)).date()
    res = await db.execute(
        select(
            func.date(User.created_at).label("day"),
            func.count().label("count"),
        )
        .where(func.date(User.created_at) >= since)
        .group_by(func.date(User.created_at))
        .order_by(func.date(User.created_at))
    )
    row_map = {str(r.day): int(r.count) for r in res.all()}
    from datetime import date, timedelta as td
    data = [
        {"date": str(since + td(days=i)), "count": row_map.get(str(since + td(days=i)), 0)}
        for i in range(days)
    ]
    return {"success": True, "data": data}


@router.get("/revenue-per-day", response_model=dict)
async def get_revenue_per_day(
    db: DBSession,
    days: Annotated[int, Query(ge=7, le=90)] = 30,
) -> dict:
    since = (datetime.now(timezone.utc) - timedelta(days=days - 1)).date()
    res = await db.execute(
        select(
            func.date(Payment.created_at).label("day"),
            func.coalesce(func.sum(Payment.amount), 0).label("total"),
        )
        .where(
            func.date(Payment.created_at) >= since,
            Payment.status == PaymentStatus.succeeded,
        )
        .group_by(func.date(Payment.created_at))
        .order_by(func.date(Payment.created_at))
    )
    row_map = {str(r.day): int(r.total) for r in res.all()}
    from datetime import date, timedelta as td
    data = [
        {"date": str(since + td(days=i)), "amount_cents": row_map.get(str(since + td(days=i)), 0)}
        for i in range(days)
    ]
    return {"success": True, "data": data}


# ══════════════════════════════════════════════════════════════════════════════
# USER MANAGEMENT
# ══════════════════════════════════════════════════════════════════════════════

def _user_dict(u: User) -> dict:
    sub = u.subscription
    return {
        "id": str(u.id),
        "email": u.email,
        "name": u.name,
        "role": u.role.value,
        "email_verified": u.email_verified,
        "is_suspended": getattr(u, "is_suspended", False),
        "suspended_reason": getattr(u, "suspended_reason", None),
        "subscription": {
            "plan": sub.plan.value if sub else None,
            "status": sub.status.value if sub else None,
            "current_period_end": sub.current_period_end.isoformat() if sub and sub.current_period_end else None,
        } if sub else None,
        "stripe_customer_id": u.stripe_customer_id,
        "allowed_features": u.allowed_features,  # None = unrestricted, list = specific features only
        "created_at": u.created_at.isoformat(),
        "updated_at": u.updated_at.isoformat(),
    }


@router.get("/users", response_model=dict)
async def list_users(
    db: DBSession,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    q: str | None = None,
    role: str | None = None,
) -> dict:
    offset = (page - 1) * limit
    stmt = (
        select(User)
        .options(selectinload(User.subscription))
        .order_by(User.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    if q:
        stmt = stmt.where(
            or_(User.email.ilike(f"%{q}%"), User.name.ilike(f"%{q}%"))
        )
    if role:
        stmt = stmt.where(User.role == UserRole(role))

    result = await db.execute(stmt)
    users = result.scalars().all()

    count_stmt = select(func.count()).select_from(User)
    if q:
        count_stmt = count_stmt.where(
            or_(User.email.ilike(f"%{q}%"), User.name.ilike(f"%{q}%"))
        )
    if role:
        count_stmt = count_stmt.where(User.role == UserRole(role))
    total = (await db.execute(count_stmt)).scalar_one()

    return {
        "success": True,
        "data": [_user_dict(u) for u in users],
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.get("/users/{user_id}", response_model=dict)
async def get_user(user_id: uuid.UUID, db: DBSession) -> dict:
    result = await db.execute(
        select(User)
        .where(User.id == user_id)
        .options(selectinload(User.subscription))
    )
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Chatbot count for this user
    bot_count_res = await db.execute(
        select(func.count()).select_from(ChatbotConfig).where(ChatbotConfig.user_id == user_id)
    )
    bot_count = bot_count_res.scalar_one()

    # Total messages sent by this user's chatbots
    msg_count_res = await db.execute(
        select(func.count()).select_from(Message)
        .join(Conversation, Message.conversation_id == Conversation.id)
        .join(ChatbotConfig, Conversation.chatbot_id == ChatbotConfig.id)
        .where(ChatbotConfig.user_id == user_id, Message.role == MessageRole.user)
    )
    msg_count = msg_count_res.scalar_one()

    # Total AI spend
    spend_res = await db.execute(
        select(func.coalesce(func.sum(UsageLog.cost_usd), 0))
        .where(UsageLog.user_id == user_id)
    )
    total_spend = spend_res.scalar_one()

    data = _user_dict(u)
    data["stats"] = {
        "chatbot_count": bot_count,
        "message_count": msg_count,
        "total_ai_spend_usd": str(total_spend),
    }
    return {"success": True, "data": data}


@router.patch("/users/{user_id}", response_model=dict)
async def update_user(
    user_id: uuid.UUID,
    body: UpdateUserRequest,
    db: DBSession,
    caller: CurrentUser,
) -> dict:
    from app.models.admin_log import AdminActionLog

    result = await db.execute(
        select(User).where(User.id == user_id).options(selectinload(User.subscription))
    )
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # superadmin accounts are off-limits to plain admins
    if u.role == UserRole.superadmin and caller.role != UserRole.superadmin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only superadmins can modify superadmin accounts",
        )

    updates = body.model_dump(exclude_unset=True)

    # Prevent any user from stripping their own elevated role
    if str(u.id) == str(caller.id) and updates.get("role") and updates["role"] not in ("admin", "superadmin"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot demote your own account",
        )

    if "role" in updates:
        # Only superadmin can grant the superadmin role
        if updates["role"] == "superadmin" and caller.role != UserRole.superadmin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only superadmins can grant the superadmin role",
            )
        old_role = u.role.value
        u.role = UserRole(updates["role"])
        db.add(AdminActionLog(
            admin_user_id=caller.id,
            admin_email=caller.email,
            action="role_change",
            target_user_id=u.id,
            target_email=u.email,
            old_value=old_role,
            new_value=updates["role"],
        ))

    if "email_verified" in updates:
        old_ev = str(u.email_verified)
        u.email_verified = bool(updates["email_verified"])
        db.add(AdminActionLog(
            admin_user_id=caller.id,
            admin_email=caller.email,
            action="verify_email",
            target_user_id=u.id,
            target_email=u.email,
            old_value=old_ev,
            new_value=str(u.email_verified),
        ))

    # Override subscription plan/status
    if ("plan" in updates or "subscription_status" in updates) and u.subscription:
        if "plan" in updates:
            old_plan = u.subscription.plan.value
            u.subscription.plan = SubscriptionPlan(updates["plan"])
            db.add(AdminActionLog(
                admin_user_id=caller.id,
                admin_email=caller.email,
                action="plan_change",
                target_user_id=u.id,
                target_email=u.email,
                old_value=old_plan,
                new_value=updates["plan"],
            ))
        if "subscription_status" in updates:
            u.subscription.status = SubscriptionState(updates["subscription_status"])

    await db.commit()
    await db.refresh(u)
    return {"success": True, "data": _user_dict(u)}


@router.delete("/users/{user_id}", response_model=dict)
async def delete_user(
    user_id: uuid.UUID,
    db: DBSession,
    caller: CurrentUser,
) -> dict:
    from app.models.admin_log import AdminActionLog

    if str(user_id) == str(caller.id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account via admin panel",
        )
    result = await db.execute(select(User).where(User.id == user_id))
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # superadmin accounts are off-limits to plain admins
    if u.role == UserRole.superadmin and caller.role != UserRole.superadmin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only superadmins can delete superadmin accounts",
        )

    db.add(AdminActionLog(
        admin_user_id=caller.id,
        admin_email=caller.email,
        action="user_delete",
        target_user_id=u.id,
        target_email=u.email,
        old_value=u.role.value,
        new_value=None,
    ))
    await db.delete(u)
    await db.commit()
    return {"success": True, "data": None}


@router.post("/users/{user_id}/impersonate", response_model=dict)
async def impersonate_user(
    user_id: uuid.UUID,
    db: DBSession,
    caller: CurrentUser,
) -> dict:
    """Issue a short-lived access token (15 min) for the target user."""
    from app.models.admin_log import AdminActionLog

    result = await db.execute(
        select(User).where(User.id == user_id).options(selectinload(User.subscription))
    )
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if str(u.id) == str(caller.id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot impersonate yourself")

    from jose import jwt
    from app.core.config import settings
    from app.models.white_label import ImpersonationAuditLog

    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(u.id),
        "role": u.role.value,
        "iat": now,
        "exp": now + timedelta(minutes=15),
        "type": "access",
        "impersonated_by": str(caller.id),
    }
    token = jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)

    db.add(ImpersonationAuditLog(actor_user_id=caller.id, target_user_id=u.id))
    db.add(AdminActionLog(
        admin_user_id=caller.id,
        admin_email=caller.email,
        action="impersonate",
        target_user_id=u.id,
        target_email=u.email,
        old_value=None,
        new_value=None,
    ))
    await db.commit()

    return {"success": True, "data": {"access_token": token, "expires_in": 900, "user": _user_dict(u)}}


@router.post("/users/{user_id}/suspend", response_model=dict)
async def suspend_user(
    user_id: uuid.UUID,
    db: DBSession,
    caller: CurrentUser,
    reason: str | None = None,
) -> dict:
    from app.models.admin_log import AdminActionLog
    from datetime import datetime, timezone

    if str(user_id) == str(caller.id):
        raise HTTPException(status_code=400, detail="Cannot suspend your own account")
    result = await db.execute(select(User).where(User.id == user_id))
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    u.is_suspended = True
    u.suspended_at = datetime.now(timezone.utc)
    u.suspended_reason = reason
    db.add(AdminActionLog(
        admin_user_id=caller.id, admin_email=caller.email,
        action="suspend", target_user_id=u.id, target_email=u.email,
        old_value="active", new_value=f"suspended: {reason or 'no reason'}",
    ))
    await db.commit()
    return {"success": True}


@router.post("/users/{user_id}/unsuspend", response_model=dict)
async def unsuspend_user(user_id: uuid.UUID, db: DBSession, caller: CurrentUser) -> dict:
    from app.models.admin_log import AdminActionLog

    result = await db.execute(select(User).where(User.id == user_id))
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    u.is_suspended = False
    u.suspended_at = None
    u.suspended_reason = None
    db.add(AdminActionLog(
        admin_user_id=caller.id, admin_email=caller.email,
        action="unsuspend", target_user_id=u.id, target_email=u.email,
        old_value="suspended", new_value="active",
    ))
    await db.commit()
    return {"success": True}


# ─── Platform settings ────────────────────────────────────────────────────────

_DEFAULT_SETTINGS = {
    "allow_signups": True,
    "require_email_verification": True,
    "max_chatbots_free": 3,
    "max_messages_free": 500,
    "maintenance_mode": False,
    "maintenance_message": "We'll be back shortly.",
    "feature_voice_lab": True,
    "feature_agent_builder": True,
    "feature_browser_agent": True,
    "feature_social": True,
}


@router.get("/settings", response_model=dict)
async def get_platform_settings(db: DBSession) -> dict:
    from app.models.platform_settings import PlatformSetting

    result = await db.execute(select(PlatformSetting))
    stored = {r.key: r.value for r in result.scalars().all()}
    # Merge with defaults so new keys always appear
    merged = {**_DEFAULT_SETTINGS, **{k: v for k, v in stored.items() if k in _DEFAULT_SETTINGS}}
    return {"success": True, "data": merged}


@router.patch("/settings", response_model=dict)
async def update_platform_settings(
    body: UpdatePlatformSettingsRequest, db: DBSession, caller: CurrentUser
) -> dict:
    from app.models.platform_settings import PlatformSetting

    for key, value in body.model_dump(exclude_unset=True).items():
        result = await db.execute(select(PlatformSetting).where(PlatformSetting.key == key))
        row = result.scalar_one_or_none()
        if row:
            row.value = value
        else:
            db.add(PlatformSetting(key=key, value=value))
    await db.commit()
    return {"success": True}


@router.get("/action-log", response_model=dict)
async def list_action_log(
    db: DBSession,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    action: str | None = Query(None),
) -> dict:
    """Audit log for all admin mutations (role changes, deletions, impersonation)."""
    from app.models.admin_log import AdminActionLog

    offset = (page - 1) * limit
    stmt = select(AdminActionLog).order_by(AdminActionLog.created_at.desc())
    count_stmt = select(func.count()).select_from(AdminActionLog)
    if action:
        stmt = stmt.where(AdminActionLog.action == action)
        count_stmt = count_stmt.where(AdminActionLog.action == action)

    result = await db.execute(stmt.offset(offset).limit(limit))
    logs = result.scalars().all()
    total = (await db.execute(count_stmt)).scalar_one()

    return {
        "success": True,
        "data": [
            {
                "id": str(log.id),
                "admin_email": log.admin_email,
                "action": log.action,
                "target_email": log.target_email,
                "old_value": log.old_value,
                "new_value": log.new_value,
                "created_at": log.created_at.isoformat(),
            }
            for log in logs
        ],
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.get("/impersonation-log", response_model=dict)
async def list_impersonation_log(
    db: DBSession,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> dict:
    from app.models.white_label import ImpersonationAuditLog
    offset = (page - 1) * limit
    result = await db.execute(
        select(ImpersonationAuditLog)
        .order_by(ImpersonationAuditLog.started_at.desc())
        .offset(offset)
        .limit(limit)
    )
    logs = result.scalars().all()
    total = (await db.execute(select(func.count()).select_from(ImpersonationAuditLog))).scalar_one()
    return {
        "success": True,
        "data": [
            {
                "id": str(l.id),
                "actor_user_id": str(l.actor_user_id),
                "target_user_id": str(l.target_user_id) if l.target_user_id else None,
                "target_agency_id": str(l.target_agency_id) if l.target_agency_id else None,
                "started_at": l.started_at.isoformat(),
                "ended_at": l.ended_at.isoformat() if l.ended_at else None,
                "ip_address": l.ip_address,
            }
            for l in logs
        ],
        "total": total,
        "page": page,
        "limit": limit,
    }


# ══════════════════════════════════════════════════════════════════════════════
# CHATBOT OVERSIGHT
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/chatbots", response_model=dict)
async def list_all_chatbots(
    db: DBSession,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    q: str | None = None,
) -> dict:
    offset = (page - 1) * limit
    stmt = (
        select(ChatbotConfig)
        .options(selectinload(ChatbotConfig.user))
        .order_by(ChatbotConfig.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    if q:
        stmt = stmt.where(ChatbotConfig.name.ilike(f"%{q}%"))

    result = await db.execute(stmt)
    bots = result.scalars().all()

    count_stmt = select(func.count()).select_from(ChatbotConfig)
    if q:
        count_stmt = count_stmt.where(ChatbotConfig.name.ilike(f"%{q}%"))
    total = (await db.execute(count_stmt)).scalar_one()

    return {
        "success": True,
        "data": [
            {
                "id": str(b.id),
                "name": b.name,
                "default_model": b.default_model,
                "published": b.published,
                "created_at": b.created_at.isoformat(),
                "owner": {
                    "id": str(b.user.id),
                    "email": b.user.email,
                    "name": b.user.name,
                } if b.user else None,
            }
            for b in bots
        ],
        "total": total,
        "page": page,
        "limit": limit,
    }


# ══════════════════════════════════════════════════════════════════════════════
# RECENT PAYMENTS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/payments", response_model=dict)
async def list_payments(
    db: DBSession,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> dict:
    offset = (page - 1) * limit
    result = await db.execute(
        select(Payment)
        .options(selectinload(Payment.user))
        .order_by(Payment.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    payments = result.scalars().all()
    total = (await db.execute(select(func.count()).select_from(Payment))).scalar_one()

    return {
        "success": True,
        "data": [
            {
                "id": str(p.id),
                "amount": p.amount,
                "currency": p.currency,
                "status": p.status.value,
                "stripe_payment_intent_id": p.stripe_payment_intent_id,
                "created_at": p.created_at.isoformat(),
                "user": {
                    "id": str(p.user.id),
                    "email": p.user.email,
                } if p.user else None,
            }
            for p in payments
        ],
        "total": total,
        "page": page,
        "limit": limit,
    }


# ══════════════════════════════════════════════════════════════════════════════
# FEATURE ACCESS MANAGEMENT
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/features", response_model=dict)
async def list_all_features() -> dict:
    """Return the full feature registry — used by admin UI to render toggles."""
    return {"success": True, "data": ALL_FEATURES}


@router.get("/users/{user_id}/features", response_model=dict)
async def get_user_features(user_id: uuid.UUID, db: DBSession) -> dict:
    """Return a user's current feature access.
    allowed_features=None means unrestricted (all features allowed).
    """
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "success": True,
        "data": {
            "user_id": str(user.id),
            "allowed_features": user.allowed_features,
            "is_unrestricted": user.allowed_features is None,
            "all_features": ALL_FEATURES,
        },
    }


@router.patch("/users/{user_id}/features", response_model=dict)
async def update_user_features(
    user_id: uuid.UUID,
    body: UpdateUserFeaturesRequest,
    db: DBSession,
    caller: CurrentUser,
) -> dict:
    """Set a user's allowed features.

    Body:
      { "allowed_features": ["wallet", "agent_builder"] }  — restrict to these features
      { "allowed_features": null }                          — remove all restrictions (full access)

    Admins are always unrestricted regardless of this setting.
    """
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    features = body.allowed_features
    if features is not None:
        features = list(set(features))  # deduplicate

    user.allowed_features = features
    await db.commit()

    from app.models.admin_log import AdminActionLog
    log = AdminActionLog(
        admin_user_id=caller.id,
        admin_email=caller.email,
        action="update_user_features",
        target_user_id=user.id,
        target_email=user.email,
        new_value=str(features),
    )
    db.add(log)
    await db.commit()

    return {
        "success": True,
        "data": {
            "user_id": str(user.id),
            "allowed_features": user.allowed_features,
            "is_unrestricted": user.allowed_features is None,
        },
    }
