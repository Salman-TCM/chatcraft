from app.workers.celery_app import celery_app


@celery_app.task(name="workers.process_document", bind=True, max_retries=3)
def process_document(self, document_id: str) -> dict:
    """Process and embed a knowledge base document."""
    raise NotImplementedError("Implemented in Phase 4")
