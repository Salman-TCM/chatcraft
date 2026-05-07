import stripe as _stripe

from app.core.config import settings

_stripe.api_key = settings.stripe_secret_key
_stripe.api_version = "2024-06-20"

stripe = _stripe
