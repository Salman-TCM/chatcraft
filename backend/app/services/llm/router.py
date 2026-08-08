"""
LLM router — selects provider by model id, runs fallback on failure,
and exposes a uniform complete/stream interface used by the chat API.
"""

from collections.abc import AsyncIterator

from app.core.config import settings
from app.core.logging import logger
from app.services.llm.base import ChatMessage, LLMProvider, LLMResponse, StreamChunk
from app.services.llm.providers.anthropic import AnthropicProvider
from app.services.llm.providers.gemini import GeminiProvider
from app.services.llm.providers.openai import OpenAIProvider
from app.services.llm.providers.openai_compat import OpenAICompatProvider

_ANTHROPIC_MODELS = {
    "claude-opus-4-8",
    "claude-opus-4-7",
    "claude-sonnet-5",
    "claude-sonnet-4-6",
    "claude-haiku-4-5",
    "claude-fable-5",
}
_OPENAI_MODELS = {
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
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
    "gemini-3.1-pro",
    "gemini-3.6-flash",
}
_DEEPSEEK_MODELS = {
    "deepseek-v4-flash",
    "deepseek-v4-pro",
    "deepseek-chat",
    "deepseek-reasoner",
}
_GROQ_MODELS = {
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "qwen/qwen3.6-27b",
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "mixtral-8x7b-32768",
}
_PERPLEXITY_MODELS = {
    "sonar",
    "sonar-pro",
    "sonar-reasoning-pro",
    "sonar-deep-research",
    "sonar-reasoning",
}
_XAI_MODELS = {
    "grok-4.5",
    "grok-4.3",
    "grok-3",
    "grok-3-fast",
    "grok-3-mini",
    "grok-3-mini-fast",
}

DEFAULT_MODEL = "claude-sonnet-4-6"
DEFAULT_FALLBACK = "gpt-4o-mini"

# Model ids of this shape route to the user's own OpenAI-compatible endpoint
# (Ollama, vLLM, LM Studio, ...) instead of a known hosted provider.
SELF_HOSTED_PREFIX = "self-hosted/"

_PROVIDER_MAP: dict[str, str] = (
    dict.fromkeys(_ANTHROPIC_MODELS, "anthropic")
    | dict.fromkeys(_OPENAI_MODELS, "openai")
    | dict.fromkeys(_GEMINI_MODELS, "google")
    | dict.fromkeys(_DEEPSEEK_MODELS, "deepseek")
    | dict.fromkeys(_GROQ_MODELS, "groq")
    | dict.fromkeys(_PERPLEXITY_MODELS, "perplexity")
    | dict.fromkeys(_XAI_MODELS, "xai")
)


def get_model_provider(model: str) -> str:
    """Return the provider name for a given model ID."""
    if model.startswith(SELF_HOSTED_PREFIX):
        return "self_hosted"
    return _PROVIDER_MAP.get(model, "anthropic")


def get_provider(model: str, api_keys: dict[str, str] | None = None) -> LLMProvider:
    keys = api_keys or {}
    if model.startswith(SELF_HOSTED_PREFIX):
        base_url = keys.get("self_hosted_base_url")
        if not base_url:
            logger.warning(
                f"Self-hosted model '{model}' requested with no base_url configured, "
                f"falling back to {DEFAULT_MODEL}"
            )
            return AnthropicProvider(DEFAULT_MODEL, api_key=keys.get("anthropic"))
        return OpenAICompatProvider(
            model[len(SELF_HOSTED_PREFIX) :],
            base_url=base_url,
            api_key=keys.get("self_hosted") or "not-needed",
        )
    if model in _ANTHROPIC_MODELS:
        return AnthropicProvider(model, api_key=keys.get("anthropic"))
    if model in _OPENAI_MODELS:
        return OpenAIProvider(model, api_key=keys.get("openai"))
    if model in _GEMINI_MODELS:
        return GeminiProvider(model, api_key=keys.get("google"))
    if model in _DEEPSEEK_MODELS:
        return OpenAICompatProvider(
            model,
            base_url="https://api.deepseek.com/v1",
            api_key=keys.get("deepseek") or settings.deepseek_api_key,
        )
    if model in _GROQ_MODELS:
        return OpenAICompatProvider(
            model,
            base_url="https://api.groq.com/openai/v1",
            api_key=keys.get("groq") or settings.groq_api_key,
        )
    if model in _PERPLEXITY_MODELS:
        return OpenAICompatProvider(
            model,
            base_url="https://api.perplexity.ai",
            api_key=keys.get("perplexity") or settings.perplexity_api_key,
        )
    if model in _XAI_MODELS:
        return OpenAICompatProvider(
            model,
            base_url="https://api.x.ai/v1",
            api_key=keys.get("xai") or settings.xai_api_key,
        )
    logger.warning(f"Unknown model '{model}', falling back to {DEFAULT_MODEL}")
    return AnthropicProvider(DEFAULT_MODEL, api_key=keys.get("anthropic"))


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
    - api_keys: {provider_name: key} — user-supplied keys take precedence over env vars.
    """

    def __init__(
        self,
        model: str = DEFAULT_MODEL,
        fallback_model: str | None = DEFAULT_FALLBACK,
        api_keys: dict[str, str] | None = None,
    ) -> None:
        self._model = model
        self._fallback = fallback_model
        self._api_keys = api_keys or {}

    async def complete(
        self,
        messages: list[ChatMessage],
        *,
        max_tokens: int = 2048,
        temperature: float = 0.7,
    ) -> LLMResponse:
        try:
            return await get_provider(self._model, self._api_keys).complete(
                messages, max_tokens=max_tokens, temperature=temperature
            )
        except Exception as exc:
            if not self._fallback or self._fallback == self._model:
                raise
            logger.warning(
                f"LLM provider '{self._model}' failed ({exc!r}), "
                f"retrying with fallback '{self._fallback}'"
            )
            return await get_provider(self._fallback, self._api_keys).complete(
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
        primary = get_provider(self._model, self._api_keys)
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

        fallback = get_provider(self._fallback, self._api_keys)
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
