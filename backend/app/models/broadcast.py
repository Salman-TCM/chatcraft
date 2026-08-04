import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class BroadcastCampaign(TimestampMixin, Base):
    __tablename__ = "broadcast_campaigns"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # email / sms / telegram / whatsapp / messenger / push / phone
    channel: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    # draft / scheduled / sending / sent / failed
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="draft", server_default="draft", index=True
    )
    # Plain-text / template message (supports {{first_name}} etc.)
    message_template: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # HTML body for email campaigns
    html_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Subject line for email
    subject: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # {tags: [...], chatbot_id: "...", segment: "all"/"contacts"/"subscribers"}
    target_filter: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sent_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    failed_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )


class SocialAccount(TimestampMixin, Base):
    __tablename__ = "social_accounts"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # facebook / instagram / x
    platform: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    account_id: Mapped[str] = mapped_column(String(255), nullable=False)
    access_token: Mapped[str] = mapped_column(Text, nullable=False)
    token_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    # For Facebook: page_id + page_access_token
    page_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    page_access_token: Mapped[str | None] = mapped_column(Text, nullable=True)


class SocialPost(TimestampMixin, Base):
    __tablename__ = "social_posts"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # list of social_account IDs to post to
    account_ids: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    # draft / scheduled / published / failed
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="draft", server_default="draft", index=True
    )
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # {account_id: platform_post_id, ...}
    platform_post_ids: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )
    error_log: Mapped[str | None] = mapped_column(Text, nullable=True)


class CommentAutomation(TimestampMixin, Base):
    __tablename__ = "comment_automations"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # facebook / instagram
    platform: Mapped[str] = mapped_column(String(20), nullable=False)
    page_id: Mapped[str] = mapped_column(String(255), nullable=False)
    page_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    ai_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    # ai / text
    response_type: Mapped[str] = mapped_column(
        String(10), nullable=False, default="ai", server_default="ai"
    )
    response_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    # list of keyword strings — if empty, replies to all comments
    keyword_triggers: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]"
    )
    delay_seconds: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    # also_send_dm: send a private DM in addition to public reply
    also_send_dm: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    dm_message: Mapped[str | None] = mapped_column(Text, nullable=True)
