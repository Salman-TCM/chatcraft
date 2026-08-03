from pydantic import BaseModel, Field


class TokenCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    expires_in_days: int | None = Field(None, gt=0)
