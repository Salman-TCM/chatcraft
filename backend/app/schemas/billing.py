from pydantic import BaseModel, Field


class CheckoutRequest(BaseModel):
    price_id: str = Field(min_length=1)
    success_url: str | None = None
    cancel_url: str | None = None


class CheckoutResponse(BaseModel):
    success: bool = True
    data: dict


class PortalResponse(BaseModel):
    success: bool = True
    data: dict
