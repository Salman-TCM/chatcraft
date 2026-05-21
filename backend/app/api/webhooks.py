"""
Webhook handlers for incoming channel messages.

Endpoints (no auth — public, verified via channel-specific secrets):
  POST /webhooks/telegram/{chatbot_id}
  GET  /webhooks/whatsapp/{chatbot_id}   ← Meta hub verification
  POST /webhooks/whatsapp/{chatbot_id}
  GET  /webhooks/facebook/{chatbot_id}   ← Meta hub verification
  POST /webhooks/facebook/{chatbot_id}    ← DM + comment events
  GET  /webhooks/instagram/{chatbot_id}  ← Meta hub verification
  POST /webhooks/instagram/{chatbot_id}   ← DM + comment events
  POST /webhooks/sms/{chatbot_id}        ← Twilio
  POST /webhooks/discord/{chatbot_id}    ← Discord interactions/gateway
  POST /webhooks/email/{chatbot_id}      ← AWS SES via SNS
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
        for entry in body.get("entry", []):
            # ── Direct messages ──────────────────────────────────────────────
            for messaging in entry.get("messaging", []):
                sender_id = messaging["sender"]["id"]
                message = messaging.get("message", {})
                text = message.get("text", "")
                if text:
                    background_tasks.add_task(
                        process_incoming,
                        chatbot_id=chatbot_id,
                        channel="facebook",
                        sender_id=sender_id,
                        text=text,
                    )

            # ── Post comment events ──────────────────────────────────────────
            for change in entry.get("changes", []):
                if change.get("field") != "feed":
                    continue
                value = change.get("value", {})
                if value.get("item") != "comment":
                    continue
                comment_id = value.get("comment_id", "")
                commenter_id = value.get("from", {}).get("id", "")
                comment_text = value.get("message", "")
                post_id = value.get("post_id", "")
                if comment_text and commenter_id:
                    background_tasks.add_task(
                        _process_comment,
                        chatbot_id=chatbot_id,
                        platform="facebook",
                        commenter_id=commenter_id,
                        comment_text=comment_text,
                        comment_id=comment_id,
                        post_id=post_id,
                        page_access_token=integration.config.get("page_access_token", ""),
                    )
    except Exception:
        pass

    return {"ok": True}


async def _process_comment(
    chatbot_id: uuid.UUID,
    platform: str,
    commenter_id: str,
    comment_text: str,
    comment_id: str,
    post_id: str,
    page_access_token: str,
) -> None:
    """Process post comment: match automation, AI reply publicly, optionally send DM."""
    from sqlalchemy import select
    from app.db.session import AsyncSessionLocal
    from app.models.broadcast import CommentAutomation
    from app.models.chatbot_config import ChatbotConfig

    async with AsyncSessionLocal() as db:
        # Get the chatbot owner to find automations by user_id
        bot = await db.get(ChatbotConfig, chatbot_id)
        if not bot:
            return

        result = await db.execute(
            select(CommentAutomation).where(
                CommentAutomation.user_id == bot.user_id,
                CommentAutomation.platform == platform,
                CommentAutomation.enabled.is_(True),
            )
        )
        automations = result.scalars().all()
        if not automations:
            return

        for auto in automations:
            # Check keyword triggers
            keywords: list[str] = auto.keyword_triggers or []
            if keywords:
                text_lower = comment_text.lower()
                if not any(kw.lower() in text_lower for kw in keywords):
                    continue

            # Generate reply
            reply_text: str = ""
            if auto.response_type == "text" and auto.response_text:
                reply_text = auto.response_text
            elif auto.response_type == "ai" and auto.ai_prompt:
                try:
                    from app.services.llm.base import ChatMessage
                    from app.services.llm.router import get_provider
                    provider = get_provider("claude-sonnet-4-6")
                    messages = [
                        ChatMessage(role="system", content=auto.ai_prompt),
                        ChatMessage(role="user", content=comment_text),
                    ]
                    resp = await provider.complete(messages, max_tokens=256, temperature=0.7)
                    reply_text = resp.content.strip()
                except Exception:
                    reply_text = ""

            if not reply_text:
                continue

            # Post public comment reply via Graph API
            try:
                import httpx
                _GRAPH = "https://graph.facebook.com/v19.0"
                reply_endpoint = f"{_GRAPH}/{comment_id}/comments"
                async with httpx.AsyncClient(timeout=10) as client:
                    await client.post(
                        reply_endpoint,
                        json={"message": reply_text},
                        params={"access_token": page_access_token},
                    )
            except Exception:
                pass

            # Also send DM if configured
            if auto.also_send_dm and commenter_id:
                dm_text = auto.dm_message or reply_text
                await process_incoming(
                    chatbot_id=chatbot_id,
                    channel=platform,
                    sender_id=commenter_id,
                    text=dm_text,
                )


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
    integration = await _get_integration(db, chatbot_id, "instagram")

    body = await request.json()
    try:
        for entry in body.get("entry", []):
            # ── Direct messages ──────────────────────────────────────────────
            for msg_event in entry.get("messaging", []):
                sender_id = msg_event["sender"]["id"]
                message = msg_event.get("message", {})
                text = message.get("text", "")
                if text:
                    background_tasks.add_task(
                        process_incoming,
                        chatbot_id=chatbot_id,
                        channel="instagram",
                        sender_id=sender_id,
                        text=text,
                    )

            # ── Comment events ───────────────────────────────────────────────
            for change in entry.get("changes", []):
                field = change.get("field", "")
                value = change.get("value", {})

                if field == "comments":
                    comment_id = value.get("id", "")
                    commenter_id = value.get("from", {}).get("id", "")
                    comment_text = value.get("text", "")
                    media_id = value.get("media", {}).get("id", "")
                    if comment_text and commenter_id:
                        background_tasks.add_task(
                            _process_comment,
                            chatbot_id=chatbot_id,
                            platform="instagram",
                            commenter_id=commenter_id,
                            comment_text=comment_text,
                            comment_id=comment_id,
                            post_id=media_id,
                            page_access_token=integration.config.get("access_token", ""),
                        )

                elif field == "mentions":
                    # Story mention — someone tagged the account in their story
                    media_id = value.get("media_id", "")
                    commenter_id = value.get("sender_id", "") or entry.get("id", "")
                    if commenter_id:
                        background_tasks.add_task(
                            _process_story_mention,
                            chatbot_id=chatbot_id,
                            mentioner_id=commenter_id,
                            media_id=media_id,
                            page_access_token=integration.config.get("access_token", ""),
                        )
    except Exception:
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


# ── Discord Bot ───────────────────────────────────────────────────────────────

@router.post("/discord/{chatbot_id}", status_code=status.HTTP_200_OK)
async def discord_webhook(
    chatbot_id: uuid.UUID,
    request: Request,
    background_tasks: BackgroundTasks,
    db: DBSession,
) -> dict:
    integration = await _get_integration(db, chatbot_id, "discord")
    body = await request.json()

    # Discord PING interaction (required for webhook registration)
    if body.get("type") == 1:
        return {"type": 1}

    # MESSAGE_CREATE event (type 0 = Discord Interactions, but we handle Gateway events here)
    event_type = body.get("type")
    if event_type == 0:
        # Slash command or component interaction — extract message
        data = body.get("data", {})
        options = data.get("options", [])
        text = options[0].get("value", "") if options else ""
        sender_id = str(body.get("member", {}).get("user", {}).get("id") or body.get("user", {}).get("id", ""))
        sender_name = body.get("member", {}).get("user", {}).get("username")
        # channel_id acts as the recipient for reply
        channel_id = str(body.get("channel_id", ""))
        if not text or not sender_id:
            return {"type": 5}  # ACK with no response
        background_tasks.add_task(
            process_incoming,
            chatbot_id=chatbot_id,
            channel="discord",
            sender_id=channel_id or sender_id,
            text=text,
            sender_name=sender_name,
        )
        return {"type": 5}  # Deferred channel message

    # Gateway MESSAGE_CREATE (when Discord sends raw events via configured endpoint)
    if "content" in body and body.get("author", {}).get("bot") is not True:
        sender_id = str(body.get("channel_id", body.get("author", {}).get("id", "")))
        text = body.get("content", "")
        author = body.get("author", {})
        sender_name = author.get("username")
        if not text or not sender_id:
            return {"ok": True}
        background_tasks.add_task(
            process_incoming,
            chatbot_id=chatbot_id,
            channel="discord",
            sender_id=sender_id,
            text=text,
            sender_name=sender_name,
        )

    return {"ok": True}


# ── Email Inbound (AWS SES via SNS) ──────────────────────────────────────────
# SES receives email → SNS topic → HTTP POST to this endpoint.
# SNS sends either a SubscriptionConfirmation or a Notification message.

@router.post("/email/{chatbot_id}", status_code=status.HTTP_200_OK)
async def email_webhook(
    chatbot_id: uuid.UUID,
    request: Request,
    background_tasks: BackgroundTasks,
    db: DBSession,
) -> dict:
    await _get_integration(db, chatbot_id, "email")

    body = await request.json()
    msg_type = request.headers.get("x-amz-sns-message-type", "")

    # SNS subscription confirmation — auto-confirm by fetching SubscribeURL
    if msg_type == "SubscriptionConfirmation" or body.get("Type") == "SubscriptionConfirmation":
        subscribe_url = body.get("SubscribeURL")
        if subscribe_url:
            import httpx
            async with httpx.AsyncClient(timeout=10) as client:
                await client.get(subscribe_url)
        return {"ok": True}

    # Extract notification message (SNS wraps the SES payload as a JSON string)
    raw_message = body.get("Message", "")
    if not raw_message:
        return {"ok": True}

    try:
        import json
        ses_payload = json.loads(raw_message) if isinstance(raw_message, str) else raw_message
    except Exception:
        return {"ok": True}

    background_tasks.add_task(
        _process_inbound_email,
        chatbot_id=chatbot_id,
        ses_payload=ses_payload,
    )
    return {"ok": True}


async def _process_story_mention(
    chatbot_id: uuid.UUID,
    mentioner_id: str,
    media_id: str,
    page_access_token: str,
) -> None:
    """Handle Instagram story mention: auto-DM the person who mentioned us."""
    try:
        from sqlalchemy import select as _sel
        from app.db.session import AsyncSessionLocal
        from app.models.broadcast import CommentAutomation
        from app.models.chatbot_config import ChatbotConfig

        async with AsyncSessionLocal() as db:
            bot = await db.get(ChatbotConfig, chatbot_id)
            if not bot:
                return

            result = await db.execute(
                _sel(CommentAutomation).where(
                    CommentAutomation.user_id == bot.user_id,
                    CommentAutomation.platform == "instagram",
                    CommentAutomation.enabled.is_(True),
                )
            )
            automations = result.scalars().all()

        # For story mentions, send a DM thank-you if any automation has also_send_dm
        for auto in automations:
            if not auto.also_send_dm:
                continue
            dm_text = auto.dm_message or "Thanks for mentioning us in your story! 🙌"
            await process_incoming(
                chatbot_id=chatbot_id,
                channel="instagram",
                sender_id=mentioner_id,
                text=f"[Story mention — auto-reply] {dm_text}",
                sender_name=None,
            )
            break  # Only one automation handles story mentions
    except Exception as exc:
        from loguru import logger
        logger.error(f"Failed to process story mention for chatbot {chatbot_id}: {exc}")


async def _process_inbound_email(chatbot_id: uuid.UUID, ses_payload: dict) -> None:
    """Parse SES email notification and route to process_incoming."""
    try:
        mail = ses_payload.get("mail", {})
        common_headers = mail.get("commonHeaders", {})

        from_list: list[str] = common_headers.get("from", [])
        sender_raw = from_list[0] if from_list else mail.get("source", "")

        # Parse "Display Name <email@example.com>" or bare email address
        sender_email = sender_raw
        sender_name = None
        if "<" in sender_raw and ">" in sender_raw:
            sender_name = sender_raw.split("<")[0].strip().strip('"')
            sender_email = sender_raw.split("<")[1].split(">")[0].strip()

        subject: str = common_headers.get("subject", "No Subject")

        # Try to extract plain-text body from content parts
        content_parts: list[dict] = ses_payload.get("content", [])
        body_text = ""
        import base64
        for part in content_parts:
            ct = part.get("contentType", "")
            if "text/plain" in ct:
                raw = part.get("content", "")
                try:
                    body_text = base64.b64decode(raw).decode("utf-8", errors="replace")
                except Exception:
                    body_text = raw
                break
        if not body_text:
            raw_content = ses_payload.get("content", "")
            if isinstance(raw_content, str):
                try:
                    body_text = base64.b64decode(raw_content).decode("utf-8", errors="replace")
                except Exception:
                    body_text = raw_content

        if not sender_email or not body_text.strip():
            return

        await process_incoming(
            chatbot_id=chatbot_id,
            channel="email",
            sender_id=sender_email,
            text=body_text.strip(),
            sender_name=sender_name,
        )
    except Exception as exc:
        from loguru import logger
        logger.error(f"Failed to process inbound email for chatbot {chatbot_id}: {exc}")
