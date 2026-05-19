"""
Widget Management API — programmatic control via API tokens.

GET  /api/v1/me                         — authenticated user info
GET  /api/manage/widgets                — list all widgets (chatbots)
GET  /api/manage/widgets/{id}           — full widget + chatbot config
PUT  /api/manage/widgets/{id}           — update any widget/chatbot setting
DELETE /api/manage/widgets/{id}         — delete widget
POST /api/manage/widgets/{id}/pause     — pause AI responses
POST /api/manage/widgets/{id}/unpause   — resume AI responses
POST /api/manage/widgets/{id}/enable-ai — toggle AI per channel
"""
import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentUser, DBSession
from app.models.chatbot_config import ChatbotConfig
from app.models.widget_config import WidgetConfig
from app.schemas.auth import MeResponse, UserResponse
from app.schemas.chat import ChatbotResponse

router = APIRouter(tags=["manage"])


# ── /api/v1/me ────────────────────────────────────────────────────────────────

@router.get("/api/v1/me", response_model=MeResponse)
async def get_me(user: CurrentUser) -> MeResponse:
    return MeResponse(data=UserResponse.model_validate(user))


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _owned_bot(bot_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> ChatbotConfig:
    bot = await db.get(ChatbotConfig, bot_id)
    if not bot or bot.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"success": False, "error": "Widget not found", "code": "NOT_FOUND"},
        )
    return bot


def _widget_dict(bot: ChatbotConfig, wc: WidgetConfig | None) -> dict:
    d = ChatbotResponse.model_validate(bot).model_dump()
    d["widget"] = {
        "embed_token": wc.embed_token if wc else None,
        "allowed_domains": wc.allowed_domains if wc else None,
        "position": wc.position if wc else "bottom-right",
        "show_branding": wc.show_branding if wc else True,
    } if wc else None
    return d


# ── Widget endpoints ──────────────────────────────────────────────────────────

@router.get("/api/manage/widgets", response_model=dict)
async def list_widgets(user: CurrentUser, db: DBSession) -> dict:
    result = await db.execute(
        select(ChatbotConfig)
        .where(ChatbotConfig.user_id == user.id)
        .order_by(ChatbotConfig.created_at.desc())
    )
    bots = result.scalars().all()
    return {
        "success": True,
        "data": [
            {
                "id": str(b.id),
                "name": b.name,
                "published": b.published,
                "ai_paused": b.ai_paused,
                "default_model": b.default_model,
                "created_at": b.created_at.isoformat(),
            }
            for b in bots
        ],
    }


@router.get("/api/manage/widgets/{widget_id}", response_model=dict)
async def get_widget(widget_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    bot = await _owned_bot(widget_id, user.id, db)
    result = await db.execute(
        select(WidgetConfig).where(WidgetConfig.chatbot_id == bot.id)
    )
    wc = result.scalar_one_or_none()
    return {"success": True, "data": _widget_dict(bot, wc)}


@router.put("/api/manage/widgets/{widget_id}", response_model=dict)
async def update_widget(widget_id: uuid.UUID, body: dict, user: CurrentUser, db: DBSession) -> dict:
    bot = await _owned_bot(widget_id, user.id, db)
    updatable = {
        "name", "default_model", "fallback_model", "allow_model_switch",
        "system_prompt", "published", "ai_paused",
        "primary_colour", "secondary_colour", "background_colour",
        "font_family", "welcome_message", "placeholder_text",
        "bubble_style", "dark_mode",
        "tts_enabled", "stt_enabled", "auto_play_tts",
        "voice_id", "voice_stability", "voice_similarity_boost",
    }
    for k, v in body.items():
        if k in updatable:
            setattr(bot, k, v)
    await db.commit()
    await db.refresh(bot)
    result = await db.execute(
        select(WidgetConfig).where(WidgetConfig.chatbot_id == bot.id)
    )
    wc = result.scalar_one_or_none()
    return {"success": True, "data": _widget_dict(bot, wc)}


@router.delete("/api/manage/widgets/{widget_id}", response_model=dict)
async def delete_widget(widget_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    bot = await _owned_bot(widget_id, user.id, db)
    await db.delete(bot)
    await db.commit()
    return {"success": True, "data": None}


@router.post("/api/manage/widgets/{widget_id}/pause", response_model=dict)
async def pause_widget(widget_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    bot = await _owned_bot(widget_id, user.id, db)
    bot.ai_paused = True
    await db.commit()
    return {"success": True, "data": {"ai_paused": True}}


@router.post("/api/manage/widgets/{widget_id}/unpause", response_model=dict)
async def unpause_widget(widget_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    bot = await _owned_bot(widget_id, user.id, db)
    bot.ai_paused = False
    await db.commit()
    return {"success": True, "data": {"ai_paused": False}}


@router.post("/api/manage/widgets/{widget_id}/enable-ai", response_model=dict)
async def enable_ai_channel(widget_id: uuid.UUID, body: dict, user: CurrentUser, db: DBSession) -> dict:
    """Toggle AI on/off for a specific channel or all channels."""
    bot = await _owned_bot(widget_id, user.id, db)
    channel = (body.get("channel") or "all").lower()
    enabled = bool(body.get("enabled", True))

    if channel == "all":
        bot.ai_paused = not enabled
        await db.commit()
        return {"success": True, "data": {"channel": "all", "enabled": enabled}}

    from app.models.channel_integration import ChannelIntegration
    result = await db.execute(
        select(ChannelIntegration).where(
            ChannelIntegration.chatbot_id == bot.id,
            ChannelIntegration.channel == channel,
        )
    )
    ci = result.scalar_one_or_none()
    if not ci:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"success": False, "error": f"Channel '{channel}' not configured", "code": "NOT_FOUND"},
        )
    ci.is_active = enabled
    await db.commit()
    return {"success": True, "data": {"channel": channel, "enabled": enabled}}
