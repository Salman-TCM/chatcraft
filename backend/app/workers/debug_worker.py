"""
Debug tasks for verifying the Celery queue is working end-to-end.
These are only available in non-production environments.
"""

import time

from loguru import logger

from app.workers.celery_app import celery_app


@celery_app.task(
    name="workers.ping",
    queue="default",
    bind=True,
)
def ping(self) -> dict:
    """
    Lightweight smoke-test task.
    Returns immediately with worker metadata — use this to confirm
    the broker, worker, and result backend are all wired up correctly.
    """
    return {
        "pong": True,
        "task_id": self.request.id,
        "worker": self.request.hostname,
        "retries": self.request.retries,
    }


@celery_app.task(
    name="workers.ping_with_delay",
    queue="default",
    bind=True,
)
def ping_with_delay(self, delay_seconds: int = 3) -> dict:
    """
    Delayed ping — useful for testing worker concurrency and visibility timeout.
    """
    logger.info(f"ping_with_delay: sleeping {delay_seconds}s (task_id={self.request.id})")
    time.sleep(delay_seconds)
    return {
        "pong": True,
        "task_id": self.request.id,
        "delay_seconds": delay_seconds,
        "worker": self.request.hostname,
    }


@celery_app.task(
    name="workers.ping_all_queues",
    queue="default",
    bind=True,
)
def ping_all_queues(self) -> dict:
    """
    Dispatch one ping to every queue and return all task IDs.
    Use this to verify every queue has at least one active consumer.
    """
    results = {}
    for queue in ("default", "embeddings", "emails", "analytics", "priority"):
        result = ping.apply_async(queue=queue)
        results[queue] = result.id
    logger.info(f"ping_all_queues dispatched: {results}")
    return {"queues_pinged": results}
