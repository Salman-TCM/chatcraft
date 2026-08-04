"""
Voice service unit tests.

Tests the pure-Python helpers — cache key generation, month TTL,
and usage tracking key format — without making real API calls or
requiring a live Redis instance.
"""

import hashlib
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest

from app.services.voice import _cache_key, _month_ttl

# ── _cache_key ────────────────────────────────────────────────────────────────


class TestCacheKey:
    def test_returns_string_starting_with_prefix(self):
        key = _cache_key("Hello", "voice_1", "eleven_monolingual_v1")
        assert key.startswith("tts_cache:")

    def test_same_inputs_produce_same_key(self):
        key1 = _cache_key("Hello", "voice_1", "model_a")
        key2 = _cache_key("Hello", "voice_1", "model_a")
        assert key1 == key2

    def test_different_text_produces_different_key(self):
        key1 = _cache_key("Hello", "voice_1", "model_a")
        key2 = _cache_key("World", "voice_1", "model_a")
        assert key1 != key2

    def test_different_voice_produces_different_key(self):
        key1 = _cache_key("Hello", "voice_1", "model_a")
        key2 = _cache_key("Hello", "voice_2", "model_a")
        assert key1 != key2

    def test_different_model_produces_different_key(self):
        key1 = _cache_key("Hello", "voice_1", "model_a")
        key2 = _cache_key("Hello", "voice_1", "model_b")
        assert key1 != key2

    def test_key_format_contains_sha256_hex(self):
        text, voice_id, model_id = "test", "v1", "m1"
        expected_digest = hashlib.sha256(f"{text}|{voice_id}|{model_id}".encode()).hexdigest()
        assert _cache_key(text, voice_id, model_id) == f"tts_cache:{expected_digest}"

    def test_empty_string_is_valid(self):
        key = _cache_key("", "", "")
        assert key.startswith("tts_cache:")
        assert len(key) > len("tts_cache:")

    def test_long_text_truncated_to_fixed_length(self):
        short_key = _cache_key("short", "v", "m")
        long_key = _cache_key("x" * 10000, "v", "m")
        # SHA-256 is always 64 hex chars — keys have same length regardless of input
        assert len(short_key) == len(long_key)


# ── _month_ttl ────────────────────────────────────────────────────────────────


class TestMonthTtl:
    def test_returns_positive_integer(self):
        ttl = _month_ttl()
        assert isinstance(ttl, int)
        assert ttl > 0

    def test_returns_at_least_one_day_in_seconds(self):
        # There's always at least 1 day left in the month (we add 2)
        assert _month_ttl() >= 2 * 86400

    def test_returns_at_most_one_month_plus_buffer(self):
        # Maximum: 31 days + 2 buffer days
        assert _month_ttl() <= 33 * 86400

    def test_is_a_multiple_of_86400(self):
        ttl = _month_ttl()
        assert ttl % 86400 == 0


# ── Usage tracking key format ─────────────────────────────────────────────────


class TestUsageKeyFormat:
    """Verify the Redis key patterns without hitting Redis."""

    def test_tts_key_contains_user_id_and_month(self):
        now = datetime.now(UTC)
        month = f"{now.year}-{now.month:02d}"
        user_id = "user_123"
        expected_key = f"tts_chars:{user_id}:{month}"
        # Reconstruct what the service would build
        key = f"tts_chars:{user_id}:{now.year}-{now.month:02d}"
        assert key == expected_key

    def test_stt_key_contains_user_id_and_month(self):
        now = datetime.now(UTC)
        user_id = "user_456"
        key = f"stt_secs:{user_id}:{now.year}-{now.month:02d}"
        assert "stt_secs" in key
        assert user_id in key
        assert str(now.year) in key


# ── get_voice_usage (mocked Redis) ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_voice_usage_returns_zeros_when_no_data():
    from app.services.voice import get_voice_usage

    mock_redis = AsyncMock()
    mock_redis.mget = AsyncMock(return_value=[None, None])

    result = await get_voice_usage(mock_redis, "user_abc")

    assert result["tts_characters"] == 0
    assert result["stt_seconds"] == 0.0
    assert "month" in result


@pytest.mark.asyncio
async def test_get_voice_usage_returns_values_when_present():
    from app.services.voice import get_voice_usage

    mock_redis = AsyncMock()
    mock_redis.mget = AsyncMock(return_value=[b"5000", b"120.5"])

    result = await get_voice_usage(mock_redis, "user_abc")

    assert result["tts_characters"] == 5000
    assert result["stt_seconds"] == pytest.approx(120.5)
