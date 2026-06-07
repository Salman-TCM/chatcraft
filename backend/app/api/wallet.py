"""
Digital Wallet & Loyalty Programs API.

Routes (authenticated unless noted):
  GET    /api/wallet/program-types
  GET    /api/wallet/programs
  POST   /api/wallet/programs
  GET    /api/wallet/programs/{id}
  PATCH  /api/wallet/programs/{id}
  DELETE /api/wallet/programs/{id}
  POST   /api/wallet/programs/bulk-delete
  POST   /api/wallet/programs/{id}/rotate-join-token
  POST   /api/wallet/programs/{id}/rotate-scanner-token
  GET    /api/wallet/programs/{id}/cards
  POST   /api/wallet/programs/{id}/cards
  POST   /api/wallet/programs/{id}/push            ← broadcast
  DELETE /api/wallet/cards/{serial}
  POST   /api/wallet/cards/{serial}/action
  POST   /api/wallet/cards/{serial}/push
  GET    /api/wallet/cards/{serial}/events
  GET    /api/wallet/cards/{serial}/pkpass          ← public
  GET    /api/wallet/cards/{serial}/google          ← public
  GET    /api/wallet/cards/{serial}/public          ← public

Public (no auth):
  GET    /api/wallet/join/{token}
  POST   /api/wallet/join/{token}
  GET    /api/wallet/scan/{token}
  POST   /api/wallet/scan/{token}/action

Apple Wallet web-service (no auth, token-validated):
  POST   /api/wallet/v1/devices/{device_id}/registrations/{pass_type}/{serial}
  DELETE /api/wallet/v1/devices/{device_id}/registrations/{pass_type}/{serial}
  GET    /api/wallet/v1/devices/{device_id}/registrations/{pass_type}
  GET    /api/wallet/v1/passes/{pass_type}/{serial}

Receipt scanning (public, serial-authenticated):
  POST   /api/wallet/cards/{serial}/receipt-scan

Wallet settings (authenticated):
  GET    /api/settings/wallet
  PATCH  /api/settings/wallet/apple
  PATCH  /api/settings/wallet/google
"""
import hashlib
import json
import logging
import secrets
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Query, Request, Response, status
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError

from app.core.dependencies import CurrentUser, DBSession
from app.core.rate_limit import limiter
from app.models.wallet import (
    UserWalletCredentials, WalletCard, WalletCardEvent, WalletProgram,
    WalletPushSubscription, WalletReceiptScan,
)
from app.services.wallet.service import apply_action, default_push_message

router = APIRouter(tags=["wallet"])
logger = logging.getLogger(__name__)

_VALID_PROGRAM_STATUSES = frozenset({"active", "inactive", "archived"})

PROGRAM_TYPES = [
    {"value": "membership",      "label": "Membership Card",    "icon": "🪪",  "description": "Tiered membership with optional points"},
    {"value": "punch_card",      "label": "Punch Card",         "icon": "👊",  "description": "Buy X get 1 free loyalty program"},
    {"value": "points",          "label": "Points Reward",      "icon": "⭐",  "description": "Earn & redeem points on purchases"},
    {"value": "coupon",          "label": "Coupon / Offer",     "icon": "🎟️", "description": "One-time or recurring discount coupon"},
    {"value": "event_ticket",    "label": "Event Ticket",       "icon": "🎫",  "description": "Scannable event admission pass"},
    {"value": "prepaid_balance", "label": "Prepaid Balance",    "icon": "💳",  "description": "Stored value / gift card"},
    {"value": "business_card",   "label": "Business Card",      "icon": "📇",  "description": "Digital business card pass"},
]


# ── Helpers ────────────────────────────────────────────────────────────────────

def _render_message(msg: str, card: WalletCard, program: WalletProgram) -> str:
    """Substitute wallet template variables in a push message."""
    state = card.state or {}
    cfg = program.config or {}
    subs = {
        "{{wallet_punches}}":       str(state.get("punches", 0)),
        "{{wallet_max_punches}}":   str(cfg.get("max_punches", 10)),
        "{{wallet_points}}":        str(state.get("points", 0)),
        "{{wallet_balance}}":       str(state.get("balance", 0)),
        "{{wallet_points_label}}":  cfg.get("points_label", "Points"),
        "{{wallet_threshold}}":     str(cfg.get("points_threshold", 0)),
        "{{wallet_reward_name}}":   cfg.get("reward_description", "Reward"),
        "{{wallet_program_name}}":  program.name,
        "{{wallet_card_status}}":   card.status,
        "{{customerName}}":         card.customer_name or "Customer",
        "{{programName}}":          program.name,
        "{{punches}}":              str(state.get("punches", 0)),
    }
    for k, v in subs.items():
        msg = msg.replace(k, v)
    return msg


def _program_dict(p: WalletProgram, device_count: int = 0, frontend_base: str = "") -> dict:
    join_url = f"{frontend_base}/join/{p.join_token}" if p.join_token else None
    scanner_url = f"{frontend_base}/scan/{p.scanner_token}" if p.scanner_token else None
    return {
        "id": str(p.id),
        "name": p.name,
        "type": p.type,
        "description": p.description,
        "status": p.status,
        "config": p.config,
        "brand_overrides": p.brand_overrides,
        "google_class_id": p.google_class_id,
        "chatbot_id": str(p.chatbot_id) if p.chatbot_id else None,
        "join_token": p.join_token,
        "scanner_token": p.scanner_token,
        "join_url": join_url,
        "scanner_url": scanner_url,
        "join_form_fields": p.join_form_fields or ["name", "email"],
        "receipt_scanning_config": p.receipt_scanning_config or {},
        "device_count": device_count,
        "created_at": p.created_at.isoformat(),
        "updated_at": p.updated_at.isoformat(),
    }


def _card_dict(c: WalletCard) -> dict:
    return {
        "id": str(c.id),
        "serial": c.serial,
        "program_id": str(c.program_id),
        "contact_id": str(c.contact_id) if c.contact_id else None,
        "customer_name": c.customer_name,
        "customer_email": c.customer_email,
        "customer_phone": c.customer_phone,
        "status": c.status,
        "state": c.state,
        "google_pass_object_id": c.google_pass_object_id,
        "created_at": c.created_at.isoformat(),
    }


def _event_dict(e: WalletCardEvent) -> dict:
    return {
        "id": str(e.id),
        "action": e.action,
        "delta": e.delta,
        "message": e.message,
        "source": e.source,
        "receipt_scan_id": str(e.receipt_scan_id) if e.receipt_scan_id else None,
        "created_at": e.created_at.isoformat(),
    }


async def _get_program(program_id: uuid.UUID, user_id: uuid.UUID, db) -> WalletProgram:
    prog = await db.get(WalletProgram, program_id)
    if not prog or prog.user_id != user_id:
        raise HTTPException(status_code=404, detail="Program not found")
    return prog


async def _get_card_by_serial(serial: str, db, locked: bool = False) -> WalletCard:
    q = select(WalletCard).where(WalletCard.serial == serial)
    if locked:
        q = q.with_for_update()
    result = await db.execute(q)
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    return card


def _validate_action_value(action: str, value, state: dict) -> None:
    """Validate numeric value for a wallet action. Raises HTTPException on bad input."""
    numeric_actions = frozenset({
        "add_punch", "remove_punch", "set_punches",
        "add_points", "remove_points", "redeem_points_reward",
        "deduct_balance", "load_balance", "set_balance", "refund_balance",
    })
    if action not in numeric_actions or value is None:
        return

    try:
        if action in ("add_punch", "remove_punch", "set_punches",
                      "add_points", "remove_points", "redeem_points_reward"):
            v = int(value)
        else:
            v = float(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail=f"value must be a number for action '{action}'")

    if v < 0:
        raise HTTPException(status_code=422, detail=f"value must be non-negative for action '{action}'")

    if action == "deduct_balance":
        current = float(state.get("balance", 0.0))
        if v > current:
            raise HTTPException(
                status_code=422,
                detail=f"Insufficient balance: requested {v:.2f}, available {current:.2f}",
            )


def _initial_state(program_type: str, config: dict) -> dict:
    if program_type == "punch_card":
        return {"punches": 0, "redeemed": 0}
    elif program_type == "points":
        return {"points": 0, "tier": config.get("default_tier", "Standard"), "lifetime_points": 0}
    elif program_type == "membership":
        return {"tier": config.get("default_tier", "Standard"), "points": 0}
    elif program_type == "prepaid_balance":
        return {"balance": float(config.get("initial_balance", 0))}
    elif program_type == "event_ticket":
        return {"checked_in": False, "seat": config.get("default_seat", "General")}
    else:
        return {"redeemed": False}


async def _program_device_count(program_id: uuid.UUID, db) -> int:
    result = await db.execute(
        select(func.count(WalletPushSubscription.id))
        .join(WalletCard, WalletCard.id == WalletPushSubscription.card_id)
        .where(WalletCard.program_id == program_id)
    )
    return result.scalar_one() or 0


async def _push_card_devices(card: WalletCard, program: WalletProgram, message: str, db) -> int:
    subs_result = await db.execute(
        select(WalletPushSubscription).where(WalletPushSubscription.card_id == card.id)
    )
    sent = 0
    for sub in subs_result.scalars().all():
        if sub.device_type == "apple":
            from app.services.wallet.push import send_alert_apns
            await send_alert_apns(sub.push_token, message)
            sent += 1
        elif sub.device_type == "google" and card.google_pass_object_id:
            try:
                from app.services.wallet.google_wallet import push_update
                push_update(card.google_pass_object_id, program.type)
                sent += 1
            except Exception as exc:
                logger.warning("Google Wallet push_update failed for card %s: %s", card.serial, exc)
    return sent


async def _dispatch_wallet_trigger(
    trigger: str, card: WalletCard, program: WalletProgram,
    extra_context: dict, db,
) -> None:
    try:
        from app.services.automation import dispatch
        context = {
            "serial": card.serial,
            "contact_id": str(card.contact_id) if card.contact_id else None,
            "program_id": str(program.id),
            "program_name": program.name,
            "program_type": program.type,
            "customer_name": card.customer_name,
            "customer_email": card.customer_email,
            **extra_context,
        }
        await dispatch(trigger, program.user_id, db, context)
    except Exception as exc:
        logger.warning("Wallet automation dispatch failed (trigger=%s, card=%s): %s", trigger, card.serial, exc)


async def _find_or_create_contact(
    email: str | None, phone: str | None, name: str | None,
    user_id: uuid.UUID, db,
) -> uuid.UUID | None:
    if not email and not phone:
        return None
    from app.models.crm import Contact
    from sqlalchemy import or_
    filters = []
    if email:
        filters.append(Contact.email == email)
    if phone:
        filters.append(Contact.phone == phone)
    c_result = await db.execute(
        select(Contact).where(Contact.user_id == user_id, or_(*filters)).limit(1)
    )
    contact = c_result.scalar_one_or_none()
    if not contact:
        parts = (name or "").split(" ", 1)
        contact = Contact(
            user_id=user_id,
            email=email,
            phone=phone,
            first_name=parts[0] or None,
            last_name=parts[1] if len(parts) > 1 else None,
            source="wallet",
        )
        db.add(contact)
        await db.flush()
    return contact.id


def _get_frontend_base() -> str:
    from app.core.config import settings
    api_base = getattr(settings, "api_base_url", "") or ""
    # Convert API base to frontend base (strip /api suffix or use a separate setting)
    frontend_base = getattr(settings, "frontend_base_url", "") or api_base.replace("/api", "").rstrip("/")
    return frontend_base


# ── Program types ──────────────────────────────────────────────────────────────

@router.get("/api/wallet/program-types", response_model=dict)
async def list_program_types() -> dict:
    return {"success": True, "data": PROGRAM_TYPES}


# ── Programs CRUD ──────────────────────────────────────────────────────────────

@router.get("/api/wallet/programs", response_model=dict)
async def list_programs(
    user: CurrentUser, db: DBSession,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
    type_filter: str | None = Query(default=None, alias="type"),
) -> dict:
    offset = (page - 1) * limit
    q = select(WalletProgram).where(WalletProgram.user_id == user.id)
    if type_filter:
        q = q.where(WalletProgram.type == type_filter)
    q = q.order_by(WalletProgram.created_at.desc()).offset(offset).limit(limit)
    programs = (await db.execute(q)).scalars().all()
    total = (await db.execute(
        select(func.count()).select_from(WalletProgram).where(WalletProgram.user_id == user.id)
    )).scalar_one()
    fb = _get_frontend_base()
    return {
        "success": True,
        "data": [_program_dict(p, frontend_base=fb) for p in programs],
        "total": total,
    }


@router.post("/api/wallet/programs", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_program(body: dict, user: CurrentUser, db: DBSession) -> dict:
    name = (body.get("name") or "").strip()
    prog_type = (body.get("type") or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="name required")
    if prog_type not in {t["value"] for t in PROGRAM_TYPES}:
        raise HTTPException(status_code=422, detail=f"invalid type: {prog_type}")
    prog_status = body.get("status", "active")
    if prog_status not in _VALID_PROGRAM_STATUSES:
        raise HTTPException(status_code=422, detail=f"Invalid status. Must be one of: {', '.join(sorted(_VALID_PROGRAM_STATUSES))}")

    chatbot_id = body.get("chatbot_id")
    if chatbot_id:
        from app.models.chatbot_config import ChatbotConfig
        try:
            chatbot = await db.get(ChatbotConfig, uuid.UUID(str(chatbot_id)))
        except Exception:
            chatbot = None
        if not chatbot or chatbot.user_id != user.id:
            raise HTTPException(status_code=404, detail="Chatbot not found")

    join_token = secrets.token_hex(32)
    scanner_token = secrets.token_hex(32)

    program = WalletProgram(
        user_id=user.id,
        chatbot_id=chatbot_id,
        name=name,
        type=prog_type,
        description=body.get("description"),
        status=prog_status,
        config=body.get("config", {}),
        brand_overrides=body.get("brand_overrides", {}),
        join_token=join_token,
        scanner_token=scanner_token,
        join_form_fields=body.get("join_form_fields", ["name", "email"]),
        receipt_scanning_config=body.get("receipt_scanning_config", {}),
    )
    db.add(program)
    await db.commit()
    await db.refresh(program)

    try:
        from app.services.wallet.google_wallet import create_or_update_class
        gid = create_or_update_class(program)
        program.google_class_id = gid
        await db.commit()
    except Exception as exc:
        logger.warning("Google Wallet class creation failed for program %s: %s", program.id, exc)

    return {"success": True, "data": _program_dict(program, frontend_base=_get_frontend_base())}


@router.get("/api/wallet/programs/{program_id}", response_model=dict)
async def get_program(program_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    program = await _get_program(program_id, user.id, db)
    dc = await _program_device_count(program_id, db)
    return {"success": True, "data": _program_dict(program, dc, _get_frontend_base())}


@router.patch("/api/wallet/programs/{program_id}", response_model=dict)
async def update_program(program_id: uuid.UUID, body: dict, user: CurrentUser, db: DBSession) -> dict:
    program = await _get_program(program_id, user.id, db)
    if "status" in body and body["status"] not in _VALID_PROGRAM_STATUSES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid status. Must be one of: {', '.join(sorted(_VALID_PROGRAM_STATUSES))}",
        )
    for field in ("name", "description", "status", "config", "brand_overrides", "chatbot_id",
                  "join_form_fields", "receipt_scanning_config"):
        if field in body:
            setattr(program, field, body[field])
    await db.commit()
    await db.refresh(program)
    dc = await _program_device_count(program_id, db)
    return {"success": True, "data": _program_dict(program, dc, _get_frontend_base())}


@router.delete("/api/wallet/programs/{program_id}", response_model=dict)
async def delete_program(program_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    program = await _get_program(program_id, user.id, db)
    await db.delete(program)
    await db.commit()
    return {"success": True, "data": None}


@router.post("/api/wallet/programs/bulk-delete", response_model=dict)
async def bulk_delete_programs(body: dict, user: CurrentUser, db: DBSession) -> dict:
    ids: list[str] = body.get("ids", [])
    deleted = 0
    for id_str in ids:
        try:
            prog = await db.get(WalletProgram, uuid.UUID(id_str))
            if prog and prog.user_id == user.id:
                await db.delete(prog)
                deleted += 1
        except Exception as exc:
            logger.warning("Failed to delete program %s: %s", id_str, exc)
    await db.commit()
    return {"success": True, "data": {"deleted": deleted}}


# ── Join token rotation ────────────────────────────────────────────────────────

@router.post("/api/wallet/programs/{program_id}/rotate-join-token", response_model=dict)
async def rotate_join_token(program_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    program = await _get_program(program_id, user.id, db)
    program.join_token = secrets.token_hex(32)
    await db.commit()
    fb = _get_frontend_base()
    return {"success": True, "data": {"join_token": program.join_token, "join_url": f"{fb}/join/{program.join_token}"}}


@router.post("/api/wallet/programs/{program_id}/rotate-scanner-token", response_model=dict)
async def rotate_scanner_token(program_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    program = await _get_program(program_id, user.id, db)
    program.scanner_token = secrets.token_hex(32)
    await db.commit()
    fb = _get_frontend_base()
    return {"success": True, "data": {"scanner_token": program.scanner_token, "scanner_url": f"{fb}/scan/{program.scanner_token}"}}


# ── Public join endpoints ──────────────────────────────────────────────────────

@router.get("/api/wallet/join/{token}", response_model=dict)
@limiter.limit("60/minute")
async def get_join_program(request: Request, token: str, db: DBSession) -> dict:
    """Public: return program info for the self-enrollment join page."""
    result = await db.execute(
        select(WalletProgram).where(WalletProgram.join_token == token, WalletProgram.status == "active")
    )
    program = result.scalar_one_or_none()
    if not program:
        raise HTTPException(status_code=404, detail="Join link not found or program is inactive")
    return {
        "success": True,
        "data": {
            "program_id": str(program.id),
            "name": program.name,
            "type": program.type,
            "description": program.description,
            "config": program.config,
            "brand_overrides": program.brand_overrides,
            "join_form_fields": program.join_form_fields or ["name", "email"],
        },
    }


@router.post("/api/wallet/join/{token}", response_model=dict, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def self_enroll(request: Request, token: str, body: dict, db: DBSession) -> dict:
    """Public: customer self-enrolls. Returns card info with wallet add URLs."""
    result = await db.execute(
        select(WalletProgram).where(WalletProgram.join_token == token, WalletProgram.status == "active")
    )
    program = result.scalar_one_or_none()
    if not program:
        raise HTTPException(status_code=404, detail="Join link not found or program is inactive")

    email = (body.get("email") or "").strip().lower() or None
    name  = (body.get("name") or "").strip() or None
    phone = (body.get("phone") or "").strip() or None

    # Dedup by email first, then by phone
    if email:
        ex = (await db.execute(
            select(WalletCard).where(
                WalletCard.program_id == program.id, WalletCard.customer_email == email,
            )
        )).scalar_one_or_none()
        if ex:
            return {"success": True, "data": _card_dict(ex), "reissued": True}
    elif phone:
        ex = (await db.execute(
            select(WalletCard).where(
                WalletCard.program_id == program.id, WalletCard.customer_phone == phone,
            )
        )).scalar_one_or_none()
        if ex:
            return {"success": True, "data": _card_dict(ex), "reissued": True}

    contact_id = await _find_or_create_contact(email, phone, name, program.user_id, db)

    auth_token = secrets.token_hex(24)
    card = WalletCard(
        serial=secrets.token_urlsafe(12),
        program_id=program.id,
        contact_id=contact_id,
        customer_name=name,
        customer_email=email,
        customer_phone=phone,
        status="active",
        state=_initial_state(program.type, program.config),
        auth_token=auth_token,
    )
    db.add(card)
    await db.flush()

    try:
        from app.services.wallet.google_wallet import issue_pass
        card.google_pass_object_id = issue_pass(program, card)
    except Exception as exc:
        logger.warning("Google Wallet pass issuance failed for card serial=%s: %s", card.serial, exc)

    # Log self-enroll event
    event = WalletCardEvent(
        card_id=card.id,
        program_id=program.id,
        action="card_issued",
        delta={},
        source="self_enroll",
    )
    db.add(event)
    await db.commit()
    await db.refresh(card)

    # Dispatch wallet_card_issued automation
    await _dispatch_wallet_trigger("wallet_card_issued", card, program, {}, db)

    from app.core.config import settings
    google_url = ""
    if card.google_pass_object_id:
        try:
            from app.services.wallet.google_wallet import add_pass_save_link
            google_url = add_pass_save_link(card.google_pass_object_id)
        except Exception as exc:
            logger.warning("Google Wallet save link failed for card serial=%s: %s", card.serial, exc)

    return {
        "success": True,
        "data": {
            **_card_dict(card),
            "pkpass_url": f"/api/wallet/cards/{card.serial}/pkpass",
            "google_url": google_url,
        },
    }


# ── Public scanner endpoints ───────────────────────────────────────────────────

@router.get("/api/wallet/scan/{token}", response_model=dict)
@limiter.limit("60/minute")
async def get_scanner_program(request: Request, token: str, db: DBSession) -> dict:
    """Public: return program info for the staff scanner page."""
    result = await db.execute(
        select(WalletProgram).where(WalletProgram.scanner_token == token)
    )
    program = result.scalar_one_or_none()
    if not program:
        raise HTTPException(status_code=404, detail="Scanner link not found")
    quick_actions = {
        "punch_card": ["add_punch", "redeem"],
        "points": ["add_points", "redeem_points_reward"],
        "event_ticket": ["check_in"],
        "coupon": ["redeem_coupon"],
        "prepaid_balance": ["deduct_balance"],
        "membership": ["set_tier"],
        "business_card": [],
    }.get(program.type, [])
    return {
        "success": True,
        "data": {
            "program_id": str(program.id),
            "name": program.name,
            "type": program.type,
            "config": program.config,
            "brand_overrides": program.brand_overrides,
            "quick_actions": quick_actions,
        },
    }


@router.post("/api/wallet/scan/{token}/action", response_model=dict)
@limiter.limit("30/minute")
async def scanner_action(request: Request, token: str, body: dict, db: DBSession) -> dict:
    """Public staff scanner: apply a quick action to a card by serial."""
    result = await db.execute(
        select(WalletProgram).where(WalletProgram.scanner_token == token)
    )
    program = result.scalar_one_or_none()
    if not program:
        raise HTTPException(status_code=404, detail="Scanner link not found")

    serial = (body.get("serial") or "").strip()
    action = (body.get("action") or "").strip()
    value = body.get("value")

    if not serial or not action:
        raise HTTPException(status_code=422, detail="serial and action required")
    if action not in _SCANNER_ACTIONS:
        raise HTTPException(status_code=422, detail=f"Action not permitted via scanner: {action}")

    card_result = await db.execute(
        select(WalletCard)
        .where(WalletCard.serial == serial, WalletCard.program_id == program.id)
        .with_for_update()
    )
    card = card_result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found in this program")
    if card.status != "active":
        raise HTTPException(status_code=409, detail="Card is not active")

    old_state = dict(card.state or {})
    _validate_action_value(action, value, old_state)

    cfg = program.config or {}
    try:
        new_state = apply_action(action, value, old_state, cfg)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    card.state = new_state

    delta = {k: new_state[k] for k in new_state if new_state.get(k) != old_state.get(k)}
    event = WalletCardEvent(
        card_id=card.id,
        program_id=program.id,
        action=action,
        delta=delta,
        source="scanner",
    )
    db.add(event)
    await db.commit()
    await db.refresh(card)

    msg = default_push_message(action, new_state, program.name, cfg)
    await _push_card_devices(card, program, msg, db)

    if card.google_pass_object_id:
        try:
            from app.services.wallet.google_wallet import push_update
            push_update(card.google_pass_object_id, program.type)
        except Exception as exc:
            logger.warning("Google Wallet push_update failed for card %s: %s", card.serial, exc)

    await _dispatch_wallet_trigger(
        "wallet_punch_added" if action == "add_punch" else
        "wallet_points_added" if action in ("add_points", "remove_points") else
        "wallet_reward_redeemed" if action in ("redeem", "redeem_coupon", "redeem_points_reward") else
        "wallet_coupon_claimed" if program.type == "coupon" else
        "wallet_punch_added",
        card, program, {"action": action}, db,
    )

    return {"success": True, "data": _card_dict(card), "message": msg}


# ── Cards ──────────────────────────────────────────────────────────────────────

@router.get("/api/wallet/programs/{program_id}/cards", response_model=dict)
async def list_cards(
    program_id: uuid.UUID, user: CurrentUser, db: DBSession,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    status_filter: str | None = Query(default=None, alias="status"),
) -> dict:
    await _get_program(program_id, user.id, db)
    offset = (page - 1) * limit
    q = select(WalletCard).where(WalletCard.program_id == program_id)
    if status_filter:
        q = q.where(WalletCard.status == status_filter)
    q = q.order_by(WalletCard.created_at.desc()).offset(offset).limit(limit)
    cards = (await db.execute(q)).scalars().all()
    total = (await db.execute(
        select(func.count()).select_from(WalletCard).where(WalletCard.program_id == program_id)
    )).scalar_one()
    return {"success": True, "data": [_card_dict(c) for c in cards], "total": total}


@router.post("/api/wallet/programs/{program_id}/cards", response_model=dict, status_code=status.HTTP_201_CREATED)
async def issue_card(program_id: uuid.UUID, body: dict, user: CurrentUser, db: DBSession) -> dict:
    program = await _get_program(program_id, user.id, db)

    email = (body.get("customer_email") or "").strip().lower() or None
    name  = (body.get("customer_name") or "").strip() or None
    phone = (body.get("customer_phone") or "").strip() or None

    if email:
        existing = (await db.execute(
            select(WalletCard).where(
                WalletCard.program_id == program_id, WalletCard.customer_email == email,
            )
        )).scalar_one_or_none()
        if existing:
            return {"success": True, "data": _card_dict(existing), "reissued": True}

    contact_id = await _find_or_create_contact(email, phone, name, user.id, db)

    auth_token = secrets.token_hex(24)
    card = WalletCard(
        serial=secrets.token_urlsafe(12),
        program_id=program_id,
        contact_id=contact_id,
        customer_name=name,
        customer_email=email,
        customer_phone=phone,
        status="active",
        state=_initial_state(program.type, program.config),
        auth_token=auth_token,
    )
    db.add(card)
    await db.flush()

    try:
        from app.services.wallet.google_wallet import issue_pass
        card.google_pass_object_id = issue_pass(program, card)
    except Exception as exc:
        logger.warning("Google Wallet pass issuance failed for card serial=%s: %s", card.serial, exc)

    event = WalletCardEvent(
        card_id=card.id,
        program_id=program_id,
        action="card_issued",
        delta={},
        source="dashboard",
    )
    db.add(event)
    await db.commit()
    await db.refresh(card)

    await _dispatch_wallet_trigger("wallet_card_issued", card, program, {}, db)

    return {"success": True, "data": _card_dict(card)}


@router.delete("/api/wallet/cards/{serial}", response_model=dict)
async def revoke_card(serial: str, user: CurrentUser, db: DBSession) -> dict:
    card = await _get_card_by_serial(serial, db)
    program = await db.get(WalletProgram, card.program_id)
    if not program or program.user_id != user.id:
        raise HTTPException(status_code=404, detail="Card not found")
    card.status = "revoked"
    await db.commit()
    return {"success": True, "data": None}


# ── Card actions ───────────────────────────────────────────────────────────────

_VALID_ACTIONS = frozenset({
    "add_punch", "remove_punch", "redeem", "set_punches",
    "set_tier", "add_points", "remove_points", "redeem_points_reward",
    "set_balance", "check_in", "un_check_in",
    "deduct_balance", "load_balance", "refund_balance", "redeem_coupon",
})

# Subset of actions allowed via the public scanner URL (staff-facing quick actions only)
_SCANNER_ACTIONS = frozenset({
    "add_punch", "redeem", "add_points", "redeem_points_reward",
    "check_in", "deduct_balance", "redeem_coupon",
})


@router.post("/api/wallet/cards/{serial}/action", response_model=dict)
async def card_action(serial: str, body: dict, user: CurrentUser, db: DBSession) -> dict:
    card = await _get_card_by_serial(serial, db, locked=True)
    program = await db.get(WalletProgram, card.program_id)
    if not program or program.user_id != user.id:
        raise HTTPException(status_code=404, detail="Card not found")

    action = (body.get("action") or "").strip()
    if action not in _VALID_ACTIONS:
        raise HTTPException(status_code=422, detail=f"Unknown action: {action}")

    value = body.get("value")
    silent = bool(body.get("silent", False))
    custom_message = (body.get("message") or "").strip() or None

    old_state = dict(card.state or {})
    _validate_action_value(action, value, old_state)

    cfg = program.config or {}
    try:
        new_state = apply_action(action, value, old_state, cfg)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    card.state = new_state

    delta = {k: new_state[k] for k in new_state if new_state.get(k) != old_state.get(k)}

    event = WalletCardEvent(
        card_id=card.id,
        program_id=card.program_id,
        action=action,
        delta=delta,
        message=custom_message,
        source="dashboard",
    )
    db.add(event)
    await db.commit()
    await db.refresh(card)

    # Push update
    if not silent:
        raw_msg = custom_message or default_push_message(action, new_state, program.name, cfg)
        push_msg = _render_message(raw_msg, card, program)
        await _push_card_devices(card, program, push_msg, db)

    # Google Wallet update
    if card.google_pass_object_id:
        try:
            from app.services.wallet.google_wallet import push_update
            push_update(card.google_pass_object_id, program.type)
        except Exception as exc:
            logger.warning("Google Wallet push_update failed for card %s: %s", card.serial, exc)

    # Automation triggers
    trigger = None
    extra: dict = {}
    if action == "add_punch":
        extra = {"punches": new_state.get("punches", 0)}
        if old_state.get("punches", 0) > 0 and new_state.get("punches", 0) == 0:
            trigger = "wallet_reward_unlocked"
        else:
            trigger = "wallet_punch_added"
    elif action == "remove_punch":
        trigger = "wallet_punch_added"
        extra = {"punches": new_state.get("punches", 0)}
    elif action in ("add_points", "remove_points"):
        trigger = "wallet_points_added"
        extra = {"points": new_state.get("points", 0)}
    elif action == "redeem_points_reward":
        trigger = "wallet_reward_redeemed"
        extra = {"points": new_state.get("points", 0)}
    elif action in ("redeem", "redeem_coupon"):
        trigger = "wallet_coupon_claimed" if program.type == "coupon" else "wallet_reward_redeemed"

    if trigger:
        await _dispatch_wallet_trigger(trigger, card, program, extra, db)

    return {"success": True, "data": _card_dict(card)}


# ── Card events ────────────────────────────────────────────────────────────────

@router.get("/api/wallet/cards/{serial}/events", response_model=dict)
async def list_card_events(
    serial: str, user: CurrentUser, db: DBSession,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> dict:
    card = await _get_card_by_serial(serial, db)
    program = await db.get(WalletProgram, card.program_id)
    if not program or program.user_id != user.id:
        raise HTTPException(status_code=404, detail="Card not found")
    offset = (page - 1) * limit
    q = (
        select(WalletCardEvent)
        .where(WalletCardEvent.card_id == card.id)
        .order_by(WalletCardEvent.created_at.desc())
        .offset(offset).limit(limit)
    )
    events = (await db.execute(q)).scalars().all()
    return {"success": True, "data": [_event_dict(e) for e in events]}


# ── Receipt scanning ───────────────────────────────────────────────────────────

@router.post("/api/wallet/cards/{serial}/receipt-scan", response_model=dict)
@limiter.limit("10/minute")
async def receipt_scan(request: Request, serial: str, body: dict, db: DBSession) -> dict:
    """
    Public endpoint (authenticated by serial being in the customer's pass).
    Accepts base64-encoded receipt image and awards points/punches via AI extraction.
    """
    card = await _get_card_by_serial(serial, db, locked=True)
    if card.status != "active":
        raise HTTPException(status_code=409, detail="Card is not active")

    program = await db.get(WalletProgram, card.program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")

    rs_cfg = program.receipt_scanning_config or {}
    if not rs_cfg.get("enabled"):
        raise HTTPException(status_code=422, detail="Receipt scanning is not enabled for this program")

    # Clamp config values to safe ranges — guards against bad stored config
    try:
        rs_cfg = {
            **rs_cfg,
            "max_scans_per_day": max(1, int(rs_cfg.get("max_scans_per_day", 5))),
            "min_amount": max(0.0, float(rs_cfg.get("min_amount", 0))),
            "points_per_dollar": max(0.0, float(rs_cfg.get("points_per_dollar", 1))),
            "punches_per_receipt": max(1, int(rs_cfg.get("punches_per_receipt", 1))),
            "max_award_per_scan": max(1.0, float(rs_cfg.get("max_award_per_scan", 999999))),
        }
    except (TypeError, ValueError):
        raise HTTPException(status_code=500, detail="Invalid receipt scanning configuration")

    if program.type not in ("points", "punch_card"):
        raise HTTPException(status_code=422, detail="Receipt scanning only available for points and punch card programs")

    image_b64 = (body.get("image") or "").strip()
    if not image_b64:
        raise HTTPException(status_code=422, detail="image required (base64)")

    # Strip data URI prefix if present
    if "," in image_b64:
        image_b64 = image_b64.split(",", 1)[1]

    _MAX_IMAGE_B64 = 7_000_000  # ~5 MB original image
    if len(image_b64) > _MAX_IMAGE_B64:
        raise HTTPException(status_code=413, detail="Image too large (max ~5 MB)")

    # ── Check per-customer daily cap ───────────────────────────────────────────
    max_daily = max(1, int(rs_cfg.get("max_scans_per_day", 5)))
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    daily_count_result = await db.execute(
        select(func.count(WalletReceiptScan.id)).where(
            WalletReceiptScan.card_id == card.id,
            WalletReceiptScan.program_id == program.id,
            WalletReceiptScan.created_at >= today_start,
        )
    )
    daily_count = daily_count_result.scalar_one() or 0
    if daily_count >= max_daily:
        raise HTTPException(status_code=429, detail=f"Daily scan limit reached ({max_daily} per day)")

    # ── AI extraction ──────────────────────────────────────────────────────────
    ai_result: dict = {}
    try:
        from app.models.user_api_key import UserApiKey
        from app.services.llm.key_store import decrypt_key
        key_row = (await db.execute(
            select(UserApiKey).where(
                UserApiKey.user_id == program.user_id,
                UserApiKey.provider == "google",
            )
        )).scalar_one_or_none()

        if key_row:
            from google import genai as _genai
            from google.genai import types as _gtypes
            import base64

            client = _genai.Client(api_key=decrypt_key(key_row.encrypted_key))

            custom_prompt = rs_cfg.get("custom_prompt", "")
            merchant_kw = rs_cfg.get("merchant_keywords", [])
            merchant_hint = f" Merchant must match one of: {', '.join(merchant_kw)}." if merchant_kw else ""

            prompt = (
                f"Extract the following from this receipt image as JSON with keys: "
                f"merchant_name, date (YYYY-MM-DD), total_amount (number), transaction_id (string or null). "
                f"{merchant_hint} {custom_prompt} "
                f"Return ONLY valid JSON, nothing else."
            )

            img_bytes = base64.b64decode(image_b64)
            response = await client.aio.models.generate_content(
                model="gemini-1.5-flash",
                contents=[
                    _gtypes.Part.from_text(prompt),
                    _gtypes.Part.from_bytes(data=img_bytes, mime_type="image/jpeg"),
                ],
            )
            raw = response.text.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
            ai_result = json.loads(raw)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not extract receipt data: {exc}")

    from datetime import date as _date

    merchant_name  = str(ai_result.get("merchant_name") or "").strip()
    receipt_date   = str(ai_result.get("date") or "").strip()
    total_amount   = float(ai_result.get("total_amount") or 0)
    transaction_id = str(ai_result.get("transaction_id") or "").strip()

    # Validate receipt date: must be a real date and not in the future
    if receipt_date:
        try:
            parsed_date = _date.fromisoformat(receipt_date)
            if parsed_date > _date.today():
                raise HTTPException(status_code=422, detail="Receipt date cannot be in the future")
        except ValueError:
            receipt_date = ""  # AI returned garbage — clear it to avoid dedup bypass

    # ── Validate against program rules ─────────────────────────────────────────
    min_amount = float(rs_cfg.get("min_amount", 0))
    if total_amount < min_amount:
        raise HTTPException(
            status_code=422,
            detail=f"Receipt total ${total_amount:.2f} is below minimum ${min_amount:.2f}",
        )

    merchant_keywords = rs_cfg.get("merchant_keywords", [])
    if merchant_keywords and merchant_name:
        matched = any(kw.lower() in merchant_name.lower() for kw in merchant_keywords)
        if not matched:
            raise HTTPException(
                status_code=422,
                detail=f"Receipt merchant '{merchant_name}' does not match program's accepted merchants",
            )

    # ── Dedup hash ─────────────────────────────────────────────────────────────
    hash_source = f"{program.id}:{merchant_name}:{receipt_date}:{total_amount:.2f}:{transaction_id}"
    receipt_hash = hashlib.sha256(hash_source.encode()).hexdigest()

    # ── Award ──────────────────────────────────────────────────────────────────
    max_award = float(rs_cfg.get("max_award_per_scan", 999999))
    cfg = program.config or {}
    old_state = dict(card.state or {})

    if program.type == "points":
        ppm = float(rs_cfg.get("points_per_dollar", 1))
        awarded = min(total_amount * ppm, max_award)
        new_state = apply_action("add_points", int(awarded), old_state, cfg)
        awarded_type = "points"
    else:
        ppr = int(rs_cfg.get("punches_per_receipt", 1))
        new_state = apply_action("add_punch", ppr, old_state, cfg)
        awarded = float(ppr)
        awarded_type = "punches"

    card.state = new_state
    delta = {k: new_state[k] for k in new_state if new_state.get(k) != old_state.get(k)}

    scan_record = WalletReceiptScan(
        card_id=card.id,
        program_id=program.id,
        receipt_hash=receipt_hash,
        receipt_amount=total_amount,
        merchant_name=merchant_name,
        receipt_date=receipt_date,
        awarded_value=awarded,
        awarded_type=awarded_type,
        image_data=image_b64,
        ai_response=ai_result,
    )
    db.add(scan_record)
    try:
        await db.flush()  # enforces unique constraint on (program_id, receipt_hash)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Already redeemed — this receipt has already been used.")

    event = WalletCardEvent(
        card_id=card.id,
        program_id=program.id,
        action=f"receipt_scan_{awarded_type}",
        delta=delta,
        message=f"+{awarded:.0f} {awarded_type} from receipt (${total_amount:.2f} at {merchant_name})",
        source="receipt_scan",
        receipt_scan_id=scan_record.id,
    )
    db.add(event)
    await db.commit()
    await db.refresh(card)

    push_msg = (
        f"+{awarded:.0f} {awarded_type} from receipt scan! Balance: "
        f"{new_state.get('points', new_state.get('punches', 0))} {awarded_type}."
    )
    await _push_card_devices(card, program, push_msg, db)

    if card.google_pass_object_id:
        try:
            from app.services.wallet.google_wallet import push_update
            push_update(card.google_pass_object_id, program.type)
        except Exception as exc:
            logger.warning("Google Wallet push_update failed for card %s: %s", card.serial, exc)

    return {
        "success": True,
        "data": {
            "awarded": awarded,
            "awarded_type": awarded_type,
            "merchant_name": merchant_name,
            "total_amount": total_amount,
            "receipt_date": receipt_date,
            "card": _card_dict(card),
        },
    }


@router.get("/api/wallet/receipt-scans/{scan_id}/image", response_model=dict)
async def get_receipt_image(scan_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    """Return the stored receipt image for audit."""
    scan = await db.get(WalletReceiptScan, scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    program = await db.get(WalletProgram, scan.program_id)
    if not program or program.user_id != user.id:
        raise HTTPException(status_code=404, detail="Scan not found")
    return {"success": True, "data": {"image_data": scan.image_data, "ai_response": scan.ai_response}}


# ── Push notifications ─────────────────────────────────────────────────────────

@router.post("/api/wallet/cards/{serial}/push", response_model=dict)
async def push_to_card(serial: str, body: dict, user: CurrentUser, db: DBSession) -> dict:
    card = await _get_card_by_serial(serial, db)
    program = await db.get(WalletProgram, card.program_id)
    if not program or program.user_id != user.id:
        raise HTTPException(status_code=404, detail="Card not found")

    message = _render_message(
        (body.get("message") or "Your pass has been updated.").strip(),
        card, program,
    )
    sent = await _push_card_devices(card, program, message, db)
    return {"success": True, "data": {"sent": sent}}


@router.post("/api/wallet/programs/{program_id}/push", response_model=dict)
async def broadcast_push(program_id: uuid.UUID, body: dict, user: CurrentUser, db: DBSession) -> dict:
    program = await _get_program(program_id, user.id, db)
    raw_message = (body.get("message") or "Your pass has been updated.").strip()

    cards_result = await db.execute(
        select(WalletCard).where(
            WalletCard.program_id == program_id, WalletCard.status == "active",
        )
    )
    cards = cards_result.scalars().all()
    sent = 0
    for card in cards:
        message = _render_message(raw_message, card, program)
        sent += await _push_card_devices(card, program, message, db)

    return {"success": True, "data": {"sent": sent, "total_cards": len(cards)}}


# ── Apple Wallet web-service ───────────────────────────────────────────────────
# Apple calls these endpoints when a pass is added, removed, or needs updating.

@router.post("/api/wallet/v1/devices/{device_id}/registrations/{pass_type}/{serial}", status_code=status.HTTP_201_CREATED)
async def apple_register_device(
    device_id: str, pass_type: str, serial: str,
    request: Request,
    db: DBSession,
    authorization: str | None = Header(default=None),
) -> Response:
    """Apple Wallet device registration (called when a pass is added to Wallet)."""
    result = await db.execute(select(WalletCard).where(WalletCard.serial == serial))
    card = result.scalar_one_or_none()
    if not card:
        return Response(status_code=404)

    # Verify auth token
    auth = (authorization or "").removeprefix("ApplePass").strip()
    if card.auth_token and auth != card.auth_token:
        return Response(status_code=401)

    # Apple sends the APNs push token in the request body JSON: {"pushToken": "..."}
    try:
        body_data = await request.json()
        push_token_value = str(body_data.get("pushToken") or "").strip()
    except Exception:
        push_token_value = ""

    if not push_token_value:
        return Response(status_code=400)

    existing = (await db.execute(
        select(WalletPushSubscription).where(
            WalletPushSubscription.card_id == card.id,
            WalletPushSubscription.device_library_id == device_id,
        )
    )).scalar_one_or_none()

    if not existing:
        sub = WalletPushSubscription(
            card_id=card.id,
            device_type="apple",
            push_token=push_token_value,
            device_library_id=device_id,
        )
        db.add(sub)
        await db.commit()
        return Response(status_code=201)

    # Update push token if it changed (Apple rotates tokens)
    if existing.push_token != push_token_value:
        existing.push_token = push_token_value
        await db.commit()

    return Response(status_code=200)


@router.delete("/api/wallet/v1/devices/{device_id}/registrations/{pass_type}/{serial}")
async def apple_unregister_device(
    device_id: str, pass_type: str, serial: str,
    db: DBSession,
    authorization: str | None = Header(default=None),
) -> Response:
    """Apple Wallet device un-registration."""
    result = await db.execute(select(WalletCard).where(WalletCard.serial == serial))
    card = result.scalar_one_or_none()
    if not card:
        return Response(status_code=404)

    auth = (authorization or "").removeprefix("ApplePass").strip()
    if card.auth_token and auth != card.auth_token:
        return Response(status_code=401)

    sub_result = await db.execute(
        select(WalletPushSubscription).where(
            WalletPushSubscription.card_id == card.id,
            WalletPushSubscription.device_library_id == device_id,
        )
    )
    sub = sub_result.scalar_one_or_none()
    if sub:
        await db.delete(sub)
        await db.commit()

    return Response(status_code=200)


@router.get("/api/wallet/v1/devices/{device_id}/registrations/{pass_type}", response_model=None)
async def apple_get_updated_serials(
    device_id: str, pass_type: str,
    db: DBSession,
    passesUpdatedSince: str | None = Query(default=None),
):
    """Return serials of passes that have been updated since a given time."""
    subs = (await db.execute(
        select(WalletPushSubscription).where(
            WalletPushSubscription.device_library_id == device_id,
            WalletPushSubscription.device_type == "apple",
        )
    )).scalars().all()

    serials = []
    for sub in subs:
        card = await db.get(WalletCard, sub.card_id)
        if card and card.status == "active":
            serials.append(card.serial)

    if not serials:
        return Response(status_code=204)  # type: ignore

    return {"lastUpdated": str(int(datetime.now(timezone.utc).timestamp())), "serialNumbers": serials}


@router.get("/api/wallet/v1/passes/{pass_type}/{serial}")
async def apple_get_updated_pass(
    pass_type: str, serial: str,
    db: DBSession,
    authorization: str | None = Header(default=None),
) -> Response:
    """Return an updated .pkpass for Apple Wallet to download."""
    result = await db.execute(select(WalletCard).where(WalletCard.serial == serial))
    card = result.scalar_one_or_none()
    if not card:
        return Response(status_code=404)

    auth = (authorization or "").removeprefix("ApplePass").strip()
    if card.auth_token and auth != card.auth_token:
        return Response(status_code=401)

    if card.status != "active":
        return Response(status_code=410)

    program = await db.get(WalletProgram, card.program_id)
    if not program:
        return Response(status_code=404)

    from app.services.wallet.pkpass import build_pkpass
    from app.core.config import settings
    pass_url = f"{settings.api_base_url}/api/wallet"
    try:
        data = build_pkpass(program, card, pass_url)
    except RuntimeError:
        return Response(status_code=500)

    return Response(
        content=data,
        media_type="application/vnd.apple.pkpass",
        headers={"Last-Modified": datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S GMT")},
    )


@router.post("/api/wallet/v1/log")
async def apple_log(body: dict) -> dict:
    """Apple Wallet error log endpoint (required by web service spec)."""
    return {}


# ── Public pass download ───────────────────────────────────────────────────────

@router.get("/api/wallet/cards/{serial}/pkpass")
@limiter.limit("20/minute")
async def download_pkpass(request: Request, serial: str, db: DBSession) -> Response:
    card = await _get_card_by_serial(serial, db)
    if card.status != "active":
        raise HTTPException(status_code=410, detail="Card is no longer active")
    program = await db.get(WalletProgram, card.program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")

    # Ensure card has auth_token
    if not card.auth_token:
        card.auth_token = secrets.token_hex(24)
        await db.commit()

    from app.services.wallet.pkpass import build_pkpass
    from app.core.config import settings

    pass_url = f"{settings.api_base_url}/api/wallet"
    try:
        data = build_pkpass(program, card, pass_url)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    return Response(
        content=data,
        media_type="application/vnd.apple.pkpass",
        headers={"Content-Disposition": f'attachment; filename="{card.serial}.pkpass"'},
    )


@router.get("/api/wallet/cards/{serial}/google", response_model=dict)
@limiter.limit("20/minute")
async def google_wallet_link(request: Request, serial: str, db: DBSession) -> dict:
    card = await _get_card_by_serial(serial, db)
    if card.status != "active":
        raise HTTPException(status_code=410, detail="Card is no longer active")
    if not card.google_pass_object_id:
        raise HTTPException(status_code=503, detail="Google Wallet pass not available for this card")
    try:
        from app.services.wallet.google_wallet import add_pass_save_link
        link = add_pass_save_link(card.google_pass_object_id)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    return {"success": True, "data": {"link": link}}


@router.get("/api/wallet/cards/{serial}/public", response_model=dict)
@limiter.limit("30/minute")
async def public_card_info(request: Request, serial: str, db: DBSession) -> dict:
    card = await _get_card_by_serial(serial, db)
    if card.status == "revoked":
        raise HTTPException(status_code=410, detail="Card has been revoked")
    program = await db.get(WalletProgram, card.program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")

    google_url = ""
    if card.google_pass_object_id:
        try:
            from app.services.wallet.google_wallet import add_pass_save_link
            google_url = add_pass_save_link(card.google_pass_object_id)
        except Exception as exc:
            logger.warning("Google Wallet save link failed for card serial=%s: %s", serial, exc)

    rs_cfg = program.receipt_scanning_config or {}
    receipt_scan_enabled = bool(rs_cfg.get("enabled")) and program.type in ("points", "punch_card")

    return {
        "success": True,
        "data": {
            "serial": card.serial,
            "customer_name": card.customer_name,
            "customer_email": card.customer_email,
            "status": card.status,
            "state": card.state,
            "program": {
                "name": program.name,
                "type": program.type,
                "description": program.description,
                "config": program.config,
                "brand_overrides": program.brand_overrides,
            },
            "pkpass_url": f"/api/wallet/cards/{card.serial}/pkpass",
            "google_url": google_url,
            "receipt_scan_enabled": receipt_scan_enabled,
        },
    }


# ── Wallet credential settings ─────────────────────────────────────────────────

@router.get("/api/settings/wallet", response_model=dict)
async def get_wallet_settings(user: CurrentUser, db: DBSession) -> dict:
    creds = await db.get(UserWalletCredentials, user.id)
    apple = creds.apple_config or {} if creds else {}
    google = creds.google_config or {} if creds else {}
    return {
        "success": True,
        "data": {
            "apple": {
                "pass_type_identifier": apple.get("pass_type_id", ""),
                "team_identifier": apple.get("team_id", ""),
                "has_cert": bool(apple.get("cert_pem")),
                "has_key": bool(apple.get("key_pem")),
                "has_wwdr": bool(apple.get("wwdr_pem")),
                "push_key_id": apple.get("push_key_id", ""),
                "has_push_key": bool(apple.get("push_key_pem")),
            },
            "google": {
                "issuer_id": google.get("issuer_id", ""),
                "has_service_account": bool(google.get("service_account")),
            },
        },
    }


# Fields in apple_config that contain sensitive key material — stored encrypted.
_APPLE_ENCRYPTED_FIELDS = frozenset({"cert_pem", "key_pem", "wwdr_pem", "push_key_pem"})


def _encrypt_apple_field(value: str) -> str:
    from app.services.llm.key_store import encrypt_key
    return encrypt_key(value)


def _decrypt_apple_field(value: str) -> str:
    """Decrypt a field, falling back to plaintext for backwards compatibility."""
    from app.services.llm.key_store import decrypt_key
    from cryptography.fernet import InvalidToken
    try:
        return decrypt_key(value)
    except (InvalidToken, Exception):
        return value  # already plaintext (pre-encryption migration)


@router.patch("/api/settings/wallet/apple", response_model=dict)
async def save_apple_credentials(body: dict, user: CurrentUser, db: DBSession) -> dict:
    creds = await db.get(UserWalletCredentials, user.id)
    if not creds:
        creds = UserWalletCredentials(user_id=user.id, apple_config={}, google_config={})
        db.add(creds)

    current = dict(creds.apple_config or {})
    mapping = {
        "pass_type_identifier": "pass_type_id",
        "team_identifier": "team_id",
        "pass_cert_pem": "cert_pem",
        "pass_key_pem": "key_pem",
        "wwdr_pem": "wwdr_pem",
        "push_key_id": "push_key_id",
        "push_key_pem": "push_key_pem",
    }
    for body_key, cfg_key in mapping.items():
        if body_key in body and body[body_key]:
            val = body[body_key]
            if cfg_key in _APPLE_ENCRYPTED_FIELDS:
                val = _encrypt_apple_field(val)
            current[cfg_key] = val

    creds.apple_config = current
    await db.commit()
    return {"success": True, "data": {"saved": True}}


@router.patch("/api/settings/wallet/google", response_model=dict)
async def save_google_credentials(body: dict, user: CurrentUser, db: DBSession) -> dict:
    creds = await db.get(UserWalletCredentials, user.id)
    if not creds:
        creds = UserWalletCredentials(user_id=user.id, apple_config={}, google_config={})
        db.add(creds)

    current = dict(creds.google_config or {})
    if body.get("issuer_id"):
        current["issuer_id"] = body["issuer_id"]
    if body.get("service_account"):
        current["service_account"] = body["service_account"]

    creds.google_config = current
    await db.commit()
    return {"success": True, "data": {"saved": True}}
