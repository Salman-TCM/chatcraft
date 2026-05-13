from abc import ABC, abstractmethod


class ChannelSender(ABC):
    """Abstract base for sending outbound messages on a channel."""

    def __init__(self, config: dict) -> None:
        self.config = config

    @abstractmethod
    async def send(self, recipient_id: str, text: str) -> None:
        """Send `text` to `recipient_id` on this channel."""
        ...
