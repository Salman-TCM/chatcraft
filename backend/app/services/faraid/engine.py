"""
Top-level Faraid orchestration — the single entry point both the API route
(app/api/faraid.py) and the agent tool (_tool_calculate_faraid in
app/api/agents.py) call. Everything here is deterministic arithmetic on
Fraction and Decimal; no LLM is involved in any share calculation.
"""

from decimal import Decimal, localcontext
from fractions import Fraction

from app.schemas.faraid import (
    AdjustmentOut,
    BlockedHeirOut,
    EvidenceOut,
    FaraidCalculateRequest,
    FaraidCalculateResponse,
    HeirShareOut,
    ReconciliationOut,
)
from app.services.faraid.base import HeirInput
from app.services.faraid.evidence import EVIDENCE
from app.services.faraid.money import allocate
from app.services.faraid.registry import get_ruleset

DISCLAIMER = (
    "This is a deterministic calculation provided for informational purposes only. "
    "It is not a fatwa and not legal advice. Verify the result — especially any "
    "warnings above — with a qualified Islamic scholar and/or a legal professional "
    "before acting on it."
)

_CENT = Decimal("0.01")


def _evidence_out(keys: tuple[str, ...]) -> list[EvidenceOut]:
    return [EvidenceOut(**EVIDENCE[k].__dict__) for k in keys]


def _percentage(frac: Fraction) -> str:
    if frac == 0:
        return "0%"
    with localcontext() as ctx:
        ctx.prec = 50
        pct = Decimal(frac.numerator) * Decimal(100) / Decimal(frac.denominator)
        return f"{pct.quantize(_CENT)}%"


def calculate(request: FaraidCalculateRequest) -> FaraidCalculateResponse:
    gross = Decimal(request.gross_estate)
    funeral = Decimal(request.funeral_expenses)
    debts = Decimal(request.debts)
    bequest_requested = Decimal(request.bequest)

    after_debts = gross - funeral - debts
    warnings: list[str] = []

    bequest_cap = (after_debts / 3).quantize(_CENT)
    bequest = bequest_requested
    if bequest_requested > bequest_cap:
        bequest = bequest_cap
        warnings.append(
            f"Requested bequest (wasiyyah) of {bequest_requested} exceeds the classical cap of "
            f"one third of the estate after debts ({bequest_cap}); it has been capped at "
            f"{bequest_cap}. Exceeding the cap is only valid with the unanimous consent of all "
            f"heirs, which this calculator cannot verify."
        )
    net_estate = (after_debts - bequest).quantize(_CENT)

    ruleset = get_ruleset(request.madhhab)
    heirs = HeirInput(decedent_gender=request.decedent_gender, **request.heirs.model_dump())
    result = ruleset.calculate(heirs)
    warnings = warnings + result.warnings

    sum_fraction = sum((s.fraction for s in result.eligible), Fraction(0))
    amounts = allocate(net_estate, [(s.heir_type, s.fraction) for s in result.eligible])
    sum_amount = sum(amounts.values(), Decimal("0.00"))

    eligible_out = [
        HeirShareOut(
            heir_type=s.heir_type,
            count=s.count,
            fraction=str(s.fraction),
            percentage=_percentage(s.fraction),
            amount=str(amounts.get(s.heir_type, Decimal("0.00"))),
            share_mode=s.share_mode,
            evidence=_evidence_out(s.evidence),
        )
        for s in result.eligible
    ]
    blocked_out = [
        BlockedHeirOut(
            heir_type=b.heir_type,
            count=b.count,
            reason=b.reason,
            evidence=_evidence_out(b.evidence),
        )
        for b in result.blocked
    ]

    unallocated_amount = Decimal("0.00")
    if result.unallocated > 0:
        with localcontext() as ctx:
            ctx.prec = 50
            unallocated_amount = (
                net_estate
                * Decimal(result.unallocated.numerator)
                / Decimal(result.unallocated.denominator)
            ).quantize(_CENT)
        warnings.append(f"Unallocated amount: {unallocated_amount} {request.currency} (see above).")

    reconciliation = ReconciliationOut(
        sum_of_fractions=str(sum_fraction),
        sum_of_amounts=str(sum_amount),
        unallocated_amount=str(unallocated_amount),
        net_estate=str(net_estate),
        difference=str(net_estate - sum_amount - unallocated_amount),
    )

    return FaraidCalculateResponse(
        decedent_gender=request.decedent_gender,
        madhhab=request.madhhab,
        currency=request.currency,
        gross_estate=str(gross),
        funeral_expenses=str(funeral),
        debts=str(debts),
        bequest=str(bequest),
        net_estate=str(net_estate),
        eligible_heirs=eligible_out,
        blocked_heirs=blocked_out,
        adjustment=AdjustmentOut(
            kind=result.adjustment.kind,
            original_fixed_total=str(result.adjustment.original_fixed_total),
            adjusted_fixed_total=str(result.adjustment.adjusted_fixed_total),
            note=result.adjustment.note,
        ),
        calculation_steps=result.steps,
        warnings=warnings,
        reconciliation=reconciliation,
        disclaimer=DISCLAIMER,
    )
