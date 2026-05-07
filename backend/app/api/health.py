import time
from typing import Any

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import settings
from app.db.redis import get_async_redis

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
        client = get_async_redis()
        await client.ping()
        return {"status": "healthy", "latency_ms": round((time.monotonic() - start) * 1000, 2)}
    except Exception as exc:
        return {"status": "unhealthy", "error": str(exc)}


@router.get("/health")
async def health_check() -> JSONResponse:
    """
    Deep health check — verifies live connectivity to all dependencies.
    Returns 200 if all healthy, 503 if any dependency is down.
    """
    postgres, redis = await _check_postgres(), await _check_redis()
    all_healthy = all(dep["status"] == "healthy" for dep in [postgres, redis])

    return JSONResponse(
        content={
            "status": "healthy" if all_healthy else "degraded",
            "service": "chatcraft-api",
            "version": "0.1.0",
            "dependencies": {"postgres": postgres, "redis": redis},
        },
        status_code=200 if all_healthy else 503,
    )


@router.get("/health/live")
async def liveness() -> JSONResponse:
    """Liveness probe — confirms the process is running."""
    return JSONResponse({"status": "alive", "service": "chatcraft-api"})


@router.get("/health/ready")
async def readiness() -> JSONResponse:
    """Readiness probe — confirms the service can accept traffic."""
    postgres, redis = await _check_postgres(), await _check_redis()
    ready = all(dep["status"] == "healthy" for dep in [postgres, redis])

    return JSONResponse(
        content={
            "status": "ready" if ready else "not_ready",
            "dependencies": {"postgres": postgres, "redis": redis},
        },
        status_code=200 if ready else 503,
    )


@router.get("/health/queue")
async def queue_check() -> JSONResponse:
    """
    End-to-end Celery queue smoke test — only available outside production.
    Dispatches a ping task and waits up to 5 seconds for the result.
    Returns 503 if no worker picks it up in time.
    """
    if settings.is_production:
        return JSONResponse({"error": "not available in production"}, status_code=404)

    start = time.monotonic()
    try:
        from app.workers.debug_worker import ping
        result = ping.apply_async()
        outcome = result.get(timeout=5)
        latency_ms = round((time.monotonic() - start) * 1000, 2)
        return JSONResponse({
            "status": "healthy",
            "task_id": result.id,
            "worker": outcome.get("worker"),
            "latency_ms": latency_ms,
        })
    except Exception as exc:
        return JSONResponse(
            {"status": "unhealthy", "error": str(exc)},
            status_code=503,
        )
