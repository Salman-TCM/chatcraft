from decimal import Decimal
from typing import AsyncIterator

from openai import AsyncOpenAI

from app.core.config import settings
from app.services.llm.base import ChatMessage, LLMProvider, LLMResponse, StreamChunk
from app.services.llm.costs import calculate_cost

def _to_oai(messages: list[ChatMessage]) -> list[dict]:
    return [{"role": m.role, "content": m.content} for m in messages]


class OpenAIProvider(LLMProvider):
    def __init__(self, model: str = "gpt-4o", api_key: str | None = None) -> None:
        self._model = model
        self._api_key = api_key or settings.openai_api_key

    def _client(self) -> AsyncOpenAI:
        return AsyncOpenAI(api_key=self._api_key)

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
        resp = await self._client().chat.completions.create(
            model=self._model,
            messages=_to_oai(messages),  # type: ignore[arg-type]
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

        async with await self._client().chat.completions.create(
            model=self._model,
            messages=_to_oai(messages),  # type: ignore[arg-type]
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
