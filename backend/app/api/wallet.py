"""
Digital Wallet & Loyalty Programs API.

Routes:
  GET    /api/wallet/program-types
  GET    /api/wallet/programs
  POST   /api/wallet/programs
  GET    /api/wallet/programs/{id}
  PATCH  /api/wallet/programs/{id}
  DELETE /api/wallet/programs/{id}
  POST   /api/wallet/programs/bulk-delete
  GET    /api/wallet/programs/{id}/cards
  POST   /api/wallet/programs/{id}/cards
  DELETE /api/wallet/cards/{serial}
  POST   /api/wallet/cards/{serial}/action
  POST   /api/wallet/cards/{serial}/push
  POST   /api/wallet/programs/{id}/push
  GET    /api/wallet/cards/{serial}/pkpass   ← download .pkpass (no auth)
  GET    /api/wallet/cards/{serial}/google   ← Google Wallet add link (no auth)
"""
import secrets
import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy import func

from app.core.dependencies import CurrentUser, DBSession
from app.models.wallet import WalletCard, WalletProgram, WalletPushSubscription

router = APIRouter(tags=["wallet"])

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

def _program_dict(p: WalletProgram) -> dict:
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


async def _get_program(program_id: uuid.UUID, user_id: uuid.UUID, db) -> WalletProgram:
    prog = await db.get(WalletProgram, program_id)
    if not prog or prog.user_id != user_id:
        raise HTTPException(status_code=404, detail="Program not found")
    return prog


async def _get_card_by_serial(serial: str, db) -> WalletCard:
    result = await db.execute(select(WalletCard).where(WalletCard.serial == serial))
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    return card


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
    return {"success": True, "data": [_program_dict(p) for p in programs], "total": total}


@router.post("/api/wallet/programs", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_program(body: dict, user: CurrentUser, db: DBSession) -> dict:
    name = (body.get("name") or "").strip()
    prog_type = (body.get("type") or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="name required")
    if prog_type not in {t["value"] for t in PROGRAM_TYPES}:
        raise HTTPException(status_code=422, detail=f"invalid type: {prog_type}")

    program = WalletProgram(
        user_id=user.id,
        chatbot_id=body.get("chatbot_id"),
        name=name,
        type=prog_type,
        description=body.get("description"),
        status=body.get("status", "active"),
        config=body.get("config", {}),
        brand_overrides=body.get("brand_overrides", {}),
    )
    db.add(program)
    await db.commit()
    await db.refresh(program)

    # Attempt to create Google Wallet class (non-fatal)
    try:
        from app.services.wallet.google_wallet import create_or_update_class
        gid = create_or_update_class(program)
        program.google_class_id = gid
        await db.commit()
    except Exception:
        pass

    return {"success": True, "data": _program_dict(program)}


@router.get("/api/wallet/programs/{program_id}", response_model=dict)
async def get_program(program_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    program = await _get_program(program_id, user.id, db)
    return {"success": True, "data": _program_dict(program)}


@router.patch("/api/wallet/programs/{program_id}", response_model=dict)
async def update_program(program_id: uuid.UUID, body: dict, user: CurrentUser, db: DBSession) -> dict:
    program = await _get_program(program_id, user.id, db)
    for field in ("name", "description", "status", "config", "brand_overrides", "chatbot_id"):
        if field in body:
            setattr(program, field, body[field])
    await db.commit()
    await db.refresh(program)
    return {"success": True, "data": _program_dict(program)}


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
        except Exception:
            pass
    await db.commit()
    return {"success": True, "data": {"deleted": deleted}}


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
    name = (body.get("customer_name") or "").strip() or None
    phone = (body.get("customer_phone") or "").strip() or None

    # Deduplication by email within program
    if email:
        existing_result = await db.execute(
            select(WalletCard).where(
                WalletCard.program_id == program_id,
                WalletCard.customer_email == email,
            )
        )
        existing = existing_result.scalar_one_or_none()
        if existing:
            return {"success": True, "data": _card_dict(existing), "reissued": True}

    # Find or create contact
    contact_id = None
    if email or phone:
        from app.models.crm import Contact
        from sqlalchemy import or_
        filters = []
        if email:
            filters.append(Contact.email == email)
        if phone:
            filters.append(Contact.phone == phone)
        c_result = await db.execute(
            select(Contact).where(Contact.user_id == user.id, or_(*filters)).limit(1)
        )
        contact = c_result.scalar_one_or_none()
        if not contact:
            parts = (name or "").split(" ", 1)
            contact = Contact(
                user_id=user.id,
                email=email,
                phone=phone,
                first_name=parts[0] or None,
                last_name=parts[1] if len(parts) > 1 else None,
                source="wallet",
            )
            db.add(contact)
            await db.flush()
        contact_id = contact.id

    serial = secrets.token_urlsafe(12)
    card = WalletCard(
        serial=serial,
        program_id=program_id,
        contact_id=contact_id,
        customer_name=name,
        customer_email=email,
        customer_phone=phone,
        status="active",
        state=_initial_state(program.type, program.config),
    )
    db.add(card)
    await db.flush()

    # Attempt Google Wallet pass creation (non-fatal)
    try:
        from app.services.wallet.google_wallet import issue_pass
        object_id = issue_pass(program, card)
        card.google_pass_object_id = object_id
    except Exception:
        pass

    await db.commit()
    await db.refresh(card)
    return {"success": True, "data": _card_dict(card)}


@router.delete("/api/wallet/cards/{serial}", response_model=dict)
async def revoke_card(serial: str, user: CurrentUser, db: DBSession) -> dict:
    card = await _get_card_by_serial(serial, db)
    # Verify ownership via program
    program = await db.get(WalletProgram, card.program_id)
    if not program or program.user_id != user.id:
        raise HTTPException(status_code=404, detail="Card not found")

    card.status = "revoked"
    await db.commit()
    return {"success": True, "data": None}


# ── Card actions ───────────────────────────────────────────────────────────────

_VALID_ACTIONS = frozenset({
    "add_punch", "remove_punch", "redeem", "set_punches",
    "set_tier", "add_points", "remove_points", "set_balance",
    "check_in", "un_check_in", "deduct_balance", "load_balance", "refund_balance",
})


@router.post("/api/wallet/cards/{serial}/action", response_model=dict)
async def card_action(serial: str, body: dict, user: CurrentUser, db: DBSession) -> dict:
    card = await _get_card_by_serial(serial, db)
    program = await db.get(WalletProgram, card.program_id)
    if not program or program.user_id != user.id:
        raise HTTPException(status_code=404, detail="Card not found")

    action = (body.get("action") or "").strip()
    if action not in _VALID_ACTIONS:
        raise HTTPException(status_code=422, detail=f"Unknown action: {action}")

    value = body.get("value")
    state = dict(card.state or {})
    cfg = program.config or {}

    if action == "add_punch":
        state["punches"] = state.get("punches", 0) + 1
        max_p = cfg.get("max_punches", 10)
        if state["punches"] >= max_p:
            state["punches"] = 0
            state["redeemed"] = state.get("redeemed", 0) + 1
    elif action == "remove_punch":
        state["punches"] = max(0, state.get("punches", 0) - 1)
    elif action == "set_punches":
        state["punches"] = int(value or 0)
    elif action == "redeem":
        state["redeemed"] = state.get("redeemed", 0) + 1
    elif action == "set_tier":
        state["tier"] = str(value or "Standard")
    elif action == "add_points":
        pts = int(value or 0)
        state["points"] = state.get("points", 0) + pts
        state["lifetime_points"] = state.get("lifetime_points", 0) + pts
        # Auto-upgrade tier
        tiers: list = cfg.get("tiers", [])
        for tier in reversed(tiers):
            if state["lifetime_points"] >= tier.get("min_points", 0):
                state["tier"] = tier["name"]
                break
    elif action == "remove_points":
        state["points"] = max(0, state.get("points", 0) - int(value or 0))
    elif action in ("set_balance", "load_balance"):
        state["balance"] = float(value or 0)
    elif action in ("deduct_balance", "refund_balance"):
        amt = float(value or 0)
        if action == "deduct_balance":
            state["balance"] = max(0.0, state.get("balance", 0.0) - amt)
        else:
            state["balance"] = state.get("balance", 0.0) + amt
    elif action == "check_in":
        state["checked_in"] = True
    elif action == "un_check_in":
        state["checked_in"] = False

    card.state = state
    await db.commit()

    # Push update to Google Wallet (non-fatal)
    if card.google_pass_object_id:
        try:
            from app.services.wallet.google_wallet import push_update
            push_update(card.google_pass_object_id, program.type)
        except Exception:
            pass

    return {"success": True, "data": _card_dict(card)}


# ── Push notifications ─────────────────────────────────────────────────────────

async def _send_apns(push_token: str, message: str) -> None:
    """Send Apple Push Notification for a wallet update."""
    try:
        from app.core.config import settings
        import httpx, json, jwt as pyjwt, time

        headers_jwt = {
            "alg": "ES256",
            "kid": settings.apple_push_key_id,
        }
        claims = {"iss": settings.apple_team_identifier, "iat": int(time.time())}
        token = pyjwt.encode(claims, settings.apple_push_key_pem, algorithm="ES256", headers=headers_jwt)

        payload = json.dumps({"aps": {"alert": message, "sound": "default"}}).encode()
        host = "api.push.apple.com"
        async with httpx.AsyncClient(http2=True) as client:
            await client.post(
                f"https://{host}/3/device/{push_token}",
                content=payload,
                headers={
                    "authorization": f"bearer {token}",
                    "apns-topic": settings.apple_pass_type_identifier,
                    "apns-push-type": "alert",
                    "content-type": "application/json",
                },
            )
    except Exception:
        pass


@router.post("/api/wallet/cards/{serial}/push", response_model=dict)
async def push_to_card(serial: str, body: dict, user: CurrentUser, db: DBSession) -> dict:
    card = await _get_card_by_serial(serial, db)
    program = await db.get(WalletProgram, card.program_id)
    if not program or program.user_id != user.id:
        raise HTTPException(status_code=404, detail="Card not found")

    message = (body.get("message") or "Your pass has been updated.").strip()

    subs_result = await db.execute(
        select(WalletPushSubscription).where(WalletPushSubscription.card_id == card.id)
    )
    subs = subs_result.scalars().all()
    sent = 0
    for sub in subs:
        if sub.device_type == "apple":
            await _send_apns(sub.push_token, message)
            sent += 1
        elif sub.device_type == "google" and card.google_pass_object_id:
            try:
                from app.services.wallet.google_wallet import push_update
                push_update(card.google_pass_object_id, program.type)
                sent += 1
            except Exception:
                pass

    return {"success": True, "data": {"sent": sent}}


@router.post("/api/wallet/programs/{program_id}/push", response_model=dict)
async def broadcast_push(program_id: uuid.UUID, body: dict, user: CurrentUser, db: DBSession) -> dict:
    program = await _get_program(program_id, user.id, db)
    message = (body.get("message") or "Your pass has been updated.").strip()

    cards_result = await db.execute(
        select(WalletCard).where(
            WalletCard.program_id == program_id,
            WalletCard.status == "active",
        )
    )
    cards = cards_result.scalars().all()
    sent = 0
    for card in cards:
        subs_result = await db.execute(
            select(WalletPushSubscription).where(WalletPushSubscription.card_id == card.id)
        )
        for sub in subs_result.scalars().all():
            if sub.device_type == "apple":
                await _send_apns(sub.push_token, message)
                sent += 1
            elif sub.device_type == "google" and card.google_pass_object_id:
                try:
                    from app.services.wallet.google_wallet import push_update
                    push_update(card.google_pass_object_id, program.type)
                    sent += 1
                except Exception:
                    pass

    return {"success": True, "data": {"sent": sent, "total_cards": len(cards)}}


# ── Public pass download ───────────────────────────────────────────────────────

@router.get("/api/wallet/cards/{serial}/pkpass")
async def download_pkpass(serial: str, db: DBSession) -> Response:
    card = await _get_card_by_serial(serial, db)
    if card.status != "active":
        raise HTTPException(status_code=410, detail="Card is no longer active")
    program = await db.get(WalletProgram, card.program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")

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
async def google_wallet_link(serial: str, db: DBSession) -> dict:
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
