"""
Celery task: process_document
Pipeline: extract text → clean → chunk → embed → store in pgvector.
Document status is updated at each stage so the UI can reflect progress.
"""

import asyncio
import uuid

from celery import Task
from loguru import logger

from app.workers.celery_app import celery_app


class EmbeddingTask(Task):
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
    Full document ingestion pipeline:
    1. Set status → processing
    2. Extract text from source (pdf/docx/txt/url/text)
    3. Clean and normalise
    4. Chunk (500 tokens, 50 overlap)
    5. Embed with text-embedding-3-small (batched, with retry)
    6. Persist KnowledgeBaseChunk rows + update document counters
    7. Set status → ready  (or error on unrecoverable failure)
    """
    from app.services.kb.embedder import NoEmbeddingProviderConfigured

    try:
        asyncio.run(_run_pipeline(document_id))
        return {"document_id": document_id, "status": "ready"}
    except Exception as exc:
        logger.exception(f"process_document failed for {document_id}: {exc}")
        # Mark document as error in DB
        try:
            asyncio.run(_mark_error(document_id, str(exc)))
        except Exception:
            pass

        # A missing API key will never succeed on retry — fail immediately.
        if isinstance(exc, NoEmbeddingProviderConfigured):
            return {"document_id": document_id, "status": "error", "error": str(exc)}

        # Retry transient errors (network, rate limits)
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=30 * (2**self.request.retries))
        return {"document_id": document_id, "status": "error", "error": str(exc)}


async def _run_pipeline(document_id: str) -> None:
    from app.db.session import AsyncSessionLocal, engine
    from app.models.chatbot_config import ChatbotConfig
    from app.models.knowledge_base import (
        DocumentStatus,
        KnowledgeBaseChunk,
        KnowledgeBaseDocument,
    )
    from app.services.kb.chunker import chunk_text
    from app.services.kb.cleaner import clean
    from app.services.kb.embedder import embed_texts, resolve_embedding_provider
    from app.services.kb.extractor import extract_text_for_document
    from app.services.llm.key_store import get_all_keys

    # Celery pre-forks workers. The module-level async engine's pool was created
    # in the parent process and holds connection refs bound to a different event
    # loop, causing "Future attached to a different loop" errors. Dispose so this
    # task's asyncio.run() gets a fresh pool bound to its own loop.
    await engine.dispose()

    doc_uuid = uuid.UUID(document_id)

    async with AsyncSessionLocal() as db:
        doc: KnowledgeBaseDocument | None = await db.get(KnowledgeBaseDocument, doc_uuid)
        if not doc:
            raise ValueError(f"Document {document_id} not found")

        chatbot = await db.get(ChatbotConfig, doc.chatbot_id)
        user_keys = await get_all_keys(chatbot.user_id, db) if chatbot else {}
        embed_provider, embed_key = resolve_embedding_provider(user_keys)

        # ── 1. Mark as processing ─────────────────────────────────────────────
        doc.status = DocumentStatus.processing
        doc.error_message = None
        await db.commit()

        logger.info(f"[KB] Processing document {document_id} type={doc.type.value}")

        # ── 2. Extract text ───────────────────────────────────────────────────
        raw_text = await extract_text_for_document(
            doc_type=doc.type.value,
            file_url=doc.file_url,
            source_url=doc.source_url,
            raw_content=doc.raw_content,
        )
        if not raw_text.strip():
            raise ValueError("No text could be extracted from the document")

        # ── 3. Clean ──────────────────────────────────────────────────────────
        cleaned = clean(raw_text)

        # ── 4. Chunk ──────────────────────────────────────────────────────────
        chunks = chunk_text(cleaned)
        if not chunks:
            raise ValueError("Document produced no chunks after cleaning")

        logger.info(f"[KB] Document {document_id} → {len(chunks)} chunks")

        # ── 5. Embed (batched) ────────────────────────────────────────────────
        texts = [c.content for c in chunks]
        vectors = await embed_texts(texts, embed_provider, embed_key)

        # ── 6. Persist chunks ─────────────────────────────────────────────────
        # Delete any stale chunks from a previous (failed) attempt
        from sqlalchemy import delete

        await db.execute(
            delete(KnowledgeBaseChunk).where(KnowledgeBaseChunk.document_id == doc_uuid)
        )

        total_tokens = 0
        for chunk, vector in zip(chunks, vectors):
            db.add(
                KnowledgeBaseChunk(
                    document_id=doc_uuid,
                    chunk_index=chunk.index,
                    content=chunk.content,
                    token_count=chunk.token_count,
                    embedding=vector,
                )
            )
            total_tokens += chunk.token_count

        # ── 7. Update document counters and mark ready ────────────────────────
        doc.chunk_count = len(chunks)
        doc.token_count = total_tokens
        doc.status = DocumentStatus.ready
        doc.error_message = None

        await db.commit()
        logger.info(
            f"[KB] Document {document_id} ready — {len(chunks)} chunks, {total_tokens} tokens"
        )


async def _mark_error(document_id: str, message: str) -> None:
    from app.db.session import AsyncSessionLocal, engine
    from app.models.knowledge_base import DocumentStatus, KnowledgeBaseDocument

    await engine.dispose()
    async with AsyncSessionLocal() as db:
        doc = await db.get(KnowledgeBaseDocument, uuid.UUID(document_id))
        if doc:
            doc.status = DocumentStatus.error
            doc.error_message = message[:1000]
            await db.commit()


# ── Agent knowledge base pipeline ─────────────────────────────────────────────


@celery_app.task(
    name="workers.process_agent_document",
    bind=True,
    base=EmbeddingTask,
    max_retries=3,
    default_retry_delay=30,
    queue="embeddings",
    acks_late=True,
)
def process_agent_document(self: EmbeddingTask, document_id: str) -> dict:
    """Same pipeline as process_document but for AgentKnowledgeDocument rows."""
    from app.services.kb.embedder import NoEmbeddingProviderConfigured

    try:
        asyncio.run(_run_agent_pipeline(document_id))
        return {"document_id": document_id, "status": "ready"}
    except Exception as exc:
        logger.exception(f"process_agent_document failed for {document_id}: {exc}")
        try:
            asyncio.run(_mark_agent_error(document_id, str(exc)))
        except Exception:
            pass

        if isinstance(exc, NoEmbeddingProviderConfigured):
            return {"document_id": document_id, "status": "error", "error": str(exc)}

        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=30 * (2**self.request.retries))
        return {"document_id": document_id, "status": "error", "error": str(exc)}


async def _run_agent_pipeline(document_id: str) -> None:
    from sqlalchemy import delete

    from app.db.session import AsyncSessionLocal, engine
    from app.models.agent import Agent
    from app.models.agent_knowledge_base import AgentKnowledgeChunk, AgentKnowledgeDocument
    from app.models.knowledge_base import DocumentStatus
    from app.services.kb.chunker import chunk_text
    from app.services.kb.cleaner import clean
    from app.services.kb.embedder import embed_texts, resolve_embedding_provider
    from app.services.kb.extractor import extract_text_for_document
    from app.services.llm.key_store import get_all_keys

    await engine.dispose()  # See note in _run_pipeline about celery+asyncio pool

    doc_uuid = uuid.UUID(document_id)

    async with AsyncSessionLocal() as db:
        doc: AgentKnowledgeDocument | None = await db.get(AgentKnowledgeDocument, doc_uuid)
        if not doc:
            raise ValueError(f"Agent document {document_id} not found")

        agent = await db.get(Agent, doc.agent_id)
        user_keys = await get_all_keys(agent.user_id, db) if agent else {}
        embed_provider, embed_key = resolve_embedding_provider(user_keys)

        doc.status = DocumentStatus.processing
        doc.error_message = None
        await db.commit()

        logger.info(f"[AgentKB] Processing document {document_id} type={doc.type.value}")

        raw_text = await extract_text_for_document(
            doc_type=doc.type.value,
            file_url=doc.file_url,
            source_url=doc.source_url,
            raw_content=doc.raw_content,
        )
        if not raw_text.strip():
            raise ValueError("No text could be extracted from the document")

        cleaned = clean(raw_text)
        chunks = chunk_text(cleaned)
        if not chunks:
            raise ValueError("Document produced no chunks after cleaning")

        logger.info(f"[AgentKB] Document {document_id} → {len(chunks)} chunks")

        texts = [c.content for c in chunks]
        vectors = await embed_texts(texts, embed_provider, embed_key)

        await db.execute(
            delete(AgentKnowledgeChunk).where(AgentKnowledgeChunk.document_id == doc_uuid)
        )

        total_tokens = 0
        for chunk, vector in zip(chunks, vectors):
            db.add(
                AgentKnowledgeChunk(
                    document_id=doc_uuid,
                    chunk_index=chunk.index,
                    content=chunk.content,
                    token_count=chunk.token_count,
                    embedding=vector,
                )
            )
            total_tokens += chunk.token_count

        doc.chunk_count = len(chunks)
        doc.token_count = total_tokens
        doc.status = DocumentStatus.ready
        doc.error_message = None
        await db.commit()
        logger.info(
            f"[AgentKB] Document {document_id} ready — {len(chunks)} chunks, {total_tokens} tokens"
        )


async def _mark_agent_error(document_id: str, message: str) -> None:
    from app.db.session import AsyncSessionLocal, engine
    from app.models.agent_knowledge_base import AgentKnowledgeDocument
    from app.models.knowledge_base import DocumentStatus

    await engine.dispose()
    async with AsyncSessionLocal() as db:
        doc = await db.get(AgentKnowledgeDocument, uuid.UUID(document_id))
        if doc:
            doc.status = DocumentStatus.error
            doc.error_message = message[:1000]
            await db.commit()
