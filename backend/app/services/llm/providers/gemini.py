from collections.abc import AsyncIterator

from google import genai
from google.genai import types

from app.core.config import settings
from app.services.llm.base import ChatMessage, LLMProvider, LLMResponse, StreamChunk
from app.services.llm.costs import calculate_cost


def _make_client(api_key: str) -> genai.Client:
    return genai.Client(api_key=api_key)


def _build_contents(messages: list[ChatMessage]) -> tuple[str | None, list, str]:
    """
    Returns (system_instruction, history_contents, last_user_message).
    history_contents is a list of types.Content for all turns except the last user message.
    """
    system: str | None = None
    contents: list = []
    last_user = ""

    non_system = [m for m in messages if m.role != "system"]
    if any(m.role == "system" for m in messages):
        system = next(m.content for m in messages if m.role == "system")

    for i, m in enumerate(non_system):
        role = "user" if m.role == "user" else "model"
        if i == len(non_system) - 1 and m.role == "user":
            last_user = m.content
        else:
            contents.append(types.Content(role=role, parts=[types.Part.from_text(m.content or "")]))

    return system, contents, last_user


class GeminiProvider(LLMProvider):
    def __init__(self, model: str = "gemini-1.5-flash", api_key: str | None = None) -> None:
        self._model = model
        self._api_key = api_key or settings.google_ai_api_key

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
        system, history_contents, last_user = _build_contents(messages)
        client = _make_client(self._api_key)

        contents = history_contents + [
            types.Content(role="user", parts=[types.Part.from_text(last_user)])
        ]
        config = types.GenerateContentConfig(
            system_instruction=system,
            max_output_tokens=max_tokens,
            temperature=temperature,
        )

        resp = await client.aio.models.generate_content(
            model=self._model,
            contents=contents,
            config=config,
        )

        input_tok = resp.usage_metadata.prompt_token_count or 0 if resp.usage_metadata else 0
        output_tok = resp.usage_metadata.candidates_token_count or 0 if resp.usage_metadata else 0
        return LLMResponse(
            content=resp.text or "",
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
        system, history_contents, last_user = _build_contents(messages)
        client = _make_client(self._api_key)

        contents = history_contents + [
            types.Content(role="user", parts=[types.Part.from_text(last_user)])
        ]
        config = types.GenerateContentConfig(
            system_instruction=system,
            max_output_tokens=max_tokens,
            temperature=temperature,
        )

        input_tok = 0
        output_tok = 0

        async for chunk in await client.aio.models.generate_content_stream(
            model=self._model,
            contents=contents,
            config=config,
        ):
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
