from decimal import Decimal
from typing import AsyncIterator

import google.generativeai as genai

from app.core.config import settings
from app.services.llm.base import ChatMessage, LLMProvider, LLMResponse, StreamChunk
from app.services.llm.costs import calculate_cost

def _configure(api_key: str) -> None:
    genai.configure(api_key=api_key)


def _build_history(messages: list[ChatMessage]) -> tuple[str | None, list[dict], str]:
    """
    Gemini uses a different history format.
    Returns (system_instruction, history_turns, last_user_message).
    """
    system: str | None = None
    history: list[dict] = []
    last_user = ""

    non_system = [m for m in messages if m.role != "system"]
    if any(m.role == "system" for m in messages):
        system = next(m.content for m in messages if m.role == "system")

    for i, m in enumerate(non_system):
        role = "user" if m.role == "user" else "model"
        if i == len(non_system) - 1 and m.role == "user":
            last_user = m.content
        else:
            history.append({"role": role, "parts": [m.content]})

    return system, history, last_user


class GeminiProvider(LLMProvider):
    def __init__(self, model: str = "gemini-1.5-flash", api_key: str | None = None) -> None:
        self._model = model
        self._api_key = api_key or settings.google_ai_api_key

    @property
    def model_id(self) -> str:
        return self._model

    def _get_model(self, system: str | None) -> genai.GenerativeModel:
        _configure(self._api_key)
        kwargs: dict = {"model_name": self._model}
        if system:
            kwargs["system_instruction"] = system
        return genai.GenerativeModel(**kwargs)

    async def complete(
        self,
        messages: list[ChatMessage],
        *,
        max_tokens: int = 2048,
        temperature: float = 0.7,
    ) -> LLMResponse:
        system, history, last_user = _build_history(messages)
        model = self._get_model(system)
        chat = model.start_chat(history=history)

        config = genai.types.GenerationConfig(
            max_output_tokens=max_tokens,
            temperature=temperature,
        )
        resp = await chat.send_message_async(last_user, generation_config=config)

        input_tok = resp.usage_metadata.prompt_token_count or 0
        output_tok = resp.usage_metadata.candidates_token_count or 0
        return LLMResponse(
            content=resp.text,
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
        system, history, last_user = _build_history(messages)
        model = self._get_model(system)
        chat = model.start_chat(history=history)

        config = genai.types.GenerationConfig(
            max_output_tokens=max_tokens,
            temperature=temperature,
        )

        input_tok = 0
        output_tok = 0

        resp = await chat.send_message_async(
            last_user, generation_config=config, stream=True
        )
        async for chunk in resp:
            if chunk.text:
                yield StreamChunk(delta=chunk.text)
            if chunk.usage_metadata:
                input_tok = chunk.usage_metadata.prompt_token_count or input_tok
                output_tok = chunk.usage_metadata.candidates_token_count or output_tok

        yield StreamChunk(
            delta="",
            done=True,
            model=self._model,
            input_tokens=input_tok,
            output_tokens=output_tok,
            cost_usd=calculate_cost(self._model, input_tok, output_tok),
        )
