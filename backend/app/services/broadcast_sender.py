"""
Broadcast delivery engine.

Resolves recipients from target_filter, renders message_template with
personalization variables, and delivers via the appropriate channel.
"""
import re
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


def _render(template: str, ctx: dict) -> str:
    """Replace {{key}} placeholders with context values."""
    def _replace(m: re.Match) -> str:
        return str(ctx.get(m.group(1).strip(), ""))
    return re.sub(r"\{\{(.+?)\}\}", _replace, template)


async def _resolve_recipients(campaign: Any, db: AsyncSession) -> list[dict]:
    """Return list of {email, phone, name, telegram_id, ...} dicts."""
    from app.models.crm import Contact, ContactTag, Tag
    from sqlalchemy import or_

    filt = campaign.target_filter or {}
    segment = filt.get("segment", "all")

    if segment == "all":
        q = select(Contact).where(Contact.user_id == campaign.user_id)
    elif segment == "contacts":
        q = select(Contact).where(Contact.user_id == campaign.user_id)
    else:
        q = select(Contact).where(Contact.user_id == campaign.user_id)

    # Tag filter
    tag_names: list[str] = filt.get("tags", [])
    if tag_names:
        tag_ids_result = await db.execute(
            select(Tag.id).where(Tag.user_id == campaign.user_id, Tag.name.in_(tag_names))
        )
        tag_ids = [r[0] for r in tag_ids_result.all()]
        if tag_ids:
            contact_ids_result = await db.execute(
                select(ContactTag.contact_id).where(ContactTag.tag_id.in_(tag_ids)).distinct()
            )
            cids = [r[0] for r in contact_ids_result.all()]
            q = q.where(Contact.id.in_(cids))

    contacts = (await db.execute(q)).scalars().all()
    return [
        {
            "name": f"{c.first_name or ''} {c.last_name or ''}".strip() or "Friend",
            "first_name": c.first_name or "",
            "last_name": c.last_name or "",
            "email": c.email,
            "phone": c.phone,
        }
        for c in contacts
    ]


async def _send_email(campaign: Any, recipients: list[dict]) -> tuple[int, int]:
    """AWS SES bulk send."""
    try:
        import boto3
        from app.core.config import settings

        ses = boto3.client(
            "ses",
            region_name=settings.aws_region,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
        )
        sent = failed = 0
        for r in recipients:
            if not r.get("email"):
                continue
            body = _render(campaign.message_template, r)
            html = _render(campaign.html_content or body, r)
            subj = _render(campaign.subject or campaign.name, r)
            try:
                ses.send_email(
                    Source=settings.email_from,
                    Destination={"ToAddresses": [r["email"]]},
                    Message={
                        "Subject": {"Data": subj},
                        "Body": {
                            "Text": {"Data": body},
                            "Html": {"Data": f"<html><body>{html}</body></html>"},
                        },
                    },
                )
                sent += 1
            except Exception:
                failed += 1
        return sent, failed
    except Exception:
        return 0, len(recipients)


async def _send_sms(campaign: Any, recipients: list[dict]) -> tuple[int, int]:
    """Twilio bulk SMS."""
    try:
        from twilio.rest import Client
        from app.core.config import settings

        client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
        sent = failed = 0
        for r in recipients:
            if not r.get("phone"):
                continue
            body = _render(campaign.message_template, r)
            try:
                client.messages.create(
                    body=body,
                    from_=settings.twilio_phone_number,
                    to=r["phone"],
                )
                sent += 1
            except Exception:
                failed += 1
        return sent, failed
    except Exception:
        return 0, len(recipients)


async def _send_telegram(campaign: Any, db: AsyncSession) -> tuple[int, int]:
    """Send to all Telegram subscribers (active conversations on Telegram channel)."""
    try:
        import httpx
        from app.models.conversation import Conversation
        from app.models.channel_integration import ChannelIntegration
        from app.models.inbox import ConversationChannel, ConversationStatus
        from sqlalchemy import and_

        # Find all active telegram conversations for this user
        convs_result = await db.execute(
            select(Conversation).where(
                Conversation.user_id == campaign.user_id,
                Conversation.channel == ConversationChannel.telegram,
                Conversation.status != ConversationStatus.closed,
            )
        )
        convs = convs_result.scalars().all()

        # Get bot token from any telegram integration
        integ_result = await db.execute(
            select(ChannelIntegration).where(
                ChannelIntegration.user_id == campaign.user_id,
                ChannelIntegration.channel == "telegram",
            ).limit(1)
        )
        integ = integ_result.scalar_one_or_none()
        if not integ:
            return 0, 0

        token = integ.config.get("bot_token", "")
        sent = failed = 0

        async with httpx.AsyncClient(timeout=10) as client:
            for conv in convs:
                # contact.contact_id holds the Telegram numeric chat_id (string)
                if not conv.contact or not conv.contact.contact_id:
                    continue
                ctx = {
                    "name": f"{conv.contact.first_name or ''} {conv.contact.last_name or ''}".strip() or "Friend",
                    "first_name": conv.contact.first_name or "",
                    "last_name": conv.contact.last_name or "",
                    "email": conv.contact.email or "",
                    "phone": conv.contact.phone or "",
                }
                body = _render(campaign.message_template, ctx)
                try:
                    resp = await client.post(
                        f"https://api.telegram.org/bot{token}/sendMessage",
                        json={"chat_id": conv.contact.contact_id, "text": body},
                    )
                    if resp.status_code == 200:
                        sent += 1
                    else:
                        failed += 1
                except Exception:
                    failed += 1

        return sent, failed
    except Exception:
        return 0, 0


async def _send_whatsapp(campaign: Any, recipients: list[dict]) -> tuple[int, int]:
    """Meta WhatsApp template messages."""
    try:
        import httpx
        from app.core.config import settings
        from app.models.channel_integration import ChannelIntegration

        sent = failed = 0
        template_name = campaign.target_filter.get("whatsapp_template", "")
        if not template_name:
            return 0, len(recipients)

        for r in recipients:
            if not r.get("phone"):
                continue
            try:
                async with httpx.AsyncClient(timeout=10) as client:
                    await client.post(
                        f"https://graph.facebook.com/v19.0/{settings.whatsapp_phone_number_id}/messages",
                        headers={"Authorization": f"Bearer {settings.whatsapp_access_token}"},
                        json={
                            "messaging_product": "whatsapp",
                            "to": r["phone"],
                            "type": "template",
                            "template": {
                                "name": template_name,
                                "language": {"code": "en_US"},
                            },
                        },
                    )
                sent += 1
            except Exception:
                failed += 1
        return sent, failed
    except Exception:
        return 0, len(recipients)


async def _send_push(campaign: Any, db: AsyncSession) -> tuple[int, int]:
    """Send push notification to all web chat subscribers of the campaign's chatbot."""
    try:
        import json as _json
        from pywebpush import webpush
        from app.core.config import settings
        from app.db.session import AsyncSessionLocal
        from app.models.conversation import Conversation

        vapid_private = getattr(settings, "vapid_private_key", None)
        vapid_email = getattr(settings, "vapid_email", "mailto:admin@chatcraft.ai")
        if not vapid_private:
            return 0, 0

        chatbot_id = getattr(campaign, "chatbot_id", None)

        # Resolve all active web conversations for this chatbot (or user)
        if chatbot_id:
            convs_result = await db.execute(
                select(Conversation).where(
                    Conversation.chatbot_id == chatbot_id,
                    Conversation.channel == "web",
                    Conversation.status != "closed",
                )
            )
        else:
            convs_result = await db.execute(
                select(Conversation).where(
                    Conversation.channel == "web",
                    Conversation.status != "closed",
                )
            )
        convs = convs_result.scalars().all()

        from app.db.redis import get_async_redis
        title = campaign.name
        body_tmpl = campaign.message_template or title
        url = campaign.target_filter.get("url", "/") if campaign.target_filter else "/"

        sent = failed = 0
        redis = get_async_redis()
        for conv in convs:
            sub_raw = await redis.get(f"push:widget:conv:{conv.id}")
            if not sub_raw:
                continue
            sub = _json.loads(sub_raw)
            ctx = {
                "name": "Friend",
                "first_name": "",
                "last_name": "",
                "email": "",
                "phone": "",
            }
            if conv.contact:
                ctx["name"] = f"{conv.contact.first_name or ''} {conv.contact.last_name or ''}".strip() or "Friend"
                ctx["first_name"] = conv.contact.first_name or ""
                ctx["last_name"] = conv.contact.last_name or ""
                ctx["email"] = conv.contact.email or ""
                ctx["phone"] = conv.contact.phone or ""

            body = _render(body_tmpl, ctx)
            payload = _json.dumps({"title": title, "body": body, "url": url})
            try:
                webpush(
                    subscription_info=sub,
                    data=payload,
                    vapid_private_key=vapid_private,
                    vapid_claims={"sub": vapid_email},
                )
                sent += 1
            except Exception:
                failed += 1

        return sent, failed
    except Exception:
        return 0, 0


async def deliver(campaign: Any, db: AsyncSession) -> tuple[int, int]:
    """Route delivery to appropriate channel sender. Returns (sent, failed)."""
    channel = campaign.channel
    recipients = await _resolve_recipients(campaign, db)

    if channel == "email":
        return await _send_email(campaign, recipients)
    elif channel == "sms":
        return await _send_sms(campaign, recipients)
    elif channel == "telegram":
        return await _send_telegram(campaign, db)
    elif channel == "whatsapp":
        return await _send_whatsapp(campaign, recipients)
    elif channel == "push":
        return await _send_push(campaign, db)
    else:
        return 0, 0
