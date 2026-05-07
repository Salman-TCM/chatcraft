from celery import Task
from app.workers.celery_app import celery_app


class EmbeddingTask(Task):
    """Base class that holds a lazy DB session for embedding tasks."""
    abstract = True


@celery_app.task(
    name="workers.process_document",
    bind=True,
    base=EmbeddingTask,
    max_retries=3,
    default_retry_delay=30,
    queue="embeddings",
    acks_late=True,
)
def process_document(self: EmbeddingTask, document_id: str) -> dict:
    """
    Chunk, embed, and store a knowledge base document.
    Implemented in Phase 4.
    """
    raise NotImplementedError("Implemented in Phase 4")
