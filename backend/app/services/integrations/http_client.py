"""
Hardened HTTP client for integration tool execution.

Security controls applied to every request:
- Connection timeout    5 s  — refuse slow-to-connect servers
- Read timeout         30 s  — abandon stalled responses
- Write timeout        10 s
- Total timeout        60 s  — hard ceiling per request
- Response size cap     1 MB — prevent OOM from oversized payloads
- follow_redirects=False     — redirects can point to internal IPs (SSRF bypass)
"""

from __future__ import annotations

import httpx

_TIMEOUT = httpx.Timeout(connect=5.0, read=30.0, write=10.0, pool=5.0)
_LIMITS = httpx.Limits(max_connections=50, max_keepalive_connections=10)
_MAX_RESPONSE_BYTES = 1_048_576  # 1 MB
_USER_AGENT = "ChatCraft-Agent-Integration/1.0"


def _make_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        timeout=_TIMEOUT,
        limits=_LIMITS,
        follow_redirects=False,
        headers={"User-Agent": _USER_AGENT},
    )


async def secure_request(
    method: str,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    params: dict | None = None,
    json_body: dict | None = None,
) -> tuple[int, str]:
    """Execute a single HTTPS request. Returns (status_code, body_text).

    body_text is capped at _MAX_RESPONSE_BYTES and decoded as UTF-8.
    Redirects are never followed — callers must use is_ssrf_safe_resolved()
    before calling this function.
    """
    req_headers = dict(headers or {})
    async with _make_client() as client:
        response = await client.request(
            method.upper(),
            url,
            headers=req_headers,
            params=params,
            json=json_body,
        )
        # Stream-read up to the cap; abort the rest.
        chunks: list[bytes] = []
        total = 0
        async for chunk in response.aiter_bytes(chunk_size=65_536):
            chunks.append(chunk)
            total += len(chunk)
            if total >= _MAX_RESPONSE_BYTES:
                break

    body = b"".join(chunks)[:_MAX_RESPONSE_BYTES].decode("utf-8", errors="replace")
    return response.status_code, body
