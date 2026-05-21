"""
Twilio SMS/MMS sender.

Rich payload shapes for send_rich():
  text  — { "type": "text", "body": "..." }
  mms   — { "type": "mms", "body": "...", "media_url": "https://..." }
"""
import base64

import httpx

from app.services.channels.base import ChannelSender

_TWILIO_API = "https://api.twilio.com/2010-04-01"


class SMSSender(ChannelSender):
    """Send SMS/MMS messages via Twilio REST API."""

    def _creds(self) -> tuple[str, str, str]:
        return (
            self.config.get("account_sid", ""),
            self.config.get("auth_token", ""),
            self.config.get("from_number", ""),
        )

    async def send(self, recipient_id: str, text: str) -> None:
        account_sid, auth_token, from_number = self._creds()
        credentials = base64.b64encode(f"{account_sid}:{auth_token}".encode()).decode()
        url = f"{_TWILIO_API}/Accounts/{account_sid}/Messages.json"
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                url,
                data={"From": from_number, "To": recipient_id, "Body": text},
                headers={"Authorization": f"Basic {credentials}"},
            )
            r.raise_for_status()

    async def send_rich(self, recipient_id: str, payload: dict) -> None:
        msg_type = payload.get("type", "text")
        account_sid, auth_token, from_number = self._creds()
        credentials = base64.b64encode(f"{account_sid}:{auth_token}".encode()).decode()
        url = f"{_TWILIO_API}/Accounts/{account_sid}/Messages.json"

        data: dict = {
            "From": from_number,
            "To": recipient_id,
            "Body": payload.get("body") or payload.get("text", ""),
        }

        if msg_type == "mms" and payload.get("media_url"):
            data["MediaUrl"] = payload["media_url"]

        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                url,
                data=data,
                headers={"Authorization": f"Basic {credentials}"},
            )
            r.raise_for_status()
