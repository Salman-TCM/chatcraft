"""
Custom webhook-backed tools for Agent Builder agents.

A user attaches arbitrary tools (e.g. "book_service", "create_account") to
one of their own agents. When the model calls the tool, the backend POSTs/GETs
the model-supplied arguments to the configured webhook_url and feeds the
response back. See app/api/agents.py (_build_tools_with_mcp / _execute_tool)
for the runtime wiring, and app/models/agent_function.py for why headers are
encrypted at rest and why these tools never appear on public agent shares.
"""

import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select

from app.core.dependencies import CurrentUser, DBSession, require_feature
from app.core.features import AGENT_BUILDER
from app.models.agent import Agent
from app.models.agent_function import AgentFunction
from app.schemas.agent_function import (
    AgentFunctionOut,
    CreateAgentFunctionRequest,
    UpdateAgentFunctionRequest,
)
from app.services.llm.key_store import encrypt_key

router = APIRouter(tags=["agent-functions"], dependencies=[Depends(require_feature(AGENT_BUILDER))])

MAX_FUNCTIONS_PER_AGENT = 20


async def _owned_agent(agent_id: uuid.UUID, user_id: uuid.UUID, db) -> Agent:
    agent = await db.get(Agent, agent_id)
    if not agent or agent.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"success": False, "error": "Agent not found", "code": "NOT_FOUND"},
        )
    return agent


async def _owned_function(agent_id: uuid.UUID, fn_id: uuid.UUID, user_id: uuid.UUID, db) -> AgentFunction:
    fn = await db.get(AgentFunction, fn_id)
    if not fn or fn.agent_id != agent_id or fn.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"success": False, "error": "Tool not found", "code": "NOT_FOUND"},
        )
    return fn


def _out(fn: AgentFunction) -> dict:
    return AgentFunctionOut(
        id=fn.id,
        agent_id=fn.agent_id,
        name=fn.name,
        description=fn.description,
        parameters_schema=fn.parameters_schema,
        webhook_url=fn.webhook_url,
        webhook_method=fn.webhook_method,
        has_headers=bool(fn.webhook_headers_encrypted),
        credential_id=getattr(fn, "credential_id", None),
        is_active=fn.is_active,
    ).model_dump(mode="json")


async def _assert_name_free(
    agent_id: uuid.UUID, name: str, db, *, exclude_id: uuid.UUID | None = None
) -> None:
    query = select(AgentFunction).where(
        AgentFunction.agent_id == agent_id, AgentFunction.name == name
    )
    if exclude_id is not None:
        query = query.where(AgentFunction.id != exclude_id)
    existing = (await db.execute(query)).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "success": False,
                "error": f"A tool named '{name}' already exists on this agent",
                "code": "NAME_TAKEN",
            },
        )


@router.get("/api/agents/{agent_id}/functions", response_model=dict)
async def list_agent_functions(agent_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    await _owned_agent(agent_id, user.id, db)
    result = await db.execute(
        select(AgentFunction)
        .where(AgentFunction.agent_id == agent_id)
        .order_by(AgentFunction.created_at.desc())
    )
    return {"success": True, "data": [_out(f) for f in result.scalars().all()]}


@router.post(
    "/api/agents/{agent_id}/functions", response_model=dict, status_code=status.HTTP_201_CREATED
)
async def create_agent_function(
    agent_id: uuid.UUID, body: CreateAgentFunctionRequest, user: CurrentUser, db: DBSession
) -> dict:
    await _owned_agent(agent_id, user.id, db)

    count = (
        await db.execute(
            select(func.count())
            .select_from(AgentFunction)
            .where(AgentFunction.agent_id == agent_id)
        )
    ).scalar_one()
    if count >= MAX_FUNCTIONS_PER_AGENT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "success": False,
                "error": f"An agent can have at most {MAX_FUNCTIONS_PER_AGENT} custom tools",
                "code": "LIMIT_REACHED",
            },
        )
    await _assert_name_free(agent_id, body.name, db)

    fn = AgentFunction(
        agent_id=agent_id,
        user_id=user.id,
        name=body.name,
        description=body.description,
        parameters_schema=body.parameters_schema,
        webhook_url=body.webhook_url,
        webhook_method=body.webhook_method,
        webhook_headers_encrypted=(
            encrypt_key(json.dumps(body.webhook_headers)) if body.webhook_headers else None
        ),
        credential_id=body.credential_id,
    )
    db.add(fn)
    await db.commit()
    await db.refresh(fn)
    return {"success": True, "data": _out(fn)}


@router.put("/api/agents/{agent_id}/functions/{fn_id}", response_model=dict)
async def update_agent_function(
    agent_id: uuid.UUID,
    fn_id: uuid.UUID,
    body: UpdateAgentFunctionRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    fn = await _owned_function(agent_id, fn_id, user.id, db)
    updates = body.model_dump(exclude_unset=True)

    if "name" in updates and updates["name"] != fn.name:
        await _assert_name_free(agent_id, updates["name"], db, exclude_id=fn.id)

    if "webhook_headers" in updates:
        headers = updates.pop("webhook_headers")
        fn.webhook_headers_encrypted = encrypt_key(json.dumps(headers)) if headers else None

    for key, value in updates.items():
        setattr(fn, key, value)

    await db.commit()
    await db.refresh(fn)
    return {"success": True, "data": _out(fn)}


@router.delete("/api/agents/{agent_id}/functions/{fn_id}", response_model=dict)
async def delete_agent_function(
    agent_id: uuid.UUID, fn_id: uuid.UUID, user: CurrentUser, db: DBSession
) -> dict:
    fn = await _owned_function(agent_id, fn_id, user.id, db)
    await db.delete(fn)
    await db.commit()
    return {"success": True, "data": None}


@router.post("/api/agents/{agent_id}/functions/{fn_id}/toggle", response_model=dict)
async def toggle_agent_function(
    agent_id: uuid.UUID, fn_id: uuid.UUID, user: CurrentUser, db: DBSession
) -> dict:
    fn = await _owned_function(agent_id, fn_id, user.id, db)
    fn.is_active = not fn.is_active
    await db.commit()
    return {"success": True, "data": {"is_active": fn.is_active}}
