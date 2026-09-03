"""
Agent Schedules API — CRUD for automated agent run schedules.

GET    /api/v1/agents/{agent_id}/schedules
POST   /api/v1/agents/{agent_id}/schedules
PUT    /api/v1/agents/{agent_id}/schedules/{schedule_id}
DELETE /api/v1/agents/{agent_id}/schedules/{schedule_id}
POST   /api/v1/agents/{agent_id}/schedules/{schedule_id}/run  (trigger immediately)
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.dependencies import CurrentUser, DBSession, require_feature
from app.core.features import AGENT_BUILDER
from app.models.agent import Agent
from app.models.agent_schedule import AgentSchedule

router = APIRouter(
    prefix="/api/v1/agents",
    tags=["agent-schedules"],
    dependencies=[Depends(require_feature(AGENT_BUILDER))],
)


# ─── Schemas ──────────────────────────────────────────────────────────────────


class ScheduleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    trigger_prompt: str = Field(..., min_length=1, max_length=4000)
    hour: int = Field(..., ge=0, le=23)
    minute: int = Field(0, ge=0, le=59)
    days_of_week: str = Field("*", pattern=r"^(\*|[0-6](,[0-6])*)$")
    notify_email: str | None = Field(None, max_length=320)
    notify_phone: str | None = Field(None, max_length=30)
    alert_pct_threshold: float | None = Field(None, ge=0.1, le=100)
    is_active: bool = True


class ScheduleUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    trigger_prompt: str | None = Field(None, min_length=1, max_length=4000)
    hour: int | None = Field(None, ge=0, le=23)
    minute: int | None = Field(None, ge=0, le=59)
    days_of_week: str | None = Field(None, pattern=r"^(\*|[0-6](,[0-6])*)$")
    notify_email: str | None = None
    notify_phone: str | None = None
    alert_pct_threshold: float | None = None
    is_active: bool | None = None


def _serialize(s: AgentSchedule) -> dict:
    return {
        "id": str(s.id),
        "agent_id": str(s.agent_id),
        "name": s.name,
        "trigger_prompt": s.trigger_prompt,
        "hour": s.hour,
        "minute": s.minute,
        "days_of_week": s.days_of_week,
        "notify_email": s.notify_email,
        "notify_phone": s.notify_phone,
        "alert_pct_threshold": s.alert_pct_threshold,
        "is_active": s.is_active,
        "last_run_at": s.last_run_at.isoformat() if s.last_run_at else None,
        "last_result_preview": s.last_result_preview,
        "created_at": s.created_at.isoformat(),
    }


async def _get_owned_agent(agent_id: uuid.UUID, user_id: uuid.UUID, db) -> Agent:
    result = await db.execute(select(Agent).where(Agent.id == agent_id, Agent.user_id == user_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


async def _get_owned_schedule(
    agent_id: uuid.UUID, schedule_id: uuid.UUID, user_id: uuid.UUID, db
) -> AgentSchedule:
    result = await db.execute(
        select(AgentSchedule).where(
            AgentSchedule.id == schedule_id,
            AgentSchedule.agent_id == agent_id,
            AgentSchedule.user_id == user_id,
        )
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return s


# ─── Endpoints ────────────────────────────────────────────────────────────────


@router.get("/{agent_id}/schedules")
async def list_schedules(agent_id: uuid.UUID, user: CurrentUser, db: DBSession):
    await _get_owned_agent(agent_id, user.id, db)
    result = await db.execute(
        select(AgentSchedule)
        .where(AgentSchedule.agent_id == agent_id, AgentSchedule.user_id == user.id)
        .order_by(AgentSchedule.created_at)
    )
    return {"success": True, "data": [_serialize(s) for s in result.scalars().all()]}


@router.post("/{agent_id}/schedules", status_code=status.HTTP_201_CREATED)
async def create_schedule(
    agent_id: uuid.UUID, body: ScheduleCreate, user: CurrentUser, db: DBSession
):
    await _get_owned_agent(agent_id, user.id, db)
    if not body.notify_email and not body.notify_phone:
        raise HTTPException(
            status_code=422,
            detail="At least one notification channel (email or phone) is required.",
        )
    s = AgentSchedule(
        agent_id=agent_id,
        user_id=user.id,
        **body.model_dump(),
    )
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return {"success": True, "data": _serialize(s)}


@router.put("/{agent_id}/schedules/{schedule_id}")
async def update_schedule(
    agent_id: uuid.UUID,
    schedule_id: uuid.UUID,
    body: ScheduleUpdate,
    user: CurrentUser,
    db: DBSession,
):
    s = await _get_owned_schedule(agent_id, schedule_id, user.id, db)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    await db.commit()
    await db.refresh(s)
    return {"success": True, "data": _serialize(s)}


@router.delete("/{agent_id}/schedules/{schedule_id}")
async def delete_schedule(
    agent_id: uuid.UUID, schedule_id: uuid.UUID, user: CurrentUser, db: DBSession
):
    s = await _get_owned_schedule(agent_id, schedule_id, user.id, db)
    await db.delete(s)
    await db.commit()
    return {"success": True}


@router.post("/{agent_id}/schedules/{schedule_id}/run")
async def trigger_schedule_now(
    agent_id: uuid.UUID, schedule_id: uuid.UUID, user: CurrentUser, db: DBSession
):
    """Manually trigger a scheduled run immediately (for testing)."""
    s = await _get_owned_schedule(agent_id, schedule_id, user.id, db)
    from app.workers.celery_app import celery_app

    celery_app.send_task("workers.run_scheduled_agent", args=[str(s.id)], queue="default")
    return {"success": True, "message": "Schedule triggered — result will be delivered to configured channels."}
