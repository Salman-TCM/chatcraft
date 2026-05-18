"""
Unit tests for the LLM abstraction layer.

Tests cover:
- Cost calculation (calculate_cost)
- Provider routing (get_provider)
- LLMRouter: complete — success, fallback, no-fallback re-raise
- LLMRouter: stream — success, fallback before first chunk, no retry after first chunk
"""
from __future__ import annotations

import asyncio
from decimal import Decimal
from typing import AsyncIterator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.llm.base import ChatMessage, LLMProvider, LLMResponse, StreamChunk
from app.services.llm.costs import calculate_cost, supported_models
from app.services.llm.router import (
    DEFAULT_FALLBACK,
    DEFAULT_MODEL,
    LLMRouter,
    get_provider,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

MESSAGES = [ChatMessage(role="user", content="Hello")]


def _make_response(model: str = "claude-sonnet-4-6") -> LLMResponse:
    return LLMResponse(
        content="Hi there",
        model=model,
        input_tokens=10,
        output_tokens=5,
        cost_usd=Decimal("0.0001"),
    )


async def _make_stream(*chunks: StreamChunk) -> AsyncIterator[StreamChunk]:
    for chunk in chunks:
        yield chunk


# ── Cost calculation ──────────────────────────────────────────────────────────


def test_calculate_cost_known_model():
    # claude-sonnet-4-6: $3.00/1M input, $15.00/1M output
    cost = calculate_cost("claude-sonnet-4-6", input_tokens=1_000_000, output_tokens=1_000_000)
    assert cost == Decimal("3.00") + Decimal("15.00")


def test_calculate_cost_zero_tokens():
    assert calculate_cost("gpt-4o", input_tokens=0, output_tokens=0) == Decimal("0")


def test_calculate_cost_unknown_model_uses_fallback():
    # Unknown model should not raise; it uses _FALLBACK_COST
    cost = calculate_cost("some-unknown-model", input_tokens=1_000_000, output_tokens=0)
    assert cost > Decimal("0")


def test_calculate_cost_all_supported_models():
    for model in supported_models():
        cost = calculate_cost(model, input_tokens=100, output_tokens=100)
        assert cost >= Decimal("0"), f"Negative cost for {model}"


def test_calculate_cost_proportional():
    cost_small = calculate_cost("gpt-4o-mini", input_tokens=1000, output_tokens=1000)
    cost_large = calculate_cost("gpt-4o-mini", input_tokens=2000, output_tokens=2000)
    assert cost_large == cost_small * 2


# ── Provider routing ──────────────────────────────────────────────────────────


def test_get_provider_anthropic_models():
    for model in ("claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5"):
        provider = get_provider(model)
        assert provider.model_id == model


def test_get_provider_openai_models():
    for model in ("gpt-4o", "gpt-4o-mini"):
        provider = get_provider(model)
        assert provider.model_id == model


def test_get_provider_gemini_models():
    for model in ("gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash"):
        provider = get_provider(model)
        assert provider.model_id == model


def test_get_provider_unknown_falls_back_to_default():
    provider = get_provider("some-made-up-model")
    assert provider.model_id == DEFAULT_MODEL


# ── LLMRouter.complete ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_router_complete_success():
    resp = _make_response()
    mock_provider = AsyncMock(spec=LLMProvider)
    mock_provider.complete.return_value = resp

    with patch("app.services.llm.router.get_provider", return_value=mock_provider):
        router = LLMRouter(model="claude-sonnet-4-6", fallback_model="gpt-4o-mini")
        result = await router.complete(MESSAGES)

    assert result is resp
    mock_provider.complete.assert_awaited_once()


@pytest.mark.asyncio
async def test_router_complete_falls_back_on_primary_failure():
    fallback_resp = _make_response(model="gpt-4o-mini")
    primary = AsyncMock(spec=LLMProvider)
    primary.complete.side_effect = RuntimeError("provider down")
    fallback = AsyncMock(spec=LLMProvider)
    fallback.complete.return_value = fallback_resp

    def _get_provider_side_effect(model: str) -> LLMProvider:
        return primary if "claude" in model else fallback

    with patch("app.services.llm.router.get_provider", side_effect=_get_provider_side_effect):
        router = LLMRouter(model="claude-sonnet-4-6", fallback_model="gpt-4o-mini")
        result = await router.complete(MESSAGES)

    assert result is fallback_resp
    primary.complete.assert_awaited_once()
    fallback.complete.assert_awaited_once()


@pytest.mark.asyncio
async def test_router_complete_reraises_when_no_fallback():
    primary = AsyncMock(spec=LLMProvider)
    primary.complete.side_effect = RuntimeError("no quota")

    with patch("app.services.llm.router.get_provider", return_value=primary):
        router = LLMRouter(model="claude-sonnet-4-6", fallback_model=None)
        with pytest.raises(RuntimeError, match="no quota"):
            await router.complete(MESSAGES)


@pytest.mark.asyncio
async def test_router_complete_reraises_when_fallback_same_as_primary():
    primary = AsyncMock(spec=LLMProvider)
    primary.complete.side_effect = RuntimeError("same model")

    with patch("app.services.llm.router.get_provider", return_value=primary):
        router = LLMRouter(model="claude-sonnet-4-6", fallback_model="claude-sonnet-4-6")
        with pytest.raises(RuntimeError, match="same model"):
            await router.complete(MESSAGES)


# ── LLMRouter.stream ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_router_stream_success():
    chunks = [
        StreamChunk(delta="Hello"),
        StreamChunk(delta=" world", done=True, model="claude-sonnet-4-6",
                    input_tokens=5, output_tokens=10, cost_usd=Decimal("0.001")),
    ]
    # Use MagicMock (not AsyncMock) so stream() returns the async generator directly,
    # matching how async generator provider methods behave when called.
    mock_provider = MagicMock(spec=LLMProvider)
    mock_provider.stream = MagicMock(return_value=_make_stream(*chunks))

    with patch("app.services.llm.router.get_provider", return_value=mock_provider):
        router = LLMRouter(model="claude-sonnet-4-6", fallback_model="gpt-4o-mini")
        collected = [c async for c in router.stream(MESSAGES)]

    assert len(collected) == 2
    assert collected[0].delta == "Hello"
    assert collected[1].done is True


@pytest.mark.asyncio
async def test_router_stream_fallback_before_first_chunk():
    """If primary raises before yielding anything, retry with fallback."""
    fallback_chunks = [
        StreamChunk(delta="Fallback", done=True, model="gpt-4o-mini",
                    input_tokens=5, output_tokens=5, cost_usd=Decimal("0.0001")),
    ]

    async def _primary_stream(*_, **__):
        raise RuntimeError("API unavailable")
        yield

    async def _fallback_stream(*_, **__):
        for c in fallback_chunks:
            yield c

    primary = MagicMock(spec=LLMProvider)
    primary.stream = MagicMock(return_value=_primary_stream())
    fallback = MagicMock(spec=LLMProvider)
    fallback.stream = MagicMock(return_value=_fallback_stream())

    call_count = {"n": 0}

    def _get_provider_side_effect(model: str) -> LLMProvider:
        call_count["n"] += 1
        return primary if call_count["n"] == 1 else fallback

    with patch("app.services.llm.router.get_provider", side_effect=_get_provider_side_effect):
        router = LLMRouter(model="claude-sonnet-4-6", fallback_model="gpt-4o-mini")
        collected = [c async for c in router.stream(MESSAGES)]

    assert len(collected) == 1
    assert collected[0].delta == "Fallback"


@pytest.mark.asyncio
async def test_router_stream_no_fallback_reraises():
    async def _failing_stream(*_, **__):
        raise RuntimeError("stream broken")
        yield

    provider = MagicMock(spec=LLMProvider)
    provider.stream = MagicMock(return_value=_failing_stream())

    with patch("app.services.llm.router.get_provider", return_value=provider):
        router = LLMRouter(model="claude-sonnet-4-6", fallback_model=None)
        with pytest.raises(RuntimeError, match="stream broken"):
            async for _ in router.stream(MESSAGES):
                pass


@pytest.mark.asyncio
async def test_router_stream_default_models_are_registered():
    """DEFAULT_MODEL and DEFAULT_FALLBACK must be resolvable via get_provider."""
    primary = get_provider(DEFAULT_MODEL)
    fallback = get_provider(DEFAULT_FALLBACK)
    assert primary.model_id == DEFAULT_MODEL
    assert fallback.model_id == DEFAULT_FALLBACK
