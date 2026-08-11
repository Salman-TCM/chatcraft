"""
Shared data model for Faraid (Islamic inheritance) rule sets.

A "rule set" is one madhhab's (school of jurisprudence's) implementation of
hajb (blocking), fixed shares, asabah (residue), awl, and radd. Keeping this
module madhhab-agnostic — and putting each school's actual rules in its own
file (see hanafi.py) — is what lets a second madhhab be added later without
touching this file or the engine: implement RuleSet, register it in
registry.py, done.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from fractions import Fraction


@dataclass(frozen=True)
class HeirInput:
    """Heir composition for a single calculation. Counts are ≥ 0; booleans
    are presence flags. Validation (ranges, gender-consistency) happens in
    the Pydantic request schema — this dataclass assumes already-clean data.
    """

    decedent_gender: str  # "male" | "female"
    husband: bool = False
    wives: int = 0
    sons: int = 0
    daughters: int = 0
    father: bool = False
    mother: bool = False
    paternal_grandfather: bool = False
    paternal_grandmother: bool = False
    maternal_grandmother: bool = False
    full_brothers: int = 0
    full_sisters: int = 0
    paternal_brothers: int = 0
    paternal_sisters: int = 0
    maternal_brothers: int = 0
    maternal_sisters: int = 0
    grandsons_via_son: int = 0
    granddaughters_via_son: int = 0


@dataclass(frozen=True)
class HeirShare:
    """One eligible heir category's result. `fraction` is the TOTAL fraction
    of the net estate awarded to this whole category (e.g. both grandmothers
    combined) — divide by `count` for the per-head fraction."""

    heir_type: str
    count: int
    fraction: Fraction
    share_mode: str  # "fixed" | "residuary" | "fixed_and_residuary"
    evidence: tuple[str, ...] = ()


@dataclass(frozen=True)
class BlockedHeir:
    """A heir category present in the input but receiving zero — whether by
    classical hajb (blocked by a nearer heir) or by arithmetic exhaustion
    (e.g. a completion-share ceiling already used up by a closer category).
    Both are reported here so every present heir category is accounted for
    somewhere in the response."""

    heir_type: str
    count: int
    reason: str
    evidence: tuple[str, ...] = ()


@dataclass
class Adjustment:
    kind: str  # "none" | "awl" | "radd"
    original_fixed_total: Fraction
    adjusted_fixed_total: Fraction
    note: str = ""


@dataclass
class CalculationResult:
    eligible: list[HeirShare] = field(default_factory=list)
    blocked: list[BlockedHeir] = field(default_factory=list)
    steps: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    adjustment: Adjustment = field(
        default_factory=lambda: Adjustment("none", Fraction(0), Fraction(0))
    )
    unallocated: Fraction = Fraction(0)


class RuleSet(ABC):
    """One madhhab's Faraid rules. See hanafi.py for the reference implementation
    and docs/FARAID.md ("Adding another madhhab") for the extension contract."""

    #: Canonical key used in the API/tool `madhhab` field, e.g. "hanafi".
    key: str

    @abstractmethod
    def calculate(self, heirs: HeirInput) -> CalculationResult: ...
