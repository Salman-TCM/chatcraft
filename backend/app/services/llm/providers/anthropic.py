from decimal import Decimal
from typing import AsyncIterator

import anthropic

from app.core.config import settings
from app.services.llm.base import ChatMessage, LLMProvider, LLMResponse, StreamChunk
from app.services.llm.costs import calculate_cost

_client: anthropic.AsyncAnthropic | None = None

# Map user-facing short IDs to actual Anthropic API model IDs
_MODEL_ALIASES: dict[str, str] = {
    "claude-haiku-4-5": "claude-haiku-4-5-20251001",
}


def _resolve_model(model: str) -> str:
    return _MODEL_ALIASES.get(model, model)


def _get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _client


def _split_messages(
    messages: list[ChatMessage],
) -> tuple[str | None, list[dict]]:
    """Anthropic requires system prompt separate from the messages list."""
    system: str | None = None
    turns: list[dict] = []
    for m in messages:
        if m.role == "system":
            system = m.content
        else:
            turns.append({"role": m.role, "content": m.content})
    return system, turns


class AnthropicProvider(LLMProvider):
    def __init__(self, model: str = "claude-sonnet-4-6", api_key: str | None = None) -> None:
        self._model = model
        self._api_model = _resolve_model(model)
        self._api_key = api_key or settings.anthropic_api_key

    def _client(self) -> anthropic.AsyncAnthropic:
        return anthropic.AsyncAnthropic(api_key=self._api_key)

    @property
    def model_id(self) -> str:
        return self._model

    async def complete(
        self,
        messages: list[ChatMessage],
        *,
        max_tokens: int = 2048,
        temperature: float = 0.7,
    ) -> LLMResponse:
        system, turns = _split_messages(messages)
        kwargs: dict = dict(
            model=self._api_model,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=turns,
        )
        if system:
            kwargs["system"] = system

        resp = await self._client().messages.create(**kwargs)
        input_tok = resp.usage.input_tokens
        output_tok = resp.usage.output_tokens
        return LLMResponse(
            content=resp.content[0].text,
            model=self._model,
            input_tokens=input_tok,
            output_tokens=output_tok,
            cost_usd=calculate_cost(self._model, input_tok, output_tok),
        )

    async def stream(
        self,
        messages: list[ChatMessage],
        *,
        max_tokens: int = 2048,
        temperature: float = 0.7,
    ) -> AsyncIterator[StreamChunk]:
        system, turns = _split_messages(messages)
        kwargs: dict = dict(
            model=self._api_model,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=turns,
        )
        if system:
            kwargs["system"] = system

        input_tok = 0
        output_tok = 0

        async with self._client().messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield StreamChunk(delta=text)

            final = await stream.get_final_message()
            input_tok = final.usage.input_tokens
            output_tok = final.usage.output_tokens

        yield StreamChunk(
            delta="",
            done=True,
            model=self._model,
            input_tokens=input_tok,
            output_tokens=output_tok,
            cost_usd=calculate_cost(self._model, input_tok, output_tok),
        )
