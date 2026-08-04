"""
Analytics API — creator dashboard data.
  GET /api/analytics/overview          — MRR, subscribers, conversations, messages
  GET /api/analytics/messages-per-day  — 30-day message volume
  GET /api/analytics/model-breakdown   — token/cost split by model
  GET /api/analytics/satisfaction      — thumbs-up/down ratio
  GET /api/analytics/conversations     — paginated conversation log
"""

import uuid
from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.dependencies import CurrentUser, DBSession, require_feature
from app.core.features import ANALYTICS
from app.models.chatbot_config import ChatbotConfig
from app.models.conversation import Conversation
from app.models.message import Message, MessageRole
from app.models.usage_log import UsageLog
from app.schemas.chat import ConversationResponse

router = APIRouter(
    prefix="/api/analytics", tags=["analytics"], dependencies=[Depends(require_feature(ANALYTICS))]
)


@router.get("/overview", response_model=dict)
async def get_overview(user: CurrentUser, db: DBSession) -> dict:
    """High-level KPIs for all chatbots owned by the user."""
    now = datetime.now(UTC)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    prev_month_start = (month_start - timedelta(days=1)).replace(day=1)

    # Owned chatbot IDs
    bot_ids_result = await db.execute(
        select(ChatbotConfig.id).where(ChatbotConfig.user_id == user.id)
    )
    bot_ids = [r[0] for r in bot_ids_result.all()]

    if not bot_ids:
        return {"success": True, "data": _empty_overview()}

    # Total conversations this month
    conv_result = await db.execute(
        select(func.count())
        .select_from(Conversation)
        .where(
            Conversation.chatbot_id.in_(bot_ids),
            Conversation.created_at >= month_start,
        )
    )
    conversations_this_month = conv_result.scalar_one()

    # Total messages this month
    msg_result = await db.execute(
        select(func.count())
        .select_from(Message)
        .join(Conversation, Message.conversation_id == Conversation.id)
        .where(
            Conversation.chatbot_id.in_(bot_ids),
            Message.role == MessageRole.user,
            Message.created_at >= month_start,
        )
    )
    messages_this_month = msg_result.scalar_one()

    # Cost this month
    cost_result = await db.execute(
        select(func.coalesce(func.sum(UsageLog.cost_usd), 0)).where(
            UsageLog.chatbot_id.in_(bot_ids),
            UsageLog.created_at >= month_start,
        )
    )
    cost_this_month = cost_result.scalar_one()

    # Unique users (non-null user_id) this month
    unique_result = await db.execute(
        select(func.count(func.distinct(Conversation.user_id))).where(
            Conversation.chatbot_id.in_(bot_ids),
            Conversation.user_id.isnot(None),
            Conversation.created_at >= month_start,
        )
    )
    unique_users = unique_result.scalar_one()

    return {
        "success": True,
        "data": {
            "conversations_this_month": conversations_this_month,
            "messages_this_month": messages_this_month,
            "unique_users_this_month": unique_users,
            "cost_usd_this_month": str(cost_this_month),
            "chatbot_count": len(bot_ids),
        },
    }


@router.get("/messages-per-day", response_model=dict)
async def get_messages_per_day(
    user: CurrentUser,
    db: DBSession,
    chatbot_id: uuid.UUID | None = None,
    days: int = Query(30, ge=7, le=90),
) -> dict:
    since = date.today() - timedelta(days=days - 1)

    bot_ids = await _owned_bot_ids(user.id, db)
    if not bot_ids:
        return {"success": True, "data": _zero_days(since, days)}

    filter_bots = [chatbot_id] if chatbot_id and chatbot_id in bot_ids else bot_ids

    result = await db.execute(
        select(
            func.date(Message.created_at).label("day"),
            func.count().label("count"),
        )
        .join(Conversation, Message.conversation_id == Conversation.id)
        .where(
            Conversation.chatbot_id.in_(filter_bots),
            Message.role == MessageRole.user,
            func.date(Message.created_at) >= since,
        )
        .group_by(func.date(Message.created_at))
        .order_by(func.date(Message.created_at))
    )
    row_map = {str(r.day): int(r.count) for r in result.all()}

    data = [
        {
            "date": str(since + timedelta(days=i)),
            "count": row_map.get(str(since + timedelta(days=i)), 0),
        }
        for i in range(days)
    ]
    return {"success": True, "data": data}


@router.get("/model-breakdown", response_model=dict)
async def get_model_breakdown(user: CurrentUser, db: DBSession) -> dict:
    now = datetime.now(UTC)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    bot_ids = await _owned_bot_ids(user.id, db)

    result = await db.execute(
        select(
            UsageLog.model,
            func.coalesce(func.sum(UsageLog.input_tokens + UsageLog.output_tokens), 0).label(
                "tokens"
            ),
            func.coalesce(func.sum(UsageLog.cost_usd), 0).label("cost_usd"),
            func.count().label("requests"),
        )
        .where(
            UsageLog.chatbot_id.in_(bot_ids) if bot_ids else UsageLog.chatbot_id.is_(None),
            UsageLog.created_at >= month_start,
            UsageLog.model.isnot(None),
        )
        .group_by(UsageLog.model)
        .order_by(func.sum(UsageLog.cost_usd).desc())
    )
    return {
        "success": True,
        "data": [
            {
                "model": r.model,
                "tokens": int(r.tokens),
                "cost_usd": str(r.cost_usd),
                "requests": int(r.requests),
            }
            for r in result.all()
        ],
    }


@router.get("/satisfaction", response_model=dict)
async def get_satisfaction(user: CurrentUser, db: DBSession) -> dict:
    bot_ids = await _owned_bot_ids(user.id, db)

    result = await db.execute(
        select(
            Message.feedback,
            func.count().label("count"),
        )
        .join(Conversation, Message.conversation_id == Conversation.id)
        .where(
            Conversation.chatbot_id.in_(bot_ids) if bot_ids else Conversation.chatbot_id.is_(None),
            Message.feedback.isnot(None),
        )
        .group_by(Message.feedback)
    )
    counts = {str(r.feedback): int(r.count) for r in result.all()}
    up = counts.get("thumbs_up", 0)
    down = counts.get("thumbs_down", 0)
    total = up + down
    rate = round(up / total * 100, 1) if total > 0 else None

    return {
        "success": True,
        "data": {"thumbs_up": up, "thumbs_down": down, "satisfaction_rate": rate},
    }


@router.get("/conversations", response_model=dict)
async def get_conversations(
    user: CurrentUser,
    db: DBSession,
    chatbot_id: uuid.UUID | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: str | None = None,
) -> dict:
    bot_ids = await _owned_bot_ids(user.id, db)
    if not bot_ids:
        return {"success": True, "data": [], "total": 0, "page": page, "per_page": per_page}

    filter_bots = [chatbot_id] if chatbot_id and chatbot_id in bot_ids else bot_ids

    base_filter = [Conversation.chatbot_id.in_(filter_bots)]

    total_result = await db.execute(
        select(func.count()).select_from(Conversation).where(*base_filter)
    )
    total = total_result.scalar_one()

    q = (
        select(Conversation)
        .where(*base_filter)
        .options(selectinload(Conversation.messages))
        .order_by(Conversation.updated_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(q)
    convs = result.scalars().all()

    return {
        "success": True,
        "data": [ConversationResponse.model_validate(c) for c in convs],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


# ── Helpers ───────────────────────────────────────────────────────────────────


async def _owned_bot_ids(user_id: uuid.UUID, db) -> list[uuid.UUID]:
    result = await db.execute(select(ChatbotConfig.id).where(ChatbotConfig.user_id == user_id))
    return [r[0] for r in result.all()]


def _empty_overview() -> dict:
    return {
        "conversations_this_month": 0,
        "messages_this_month": 0,
        "unique_users_this_month": 0,
        "cost_usd_this_month": "0",
        "chatbot_count": 0,
    }


def _zero_days(since: date, days: int) -> list:
    return [{"date": str(since + timedelta(days=i)), "count": 0} for i in range(days)]
