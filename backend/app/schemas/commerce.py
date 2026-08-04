import uuid
from typing import Literal

from pydantic import BaseModel, Field

# Currencies offered in the store-settings <select> (frontend/app/dashboard/stores/page.tsx).
StoreCurrency = Literal["USD", "EUR", "GBP", "CAD", "AUD", "SGD", "AED", "INR"]


# ── Stores ─────────────────────────────────────────────────────────────────────


class StoreCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(None, max_length=2000)
    is_active: bool = True
    currency: StoreCurrency = "USD"
    primary_color: str = Field("#6366f1", pattern=r"^#[0-9A-Fa-f]{6}$")
    default_view_mode: Literal["grid", "list"] = "grid"
    payment_provider: str = Field("stripe", max_length=50)
    google_sheet_id: str | None = Field(None, max_length=255)
    chatbot_id: uuid.UUID | None = None


class StoreUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = Field(None, max_length=2000)
    is_active: bool | None = None
    currency: StoreCurrency | None = None
    primary_color: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    default_view_mode: Literal["grid", "list"] | None = None
    payment_provider: str | None = Field(None, max_length=50)
    google_sheet_id: str | None = Field(None, max_length=255)
    chatbot_id: uuid.UUID | None = None


# ── Products ───────────────────────────────────────────────────────────────────


class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(None, max_length=5000)
    price: float = Field(ge=0)
    compare_at_price: float | None = Field(None, ge=0)
    image_url: str | None = Field(None, max_length=1000)
    category: str | None = Field(None, max_length=100)
    sku: str | None = Field(None, max_length=100)
    in_stock: bool = True
    metadata: dict = Field(default_factory=dict)
    sort_order: int = 0


class ProductUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = Field(None, max_length=5000)
    price: float | None = Field(None, ge=0)
    compare_at_price: float | None = Field(None, ge=0)
    image_url: str | None = Field(None, max_length=1000)
    category: str | None = Field(None, max_length=100)
    sku: str | None = Field(None, max_length=100)
    in_stock: bool | None = None
    metadata: dict | None = None
    sort_order: int | None = None


# ── Stripe Checkout ────────────────────────────────────────────────────────────


class PaymentIntentCreate(BaseModel):
    store_slug: str = Field(min_length=1, max_length=200)
    # Each item is {product_id, quantity}; validated/looked up individually
    # in the handler (business logic), so kept as a free-form dict here.
    items: list[dict] = Field(min_length=1)


class PaymentConfirm(BaseModel):
    payment_intent_id: str = Field(min_length=1, max_length=255)
    email: str | None = Field(None, max_length=320)
    name: str | None = Field(None, max_length=255)
