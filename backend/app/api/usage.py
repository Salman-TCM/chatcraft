"""
Usage API
  GET /api/usage/summary  — current month totals by category
  GET /api/usage/history  — 30-day per-day breakdown
  GET /api/usage/cost     — cost breakdown by model/service
"""
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select, text

from app.core.dependencies import CurrentUser, DBSession
from app.models.usage_log import UsageLog

router = APIRouter(prefix="/api/usage", tags=["usage"])


@router.get("/summary", response_model=dict)
async def get_summary(user: CurrentUser, db: DBSession) -> dict:
    """Return current-month usage totals for the authenticated user."""
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    result = await db.execute(
        select(
            func.coalesce(func.sum(UsageLog.input_tokens), 0).label("input_tokens"),
            func.coalesce(func.sum(UsageLog.output_tokens), 0).label("output_tokens"),
            func.coalesce(func.sum(UsageLog.tts_chars), 0).label("tts_chars"),
            func.coalesce(func.sum(UsageLog.stt_secs), 0).label("stt_secs"),
            func.coalesce(func.sum(UsageLog.embedding_tokens), 0).label("embedding_tokens"),
            func.coalesce(func.sum(UsageLog.cost_usd), 0).label("cost_usd"),
            func.count(UsageLog.id).label("requests"),
        ).where(
            UsageLog.user_id == user.id,
            UsageLog.created_at >= month_start,
        )
    )
    row = result.one()

    return {
        "success": True,
        "data": {
            "period": f"{now.year}-{now.month:02d}",
            "input_tokens": int(row.input_tokens),
            "output_tokens": int(row.output_tokens),
            "total_tokens": int(row.input_tokens) + int(row.output_tokens),
            "tts_chars": int(row.tts_chars),
            "stt_secs": float(row.stt_secs),
            "embedding_tokens": int(row.embedding_tokens),
            "cost_usd": str(row.cost_usd),
            "requests": int(row.requests),
        },
    }


@router.get("/history", response_model=dict)
async def get_history(user: CurrentUser, db: DBSession) -> dict:
    """Return per-day usage for the last 30 days."""
    since = date.today() - timedelta(days=29)

    result = await db.execute(
        select(
            func.date(UsageLog.created_at).label("day"),
            func.coalesce(func.sum(UsageLog.input_tokens + UsageLog.output_tokens), 0).label("tokens"),
            func.coalesce(func.sum(UsageLog.tts_chars), 0).label("tts_chars"),
            func.coalesce(func.sum(UsageLog.cost_usd), 0).label("cost_usd"),
            func.count(UsageLog.id).label("requests"),
        ).where(
            UsageLog.user_id == user.id,
            func.date(UsageLog.created_at) >= since,
        ).group_by(func.date(UsageLog.created_at))
        .order_by(func.date(UsageLog.created_at))
    )
    rows = result.all()

    # Fill in zero-rows for days with no activity
    row_map = {str(r.day): r for r in rows}
    history = []
    for i in range(30):
        day = since + timedelta(days=i)
        key = str(day)
        r = row_map.get(key)
        history.append({
            "date": key,
            "tokens": int(r.tokens) if r else 0,
            "tts_chars": int(r.tts_chars) if r else 0,
            "cost_usd": str(r.cost_usd) if r else "0",
            "requests": int(r.requests) if r else 0,
        })

    return {"success": True, "data": history}


@router.get("/cost", response_model=dict)
async def get_cost_breakdown(user: CurrentUser, db: DBSession) -> dict:
    """Return cost breakdown by model and service for the current month."""
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # By model
    model_result = await db.execute(
        select(
            UsageLog.model,
            func.coalesce(func.sum(UsageLog.input_tokens), 0).label("input_tokens"),
            func.coalesce(func.sum(UsageLog.output_tokens), 0).label("output_tokens"),
            func.coalesce(func.sum(UsageLog.cost_usd), 0).label("cost_usd"),
            func.count(UsageLog.id).label("requests"),
        ).where(
            UsageLog.user_id == user.id,
            UsageLog.created_at >= month_start,
            UsageLog.model.isnot(None),
            UsageLog.input_tokens + UsageLog.output_tokens > 0,
        ).group_by(UsageLog.model)
        .order_by(func.sum(UsageLog.cost_usd).desc())
    )

    by_model = [
        {
            "model": r.model,
            "input_tokens": int(r.input_tokens),
            "output_tokens": int(r.output_tokens),
            "cost_usd": str(r.cost_usd),
            "requests": int(r.requests),
        }
        for r in model_result.all()
    ]

    # Service totals
    svc_result = await db.execute(
        select(
            func.coalesce(func.sum(UsageLog.cost_usd), 0).label("llm_cost"),
            func.coalesce(func.sum(UsageLog.tts_chars), 0).label("tts_chars"),
            func.coalesce(func.sum(UsageLog.stt_secs), 0).label("stt_secs"),
            func.coalesce(func.sum(UsageLog.embedding_tokens), 0).label("embedding_tokens"),
        ).where(
            UsageLog.user_id == user.id,
            UsageLog.created_at >= month_start,
        )
    )
    svc = svc_result.one()

    return {
        "success": True,
        "data": {
            "by_model": by_model,
            "services": {
                "llm_cost_usd": str(svc.llm_cost),
                "tts_chars": int(svc.tts_chars),
                "stt_secs": float(svc.stt_secs),
                "embedding_tokens": int(svc.embedding_tokens),
            },
        },
    }
