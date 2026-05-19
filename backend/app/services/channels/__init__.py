from app.services.channels.base import ChannelSender
from app.services.channels.telegram import TelegramSender
from app.services.channels.whatsapp import WhatsAppSender
from app.services.channels.facebook import FacebookSender
from app.services.channels.instagram import InstagramSender
from app.services.channels.sms import SMSSender
from app.services.channels.discord import DiscordSender

__all__ = [
    "ChannelSender", "TelegramSender", "WhatsAppSender",
    "FacebookSender", "InstagramSender", "SMSSender", "DiscordSender",
]


def get_sender(channel: str, config: dict) -> "ChannelSender":
    """Return the appropriate ChannelSender for the given channel."""
    match channel:
        case "telegram":
            return TelegramSender(config)
        case "whatsapp":
            return WhatsAppSender(config)
        case "facebook":
            return FacebookSender(config)
        case "instagram":
            return InstagramSender(config)
        case "sms":
            return SMSSender(config)
        case "discord":
            return DiscordSender(config)
        case _:
            raise ValueError(f"No sender for channel: {channel}")
