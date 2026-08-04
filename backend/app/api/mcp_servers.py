"""
MCP (Model Context Protocol) server management.
Supports listing, adding, removing server configs and proxying tool discovery/execution.
"""

import uuid
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from app.core.dependencies import CurrentUser, DBSession, require_feature
from app.core.features import MCP_SERVERS
from app.models.mcp import MCPServerConfig

router = APIRouter(
    prefix="/api/v1/mcp-servers", tags=["mcp"], dependencies=[Depends(require_feature(MCP_SERVERS))]
)


# ─── CRUD ─────────────────────────────────────────────────────────────────────


class MCPServerIn(BaseModel):
    name: str
    server_url: str
    auth_type: str = "none"  # none | bearer | header
    auth_config: dict = {}
    chatbot_id: str | None = None
    is_active: bool = True


class MCPServerPatch(BaseModel):
    name: str | None = None
    server_url: str | None = None
    auth_type: str | None = None
    auth_config: dict | None = None
    chatbot_id: str | None = None
    is_active: bool | None = None


@router.get("")
async def list_mcp_servers(current_user: CurrentUser, db: DBSession):
    result = await db.execute(
        select(MCPServerConfig)
        .where(MCPServerConfig.user_id == current_user.id)
        .order_by(MCPServerConfig.created_at.desc())
    )
    servers = result.scalars().all()
    return {
        "success": True,
        "data": [_serialize(s) for s in servers],
    }


@router.post("")
async def add_mcp_server(body: MCPServerIn, current_user: CurrentUser, db: DBSession):
    server = MCPServerConfig(
        user_id=current_user.id,
        chatbot_id=uuid.UUID(body.chatbot_id) if body.chatbot_id else None,
        name=body.name,
        server_url=body.server_url,
        auth_type=body.auth_type,
        auth_config=body.auth_config,
        is_active=body.is_active,
    )
    db.add(server)
    await db.commit()
    await db.refresh(server)
    return {"success": True, "data": _serialize(server)}


@router.patch("/{server_id}")
async def update_mcp_server(
    server_id: str, body: MCPServerPatch, current_user: CurrentUser, db: DBSession
):
    result = await db.execute(
        select(MCPServerConfig).where(
            MCPServerConfig.id == uuid.UUID(server_id),
            MCPServerConfig.user_id == current_user.id,
        )
    )
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="MCP server not found")

    if body.name is not None:
        server.name = body.name
    if body.server_url is not None:
        server.server_url = body.server_url
    if body.auth_type is not None:
        server.auth_type = body.auth_type
    if body.auth_config is not None:
        server.auth_config = body.auth_config
    if body.is_active is not None:
        server.is_active = body.is_active
    if body.chatbot_id is not None:
        server.chatbot_id = uuid.UUID(body.chatbot_id)

    await db.commit()
    await db.refresh(server)
    return {"success": True, "data": _serialize(server)}


@router.delete("/{server_id}")
async def delete_mcp_server(server_id: str, current_user: CurrentUser, db: DBSession):
    result = await db.execute(
        select(MCPServerConfig).where(
            MCPServerConfig.id == uuid.UUID(server_id),
            MCPServerConfig.user_id == current_user.id,
        )
    )
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="MCP server not found")
    await db.delete(server)
    await db.commit()
    return {"success": True}


# ─── Tool discovery & execution ───────────────────────────────────────────────


@router.get("/{server_id}/tools")
async def list_tools(server_id: str, current_user: CurrentUser, db: DBSession):
    """Discover available tools from an MCP server (JSON-RPC 2.0 tools/list)."""
    server = await _get_server(server_id, current_user, db)
    result = await _mcp_rpc(server, "tools/list", {})
    tools = result.get("tools", [])
    return {"success": True, "data": tools}


class ExecuteToolRequest(BaseModel):
    tool_name: str
    arguments: dict = {}


@router.post("/{server_id}/execute")
async def execute_tool(
    server_id: str,
    body: ExecuteToolRequest,
    current_user: CurrentUser,
    db: DBSession,
):
    """Execute a tool on the MCP server (JSON-RPC 2.0 tools/call)."""
    server = await _get_server(server_id, current_user, db)
    result = await _mcp_rpc(
        server,
        "tools/call",
        {"name": body.tool_name, "arguments": body.arguments},
    )
    return {"success": True, "data": result}


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _serialize(s: MCPServerConfig) -> dict:
    return {
        "id": str(s.id),
        "name": s.name,
        "server_url": s.server_url,
        "auth_type": s.auth_type,
        "chatbot_id": str(s.chatbot_id) if s.chatbot_id else None,
        "is_active": s.is_active,
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }


async def _get_server(server_id: str, current_user: Any, db: Any) -> MCPServerConfig:
    result = await db.execute(
        select(MCPServerConfig).where(
            MCPServerConfig.id == uuid.UUID(server_id),
            MCPServerConfig.user_id == current_user.id,
        )
    )
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="MCP server not found")
    return server


def _auth_headers(server: MCPServerConfig) -> dict:
    headers: dict = {"Content-Type": "application/json"}
    cfg = server.auth_config or {}
    if server.auth_type == "bearer":
        headers["Authorization"] = f"Bearer {cfg.get('token', '')}"
    elif server.auth_type == "header":
        headers[cfg.get("header_name", "X-API-Key")] = cfg.get("header_value", "")
    return headers


async def _mcp_rpc(server: MCPServerConfig, method: str, params: dict) -> dict:
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params,
    }
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                server.server_url,
                headers=_auth_headers(server),
                json=payload,
            )
        data = resp.json()
        if "error" in data:
            raise HTTPException(status_code=400, detail=data["error"].get("message", "MCP error"))
        return data.get("result", {})
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"MCP server unreachable: {exc}")
