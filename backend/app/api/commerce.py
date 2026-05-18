"""
Commerce Store API.

Routes:
  GET    /api/v1/stores
  POST   /api/v1/stores
  GET    /api/v1/stores/{id}
  PATCH  /api/v1/stores/{id}
  DELETE /api/v1/stores/{id}
  GET    /api/v1/stores/{id}/products
  POST   /api/v1/stores/{id}/products
  PATCH  /api/v1/stores/{id}/products/{product_id}
  DELETE /api/v1/stores/{id}/products/{product_id}
  POST   /api/v1/stores/{id}/sync
  GET    /api/v1/stores/{id}/purchases
  GET    /api/public/stores/{slug}                  ← no auth
  GET    /api/public/stores/{slug}/products         ← no auth
  POST   /api/commerce/checkout/create-payment-intent
  POST   /api/commerce/checkout/confirm
"""
import re
import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import func, select

from app.core.dependencies import CurrentUser, DBSession
from app.models.commerce import CommercePayment, CommerceProduct, CommerceStore

router = APIRouter(tags=["commerce"])


# ── helpers ────────────────────────────────────────────────────────────────────

def _slugify(text: str) -> str:
    s = text.lower().strip()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_-]+", "-", s)
    return s[:100]


def _store_dict(s: CommerceStore) -> dict:
    return {
        "id": str(s.id),
        "name": s.name,
        "slug": s.slug,
        "description": s.description,
        "is_active": s.is_active,
        "currency": s.currency,
        "primary_color": s.primary_color,
        "default_view_mode": s.default_view_mode,
        "payment_provider": s.payment_provider,
        "google_sheet_id": s.google_sheet_id,
        "chatbot_id": str(s.chatbot_id) if s.chatbot_id else None,
        "created_at": s.created_at.isoformat(),
        "updated_at": s.updated_at.isoformat(),
    }


def _product_dict(p: CommerceProduct) -> dict:
    return {
        "id": str(p.id),
        "store_id": str(p.store_id),
        "name": p.name,
        "description": p.description,
        "price": float(p.price),
        "compare_at_price": float(p.compare_at_price) if p.compare_at_price else None,
        "image_url": p.image_url,
        "category": p.category,
        "sku": p.sku,
        "in_stock": p.in_stock,
        "metadata": p.metadata_,
        "sort_order": p.sort_order,
        "created_at": p.created_at.isoformat(),
    }


def _payment_dict(p: CommercePayment) -> dict:
    return {
        "id": str(p.id),
        "store_id": str(p.store_id),
        "contact_id": str(p.contact_id) if p.contact_id else None,
        "customer_name": p.customer_name,
        "customer_email": p.customer_email,
        "amount": float(p.amount),
        "currency": p.currency,
        "stripe_payment_intent_id": p.stripe_payment_intent_id,
        "status": p.status,
        "items": p.items,
        "metadata": p.metadata_,
        "created_at": p.created_at.isoformat(),
    }


async def _get_store(store_id: uuid.UUID, user_id: uuid.UUID, db) -> CommerceStore:
    store = await db.get(CommerceStore, store_id)
    if not store or store.user_id != user_id:
        raise HTTPException(status_code=404, detail="Store not found")
    return store


async def _get_product(product_id: uuid.UUID, store_id: uuid.UUID, db) -> CommerceProduct:
    product = await db.get(CommerceProduct, product_id)
    if not product or product.store_id != store_id:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


# ── Store CRUD ─────────────────────────────────────────────────────────────────

@router.get("/api/v1/stores", response_model=dict)
async def list_stores(
    user: CurrentUser, db: DBSession,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> dict:
    offset = (page - 1) * limit
    result = await db.execute(
        select(CommerceStore).where(CommerceStore.user_id == user.id)
        .order_by(CommerceStore.created_at.desc()).offset(offset).limit(limit)
    )
    stores = result.scalars().all()
    total = (await db.execute(
        select(func.count()).select_from(CommerceStore).where(CommerceStore.user_id == user.id)
    )).scalar_one()
    return {"success": True, "data": [_store_dict(s) for s in stores], "total": total}


@router.post("/api/v1/stores", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_store(body: dict, user: CurrentUser, db: DBSession) -> dict:
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="name required")

    base_slug = _slugify(name)
    slug = base_slug
    counter = 1
    while True:
        exists = await db.execute(select(CommerceStore).where(CommerceStore.slug == slug))
        if not exists.scalar_one_or_none():
            break
        slug = f"{base_slug}-{counter}"
        counter += 1

    store = CommerceStore(
        user_id=user.id,
        name=name,
        slug=slug,
        description=body.get("description"),
        is_active=body.get("is_active", True),
        currency=body.get("currency", "USD"),
        primary_color=body.get("primary_color", "#6366f1"),
        default_view_mode=body.get("default_view_mode", "grid"),
        payment_provider=body.get("payment_provider", "stripe"),
        google_sheet_id=body.get("google_sheet_id"),
        chatbot_id=body.get("chatbot_id"),
    )
    db.add(store)
    await db.commit()
    await db.refresh(store)
    return {"success": True, "data": _store_dict(store)}


@router.get("/api/v1/stores/{store_id}", response_model=dict)
async def get_store(store_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    store = await _get_store(store_id, user.id, db)
    return {"success": True, "data": _store_dict(store)}


@router.patch("/api/v1/stores/{store_id}", response_model=dict)
async def update_store(store_id: uuid.UUID, body: dict, user: CurrentUser, db: DBSession) -> dict:
    store = await _get_store(store_id, user.id, db)
    for field in ("name", "description", "is_active", "currency", "primary_color",
                  "default_view_mode", "payment_provider", "google_sheet_id", "chatbot_id"):
        if field in body:
            setattr(store, field, body[field])
    await db.commit()
    await db.refresh(store)
    return {"success": True, "data": _store_dict(store)}


@router.delete("/api/v1/stores/{store_id}", response_model=dict)
async def delete_store(store_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    store = await _get_store(store_id, user.id, db)
    await db.delete(store)
    await db.commit()
    return {"success": True, "data": None}


# ── Products ───────────────────────────────────────────────────────────────────

@router.get("/api/v1/stores/{store_id}/products", response_model=dict)
async def list_products(
    store_id: uuid.UUID, user: CurrentUser, db: DBSession,
    category: str | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> dict:
    await _get_store(store_id, user.id, db)
    q = select(CommerceProduct).where(CommerceProduct.store_id == store_id)
    if category:
        q = q.where(CommerceProduct.category == category)
    q = q.order_by(CommerceProduct.sort_order, CommerceProduct.created_at.desc())
    offset = (page - 1) * limit
    result = await db.execute(q.offset(offset).limit(limit))
    products = result.scalars().all()
    total = (await db.execute(
        select(func.count()).select_from(CommerceProduct).where(CommerceProduct.store_id == store_id)
    )).scalar_one()
    return {"success": True, "data": [_product_dict(p) for p in products], "total": total}


@router.post("/api/v1/stores/{store_id}/products", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_product(store_id: uuid.UUID, body: dict, user: CurrentUser, db: DBSession) -> dict:
    await _get_store(store_id, user.id, db)
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="name required")
    price = body.get("price")
    if price is None:
        raise HTTPException(status_code=422, detail="price required")
    product = CommerceProduct(
        store_id=store_id,
        name=name,
        description=body.get("description"),
        price=price,
        compare_at_price=body.get("compare_at_price"),
        image_url=body.get("image_url"),
        category=body.get("category"),
        sku=body.get("sku"),
        in_stock=body.get("in_stock", True),
        metadata_=body.get("metadata", {}),
        sort_order=body.get("sort_order", 0),
    )
    db.add(product)
    await db.commit()
    await db.refresh(product)
    return {"success": True, "data": _product_dict(product)}


@router.patch("/api/v1/stores/{store_id}/products/{product_id}", response_model=dict)
async def update_product(
    store_id: uuid.UUID, product_id: uuid.UUID,
    body: dict, user: CurrentUser, db: DBSession,
) -> dict:
    await _get_store(store_id, user.id, db)
    product = await _get_product(product_id, store_id, db)
    for field in ("name", "description", "price", "compare_at_price", "image_url",
                  "category", "sku", "in_stock", "sort_order"):
        if field in body:
            setattr(product, field, body[field])
    if "metadata" in body:
        product.metadata_ = body["metadata"]
    await db.commit()
    await db.refresh(product)
    return {"success": True, "data": _product_dict(product)}


@router.delete("/api/v1/stores/{store_id}/products/{product_id}", response_model=dict)
async def delete_product(
    store_id: uuid.UUID, product_id: uuid.UUID,
    user: CurrentUser, db: DBSession,
) -> dict:
    await _get_store(store_id, user.id, db)
    product = await _get_product(product_id, store_id, db)
    await db.delete(product)
    await db.commit()
    return {"success": True, "data": None}


@router.post("/api/v1/stores/{store_id}/sync", response_model=dict)
async def sync_from_sheet(store_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    store = await _get_store(store_id, user.id, db)
    if not store.google_sheet_id:
        raise HTTPException(status_code=422, detail="No Google Sheet ID configured for this store")

    # Fetch published CSV export of the sheet
    import httpx
    csv_url = f"https://docs.google.com/spreadsheets/d/{store.google_sheet_id}/export?format=csv"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(csv_url)
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to fetch Google Sheet — ensure it is published publicly")

    import csv, io
    reader = csv.DictReader(io.StringIO(resp.text))
    # Expected columns (case-insensitive): name, price, description, category, image_url, sku, in_stock
    col_map = {h.strip().lower(): h.strip() for h in (reader.fieldnames or [])}
    if "name" not in col_map or "price" not in col_map:
        raise HTTPException(status_code=422, detail="Sheet must have 'name' and 'price' columns")

    upserted = 0
    for row in reader:
        name = row.get(col_map.get("name", "name"), "").strip()
        price_raw = row.get(col_map.get("price", "price"), "0").strip().replace("$", "").replace(",", "")
        if not name:
            continue
        try:
            price = float(price_raw)
        except ValueError:
            continue

        # Upsert by name within store
        existing = (await db.execute(
            select(CommerceProduct).where(
                CommerceProduct.store_id == store_id,
                CommerceProduct.name == name,
            )
        )).scalar_one_or_none()

        def _get(key: str) -> str | None:
            return row.get(col_map.get(key, ""), "").strip() or None

        if existing:
            existing.price = price
            existing.description = _get("description") or existing.description
            existing.category = _get("category") or existing.category
            existing.image_url = _get("image_url") or existing.image_url
            existing.sku = _get("sku") or existing.sku
            in_stock_raw = (_get("in_stock") or "true").lower()
            existing.in_stock = in_stock_raw not in ("false", "0", "no")
        else:
            in_stock_raw = (_get("in_stock") or "true").lower()
            db.add(CommerceProduct(
                store_id=store_id,
                name=name,
                price=price,
                description=_get("description"),
                category=_get("category"),
                image_url=_get("image_url"),
                sku=_get("sku"),
                in_stock=in_stock_raw not in ("false", "0", "no"),
            ))
        upserted += 1

    await db.commit()
    return {"success": True, "data": {"synced": upserted}}


# ── Purchases ──────────────────────────────────────────────────────────────────

@router.get("/api/v1/stores/{store_id}/purchases", response_model=dict)
async def list_purchases(
    store_id: uuid.UUID, user: CurrentUser, db: DBSession,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> dict:
    await _get_store(store_id, user.id, db)
    offset = (page - 1) * limit
    result = await db.execute(
        select(CommercePayment).where(CommercePayment.store_id == store_id)
        .order_by(CommercePayment.created_at.desc()).offset(offset).limit(limit)
    )
    payments = result.scalars().all()
    total = (await db.execute(
        select(func.count()).select_from(CommercePayment).where(CommercePayment.store_id == store_id)
    )).scalar_one()
    return {"success": True, "data": [_payment_dict(p) for p in payments], "total": total}


@router.get("/api/v1/stores/{store_id}/purchases/{purchase_id}", response_model=dict)
async def get_purchase(store_id: uuid.UUID, purchase_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    await _get_store(store_id, user.id, db)
    payment = await db.get(CommercePayment, purchase_id)
    if not payment or payment.store_id != store_id:
        raise HTTPException(status_code=404, detail="Purchase not found")
    return {"success": True, "data": _payment_dict(payment)}


# ── Public endpoints (no auth) ─────────────────────────────────────────────────

@router.get("/api/public/stores/{slug}", response_model=dict)
async def public_store(slug: str, db: DBSession) -> dict:
    result = await db.execute(
        select(CommerceStore).where(CommerceStore.slug == slug, CommerceStore.is_active.is_(True))
    )
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    return {"success": True, "data": _store_dict(store)}


@router.get("/api/public/stores/{slug}/products", response_model=dict)
async def public_products(
    slug: str, db: DBSession,
    category: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> dict:
    result = await db.execute(
        select(CommerceStore).where(CommerceStore.slug == slug, CommerceStore.is_active.is_(True))
    )
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    q = select(CommerceProduct).where(
        CommerceProduct.store_id == store.id,
        CommerceProduct.in_stock.is_(True),
    )
    if category:
        q = q.where(CommerceProduct.category == category)
    q = q.order_by(CommerceProduct.sort_order, CommerceProduct.created_at).limit(limit)
    products = (await db.execute(q)).scalars().all()
    return {"success": True, "data": [_product_dict(p) for p in products]}


# ── Stripe Checkout ────────────────────────────────────────────────────────────

@router.post("/api/commerce/checkout/create-payment-intent", response_model=dict)
async def create_payment_intent(body: dict, db: DBSession) -> dict:
    slug = (body.get("store_slug") or "").strip()
    items: list = body.get("items", [])
    if not slug or not items:
        raise HTTPException(status_code=422, detail="store_slug and items required")

    result = await db.execute(
        select(CommerceStore).where(CommerceStore.slug == slug, CommerceStore.is_active.is_(True))
    )
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    # Validate items + compute total
    total_cents = 0
    line_items = []
    for item in items:
        product = await db.get(CommerceProduct, uuid.UUID(str(item["product_id"])))
        if not product or product.store_id != store.id:
            raise HTTPException(status_code=422, detail=f"Invalid product: {item['product_id']}")
        qty = max(1, int(item.get("quantity", 1)))
        line_items.append({
            "product_id": str(product.id),
            "name": product.name,
            "price": float(product.price),
            "quantity": qty,
        })
        total_cents += round(float(product.price) * qty * 100)

    try:
        import stripe
        from app.core.config import settings
        stripe.api_key = settings.stripe_secret_key
        intent = stripe.PaymentIntent.create(
            amount=total_cents,
            currency=store.currency.lower(),
            metadata={"store_id": str(store.id), "store_slug": slug},
        )
        client_secret = intent.client_secret
        payment_intent_id = intent.id
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Stripe error: {exc}")

    payment = CommercePayment(
        store_id=store.id,
        user_id=store.user_id,
        amount=total_cents / 100,
        currency=store.currency,
        stripe_payment_intent_id=payment_intent_id,
        status="pending",
        items=line_items,
    )
    db.add(payment)
    await db.commit()

    return {
        "success": True,
        "data": {
            "client_secret": client_secret,
            "payment_intent_id": payment_intent_id,
            "amount": total_cents / 100,
            "currency": store.currency,
        },
    }


@router.post("/api/commerce/checkout/confirm", response_model=dict)
async def confirm_payment(body: dict, db: DBSession) -> dict:
    payment_intent_id = (body.get("payment_intent_id") or "").strip()
    if not payment_intent_id:
        raise HTTPException(status_code=422, detail="payment_intent_id required")

    result = await db.execute(
        select(CommercePayment).where(CommercePayment.stripe_payment_intent_id == payment_intent_id)
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    # Verify with Stripe
    try:
        import stripe
        from app.core.config import settings
        stripe.api_key = settings.stripe_secret_key
        intent = stripe.PaymentIntent.retrieve(payment_intent_id)
        payment.status = intent.status  # succeeded / requires_payment_method / etc.
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Stripe error: {exc}")

    # Find or create contact
    email = (body.get("email") or "").strip().lower() or None
    name = (body.get("name") or "").strip() or None
    payment.customer_email = email
    payment.customer_name = name

    if email:
        from app.models.crm import Contact
        c_result = await db.execute(
            select(Contact).where(
                Contact.user_id == payment.user_id,
                Contact.email == email,
            ).limit(1)
        )
        contact = c_result.scalar_one_or_none()
        if not contact:
            parts = (name or "").split(" ", 1)
            contact = Contact(
                user_id=payment.user_id,
                email=email,
                first_name=parts[0] or None,
                last_name=parts[1] if len(parts) > 1 else None,
                source="store",
            )
            db.add(contact)
            await db.flush()
        payment.contact_id = contact.id

    await db.commit()
    return {
        "success": True,
        "data": {
            "status": payment.status,
            "order_id": str(payment.id),
        },
    }
