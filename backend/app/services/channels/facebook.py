import httpx

from app.services.channels.base import ChannelSender

_GRAPH_API = "https://graph.facebook.com/v19.0"


class FacebookSender(ChannelSender):
    """Send messages via Facebook Messenger (Send API)."""

    async def send(self, recipient_id: str, text: str) -> None:
        page_access_token = self.config.get("page_access_token", "")
        url = f"{_GRAPH_API}/me/messages"
        payload = {
            "recipient": {"id": recipient_id},
            "message": {"text": text},
        }
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                url,
                json=payload,
                params={"access_token": page_access_token},
            )
            r.raise_for_status()
