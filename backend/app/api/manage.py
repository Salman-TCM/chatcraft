"""
Widget Management API — programmatic control via API tokens.

GET  /api/v1/me                                  — authenticated user info
GET  /api/manage/widgets                         — list all widgets (chatbots)
GET  /api/manage/widgets/{id}                    — full widget + chatbot config
PUT  /api/manage/widgets/{id}                    — update any widget/chatbot setting
DELETE /api/manage/widgets/{id}                  — delete widget
POST /api/manage/widgets/{id}/pause              — pause AI responses
POST /api/manage/widgets/{id}/unpause            — resume AI responses
POST /api/manage/widgets/{id}/enable-ai          — toggle AI per channel
GET  /api/manage/widgets/{id}/functions          — list functions assigned to widget
PUT  /api/manage/widgets/{id}/functions          — assign/replace functions on widget
GET  /api/manage/functions                       — list all user functions
GET  /api/manage/functions/{id}                  — function detail
PUT  /api/manage/functions/{id}                  — update function
DELETE /api/manage/functions/{id}                — delete function
POST /api/manage/functions/{id}/toggle           — toggle active
"""
import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentUser, DBSession
from app.models.chatbot_config import ChatbotConfig
from app.models.chatbot_function import ChatbotFunction, WidgetFunctionAssignment
from app.models.widget_config import WidgetConfig
from app.schemas.auth import MeResponse, UserResponse
from app.schemas.chat import ChatbotResponse
from app.schemas.manage import (
    CreateFunctionRequest,
    EnableAiChannelRequest,
    SetWidgetFunctionsRequest,
    UpdateFunctionRequest,
    UpdateWidgetRequest,
)

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
async def update_widget(widget_id: uuid.UUID, body: UpdateWidgetRequest, user: CurrentUser, db: DBSession) -> dict:
    bot = await _owned_bot(widget_id, user.id, db)
    for k, v in body.model_dump(exclude_unset=True).items():
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
async def enable_ai_channel(widget_id: uuid.UUID, body: EnableAiChannelRequest, user: CurrentUser, db: DBSession) -> dict:
    """Toggle AI on/off for a specific channel or all channels."""
    bot = await _owned_bot(widget_id, user.id, db)
    channel = body.channel
    enabled = body.enabled

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


# ── Helper ────────────────────────────────────────────────────────────────────

def _fn_dict(fn: ChatbotFunction) -> dict:
    return {
        "id": str(fn.id),
        "name": fn.name,
        "description": fn.description,
        "parameters_schema": fn.parameters_schema,
        "output_message": fn.output_message,
        "save_to_contact": fn.save_to_contact,
        "save_field_key": fn.save_field_key,
        "is_active": fn.is_active,
        "created_at": fn.created_at.isoformat(),
        "updated_at": fn.updated_at.isoformat(),
    }


async def _owned_fn(fn_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> ChatbotFunction:
    fn = await db.get(ChatbotFunction, fn_id)
    if not fn or fn.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"success": False, "error": "Function not found", "code": "NOT_FOUND"},
        )
    return fn


# ── Widget ↔ Functions ────────────────────────────────────────────────────────

@router.get("/api/manage/widgets/{bot_id}/functions", response_model=dict)
async def list_widget_functions(bot_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    bot = await _owned_bot(bot_id, user.id, db)
    result = await db.execute(
        select(WidgetFunctionAssignment).where(WidgetFunctionAssignment.widget_id == bot.id)
    )
    assignments = result.scalars().all()
    assigned_ids = {a.function_id for a in assignments}

    all_fn_res = await db.execute(
        select(ChatbotFunction).where(ChatbotFunction.user_id == user.id)
    )
    all_fns = all_fn_res.scalars().all()

    return {
        "success": True,
        "data": {
            "assigned": [_fn_dict(f) for f in all_fns if f.id in assigned_ids],
            "available": [_fn_dict(f) for f in all_fns if f.id not in assigned_ids],
        },
    }


@router.put("/api/manage/widgets/{bot_id}/functions", response_model=dict)
async def set_widget_functions(bot_id: uuid.UUID, body: SetWidgetFunctionsRequest, user: CurrentUser, db: DBSession) -> dict:
    """Replace the full set of assigned functions for a widget."""
    bot = await _owned_bot(bot_id, user.id, db)
    function_ids = body.function_ids

    # Delete existing assignments
    existing = await db.execute(
        select(WidgetFunctionAssignment).where(WidgetFunctionAssignment.widget_id == bot.id)
    )
    for a in existing.scalars().all():
        await db.delete(a)

    # Add new assignments (only for owned functions)
    for fn_id in function_ids:
        fn = await db.get(ChatbotFunction, fn_id)
        if fn and fn.user_id == user.id:
            db.add(WidgetFunctionAssignment(widget_id=bot.id, function_id=fn.id))

    await db.commit()
    return {"success": True, "data": {"function_ids": [str(fid) for fid in function_ids]}}


# ── Global Functions CRUD ─────────────────────────────────────────────────────

@router.get("/api/manage/functions", response_model=dict)
async def list_functions(user: CurrentUser, db: DBSession) -> dict:
    result = await db.execute(
        select(ChatbotFunction).where(ChatbotFunction.user_id == user.id)
        .order_by(ChatbotFunction.created_at.desc())
    )
    fns = result.scalars().all()
    return {"success": True, "data": [_fn_dict(f) for f in fns]}


@router.post("/api/manage/functions", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_function(body: CreateFunctionRequest, user: CurrentUser, db: DBSession) -> dict:
    fn = ChatbotFunction(
        user_id=user.id,
        name=body.name,
        description=body.description,
        parameters_schema=body.parameters_schema,
        output_message=body.output_message,
        save_to_contact=body.save_to_contact,
        save_field_key=body.save_field_key,
    )
    db.add(fn)
    await db.commit()
    await db.refresh(fn)
    return {"success": True, "data": _fn_dict(fn)}


@router.get("/api/manage/functions/{fn_id}", response_model=dict)
async def get_function(fn_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    fn = await _owned_fn(fn_id, user.id, db)
    return {"success": True, "data": _fn_dict(fn)}


@router.put("/api/manage/functions/{fn_id}", response_model=dict)
async def update_function(fn_id: uuid.UUID, body: UpdateFunctionRequest, user: CurrentUser, db: DBSession) -> dict:
    fn = await _owned_fn(fn_id, user.id, db)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(fn, k, v)
    await db.commit()
    await db.refresh(fn)
    return {"success": True, "data": _fn_dict(fn)}


@router.delete("/api/manage/functions/{fn_id}", response_model=dict)
async def delete_function(fn_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    fn = await _owned_fn(fn_id, user.id, db)
    await db.delete(fn)
    await db.commit()
    return {"success": True, "data": None}


@router.post("/api/manage/functions/{fn_id}/toggle", response_model=dict)
async def toggle_function(fn_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    fn = await _owned_fn(fn_id, user.id, db)
    fn.is_active = not fn.is_active
    await db.commit()
    return {"success": True, "data": {"is_active": fn.is_active}}
