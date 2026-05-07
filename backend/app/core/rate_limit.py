"""
Rate limiting via slowapi.

Limits are tiered by role so authenticated users get progressively
higher quotas. Unauthenticated requests are keyed by IP and capped at
the free-tier limit.

Per-minute limits by role:
    anonymous / free  —  30 rpm
    trial             —  60 rpm
    premium           — 200 rpm
    creator           — 300 rpm
    admin             — unlimited (10 000 rpm sentinel)
"""
from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

from app.core.security import decode_token

_ROLE_LIMITS: dict[str, str] = {
    "free": "30/minute",
    "trial": "60/minute",
    "premium": "200/minute",
    "creator": "300/minute",
    "admin": "10000/minute",
}

_DEFAULT_LIMIT = "30/minute"


def _rate_limit_key(request: Request) -> str:
    """
    Return a string key used to bucket requests.

    Authenticated requests → "user:<id>:<role>" so each user has their
    own counter and the role is available for dynamic limit selection.
    Unauthenticated requests → client IP address.
    """
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        try:
            payload = decode_token(token)
            user_id = payload.get("sub", "")
            role = payload.get("role", "free")
            if user_id:
                return f"user:{user_id}:{role}"
        except Exception:
            pass
    return get_remote_address(request)


def _limit_for_request(request: Request) -> str:
    """Derive the rate limit string from the key embedded in the request."""
    key = _rate_limit_key(request)
    if key.startswith("user:"):
        role = key.split(":")[-1]
        return _ROLE_LIMITS.get(role, _DEFAULT_LIMIT)
    return _DEFAULT_LIMIT


from app.core.config import settings as _settings

limiter = Limiter(
    key_func=_rate_limit_key,
    default_limits=[_DEFAULT_LIMIT],
    storage_uri=_settings.redis_url,
)

# Per-role limit strings — use these directly in @limiter.limit() decorators
# when you need to override the default on a specific endpoint.
LIMIT_FREE = _ROLE_LIMITS["free"]
LIMIT_TRIAL = _ROLE_LIMITS["trial"]
LIMIT_PREMIUM = _ROLE_LIMITS["premium"]
LIMIT_CREATOR = _ROLE_LIMITS["creator"]
LIMIT_ADMIN = _ROLE_LIMITS["admin"]
