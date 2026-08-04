"""Pydantic schemas for the Web Push Notification API (VAPID)."""

from pydantic import BaseModel, Field


class PushSubscribeRequest(BaseModel):
    """Body for POST /api/push/subscribe.

    Mirrors the shape of a browser PushSubscription.toJSON() object:
    { endpoint: str, keys: { p256dh: str, auth: str } }.
    """

    endpoint: str = Field(min_length=1, max_length=2000)
    keys: dict


class PushSendRequest(BaseModel):
    """Body for POST /api/push/send (test notification)."""

    title: str = Field(default="ChatCraft AI", max_length=200)
    message: str = Field(default="You have a new notification", max_length=1000)
    url: str = Field(default="/dashboard", max_length=2000)
