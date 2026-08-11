"""
Decimal-safe money allocation for Faraid results.

Splitting a Decimal estate by exact Fractions almost never lands on whole
cents (e.g. a third of £100.00 is £33.33333...). This uses the standard
"largest remainder" apportionment method: floor every share to the minor
unit, then hand out the leftover pennies one at a time to the shares with
the largest fractional remainder — so individual amounts are as fair as
possible AND the sum reconciles exactly to the total being split, in
whole cents, with no floating point involved anywhere.
"""

from decimal import ROUND_DOWN, Decimal, localcontext
from fractions import Fraction


def allocate(
    total: Decimal, shares: list[tuple[str, Fraction]], minor_unit: int = 2
) -> dict[str, Decimal]:
    """Split `total` across `shares` = [(key, fraction), ...]. Fractions need not
    sum to 1 — the returned amounts reconcile to sum(total * fraction), not
    necessarily to `total` itself, which is exactly what's needed when part of
    the estate is deliberately left unallocated (see hanafi.py's radd handling).
    """
    if not shares:
        return {}

    quantum = Decimal(1).scaleb(-minor_unit)
    with localcontext() as ctx:
        ctx.prec = 50
        exact: dict[str, Decimal] = {}
        for key, frac in shares:
            exact[key] = total * Decimal(frac.numerator) / Decimal(frac.denominator)

        floors = {k: v.quantize(quantum, rounding=ROUND_DOWN) for k, v in exact.items()}
        total_exact = sum(exact.values(), Decimal(0))
        total_floor = sum(floors.values(), Decimal(0))
        remainder_units = int(((total_exact - total_floor) / quantum).to_integral_value())

        # Largest fractional remainder first — ties broken by insertion order
        # (dict preserves it), which keeps results deterministic for tests.
        by_remainder = sorted(exact.keys(), key=lambda k: exact[k] - floors[k], reverse=True)

        result = dict(floors)
        for i in range(max(0, remainder_units)):
            result[by_remainder[i % len(by_remainder)]] += quantum
        return result
