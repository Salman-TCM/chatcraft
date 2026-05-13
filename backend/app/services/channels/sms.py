import base64

import httpx

from app.services.channels.base import ChannelSender

_TWILIO_API = "https://api.twilio.com/2010-04-01"


class SMSSender(ChannelSender):
    """Send SMS messages via Twilio REST API."""

    async def send(self, recipient_id: str, text: str) -> None:
        account_sid = self.config.get("account_sid", "")
        auth_token = self.config.get("auth_token", "")
        from_number = self.config.get("from_number", "")

        credentials = base64.b64encode(f"{account_sid}:{auth_token}".encode()).decode()
        url = f"{_TWILIO_API}/Accounts/{account_sid}/Messages.json"

        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                url,
                data={"From": from_number, "To": recipient_id, "Body": text},
                headers={"Authorization": f"Basic {credentials}"},
            )
            r.raise_for_status()
