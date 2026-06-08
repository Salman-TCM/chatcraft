"""
WalletService — reusable wallet card operations for flows and internal callers.
"""
import logging
import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wallet import WalletCard, WalletCardEvent, WalletProgram, WalletPushSubscription

logger = logging.getLogger(__name__)


def _to_int(v, default: int = 0) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        raise ValueError(f"expected an integer, got {v!r}")


def _to_float(v, default: float = 0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        raise ValueError(f"expected a number, got {v!r}")


def apply_action(action: str, value, state: dict, cfg: dict) -> dict:
    """Pure function: apply a card action to a state dict, return updated state.

    Raises ValueError for invalid inputs (negative values, insufficient balance).
    """
    state = dict(state)
    if action == "add_punch":
        v = _to_int(value, 1) if value is not None else 1
        if v < 0:
            raise ValueError("value must be non-negative")
        state["punches"] = state.get("punches", 0) + v
        max_p = cfg.get("max_punches", 10)
        if state["punches"] >= max_p:
            state["punches"] = 0
            state["redeemed"] = state.get("redeemed", 0) + 1
    elif action == "remove_punch":
        v = _to_int(value, 1) if value is not None else 1
        if v < 0:
            raise ValueError("value must be non-negative")
        state["punches"] = max(0, state.get("punches", 0) - v)
    elif action == "set_punches":
        v = _to_int(value, 0)
        if v < 0:
            raise ValueError("value must be non-negative")
        state["punches"] = v
    elif action == "redeem":
        state["redeemed"] = state.get("redeemed", 0) + 1
        if "redeemed" in state and isinstance(state.get("redeemed"), bool):
            state["redeemed"] = True
    elif action == "redeem_coupon":
        state["redeemed"] = True
    elif action == "set_tier":
        state["tier"] = str(value or "Standard")
    elif action == "add_points":
        pts = _to_int(value, 0)
        if pts < 0:
            raise ValueError("value must be non-negative")
        state["points"] = state.get("points", 0) + pts
        state["lifetime_points"] = state.get("lifetime_points", 0) + pts
        tiers: list = cfg.get("tiers", [])
        for tier in reversed(tiers):
            if state["lifetime_points"] >= tier.get("min_points", 0):
                state["tier"] = tier["name"]
                break
    elif action == "remove_points":
        v = _to_int(value, 0)
        if v < 0:
            raise ValueError("value must be non-negative")
        state["points"] = max(0, state.get("points", 0) - v)
    elif action == "redeem_points_reward":
        cost = _to_int(value, 0) if value is not None else _to_int(cfg.get("points_threshold", 0), 0)
        if cost < 0:
            raise ValueError("value must be non-negative")
        state["points"] = max(0, state.get("points", 0) - cost)
        state["redeemed"] = state.get("redeemed", 0) + 1
    elif action in ("set_balance", "load_balance"):
        v = _to_float(value, 0.0)
        if v < 0:
            raise ValueError("value must be non-negative")
        state["balance"] = round(v, 2)
    elif action == "deduct_balance":
        v = _to_float(value, 0.0)
        if v < 0:
            raise ValueError("value must be non-negative")
        current = state.get("balance", 0.0)
        if v > current:
            raise ValueError(f"Insufficient balance: requested {v:.2f}, available {current:.2f}")
        state["balance"] = round(current - v, 2)
    elif action == "refund_balance":
        v = _to_float(value, 0.0)
        if v < 0:
            raise ValueError("value must be non-negative")
        state["balance"] = round(state.get("balance", 0.0) + v, 2)
    elif action == "check_in":
        state["checked_in"] = True
    elif action == "un_check_in":
        state["checked_in"] = False
    return state


def default_push_message(action: str, state: dict, program_name: str, cfg: dict) -> str:
    if action == "add_punch":
        punches = state.get("punches", 0)
        max_p = cfg.get("max_punches", 10)
        if punches == 0:
            return f"Reward unlocked! Enjoy your {cfg.get('reward_description', 'reward')}."
        return f"Punch added! You now have {punches} of {max_p} punches."
    if action == "remove_punch":
        return f"Punch removed. Balance: {state.get('punches', 0)} punches."
    if action in ("add_points", "redeem_points_reward"):
        bal = state.get("points", 0)
        return f"Points updated. Balance: {bal} {cfg.get('points_label', 'points')}."
    if action == "remove_points":
        return f"Points updated. Balance: {state.get('points', 0)}."
    if action in ("redeem", "redeem_coupon"):
        return "Your reward has been redeemed."
    if action == "set_tier":
        return f"Tier updated to {state.get('tier', 'Standard')}."
    return f"{program_name} pass updated."


class WalletService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def perform_action(
        self,
        serial: str,
        action: str,
        value,
        user_id: uuid.UUID,
        source: str = "flow",
        message: Optional[str] = None,
        silent: bool = False,
    ) -> WalletCard:
        result = await self.db.execute(
            select(WalletCard).where(WalletCard.serial == serial).with_for_update()
        )
        card = result.scalar_one_or_none()
        if not card:
            raise ValueError(f"Card not found: {serial}")

        program = await self.db.get(WalletProgram, card.program_id)
        if not program or program.user_id != user_id:
            raise PermissionError("Card not accessible")

        old_state = dict(card.state or {})
        cfg = program.config or {}
        new_state = apply_action(action, value, old_state, cfg)
        card.state = new_state

        delta = {k: new_state[k] for k in new_state if new_state.get(k) != old_state.get(k)}

        event = WalletCardEvent(
            card_id=card.id,
            program_id=card.program_id,
            action=action,
            delta=delta,
            message=message,
            source=source,
        )
        self.db.add(event)
        await self.db.commit()
        await self.db.refresh(card)

        if not silent:
            push_msg = message or default_push_message(action, new_state, program.name, cfg)
            await self._push_card(card, program, push_msg)

        # Fire automation triggers
        await self._dispatch_triggers(action, card, program, new_state, old_state, user_id)

        return card

    async def _push_card(self, card: WalletCard, program: WalletProgram, message: str) -> None:
        subs_result = await self.db.execute(
            select(WalletPushSubscription).where(WalletPushSubscription.card_id == card.id)
        )
        for sub in subs_result.scalars().all():
            if sub.device_type == "apple":
                from app.services.wallet.push import send_alert_apns
                await send_alert_apns(sub.push_token, message)
            elif sub.device_type == "google" and card.google_pass_object_id:
                try:
                    from app.services.wallet.google_wallet import push_update
                    push_update(card.google_pass_object_id, program.type)
                except Exception as exc:
                    logger.warning("Google Wallet push_update failed for card %s: %s", card.serial, exc)

    async def _dispatch_triggers(
        self, action: str, card: WalletCard, program: WalletProgram,
        new_state: dict, old_state: dict, user_id: uuid.UUID,
    ) -> None:
        from app.services.automation import dispatch

        context = {
            "serial": card.serial,
            "contact_id": str(card.contact_id) if card.contact_id else None,
            "program_id": str(program.id),
            "program_name": program.name,
            "program_type": program.type,
            "customer_name": card.customer_name,
            "customer_email": card.customer_email,
        }

        trigger = None
        if action == "add_punch":
            context["punches"] = new_state.get("punches", 0)
            if old_state.get("punches", 0) > 0 and new_state.get("punches", 0) == 0:
                trigger = "wallet_reward_unlocked"
            else:
                trigger = "wallet_punch_added"
        elif action == "remove_punch":
            trigger = "wallet_punch_added"
            context["punches"] = new_state.get("punches", 0)
        elif action in ("add_points", "remove_points"):
            context["points"] = new_state.get("points", 0)
            trigger = "wallet_points_added"
        elif action == "redeem_points_reward":
            context["points"] = new_state.get("points", 0)
            trigger = "wallet_reward_redeemed"
        elif action in ("redeem", "redeem_coupon"):
            if program.type == "coupon":
                trigger = "wallet_coupon_claimed"
            else:
                trigger = "wallet_reward_redeemed"
        elif action == "set_tier":
            context["tier"] = new_state.get("tier")
            trigger = "wallet_points_added"

        if trigger:
            try:
                await dispatch(trigger, user_id, self.db, context)
            except Exception as exc:
                logger.warning("Wallet automation dispatch failed (trigger=%s, card=%s): %s", trigger, card.serial, exc)
