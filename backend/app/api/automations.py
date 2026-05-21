"""
Automation Engine API.

Automations:
  GET    /api/v1/automations
  POST   /api/v1/automations
  GET    /api/v1/automations/{id}
  PATCH  /api/v1/automations/{id}
  DELETE /api/v1/automations/{id}
  POST   /api/v1/automations/{id}/toggle

Sequences:
  GET    /api/v1/sequences
  POST   /api/v1/sequences
  GET    /api/v1/sequences/{id}
  PATCH  /api/v1/sequences/{id}
  DELETE /api/v1/sequences/{id}
  POST   /api/v1/sequences/{id}/enroll
  DELETE /api/v1/sequences/{id}/enrollments/{enrollment_id}
  GET    /api/v1/sequences/{id}/enrollments

Keywords:
  GET    /api/v1/keywords
  POST   /api/v1/keywords
  GET    /api/v1/keywords/{id}
  PATCH  /api/v1/keywords/{id}
  DELETE /api/v1/keywords/{id}
"""
import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.core.dependencies import CurrentUser, DBSession
from app.models.automation import (
    Automation, AutomationRun, Keyword, Sequence, SequenceEnrollment,
)

router = APIRouter(prefix="/api/v1", tags=["automations"])


# ── Helpers ────────────────────────────────────────────────────────────────────

def _auto_dict(a: Automation) -> dict:
    return {
        "id": str(a.id),
        "name": a.name,
        "description": a.description,
        "trigger_type": a.trigger_type,
        "trigger_config": a.trigger_config,
        "action_type": a.action_type,
        "action_config": a.action_config,
        "enabled": a.enabled,
        "execution_count": a.execution_count,
        "last_executed_at": a.last_executed_at.isoformat() if a.last_executed_at else None,
        "created_at": a.created_at.isoformat(),
        "updated_at": a.updated_at.isoformat(),
    }


def _seq_dict(s: Sequence) -> dict:
    return {
        "id": str(s.id),
        "name": s.name,
        "description": s.description,
        "chatbot_id": str(s.chatbot_id) if s.chatbot_id else None,
        "auto_enroll": s.auto_enroll,
        "reply_behavior": s.reply_behavior,
        "steps": s.steps or [],
        "created_at": s.created_at.isoformat(),
        "updated_at": s.updated_at.isoformat(),
    }


def _kw_dict(k: Keyword) -> dict:
    return {
        "id": str(k.id),
        "chatbot_id": str(k.chatbot_id) if k.chatbot_id else None,
        "keywords": k.keywords or [],
        "match_type": k.match_type,
        "response_type": k.response_type,
        "response_text": k.response_text,
        "flow_id": str(k.flow_id) if k.flow_id else None,
        "is_active": k.is_active,
        "priority": k.priority,
        "created_at": k.created_at.isoformat(),
        "updated_at": k.updated_at.isoformat(),
    }


# ══════════════════════════════════════════════════════════════════════════════
# AUTOMATIONS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/automations", response_model=dict)
async def list_automations(
    user: CurrentUser, db: DBSession,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> dict:
    offset = (page - 1) * limit
    result = await db.execute(
        select(Automation).where(Automation.user_id == user.id)
        .order_by(Automation.created_at.desc()).offset(offset).limit(limit)
    )
    automations = result.scalars().all()
    total = (await db.execute(
        select(func.count()).select_from(Automation).where(Automation.user_id == user.id)
    )).scalar_one()
    return {"success": True, "data": [_auto_dict(a) for a in automations], "total": total}


@router.post("/automations", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_automation(body: dict, user: CurrentUser, db: DBSession) -> dict:
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="name required")
    a = Automation(
        user_id=user.id,
        name=name,
        description=body.get("description"),
        trigger_type=body.get("trigger_type", "new_contact"),
        trigger_config=body.get("trigger_config", {}),
        action_type=body.get("action_type", "send_message"),
        action_config=body.get("action_config", {}),
        enabled=body.get("enabled", True),
    )
    db.add(a)
    await db.commit()
    await db.refresh(a)
    return {"success": True, "data": _auto_dict(a)}


@router.get("/automations/{auto_id}", response_model=dict)
async def get_automation(auto_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    a = await db.get(Automation, auto_id)
    if not a or a.user_id != user.id:
        raise HTTPException(status_code=404, detail="Automation not found")
    return {"success": True, "data": _auto_dict(a)}


@router.patch("/automations/{auto_id}", response_model=dict)
async def update_automation(auto_id: uuid.UUID, body: dict, user: CurrentUser, db: DBSession) -> dict:
    a = await db.get(Automation, auto_id)
    if not a or a.user_id != user.id:
        raise HTTPException(status_code=404, detail="Automation not found")
    for field in ("name", "description", "trigger_type", "trigger_config", "action_type", "action_config", "enabled"):
        if field in body:
            setattr(a, field, body[field])
    await db.commit()
    await db.refresh(a)
    return {"success": True, "data": _auto_dict(a)}


@router.delete("/automations/{auto_id}", response_model=dict)
async def delete_automation(auto_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    a = await db.get(Automation, auto_id)
    if not a or a.user_id != user.id:
        raise HTTPException(status_code=404, detail="Automation not found")
    await db.delete(a)
    await db.commit()
    return {"success": True, "data": None}


@router.post("/automations/{auto_id}/toggle", response_model=dict)
async def toggle_automation(auto_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    a = await db.get(Automation, auto_id)
    if not a or a.user_id != user.id:
        raise HTTPException(status_code=404, detail="Automation not found")
    a.enabled = not a.enabled
    await db.commit()
    return {"success": True, "data": {"enabled": a.enabled}}


@router.get("/automations/{auto_id}/runs", response_model=dict)
async def list_automation_runs(
    auto_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> dict:
    a = await db.get(Automation, auto_id)
    if not a or a.user_id != user.id:
        raise HTTPException(status_code=404, detail="Automation not found")
    result = await db.execute(
        select(AutomationRun)
        .where(AutomationRun.automation_id == auto_id)
        .order_by(AutomationRun.executed_at.desc())
        .limit(limit)
    )
    runs = result.scalars().all()
    success_count = sum(1 for r in runs if r.status == "success")
    failed_count = sum(1 for r in runs if r.status == "failed")
    return {
        "success": True,
        "data": [
            {
                "id": str(r.id),
                "trigger_type": r.trigger_type,
                "action_type": r.action_type,
                "status": r.status,
                "error": r.error,
                "executed_at": r.executed_at.isoformat(),
            }
            for r in runs
        ],
        "stats": {"success": success_count, "failed": failed_count, "total": len(runs)},
    }


# ══════════════════════════════════════════════════════════════════════════════
# SEQUENCES
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/sequences", response_model=dict)
async def list_sequences(user: CurrentUser, db: DBSession) -> dict:
    result = await db.execute(
        select(Sequence).where(Sequence.user_id == user.id).order_by(Sequence.created_at.desc())
    )
    seqs = result.scalars().all()
    return {"success": True, "data": [_seq_dict(s) for s in seqs]}


@router.post("/sequences", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_sequence(body: dict, user: CurrentUser, db: DBSession) -> dict:
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="name required")
    s = Sequence(
        user_id=user.id,
        chatbot_id=body.get("chatbot_id"),
        name=name,
        description=body.get("description"),
        auto_enroll=body.get("auto_enroll", False),
        reply_behavior=body.get("reply_behavior", "stop"),
        steps=body.get("steps", []),
    )
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return {"success": True, "data": _seq_dict(s)}


@router.get("/sequences/{seq_id}", response_model=dict)
async def get_sequence(seq_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    s = await db.get(Sequence, seq_id)
    if not s or s.user_id != user.id:
        raise HTTPException(status_code=404, detail="Sequence not found")
    return {"success": True, "data": _seq_dict(s)}


@router.patch("/sequences/{seq_id}", response_model=dict)
async def update_sequence(seq_id: uuid.UUID, body: dict, user: CurrentUser, db: DBSession) -> dict:
    s = await db.get(Sequence, seq_id)
    if not s or s.user_id != user.id:
        raise HTTPException(status_code=404, detail="Sequence not found")
    for field in ("name", "description", "chatbot_id", "auto_enroll", "reply_behavior", "steps"):
        if field in body:
            setattr(s, field, body[field])
    await db.commit()
    await db.refresh(s)
    return {"success": True, "data": _seq_dict(s)}


@router.delete("/sequences/{seq_id}", response_model=dict)
async def delete_sequence(seq_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    s = await db.get(Sequence, seq_id)
    if not s or s.user_id != user.id:
        raise HTTPException(status_code=404, detail="Sequence not found")
    await db.delete(s)
    await db.commit()
    return {"success": True, "data": None}


@router.post("/sequences/{seq_id}/enroll", response_model=dict, status_code=status.HTTP_201_CREATED)
async def enroll_contact(seq_id: uuid.UUID, body: dict, user: CurrentUser, db: DBSession) -> dict:
    s = await db.get(Sequence, seq_id)
    if not s or s.user_id != user.id:
        raise HTTPException(status_code=404, detail="Sequence not found")

    contact_id_str = body.get("contact_id", "")
    if not contact_id_str:
        raise HTTPException(status_code=422, detail="contact_id required")
    contact_id = uuid.UUID(contact_id_str)

    # Upsert enrollment
    existing = await db.execute(
        select(SequenceEnrollment).where(
            SequenceEnrollment.sequence_id == seq_id,
            SequenceEnrollment.contact_id == contact_id,
        )
    )
    enrollment = existing.scalar_one_or_none()
    if enrollment:
        enrollment.status = "active"
        enrollment.current_step = 0
        enrollment.completed_at = None
    else:
        enrollment = SequenceEnrollment(
            sequence_id=seq_id, contact_id=contact_id, status="active", current_step=0
        )
        db.add(enrollment)

    await db.commit()
    await db.refresh(enrollment)

    # Schedule first step if there are steps
    if s.steps:
        first_step = s.steps[0]
        delay_s = _step_delay(first_step)
        from app.workers.sequence_worker import advance_enrollment
        advance_enrollment.apply_async(args=[str(enrollment.id)], countdown=delay_s)

    return {
        "success": True,
        "data": {
            "id": str(enrollment.id),
            "sequence_id": str(seq_id),
            "contact_id": str(contact_id),
            "status": enrollment.status,
            "current_step": enrollment.current_step,
        },
    }


@router.get("/sequences/{seq_id}/enrollments", response_model=dict)
async def list_enrollments(seq_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    s = await db.get(Sequence, seq_id)
    if not s or s.user_id != user.id:
        raise HTTPException(status_code=404, detail="Sequence not found")

    result = await db.execute(
        select(SequenceEnrollment)
        .where(SequenceEnrollment.sequence_id == seq_id)
        .order_by(SequenceEnrollment.enrolled_at.desc())
    )
    enrollments = result.scalars().all()
    total_active = sum(1 for e in enrollments if e.status == "active")
    total_completed = sum(1 for e in enrollments if e.status == "completed")
    total_cancelled = sum(1 for e in enrollments if e.status == "cancelled")

    return {
        "success": True,
        "data": [
            {
                "id": str(e.id),
                "contact_id": str(e.contact_id),
                "status": e.status,
                "current_step": e.current_step,
                "enrolled_at": e.enrolled_at.isoformat(),
                "completed_at": e.completed_at.isoformat() if e.completed_at else None,
            }
            for e in enrollments
        ],
        "stats": {
            "active": total_active,
            "completed": total_completed,
            "cancelled": total_cancelled,
            "total": len(enrollments),
        },
    }


@router.delete("/sequences/{seq_id}/enrollments/{enrollment_id}", response_model=dict)
async def unenroll(seq_id: uuid.UUID, enrollment_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    s = await db.get(Sequence, seq_id)
    if not s or s.user_id != user.id:
        raise HTTPException(status_code=404, detail="Sequence not found")
    enrollment = await db.get(SequenceEnrollment, enrollment_id)
    if not enrollment or enrollment.sequence_id != seq_id:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    enrollment.status = "cancelled"
    await db.commit()
    return {"success": True, "data": None}


def _step_delay(step: dict) -> int:
    amount = int(step.get("delay_amount", 0))
    unit = step.get("delay_unit", "seconds")
    return amount * {"seconds": 1, "minutes": 60, "hours": 3600, "days": 86400}.get(unit, 1)


# ══════════════════════════════════════════════════════════════════════════════
# KEYWORDS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/keywords", response_model=dict)
async def list_keywords(
    user: CurrentUser, db: DBSession,
    chatbot_id: uuid.UUID | None = None,
) -> dict:
    stmt = select(Keyword).where(Keyword.user_id == user.id).order_by(Keyword.priority.desc(), Keyword.created_at)
    if chatbot_id:
        stmt = stmt.where(Keyword.chatbot_id == chatbot_id)
    result = await db.execute(stmt)
    return {"success": True, "data": [_kw_dict(k) for k in result.scalars().all()]}


@router.post("/keywords", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_keyword(body: dict, user: CurrentUser, db: DBSession) -> dict:
    kws = body.get("keywords", [])
    if not kws:
        raise HTTPException(status_code=422, detail="keywords array required")
    k = Keyword(
        user_id=user.id,
        chatbot_id=body.get("chatbot_id"),
        keywords=kws,
        match_type=body.get("match_type", "contains"),
        response_type=body.get("response_type", "text"),
        response_text=body.get("response_text"),
        flow_id=body.get("flow_id"),
        is_active=body.get("is_active", True),
        priority=body.get("priority", 0),
    )
    db.add(k)
    await db.commit()
    await db.refresh(k)
    return {"success": True, "data": _kw_dict(k)}


@router.get("/keywords/{kw_id}", response_model=dict)
async def get_keyword(kw_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    k = await db.get(Keyword, kw_id)
    if not k or k.user_id != user.id:
        raise HTTPException(status_code=404, detail="Keyword not found")
    return {"success": True, "data": _kw_dict(k)}


@router.patch("/keywords/{kw_id}", response_model=dict)
async def update_keyword(kw_id: uuid.UUID, body: dict, user: CurrentUser, db: DBSession) -> dict:
    k = await db.get(Keyword, kw_id)
    if not k or k.user_id != user.id:
        raise HTTPException(status_code=404, detail="Keyword not found")
    for field in ("keywords", "match_type", "response_type", "response_text", "flow_id", "is_active", "priority", "chatbot_id"):
        if field in body:
            setattr(k, field, body[field])
    await db.commit()
    await db.refresh(k)
    return {"success": True, "data": _kw_dict(k)}


@router.delete("/keywords/{kw_id}", response_model=dict)
async def delete_keyword(kw_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    k = await db.get(Keyword, kw_id)
    if not k or k.user_id != user.id:
        raise HTTPException(status_code=404, detail="Keyword not found")
    await db.delete(k)
    await db.commit()
    return {"success": True, "data": None}
