import json
import secrets
import urllib.parse
from datetime import UTC, datetime, timedelta

import httpx
from fastapi import APIRouter, Cookie, Header, HTTPException, Query, Response, status
from fastapi.responses import RedirectResponse
from jose import JWTError
from sqlalchemy import select

from app.core.config import settings
from app.core.dependencies import CurrentUser, DBSession, RedisClient
from app.core.rate_limit import limiter
from app.core.security import (
    REFRESH_TOKEN_COOKIE,
    REFRESH_TOKEN_EXPIRE_DAYS,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.user import User, UserRole
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    GoogleSyncRequest,
    LoginRequest,
    LoginResponse,
    MeResponse,
    RefreshResponse,
    RegisterRequest,
    RegisterResponse,
    ResetPasswordRequest,
    TokenData,
    UpdateMeRequest,
    UserResponse,
)
from app.services.email import send_password_reset_email, send_verification_email

router = APIRouter(prefix="/api/auth", tags=["auth"])

_REFRESH_TTL = int(timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS).total_seconds())


@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register(body: RegisterRequest, db: DBSession) -> RegisterResponse:
    """Create a new user account with email and password."""
    existing = await db.scalar(select(User).where(User.email == body.email))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"success": False, "error": "Email already registered", "code": "EMAIL_TAKEN"},
        )

    verification_token = secrets.token_urlsafe(32)
    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        name=body.name,
        role=UserRole.free,
        email_verification_token=verification_token,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    send_verification_email(user.email, verification_token)

    return RegisterResponse(data=UserResponse.model_validate(user))


_LOGIN_ATTEMPT_LIMIT = 10
_LOGIN_LOCKOUT_SECONDS = 900  # 15 minutes


@router.post("/login", response_model=LoginResponse)
async def login(
    body: LoginRequest,
    response: Response,
    db: DBSession,
    redis: RedisClient,
) -> LoginResponse:
    """Authenticate with email + password. Returns JWT access token in body
    and sets a httpOnly refresh token cookie."""
    attempt_key = f"login_attempts:{body.email.lower()}"
    attempts = await redis.get(attempt_key)
    if attempts and int(attempts) >= _LOGIN_ATTEMPT_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "success": False,
                "error": "Too many login attempts. Try again in 15 minutes.",
                "code": "TOO_MANY_ATTEMPTS",
            },
        )

    user = await db.scalar(select(User).where(User.email == body.email))
    if not user or not user.password_hash or not verify_password(body.password, user.password_hash):
        pipe = redis.pipeline()
        pipe.incr(attempt_key)
        pipe.expire(attempt_key, _LOGIN_LOCKOUT_SECONDS)
        await pipe.execute()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "success": False,
                "error": "Invalid credentials",
                "code": "INVALID_CREDENTIALS",
            },
        )

    # Successful login — clear attempt counter
    await redis.delete(attempt_key)

    if user.is_suspended:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "success": False,
                "error": "Account suspended. Contact support.",
                "code": "ACCOUNT_SUSPENDED",
            },
        )

    access_token = create_access_token(
        user.id, user.role.value, allowed_features=user.allowed_features
    )
    refresh_token, jti = create_refresh_token(user.id)

    # Store JTI in Redis so it can be revoked on logout
    await redis.setex(f"refresh:{jti}", _REFRESH_TTL, str(user.id))

    response.set_cookie(
        key=REFRESH_TOKEN_COOKIE,
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=_REFRESH_TTL,
        path="/api/auth",
    )

    return LoginResponse(
        data=TokenData(
            access_token=access_token,
            refresh_token=refresh_token,
            user=UserResponse.model_validate(user),
        )
    )


@router.post("/logout", status_code=status.HTTP_200_OK)
async def logout(
    response: Response,
    redis: RedisClient,
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_TOKEN_COOKIE),
) -> dict:
    """Revoke the refresh token and clear the cookie. Always returns 200."""
    if refresh_token:
        try:
            payload = decode_token(refresh_token)
            jti = payload.get("jti", "")
            if jti:
                await redis.delete(f"refresh:{jti}")
        except JWTError:
            pass  # expired/invalid token — still clear the cookie

    response.delete_cookie(key=REFRESH_TOKEN_COOKIE, path="/api/auth")
    return {"success": True, "data": {"message": "Logged out"}}


_INVALID_REFRESH = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail={
        "success": False,
        "error": "Invalid or expired refresh token",
        "code": "INVALID_REFRESH_TOKEN",
    },
)


@router.post("/refresh", response_model=RefreshResponse)
@limiter.exempt
async def refresh(
    response: Response,
    db: DBSession,
    redis: RedisClient,
    refresh_token_cookie: str | None = Cookie(default=None, alias=REFRESH_TOKEN_COOKIE),
    x_refresh_token: str | None = Header(default=None, alias="X-Refresh-Token"),
) -> RefreshResponse:
    """Rotate refresh token. Old JTI is revoked; new tokens are issued.
    Accepts refresh token via httpOnly cookie OR X-Refresh-Token header
    (header is used by server-side NextAuth which can't access browser cookies)."""
    refresh_token = x_refresh_token or refresh_token_cookie
    if not refresh_token:
        raise _INVALID_REFRESH

    try:
        payload = decode_token(refresh_token)
    except JWTError:
        raise _INVALID_REFRESH

    if payload.get("type") != "refresh":
        raise _INVALID_REFRESH

    user_id: str = payload.get("sub", "")
    jti: str = payload.get("jti", "")

    redis_key = f"refresh:{jti}"
    stored = await redis.get(redis_key)
    if not stored:
        # Handle concurrent refresh race — multiple NextAuth jwt callbacks can
        # fire simultaneously for the same expired token. The first succeeds and
        # rotates the JTI; the rest arrive with the now-revoked JTI. Instead of
        # 401-ing them (which causes a refresh flood), return the cached tokens
        # from the winning request for a short grace window.
        grace_key = f"refresh:{jti}:grace"
        cached = await redis.get(grace_key)
        if cached:
            cached_data = json.loads(cached)
            user = await db.get(User, cached_data["user_id"])
            if user:
                response.set_cookie(
                    key=REFRESH_TOKEN_COOKIE,
                    value=cached_data["refresh_token"],
                    httponly=True,
                    secure=True,
                    samesite="lax",
                    max_age=_REFRESH_TTL,
                    path="/api/auth",
                )
                return RefreshResponse(
                    data=TokenData(
                        access_token=cached_data["access_token"],
                        refresh_token=cached_data["refresh_token"],
                        user=UserResponse.model_validate(user),
                    )
                )
        raise _INVALID_REFRESH

    user = await db.get(User, user_id)
    if not user or user.is_suspended:
        raise _INVALID_REFRESH

    access_token = create_access_token(
        user.id, user.role.value, allowed_features=user.allowed_features
    )
    new_refresh_token, new_jti = create_refresh_token(user.id)
    await redis.setex(f"refresh:{new_jti}", _REFRESH_TTL, str(user.id))

    # Set grace key BEFORE deleting old key — eliminates the race window where
    # a concurrent request finds the old key gone but grace not yet written.
    await redis.setex(
        f"refresh:{jti}:grace",
        30,
        json.dumps(
            {
                "access_token": access_token,
                "refresh_token": new_refresh_token,
                "user_id": str(user.id),
            }
        ),
    )

    # Revoke old token after grace key is in place
    await redis.delete(redis_key)

    response.set_cookie(
        key=REFRESH_TOKEN_COOKIE,
        value=new_refresh_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=_REFRESH_TTL,
        path="/api/auth",
    )

    return RefreshResponse(
        data=TokenData(
            access_token=access_token,
            refresh_token=new_refresh_token,
            user=UserResponse.model_validate(user),
        )
    )


@router.get("/me", response_model=MeResponse)
async def me(current_user: CurrentUser) -> MeResponse:
    """Return the authenticated user's profile."""
    return MeResponse(data=UserResponse.model_validate(current_user))


@router.put("/me", response_model=dict)
async def update_me(
    body: UpdateMeRequest,
    current_user: CurrentUser,
    db: DBSession,
) -> dict:
    """Update the current user's display name."""
    current_user.name = body.name.strip()[:100]
    await db.commit()
    await db.refresh(current_user)
    return {"success": True, "data": UserResponse.model_validate(current_user)}


@router.post("/change-password", response_model=dict)
async def change_password(
    body: ChangePasswordRequest,
    current_user: CurrentUser,
    db: DBSession,
) -> dict:
    """Change password after verifying the current one."""
    current_pwd = body.current_password
    new_pwd = body.new_password

    if not current_user.password_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "success": False,
                "error": "Account uses social login — no password set",
                "code": "NO_PASSWORD",
            },
        )
    if not verify_password(current_pwd, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "success": False,
                "error": "Current password is incorrect",
                "code": "WRONG_PASSWORD",
            },
        )

    current_user.password_hash = hash_password(new_pwd)
    await db.commit()
    return {"success": True, "data": None}


@router.get("/verify-email")
async def verify_email(
    db: DBSession,
    token: str = Query(...),
) -> dict:
    """Mark the user's email as verified using the token sent on registration."""
    user = await db.scalar(select(User).where(User.email_verification_token == token))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "success": False,
                "error": "Invalid or expired verification token",
                "code": "INVALID_VERIFICATION_TOKEN",
            },
        )

    user.email_verified = True
    user.email_verification_token = None
    await db.commit()

    return {"success": True, "data": {"message": "Email verified"}}


# ---------------------------------------------------------------------------
# Password reset
# ---------------------------------------------------------------------------

_RESET_TOKEN_EXPIRY_HOURS = 1


@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest, db: DBSession) -> dict:
    """Send a password reset email. Always returns 200 to prevent email enumeration."""
    user = await db.scalar(select(User).where(User.email == body.email))
    if user and user.password_hash:  # only email+password accounts can reset
        token = secrets.token_urlsafe(32)
        user.password_reset_token = token
        user.password_reset_expires_at = datetime.now(UTC) + timedelta(
            hours=_RESET_TOKEN_EXPIRY_HOURS
        )
        await db.commit()
        send_password_reset_email(user.email, token)

    return {
        "success": True,
        "data": {"message": "If that email exists, a reset link has been sent"},
    }


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest, db: DBSession) -> dict:
    """Set a new password using a valid reset token."""
    user = await db.scalar(select(User).where(User.password_reset_token == body.token))
    if not user or not user.password_reset_expires_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "success": False,
                "error": "Invalid or expired reset token",
                "code": "INVALID_RESET_TOKEN",
            },
        )

    if user.password_reset_expires_at.replace(tzinfo=UTC) < datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "success": False,
                "error": "Reset token has expired",
                "code": "RESET_TOKEN_EXPIRED",
            },
        )

    user.password_hash = hash_password(body.password)
    user.password_reset_token = None
    user.password_reset_expires_at = None
    await db.commit()

    return {"success": True, "data": {"message": "Password updated"}}


# ---------------------------------------------------------------------------
# Google OAuth
# ---------------------------------------------------------------------------

_GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"
_OAUTH_STATE_TTL = 600  # 10 minutes


@router.get("/google")
async def google_oauth_redirect(redis: RedisClient) -> RedirectResponse:
    """Redirect the browser to Google's consent screen."""
    if not settings.google_oauth_client_id:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail={
                "success": False,
                "error": "Google OAuth not configured",
                "code": "OAUTH_NOT_CONFIGURED",
            },
        )

    state = secrets.token_urlsafe(32)
    await redis.setex(f"oauth:state:{state}", _OAUTH_STATE_TTL, "1")

    params = urllib.parse.urlencode(
        {
            "client_id": settings.google_oauth_client_id,
            "redirect_uri": settings.google_oauth_redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "access_type": "offline",
            "prompt": "select_account",
        }
    )
    return RedirectResponse(url=f"{_GOOGLE_AUTH_URL}?{params}")


@router.get("/google/callback")
async def google_oauth_callback(
    code: str,
    state: str,
    response: Response,
    db: DBSession,
    redis: RedisClient,
) -> RedirectResponse:
    """Exchange Google auth code for tokens, upsert user, issue JWT."""
    # Validate CSRF state
    state_key = f"oauth:state:{state}"
    valid = await redis.get(state_key)
    if not valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "success": False,
                "error": "Invalid OAuth state",
                "code": "INVALID_OAUTH_STATE",
            },
        )
    await redis.delete(state_key)

    async with httpx.AsyncClient(timeout=10) as client:
        # Exchange code for Google access token
        token_resp = await client.post(
            _GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_oauth_client_id,
                "client_secret": settings.google_oauth_client_secret,
                "redirect_uri": settings.google_oauth_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={
                    "success": False,
                    "error": "Google token exchange failed",
                    "code": "OAUTH_TOKEN_ERROR",
                },
            )
        google_access_token = token_resp.json().get("access_token", "")

        # Fetch user profile
        userinfo_resp = await client.get(
            _GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {google_access_token}"},
        )
        if userinfo_resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={
                    "success": False,
                    "error": "Google userinfo fetch failed",
                    "code": "OAUTH_USERINFO_ERROR",
                },
            )
        info = userinfo_resp.json()

    google_id: str = info.get("sub", "")
    email: str = info.get("email", "")
    name: str | None = info.get("name")
    avatar_url: str | None = info.get("picture")

    if not google_id or not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "success": False,
                "error": "Incomplete Google profile",
                "code": "OAUTH_INCOMPLETE_PROFILE",
            },
        )

    # Find by google_id first, then fall back to email (link existing account)
    user = await db.scalar(select(User).where(User.google_id == google_id))
    if not user:
        user = await db.scalar(select(User).where(User.email == email))

    if user:
        # Link google_id and refresh profile data if needed
        if not user.google_id:
            user.google_id = google_id
        if not user.avatar_url and avatar_url:
            user.avatar_url = avatar_url
        await db.commit()
        await db.refresh(user)
    else:
        user = User(
            email=email,
            google_id=google_id,
            name=name,
            avatar_url=avatar_url,
            role=UserRole.free,
            email_verified=True,  # Google guarantees verified emails
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    # Issue tokens
    access_token = create_access_token(
        user.id, user.role.value, allowed_features=user.allowed_features
    )
    refresh_token, jti = create_refresh_token(user.id)
    await redis.setex(f"refresh:{jti}", _REFRESH_TTL, str(user.id))

    response.set_cookie(
        key=REFRESH_TOKEN_COOKIE,
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=_REFRESH_TTL,
        path="/api/auth",
    )

    # Redirect to frontend with the access token as a query param so the
    # client can store it in memory (the refresh token arrives via cookie)
    redirect_url = (
        f"{settings.frontend_url}/auth/callback?access_token={urllib.parse.quote(access_token)}"
    )
    return RedirectResponse(url=redirect_url, status_code=302)


@router.post("/google/sync", response_model=LoginResponse)
async def google_sync(
    body: GoogleSyncRequest,
    response: Response,
    db: DBSession,
    redis: RedisClient,
) -> LoginResponse:
    """Called by NextAuth after Google sign-in to upsert the user and return
    a ChatCraft JWT. The Google token has already been verified by NextAuth."""
    user = await db.scalar(select(User).where(User.google_id == body.google_id))
    if not user:
        user = await db.scalar(select(User).where(User.email == body.email))

    if user:
        if not user.google_id:
            user.google_id = body.google_id
        if not user.avatar_url and body.avatar_url:
            user.avatar_url = body.avatar_url
        await db.commit()
        await db.refresh(user)
    else:
        user = User(
            email=body.email,
            google_id=body.google_id,
            name=body.name,
            avatar_url=body.avatar_url,
            role=UserRole.free,
            email_verified=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    if user.is_suspended:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "success": False,
                "error": "Account suspended. Contact support.",
                "code": "ACCOUNT_SUSPENDED",
            },
        )

    access_token = create_access_token(
        user.id, user.role.value, allowed_features=user.allowed_features
    )
    refresh_token, jti = create_refresh_token(user.id)
    await redis.setex(f"refresh:{jti}", _REFRESH_TTL, str(user.id))

    response.set_cookie(
        key=REFRESH_TOKEN_COOKIE,
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=_REFRESH_TTL,
        path="/api/auth",
    )

    return LoginResponse(
        data=TokenData(
            access_token=access_token,
            refresh_token=refresh_token,
            user=UserResponse.model_validate(user),
        )
    )
