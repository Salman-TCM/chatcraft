from collections.abc import AsyncGenerator
from functools import lru_cache

import redis as sync_redis
import redis.asyncio as aioredis

from app.core.config import settings

# ---------------------------------------------------------------------------
# Async client — used by FastAPI route handlers
# ---------------------------------------------------------------------------


@lru_cache(maxsize=1)
def _get_async_pool() -> aioredis.ConnectionPool:
    """
    Single connection pool shared across the process lifetime.
    Upstash requires TLS (rediss://); local dev uses plain redis://.
    decode_responses=True returns str instead of bytes everywhere.
    """
    return aioredis.ConnectionPool.from_url(
        settings.redis_url,
        decode_responses=True,
        max_connections=20,
    )


def get_async_redis() -> aioredis.Redis:
    """Return a Redis client backed by the shared async pool."""
    return aioredis.Redis(connection_pool=_get_async_pool())


async def redis_dependency() -> AsyncGenerator[aioredis.Redis, None]:
    """
    FastAPI dependency — yields an async Redis client.

    Usage:
        @router.get("/example")
        async def example(redis: aioredis.Redis = Depends(redis_dependency)):
            ...
    """
    client = get_async_redis()
    try:
        yield client
    finally:
        await client.aclose()


# ---------------------------------------------------------------------------
# Sync client — used by Celery workers (cannot use async)
# ---------------------------------------------------------------------------


@lru_cache(maxsize=1)
def get_sync_redis() -> sync_redis.Redis:
    """Return a synchronous Redis client for Celery tasks."""
    return sync_redis.from_url(
        settings.redis_url,
        decode_responses=True,
    )


# ---------------------------------------------------------------------------
# Health check helper
# ---------------------------------------------------------------------------


async def ping_redis() -> bool:
    """Return True if Redis responds to PING."""
    try:
        client = get_async_redis()
        await client.ping()
        return True
    except Exception:
        return False
