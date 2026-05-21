"""
Channel Integration API — CRUD for per-chatbot channel connections.

Routes (all require authenticated chatbot owner):
  GET    /api/v1/chatbots/{chatbot_id}/integrations
  PUT    /api/v1/chatbots/{chatbot_id}/integrations/{channel}
  DELETE /api/v1/chatbots/{chatbot_id}/integrations/{channel}
  POST   /api/v1/chatbots/{chatbot_id}/integrations/telegram/set-webhook
  POST   /api/v1/chatbots/{chatbot_id}/integrations/telegram/test
  GET    /api/v1/chatbots/{chatbot_id}/integrations/telegram/commands
  POST   /api/v1/chatbots/{chatbot_id}/integrations/telegram/commands
  DELETE /api/v1/chatbots/{chatbot_id}/integrations/telegram/commands
  POST   /api/v1/chatbots/{chatbot_id}/integrations/whatsapp/test
  GET    /api/v1/chatbots/{chatbot_id}/integrations/whatsapp/templates
  POST   /api/v1/chatbots/{chatbot_id}/integrations/whatsapp/templates
  DELETE /api/v1/chatbots/{chatbot_id}/integrations/whatsapp/templates/{name}
  POST   /api/v1/chatbots/{chatbot_id}/integrations/facebook/test
  GET    /api/v1/chatbots/{chatbot_id}/integrations/facebook/menu
  POST   /api/v1/chatbots/{chatbot_id}/integrations/facebook/menu
  DELETE /api/v1/chatbots/{chatbot_id}/integrations/facebook/menu
  POST   /api/v1/chatbots/{chatbot_id}/integrations/sms/test
"""
import secrets
import uuid

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select

from app.core.config import settings
from app.core.dependencies import CurrentUser, DBSession
from app.models.channel_integration import ChannelIntegration
from app.models.chatbot_config import ChatbotConfig

router = APIRouter(prefix="/api/v1", tags=["integrations"])

SUPPORTED_CHANNELS = {"telegram", "whatsapp", "facebook", "sms", "email", "discord", "instagram"}

# Fields that should be masked in responses (contain credentials)
_SECRET_FIELDS = {"bot_token", "access_token", "page_access_token", "auth_token", "app_secret", "smtp_password"}


def _mask(config: dict) -> dict:
    """Return config with secret values replaced by masked strings."""
    return {
        k: ("••••••" + v[-4:] if isinstance(v, str) and len(v) > 6 else "••••••")
        if k in _SECRET_FIELDS and v
        else v
        for k, v in config.items()
    }


def _integration_dict(i: ChannelIntegration, mask_secrets: bool = True) -> dict:
    return {
        "id": str(i.id),
        "chatbot_id": str(i.chatbot_id),
        "channel": i.channel,
        "is_active": i.is_active,
        "config": _mask(i.config) if mask_secrets else i.config,
        "webhook_secret": i.webhook_secret,
        "created_at": i.created_at.isoformat(),
        "updated_at": i.updated_at.isoformat(),
    }


async def _get_owned_bot(chatbot_id: uuid.UUID, user_id: uuid.UUID, db) -> ChatbotConfig:
    bot: ChatbotConfig | None = await db.get(ChatbotConfig, chatbot_id)
    if not bot or bot.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chatbot not found")
    return bot


@router.get("/chatbots/{chatbot_id}/integrations", response_model=dict)
async def list_integrations(chatbot_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    await _get_owned_bot(chatbot_id, user.id, db)
    result = await db.execute(
        select(ChannelIntegration).where(ChannelIntegration.chatbot_id == chatbot_id)
    )
    integrations = result.scalars().all()
    return {"success": True, "data": [_integration_dict(i) for i in integrations]}


@router.put("/chatbots/{chatbot_id}/integrations/{channel}", response_model=dict)
async def upsert_integration(
    chatbot_id: uuid.UUID,
    channel: str,
    body: dict,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    if channel not in SUPPORTED_CHANNELS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported channel. Must be one of: {', '.join(sorted(SUPPORTED_CHANNELS))}",
        )
    await _get_owned_bot(chatbot_id, user.id, db)

    result = await db.execute(
        select(ChannelIntegration).where(
            ChannelIntegration.chatbot_id == chatbot_id,
            ChannelIntegration.channel == channel,
        )
    )
    integration = result.scalar_one_or_none()

    incoming_config: dict = body.get("config", {})
    is_active: bool = body.get("is_active", True)

    if integration:
        # Merge config — preserve existing secret values unless caller provides a new non-masked one
        merged = dict(integration.config)
        for k, v in incoming_config.items():
            if k in _SECRET_FIELDS and isinstance(v, str) and v.startswith("••••••"):
                continue  # caller sent back a masked value — don't overwrite
            merged[k] = v
        integration.config = merged
        integration.is_active = is_active
    else:
        integration = ChannelIntegration(
            chatbot_id=chatbot_id,
            channel=channel,
            config=incoming_config,
            is_active=is_active,
            webhook_secret=secrets.token_urlsafe(32),
        )
        db.add(integration)

    await db.commit()
    await db.refresh(integration)
    return {"success": True, "data": _integration_dict(integration)}


@router.delete("/chatbots/{chatbot_id}/integrations/{channel}", response_model=dict)
async def delete_integration(
    chatbot_id: uuid.UUID,
    channel: str,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    await _get_owned_bot(chatbot_id, user.id, db)
    result = await db.execute(
        select(ChannelIntegration).where(
            ChannelIntegration.chatbot_id == chatbot_id,
            ChannelIntegration.channel == channel,
        )
    )
    integration = result.scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Integration not found")
    await db.delete(integration)
    await db.commit()
    return {"success": True, "data": None}


# ── Telegram: register webhook with Bot API ────────────────────────────────────

@router.post("/chatbots/{chatbot_id}/integrations/telegram/set-webhook", response_model=dict)
async def telegram_set_webhook(
    chatbot_id: uuid.UUID,
    request: Request,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    await _get_owned_bot(chatbot_id, user.id, db)
    result = await db.execute(
        select(ChannelIntegration).where(
            ChannelIntegration.chatbot_id == chatbot_id,
            ChannelIntegration.channel == "telegram",
        )
    )
    integration = result.scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Telegram integration not configured")

    from app.services.channels.telegram import TelegramSender
    sender = TelegramSender(integration.config)

    base_url = str(request.base_url).rstrip("/")
    webhook_url = f"{base_url}/webhooks/telegram/{chatbot_id}"
    try:
        result_data = await sender.set_webhook(webhook_url)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    return {"success": True, "data": {"webhook_url": webhook_url, "telegram_response": result_data}}


# ── Connection test endpoints ──────────────────────────────────────────────────

@router.post("/chatbots/{chatbot_id}/integrations/telegram/test", response_model=dict)
async def test_telegram(chatbot_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    await _get_owned_bot(chatbot_id, user.id, db)
    result = await db.execute(
        select(ChannelIntegration).where(
            ChannelIntegration.chatbot_id == chatbot_id,
            ChannelIntegration.channel == "telegram",
        )
    )
    integration = result.scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not configured")

    from app.services.channels.telegram import TelegramSender
    try:
        info = await TelegramSender(integration.config).get_me()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    return {"success": True, "data": info.get("result", {})}


@router.post("/chatbots/{chatbot_id}/integrations/whatsapp/test", response_model=dict)
async def test_whatsapp(chatbot_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    await _get_owned_bot(chatbot_id, user.id, db)
    result = await db.execute(
        select(ChannelIntegration).where(
            ChannelIntegration.chatbot_id == chatbot_id,
            ChannelIntegration.channel == "whatsapp",
        )
    )
    integration = result.scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not configured")

    import httpx
    phone_number_id = integration.config.get("phone_number_id", "")
    access_token = integration.config.get("access_token", "")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                f"https://graph.facebook.com/v19.0/{phone_number_id}",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            r.raise_for_status()
            data = r.json()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    return {"success": True, "data": {"display_phone_number": data.get("display_phone_number"), "verified_name": data.get("verified_name")}}


@router.post("/chatbots/{chatbot_id}/integrations/facebook/test", response_model=dict)
async def test_facebook(chatbot_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    await _get_owned_bot(chatbot_id, user.id, db)
    result = await db.execute(
        select(ChannelIntegration).where(
            ChannelIntegration.chatbot_id == chatbot_id,
            ChannelIntegration.channel == "facebook",
        )
    )
    integration = result.scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not configured")

    import httpx
    token = integration.config.get("page_access_token", "")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                "https://graph.facebook.com/v19.0/me",
                params={"access_token": token, "fields": "id,name"},
            )
            r.raise_for_status()
            data = r.json()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    return {"success": True, "data": {"page_id": data.get("id"), "page_name": data.get("name")}}


@router.post("/chatbots/{chatbot_id}/integrations/instagram/test", response_model=dict)
async def test_instagram(chatbot_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    await _get_owned_bot(chatbot_id, user.id, db)
    result = await db.execute(
        select(ChannelIntegration).where(
            ChannelIntegration.chatbot_id == chatbot_id,
            ChannelIntegration.channel == "instagram",
        )
    )
    integration = result.scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not configured")

    import httpx
    token = integration.config.get("page_access_token", "")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                "https://graph.facebook.com/v19.0/me",
                params={"access_token": token, "fields": "id,name,instagram_business_account"},
            )
            r.raise_for_status()
            data = r.json()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    return {"success": True, "data": {"page_id": data.get("id"), "page_name": data.get("name")}}


@router.post("/chatbots/{chatbot_id}/integrations/sms/test", response_model=dict)
async def test_sms(chatbot_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    await _get_owned_bot(chatbot_id, user.id, db)
    result = await db.execute(
        select(ChannelIntegration).where(
            ChannelIntegration.chatbot_id == chatbot_id,
            ChannelIntegration.channel == "sms",
        )
    )
    integration = result.scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not configured")

    import base64
    import httpx
    account_sid = integration.config.get("account_sid", "")
    auth_token = integration.config.get("auth_token", "")
    creds = base64.b64encode(f"{account_sid}:{auth_token}".encode()).decode()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}.json",
                headers={"Authorization": f"Basic {creds}"},
            )
            r.raise_for_status()
            data = r.json()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    return {"success": True, "data": {"account_sid": data.get("sid"), "friendly_name": data.get("friendly_name"), "status": data.get("status")}}


@router.post("/chatbots/{chatbot_id}/integrations/discord/test", response_model=dict)
async def test_discord(chatbot_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    await _get_owned_bot(chatbot_id, user.id, db)
    result = await db.execute(
        select(ChannelIntegration).where(
            ChannelIntegration.chatbot_id == chatbot_id,
            ChannelIntegration.channel == "discord",
        )
    )
    integration = result.scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not configured")

    import httpx
    token = integration.config.get("bot_token", "")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                "https://discord.com/api/v10/users/@me",
                headers={"Authorization": f"Bot {token}"},
            )
            r.raise_for_status()
            data = r.json()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    return {"success": True, "data": {"bot_id": data.get("id"), "username": data.get("username"), "discriminator": data.get("discriminator")}}


# ── Telegram Bot Commands ──────────────────────────────────────────────────────

async def _get_telegram_sender(chatbot_id: uuid.UUID, user_id: uuid.UUID, db):
    await _get_owned_bot(chatbot_id, user_id, db)
    result = await db.execute(
        select(ChannelIntegration).where(
            ChannelIntegration.chatbot_id == chatbot_id,
            ChannelIntegration.channel == "telegram",
        )
    )
    integration = result.scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=404, detail="Telegram integration not configured")
    from app.services.channels.telegram import TelegramSender
    return TelegramSender(integration.config)


@router.get("/chatbots/{chatbot_id}/integrations/telegram/commands", response_model=dict)
async def get_telegram_commands(chatbot_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    sender = await _get_telegram_sender(chatbot_id, user.id, db)
    try:
        commands = await sender.get_commands()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return {"success": True, "data": commands}


@router.post("/chatbots/{chatbot_id}/integrations/telegram/commands", response_model=dict)
async def set_telegram_commands(
    chatbot_id: uuid.UUID, body: dict, user: CurrentUser, db: DBSession
) -> dict:
    """body: { "commands": [{"command": "start", "description": "Start the bot"}] }"""
    commands = body.get("commands", [])
    if not isinstance(commands, list):
        raise HTTPException(status_code=422, detail="commands must be a list")
    sender = await _get_telegram_sender(chatbot_id, user.id, db)
    try:
        result = await sender.set_commands(commands)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return {"success": True, "data": result}


@router.delete("/chatbots/{chatbot_id}/integrations/telegram/commands", response_model=dict)
async def delete_telegram_commands(chatbot_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    sender = await _get_telegram_sender(chatbot_id, user.id, db)
    try:
        result = await sender.delete_commands()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return {"success": True, "data": result}


# ── WhatsApp Templates ─────────────────────────────────────────────────────────

async def _get_whatsapp_sender(chatbot_id: uuid.UUID, user_id: uuid.UUID, db):
    await _get_owned_bot(chatbot_id, user_id, db)
    result = await db.execute(
        select(ChannelIntegration).where(
            ChannelIntegration.chatbot_id == chatbot_id,
            ChannelIntegration.channel == "whatsapp",
        )
    )
    integration = result.scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=404, detail="WhatsApp integration not configured")
    from app.services.channels.whatsapp import WhatsAppSender
    return WhatsAppSender(integration.config)


@router.get("/chatbots/{chatbot_id}/integrations/whatsapp/templates", response_model=dict)
async def list_whatsapp_templates(chatbot_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    sender = await _get_whatsapp_sender(chatbot_id, user.id, db)
    try:
        templates = await sender.list_templates()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return {"success": True, "data": templates}


@router.post("/chatbots/{chatbot_id}/integrations/whatsapp/templates", response_model=dict, status_code=201)
async def create_whatsapp_template(
    chatbot_id: uuid.UUID, body: dict, user: CurrentUser, db: DBSession
) -> dict:
    sender = await _get_whatsapp_sender(chatbot_id, user.id, db)
    try:
        result = await sender.create_template(body)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return {"success": True, "data": result}


@router.delete("/chatbots/{chatbot_id}/integrations/whatsapp/templates/{template_name}", response_model=dict)
async def delete_whatsapp_template(
    chatbot_id: uuid.UUID, template_name: str, user: CurrentUser, db: DBSession
) -> dict:
    sender = await _get_whatsapp_sender(chatbot_id, user.id, db)
    try:
        await sender.delete_template(template_name)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return {"success": True}


# ── Messenger Persistent Menu ──────────────────────────────────────────────────

async def _get_facebook_sender(chatbot_id: uuid.UUID, user_id: uuid.UUID, db):
    await _get_owned_bot(chatbot_id, user_id, db)
    result = await db.execute(
        select(ChannelIntegration).where(
            ChannelIntegration.chatbot_id == chatbot_id,
            ChannelIntegration.channel == "facebook",
        )
    )
    integration = result.scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=404, detail="Facebook integration not configured")
    from app.services.channels.facebook import FacebookSender
    return FacebookSender(integration.config)


@router.get("/chatbots/{chatbot_id}/integrations/facebook/menu", response_model=dict)
async def get_messenger_menu(chatbot_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    sender = await _get_facebook_sender(chatbot_id, user.id, db)
    try:
        result = await sender.get_persistent_menu()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return {"success": True, "data": result}


@router.post("/chatbots/{chatbot_id}/integrations/facebook/menu", response_model=dict)
async def set_messenger_menu(
    chatbot_id: uuid.UUID, body: dict, user: CurrentUser, db: DBSession
) -> dict:
    """body: { "menu_items": [{"type":"postback","title":"...","payload":"..."}] }"""
    menu_items = body.get("menu_items", [])
    if not isinstance(menu_items, list):
        raise HTTPException(status_code=422, detail="menu_items must be a list")
    sender = await _get_facebook_sender(chatbot_id, user.id, db)
    try:
        result = await sender.set_persistent_menu(menu_items)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return {"success": True, "data": result}


@router.delete("/chatbots/{chatbot_id}/integrations/facebook/menu", response_model=dict)
async def delete_messenger_menu(chatbot_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    sender = await _get_facebook_sender(chatbot_id, user.id, db)
    try:
        result = await sender.delete_persistent_menu()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return {"success": True, "data": result}


# ── Email Integration: test send ───────────────────────────────────────────────

@router.post("/chatbots/{chatbot_id}/integrations/email/test", response_model=dict)
async def test_email_integration(
    chatbot_id: uuid.UUID, body: dict, user: CurrentUser, db: DBSession
) -> dict:
    """Send a test email to verify SMTP config.  Body: { "to": "test@example.com" }"""
    await _get_owned_bot(chatbot_id, user.id, db)
    result = await db.execute(
        select(ChannelIntegration).where(
            ChannelIntegration.chatbot_id == chatbot_id,
            ChannelIntegration.channel == "email",
        )
    )
    integration = result.scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=404, detail="Email integration not configured")

    to = (body.get("to") or "").strip()
    if not to:
        raise HTTPException(status_code=422, detail="to address required")

    from app.services.channels.email_sender import EmailSender
    sender = EmailSender(integration.config)
    try:
        await sender.send(
            to=to,
            subject="ChatCraft Email Integration Test",
            body="This is a test email from your ChatCraft email channel integration. It's working!",
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"SMTP error: {exc}")
    return {"success": True, "data": {"sent_to": to}}
