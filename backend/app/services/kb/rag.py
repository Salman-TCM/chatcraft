"""
RAG Query Pipeline
==================
1. Embed the user's query with text-embedding-3-small.
2. Vector cosine similarity search (top-K chunks from pgvector).
3. Keyword BM25 filter for hybrid recall (re-ranks/supplements vector hits).
4. Relevance threshold (drop chunks below 0.75 cosine similarity).
5. Build a context string with optional source attribution.

Usage (inside the chat API):
    rag = RAGService(db)
    context, sources = await rag.query(chatbot_id, user_message, top_k=5)
    # context → injected into SystemPromptContext.knowledge_context
    # sources → optionally appended to the SSE done event for debug mode
"""
from __future__ import annotations

import math
import re
import uuid
from collections import Counter
from dataclasses import dataclass

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.knowledge_base import (
    DocumentStatus,
    KnowledgeBaseChunk,
    KnowledgeBaseDocument,
)
from app.services.kb.embedder import embed_texts

RELEVANCE_THRESHOLD = 0.75  # cosine similarity floor
TOP_K = 5
BM25_CANDIDATE_MULTIPLIER = 3  # fetch 3× as many vector hits, then BM25 re-rank


@dataclass
class RetrievedChunk:
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    document_name: str
    content: str
    similarity: float  # cosine similarity [0, 1]


class RAGService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def query(
        self,
        chatbot_id: uuid.UUID,
        user_message: str,
        top_k: int = TOP_K,
        debug: bool = False,
    ) -> tuple[str | None, list[RetrievedChunk]]:
        """
        Returns (context_string, retrieved_chunks).
        context_string is None when no relevant documents exist.
        retrieved_chunks is populated only when debug=True or for source attribution.
        """
        # Check there are ready documents for this chatbot; bail early if not
        has_docs = await self._has_ready_documents(chatbot_id)
        if not has_docs:
            return None, []

        # Embed query
        query_vectors = await embed_texts([user_message])
        query_vector = query_vectors[0]

        # Vector search — fetch more than top_k so BM25 re-rank has headroom
        candidates = await self._vector_search(
            chatbot_id, query_vector, limit=top_k * BM25_CANDIDATE_MULTIPLIER
        )

        if not candidates:
            return None, []

        # BM25 re-rank over the candidate pool
        ranked = _bm25_rerank(user_message, candidates, top_k=top_k)

        # Apply relevance threshold (based on original cosine similarity, not BM25 score)
        relevant = [c for c in ranked if c.similarity >= RELEVANCE_THRESHOLD]

        if not relevant:
            return None, []

        context = _build_context(relevant, include_sources=debug)
        return context, relevant

    async def _has_ready_documents(self, chatbot_id: uuid.UUID) -> bool:
        result = await self._db.execute(
            select(KnowledgeBaseDocument.id)
            .where(
                KnowledgeBaseDocument.chatbot_id == chatbot_id,
                KnowledgeBaseDocument.status == DocumentStatus.ready,
            )
            .limit(1)
        )
        return result.first() is not None

    async def _vector_search(
        self,
        chatbot_id: uuid.UUID,
        query_vector: list[float],
        limit: int,
    ) -> list[RetrievedChunk]:
        """
        pgvector cosine similarity search scoped to this chatbot's documents.
        Returns chunks ordered by similarity descending.
        """
        # Build vector literal for pgvector
        vec_literal = "[" + ",".join(str(v) for v in query_vector) + "]"

        # Join chunks → documents so we can filter by chatbot_id and get doc name
        stmt = text(
            """
            SELECT
                c.id          AS chunk_id,
                c.document_id,
                d.name        AS document_name,
                c.content,
                1 - (c.embedding <=> CAST(:vec AS vector)) AS similarity
            FROM knowledge_base_chunks c
            JOIN knowledge_base_documents d
              ON d.id = c.document_id
            WHERE d.chatbot_id  = :chatbot_id
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
                "chatbot_id": str(chatbot_id),
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


# ── BM25 helpers ──────────────────────────────────────────────────────────────

def _tokenise(text: str) -> list[str]:
    return re.findall(r"\b\w+\b", text.lower())


def _bm25_rerank(
    query: str,
    chunks: list[RetrievedChunk],
    top_k: int,
    k1: float = 1.5,
    b: float = 0.75,
) -> list[RetrievedChunk]:
    """
    Re-rank candidates using BM25 over chunk text.
    Returns up to top_k chunks, sorted by descending BM25 score.
    The original cosine similarity is preserved on each chunk.
    """
    if not chunks:
        return []

    query_tokens = _tokenise(query)
    if not query_tokens:
        return chunks[:top_k]

    # Build per-chunk token counts
    corpus: list[list[str]] = [_tokenise(c.content) for c in chunks]
    doc_lengths = [len(doc) for doc in corpus]
    avg_dl = sum(doc_lengths) / len(doc_lengths) if doc_lengths else 1.0

    # IDF per query token across candidate corpus
    n = len(corpus)
    idf: dict[str, float] = {}
    for token in set(query_tokens):
        df = sum(1 for doc in corpus if token in doc)
        idf[token] = math.log((n - df + 0.5) / (df + 0.5) + 1)

    scores: list[float] = []
    for i, doc_tokens in enumerate(corpus):
        tf_map = Counter(doc_tokens)
        dl = doc_lengths[i]
        score = 0.0
        for token in query_tokens:
            tf = tf_map.get(token, 0)
            numerator = tf * (k1 + 1)
            denominator = tf + k1 * (1 - b + b * dl / avg_dl)
            score += idf.get(token, 0.0) * (numerator / denominator if denominator else 0)
        scores.append(score)

    # Sort by BM25 score descending, return top_k
    ranked = sorted(zip(scores, chunks), key=lambda x: x[0], reverse=True)
    return [chunk for _, chunk in ranked[:top_k]]


def _build_context(chunks: list[RetrievedChunk], include_sources: bool = False) -> str:
    """
    Build the context string injected into the system prompt.
    Each chunk is separated by a divider. Source names are included
    when include_sources=True (debug mode).
    """
    parts: list[str] = []
    for i, chunk in enumerate(chunks, 1):
        header = f"[{i}] Source: {chunk.document_name}" if include_sources else f"[{i}]"
        parts.append(f"{header}\n{chunk.content.strip()}")
    return "\n\n---\n\n".join(parts)
