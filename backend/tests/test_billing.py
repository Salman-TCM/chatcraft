"""
Stripe billing unit tests.

Covers pure-Python helpers — status-to-role mapping, state mapping —
without making real Stripe API calls.
"""
import pytest

from app.api.billing import _stripe_status_to_role, _stripe_status_to_state
from app.models.subscription import SubscriptionState
from app.models.user import UserRole


# ── _stripe_status_to_role ────────────────────────────────────────────────────

class TestStripeStatusToRole:
    def test_active_returns_premium(self):
        assert _stripe_status_to_role("active") == UserRole.premium

    def test_trialing_returns_premium(self):
        assert _stripe_status_to_role("trialing") == UserRole.premium

    def test_canceled_returns_free(self):
        assert _stripe_status_to_role("canceled") == UserRole.free

    def test_past_due_returns_free(self):
        assert _stripe_status_to_role("past_due") == UserRole.free

    def test_unpaid_returns_free(self):
        assert _stripe_status_to_role("unpaid") == UserRole.free

    def test_incomplete_returns_free(self):
        assert _stripe_status_to_role("incomplete") == UserRole.free

    def test_incomplete_expired_returns_free(self):
        assert _stripe_status_to_role("incomplete_expired") == UserRole.free

    def test_unknown_status_returns_free(self):
        assert _stripe_status_to_role("unknown_status") == UserRole.free

    def test_empty_string_returns_free(self):
        assert _stripe_status_to_role("") == UserRole.free


# ── _stripe_status_to_state ───────────────────────────────────────────────────

class TestStripeStatusToState:
    def test_active_maps_correctly(self):
        assert _stripe_status_to_state("active") == SubscriptionState.active

    def test_trialing_maps_correctly(self):
        assert _stripe_status_to_state("trialing") == SubscriptionState.trialing

    def test_past_due_maps_correctly(self):
        assert _stripe_status_to_state("past_due") == SubscriptionState.past_due

    def test_canceled_maps_correctly(self):
        assert _stripe_status_to_state("canceled") == SubscriptionState.canceled

    def test_unpaid_maps_correctly(self):
        assert _stripe_status_to_state("unpaid") == SubscriptionState.unpaid

    def test_incomplete_maps_correctly(self):
        assert _stripe_status_to_state("incomplete") == SubscriptionState.incomplete

    def test_incomplete_expired_maps_correctly(self):
        assert _stripe_status_to_state("incomplete_expired") == SubscriptionState.incomplete_expired

    def test_unknown_defaults_to_active(self):
        # Unknown statuses default to active (safe fallback — don't cut off)
        assert _stripe_status_to_state("totally_unknown") == SubscriptionState.active

    def test_all_known_statuses_have_mappings(self):
        """Ensure no known Stripe status falls through to the default."""
        known = ["active", "trialing", "past_due", "canceled", "unpaid", "incomplete", "incomplete_expired"]
        for s in known:
            result = _stripe_status_to_state(s)
            assert result != SubscriptionState.active or s == "active", (
                f"Status '{s}' unexpectedly defaulted to 'active'"
            )
