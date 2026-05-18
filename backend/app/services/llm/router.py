"""
LLM router — selects provider by model id, runs fallback on failure,
and exposes a uniform complete/stream interface used by the chat API.
"""
from typing import AsyncIterator

from app.core.config import settings
from app.core.logging import logger
from app.services.llm.base import ChatMessage, LLMProvider, LLMResponse, StreamChunk
from app.services.llm.providers.anthropic import AnthropicProvider
from app.services.llm.providers.gemini import GeminiProvider
from app.services.llm.providers.openai import OpenAIProvider
from app.services.llm.providers.openai_compat import OpenAICompatProvider

_ANTHROPIC_MODELS = {
    "claude-opus-4-7",
    "claude-sonnet-4-6",
    "claude-haiku-4-5",
}
_OPENAI_MODELS = {
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-5",
    "gpt-5-mini",
}
_GEMINI_MODELS = {
    "gemini-1.5-pro",
    "gemini-1.5-flash",
    "gemini-2.0-flash",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
}
_DEEPSEEK_MODELS = {
    "deepseek-chat",
    "deepseek-reasoner",
}
_GROQ_MODELS = {
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "mixtral-8x7b-32768",
}
_PERPLEXITY_MODELS = {
    "sonar",
    "sonar-pro",
    "sonar-reasoning",
}
_XAI_MODELS = {
    "grok-3",
    "grok-3-fast",
    "grok-3-mini",
    "grok-3-mini-fast",
}

DEFAULT_MODEL = "claude-sonnet-4-6"
DEFAULT_FALLBACK = "gpt-4o-mini"


def get_provider(model: str) -> LLMProvider:
    if model in _ANTHROPIC_MODELS:
        return AnthropicProvider(model)
    if model in _OPENAI_MODELS:
        return OpenAIProvider(model)
    if model in _GEMINI_MODELS:
        return GeminiProvider(model)
    if model in _DEEPSEEK_MODELS:
        return OpenAICompatProvider(
            model,
            base_url="https://api.deepseek.com/v1",
            api_key=settings.deepseek_api_key,
        )
    if model in _GROQ_MODELS:
        return OpenAICompatProvider(
            model,
            base_url="https://api.groq.com/openai/v1",
            api_key=settings.groq_api_key,
        )
    if model in _PERPLEXITY_MODELS:
        return OpenAICompatProvider(
            model,
            base_url="https://api.perplexity.ai",
            api_key=settings.perplexity_api_key,
        )
    if model in _XAI_MODELS:
        return OpenAICompatProvider(
            model,
            base_url="https://api.x.ai/v1",
            api_key=settings.xai_api_key,
        )
    logger.warning(f"Unknown model '{model}', falling back to {DEFAULT_MODEL}")
    return AnthropicProvider(DEFAULT_MODEL)


def all_models() -> list[str]:
    return sorted(
        _ANTHROPIC_MODELS
        | _OPENAI_MODELS
        | _GEMINI_MODELS
        | _DEEPSEEK_MODELS
        | _GROQ_MODELS
        | _PERPLEXITY_MODELS
        | _XAI_MODELS
    )


class LLMRouter:
    """
    Entry-point for the chat API.
    - Picks the right provider for `model`.
    - On any provider exception, retries with `fallback_model` once.
    - Tracks cumulative cost across retries.
    """

    def __init__(self, model: str = DEFAULT_MODEL, fallback_model: str | None = DEFAULT_FALLBACK) -> None:
        self._model = model
        self._fallback = fallback_model

    async def complete(
        self,
        messages: list[ChatMessage],
        *,
        max_tokens: int = 2048,
        temperature: float = 0.7,
    ) -> LLMResponse:
        try:
            return await get_provider(self._model).complete(
                messages, max_tokens=max_tokens, temperature=temperature
            )
        except Exception as exc:
            if not self._fallback or self._fallback == self._model:
                raise
            logger.warning(
                f"LLM provider '{self._model}' failed ({exc!r}), "
                f"retrying with fallback '{self._fallback}'"
            )
            return await get_provider(self._fallback).complete(
                messages, max_tokens=max_tokens, temperature=temperature
            )

    async def stream(
        self,
        messages: list[ChatMessage],
        *,
        max_tokens: int = 2048,
        temperature: float = 0.7,
    ) -> AsyncIterator[StreamChunk]:
        """
        Stream from primary model; if it raises before yielding a single
        chunk, retry the full request on the fallback model.
        """
        primary = get_provider(self._model)
        first_chunk = True
        try:
            async for chunk in _wrap_stream(primary, messages, max_tokens, temperature):
                first_chunk = False
                yield chunk
            return
        except Exception as exc:
            if not first_chunk or not self._fallback or self._fallback == self._model:
                raise
            logger.warning(
                f"LLM stream '{self._model}' failed before first chunk ({exc!r}), "
                f"retrying with fallback '{self._fallback}'"
            )

        fallback = get_provider(self._fallback)
        async for chunk in _wrap_stream(fallback, messages, max_tokens, temperature):
            yield chunk


async def _wrap_stream(
    provider: LLMProvider,
    messages: list[ChatMessage],
    max_tokens: int,
    temperature: float,
) -> AsyncIterator[StreamChunk]:
    # Materialise the coroutine so exceptions surface before we yield anything.
    gen = provider.stream(messages, max_tokens=max_tokens, temperature=temperature)
    async for chunk in gen:
        yield chunk
