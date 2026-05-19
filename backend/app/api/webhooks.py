"""
Webhook handlers for incoming channel messages.

Endpoints (no auth — public, verified via channel-specific secrets):
  POST /webhooks/telegram/{chatbot_id}
  GET  /webhooks/whatsapp/{chatbot_id}   ← Meta hub verification
  POST /webhooks/whatsapp/{chatbot_id}
  GET  /webhooks/facebook/{chatbot_id}   ← Meta hub verification
  POST /webhooks/facebook/{chatbot_id}
  GET  /webhooks/instagram/{chatbot_id}  ← Meta hub verification
  POST /webhooks/instagram/{chatbot_id}
  POST /webhooks/sms/{chatbot_id}        ← Twilio
"""
import hashlib
import hmac
import uuid

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request, status
from fastapi.responses import PlainTextResponse
from sqlalchemy import select

from app.core.dependencies import DBSession
from app.models.channel_integration import ChannelIntegration
from app.services.channels.processor import process_incoming

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


async def _get_integration(db, chatbot_id: uuid.UUID, channel: str) -> ChannelIntegration:
    result = await db.execute(
        select(ChannelIntegration).where(
            ChannelIntegration.chatbot_id == chatbot_id,
            ChannelIntegration.channel == channel,
            ChannelIntegration.is_active.is_(True),
        )
    )
    integration = result.scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Integration not found")
    return integration


# ── Telegram ──────────────────────────────────────────────────────────────────

@router.post("/telegram/{chatbot_id}", status_code=status.HTTP_200_OK)
async def telegram_webhook(
    chatbot_id: uuid.UUID,
    request: Request,
    background_tasks: BackgroundTasks,
    db: DBSession,
) -> dict:
    await _get_integration(db, chatbot_id, "telegram")  # verify integration exists

    body = await request.json()
    message = body.get("message") or body.get("edited_message")
    if not message:
        return {"ok": True}

    chat = message.get("chat", {})
    sender_id = str(chat.get("id", ""))
    text = message.get("text", "")
    if not sender_id or not text:
        return {"ok": True}

    from_user = message.get("from", {})
    name_parts = [from_user.get("first_name", ""), from_user.get("last_name", "")]
    sender_name = " ".join(p for p in name_parts if p) or None

    background_tasks.add_task(
        process_incoming,
        chatbot_id=chatbot_id,
        channel="telegram",
        sender_id=sender_id,
        text=text,
        sender_name=sender_name,
    )
    return {"ok": True}


# ── WhatsApp Cloud API ────────────────────────────────────────────────────────

@router.get("/whatsapp/{chatbot_id}")
async def whatsapp_verify(
    chatbot_id: uuid.UUID,
    db: DBSession,
    hub_mode: str = Query(default="", alias="hub.mode"),
    hub_verify_token: str = Query(default="", alias="hub.verify_token"),
    hub_challenge: str = Query(default="", alias="hub.challenge"),
) -> PlainTextResponse:
    integration = await _get_integration(db, chatbot_id, "whatsapp")
    expected = integration.config.get("verify_token", "") or integration.webhook_secret or ""
    if hub_mode == "subscribe" and hub_verify_token == expected:
        return PlainTextResponse(hub_challenge)
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Verification failed")


@router.post("/whatsapp/{chatbot_id}", status_code=status.HTTP_200_OK)
async def whatsapp_webhook(
    chatbot_id: uuid.UUID,
    request: Request,
    background_tasks: BackgroundTasks,
    db: DBSession,
) -> dict:
    await _get_integration(db, chatbot_id, "whatsapp")

    body = await request.json()
    try:
        entry = body["entry"][0]
        change = entry["changes"][0]
        value = change["value"]
        messages = value.get("messages", [])
        if not messages:
            return {"ok": True}
        msg = messages[0]
        if msg.get("type") != "text":
            return {"ok": True}  # only handle text for now

        sender_id = msg["from"]
        text = msg["text"]["body"]

        contacts_list = value.get("contacts", [{}])
        profile = contacts_list[0].get("profile", {})
        sender_name = profile.get("name")

        background_tasks.add_task(
            process_incoming,
            chatbot_id=chatbot_id,
            channel="whatsapp",
            sender_id=sender_id,
            text=text,
            sender_name=sender_name,
            sender_phone=sender_id,  # WhatsApp sender_id is the phone number
        )
    except (KeyError, IndexError):
        pass

    return {"ok": True}


# ── Facebook Messenger ────────────────────────────────────────────────────────

@router.get("/facebook/{chatbot_id}")
async def facebook_verify(
    chatbot_id: uuid.UUID,
    db: DBSession,
    hub_mode: str = Query(default="", alias="hub.mode"),
    hub_verify_token: str = Query(default="", alias="hub.verify_token"),
    hub_challenge: str = Query(default="", alias="hub.challenge"),
) -> PlainTextResponse:
    integration = await _get_integration(db, chatbot_id, "facebook")
    expected = integration.config.get("verify_token", "") or integration.webhook_secret or ""
    if hub_mode == "subscribe" and hub_verify_token == expected:
        return PlainTextResponse(hub_challenge)
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Verification failed")


@router.post("/facebook/{chatbot_id}", status_code=status.HTTP_200_OK)
async def facebook_webhook(
    chatbot_id: uuid.UUID,
    request: Request,
    background_tasks: BackgroundTasks,
    db: DBSession,
) -> dict:
    integration = await _get_integration(db, chatbot_id, "facebook")

    # Optionally verify X-Hub-Signature-256
    app_secret = integration.config.get("app_secret", "")
    if app_secret:
        sig_header = request.headers.get("X-Hub-Signature-256", "")
        raw_body = await request.body()
        expected_sig = "sha256=" + hmac.new(
            app_secret.encode(), raw_body, hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(sig_header.encode(), expected_sig.encode()):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid signature")

    body = await request.json()
    try:
        entry = body["entry"][0]
        messaging = entry["messaging"][0]
        sender_id = messaging["sender"]["id"]
        message = messaging.get("message", {})
        text = message.get("text", "")
        if not text:
            return {"ok": True}

        background_tasks.add_task(
            process_incoming,
            chatbot_id=chatbot_id,
            channel="facebook",
            sender_id=sender_id,
            text=text,
        )
    except (KeyError, IndexError):
        pass

    return {"ok": True}


# ── Instagram DM ─────────────────────────────────────────────────────────────

@router.get("/instagram/{chatbot_id}")
async def instagram_verify(
    chatbot_id: uuid.UUID,
    db: DBSession,
    hub_mode: str = Query(default="", alias="hub.mode"),
    hub_verify_token: str = Query(default="", alias="hub.verify_token"),
    hub_challenge: str = Query(default="", alias="hub.challenge"),
) -> PlainTextResponse:
    integration = await _get_integration(db, chatbot_id, "instagram")
    expected = integration.config.get("verify_token", "") or integration.webhook_secret or ""
    if hub_mode == "subscribe" and hub_verify_token == expected:
        return PlainTextResponse(hub_challenge)
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Verification failed")


@router.post("/instagram/{chatbot_id}", status_code=status.HTTP_200_OK)
async def instagram_webhook(
    chatbot_id: uuid.UUID,
    request: Request,
    background_tasks: BackgroundTasks,
    db: DBSession,
) -> dict:
    await _get_integration(db, chatbot_id, "instagram")

    body = await request.json()
    try:
        entry = body["entry"][0]
        messaging = entry.get("messaging", [])
        if not messaging:
            return {"ok": True}
        msg_event = messaging[0]
        sender_id = msg_event["sender"]["id"]
        message = msg_event.get("message", {})
        text = message.get("text", "")
        if not text:
            return {"ok": True}

        background_tasks.add_task(
            process_incoming,
            chatbot_id=chatbot_id,
            channel="instagram",
            sender_id=sender_id,
            text=text,
        )
    except (KeyError, IndexError):
        pass

    return {"ok": True}


# ── Twilio SMS ────────────────────────────────────────────────────────────────

@router.post("/sms/{chatbot_id}", status_code=status.HTTP_200_OK)
async def sms_webhook(
    chatbot_id: uuid.UUID,
    request: Request,
    background_tasks: BackgroundTasks,
    db: DBSession,
) -> PlainTextResponse:
    await _get_integration(db, chatbot_id, "sms")

    form = await request.form()
    sender_id = str(form.get("From", ""))
    text = str(form.get("Body", ""))
    if not sender_id or not text:
        return PlainTextResponse("", media_type="text/xml")

    background_tasks.add_task(
        process_incoming,
        chatbot_id=chatbot_id,
        channel="sms",
        sender_id=sender_id,
        text=text,
        sender_phone=sender_id,
    )
    # Empty TwiML response — we send the reply asynchronously
    return PlainTextResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        media_type="text/xml",
    )
