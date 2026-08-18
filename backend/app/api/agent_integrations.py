"""
Agent Integration API — manage API integrations attached to an agent.

All routes are scoped to /api/v1/agents/{agent_id}/integrations and require
the requesting user to own the agent.

Routes:
  GET    /api/v1/agents/{agent_id}/integrations
  POST   /api/v1/agents/{agent_id}/integrations
  GET    /api/v1/agents/{agent_id}/integrations/{integration_id}
  PUT    /api/v1/agents/{agent_id}/integrations/{integration_id}
  DELETE /api/v1/agents/{agent_id}/integrations/{integration_id}
  POST   /api/v1/agents/{agent_id}/integrations/{integration_id}/test

  GET    /api/v1/agents/{agent_id}/credentials
  POST   /api/v1/agents/{agent_id}/credentials
  DELETE /api/v1/agents/{agent_id}/credentials/{credential_id}
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.core.dependencies import CurrentUser, DBSession, require_feature
from app.core.features import AGENT_BUILDER
from app.models.agent import Agent
from app.models.agent_integration import AgentIntegration, IntegrationCredential
from app.schemas.agent_integration import (
    CredentialCreateRequest,
    CredentialResponse,
    IntegrationCreateRequest,
    IntegrationResponse,
    IntegrationUpdateRequest,
)
from app.services.integrations.credential_store import decrypt_credential, encrypt_credential
from app.services.net_security import is_ssrf_safe_resolved

router = APIRouter(
    prefix="/api/v1/agents",
    tags=["agent-integrations"],
    dependencies=[Depends(require_feature(AGENT_BUILDER))],
)


# ── Helpers ────────────────────────────────────────────────────────────────────


async def _get_agent(agent_id: uuid.UUID, user_id: uuid.UUID, db: DBSession) -> Agent:
    result = await db.execute(
        select(Agent).where(Agent.id == agent_id, Agent.user_id == user_id)
    )
    agent = result.scalar_one_or_none()
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


async def _get_integration(
    integration_id: uuid.UUID, agent_id: uuid.UUID, user_id: uuid.UUID, db: DBSession
) -> AgentIntegration:
    result = await db.execute(
        select(AgentIntegration).where(
            AgentIntegration.id == integration_id,
            AgentIntegration.agent_id == agent_id,
            AgentIntegration.user_id == user_id,
        )
    )
    intg = result.scalar_one_or_none()
    if intg is None:
        raise HTTPException(status_code=404, detail="Integration not found")
    return intg


def _to_response(intg: AgentIntegration) -> IntegrationResponse:
    return IntegrationResponse(
        id=intg.id,
        name=intg.name,
        integration_type=intg.integration_type,
        base_url=intg.base_url,
        credential_id=intg.credential_id,
        auth_type=intg.auth_type,
        auth_header=intg.auth_header,
        has_credential=bool(intg.encrypted_credential),
        enabled_tool_groups=intg.enabled_tool_groups or [],
        enabled_tools=intg.enabled_tools,
        is_active=intg.is_active,
        allow_destructive=intg.allow_destructive,
        health_status=intg.health_status,
        last_tested_at=intg.last_tested_at,
        last_error=intg.last_error,
        created_at=intg.created_at,
        updated_at=intg.updated_at,
    )


async def _resolve_credential(
    credential_id: uuid.UUID | None, user_id: uuid.UUID, db: DBSession
) -> tuple[IntegrationCredential | None, str, str | None, str | None]:
    """Returns (credential_obj, auth_type, auth_header, encrypted_value)."""
    if credential_id is None:
        return None, "none", None, None
    result = await db.execute(
        select(IntegrationCredential).where(
            IntegrationCredential.id == credential_id,
            IntegrationCredential.user_id == user_id,
        )
    )
    cred = result.scalar_one_or_none()
    if cred is None:
        raise HTTPException(status_code=404, detail="Credential not found")
    return cred, cred.auth_type, cred.auth_header, cred.encrypted_value


# ── Integration CRUD ───────────────────────────────────────────────────────────


@router.get("/{agent_id}/integrations")
async def list_integrations(agent_id: uuid.UUID, user: CurrentUser, db: DBSession):
    await _get_agent(agent_id, user.id, db)
    result = await db.execute(
        select(AgentIntegration)
        .where(AgentIntegration.agent_id == agent_id, AgentIntegration.user_id == user.id)
        .order_by(AgentIntegration.created_at)
    )
    integrations = result.scalars().all()
    return {"success": True, "data": [_to_response(i) for i in integrations]}


@router.post("/{agent_id}/integrations", status_code=status.HTTP_201_CREATED)
async def create_integration(
    agent_id: uuid.UUID, body: IntegrationCreateRequest, user: CurrentUser, db: DBSession
):
    await _get_agent(agent_id, user.id, db)
    cred, auth_type, auth_header, encrypted_val = await _resolve_credential(
        body.credential_id, user.id, db
    )
    intg = AgentIntegration(
        agent_id=agent_id,
        user_id=user.id,
        name=body.name,
        integration_type=body.integration_type,
        base_url=body.base_url,
        credential_id=body.credential_id,
        auth_type=auth_type,
        auth_header=auth_header,
        encrypted_credential=encrypted_val,
        enabled_tool_groups=body.enabled_tool_groups,
        enabled_tools=body.enabled_tools,
        allow_destructive=body.allow_destructive,
    )
    db.add(intg)
    await db.commit()
    await db.refresh(intg)
    return {"success": True, "data": _to_response(intg)}


@router.get("/{agent_id}/integrations/{integration_id}")
async def get_integration(
    agent_id: uuid.UUID, integration_id: uuid.UUID, user: CurrentUser, db: DBSession
):
    intg = await _get_integration(integration_id, agent_id, user.id, db)
    return {"success": True, "data": _to_response(intg)}


@router.put("/{agent_id}/integrations/{integration_id}")
async def update_integration(
    agent_id: uuid.UUID,
    integration_id: uuid.UUID,
    body: IntegrationUpdateRequest,
    user: CurrentUser,
    db: DBSession,
):
    intg = await _get_integration(integration_id, agent_id, user.id, db)

    if body.name is not None:
        intg.name = body.name
    if body.base_url is not None:
        intg.base_url = body.base_url
    if body.enabled_tool_groups is not None:
        intg.enabled_tool_groups = body.enabled_tool_groups
    if body.enabled_tools is not None:
        intg.enabled_tools = body.enabled_tools
    if body.is_active is not None:
        intg.is_active = body.is_active
    if body.allow_destructive is not None:
        intg.allow_destructive = body.allow_destructive

    # Re-resolve credential if changed.
    if "credential_id" in body.model_fields_set:
        cred, auth_type, auth_header, encrypted_val = await _resolve_credential(
            body.credential_id, user.id, db
        )
        intg.credential_id = body.credential_id
        intg.auth_type = auth_type
        intg.auth_header = auth_header
        intg.encrypted_credential = encrypted_val

    await db.commit()
    await db.refresh(intg)
    return {"success": True, "data": _to_response(intg)}


@router.delete("/{agent_id}/integrations/{integration_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_integration(
    agent_id: uuid.UUID, integration_id: uuid.UUID, user: CurrentUser, db: DBSession
):
    intg = await _get_integration(integration_id, agent_id, user.id, db)
    await db.delete(intg)
    await db.commit()


# ── Test connection ────────────────────────────────────────────────────────────


@router.post("/{agent_id}/integrations/{integration_id}/test")
async def test_integration(
    agent_id: uuid.UUID, integration_id: uuid.UUID, user: CurrentUser, db: DBSession
):
    """Probe the integration base URL with a HEAD request and update health status."""
    intg = await _get_integration(integration_id, agent_id, user.id, db)

    # SSRF check at test time too.
    if not await is_ssrf_safe_resolved(intg.base_url):
        intg.health_status = "error"
        intg.last_error = "Base URL resolves to a private/internal address."
        intg.last_tested_at = datetime.now(UTC)
        await db.commit()
        raise HTTPException(status_code=400, detail=intg.last_error)

    # Build auth headers.
    auth_headers: dict[str, str] = {}
    if intg.encrypted_credential and intg.auth_type != "none":
        try:
            value = decrypt_credential(intg.encrypted_credential)
            if intg.auth_type == "bearer":
                auth_headers["Authorization"] = f"Bearer {value}"
            elif intg.auth_type == "api_key":
                header_name = intg.auth_header or "X-Api-Key"
                auth_headers[header_name] = value
            elif intg.auth_type == "basic":
                import base64
                encoded = base64.b64encode(value.encode()).decode()
                auth_headers["Authorization"] = f"Basic {encoded}"
        except ValueError:
            intg.health_status = "error"
            intg.last_error = "Credential decryption failed."
            intg.last_tested_at = datetime.now(UTC)
            await db.commit()
            raise HTTPException(status_code=500, detail="Credential error")

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=5.0),
            follow_redirects=False,
        ) as client:
            resp = await client.head(intg.base_url, headers=auth_headers)
        reachable = resp.status_code < 500
        intg.health_status = "ok" if reachable else "error"
        intg.last_error = None if reachable else f"Server returned HTTP {resp.status_code}"
    except httpx.TimeoutException:
        intg.health_status = "error"
        intg.last_error = "Connection timed out"
    except Exception as exc:
        intg.health_status = "error"
        intg.last_error = str(exc)[:500]

    intg.last_tested_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(intg)
    return {"success": True, "data": _to_response(intg)}


# ── Credential CRUD ────────────────────────────────────────────────────────────


@router.get("/{agent_id}/credentials")
async def list_credentials(agent_id: uuid.UUID, user: CurrentUser, db: DBSession):
    await _get_agent(agent_id, user.id, db)
    result = await db.execute(
        select(IntegrationCredential)
        .where(IntegrationCredential.user_id == user.id)
        .order_by(IntegrationCredential.created_at)
    )
    creds = result.scalars().all()
    return {
        "success": True,
        "data": [CredentialResponse.model_validate(c) for c in creds],
    }


@router.post("/{agent_id}/credentials", status_code=status.HTTP_201_CREATED)
async def create_credential(
    agent_id: uuid.UUID, body: CredentialCreateRequest, user: CurrentUser, db: DBSession
):
    await _get_agent(agent_id, user.id, db)
    encrypted = encrypt_credential(body.auth_value)
    cred = IntegrationCredential(
        user_id=user.id,
        name=body.name,
        auth_type=body.auth_type,
        auth_header=body.auth_header,
        encrypted_value=encrypted,
    )
    db.add(cred)
    await db.commit()
    await db.refresh(cred)
    return {"success": True, "data": CredentialResponse.model_validate(cred)}


@router.delete("/{agent_id}/credentials/{credential_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_credential(
    agent_id: uuid.UUID, credential_id: uuid.UUID, user: CurrentUser, db: DBSession
):
    await _get_agent(agent_id, user.id, db)
    result = await db.execute(
        select(IntegrationCredential).where(
            IntegrationCredential.id == credential_id,
            IntegrationCredential.user_id == user.id,
        )
    )
    cred = result.scalar_one_or_none()
    if cred is None:
        raise HTTPException(status_code=404, detail="Credential not found")
    await db.delete(cred)
    await db.commit()
