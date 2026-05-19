"""
Web Push Notification API (VAPID).

GET  /api/push/vapid-key          — return public VAPID key
POST /api/push/subscribe          — store push subscription for current user
POST /api/push/send               — send push notification to current user (test)
DELETE /api/push/subscribe        — remove push subscription
"""
import json

from fastapi import APIRouter, HTTPException, status

from app.core.config import settings
from app.core.dependencies import CurrentUser, DBSession, RedisClient

router = APIRouter(prefix="/api/push", tags=["push"])

_SUBSCRIPTION_TTL = 60 * 60 * 24 * 365  # 1 year


def _sub_key(user_id) -> str:
    return f"push:sub:{user_id}"


@router.get("/vapid-key", response_model=dict)
async def get_vapid_key() -> dict:
    public_key = getattr(settings, "vapid_public_key", None)
    if not public_key:
        raise HTTPException(status_code=503, detail="Push notifications not configured")
    return {"success": True, "data": {"public_key": public_key}}


@router.post("/subscribe", response_model=dict)
async def subscribe(body: dict, user: CurrentUser, redis: RedisClient) -> dict:
    endpoint = body.get("endpoint")
    keys = body.get("keys")
    if not endpoint or not keys:
        raise HTTPException(status_code=422, detail="endpoint and keys required")

    sub = {"endpoint": endpoint, "keys": keys}
    await redis.set(_sub_key(user.id), json.dumps(sub), ex=_SUBSCRIPTION_TTL)
    return {"success": True, "data": {"subscribed": True}}


@router.delete("/subscribe", response_model=dict)
async def unsubscribe(user: CurrentUser, redis: RedisClient) -> dict:
    await redis.delete(_sub_key(user.id))
    return {"success": True, "data": {"subscribed": False}}


@router.post("/send", response_model=dict)
async def send_push(body: dict, user: CurrentUser, redis: RedisClient) -> dict:
    """Send a test push notification to the current user."""
    sub_raw = await redis.get(_sub_key(user.id))
    if not sub_raw:
        raise HTTPException(status_code=404, detail="No push subscription found")

    sub = json.loads(sub_raw)
    title = body.get("title", "ChatCraft AI")
    message = body.get("message", "You have a new notification")
    payload = json.dumps({"title": title, "body": message, "url": body.get("url", "/dashboard")})

    try:
        from pywebpush import webpush, WebPushException
        vapid_private = getattr(settings, "vapid_private_key", None)
        vapid_email = getattr(settings, "vapid_email", "mailto:admin@chatcraft.ai")
        if not vapid_private:
            raise HTTPException(status_code=503, detail="VAPID not configured")

        webpush(
            subscription_info=sub,
            data=payload,
            vapid_private_key=vapid_private,
            vapid_claims={"sub": vapid_email},
        )
        return {"success": True, "data": {"sent": True}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Push failed: {e}")
