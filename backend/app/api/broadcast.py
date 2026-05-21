"""
Broadcast Hub & Social Tools API.

Routes:
  GET    /api/v1/broadcasts
  POST   /api/v1/broadcasts
  GET    /api/v1/broadcasts/{id}
  PATCH  /api/v1/broadcasts/{id}
  DELETE /api/v1/broadcasts/{id}
  POST   /api/v1/broadcasts/{id}/send
  GET    /api/v1/broadcasts/{id}/stats

  GET    /api/v1/social/accounts
  POST   /api/v1/social/accounts
  DELETE /api/v1/social/accounts/{id}
  GET    /api/v1/social/posts
  POST   /api/v1/social/posts
  DELETE /api/v1/social/posts/{id}
  POST   /api/v1/social/posts/generate-caption

  GET    /api/v1/comment-automations
  POST   /api/v1/comment-automations
  PATCH  /api/v1/comment-automations/{id}
  DELETE /api/v1/comment-automations/{id}
"""
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.core.dependencies import CurrentUser, DBSession
from app.models.broadcast import BroadcastCampaign, CommentAutomation, SocialAccount, SocialPost

router = APIRouter(tags=["broadcast", "social"])

CHANNELS = ["email", "sms", "telegram", "whatsapp", "messenger", "push", "phone"]
PLATFORMS = ["facebook", "instagram", "x"]


# ── Helpers ────────────────────────────────────────────────────────────────────

def _campaign_dict(c: BroadcastCampaign) -> dict:
    return {
        "id": str(c.id),
        "name": c.name,
        "channel": c.channel,
        "status": c.status,
        "message_template": c.message_template,
        "html_content": c.html_content,
        "subject": c.subject,
        "target_filter": c.target_filter,
        "scheduled_at": c.scheduled_at.isoformat() if c.scheduled_at else None,
        "sent_at": c.sent_at.isoformat() if c.sent_at else None,
        "sent_count": c.sent_count,
        "failed_count": c.failed_count,
        "created_at": c.created_at.isoformat(),
        "updated_at": c.updated_at.isoformat(),
    }


def _account_dict(a: SocialAccount) -> dict:
    return {
        "id": str(a.id),
        "platform": a.platform,
        "account_id": a.account_id,
        "name": a.name,
        "avatar_url": a.avatar_url,
        "page_id": a.page_id,
        "token_expires_at": a.token_expires_at.isoformat() if a.token_expires_at else None,
        "created_at": a.created_at.isoformat(),
    }


def _post_dict(p: SocialPost) -> dict:
    return {
        "id": str(p.id),
        "account_ids": p.account_ids,
        "content": p.content,
        "image_url": p.image_url,
        "status": p.status,
        "scheduled_at": p.scheduled_at.isoformat() if p.scheduled_at else None,
        "published_at": p.published_at.isoformat() if p.published_at else None,
        "platform_post_ids": p.platform_post_ids,
        "error_log": p.error_log,
        "created_at": p.created_at.isoformat(),
    }


def _ca_dict(ca: CommentAutomation) -> dict:
    return {
        "id": str(ca.id),
        "platform": ca.platform,
        "page_id": ca.page_id,
        "page_name": ca.page_name,
        "enabled": ca.enabled,
        "ai_prompt": ca.ai_prompt,
        "response_type": ca.response_type,
        "response_text": ca.response_text,
        "keyword_triggers": ca.keyword_triggers,
        "delay_seconds": ca.delay_seconds,
        "also_send_dm": ca.also_send_dm,
        "dm_message": ca.dm_message,
        "created_at": ca.created_at.isoformat(),
        "updated_at": ca.updated_at.isoformat(),
    }


async def _get_campaign(campaign_id: uuid.UUID, user_id: uuid.UUID, db) -> BroadcastCampaign:
    c = await db.get(BroadcastCampaign, campaign_id)
    if not c or c.user_id != user_id:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return c


# ── Broadcast CRUD ─────────────────────────────────────────────────────────────

@router.get("/api/v1/broadcasts", response_model=dict)
async def list_campaigns(
    user: CurrentUser, db: DBSession,
    channel: str | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> dict:
    offset = (page - 1) * limit
    q = select(BroadcastCampaign).where(BroadcastCampaign.user_id == user.id)
    if channel:
        q = q.where(BroadcastCampaign.channel == channel)
    q = q.order_by(BroadcastCampaign.created_at.desc()).offset(offset).limit(limit)
    campaigns = (await db.execute(q)).scalars().all()
    total = (await db.execute(
        select(func.count()).select_from(BroadcastCampaign).where(BroadcastCampaign.user_id == user.id)
    )).scalar_one()
    return {"success": True, "data": [_campaign_dict(c) for c in campaigns], "total": total}


@router.post("/api/v1/broadcasts", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_campaign(body: dict, user: CurrentUser, db: DBSession) -> dict:
    name = (body.get("name") or "").strip()
    channel = (body.get("channel") or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="name required")
    if channel not in CHANNELS:
        raise HTTPException(status_code=422, detail=f"channel must be one of: {CHANNELS}")

    campaign = BroadcastCampaign(
        user_id=user.id,
        name=name,
        channel=channel,
        status="draft",
        message_template=body.get("message_template", ""),
        html_content=body.get("html_content"),
        subject=body.get("subject"),
        target_filter=body.get("target_filter", {}),
        scheduled_at=_parse_dt(body.get("scheduled_at")),
    )
    db.add(campaign)
    await db.commit()
    await db.refresh(campaign)
    return {"success": True, "data": _campaign_dict(campaign)}


@router.get("/api/v1/broadcasts/{campaign_id}", response_model=dict)
async def get_campaign(campaign_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    return {"success": True, "data": _campaign_dict(await _get_campaign(campaign_id, user.id, db))}


@router.patch("/api/v1/broadcasts/{campaign_id}", response_model=dict)
async def update_campaign(campaign_id: uuid.UUID, body: dict, user: CurrentUser, db: DBSession) -> dict:
    campaign = await _get_campaign(campaign_id, user.id, db)
    if campaign.status == "sending":
        raise HTTPException(status_code=409, detail="Cannot edit a campaign that is currently sending")
    for field in ("name", "message_template", "html_content", "subject", "target_filter"):
        if field in body:
            setattr(campaign, field, body[field])
    if "scheduled_at" in body:
        campaign.scheduled_at = _parse_dt(body["scheduled_at"])
    await db.commit()
    await db.refresh(campaign)
    return {"success": True, "data": _campaign_dict(campaign)}


@router.delete("/api/v1/broadcasts/{campaign_id}", response_model=dict)
async def delete_campaign(campaign_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    campaign = await _get_campaign(campaign_id, user.id, db)
    await db.delete(campaign)
    await db.commit()
    return {"success": True, "data": None}


@router.post("/api/v1/broadcasts/{campaign_id}/send", response_model=dict)
async def send_campaign(campaign_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    campaign = await _get_campaign(campaign_id, user.id, db)
    if campaign.status in ("sending", "sent"):
        raise HTTPException(status_code=409, detail=f"Campaign already {campaign.status}")

    # Scheduled: mark scheduled
    if campaign.scheduled_at and campaign.scheduled_at > datetime.now(timezone.utc):
        campaign.status = "scheduled"
        await db.commit()
        return {"success": True, "data": {"status": "scheduled", "scheduled_at": campaign.scheduled_at.isoformat()}}

    # Send now
    campaign.status = "sending"
    await db.commit()

    from app.services.broadcast_sender import deliver
    try:
        sent, failed = await deliver(campaign, db)
        campaign.sent_count = sent
        campaign.failed_count = failed
        campaign.status = "sent"
        campaign.sent_at = datetime.now(timezone.utc)
    except Exception as exc:
        campaign.status = "failed"
        campaign.failed_count += 1

    await db.commit()
    return {"success": True, "data": _campaign_dict(campaign)}


@router.post("/api/v1/broadcasts/{campaign_id}/test", response_model=dict)
async def test_campaign(campaign_id: uuid.UUID, body: dict, user: CurrentUser, db: DBSession) -> dict:
    """Send a test message to a single address/phone/chat ID."""
    campaign = await _get_campaign(campaign_id, user.id, db)
    to: str = (body.get("to") or "").strip()
    if not to:
        raise HTTPException(status_code=422, detail="to is required")

    sample_vars = {"first_name": "Test", "last_name": "User", "email": to}
    msg = campaign.message_template or ""
    for k, v in sample_vars.items():
        msg = msg.replace(f"{{{{{k}}}}}", str(v))

    try:
        if campaign.channel == "email":
            from app.services.channels.email_sender import EmailSender
            from app.models.channel_integration import ChannelIntegration
            from sqlalchemy import select as sel
            r = await db.execute(
                sel(ChannelIntegration).where(
                    ChannelIntegration.user_id == user.id if hasattr(ChannelIntegration, "user_id") else True,
                    ChannelIntegration.channel == "email",
                    ChannelIntegration.is_active.is_(True),
                )
            )
            integ = r.scalars().first()
            if not integ:
                raise HTTPException(status_code=400, detail="No active email integration configured")
            sender = EmailSender(integ.config)
            html = campaign.html_content
            if html:
                for k, v in sample_vars.items():
                    html = html.replace(f"{{{{{k}}}}}", str(v))
            await sender.send(
                to=to,
                subject=f"[TEST] {campaign.subject or campaign.name}",
                body=html or msg,
            )
        elif campaign.channel == "sms":
            from app.models.channel_integration import ChannelIntegration
            from sqlalchemy import select as sel
            r = await db.execute(
                sel(ChannelIntegration).where(
                    ChannelIntegration.channel == "sms",
                    ChannelIntegration.is_active.is_(True),
                )
            )
            integ = r.scalars().first()
            if not integ:
                raise HTTPException(status_code=400, detail="No active SMS integration")
            from app.services.channels.sms import SMSSender
            await SMSSender(integ.config).send(to, msg)
        else:
            raise HTTPException(status_code=422, detail=f"Test send not supported for {campaign.channel} channel")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    return {"success": True, "data": {"sent_to": to, "channel": campaign.channel}}


@router.get("/api/v1/broadcasts/{campaign_id}/stats", response_model=dict)
async def campaign_stats(campaign_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    campaign = await _get_campaign(campaign_id, user.id, db)
    total = campaign.sent_count + campaign.failed_count
    return {
        "success": True,
        "data": {
            "sent_count": campaign.sent_count,
            "failed_count": campaign.failed_count,
            "total": total,
            "delivery_rate": round(campaign.sent_count / total * 100, 1) if total else 0,
            "status": campaign.status,
            "sent_at": campaign.sent_at.isoformat() if campaign.sent_at else None,
        },
    }


# ── Social accounts ────────────────────────────────────────────────────────────

@router.get("/api/v1/social/accounts", response_model=dict)
async def list_accounts(user: CurrentUser, db: DBSession) -> dict:
    result = await db.execute(
        select(SocialAccount).where(SocialAccount.user_id == user.id)
        .order_by(SocialAccount.created_at.desc())
    )
    return {"success": True, "data": [_account_dict(a) for a in result.scalars().all()]}


@router.post("/api/v1/social/accounts", response_model=dict, status_code=status.HTTP_201_CREATED)
async def connect_account(body: dict, user: CurrentUser, db: DBSession) -> dict:
    platform = (body.get("platform") or "").strip()
    if platform not in PLATFORMS:
        raise HTTPException(status_code=422, detail=f"platform must be one of: {PLATFORMS}")
    account = SocialAccount(
        user_id=user.id,
        platform=platform,
        account_id=body.get("account_id", ""),
        access_token=body.get("access_token", ""),
        name=body.get("name", ""),
        avatar_url=body.get("avatar_url"),
        page_id=body.get("page_id"),
        page_access_token=body.get("page_access_token"),
        token_expires_at=_parse_dt(body.get("token_expires_at")),
    )
    db.add(account)
    await db.commit()
    await db.refresh(account)
    return {"success": True, "data": _account_dict(account)}


@router.delete("/api/v1/social/accounts/{account_id}", response_model=dict)
async def disconnect_account(account_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    account = await db.get(SocialAccount, account_id)
    if not account or account.user_id != user.id:
        raise HTTPException(status_code=404, detail="Account not found")
    await db.delete(account)
    await db.commit()
    return {"success": True, "data": None}


# ── Social posts ───────────────────────────────────────────────────────────────

@router.get("/api/v1/social/posts", response_model=dict)
async def list_posts(
    user: CurrentUser, db: DBSession,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> dict:
    offset = (page - 1) * limit
    result = await db.execute(
        select(SocialPost).where(SocialPost.user_id == user.id)
        .order_by(SocialPost.created_at.desc()).offset(offset).limit(limit)
    )
    posts = result.scalars().all()
    total = (await db.execute(
        select(func.count()).select_from(SocialPost).where(SocialPost.user_id == user.id)
    )).scalar_one()
    return {"success": True, "data": [_post_dict(p) for p in posts], "total": total}


@router.post("/api/v1/social/posts", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_post(body: dict, user: CurrentUser, db: DBSession) -> dict:
    content = (body.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=422, detail="content required")

    account_ids: list = body.get("account_ids", [])
    scheduled_at = _parse_dt(body.get("scheduled_at"))

    post = SocialPost(
        user_id=user.id,
        account_ids=account_ids,
        content=content,
        image_url=body.get("image_url"),
        status="draft",
        scheduled_at=scheduled_at,
    )
    db.add(post)
    await db.flush()

    publish_now = body.get("publish_now", False)
    if publish_now and account_ids:
        errors = []
        platform_post_ids = {}
        for account_id in account_ids:
            try:
                account = await db.get(SocialAccount, uuid.UUID(str(account_id)))
                if not account or account.user_id != user.id:
                    continue
                pid = await _publish_to_platform(account, content, body.get("image_url"))
                if pid:
                    platform_post_ids[account_id] = pid
            except Exception as e:
                errors.append(str(e))
        post.platform_post_ids = platform_post_ids
        post.status = "published" if platform_post_ids else "failed"
        post.published_at = datetime.now(timezone.utc) if platform_post_ids else None
        if errors:
            post.error_log = "; ".join(errors)
    elif scheduled_at and scheduled_at > datetime.now(timezone.utc):
        post.status = "scheduled"

    await db.commit()
    await db.refresh(post)
    return {"success": True, "data": _post_dict(post)}


@router.delete("/api/v1/social/posts/{post_id}", response_model=dict)
async def delete_post(post_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    post = await db.get(SocialPost, post_id)
    if not post or post.user_id != user.id:
        raise HTTPException(status_code=404, detail="Post not found")
    await db.delete(post)
    await db.commit()
    return {"success": True, "data": None}


@router.post("/api/v1/social/posts/generate-caption", response_model=dict)
async def generate_caption(body: dict, user: CurrentUser, db: DBSession) -> dict:
    prompt = (body.get("prompt") or "").strip()
    if not prompt:
        raise HTTPException(status_code=422, detail="prompt required")

    from app.services.llm import ChatMessage, LLMRouter
    llm = LLMRouter(model=body.get("model", "claude-sonnet-4-6"))
    messages = [
        ChatMessage(
            role="system",
            content=(
                "You are a social media copywriter. Generate an engaging, concise social media caption. "
                "Use relevant emojis. Keep it under 280 characters unless the user specifies otherwise. "
                "Return only the caption text, nothing else."
            ),
        ),
        ChatMessage(role="user", content=prompt),
    ]
    response = await llm.complete(messages, max_tokens=500)
    return {"success": True, "data": {"caption": response.content.strip()}}


# ── Comment automations ────────────────────────────────────────────────────────

@router.get("/api/v1/comment-automations", response_model=dict)
async def list_comment_automations(user: CurrentUser, db: DBSession) -> dict:
    result = await db.execute(
        select(CommentAutomation).where(CommentAutomation.user_id == user.id)
        .order_by(CommentAutomation.created_at.desc())
    )
    return {"success": True, "data": [_ca_dict(ca) for ca in result.scalars().all()]}


@router.post("/api/v1/comment-automations", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_comment_automation(body: dict, user: CurrentUser, db: DBSession) -> dict:
    platform = (body.get("platform") or "").strip()
    page_id = (body.get("page_id") or "").strip()
    if not platform or platform not in ("facebook", "instagram"):
        raise HTTPException(status_code=422, detail="platform must be facebook or instagram")
    if not page_id:
        raise HTTPException(status_code=422, detail="page_id required")

    ca = CommentAutomation(
        user_id=user.id,
        platform=platform,
        page_id=page_id,
        page_name=body.get("page_name"),
        enabled=body.get("enabled", True),
        ai_prompt=body.get("ai_prompt"),
        response_type=body.get("response_type", "ai"),
        response_text=body.get("response_text"),
        keyword_triggers=body.get("keyword_triggers", []),
        delay_seconds=body.get("delay_seconds", 0),
        also_send_dm=body.get("also_send_dm", False),
        dm_message=body.get("dm_message"),
    )
    db.add(ca)
    await db.commit()
    await db.refresh(ca)
    return {"success": True, "data": _ca_dict(ca)}


@router.patch("/api/v1/comment-automations/{ca_id}", response_model=dict)
async def update_comment_automation(ca_id: uuid.UUID, body: dict, user: CurrentUser, db: DBSession) -> dict:
    ca = await db.get(CommentAutomation, ca_id)
    if not ca or ca.user_id != user.id:
        raise HTTPException(status_code=404, detail="Not found")
    for field in ("enabled", "ai_prompt", "response_type", "response_text",
                  "keyword_triggers", "delay_seconds", "also_send_dm", "dm_message", "page_name"):
        if field in body:
            setattr(ca, field, body[field])
    await db.commit()
    await db.refresh(ca)
    return {"success": True, "data": _ca_dict(ca)}


@router.delete("/api/v1/comment-automations/{ca_id}", response_model=dict)
async def delete_comment_automation(ca_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    ca = await db.get(CommentAutomation, ca_id)
    if not ca or ca.user_id != user.id:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(ca)
    await db.commit()
    return {"success": True, "data": None}


# ── Platform publish helpers ───────────────────────────────────────────────────

async def _publish_to_platform(account: SocialAccount, content: str, image_url: str | None) -> str | None:
    """Publish to the given social account and return the platform post ID."""
    import httpx

    if account.platform == "facebook":
        token = account.page_access_token or account.access_token
        page_id = account.page_id or account.account_id
        payload: dict = {"message": content, "access_token": token}
        if image_url:
            payload["link"] = image_url
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(f"https://graph.facebook.com/v19.0/{page_id}/feed", data=payload)
        resp.raise_for_status()
        return resp.json().get("id")

    elif account.platform == "instagram":
        if not image_url:
            raise ValueError("Instagram posts require an image_url")
        token = account.access_token
        ig_id = account.account_id
        async with httpx.AsyncClient(timeout=15) as client:
            # Step 1: create media container
            r1 = await client.post(
                f"https://graph.facebook.com/v19.0/{ig_id}/media",
                params={"image_url": image_url, "caption": content, "access_token": token},
            )
            r1.raise_for_status()
            container_id = r1.json()["id"]
            # Step 2: publish
            r2 = await client.post(
                f"https://graph.facebook.com/v19.0/{ig_id}/media_publish",
                params={"creation_id": container_id, "access_token": token},
            )
            r2.raise_for_status()
            return r2.json().get("id")

    elif account.platform == "x":
        import base64, hashlib, hmac, os, time, urllib.parse
        from app.core.config import settings
        # OAuth 1.0a
        oauth_params = {
            "oauth_consumer_key": settings.x_api_key,
            "oauth_nonce": base64.urlsafe_b64encode(os.urandom(16)).decode(),
            "oauth_signature_method": "HMAC-SHA1",
            "oauth_timestamp": str(int(time.time())),
            "oauth_token": account.access_token,
            "oauth_version": "1.0",
        }
        url = "https://api.twitter.com/2/tweets"
        base_params = {**oauth_params}
        param_str = "&".join(f"{urllib.parse.quote(k)}={urllib.parse.quote(v)}" for k, v in sorted(base_params.items()))
        base_str = f"POST&{urllib.parse.quote(url)}&{urllib.parse.quote(param_str)}"
        signing_key = f"{urllib.parse.quote(settings.x_api_secret)}&{urllib.parse.quote(account.page_access_token or '')}"
        sig = base64.b64encode(hmac.new(signing_key.encode(), base_str.encode(), hashlib.sha1).digest()).decode()
        oauth_params["oauth_signature"] = sig
        auth_header = "OAuth " + ", ".join(f'{k}="{urllib.parse.quote(v)}"' for k, v in sorted(oauth_params.items()))
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(url, json={"text": content}, headers={"Authorization": auth_header})
        resp.raise_for_status()
        return resp.json().get("data", {}).get("id")

    return None


def _parse_dt(val: str | None) -> datetime | None:
    if not val:
        return None
    try:
        return datetime.fromisoformat(val.replace("Z", "+00:00"))
    except Exception:
        return None
