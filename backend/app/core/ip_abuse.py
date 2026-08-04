"""
IP-based abuse detection middleware.
Tracks requests per IP per hour using Redis.
Returns 429 when an IP exceeds 500 requests/hour.
Health check paths are excluded.
"""

import time

from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

_HOURLY_LIMIT = 500
_WINDOW_SECONDS = 3600
_SKIP_PREFIXES = ("/health",)


class IPAbuseMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        if any(path.startswith(p) for p in _SKIP_PREFIXES):
            return await call_next(request)

        redis = getattr(request.app.state, "redis", None)
        if redis is None:
            return await call_next(request)

        ip = _client_ip(request)
        hour = int(time.time() // _WINDOW_SECONDS)
        key = f"ip_rate:{ip}:{hour}"

        try:
            count = await redis.incr(key)
            if count == 1:
                await redis.expire(key, _WINDOW_SECONDS + 60)
            if count > _HOURLY_LIMIT:
                return JSONResponse(
                    status_code=429,
                    content={
                        "success": False,
                        "error": "Too many requests from this IP address",
                        "code": "IP_RATE_LIMITED",
                    },
                )
        except Exception:
            # Redis unavailable — fail open, never block legitimate traffic
            pass

        return await call_next(request)


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"
