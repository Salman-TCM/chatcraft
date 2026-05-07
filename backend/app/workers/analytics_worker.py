from app.workers.celery_app import celery_app


@celery_app.task(
    name="workers.aggregate_daily_usage",
    bind=True,
    max_retries=3,
    default_retry_delay=300,
    queue="analytics",
    acks_late=True,
)
def aggregate_daily_usage(self) -> dict:
    """
    Aggregate yesterday's usage_logs into analytics_daily.
    Runs nightly at 01:00 UTC via Celery beat.
    Implemented in Phase 6.
    """
    raise NotImplementedError("Implemented in Phase 6")


@celery_app.task(
    name="workers.sync_stripe_metered_billing",
    bind=True,
    max_retries=3,
    default_retry_delay=300,
    queue="analytics",
    acks_late=True,
)
def sync_stripe_metered_billing(self) -> dict:
    """
    Report metered usage units to Stripe at the end of each billing period.
    Runs daily at 02:00 UTC via Celery beat.
    Implemented in Phase 6.
    """
    raise NotImplementedError("Implemented in Phase 6")


@celery_app.task(
    name="workers.send_usage_alerts",
    bind=True,
    max_retries=2,
    default_retry_delay=120,
    queue="analytics",
    acks_late=True,
)
def send_usage_alerts(self) -> dict:
    """
    Email users who have reached 80% or 100% of their monthly cap.
    Runs every hour via Celery beat.
    Implemented in Phase 6.
    """
    raise NotImplementedError("Implemented in Phase 6")


@celery_app.task(
    name="workers.expire_trials",
    bind=True,
    max_retries=2,
    default_retry_delay=120,
    queue="priority",
    acks_late=True,
)
def expire_trials(self) -> dict:
    """
    Downgrade users whose trial_ends_at has passed and subscription is still trialing.
    Runs every 30 minutes via Celery beat.
    Implemented in Phase 2.
    """
    raise NotImplementedError("Implemented in Phase 2")
