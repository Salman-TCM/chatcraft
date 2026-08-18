"""
Integration tool executor.

Responsibilities:
  - Build OpenAI-format tool schemas for the LLM (called once per agent run).
  - Execute a named integration tool call (called per tool_use block).
  - Permission gate: destructive tools blocked unless allow_destructive=True.
  - SSRF double-check (DNS-resolved) at execution time.
  - Idempotency key header for non-idempotent POST/PATCH calls.
  - Response normalization (size cap, error mapping).
  - Audit logging (never logs credential values or full response bodies).
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from typing import TYPE_CHECKING

from app.services.integrations.credential_store import decrypt_credential
from app.services.integrations.http_client import secure_request
from app.services.integrations.tool_registry import REGISTRY, get_tool
from app.services.net_security import is_ssrf_safe_resolved

if TYPE_CHECKING:
    from app.models.agent_integration import AgentIntegration

_log = logging.getLogger(__name__)

# Model-visible tool name prefix so _execute_tool() can route to this module.
_TOOL_PREFIX = "intg::"

# Maximum characters of the API response body passed back to the model.
_MAX_RESPONSE_CHARS = 4_000


def integration_tool_name(integration_id: str, tool_key: str) -> str:
    """Canonical tool name as the model sees it."""
    return f"{_TOOL_PREFIX}{integration_id}::{tool_key}"


def is_integration_tool(name: str) -> bool:
    return name.startswith(_TOOL_PREFIX)


def parse_integration_tool_name(name: str) -> tuple[str, str]:
    """Returns (integration_id, tool_key). Raises ValueError on bad format."""
    parts = name.split("::")
    if len(parts) != 3 or parts[0] != "intg":
        raise ValueError(f"Not a valid integration tool name: {name!r}")
    return parts[1], parts[2]


# ── Schema building ────────────────────────────────────────────────────────────


def build_integration_tool_schemas(integrations: list) -> list[dict]:
    """Return OpenAI-format tool defs for all enabled tools across all integrations.

    `integrations` is a list of dicts (serialised AgentIntegration rows)
    so this function has no DB dependency.
    """
    schemas: list[dict] = []
    for intg in integrations:
        if not intg.get("is_active", True):
            continue
        intg_id = str(intg["id"])
        intg_type = intg.get("integration_type", "")
        enabled_groups = set(intg.get("enabled_tool_groups") or [])
        enabled_tools = intg.get("enabled_tools")  # None = all in group

        for tool in REGISTRY.get(intg_type, []):
            group = tool.get("group", "")
            if group not in enabled_groups:
                continue
            if enabled_tools is not None and tool["key"] not in enabled_tools:
                continue
            schemas.append({
                "name": integration_tool_name(intg_id, tool["key"]),
                "description": tool["description"],
                "input_schema": tool["input_schema"],
            })
    return schemas


# ── Execution ─────────────────────────────────────────────────────────────────


async def execute_integration_tool(
    name: str,
    inputs: dict,
    integrations: list,
    *,
    agent_id: str = "",
    conversation_id: str = "",
) -> str:
    """Execute an integration tool call. Returns a model-safe response string.

    `integrations` is the same list of dicts passed to build_integration_tool_schemas.
    Never raises — all errors are returned as strings so the model can handle them.
    """
    t_start = time.monotonic()
    try:
        intg_id, tool_key = parse_integration_tool_name(name)
    except ValueError as exc:
        return f"Tool routing error: {exc}"

    # Find the matching integration config.
    intg = next((i for i in integrations if str(i["id"]) == intg_id), None)
    if intg is None:
        return "Error: integration not found or no longer active."

    intg_type = intg.get("integration_type", "")
    tool_def = get_tool(intg_type, tool_key)
    if tool_def is None:
        return f"Error: tool '{tool_key}' is not defined for integration type '{intg_type}'."

    # Destructive permission gate.
    if tool_def.get("destructive") and not intg.get("allow_destructive", False):
        return (
            f"Tool '{tool_key}' performs a destructive action. "
            "This integration has not enabled destructive actions. "
            "Ask the user to enable 'Allow destructive actions' in the integration settings."
        )

    base_url = (intg.get("base_url") or "").rstrip("/")

    # SSRF double-check at execution time (DNS rebinding prevention).
    if not await is_ssrf_safe_resolved(base_url):
        _audit(intg_id, tool_key, agent_id, "ssrf_blocked", 0, t_start)
        return "Error: the integration base URL resolves to a private/internal address and was blocked."

    # Build URL with path parameter substitution.
    path = tool_def["path"]
    path_params = tool_def.get("path_params") or []
    remaining_inputs = dict(inputs)
    for param in path_params:
        value = remaining_inputs.pop(param, "")
        path = path.replace(f"{{{param}}}", str(value))

    url = base_url + path
    method = tool_def["method"].upper()

    # Auth headers from stored credential.
    auth_headers = _build_auth_headers(intg)

    # Idempotency key for non-idempotent writes — prevents duplicate charges.
    extra_headers: dict[str, str] = {}
    if not tool_def.get("idempotent", True) and method in ("POST", "PATCH"):
        idem_key = _idempotency_key(agent_id, conversation_id, name, inputs)
        extra_headers["X-Idempotency-Key"] = idem_key

    headers = {**auth_headers, **extra_headers}

    # Route remaining inputs to query params (GET/DELETE) or JSON body (POST/PATCH).
    params = remaining_inputs if method in ("GET", "DELETE") else None
    body = remaining_inputs if method in ("POST", "PATCH") else None

    try:
        status_code, raw_body = await secure_request(
            method, url, headers=headers, params=params, json_body=body
        )
    except Exception as exc:
        _audit(intg_id, tool_key, agent_id, "request_error", 0, t_start)
        return _normalize_error(str(exc))

    _audit(intg_id, tool_key, agent_id, "ok", status_code, t_start)
    return _normalize_response(status_code, raw_body)


# ── Helpers ────────────────────────────────────────────────────────────────────


def _build_auth_headers(intg: dict) -> dict[str, str]:
    auth_type = intg.get("auth_type", "none")
    encrypted = intg.get("encrypted_credential")
    if not encrypted or auth_type == "none":
        return {}
    try:
        value = decrypt_credential(encrypted)
    except ValueError:
        return {}

    if auth_type == "bearer":
        return {"Authorization": f"Bearer {value}"}
    if auth_type == "api_key":
        header_name = intg.get("auth_header") or "X-Api-Key"
        return {header_name: value}
    if auth_type == "basic":
        import base64
        encoded = base64.b64encode(value.encode()).decode()
        return {"Authorization": f"Basic {encoded}"}
    return {}


def _idempotency_key(agent_id: str, conversation_id: str, tool_name: str, inputs: dict) -> str:
    payload = f"{agent_id}:{conversation_id}:{tool_name}:{json.dumps(inputs, sort_keys=True)}"
    return hashlib.sha256(payload.encode()).hexdigest()[:40]


def _normalize_response(status_code: int, body: str) -> str:
    if status_code >= 500:
        return f"The store's API returned a server error (HTTP {status_code}). Please try again or contact support."
    if status_code == 401:
        return "Authentication failed — the integration credentials may be invalid or expired."
    if status_code == 403:
        return "Access denied — the API key does not have permission for this action."
    if status_code == 404:
        return "Not found — the requested resource does not exist."
    if status_code == 409:
        return f"Conflict — the request could not be completed due to a conflict. Details: {body[:500]}"
    if status_code == 422 or status_code == 400:
        return f"Validation error from the store API: {body[:500]}"
    if status_code == 429:
        return "Rate limited by the store API — please wait a moment before trying again."
    # 2xx success
    try:
        parsed = json.loads(body)
        return json.dumps(parsed, ensure_ascii=False)[:_MAX_RESPONSE_CHARS]
    except (json.JSONDecodeError, ValueError):
        return body[:_MAX_RESPONSE_CHARS]


def _normalize_error(error_msg: str) -> str:
    if "timed out" in error_msg.lower() or "timeout" in error_msg.lower():
        return "The store API did not respond in time. Please try again."
    if "connect" in error_msg.lower():
        return "Could not connect to the store API. Check that the integration base URL is correct and the server is reachable."
    return f"Integration request failed: {error_msg[:300]}"


def _audit(
    integration_id: str,
    tool_key: str,
    agent_id: str,
    outcome: str,
    status_code: int,
    t_start: float,
) -> None:
    latency_ms = int((time.monotonic() - t_start) * 1000)
    _log.info(
        "integration_tool_call integration_id=%s tool=%s agent=%s outcome=%s status=%s latency_ms=%s",
        integration_id, tool_key, agent_id, outcome, status_code, latency_ms,
    )
