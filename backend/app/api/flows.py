"""
Flow Builder API.

Routes:
  GET    /api/v1/flows                      — list flows
  POST   /api/v1/flows                      — create
  POST   /api/v1/flows/generate             — AI-generate flow from NL description
  GET    /api/v1/flows/{id}                 — detail (with nodes + edges)
  PATCH  /api/v1/flows/{id}                 — update
  DELETE /api/v1/flows/{id}                 — delete
  POST   /api/v1/flows/{id}/duplicate       — clone
  POST   /api/v1/flows/{id}/toggle          — enable / disable
  POST   /api/v1/flows/{id}/trigger         — manually trigger for a contact
  GET    /api/v1/flows/{id}/runs            — run history
  POST   /webhooks/flow/{flow_id}/{secret}  — external webhook trigger (no auth)

Folder routes:
  GET    /api/v1/flows/folders              — list folders
  POST   /api/v1/flows/folders              — create folder
  PATCH  /api/v1/flows/folders/{id}         — rename / recolour
  DELETE /api/v1/flows/folders/{id}         — delete (flows moved to no-folder)
"""

import json
import re
import secrets
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select

from app.core.dependencies import CurrentUser, DBSession, require_feature
from app.core.features import FLOWS
from app.models.flow import Flow, FlowFolder, FlowRun
from app.schemas.flows import (
    FlowCreate,
    FlowFolderCreate,
    FlowFolderUpdate,
    FlowGenerateRequest,
    FlowTriggerRequest,
    FlowUpdate,
    WebhookConfigureRequest,
)

router = APIRouter(tags=["flows"], dependencies=[Depends(require_feature(FLOWS))])


# ── Simplified list (must be registered before /{flow_id} to avoid UUID parse) ─


@router.get("/api/v1/flows/list", response_model=dict)
async def list_flows_simple(user: CurrentUser, db: DBSession) -> dict:
    """Minimal list for integrations — id, name, is_active only."""
    result = await db.execute(select(Flow).where(Flow.user_id == user.id).order_by(Flow.name))
    flows = result.scalars().all()
    return {
        "success": True,
        "data": [{"id": str(f.id), "name": f.name, "is_active": f.is_active} for f in flows],
    }


_FLOW_SYSTEM_PROMPT = """\
You are an AI that converts natural-language descriptions into ChatCraft flow JSON.

Output ONLY a valid JSON object with this exact shape:
{
  "name": "<flow name>",
  "description": "<short description>",
  "trigger_type": "manual" | "keyword" | "webhook",
  "trigger_config": {},
  "nodes": [ ...node objects... ],
  "edges": [ ...edge objects... ]
}

Node shape: { "id": "<unique string>", "type": "<type>", "position": {"x": <int>, "y": <int>}, "data": { ...fields... } }
Edge shape: { "id": "<unique string>", "source": "<nodeId>", "target": "<nodeId>", "sourceHandle": "<handle or null>" }

Available node types and their data fields:
- start: {} — always present, id "start-1"
- end: {} — always present, id "end-1"
- send_message: { "message": "<text>", "channel": "omni" }
- user_input: { "question": "<text>", "inputType": "text", "saveToField": null }
- condition: { "field": "<var>", "operator": "eq|neq|contains|gt|lt|has_tag|is_empty", "value": "<val>", "trueHandle": "true", "falseHandle": "false" }
- ai_response: { "model": "claude-sonnet-4-6", "prompt": "<system prompt>", "temperature": 0.7 }
- ai_tasks: { "tasks": ["<task1>","<task2>"], "maxNudges": 3 }
- delay: { "duration": 5, "unit": "minutes" }
- http_request: { "method": "POST", "url": "<url>", "body": {}, "saveResponseAs": "response" }
- randomizer: { "branches": [{"label":"A","weight":50},{"label":"B","weight":50}] }
- action: { "actionType": "<type>", ...action-specific fields }
  action types: set_field, add_tag, remove_tag, assign_conversation, send_webhook, send_sms, send_email, send_push, pause_conversation, resume_conversation, go_to_flow, add_to_pipeline
- jump_to: { "targetNodeId": "<id>" }
- notes: { "text": "<note>" }

Layout guidance: start at x=250,y=50; space nodes 200px apart vertically; branch nodes go horizontally.
Do not include markdown fences. Output raw JSON only.
"""


@router.post("/api/v1/flows/generate", response_model=dict, status_code=status.HTTP_201_CREATED)
async def generate_flow(body: FlowGenerateRequest, user: CurrentUser, db: DBSession) -> dict:
    """Generate a complete flow from a natural-language description using AI, then save it."""
    description = body.description

    from app.services.llm.base import ChatMessage
    from app.services.llm.router import get_provider

    provider = get_provider("claude-sonnet-4-6")
    messages = [
        ChatMessage(role="system", content=_FLOW_SYSTEM_PROMPT),
        ChatMessage(role="user", content=f"Create a flow for: {description}"),
    ]
    try:
        response = await provider.complete(messages, max_tokens=4096, temperature=0.3)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM error: {exc}") from exc

    # Strip any accidental markdown fences
    raw = response.content.strip()
    raw = re.sub(r"^```[a-z]*\n?", "", raw)
    raw = re.sub(r"\n?```$", "", raw)

    try:
        generated = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail=f"LLM returned invalid JSON: {exc}") from exc

    # Validate required keys
    for key in ("nodes", "edges"):
        if not isinstance(generated.get(key), list):
            raise HTTPException(status_code=502, detail=f"Generated flow missing '{key}' list")

    flow = Flow(
        user_id=user.id,
        chatbot_id=body.chatbot_id,
        folder_id=body.folder_id,
        name=generated.get("name") or description[:80],
        description=generated.get("description"),
        trigger_type=generated.get("trigger_type", "manual"),
        trigger_config=generated.get("trigger_config", {}),
        nodes=generated["nodes"],
        edges=generated["edges"],
        webhook_secret=secrets.token_urlsafe(32),
    )
    db.add(flow)
    await db.commit()
    await db.refresh(flow)
    return {"success": True, "data": _flow_dict(flow)}


def _flow_dict(f: Flow, include_graph: bool = True) -> dict:
    d: dict = {
        "id": str(f.id),
        "name": f.name,
        "description": f.description,
        "is_active": f.is_active,
        "trigger_type": f.trigger_type,
        "trigger_config": f.trigger_config,
        "chatbot_id": str(f.chatbot_id) if f.chatbot_id else None,
        "folder_id": str(f.folder_id) if f.folder_id else None,
        "webhook_secret": f.webhook_secret,
        "starting_node_id": f.starting_node_id,
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
async def create_flow(body: FlowCreate, user: CurrentUser, db: DBSession) -> dict:
    # Default canvas: start + end nodes
    default_nodes = [
        {
            "id": "start-1",
            "type": "start",
            "position": {"x": 250, "y": 50},
            "data": {"label": "Start"},
        },
        {"id": "end-1", "type": "end", "position": {"x": 250, "y": 250}, "data": {"label": "End"}},
    ]
    default_edges = [
        {"id": "e-start-end", "source": "start-1", "target": "end-1"},
    ]

    flow = Flow(
        user_id=user.id,
        chatbot_id=body.chatbot_id,
        folder_id=body.folder_id,
        name=body.name,
        description=body.description,
        trigger_type=body.trigger_type,
        trigger_config=body.trigger_config,
        nodes=body.nodes if body.nodes is not None else default_nodes,
        edges=body.edges if body.edges is not None else default_edges,
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
async def update_flow(
    flow_id: uuid.UUID, body: FlowUpdate, user: CurrentUser, db: DBSession
) -> dict:
    flow = await _get_owned_flow(flow_id, user.id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(flow, field, value)
    await db.commit()
    await db.refresh(flow)
    return {"success": True, "data": _flow_dict(flow)}


@router.delete("/api/v1/flows/{flow_id}", response_model=dict)
async def delete_flow(flow_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    flow = await _get_owned_flow(flow_id, user.id, db)
    await db.delete(flow)
    await db.commit()
    return {"success": True, "data": None}


@router.post(
    "/api/v1/flows/{flow_id}/duplicate", response_model=dict, status_code=status.HTTP_201_CREATED
)
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
async def configure_webhook(
    flow_id: uuid.UUID, body: WebhookConfigureRequest, user: CurrentUser, db: DBSession
) -> dict:
    flow = await _get_owned_flow(flow_id, user.id, db)
    data = body.model_dump(exclude_unset=True)
    if data.get("regenerate"):
        flow.webhook_secret = secrets.token_urlsafe(32)
    if "enabled" in data:
        flow.is_active = bool(data["enabled"])
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


@router.post(
    "/api/v1/flows/{flow_id}/trigger", response_model=dict, status_code=status.HTTP_201_CREATED
)
async def trigger_flow(
    flow_id: uuid.UUID, body: FlowTriggerRequest, user: CurrentUser, db: DBSession
) -> dict:
    flow = await _get_owned_flow(flow_id, user.id, db)
    if not flow.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Flow is not active")

    from app.services.flow.executor import start_run

    run = await start_run(
        flow=flow,
        db=db,
        contact_id=body.contact_id,
        conversation_id=body.conversation_id,
        trigger_data=body.data,
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
    total = (
        await db.execute(
            select(func.count()).select_from(FlowRun).where(FlowRun.flow_id == flow.id)
        )
    ).scalar_one()

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


# ── Folder CRUD ───────────────────────────────────────────────────────────────


@router.get("/api/v1/flows/folders", response_model=dict)
async def list_folders(user: CurrentUser, db: DBSession) -> dict:
    result = await db.execute(
        select(FlowFolder).where(FlowFolder.user_id == user.id).order_by(FlowFolder.name)
    )
    folders = result.scalars().all()
    return {
        "success": True,
        "data": [
            {
                "id": str(f.id),
                "name": f.name,
                "colour": f.colour,
                "created_at": f.created_at.isoformat(),
            }
            for f in folders
        ],
    }


@router.post("/api/v1/flows/folders", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_folder(body: FlowFolderCreate, user: CurrentUser, db: DBSession) -> dict:
    folder = FlowFolder(user_id=user.id, name=body.name, colour=body.colour)
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    return {
        "success": True,
        "data": {"id": str(folder.id), "name": folder.name, "colour": folder.colour},
    }


@router.patch("/api/v1/flows/folders/{folder_id}", response_model=dict)
async def update_folder(
    folder_id: uuid.UUID, body: FlowFolderUpdate, user: CurrentUser, db: DBSession
) -> dict:
    folder = await db.get(FlowFolder, folder_id)
    if not folder or folder.user_id != user.id:
        raise HTTPException(status_code=404, detail="Folder not found")
    data = body.model_dump(exclude_unset=True)
    if "name" in data:
        folder.name = (data["name"] or "").strip() or folder.name
    if "colour" in data:
        folder.colour = data["colour"]
    await db.commit()
    return {
        "success": True,
        "data": {"id": str(folder.id), "name": folder.name, "colour": folder.colour},
    }


@router.delete("/api/v1/flows/folders/{folder_id}", response_model=dict)
async def delete_folder(folder_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    folder = await db.get(FlowFolder, folder_id)
    if not folder or folder.user_id != user.id:
        raise HTTPException(status_code=404, detail="Folder not found")
    # Unset folder_id on contained flows (ON DELETE SET NULL handles this via FK)
    await db.delete(folder)
    await db.commit()
    return {"success": True}


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
