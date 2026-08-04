"""
RAG service unit tests.

These tests cover the pure-Python BM25 and context-building logic only —
no database or embedding calls. Async DB tests would require a live pgvector
instance which is handled in integration tests.
"""

import uuid

from app.services.kb.rag import (
    RELEVANCE_THRESHOLD,
    RetrievedChunk,
    _bm25_rerank,
    _build_context,
    _tokenise,
)

# ── _tokenise ─────────────────────────────────────────────────────────────────


def test_tokenise_basic():
    tokens = _tokenise("Hello, World! This is a test.")
    assert tokens == ["hello", "world", "this", "is", "a", "test"]


def test_tokenise_empty():
    assert _tokenise("") == []


def test_tokenise_numbers():
    tokens = _tokenise("order 42 items")
    assert "42" in tokens
    assert "items" in tokens


def test_tokenise_lowercases():
    assert _tokenise("UPPER lower Mixed") == ["upper", "lower", "mixed"]


# ── _bm25_rerank ──────────────────────────────────────────────────────────────


def _make_chunk(content: str, similarity: float = 0.85) -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id=uuid.uuid4(),
        document_id=uuid.uuid4(),
        document_name="test_doc",
        content=content,
        similarity=similarity,
    )


def test_bm25_rerank_empty():
    result = _bm25_rerank("query", [], top_k=5)
    assert result == []


def test_bm25_rerank_no_query_tokens():
    chunks = [_make_chunk("some content")]
    result = _bm25_rerank("   ", chunks, top_k=5)
    assert result == chunks[:5]


def test_bm25_rerank_ranks_relevant_higher():
    relevant = _make_chunk("machine learning neural networks deep learning")
    irrelevant = _make_chunk("today is a sunny day in the park")
    result = _bm25_rerank("machine learning", [irrelevant, relevant], top_k=2)
    assert result[0].content == relevant.content


def test_bm25_rerank_respects_top_k():
    chunks = [_make_chunk(f"content about topic {i}") for i in range(10)]
    result = _bm25_rerank("topic", chunks, top_k=3)
    assert len(result) == 3


def test_bm25_rerank_preserves_similarity():
    chunk = _make_chunk("hello world", similarity=0.92)
    result = _bm25_rerank("hello", [chunk], top_k=1)
    assert result[0].similarity == 0.92


def test_bm25_rerank_single_chunk():
    chunk = _make_chunk("The quick brown fox")
    result = _bm25_rerank("quick fox", [chunk], top_k=5)
    assert len(result) == 1
    assert result[0] is chunk


def test_bm25_idf_penalises_common_terms():
    """A term appearing in all chunks has lower IDF."""
    chunks = [_make_chunk(f"common term specific_{i}") for i in range(5)]
    # "specific_0" appears only in first chunk — should rank it first
    result = _bm25_rerank("specific_0", chunks, top_k=1)
    assert "specific_0" in result[0].content


# ── _build_context ────────────────────────────────────────────────────────────


def test_build_context_single_chunk():
    chunk = _make_chunk("This is a document about AI.")
    ctx = _build_context([chunk])
    assert "[1]" in ctx
    assert "This is a document about AI." in ctx


def test_build_context_multiple_chunks():
    chunks = [_make_chunk(f"Chunk {i} content.") for i in range(3)]
    ctx = _build_context(chunks)
    assert "[1]" in ctx
    assert "[2]" in ctx
    assert "[3]" in ctx
    assert "---" in ctx  # separator


def test_build_context_no_sources_by_default():
    chunk = _make_chunk("content", 0.9)
    chunk.document_name = "my_document.pdf"
    ctx = _build_context([chunk], include_sources=False)
    assert "my_document.pdf" not in ctx


def test_build_context_include_sources():
    chunk = _make_chunk("content", 0.9)
    chunk.document_name = "my_document.pdf"
    ctx = _build_context([chunk], include_sources=True)
    assert "my_document.pdf" in ctx
    assert "Source:" in ctx


def test_build_context_empty():
    ctx = _build_context([])
    assert ctx == ""


def test_build_context_strips_whitespace():
    chunk = _make_chunk("   padded content   ")
    ctx = _build_context([chunk])
    assert "padded content" in ctx
    # The content is stripped, so leading/trailing spaces are removed
    assert "   padded" not in ctx


# ── Relevance threshold ───────────────────────────────────────────────────────


def test_relevance_threshold_is_positive():
    assert 0 < RELEVANCE_THRESHOLD < 1


def test_threshold_filters_low_similarity():
    chunks = [
        _make_chunk("highly relevant text", similarity=0.92),
        _make_chunk("somewhat relevant text", similarity=0.80),
        _make_chunk("low quality match", similarity=0.60),
    ]
    # Only chunks above threshold should pass
    relevant = [c for c in chunks if c.similarity >= RELEVANCE_THRESHOLD]
    assert len(relevant) == 2
    assert all(c.similarity >= RELEVANCE_THRESHOLD for c in relevant)
