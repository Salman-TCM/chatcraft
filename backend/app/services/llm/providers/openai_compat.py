"""
Generic OpenAI-compatible LLM provider.
Used for DeepSeek, Groq, Perplexity, xAI Grok — all expose an OpenAI-compatible API.
"""
from decimal import Decimal
from typing import AsyncIterator

from openai import AsyncOpenAI

from app.services.llm.base import ChatMessage, LLMProvider, LLMResponse, StreamChunk
from app.services.llm.costs import calculate_cost


class OpenAICompatProvider(LLMProvider):
    """
    Drop-in for any provider that speaks the OpenAI Chat Completions protocol.
    Pass base_url and api_key at construction time.
    """

    def __init__(self, model: str, base_url: str, api_key: str) -> None:
        self._model = model
        self._client = AsyncOpenAI(api_key=api_key, base_url=base_url)

    @property
    def model_id(self) -> str:
        return self._model

    def _to_oai(self, messages: list[ChatMessage]) -> list[dict]:
        return [{"role": m.role, "content": m.content} for m in messages]

    async def complete(
        self,
        messages: list[ChatMessage],
        *,
        max_tokens: int = 2048,
        temperature: float = 0.7,
    ) -> LLMResponse:
        resp = await self._client.chat.completions.create(
            model=self._model,
            messages=self._to_oai(messages),  # type: ignore[arg-type]
            max_tokens=max_tokens,
            temperature=temperature,
        )
        input_tok = resp.usage.prompt_tokens if resp.usage else 0
        output_tok = resp.usage.completion_tokens if resp.usage else 0
        return LLMResponse(
            content=resp.choices[0].message.content or "",
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
        input_tok = 0
        output_tok = 0

        async with await self._client.chat.completions.create(
            model=self._model,
            messages=self._to_oai(messages),  # type: ignore[arg-type]
            max_tokens=max_tokens,
            temperature=temperature,
            stream=True,
            stream_options={"include_usage": True},
        ) as stream:
            async for chunk in stream:
                if chunk.usage:
                    input_tok = chunk.usage.prompt_tokens
                    output_tok = chunk.usage.completion_tokens
                delta = chunk.choices[0].delta.content if chunk.choices else None
                if delta:
                    yield StreamChunk(delta=delta)

        yield StreamChunk(
            delta="",
            done=True,
            model=self._model,
            input_tokens=input_tok,
            output_tokens=output_tok,
            cost_usd=calculate_cost(self._model, input_tok, output_tok),
        )
