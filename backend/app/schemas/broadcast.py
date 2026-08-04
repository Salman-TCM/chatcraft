"""
Pydantic request schemas for the Broadcast Hub & Social Tools API.
"""

from typing import Literal

from pydantic import BaseModel, Field

# email / sms / telegram / whatsapp / messenger / push / phone — from the model
# comment on BroadcastCampaign.channel and the CHANNELS list in
# frontend/app/dashboard/broadcast/page.tsx.
Channel = Literal["email", "sms", "telegram", "whatsapp", "messenger", "push", "phone"]
# facebook / instagram / x — from the model comment on SocialAccount.platform and
# the platform <select> options in frontend/app/dashboard/social/page.tsx.
SocialPlatform = Literal["facebook", "instagram", "x"]
# facebook / instagram — from the model comment on CommentAutomation.platform and
# the platform <select> options in frontend/app/dashboard/comment-automation/page.tsx.
CommentPlatform = Literal["facebook", "instagram"]
# ai / text — from the model comment on CommentAutomation.response_type and the
# response-type radio options in frontend/app/dashboard/comment-automation/page.tsx.
ResponseType = Literal["ai", "text"]


# ── Broadcast campaigns ─────────────────────────────────────────────────────────


class CreateCampaignRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    channel: Channel
    message_template: str = ""
    html_content: str | None = None
    subject: str | None = Field(default=None, max_length=500)
    target_filter: dict = Field(default_factory=dict)
    scheduled_at: str | None = None


class UpdateCampaignRequest(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    message_template: str | None = None
    html_content: str | None = None
    subject: str | None = Field(default=None, max_length=500)
    target_filter: dict | None = None
    scheduled_at: str | None = None


class TestCampaignRequest(BaseModel):
    to: str = Field(min_length=1, max_length=255)


# ── Social accounts ────────────────────────────────────────────────────────────


class ConnectAccountRequest(BaseModel):
    platform: SocialPlatform
    account_id: str = Field(default="", max_length=255)
    access_token: str = Field(default="", max_length=4096)
    name: str = Field(default="", max_length=255)
    avatar_url: str | None = Field(default=None, max_length=1000)
    page_id: str | None = Field(default=None, max_length=255)
    page_access_token: str | None = Field(default=None, max_length=4096)
    token_expires_at: str | None = None


# ── Social posts ───────────────────────────────────────────────────────────────


class CreatePostRequest(BaseModel):
    content: str = Field(min_length=1, max_length=5000)
    account_ids: list[str] = Field(default_factory=list)
    image_url: str | None = Field(default=None, max_length=1000)
    scheduled_at: str | None = None
    publish_now: bool = False


class GenerateCaptionRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)
    model: str = Field(default="claude-sonnet-4-6", max_length=100)


# ── Comment automations ─────────────────────────────────────────────────────────


class CreateCommentAutomationRequest(BaseModel):
    platform: CommentPlatform
    page_id: str = Field(min_length=1, max_length=255)
    page_name: str | None = Field(default=None, max_length=255)
    enabled: bool = True
    ai_prompt: str | None = None
    response_type: ResponseType = "ai"
    response_text: str | None = None
    keyword_triggers: list[str] = Field(default_factory=list)
    delay_seconds: int = 0
    also_send_dm: bool = False
    dm_message: str | None = None


class UpdateCommentAutomationRequest(BaseModel):
    enabled: bool | None = None
    ai_prompt: str | None = None
    response_type: ResponseType | None = None
    response_text: str | None = None
    keyword_triggers: list[str] | None = None
    delay_seconds: int | None = None
    also_send_dm: bool | None = None
    dm_message: str | None = None
    page_name: str | None = Field(default=None, max_length=255)
