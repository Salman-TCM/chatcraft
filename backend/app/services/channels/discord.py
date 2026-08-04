"""
Discord Bot API sender.

Rich payload shapes for send_rich():
  text    — { "type": "text", "content": "..." }
  embed   — { "type": "embed", "title": "...", "description": "...", "color": 0x5865F2,
               "fields": [{"name":"...","value":"...","inline":false}],
               "footer": {"text":"..."}, "thumbnail": {"url":"..."}, "image": {"url":"..."} }
  buttons — { "type": "buttons", "content": "...",
               "buttons": [{"label":"..","custom_id":"..","style":1}] }
"""

import httpx

from app.services.channels.base import ChannelSender

DISCORD_API = "https://discord.com/api/v10"


class DiscordSender(ChannelSender):
    """Send messages via Discord Bot API."""

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bot {self.config.get('bot_token', '')}",
            "Content-Type": "application/json",
        }

    async def send(self, recipient_id: str, text: str) -> None:
        channel_id = recipient_id
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                f"{DISCORD_API}/channels/{channel_id}/messages",
                json={"content": text},
                headers=self._headers(),
            )
            r.raise_for_status()

    async def send_rich(self, recipient_id: str, payload: dict) -> None:
        channel_id = recipient_id
        msg_type = payload.get("type", "text")
        body: dict = {}

        if msg_type == "text":
            body = {"content": payload.get("content", "")}

        elif msg_type == "embed":
            embed: dict = {}
            for field in ("title", "description", "color", "url", "timestamp"):
                if field in payload:
                    embed[field] = payload[field]
            for field in ("footer", "thumbnail", "image", "author"):
                if field in payload:
                    embed[field] = payload[field]
            if "fields" in payload:
                embed["fields"] = payload["fields"]
            body = {
                "content": payload.get("content", "") or None,
                "embeds": [embed],
            }

        elif msg_type == "buttons":
            buttons = payload.get("buttons", [])[:5]
            components = [
                {
                    "type": 1,  # action row
                    "components": [
                        {
                            "type": 2,  # button
                            "label": b.get("label", "")[:80],
                            "custom_id": b.get("custom_id", b.get("label", ""))[:100],
                            "style": b.get("style", 1),
                        }
                        for b in buttons
                    ],
                }
            ]
            body = {
                "content": payload.get("content") or None,
                "components": components,
            }

        else:
            await self.send(channel_id, payload.get("content") or payload.get("text") or "")
            return

        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                f"{DISCORD_API}/channels/{channel_id}/messages",
                json=body,
                headers=self._headers(),
            )
            r.raise_for_status()

    # ── Role management ────────────────────────────────────────────────────────

    async def add_role(self, guild_id: str, user_id: str, role_id: str) -> None:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.put(
                f"{DISCORD_API}/guilds/{guild_id}/members/{user_id}/roles/{role_id}",
                headers=self._headers(),
            )
            r.raise_for_status()

    async def remove_role(self, guild_id: str, user_id: str, role_id: str) -> None:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.delete(
                f"{DISCORD_API}/guilds/{guild_id}/members/{user_id}/roles/{role_id}",
                headers=self._headers(),
            )
            r.raise_for_status()

    async def get_guild_roles(self, guild_id: str) -> list[dict]:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                f"{DISCORD_API}/guilds/{guild_id}/roles",
                headers=self._headers(),
            )
            r.raise_for_status()
            return r.json()

    # ── Info ───────────────────────────────────────────────────────────────────

    async def get_me(self) -> dict:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{DISCORD_API}/users/@me", headers=self._headers())
            r.raise_for_status()
            return r.json()
