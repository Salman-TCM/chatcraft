from abc import ABC, abstractmethod
from typing import Any


class ChannelSender(ABC):
    """Abstract base for sending outbound messages on a channel."""

    def __init__(self, config: dict) -> None:
        self.config = config

    @abstractmethod
    async def send(self, recipient_id: str, text: str) -> None:
        """Send plain text to recipient_id."""
        ...

    async def send_rich(self, recipient_id: str, payload: dict) -> None:
        """Send a rich/structured message. Payload shape is channel-specific.
        Default implementation falls back to sending payload.get('text') as plain text.
        """
        fallback = payload.get("text") or payload.get("body") or ""
        if fallback:
            await self.send(recipient_id, str(fallback))
