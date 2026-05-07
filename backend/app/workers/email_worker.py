from app.workers.celery_app import celery_app


@celery_app.task(
    name="workers.send_email",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    queue="emails",
    acks_late=True,
)
def send_email(self, to: str, subject: str, html: str) -> dict:
    """
    Send a transactional email via Resend.
    Implemented in Phase 2.
    """
    raise NotImplementedError("Implemented in Phase 2")
