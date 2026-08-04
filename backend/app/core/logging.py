import json
import sys
from typing import Any

from loguru import logger

from app.core.config import settings


def _get_request_id() -> str:
    try:
        from app.core.request_id import get_request_id

        return get_request_id()
    except Exception:
        return ""


def _serialize(record: dict) -> str:
    """Render a Loguru record as a structured JSON string."""
    subset: dict[str, Any] = {
        "timestamp": record["time"].isoformat(),
        "level": record["level"].name,
        "message": record["message"],
        "service": "chatcraft-api",
        "environment": settings.environment,
        "logger": f"{record['name']}:{record['line']}",
    }
    request_id = record["extra"].get("request_id") or _get_request_id()
    if request_id:
        subset["request_id"] = request_id
    if record["exception"]:
        subset["exception"] = record["exception"]
    extra = {k: v for k, v in (record["extra"] or {}).items() if k != "request_id"}
    if extra:
        subset["extra"] = extra
    return json.dumps(subset)


def _axiom_sink(message):
    """Ship each log record to Axiom as a structured event."""
    try:
        record = message.record
        client = _get_axiom_client()
        if client is None:
            return
        request_id = record["extra"].get("request_id") or _get_request_id()
        event: dict[str, Any] = {
            "_time": record["time"].isoformat(),
            "level": record["level"].name,
            "message": record["message"],
            "service": "chatcraft-api",
            "environment": settings.environment,
            "logger": f"{record['name']}:{record['line']}",
            **(record["extra"] or {}),
        }
        if request_id:
            event["request_id"] = request_id
        client.ingest_events(dataset=settings.axiom_dataset, events=[event])
    except Exception:
        pass  # never let logging failures crash the app


_axiom_client = None


def _get_axiom_client():
    """Return a cached Axiom client, or None if not configured."""
    global _axiom_client
    if _axiom_client is not None:
        return _axiom_client
    if not settings.axiom_token or not settings.axiom_dataset:
        return None
    try:
        from axiom import Client

        _axiom_client = Client(settings.axiom_token)
        return _axiom_client
    except Exception:
        return None


def setup_logging() -> None:
    """
    Configure Loguru for the application.

    - Development: coloured human-readable output to stdout
    - Production: structured JSON to stdout + async ship to Axiom
    """
    logger.remove()  # remove Loguru's default handler

    if settings.is_production:
        # Structured JSON to stdout (picked up by Railway / Docker logs)
        logger.add(
            sys.stdout,
            format=_serialize,  # type: ignore[arg-type]
            level="INFO",
            serialize=False,
            enqueue=True,
            backtrace=False,
            diagnose=False,
        )

        # Ship to Axiom if configured
        if settings.axiom_token and settings.axiom_dataset:
            logger.add(
                _axiom_sink,
                level="INFO",
                enqueue=True,  # async — does not block request handling
                backtrace=False,
                diagnose=False,
            )
    else:
        # Readable coloured output for local development
        logger.add(
            sys.stdout,
            colorize=True,
            format=(
                "<green>{time:HH:mm:ss}</green> | "
                "<level>{level: <8}</level> | "
                "<cyan>{name}</cyan>:<cyan>{line}</cyan> — "
                "<level>{message}</level>"
            ),
            level="DEBUG",
            enqueue=False,
            backtrace=True,
            diagnose=True,
        )

    logger.info(
        f"Logging configured — environment={settings.environment} "
        f"axiom={'enabled' if settings.axiom_token else 'disabled'}"
    )
