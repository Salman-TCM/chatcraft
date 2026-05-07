import sentry_sdk
from sentry_sdk.integrations.celery import CeleryIntegration
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.httpx import HttpxIntegration
from sentry_sdk.integrations.loguru import LoguruIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

from app.core.config import settings


def init_sentry() -> None:
    """Initialise Sentry SDK. No-op if SENTRY_DSN is not configured."""
    if not settings.sentry_dsn:
        return

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        release="chatcraft-api@0.1.0",
        traces_sample_rate=0.2 if settings.is_production else 1.0,
        profiles_sample_rate=0.1 if settings.is_production else 1.0,
        send_default_pii=False,
        integrations=[
            StarletteIntegration(transaction_style="endpoint"),
            FastApiIntegration(transaction_style="endpoint"),
            SqlalchemyIntegration(),
            CeleryIntegration(monitor_beat_tasks=True),
            HttpxIntegration(),
            LoguruIntegration(),
        ],
        ignore_errors=[
            KeyboardInterrupt,
        ],
    )
