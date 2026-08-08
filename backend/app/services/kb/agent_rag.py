"""
Per-agent RAG service.

Mirrors the chatbot RAGService in rag.py but scopes vector search + document
readiness to `agents.id` via the agent_kb_documents / agent_kb_chunks tables.
Reuses the BM25 reranker and context builder from rag.py so behaviour stays
identical to the chatbot path.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import Agent
from app.models.agent_knowledge_base import AgentKnowledgeDocument
from app.models.knowledge_base import DocumentStatus
from app.services.kb.embedder import embed_texts, resolve_embedding_provider
from app.services.kb.rag import (
    BM25_CANDIDATE_MULTIPLIER,
    RELEVANCE_THRESHOLD,
    TOP_K,
    RetrievedChunk,
    _bm25_rerank,
    _build_context,
)
from app.services.llm.key_store import get_all_keys


class AgentRAGService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def query(
        self,
        agent_id: uuid.UUID,
        user_message: str,
        top_k: int = TOP_K,
        debug: bool = False,
        threshold: float | None = None,
    ) -> tuple[str | None, list[RetrievedChunk]]:
        """
        Returns (context_string, retrieved_chunks).
        context_string is None when no relevant documents exist.
        threshold overrides RELEVANCE_THRESHOLD for this call (used by /search).
        """
        if not await self._has_ready_documents(agent_id):
            return None, []

        agent = await self._db.get(Agent, agent_id)
        user_keys = await get_all_keys(agent.user_id, self._db) if agent else {}
        provider, api_key = resolve_embedding_provider(user_keys)

        query_vectors = await embed_texts([user_message], provider, api_key)
        query_vector = query_vectors[0]

        candidates = await self._vector_search(
            agent_id, query_vector, limit=top_k * BM25_CANDIDATE_MULTIPLIER
        )
        if not candidates:
            return None, []

        ranked = _bm25_rerank(user_message, candidates, top_k=top_k)

        floor = RELEVANCE_THRESHOLD if threshold is None else threshold
        relevant = [c for c in ranked if c.similarity >= floor]
        if not relevant:
            return None, []

        context = _build_context(relevant, include_sources=debug)
        return context, relevant

    async def _has_ready_documents(self, agent_id: uuid.UUID) -> bool:
        result = await self._db.execute(
            select(AgentKnowledgeDocument.id)
            .where(
                AgentKnowledgeDocument.agent_id == agent_id,
                AgentKnowledgeDocument.status == DocumentStatus.ready,
            )
            .limit(1)
        )
        return result.first() is not None

    async def _vector_search(
        self,
        agent_id: uuid.UUID,
        query_vector: list[float],
        limit: int,
    ) -> list[RetrievedChunk]:
        vec_literal = "[" + ",".join(str(v) for v in query_vector) + "]"
        stmt = text(
            """
            SELECT
                c.id          AS chunk_id,
                c.document_id,
                d.name        AS document_name,
                c.content,
                1 - (c.embedding <=> CAST(:vec AS vector)) AS similarity
            FROM agent_kb_chunks c
            JOIN agent_kb_documents d
              ON d.id = c.document_id
            WHERE d.agent_id    = :agent_id
              AND d.status      = 'ready'
              AND c.embedding  IS NOT NULL
            ORDER BY c.embedding <=> CAST(:vec AS vector)
            LIMIT :limit
            """
        )
        result = await self._db.execute(
            stmt,
            {
                "vec": vec_literal,
                "agent_id": str(agent_id),
                "limit": limit,
            },
        )
        rows = result.mappings().all()
        return [
            RetrievedChunk(
                chunk_id=row["chunk_id"],
                document_id=row["document_id"],
                document_name=row["document_name"],
                content=row["content"],
                similarity=float(row["similarity"]),
            )
            for row in rows
        ]
