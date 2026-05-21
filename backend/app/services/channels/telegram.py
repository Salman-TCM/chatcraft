"""
Telegram Bot API sender.

Rich payload shapes for send_rich():
  text          — { "type": "text", "text": "...", "parse_mode": "HTML" }
  photo         — { "type": "photo", "url": "...", "caption": "..." }
  document      — { "type": "document", "url": "...", "caption": "..." }
  audio         — { "type": "audio", "url": "...", "caption": "..." }
  video         — { "type": "video", "url": "...", "caption": "..." }
  inline_keyboard — { "type": "inline_keyboard", "text": "...",
                       "keyboard": [[{"text":"A","callback_data":"A"},...],...] }
  reply_keyboard  — { "type": "reply_keyboard", "text": "...",
                       "keyboard": [["A","B"],["C"]] }
"""
import httpx

from app.services.channels.base import ChannelSender


class TelegramSender(ChannelSender):
    """Send messages via Telegram Bot API."""

    def _api(self, method: str) -> str:
        token = self.config.get("bot_token", "")
        return f"https://api.telegram.org/bot{token}/{method}"

    async def send(self, recipient_id: str, text: str) -> None:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                self._api("sendMessage"),
                json={"chat_id": recipient_id, "text": text, "parse_mode": "HTML"},
            )
            r.raise_for_status()

    async def send_rich(self, recipient_id: str, payload: dict) -> None:
        msg_type = payload.get("type", "text")
        chat_id = recipient_id

        async with httpx.AsyncClient(timeout=10) as client:
            if msg_type == "text":
                r = await client.post(
                    self._api("sendMessage"),
                    json={
                        "chat_id": chat_id,
                        "text": payload.get("text", ""),
                        "parse_mode": payload.get("parse_mode", "HTML"),
                    },
                )

            elif msg_type == "photo":
                r = await client.post(
                    self._api("sendPhoto"),
                    json={
                        "chat_id": chat_id,
                        "photo": payload["url"],
                        "caption": payload.get("caption", ""),
                        "parse_mode": "HTML",
                    },
                )

            elif msg_type == "document":
                r = await client.post(
                    self._api("sendDocument"),
                    json={
                        "chat_id": chat_id,
                        "document": payload["url"],
                        "caption": payload.get("caption", ""),
                        "parse_mode": "HTML",
                    },
                )

            elif msg_type == "audio":
                r = await client.post(
                    self._api("sendAudio"),
                    json={
                        "chat_id": chat_id,
                        "audio": payload["url"],
                        "caption": payload.get("caption", ""),
                    },
                )

            elif msg_type == "video":
                r = await client.post(
                    self._api("sendVideo"),
                    json={
                        "chat_id": chat_id,
                        "video": payload["url"],
                        "caption": payload.get("caption", ""),
                        "parse_mode": "HTML",
                    },
                )

            elif msg_type == "inline_keyboard":
                keyboard = payload.get("keyboard", [])
                formatted = [
                    [
                        btn if isinstance(btn, dict) else {"text": btn, "callback_data": btn}
                        for btn in row
                    ]
                    for row in keyboard
                ]
                r = await client.post(
                    self._api("sendMessage"),
                    json={
                        "chat_id": chat_id,
                        "text": payload.get("text", ""),
                        "parse_mode": "HTML",
                        "reply_markup": {"inline_keyboard": formatted},
                    },
                )

            elif msg_type == "reply_keyboard":
                rows = payload.get("keyboard", [])
                formatted_rows = [
                    [btn if isinstance(btn, dict) else {"text": btn} for btn in row]
                    for row in rows
                ]
                r = await client.post(
                    self._api("sendMessage"),
                    json={
                        "chat_id": chat_id,
                        "text": payload.get("text", ""),
                        "parse_mode": "HTML",
                        "reply_markup": {
                            "keyboard": formatted_rows,
                            "resize_keyboard": True,
                            "one_time_keyboard": payload.get("one_time", False),
                        },
                    },
                )

            else:
                await self.send(chat_id, payload.get("text") or payload.get("body") or "")
                return

            r.raise_for_status()

    # ── Bot Commands ───────────────────────────────────────────────────────────

    async def set_commands(self, commands: list[dict]) -> dict:
        """
        Set bot commands visible in the / menu.
        commands: [{"command": "start", "description": "Start the bot"}]
        """
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                self._api("setMyCommands"),
                json={"commands": commands},
            )
            r.raise_for_status()
            return r.json()

    async def delete_commands(self) -> dict:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(self._api("deleteMyCommands"))
            r.raise_for_status()
            return r.json()

    async def get_commands(self) -> list[dict]:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(self._api("getMyCommands"))
            r.raise_for_status()
            return r.json().get("result", [])

    # ── Webhook / Info ─────────────────────────────────────────────────────────

    async def set_webhook(self, webhook_url: str) -> dict:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(self._api("setWebhook"), json={"url": webhook_url})
            r.raise_for_status()
            return r.json()

    async def delete_webhook(self) -> dict:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(self._api("deleteWebhook"))
            r.raise_for_status()
            return r.json()

    async def get_me(self) -> dict:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(self._api("getMe"))
            r.raise_for_status()
            return r.json()
