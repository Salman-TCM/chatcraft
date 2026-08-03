import uuid
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class LandingPageCreate(BaseModel):
    name: str | None = Field(None, max_length=255)
    title: str | None = Field(None, max_length=255)
    chatbot_id: uuid.UUID | None = None
    description: str | None = Field(None, max_length=2000)
    html_content: str | None = None
    theme: Literal["light", "dark"] = "light"
    primary_color: str = Field("#6366f1", pattern=r"^#[0-9a-fA-F]{6}$")
    seo_meta: dict = Field(default_factory=dict)

    @model_validator(mode="after")
    def _require_name_or_title(self) -> "LandingPageCreate":
        """Mirrors the previous manual check: at least one of name/title
        must be a non-empty string (name falls back to title)."""
        name = (self.name or self.title or "").strip()
        if not name:
            raise ValueError("name required")
        self.name = name
        return self


class LandingPageUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = Field(None, max_length=2000)
    html_content: str | None = None
    theme: Literal["light", "dark"] | None = None
    primary_color: str | None = Field(None, pattern=r"^#[0-9a-fA-F]{6}$")
    seo_meta: dict | None = None
    chatbot_id: uuid.UUID | None = None


class LandingPageAIGenerate(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    model: str | None = Field(None, max_length=100)

    @field_validator("prompt")
    @classmethod
    def _prompt_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("prompt required")
        return v
