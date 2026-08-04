"""
File processing unit tests.

Tests the text cleaner and chunker — both are pure-Python, no I/O.
The chunker requires tiktoken and langchain; they are skipped gracefully
when unavailable (e.g. CI without optional ML deps).
"""

import pytest

from app.services.kb.cleaner import clean

# ── Cleaner ───────────────────────────────────────────────────────────────────


class TestClean:
    def test_basic_passthrough(self):
        text = "Hello world."
        assert clean(text) == "Hello world."

    def test_strips_leading_trailing_whitespace(self):
        assert clean("  hello  ") == "hello"

    def test_collapses_multiple_blank_lines(self):
        text = "Line 1\n\n\n\nLine 2"
        result = clean(text)
        assert "\n\n\n" not in result
        assert "Line 1" in result
        assert "Line 2" in result

    def test_preserves_double_blank_line(self):
        text = "Para 1\n\nPara 2"
        result = clean(text)
        assert "Para 1" in result
        assert "Para 2" in result

    def test_collapses_inline_whitespace(self):
        text = "word1   word2\t\t word3"
        result = clean(text)
        assert "word1 word2 word3" in result

    def test_removes_control_characters(self):
        text = "clean\x00text\x01here"
        result = clean(text)
        assert "\x00" not in result
        assert "\x01" not in result
        assert "cleantext" in result or "clean text" in result.replace("\n", " ")

    def test_drops_pure_punctuation_lines(self):
        text = "Normal text\n---\nMore text"
        result = clean(text)
        assert "Normal text" in result
        assert "More text" in result
        assert result.count("---") == 0

    def test_keeps_lines_with_sufficient_alphanum(self):
        text = "Short\nab\nLonger line"
        result = clean(text)
        assert "Short" in result
        assert "Longer line" in result

    def test_empty_input(self):
        assert clean("") == ""

    def test_only_whitespace(self):
        assert clean("   \n\t  ") == ""

    def test_unicode_normalisation(self):
        # NFC normalisation should not destroy valid text
        text = "café au lait"
        result = clean(text)
        assert "caf" in result
        assert "au lait" in result

    def test_non_breaking_space_replaced(self):
        text = "word1 word2"
        result = clean(text)
        assert " " not in result


# ── Chunker ───────────────────────────────────────────────────────────────────

try:
    from app.services.kb.chunker import CHUNK_OVERLAP, CHUNK_SIZE, Chunk, chunk_text

    HAS_CHUNKER = True
except ImportError:
    HAS_CHUNKER = False

chunker_skip = pytest.mark.skipif(not HAS_CHUNKER, reason="tiktoken/langchain not installed")


@chunker_skip
class TestChunkText:
    def test_returns_list_of_chunks(self):
        text = "The quick brown fox jumps over the lazy dog. " * 50
        chunks = chunk_text(text)
        assert isinstance(chunks, list)
        assert len(chunks) > 0
        assert all(isinstance(c, Chunk) for c in chunks)

    def test_chunks_have_positive_token_count(self):
        text = "Hello world. " * 100
        chunks = chunk_text(text)
        assert all(c.token_count > 0 for c in chunks)

    def test_chunk_indices_are_sequential(self):
        text = "sentence. " * 200
        chunks = chunk_text(text)
        assert [c.index for c in chunks] == list(range(len(chunks)))

    def test_chunk_token_count_within_limit(self):
        text = "word " * 2000
        chunks = chunk_text(text)
        # Allow some tolerance above CHUNK_SIZE due to splitter behaviour
        assert all(c.token_count <= CHUNK_SIZE + CHUNK_OVERLAP for c in chunks)

    def test_short_text_is_single_chunk(self):
        text = "This is a short document."
        chunks = chunk_text(text)
        assert len(chunks) == 1

    def test_empty_text_returns_empty(self):
        chunks = chunk_text("")
        assert chunks == []

    def test_chunk_content_covers_full_text(self):
        """All content should be preserved across chunks (no silent truncation)."""
        unique_words = [f"uniqueword{i}" for i in range(50)]
        text = " ".join(unique_words)
        chunks = chunk_text(text)
        combined = " ".join(c.content for c in chunks)
        # Due to overlap some words appear twice, but none should be lost
        for word in unique_words:
            assert word in combined
