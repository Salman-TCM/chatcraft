"""
Twitter/X sender — posts tweet replies via Twitter API v2 with OAuth 1.0a.

Config fields:
  api_key, api_secret       — Twitter app credentials (Consumer keys)
  access_token, access_secret — User-context OAuth 1.0a tokens
  bearer_token              — App-only Bearer token (for read operations)
"""

import base64
import hashlib
import hmac
import time
import urllib.parse
import uuid as _uuid

import httpx

from app.services.channels.base import ChannelSender

_API_BASE = "https://api.twitter.com/2"


def _oauth1_header(
    method: str,
    url: str,
    api_key: str,
    api_secret: str,
    access_token: str,
    access_secret: str,
    extra_params: dict | None = None,
) -> str:
    """Build OAuth 1.0a Authorization header for Twitter API v2."""
    nonce = _uuid.uuid4().hex
    timestamp = str(int(time.time()))
    oauth_params = {
        "oauth_consumer_key": api_key,
        "oauth_nonce": nonce,
        "oauth_signature_method": "HMAC-SHA1",
        "oauth_timestamp": timestamp,
        "oauth_token": access_token,
        "oauth_version": "1.0",
    }
    # Combine with any extra body/query params for signature base
    all_params = dict(oauth_params)
    if extra_params:
        all_params.update(extra_params)
    sorted_params = "&".join(
        f"{urllib.parse.quote(k, safe='')}={urllib.parse.quote(str(v), safe='')}"
        for k, v in sorted(all_params.items())
    )
    base_string = "&".join(
        [
            method.upper(),
            urllib.parse.quote(url, safe=""),
            urllib.parse.quote(sorted_params, safe=""),
        ]
    )
    signing_key = (
        f"{urllib.parse.quote(api_secret, safe='')}&{urllib.parse.quote(access_secret, safe='')}"
    )
    signature = base64.b64encode(
        hmac.new(signing_key.encode(), base_string.encode(), hashlib.sha1).digest()
    ).decode()
    oauth_params["oauth_signature"] = signature
    header_value = "OAuth " + ", ".join(
        f'{urllib.parse.quote(k, safe="")}="{urllib.parse.quote(str(v), safe="")}"'
        for k, v in sorted(oauth_params.items())
    )
    return header_value


class TwitterSender(ChannelSender):
    """Send tweet replies and DMs via Twitter API v2."""

    def _oauth_headers(self, method: str, url: str) -> dict:
        api_key = self.config.get("api_key", "")
        api_secret = self.config.get("api_secret", "")
        access_token = self.config.get("access_token", "")
        access_secret = self.config.get("access_secret", "")
        return {
            "Authorization": _oauth1_header(
                method, url, api_key, api_secret, access_token, access_secret
            ),
            "Content-Type": "application/json",
        }

    async def send(self, recipient_id: str, text: str) -> None:
        """Reply to a tweet (recipient_id is the tweet ID to reply to)."""
        url = f"{_API_BASE}/tweets"
        payload: dict = {"text": text}
        if recipient_id:
            payload["reply"] = {"in_reply_to_tweet_id": recipient_id}
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(url, json=payload, headers=self._oauth_headers("POST", url))
            r.raise_for_status()

    async def send_dm(self, participant_id: str, text: str) -> None:
        """Send a direct message to a Twitter user."""
        url = f"{_API_BASE}/dm_conversations/with/{participant_id}/messages"
        payload = {"text": text}
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(url, json=payload, headers=self._oauth_headers("POST", url))
            r.raise_for_status()

    async def send_rich(self, recipient_id: str, payload: dict) -> None:
        text = payload.get("text", payload.get("body", ""))
        await self.send(recipient_id, text)
