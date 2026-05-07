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


class PaymentIntentRequest(BaseModel):
    amount: int = Field(gt=0, description="Amount in smallest currency unit (e.g. cents)")
    currency: str = Field(default="usd", min_length=3, max_length=3)
    description: str | None = Field(default=None, max_length=500)


class PaymentIntentResponse(BaseModel):
    success: bool = True
    data: dict
