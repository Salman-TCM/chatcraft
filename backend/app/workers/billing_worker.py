from datetime import datetime, timedelta, timezone

from loguru import logger

from app.workers.celery_app import celery_app

GRACE_PERIOD_DAYS = 3


@celery_app.task(
    name="workers.expire_payment_grace_periods",
    bind=True,
    max_retries=2,
    default_retry_delay=120,
    queue="priority",
    acks_late=True,
)
def expire_payment_grace_periods(self) -> dict:
    """
    Downgrade users whose payment has been past_due for more than GRACE_PERIOD_DAYS.
    Runs every hour via Celery beat.
    """
    import asyncio
    from sqlalchemy import select
    from app.db.session import AsyncSessionLocal
    from app.models.subscription import Subscription, SubscriptionState
    from app.models.user import User, UserRole, SubscriptionStatus

    cutoff = datetime.now(timezone.utc) - timedelta(days=GRACE_PERIOD_DAYS)

    async def _run() -> dict:
        downgraded = 0
        async with AsyncSessionLocal() as db:
            subs = (await db.scalars(
                select(Subscription).where(
                    Subscription.status == SubscriptionState.past_due,
                    Subscription.payment_failed_at <= cutoff,
                )
            )).all()

            for sub in subs:
                user: User | None = await db.get(User, sub.user_id)
                if not user:
                    continue
                sub.status = SubscriptionState.unpaid
                user.role = UserRole.free
                user.subscription_status = SubscriptionStatus.unpaid
                logger.warning(
                    f"Grace period expired — downgraded user {user.id} to free "
                    f"(payment_failed_at={sub.payment_failed_at})"
                )
                downgraded += 1

            await db.commit()
        return {"downgraded": downgraded}

    result = asyncio.run(_run())
    logger.info(f"expire_payment_grace_periods complete: {result}")
    return result
