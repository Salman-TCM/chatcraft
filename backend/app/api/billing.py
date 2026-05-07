from fastapi import APIRouter, HTTPException, status

from app.core.config import settings
from app.core.dependencies import CurrentUser, DBSession
from app.core.stripe import stripe
from app.schemas.billing import CheckoutRequest, CheckoutResponse, PortalResponse

router = APIRouter(prefix="/api/billing", tags=["billing"])


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
            detail={"success": False, "error": "Stripe not configured", "code": "STRIPE_NOT_CONFIGURED"},
        )

    customer_id = await _get_or_create_stripe_customer(current_user, db)

    success_url = body.success_url or f"{settings.frontend_url}/billing/success?session_id={{CHECKOUT_SESSION_ID}}"
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
            subscription_data={
                "metadata": {"user_id": current_user.id},
            },
            metadata={"user_id": current_user.id},
        )
    except stripe.InvalidRequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"success": False, "error": str(exc), "code": "STRIPE_INVALID_REQUEST"},
        )

    return CheckoutResponse(data={"checkout_url": session.url, "session_id": session.id})
