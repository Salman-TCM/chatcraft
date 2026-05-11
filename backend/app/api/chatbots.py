import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentUser, DBSession
from app.models.chatbot_config import ChatbotConfig
from app.schemas.chat import ChatbotCreateRequest, ChatbotResponse, ChatbotUpdateRequest

router = APIRouter(prefix="/api/chatbots", tags=["chatbots"])


@router.get("", response_model=dict)
async def list_chatbots(user: CurrentUser, db: DBSession) -> dict:
    result = await db.execute(
        select(ChatbotConfig)
        .where(ChatbotConfig.user_id == user.id)
        .order_by(ChatbotConfig.created_at.desc())
    )
    bots = result.scalars().all()
    return {
        "success": True,
        "data": [ChatbotResponse.model_validate(b) for b in bots],
    }


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_chatbot(
    body: ChatbotCreateRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    bot = ChatbotConfig(
        user_id=user.id,
        name=body.name,
        default_model=body.default_model,
        fallback_model=body.fallback_model,
        allow_model_switch=body.allow_model_switch,
        system_prompt=body.system_prompt,
    )
    db.add(bot)
    await db.commit()
    await db.refresh(bot)
    return {"success": True, "data": ChatbotResponse.model_validate(bot)}


@router.get("/{chatbot_id}", response_model=dict)
async def get_chatbot(
    chatbot_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    bot = await _get_owned_bot(chatbot_id, user.id, db)
    return {"success": True, "data": ChatbotResponse.model_validate(bot)}


@router.put("/{chatbot_id}", response_model=dict)
async def update_chatbot(
    chatbot_id: uuid.UUID,
    body: ChatbotUpdateRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    bot = await _get_owned_bot(chatbot_id, user.id, db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(bot, field, value)
    await db.commit()
    await db.refresh(bot)
    return {"success": True, "data": ChatbotResponse.model_validate(bot)}


@router.delete("/{chatbot_id}", response_model=dict)
async def delete_chatbot(
    chatbot_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    bot = await _get_owned_bot(chatbot_id, user.id, db)
    await db.delete(bot)
    await db.commit()
    return {"success": True, "data": None}


# ── helpers ──────────────────────────────────────────────────────────────────

async def _get_owned_bot(
    chatbot_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession
) -> ChatbotConfig:
    bot = await db.get(ChatbotConfig, chatbot_id)
    if not bot or bot.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"success": False, "error": "Chatbot not found", "code": "NOT_FOUND"},
        )
    return bot
