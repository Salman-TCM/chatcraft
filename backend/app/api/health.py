import time
from typing import Any

import redis.asyncio as aioredis
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import settings

router = APIRouter(tags=["health"])


async def _check_postgres() -> dict[str, Any]:
    start = time.monotonic()
    try:
        engine = create_async_engine(settings.database_url, pool_pre_ping=True)
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        await engine.dispose()
        return {"status": "healthy", "latency_ms": round((time.monotonic() - start) * 1000, 2)}
    except Exception as exc:
        return {"status": "unhealthy", "error": str(exc)}


async def _check_redis() -> dict[str, Any]:
    start = time.monotonic()
    try:
        client = aioredis.from_url(settings.redis_url, socket_connect_timeout=3)
        await client.ping()
        await client.aclose()
        return {"status": "healthy", "latency_ms": round((time.monotonic() - start) * 1000, 2)}
    except Exception as exc:
        return {"status": "unhealthy", "error": str(exc)}


@router.get("/health")
async def health_check() -> JSONResponse:
    """
    Deep health check — verifies live connectivity to all dependencies.
    Returns 200 if all healthy, 503 if any dependency is down.
    """
    postgres = await _check_postgres()
    redis = await _check_redis()

    all_healthy = all(
        dep["status"] == "healthy" for dep in [postgres, redis]
    )

    payload = {
        "status": "healthy" if all_healthy else "degraded",
        "service": "chatcraft-api",
        "version": "0.1.0",
        "dependencies": {
            "postgres": postgres,
            "redis": redis,
        },
    }

    return JSONResponse(
        content=payload,
        status_code=200 if all_healthy else 503,
    )


@router.get("/health/live")
async def liveness() -> JSONResponse:
    """
    Liveness probe — confirms the process is running.
    No dependency checks; used by Kubernetes / Railway for restart decisions.
    """
    return JSONResponse({"status": "alive", "service": "chatcraft-api"})


@router.get("/health/ready")
async def readiness() -> JSONResponse:
    """
    Readiness probe — confirms the service can accept traffic.
    Checks DB + Redis; used to gate traffic routing.
    """
    postgres = await _check_postgres()
    redis = await _check_redis()

    ready = all(dep["status"] == "healthy" for dep in [postgres, redis])

    return JSONResponse(
        content={"status": "ready" if ready else "not_ready", "dependencies": {"postgres": postgres, "redis": redis}},
        status_code=200 if ready else 503,
    )
