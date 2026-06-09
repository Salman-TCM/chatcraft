from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.user import UserRole


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    name: str | None = Field(default=None, max_length=255)

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v: str) -> str:
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v


class UserResponse(BaseModel):
    id: UUID
    email: str
    name: str | None
    role: UserRole
    email_verified: bool
    trial_ends_at: datetime | None = None
    created_at: datetime
    allowed_features: list | None = None

    model_config = {"from_attributes": True}


class RegisterResponse(BaseModel):
    success: bool = True
    data: UserResponse


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenData(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
    refresh_token: str | None = None


class LoginResponse(BaseModel):
    success: bool = True
    data: TokenData


class RefreshResponse(BaseModel):
    success: bool = True
    data: TokenData


class MeResponse(BaseModel):
    success: bool = True
    data: UserResponse


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=72)

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v: str) -> str:
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v


class GoogleSyncRequest(BaseModel):
    google_id: str
    email: EmailStr
    name: str | None = None
    avatar_url: str | None = None
