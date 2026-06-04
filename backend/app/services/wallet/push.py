"""
Wallet push notification helpers.

Apple Wallet passes use certificate-based APNs auth (not JWT).
The push payload is empty {} to signal the device to fetch the updated pass.
"""
import os
import ssl
import tempfile

import httpx

from app.core.config import settings


async def send_wallet_apns(push_token: str, pass_type_id: str, cert_pem: str, key_pem: str) -> None:
    """Send an empty APNs push to wake up Apple Wallet and trigger a pass update."""
    if not all([push_token, pass_type_id, cert_pem, key_pem]):
        return
    try:
        # Write PEM cert/key to temp files (ssl.SSLContext requires file paths)
        with tempfile.NamedTemporaryFile(suffix=".pem", delete=False) as cf, \
             tempfile.NamedTemporaryFile(suffix=".pem", delete=False) as kf:
            cf.write(cert_pem.encode())
            kf.write(key_pem.encode())
            cf_name, kf_name = cf.name, kf.name

        ctx = ssl.create_default_context()
        ctx.load_cert_chain(cf_name, kf_name)
        os.unlink(cf_name)
        os.unlink(kf_name)

        async with httpx.AsyncClient(http2=True, verify=ctx) as client:
            await client.post(
                f"https://api.push.apple.com/3/device/{push_token}",
                content=b"{}",
                headers={
                    "apns-topic": pass_type_id,
                    "apns-push-type": "background",
                    "content-type": "application/json",
                },
            )
    except Exception:
        pass


async def send_alert_apns(push_token: str, message: str) -> None:
    """Send a JWT-authenticated alert APNs push (for app notifications)."""
    try:
        import json
        import time
        import jwt as pyjwt

        headers_jwt = {
            "alg": "ES256",
            "kid": settings.apple_push_key_id,
        }
        claims = {"iss": settings.apple_team_identifier, "iat": int(time.time())}
        token = pyjwt.encode(claims, settings.apple_push_key_pem, algorithm="ES256", headers=headers_jwt)

        payload = json.dumps({"aps": {"alert": message, "sound": "default"}}).encode()
        async with httpx.AsyncClient(http2=True) as client:
            await client.post(
                f"https://api.push.apple.com/3/device/{push_token}",
                content=payload,
                headers={
                    "authorization": f"bearer {token}",
                    "apns-topic": settings.apple_pass_type_identifier,
                    "apns-push-type": "alert",
                    "content-type": "application/json",
                },
            )
    except Exception:
        pass
