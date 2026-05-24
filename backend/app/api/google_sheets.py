"""
Google Sheets Integration API

Routes:
  GET  /api/integrations/google/sheets/auth-url     — get OAuth URL
  GET  /api/integrations/google/sheets/callback     — OAuth callback
  GET  /api/integrations/google/sheets              — list accessible spreadsheets
  DELETE /api/integrations/google/sheets/disconnect — revoke token
"""
import secrets
from datetime import datetime, timezone, timedelta

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse

from app.core.config import settings
from app.core.dependencies import CurrentUser, DBSession

router = APIRouter(prefix="/api/integrations/google/sheets", tags=["google-sheets"])

_SCOPES = " ".join([
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.metadata.readonly",
])
_TOKEN_URL = "https://oauth2.googleapis.com/token"
_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files"
_REVOKE_URL = "https://oauth2.googleapis.com/revoke"


def _sheets_redirect_uri() -> str:
    base = getattr(settings, "api_base_url", "http://localhost:8000").rstrip("/")
    return f"{base}/api/integrations/google/sheets/callback"


@router.get("/auth-url")
async def get_auth_url(user: CurrentUser) -> dict:
    """Return the OAuth2 URL to connect Google Sheets."""
    if not getattr(settings, "google_oauth_client_id", ""):
        raise HTTPException(status_code=503, detail="Google OAuth not configured")
    state = secrets.token_urlsafe(16)
    params = {
        "client_id": settings.google_oauth_client_id,
        "redirect_uri": _sheets_redirect_uri(),
        "response_type": "code",
        "scope": _SCOPES,
        "access_type": "offline",
        "prompt": "consent",
        "state": f"{user.id}:{state}",
    }
    url = _AUTH_URL + "?" + "&".join(f"{k}={v}" for k, v in params.items())
    return {"success": True, "data": {"auth_url": url}}


@router.get("/callback")
async def oauth_callback(
    code: str = Query(...),
    state: str = Query(""),
    db: DBSession = None,
) -> RedirectResponse:
    """Handle Google OAuth callback — exchange code for tokens and store them."""
    # Parse user_id from state
    user_id_str = state.split(":")[0] if state else ""
    if not user_id_str:
        raise HTTPException(status_code=400, detail="Invalid state parameter")

    import uuid
    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid state parameter")

    from app.models.user import User
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Exchange code for tokens
    async with httpx.AsyncClient() as client:
        resp = await client.post(_TOKEN_URL, data={
            "code": code,
            "client_id": settings.google_oauth_client_id,
            "client_secret": getattr(settings, "google_oauth_client_secret", ""),
            "redirect_uri": _sheets_redirect_uri(),
            "grant_type": "authorization_code",
        })
    if resp.status_code != 200:
        raise HTTPException(status_code=400, detail=f"Token exchange failed: {resp.text}")

    token_data = resp.json()
    expires_at = (
        datetime.now(timezone.utc) + timedelta(seconds=int(token_data.get("expires_in", 3600)))
    ).isoformat()

    tokens = user.google_oauth_tokens or {}
    tokens["sheets"] = {
        "access_token": token_data.get("access_token"),
        "refresh_token": token_data.get("refresh_token"),
        "expires_at": expires_at,
    }
    user.google_oauth_tokens = tokens
    await db.commit()

    frontend_url = getattr(settings, "frontend_url", "http://localhost:3000")
    return RedirectResponse(url=f"{frontend_url}/dashboard/settings/integrations?google_sheets=connected")


async def _get_valid_access_token(user) -> str:
    """Return a valid access token, refreshing if needed."""
    tokens = (user.google_oauth_tokens or {}).get("sheets", {})
    access_token = tokens.get("access_token", "")
    refresh_token = tokens.get("refresh_token", "")
    expires_at_str = tokens.get("expires_at", "")

    if expires_at_str:
        expires_at = datetime.fromisoformat(expires_at_str)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) >= expires_at - timedelta(minutes=5):
            # Refresh token
            if not refresh_token:
                raise HTTPException(status_code=401, detail="Google Sheets token expired. Please reconnect.")
            async with httpx.AsyncClient() as client:
                resp = await client.post(_TOKEN_URL, data={
                    "client_id": settings.google_oauth_client_id,
                    "client_secret": getattr(settings, "google_oauth_client_secret", ""),
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                })
            if resp.status_code != 200:
                raise HTTPException(status_code=401, detail="Failed to refresh Google token. Please reconnect.")
            new_tokens = resp.json()
            access_token = new_tokens.get("access_token", access_token)

    return access_token


@router.get("")
async def list_spreadsheets(user: CurrentUser, db: DBSession) -> dict:
    """List accessible Google Spreadsheets for the authenticated user."""
    tokens = (user.google_oauth_tokens or {}).get("sheets")
    if not tokens:
        return {"success": True, "data": {"connected": False, "spreadsheets": []}}

    access_token = await _get_valid_access_token(user)

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            _DRIVE_FILES_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            params={
                "q": "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
                "fields": "files(id,name,modifiedTime,webViewLink)",
                "orderBy": "modifiedTime desc",
                "pageSize": 50,
            },
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail="Failed to list spreadsheets")

    data = resp.json()
    sheets = [
        {
            "id": f["id"],
            "name": f["name"],
            "modified_at": f.get("modifiedTime"),
            "url": f.get("webViewLink"),
        }
        for f in data.get("files", [])
    ]
    return {"success": True, "data": {"connected": True, "spreadsheets": sheets}}


@router.delete("/disconnect")
async def disconnect(user: CurrentUser, db: DBSession) -> dict:
    """Revoke Google Sheets OAuth token."""
    tokens = (user.google_oauth_tokens or {}).get("sheets", {})
    access_token = tokens.get("access_token")
    if access_token:
        try:
            async with httpx.AsyncClient() as client:
                await client.post(_REVOKE_URL, params={"token": access_token})
        except Exception:
            pass

    new_tokens = {k: v for k, v in (user.google_oauth_tokens or {}).items() if k != "sheets"}
    user.google_oauth_tokens = new_tokens or None
    await db.commit()
    return {"success": True, "data": None}
