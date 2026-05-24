"""
TikTok Business API sender — sends DMs via TikTok Direct Messages API.

Config fields:
  access_token   — TikTok app access token (from OAuth 2.0 PKCE flow)
  open_id        — TikTok user open_id (the authenticated business account)
"""
import httpx

from app.services.channels.base import ChannelSender

_API_BASE = "https://open.tiktokapis.com/v2"


class TikTokSender(ChannelSender):
    """Send direct messages via TikTok Business API."""

    async def send(self, recipient_id: str, text: str) -> None:
        """Send a text DM to a TikTok user (recipient_id is the user's open_id)."""
        access_token = self.config.get("access_token", "")
        if not access_token:
            return
        payload = {
            "conversation_type": "direct",
            "receiver_id": recipient_id,
            "message": {"type": "TEXT", "content": {"text": text}},
        }
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                f"{_API_BASE}/dm/conversation/message/send/",
                json=payload,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json; charset=UTF-8",
                },
            )
            r.raise_for_status()

    async def send_rich(self, recipient_id: str, payload: dict) -> None:
        text = payload.get("text", payload.get("body", ""))
        await self.send(recipient_id, text)
