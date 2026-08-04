from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Request, status
from loguru import logger
from sqlalchemy import select

from app.core.config import settings
from app.core.dependencies import CurrentUser, DBSession
from app.core.stripe import stripe
from app.models.payment import Payment, PaymentStatus
from app.models.subscription import Subscription, SubscriptionPlan, SubscriptionState
from app.models.user import SubscriptionStatus, User, UserRole
from app.schemas.billing import (
    CheckoutRequest,
    CheckoutResponse,
    PaymentIntentRequest,
    PaymentIntentResponse,
    PortalResponse,
)
from app.services.email import _send

router = APIRouter(prefix="/api/billing", tags=["billing"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_or_create_stripe_customer(user, db: DBSession) -> str:
    """Return the user's Stripe customer ID, creating one if needed."""
    if user.stripe_customer_id:
        return user.stripe_customer_id

    customer = stripe.Customer.create(
        email=user.email,
        name=user.name or user.email,
        metadata={"user_id": user.id},
    )
    user.stripe_customer_id = customer.id
    await db.commit()
    return customer.id


def _stripe_status_to_role(stripe_status: str) -> UserRole:
    """Map a Stripe subscription status to an app UserRole."""
    if stripe_status in ("active", "trialing"):
        return UserRole.premium
    return UserRole.free


def _stripe_status_to_state(stripe_status: str) -> SubscriptionState:
    mapping = {
        "active": SubscriptionState.active,
        "trialing": SubscriptionState.trialing,
        "past_due": SubscriptionState.past_due,
        "canceled": SubscriptionState.canceled,
        "unpaid": SubscriptionState.unpaid,
        "incomplete": SubscriptionState.incomplete,
        "incomplete_expired": SubscriptionState.incomplete_expired,
    }
    return mapping.get(stripe_status, SubscriptionState.active)


async def _find_user_by_customer(customer_id: str, db: DBSession) -> User | None:
    return await db.scalar(select(User).where(User.stripe_customer_id == customer_id))


# ---------------------------------------------------------------------------
# Checkout
# ---------------------------------------------------------------------------


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout_session(
    body: CheckoutRequest,
    current_user: CurrentUser,
    db: DBSession,
) -> CheckoutResponse:
    """Create a Stripe Checkout session for a subscription or one-time price."""
    if not settings.stripe_secret_key:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail={
                "success": False,
                "error": "Stripe not configured",
                "code": "STRIPE_NOT_CONFIGURED",
            },
        )

    customer_id = await _get_or_create_stripe_customer(current_user, db)
    success_url = (
        body.success_url
        or f"{settings.frontend_url}/billing/success?session_id={{CHECKOUT_SESSION_ID}}"
    )
    cancel_url = body.cancel_url or f"{settings.frontend_url}/pricing"

    try:
        session = stripe.checkout.Session.create(
            customer=customer_id,
            payment_method_types=["card"],
            line_items=[{"price": body.price_id, "quantity": 1}],
            mode="subscription",
            success_url=success_url,
            cancel_url=cancel_url,
            allow_promotion_codes=True,
            subscription_data={"metadata": {"user_id": current_user.id}},
            metadata={"user_id": current_user.id},
        )
    except stripe.InvalidRequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"success": False, "error": str(exc), "code": "STRIPE_INVALID_REQUEST"},
        )

    return CheckoutResponse(data={"checkout_url": session.url, "session_id": session.id})


# ---------------------------------------------------------------------------
# Customer portal
# ---------------------------------------------------------------------------


@router.get("/portal", response_model=PortalResponse)
async def customer_portal(
    current_user: CurrentUser,
    db: DBSession,
) -> PortalResponse:
    """Return a Stripe Billing Portal URL for the authenticated user."""
    if not settings.stripe_secret_key:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail={
                "success": False,
                "error": "Stripe not configured",
                "code": "STRIPE_NOT_CONFIGURED",
            },
        )

    customer_id = await _get_or_create_stripe_customer(current_user, db)

    try:
        session = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=f"{settings.frontend_url}/billing",
        )
    except stripe.InvalidRequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"success": False, "error": str(exc), "code": "STRIPE_INVALID_REQUEST"},
        )

    return PortalResponse(data={"portal_url": session.url})


# ---------------------------------------------------------------------------
# Stripe Connect — creator payouts
# ---------------------------------------------------------------------------


@router.post("/connect", status_code=status.HTTP_200_OK)
async def connect_onboard(
    current_user: CurrentUser,
    db: DBSession,
) -> dict:
    """Create a Stripe Express Connect account (if needed) and return an
    Account Link URL so the creator can complete onboarding."""
    if not settings.stripe_secret_key:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail={
                "success": False,
                "error": "Stripe not configured",
                "code": "STRIPE_NOT_CONFIGURED",
            },
        )

    # Create Express account on first call
    if not current_user.stripe_connect_account_id:
        account = stripe.Account.create(
            type="express",
            email=current_user.email,
            metadata={"user_id": current_user.id},
            capabilities={
                "transfers": {"requested": True},
            },
        )
        current_user.stripe_connect_account_id = account.id
        await db.commit()

    refresh_url = f"{settings.frontend_url}/billing/connect?refresh=1"
    return_url = f"{settings.frontend_url}/billing/connect?success=1"

    link = stripe.AccountLink.create(
        account=current_user.stripe_connect_account_id,
        refresh_url=refresh_url,
        return_url=return_url,
        type="account_onboarding",
    )

    return {"success": True, "data": {"onboarding_url": link.url}}


@router.get("/connect", status_code=status.HTTP_200_OK)
async def connect_status(current_user: CurrentUser) -> dict:
    """Return the creator's Stripe Connect account status."""
    if not settings.stripe_secret_key:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail={
                "success": False,
                "error": "Stripe not configured",
                "code": "STRIPE_NOT_CONFIGURED",
            },
        )

    if not current_user.stripe_connect_account_id:
        return {
            "success": True,
            "data": {"connected": False, "charges_enabled": False, "payouts_enabled": False},
        }

    account = stripe.Account.retrieve(current_user.stripe_connect_account_id)
    return {
        "success": True,
        "data": {
            "connected": True,
            "account_id": account.id,
            "charges_enabled": account.charges_enabled,
            "payouts_enabled": account.payouts_enabled,
            "details_submitted": account.details_submitted,
        },
    }


# ---------------------------------------------------------------------------
# One-time payment intent
# ---------------------------------------------------------------------------


@router.post("/payment-intent", response_model=PaymentIntentResponse)
async def create_payment_intent(
    body: PaymentIntentRequest,
    current_user: CurrentUser,
    db: DBSession,
) -> PaymentIntentResponse:
    """Create a Stripe PaymentIntent for a one-time charge.
    Returns client_secret for use with Stripe.js on the frontend."""
    if not settings.stripe_secret_key:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail={
                "success": False,
                "error": "Stripe not configured",
                "code": "STRIPE_NOT_CONFIGURED",
            },
        )

    customer_id = await _get_or_create_stripe_customer(current_user, db)

    try:
        intent = stripe.PaymentIntent.create(
            amount=body.amount,
            currency=body.currency.lower(),
            customer=customer_id,
            description=body.description,
            metadata={"user_id": current_user.id},
            automatic_payment_methods={"enabled": True},
        )
    except stripe.InvalidRequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"success": False, "error": str(exc), "code": "STRIPE_INVALID_REQUEST"},
        )

    # Record the pending payment — confirmed via webhook invoice.payment_succeeded
    payment = Payment(
        user_id=current_user.id,
        stripe_payment_intent_id=intent.id,
        amount=body.amount,
        currency=body.currency.lower(),
        status=PaymentStatus.processing,
        description=body.description,
    )
    db.add(payment)
    await db.commit()

    return PaymentIntentResponse(
        data={
            "client_secret": intent.client_secret,
            "payment_intent_id": intent.id,
        }
    )


# ---------------------------------------------------------------------------
# Webhook
# ---------------------------------------------------------------------------


@router.post("/webhook", status_code=status.HTTP_200_OK)
async def stripe_webhook(request: Request, db: DBSession) -> dict:
    """Receive and process Stripe webhook events."""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, settings.stripe_webhook_secret)
    except stripe.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")
    except Exception:
        raise HTTPException(status_code=400, detail="Malformed webhook payload")

    event_type: str = event["type"]
    data = event["data"]["object"]

    logger.info(f"Stripe webhook: {event_type} id={event['id']}")

    try:
        if event_type == "customer.subscription.created":
            await _handle_subscription_created(data, db)
        elif event_type == "customer.subscription.updated":
            await _handle_subscription_updated(data, db)
        elif event_type == "customer.subscription.deleted":
            await _handle_subscription_deleted(data, db)
        elif event_type == "invoice.payment_succeeded":
            await _handle_invoice_paid(data, db)
        elif event_type == "invoice.payment_failed":
            await _handle_invoice_failed(data, db)
    except Exception as exc:
        logger.error(f"Webhook handler error for {event_type}: {exc}")
        # Return 200 so Stripe doesn't retry — we log and alert separately
        return {"success": True, "data": {"status": "handler_error"}}

    return {"success": True, "data": {"status": "processed"}}


# ---------------------------------------------------------------------------
# Webhook event handlers
# ---------------------------------------------------------------------------


async def _upsert_subscription(stripe_sub: dict, user: User, db: DBSession) -> None:
    """Create or update the local Subscription record from a Stripe subscription object."""
    stripe_sub_id: str = stripe_sub["id"]
    stripe_status: str = stripe_sub["status"]
    price = stripe_sub["items"]["data"][0]["price"] if stripe_sub["items"]["data"] else {}
    stripe_price_id: str = price.get("id", "")

    period_start = stripe_sub.get("current_period_start")
    period_end = stripe_sub.get("current_period_end")

    sub = await db.scalar(
        select(Subscription).where(Subscription.stripe_subscription_id == stripe_sub_id)
    )
    if not sub:
        sub = Subscription(
            user_id=user.id,
            stripe_subscription_id=stripe_sub_id,
        )
        db.add(sub)

    sub.stripe_price_id = stripe_price_id
    sub.status = _stripe_status_to_state(stripe_status)
    sub.plan = SubscriptionPlan.pro  # refined per price_id in future
    sub.current_period_start = (
        datetime.fromtimestamp(period_start, tz=UTC) if period_start else None
    )
    sub.current_period_end = datetime.fromtimestamp(period_end, tz=UTC) if period_end else None
    sub.cancel_at_period_end = stripe_sub.get("cancel_at_period_end", False)

    # Mirror status on the user row for fast lookups
    user.subscription_status = (
        SubscriptionStatus(stripe_status)
        if stripe_status in SubscriptionStatus.__members__
        else None
    )
    user.role = _stripe_status_to_role(stripe_status)

    await db.commit()


async def _handle_subscription_created(data: dict, db: DBSession) -> None:
    customer_id: str = data.get("customer", "")
    user = await _find_user_by_customer(customer_id, db)
    if not user:
        logger.warning(f"subscription.created: no user for customer {customer_id}")
        return
    await _upsert_subscription(data, user, db)
    logger.info(f"Subscription created for user {user.id}: {data['id']}")


async def _handle_subscription_updated(data: dict, db: DBSession) -> None:
    customer_id: str = data.get("customer", "")
    user = await _find_user_by_customer(customer_id, db)
    if not user:
        logger.warning(f"subscription.updated: no user for customer {customer_id}")
        return
    await _upsert_subscription(data, user, db)
    logger.info(f"Subscription updated for user {user.id}: status={data.get('status')}")


async def _handle_subscription_deleted(data: dict, db: DBSession) -> None:
    customer_id: str = data.get("customer", "")
    user = await _find_user_by_customer(customer_id, db)
    if not user:
        logger.warning(f"subscription.deleted: no user for customer {customer_id}")
        return

    stripe_sub_id: str = data["id"]
    sub = await db.scalar(
        select(Subscription).where(Subscription.stripe_subscription_id == stripe_sub_id)
    )
    if sub:
        sub.status = SubscriptionState.canceled
        sub.canceled_at = datetime.now(UTC)

    user.role = UserRole.free
    user.subscription_status = SubscriptionStatus.canceled
    await db.commit()
    logger.info(f"Subscription canceled — user {user.id} downgraded to free")


async def _handle_invoice_paid(data: dict, db: DBSession) -> None:
    customer_id: str = data.get("customer", "")
    user = await _find_user_by_customer(customer_id, db)
    if not user:
        return

    amount_paid: int = data.get("amount_paid", 0)
    currency: str = data.get("currency", "usd")
    payment_intent_id: str | None = data.get("payment_intent")
    stripe_invoice_id: str = data["id"]

    payment = Payment(
        user_id=user.id,
        stripe_payment_intent_id=payment_intent_id,
        stripe_invoice_id=stripe_invoice_id,
        amount=amount_paid,
        currency=currency,
        status=PaymentStatus.succeeded,
        description=f"Invoice {stripe_invoice_id}",
    )
    db.add(payment)
    await db.commit()
    logger.info(f"Payment recorded for user {user.id}: {amount_paid} {currency}")


async def _handle_invoice_failed(data: dict, db: DBSession) -> None:
    customer_id: str = data.get("customer", "")
    user = await _find_user_by_customer(customer_id, db)
    if not user:
        return

    stripe_sub_id: str | None = data.get("subscription")
    if stripe_sub_id:
        sub = await db.scalar(
            select(Subscription).where(Subscription.stripe_subscription_id == stripe_sub_id)
        )
        if sub:
            sub.status = SubscriptionState.past_due
            sub.payment_failed_at = sub.payment_failed_at or datetime.now(UTC)
            user.subscription_status = SubscriptionStatus.past_due
            await db.commit()

    # Notify user
    _send(
        to=user.email,
        subject="Action required: payment failed",
        html=f"""
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
          <h2>Payment failed</h2>
          <p>We couldn't process your latest payment for ChatCraft AI.
             Your account remains active for 3 days while we retry.</p>
          <p>
            <a href="{settings.frontend_url}/billing"
               style="display:inline-block;padding:12px 24px;background:#000;
                      color:#fff;border-radius:6px;text-decoration:none">
              Update payment method
            </a>
          </p>
        </div>
        """,
    )
    logger.warning(f"Payment failed for user {user.id} — status set to past_due")
