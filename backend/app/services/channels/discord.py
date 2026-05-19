import httpx

from app.services.channels.base import ChannelSender

DISCORD_API = "https://discord.com/api/v10"


class DiscordSender(ChannelSender):
    """Send messages via Discord Bot API."""

    async def send(self, recipient_id: str, text: str) -> None:
        token = self.config.get("bot_token", "")
        channel_id = recipient_id
        url = f"{DISCORD_API}/channels/{channel_id}/messages"
        headers = {"Authorization": f"Bot {token}", "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(url, json={"content": text}, headers=headers)
            r.raise_for_status()

    async def get_me(self) -> dict:
        token = self.config.get("bot_token", "")
        url = f"{DISCORD_API}/users/@me"
        headers = {"Authorization": f"Bot {token}"}
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url, headers=headers)
            r.raise_for_status()
            return r.json()
