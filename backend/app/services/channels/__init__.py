from datetime import datetime, timedelta, timezone

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
    "get_sender", "is_within_meta_window", "META_WINDOW_CHANNELS",
]

# Channels that enforce a 24-hour messaging window
META_WINDOW_CHANNELS = {"facebook", "instagram", "whatsapp"}
_META_WINDOW_HOURS = 24


def is_within_meta_window(channel: str, last_user_message_at: datetime | None) -> bool:
    """Return True if proactive outbound messages are allowed on this channel.

    For Meta channels (Messenger, Instagram, WhatsApp), a regular text message
    can only be sent if the user messaged within the past 24 hours.
    For WhatsApp, you can fall back to a pre-approved template outside this window.
    Non-Meta channels always return True.
    """
    if channel not in META_WINDOW_CHANNELS:
        return True
    if last_user_message_at is None:
        return False
    ts = last_user_message_at
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts >= datetime.now(timezone.utc) - timedelta(hours=_META_WINDOW_HOURS)


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
