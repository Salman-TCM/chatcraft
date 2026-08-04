"""
WhatsApp Cloud API sender.

Rich payload shapes supported in send_rich():
  text       — { "type": "text", "body": "..." }
  image      — { "type": "image", "url": "...", "caption": "..." }
  document   — { "type": "document", "url": "...", "filename": "...", "caption": "..." }
  audio      — { "type": "audio", "url": "..." }
  video      — { "type": "video", "url": "...", "caption": "..." }
  buttons    — { "type": "interactive_buttons", "body": "...", "buttons": [{"id":"..","title":".."}] }
  list       — { "type": "interactive_list", "body": "...", "button": "View options",
                  "sections": [{"title":"..","rows":[{"id":"..","title":"..","description":".."}]}] }
  template   — { "type": "template", "name": "...", "language": "en_US", "components": [...] }
"""

import httpx

from app.services.channels.base import ChannelSender

_GRAPH_API = "https://graph.facebook.com/v19.0"


class WhatsAppSender(ChannelSender):
    """Send messages via WhatsApp Cloud API (Meta Graph API)."""

    def _url(self) -> str:
        phone_number_id = self.config.get("phone_number_id", "")
        return f"{_GRAPH_API}/{phone_number_id}/messages"

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.config.get('access_token', '')}"}

    async def send(self, recipient_id: str, text: str) -> None:
        payload = {
            "messaging_product": "whatsapp",
            "to": recipient_id,
            "type": "text",
            "text": {"body": text, "preview_url": False},
        }
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(self._url(), json=payload, headers=self._headers())
            r.raise_for_status()

    async def send_rich(self, recipient_id: str, payload: dict) -> None:
        msg_type = payload.get("type", "text")

        if msg_type == "text":
            await self.send(recipient_id, payload.get("body", ""))
            return

        body: dict = {"messaging_product": "whatsapp", "to": recipient_id}

        if msg_type == "image":
            body["type"] = "image"
            img: dict = {"link": payload["url"]}
            if payload.get("caption"):
                img["caption"] = payload["caption"]
            body["image"] = img

        elif msg_type == "document":
            body["type"] = "document"
            doc: dict = {"link": payload["url"]}
            if payload.get("filename"):
                doc["filename"] = payload["filename"]
            if payload.get("caption"):
                doc["caption"] = payload["caption"]
            body["document"] = doc

        elif msg_type == "audio":
            body["type"] = "audio"
            body["audio"] = {"link": payload["url"]}

        elif msg_type == "video":
            body["type"] = "video"
            vid: dict = {"link": payload["url"]}
            if payload.get("caption"):
                vid["caption"] = payload["caption"]
            body["video"] = vid

        elif msg_type == "interactive_buttons":
            body["type"] = "interactive"
            buttons = [
                {"type": "reply", "reply": {"id": b.get("id", str(i)), "title": b["title"][:20]}}
                for i, b in enumerate(payload.get("buttons", []))
            ]
            body["interactive"] = {
                "type": "button",
                "body": {"text": payload.get("body", "")},
                "action": {"buttons": buttons[:3]},
            }
            if payload.get("header"):
                body["interactive"]["header"] = {"type": "text", "text": payload["header"][:60]}
            if payload.get("footer"):
                body["interactive"]["footer"] = {"text": payload["footer"][:60]}

        elif msg_type == "interactive_list":
            body["type"] = "interactive"
            body["interactive"] = {
                "type": "list",
                "body": {"text": payload.get("body", "")},
                "action": {
                    "button": payload.get("button", "View options")[:20],
                    "sections": payload.get("sections", []),
                },
            }
            if payload.get("header"):
                body["interactive"]["header"] = {"type": "text", "text": payload["header"][:60]}
            if payload.get("footer"):
                body["interactive"]["footer"] = {"text": payload["footer"][:60]}

        elif msg_type == "template":
            body["type"] = "template"
            body["template"] = {
                "name": payload["name"],
                "language": {"code": payload.get("language", "en_US")},
                "components": payload.get("components", []),
            }

        else:
            await self.send(recipient_id, payload.get("body") or payload.get("text") or "")
            return

        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(self._url(), json=body, headers=self._headers())
            r.raise_for_status()

    # ── Template Management ────────────────────────────────────────────────────

    async def list_templates(self) -> list[dict]:
        """Fetch approved message templates from the WABA."""
        waba_id = self.config.get("waba_id", "")
        if not waba_id:
            return []
        url = f"{_GRAPH_API}/{waba_id}/message_templates"
        params = {"fields": "name,status,language,category,components", "limit": 250}
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(url, params=params, headers=self._headers())
            r.raise_for_status()
            return r.json().get("data", [])

    async def create_template(self, template: dict) -> dict:
        """Create a new message template in the WABA."""
        waba_id = self.config.get("waba_id", "")
        url = f"{_GRAPH_API}/{waba_id}/message_templates"
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(url, json=template, headers=self._headers())
            r.raise_for_status()
            return r.json()

    async def delete_template(self, template_name: str) -> None:
        waba_id = self.config.get("waba_id", "")
        url = f"{_GRAPH_API}/{waba_id}/message_templates"
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.delete(url, params={"name": template_name}, headers=self._headers())
            r.raise_for_status()
