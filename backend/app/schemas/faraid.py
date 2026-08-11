from decimal import Decimal, InvalidOperation
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.services.faraid.registry import SUPPORTED_MADHHABS


class FaraidHeirs(BaseModel):
    """Heir composition. Every field defaults to absent/zero — callers (including
    the agent tool) must set a field explicitly to declare that heir present;
    silence is never treated as "asked and confirmed absent" by this schema.
    That behavioural contract (ask, don't assume) lives in the agent's system
    prompt, not here — see app/api/agents.py's `_build_system_prompt`."""

    model_config = ConfigDict(extra="forbid")

    husband: bool = False
    wives: int = Field(0, ge=0, le=4, description="Number of surviving wives (max 4)")
    sons: int = Field(0, ge=0, le=50)
    daughters: int = Field(0, ge=0, le=50)
    father: bool = False
    mother: bool = False
    paternal_grandfather: bool = False
    paternal_grandmother: bool = False
    maternal_grandmother: bool = False
    full_brothers: int = Field(0, ge=0, le=50)
    full_sisters: int = Field(0, ge=0, le=50)
    paternal_brothers: int = Field(
        0, ge=0, le=50, description="Consanguine (same father, different mother)"
    )
    paternal_sisters: int = Field(0, ge=0, le=50)
    maternal_brothers: int = Field(
        0, ge=0, le=50, description="Uterine (same mother, different father)"
    )
    maternal_sisters: int = Field(0, ge=0, le=50)
    grandsons_via_son: int = Field(0, ge=0, le=50, description="Sons of sons")
    granddaughters_via_son: int = Field(0, ge=0, le=50, description="Daughters of sons")

    @model_validator(mode="after")
    def _v_any_heir(self):
        if not any(
            [
                self.husband,
                self.wives,
                self.sons,
                self.daughters,
                self.father,
                self.mother,
                self.paternal_grandfather,
                self.paternal_grandmother,
                self.maternal_grandmother,
                self.full_brothers,
                self.full_sisters,
                self.paternal_brothers,
                self.paternal_sisters,
                self.maternal_brothers,
                self.maternal_sisters,
                self.grandsons_via_son,
                self.granddaughters_via_son,
            ]
        ):
            raise ValueError("At least one heir must be specified")
        return self


def _parse_money(value: str, field_name: str) -> str:
    try:
        d = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise ValueError(f"{field_name} must be a valid decimal number") from None
    if d.is_nan() or d.is_infinite():
        raise ValueError(f"{field_name} must be a finite number")
    if d < 0:
        raise ValueError(f"{field_name} must not be negative")
    return str(d)


class FaraidCalculateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decedent_gender: Literal["male", "female"]
    gross_estate: str = Field(..., description="Decimal amount as a string, e.g. '125000.00'")
    funeral_expenses: str = Field("0", description="Decimal amount as a string")
    debts: str = Field("0", description="Decimal amount as a string")
    bequest: str = Field(
        "0",
        description="Wasiyyah (bequest) — decimal amount as a string; capped at 1/3 of the "
        "estate after debts unless heir consent is separately obtained",
    )
    currency: str = Field("GBP", min_length=3, max_length=3)
    madhhab: str = Field("hanafi")
    heirs: FaraidHeirs

    _v_gross = field_validator("gross_estate")(lambda cls, v: _parse_money(v, "gross_estate"))
    _v_funeral = field_validator("funeral_expenses")(
        lambda cls, v: _parse_money(v, "funeral_expenses")
    )
    _v_debts = field_validator("debts")(lambda cls, v: _parse_money(v, "debts"))
    _v_bequest = field_validator("bequest")(lambda cls, v: _parse_money(v, "bequest"))

    @model_validator(mode="after")
    def _v_consistency(self):
        gross = Decimal(self.gross_estate)
        if gross <= 0:
            raise ValueError("gross_estate must be greater than zero")
        funeral = Decimal(self.funeral_expenses)
        debts = Decimal(self.debts)
        if funeral + debts >= gross:
            raise ValueError("funeral_expenses + debts must be less than gross_estate")

        if self.decedent_gender == "male" and self.heirs.husband:
            raise ValueError("A male decedent cannot have a 'husband' heir")
        if self.decedent_gender == "female" and self.heirs.wives > 0:
            raise ValueError("A female decedent cannot have 'wives' heirs")

        if self.madhhab not in SUPPORTED_MADHHABS:
            raise ValueError(
                f"Unsupported madhhab: {self.madhhab!r}. Supported: {', '.join(SUPPORTED_MADHHABS)}."
            )
        return self


class EvidenceOut(BaseModel):
    id: str
    reference: str
    topic: str
    is_quranic: bool


class HeirShareOut(BaseModel):
    heir_type: str
    count: int
    fraction: str
    percentage: str
    amount: str
    share_mode: str
    evidence: list[EvidenceOut] = []


class BlockedHeirOut(BaseModel):
    heir_type: str
    count: int
    reason: str
    evidence: list[EvidenceOut] = []


class AdjustmentOut(BaseModel):
    kind: Literal["none", "awl", "radd"]
    original_fixed_total: str
    adjusted_fixed_total: str
    note: str = ""


class ReconciliationOut(BaseModel):
    sum_of_fractions: str
    sum_of_amounts: str
    unallocated_amount: str
    net_estate: str
    difference: str


class FaraidCalculateResponse(BaseModel):
    decedent_gender: str
    madhhab: str
    currency: str
    gross_estate: str
    funeral_expenses: str
    debts: str
    bequest: str
    net_estate: str
    eligible_heirs: list[HeirShareOut]
    blocked_heirs: list[BlockedHeirOut]
    adjustment: AdjustmentOut
    calculation_steps: list[str]
    warnings: list[str]
    reconciliation: ReconciliationOut
    disclaimer: str
