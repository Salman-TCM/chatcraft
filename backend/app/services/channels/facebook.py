"""
Facebook Messenger Send API sender.

Rich payload shapes supported in send_rich():
  text           — { "type": "text", "text": "..." }
  image          — { "type": "image", "url": "..." }
  video          — { "type": "video", "url": "..." }
  audio          — { "type": "audio", "url": "..." }
  file           — { "type": "file", "url": "..." }
  quick_replies  — { "type": "quick_replies", "text": "...", "options": ["A", "B", ...] }
  buttons        — { "type": "buttons", "text": "...", "buttons": [{"type":"postback","title":"..","payload":".."}] }
  generic        — { "type": "generic", "elements": [{title,subtitle,image_url,buttons:[...]}] }
"""

from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from app.services.channels.base import ChannelSender

_GRAPH_API = "https://graph.facebook.com/v19.0"
_ME = f"{_GRAPH_API}/me"
_MESSAGING_WINDOW_HOURS = 24


class FacebookSender(ChannelSender):
    """Send messages via Facebook Messenger (Send API)."""

    def _token(self) -> str:
        return self.config.get("page_access_token", "")

    async def send(self, recipient_id: str, text: str) -> None:
        payload = {
            "recipient": {"id": recipient_id},
            "message": {"text": text},
        }
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                f"{_ME}/messages",
                json=payload,
                params={"access_token": self._token()},
            )
            r.raise_for_status()

    async def send_rich(self, recipient_id: str, payload: dict) -> None:
        msg_type = payload.get("type", "text")

        if msg_type == "text":
            await self.send(recipient_id, payload.get("text", ""))
            return

        message: dict[str, Any] = {}

        if msg_type in ("image", "video", "audio", "file"):
            message = {
                "attachment": {
                    "type": msg_type,
                    "payload": {"url": payload["url"], "is_reusable": True},
                }
            }

        elif msg_type == "quick_replies":
            options = payload.get("options", [])
            qrs = [
                {"content_type": "text", "title": str(opt)[:20], "payload": str(opt)}
                for opt in options[:13]
            ]
            message = {"text": payload.get("text", ""), "quick_replies": qrs}

        elif msg_type == "buttons":
            buttons = payload.get("buttons", [])[:3]
            message = {
                "attachment": {
                    "type": "template",
                    "payload": {
                        "template_type": "button",
                        "text": payload.get("text", "")[:640],
                        "buttons": buttons,
                    },
                }
            }

        elif msg_type == "generic":
            elements = payload.get("elements", [])[:10]
            message = {
                "attachment": {
                    "type": "template",
                    "payload": {
                        "template_type": "generic",
                        "elements": elements,
                    },
                }
            }

        else:
            await self.send(recipient_id, payload.get("text") or payload.get("body") or "")
            return

        body = {"recipient": {"id": recipient_id}, "message": message}
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                f"{_ME}/messages",
                json=body,
                params={"access_token": self._token()},
            )
            r.raise_for_status()

    # ── 24-hour window check ───────────────────────────────────────────────────

    def is_within_window(self, last_user_message_at: datetime | None) -> bool:
        """Return True if we're still within the 24-hour messaging window."""
        if last_user_message_at is None:
            return False
        cutoff = datetime.now(UTC) - timedelta(hours=_MESSAGING_WINDOW_HOURS)
        ts = last_user_message_at
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=UTC)
        return ts >= cutoff

    # ── Persistent menu ────────────────────────────────────────────────────────

    async def set_persistent_menu(self, menu_items: list[dict]) -> dict:
        """
        Set the persistent menu via the Messenger Profile API.
        menu_items: list of {"type":"postback"|"web_url", "title":"...", "payload"|"url":"..."}
        """
        body = {
            "persistent_menu": [
                {
                    "locale": "default",
                    "composer_input_disabled": False,
                    "call_to_actions": menu_items[:5],
                }
            ]
        }
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                f"{_ME}/messenger_profile",
                json=body,
                params={"access_token": self._token()},
            )
            r.raise_for_status()
            return r.json()

    async def delete_persistent_menu(self) -> dict:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.delete(
                f"{_ME}/messenger_profile",
                json={"fields": ["persistent_menu"]},
                params={"access_token": self._token()},
            )
            r.raise_for_status()
            return r.json()

    async def get_persistent_menu(self) -> dict:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{_ME}/messenger_profile",
                params={"fields": "persistent_menu", "access_token": self._token()},
            )
            r.raise_for_status()
            return r.json()
