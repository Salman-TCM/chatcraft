from celery import Celery
from celery.schedules import crontab
from celery.signals import task_failure, task_retry, worker_ready
from kombu import Exchange, Queue

from app.core.config import settings


def _cron(**kwargs) -> crontab:
    """Shorthand for creating a crontab schedule."""
    return crontab(**kwargs)

# ---------------------------------------------------------------------------
# Queue definitions
# ---------------------------------------------------------------------------
default_exchange = Exchange("default", type="direct")
priority_exchange = Exchange("priority", type="direct")

QUEUES = (
    Queue("default", default_exchange, routing_key="default"),
    Queue("embeddings", default_exchange, routing_key="embeddings"),
    Queue("emails", default_exchange, routing_key="emails"),
    Queue("analytics", default_exchange, routing_key="analytics"),
    Queue("priority", priority_exchange, routing_key="priority"),
)

TASK_ROUTES = {
    "workers.process_document": {"queue": "embeddings", "routing_key": "embeddings"},
    "workers.send_email": {"queue": "emails", "routing_key": "emails"},
    "workers.aggregate_daily_usage": {"queue": "analytics", "routing_key": "analytics"},
    "workers.sync_stripe_metered_billing": {"queue": "analytics", "routing_key": "analytics"},
    "workers.send_usage_alerts": {"queue": "analytics", "routing_key": "analytics"},
    "workers.expire_trials": {"queue": "priority", "routing_key": "priority"},
}

# ---------------------------------------------------------------------------
# Celery app
# ---------------------------------------------------------------------------
celery_app = Celery(
    "chatcraft",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=[
        "app.workers.embedding_worker",
        "app.workers.email_worker",
        "app.workers.analytics_worker",
        "app.workers.debug_worker",
    ],
)

celery_app.conf.update(
    # Serialisation
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    # Queues & routing
    task_queues=QUEUES,
    task_routes=TASK_ROUTES,
    task_default_queue="default",
    task_default_exchange="default",
    task_default_routing_key="default",
    # Reliability
    task_track_started=True,
    task_acks_late=True,           # re-queue if worker dies mid-task
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,  # one task at a time per worker slot
    # Result retention (24 hours)
    result_expires=86400,
    # Retry defaults applied to all tasks unless overridden per-task
    task_max_retries=3,
    task_default_retry_delay=60,   # seconds
    # Beat schedule — cron jobs that run automatically
    beat_schedule={
        # Aggregate yesterday's usage into analytics_daily (Phase 6)
        "aggregate-daily-usage": {
            "task": "workers.aggregate_daily_usage",
            "schedule": _cron(hour=1, minute=0),  # 01:00 UTC nightly
            "options": {"queue": "analytics"},
        },
        # Report metered billing units to Stripe (Phase 6)
        "sync-stripe-metered-billing": {
            "task": "workers.sync_stripe_metered_billing",
            "schedule": _cron(hour=2, minute=0),  # 02:00 UTC nightly
            "options": {"queue": "analytics"},
        },
        # Email users approaching/at their usage cap (Phase 6)
        "send-usage-alerts": {
            "task": "workers.send_usage_alerts",
            "schedule": _cron(minute=0),           # every hour on the hour
            "options": {"queue": "analytics"},
        },
        # Downgrade expired trials (Phase 2)
        "expire-trials": {
            "task": "workers.expire_trials",
            "schedule": 1800,                      # every 30 minutes
            "options": {"queue": "priority"},
        },
    },
    # Broker connection retry on startup
    broker_connection_retry_on_startup=True,
    broker_connection_max_retries=10,
    # Redis-specific: visibility timeout must exceed the longest task runtime
    broker_transport_options={
        "visibility_timeout": 3600,    # 1 hour
        "socket_timeout": 30,
        "socket_connect_timeout": 30,
    },
    result_backend_transport_options={
        "socket_timeout": 30,
        "socket_connect_timeout": 30,
    },
)


# ---------------------------------------------------------------------------
# Signals
# ---------------------------------------------------------------------------

@worker_ready.connect
def on_worker_ready(sender, **kwargs):
    """Initialise logging and log when a Celery worker comes online."""
    from loguru import logger
    from app.core.logging import setup_logging
    setup_logging()
    logger.info(f"Celery worker ready: {sender}")


@task_failure.connect
def on_task_failure(sender, task_id, exception, traceback, einfo, **kwargs):
    """Forward task failures to Sentry and Slack."""
    if settings.sentry_dsn:
        import sentry_sdk
        with sentry_sdk.push_scope() as scope:
            scope.set_tag("celery_task", sender.name)
            scope.set_context("task", {"task_id": task_id})
            sentry_sdk.capture_exception(exception)

    from app.core.alerts import alert_on_exception
    alert_on_exception(
        exception,
        context={"Task": sender.name, "Task ID": task_id},
    )


@task_retry.connect
def on_task_retry(sender, reason, **kwargs):
    from loguru import logger
    logger.warning(f"Task {sender.name} retrying: {reason}")
