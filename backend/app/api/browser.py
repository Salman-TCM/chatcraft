"""
Browser Agent API — cloud browser sessions for AI-driven web automation.

Architecture:
- If BROWSERBASE_API_KEY is set, sessions are delegated to Browserbase (production).
- Otherwise, page fetching via httpx + BeautifulSoup (development / direct-browse only).
"""
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
from bs4 import BeautifulSoup
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update

from app.core.config import settings
from app.core.dependencies import CurrentUser, DBSession
from app.models.browser import BrowserSession

router = APIRouter(prefix="/api/v1/browser", tags=["browser"])

_PRIVATE_RANGES = [
    "10.", "172.16.", "172.17.", "172.18.", "172.19.", "172.20.", "172.21.",
    "172.22.", "172.23.", "172.24.", "172.25.", "172.26.", "172.27.", "172.28.",
    "172.29.", "172.30.", "172.31.", "192.168.", "127.", "169.254.", "::1",
    "fc00:", "fe80:",
]


def _is_private(url: str) -> bool:
    for prefix in _PRIVATE_RANGES:
        if prefix in url:
            return True
    return False


# ─── Session management ───────────────────────────────────────────────────────

class CreateSessionRequest(BaseModel):
    max_pages: int = 5
    allow_login: bool = False
    private: bool = False
    mode: str = "direct"  # direct | research | form_fill
    block_private_ips: bool = True


@router.post("/sessions")
async def create_session(
    body: CreateSessionRequest,
    current_user: CurrentUser,
    db: DBSession,
):
    """Create a new browser session."""
    token = secrets.token_urlsafe(32)
    external_id: str | None = None

    if settings.browserbase_api_key:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://www.browserbase.com/v1/sessions",
                headers={
                    "x-bb-api-key": settings.browserbase_api_key,
                    "Content-Type": "application/json",
                },
                json={"projectId": settings.browserbase_project_id},
                timeout=30,
            )
        if resp.status_code in (200, 201):
            external_id = resp.json().get("id")

    session = BrowserSession(
        user_id=current_user.id,
        session_token=token,
        status="active",
        max_pages=min(body.max_pages, 20),
        config={
            "allow_login": body.allow_login,
            "private": body.private,
            "mode": body.mode,
            "block_private_ips": body.block_private_ips,
        },
        external_session_id=external_id,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return {
        "success": True,
        "data": {
            "session_id": str(session.id),
            "session_token": token,
            "status": "active",
        },
    }


@router.get("/sessions/{session_id}")
async def get_session(session_id: str, current_user: CurrentUser, db: DBSession):
    result = await db.execute(
        select(BrowserSession).where(
            BrowserSession.id == uuid.UUID(session_id),
            BrowserSession.user_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "success": True,
        "data": {
            "session_id": str(session.id),
            "status": session.status,
            "pages_visited": session.pages_visited,
            "max_pages": session.max_pages,
            "config": session.config,
        },
    }


@router.delete("/sessions/{session_id}")
async def close_session(session_id: str, current_user: CurrentUser, db: DBSession):
    result = await db.execute(
        select(BrowserSession).where(
            BrowserSession.id == uuid.UUID(session_id),
            BrowserSession.user_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.status = "closed"
    session.closed_at = datetime.now(timezone.utc)

    if session.external_session_id and settings.browserbase_api_key:
        async with httpx.AsyncClient() as client:
            await client.delete(
                f"https://www.browserbase.com/v1/sessions/{session.external_session_id}",
                headers={"x-bb-api-key": settings.browserbase_api_key},
                timeout=10,
            )

    await db.commit()
    return {"success": True}


# ─── Browser actions ──────────────────────────────────────────────────────────

class BrowserActionRequest(BaseModel):
    action: str  # navigate | screenshot | extract | search | click | type | scroll
    url: str | None = None
    selector: str | None = None
    text: str | None = None
    query: str | None = None
    scroll_direction: str = "down"
    scroll_amount: int = 3


@router.post("/sessions/{session_id}/action")
async def browser_action(
    session_id: str,
    body: BrowserActionRequest,
    current_user: CurrentUser,
    db: DBSession,
):
    """Execute a browser action within a session."""
    result = await db.execute(
        select(BrowserSession).where(
            BrowserSession.id == uuid.UUID(session_id),
            BrowserSession.user_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != "active":
        raise HTTPException(status_code=400, detail="Session is not active")
    if session.pages_visited >= session.max_pages:
        raise HTTPException(status_code=400, detail="Max pages per session reached")

    cfg = session.config or {}
    if cfg.get("block_private_ips") and body.url and _is_private(body.url):
        raise HTTPException(status_code=400, detail="Private IP ranges are blocked")

    action_result: dict[str, Any] = {}

    if body.action == "navigate" and body.url:
        action_result = await _navigate(body.url, session)
        session.pages_visited += 1

    elif body.action == "extract" and body.url:
        action_result = await _extract(body.url)
        session.pages_visited += 1

    elif body.action == "search" and body.query:
        search_url = f"https://www.google.com/search?q={body.query.replace(' ', '+')}"
        action_result = await _extract(search_url)
        session.pages_visited += 1

    elif body.action == "screenshot":
        action_result = {"screenshot": None, "message": "Screenshot requires Playwright/Browserbase"}

    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: {body.action}")

    await db.commit()
    return {"success": True, "data": action_result}


@router.get("/sessions/{session_id}/view")
async def session_view(session_id: str, current_user: CurrentUser, db: DBSession):
    """Get the live view URL for a Browserbase session (if applicable)."""
    result = await db.execute(
        select(BrowserSession).where(
            BrowserSession.id == uuid.UUID(session_id),
            BrowserSession.user_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    live_url = None
    if session.external_session_id and settings.browserbase_api_key:
        live_url = f"https://www.browserbase.com/sessions/{session.external_session_id}/live"

    return {"success": True, "data": {"live_url": live_url}}


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _navigate(url: str, session: BrowserSession) -> dict:
    """Fetch page and return title + content summary."""
    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=30,
            headers={"User-Agent": "ChatCraft-Browser-Agent/1.0"},
        ) as client:
            resp = await client.get(url)
        soup = BeautifulSoup(resp.content, "lxml")
        title = soup.title.string if soup.title else ""
        # Extract readable text
        for tag in soup(["script", "style", "nav", "footer"]):
            tag.decompose()
        text = " ".join(soup.stripped_strings)[:5000]
        return {"url": url, "title": title, "content": text, "status_code": resp.status_code}
    except Exception as exc:
        return {"url": url, "error": str(exc)}


async def _extract(url: str) -> dict:
    """Extract structured content from a page."""
    result = await _navigate(url, None)  # type: ignore[arg-type]
    return result
