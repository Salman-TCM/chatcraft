import time

from loguru import logger
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.request_id import get_request_id

_SKIP_PATHS = {"/health/live", "/health/ready"}


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log every HTTP request with method, path, status, duration, and correlation ID."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.url.path in _SKIP_PATHS:
            return await call_next(request)

        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000, 1)

        logger.bind(
            request_id=get_request_id(),
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            duration_ms=duration_ms,
        ).info(f"{request.method} {request.url.path} {response.status_code} {duration_ms}ms")

        return response
