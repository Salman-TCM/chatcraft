import httpx

from app.services.channels.base import ChannelSender

_GRAPH_API = "https://graph.facebook.com/v19.0"


class WhatsAppSender(ChannelSender):
    """Send messages via WhatsApp Cloud API (Meta Graph API)."""

    async def send(self, recipient_id: str, text: str) -> None:
        phone_number_id = self.config.get("phone_number_id", "")
        access_token = self.config.get("access_token", "")
        url = f"{_GRAPH_API}/{phone_number_id}/messages"
        payload = {
            "messaging_product": "whatsapp",
            "to": recipient_id,
            "type": "text",
            "text": {"body": text},
        }
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                url,
                json=payload,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            r.raise_for_status()
