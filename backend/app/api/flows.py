"""
Flow Builder API.

Routes:
  GET    /api/v1/flows                      — list flows
  POST   /api/v1/flows                      — create
  GET    /api/v1/flows/{id}                 — detail (with nodes + edges)
  PATCH  /api/v1/flows/{id}                 — update
  DELETE /api/v1/flows/{id}                 — delete
  POST   /api/v1/flows/{id}/duplicate       — clone
  POST   /api/v1/flows/{id}/toggle          — enable / disable
  POST   /api/v1/flows/{id}/trigger         — manually trigger for a contact
  GET    /api/v1/flows/{id}/runs            — run history
  POST   /webhooks/flow/{flow_id}/{secret}  — external webhook trigger (no auth)
"""
import secrets
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.core.dependencies import CurrentUser, DBSession
from app.models.flow import Flow, FlowRun

router = APIRouter(tags=["flows"])


# ── Simplified list (must be registered before /{flow_id} to avoid UUID parse) ─

@router.get("/api/v1/flows/list", response_model=dict)
async def list_flows_simple(user: CurrentUser, db: DBSession) -> dict:
    """Minimal list for integrations — id, name, is_active only."""
    result = await db.execute(
        select(Flow)
        .where(Flow.user_id == user.id)
        .order_by(Flow.name)
    )
    flows = result.scalars().all()
    return {
        "success": True,
        "data": [{"id": str(f.id), "name": f.name, "is_active": f.is_active} for f in flows],
    }


def _flow_dict(f: Flow, include_graph: bool = True) -> dict:
    d: dict = {
        "id": str(f.id),
        "name": f.name,
        "description": f.description,
        "is_active": f.is_active,
        "trigger_type": f.trigger_type,
        "trigger_config": f.trigger_config,
        "chatbot_id": str(f.chatbot_id) if f.chatbot_id else None,
        "webhook_secret": f.webhook_secret,
        "created_at": f.created_at.isoformat(),
        "updated_at": f.updated_at.isoformat(),
    }
    if include_graph:
        d["nodes"] = f.nodes or []
        d["edges"] = f.edges or []
    return d


async def _get_owned_flow(flow_id: uuid.UUID, user_id: uuid.UUID, db) -> Flow:
    flow = await db.get(Flow, flow_id)
    if not flow or flow.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flow not found")
    return flow


# ── CRUD ───────────────────────────────────────────────────────────────────────

@router.get("/api/v1/flows", response_model=dict)
async def list_flows(
    user: CurrentUser,
    db: DBSession,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
    chatbot_id: uuid.UUID | None = None,
) -> dict:
    offset = (page - 1) * limit
    stmt = (
        select(Flow)
        .where(Flow.user_id == user.id)
        .order_by(Flow.updated_at.desc())
        .offset(offset)
        .limit(limit)
    )
    if chatbot_id:
        stmt = stmt.where(Flow.chatbot_id == chatbot_id)

    result = await db.execute(stmt)
    flows = result.scalars().all()

    # Run counts
    count_stmt = select(func.count()).select_from(Flow).where(Flow.user_id == user.id)
    if chatbot_id:
        count_stmt = count_stmt.where(Flow.chatbot_id == chatbot_id)
    total = (await db.execute(count_stmt)).scalar_one()

    return {
        "success": True,
        "data": [_flow_dict(f, include_graph=False) for f in flows],
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.post("/api/v1/flows", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_flow(body: dict, user: CurrentUser, db: DBSession) -> dict:
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="name required")

    # Default canvas: start + end nodes
    default_nodes = [
        {"id": "start-1", "type": "start", "position": {"x": 250, "y": 50}, "data": {"label": "Start"}},
        {"id": "end-1", "type": "end", "position": {"x": 250, "y": 250}, "data": {"label": "End"}},
    ]
    default_edges = [
        {"id": "e-start-end", "source": "start-1", "target": "end-1"},
    ]

    flow = Flow(
        user_id=user.id,
        chatbot_id=body.get("chatbot_id"),
        name=name,
        description=body.get("description"),
        trigger_type=body.get("trigger_type"),
        trigger_config=body.get("trigger_config", {}),
        nodes=body.get("nodes", default_nodes),
        edges=body.get("edges", default_edges),
        webhook_secret=secrets.token_urlsafe(32),
    )
    db.add(flow)
    await db.commit()
    await db.refresh(flow)
    return {"success": True, "data": _flow_dict(flow)}


@router.get("/api/v1/flows/{flow_id}", response_model=dict)
async def get_flow(flow_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    flow = await _get_owned_flow(flow_id, user.id, db)
    return {"success": True, "data": _flow_dict(flow)}


@router.patch("/api/v1/flows/{flow_id}", response_model=dict)
async def update_flow(flow_id: uuid.UUID, body: dict, user: CurrentUser, db: DBSession) -> dict:
    flow = await _get_owned_flow(flow_id, user.id, db)
    for field in ("name", "description", "trigger_type", "trigger_config", "nodes", "edges", "chatbot_id"):
        if field in body:
            setattr(flow, field, body[field])
    await db.commit()
    await db.refresh(flow)
    return {"success": True, "data": _flow_dict(flow)}


@router.delete("/api/v1/flows/{flow_id}", response_model=dict)
async def delete_flow(flow_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    flow = await _get_owned_flow(flow_id, user.id, db)
    await db.delete(flow)
    await db.commit()
    return {"success": True, "data": None}


@router.post("/api/v1/flows/{flow_id}/duplicate", response_model=dict, status_code=status.HTTP_201_CREATED)
async def duplicate_flow(flow_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    flow = await _get_owned_flow(flow_id, user.id, db)
    copy = Flow(
        user_id=user.id,
        chatbot_id=flow.chatbot_id,
        name=f"{flow.name} (copy)",
        description=flow.description,
        trigger_type=flow.trigger_type,
        trigger_config=dict(flow.trigger_config or {}),
        nodes=list(flow.nodes or []),
        edges=list(flow.edges or []),
        webhook_secret=secrets.token_urlsafe(32),
    )
    db.add(copy)
    await db.commit()
    await db.refresh(copy)
    return {"success": True, "data": _flow_dict(copy)}


@router.post("/api/v1/flows/{flow_id}/toggle", response_model=dict)
async def toggle_flow(flow_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    flow = await _get_owned_flow(flow_id, user.id, db)
    flow.is_active = not flow.is_active
    await db.commit()
    return {"success": True, "data": {"is_active": flow.is_active}}


# ── Webhook config ────────────────────────────────────────────────────────────

@router.get("/api/v1/flows/{flow_id}/webhook", response_model=dict)
async def get_webhook_config(flow_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    flow = await _get_owned_flow(flow_id, user.id, db)
    base = ""  # resolved client-side; secret is sufficient
    return {
        "success": True,
        "data": {
            "webhook_secret": flow.webhook_secret,
            "webhook_enabled": flow.is_active,
            "flow_id": str(flow.id),
        },
    }


@router.post("/api/v1/flows/{flow_id}/webhook", response_model=dict)
async def configure_webhook(flow_id: uuid.UUID, body: dict, user: CurrentUser, db: DBSession) -> dict:
    flow = await _get_owned_flow(flow_id, user.id, db)
    if body.get("regenerate"):
        flow.webhook_secret = secrets.token_urlsafe(32)
    if "enabled" in body:
        flow.is_active = bool(body["enabled"])
    await db.commit()
    await db.refresh(flow)
    return {
        "success": True,
        "data": {
            "webhook_secret": flow.webhook_secret,
            "webhook_enabled": flow.is_active,
            "flow_id": str(flow.id),
        },
    }


# ── Manual trigger ─────────────────────────────────────────────────────────────

@router.post("/api/v1/flows/{flow_id}/trigger", response_model=dict, status_code=status.HTTP_201_CREATED)
async def trigger_flow(flow_id: uuid.UUID, body: dict, user: CurrentUser, db: DBSession) -> dict:
    flow = await _get_owned_flow(flow_id, user.id, db)
    if not flow.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Flow is not active")

    contact_id_str = body.get("contact_id")
    conversation_id_str = body.get("conversation_id")
    trigger_data = body.get("data", {})

    from app.services.flow.executor import start_run
    run = await start_run(
        flow=flow,
        db=db,
        contact_id=uuid.UUID(contact_id_str) if contact_id_str else None,
        conversation_id=uuid.UUID(conversation_id_str) if conversation_id_str else None,
        trigger_data=trigger_data,
    )
    return {
        "success": True,
        "data": {
            "run_id": str(run.id),
            "status": run.status,
            "context": run.context,
        },
    }


# ── Run history ────────────────────────────────────────────────────────────────

@router.get("/api/v1/flows/{flow_id}/runs", response_model=dict)
async def list_runs(
    flow_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> dict:
    flow = await _get_owned_flow(flow_id, user.id, db)
    offset = (page - 1) * limit

    result = await db.execute(
        select(FlowRun)
        .where(FlowRun.flow_id == flow.id)
        .order_by(FlowRun.started_at.desc())
        .offset(offset)
        .limit(limit)
    )
    runs = result.scalars().all()
    total = (await db.execute(
        select(func.count()).select_from(FlowRun).where(FlowRun.flow_id == flow.id)
    )).scalar_one()

    return {
        "success": True,
        "data": [
            {
                "id": str(r.id),
                "status": r.status,
                "contact_id": str(r.contact_id) if r.contact_id else None,
                "current_node_id": r.current_node_id,
                "started_at": r.started_at.isoformat(),
                "completed_at": r.completed_at.isoformat() if r.completed_at else None,
                "error": r.error,
            }
            for r in runs
        ],
        "total": total,
        "page": page,
        "limit": limit,
    }


# ── External webhook trigger ───────────────────────────────────────────────────

@router.post("/webhooks/flow/{flow_id}/{webhook_secret}", response_model=dict)
async def webhook_trigger(
    flow_id: uuid.UUID,
    webhook_secret: str,
    request_body: dict,
    db: DBSession,
) -> dict:
    flow = await db.get(Flow, flow_id)
    if not flow or not flow.is_active or flow.webhook_secret != webhook_secret:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flow not found")

    from app.services.flow.executor import start_run
    run = await start_run(flow=flow, db=db, trigger_data=request_body)
    return {"success": True, "data": {"run_id": str(run.id), "status": run.status}}
