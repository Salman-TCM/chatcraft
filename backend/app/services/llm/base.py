from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from decimal import Decimal


@dataclass
class ChatMessage:
    role: str  # "system" | "user" | "assistant"
    content: str


@dataclass
class LLMResponse:
    content: str
    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: Decimal


@dataclass
class StreamChunk:
    delta: str
    done: bool = False
    # Populated only on the final chunk (done=True)
    model: str = ""
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: Decimal = field(default_factory=lambda: Decimal("0"))


class LLMProvider(ABC):
    """Unified interface all LLM providers must implement."""

    @property
    @abstractmethod
    def model_id(self) -> str:
        """Canonical model identifier (e.g. 'claude-sonnet-4-6')."""

    @abstractmethod
    async def complete(
        self,
        messages: list[ChatMessage],
        *,
        max_tokens: int = 2048,
        temperature: float = 0.7,
    ) -> LLMResponse:
        """Return a full (non-streaming) response."""

    @abstractmethod
    async def stream(
        self,
        messages: list[ChatMessage],
        *,
        max_tokens: int = 2048,
        temperature: float = 0.7,
    ) -> AsyncIterator[StreamChunk]:
        """Yield token-by-token chunks; final chunk has done=True and full usage stats."""
