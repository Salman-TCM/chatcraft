import httpx

from app.services.channels.base import ChannelSender


class TelegramSender(ChannelSender):
    """Send messages via Telegram Bot API."""

    async def send(self, recipient_id: str, text: str) -> None:
        token = self.config.get("bot_token", "")
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(url, json={"chat_id": recipient_id, "text": text, "parse_mode": "HTML"})
            r.raise_for_status()

    async def set_webhook(self, webhook_url: str) -> dict:
        token = self.config.get("bot_token", "")
        url = f"https://api.telegram.org/bot{token}/setWebhook"
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(url, json={"url": webhook_url})
            r.raise_for_status()
            return r.json()

    async def delete_webhook(self) -> dict:
        token = self.config.get("bot_token", "")
        url = f"https://api.telegram.org/bot{token}/deleteWebhook"
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(url)
            r.raise_for_status()
            return r.json()

    async def get_me(self) -> dict:
        token = self.config.get("bot_token", "")
        url = f"https://api.telegram.org/bot{token}/getMe"
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url)
            r.raise_for_status()
            return r.json()
