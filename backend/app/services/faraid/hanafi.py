"""
Hanafi rule set for Faraid (Islamic inheritance) calculations.

Implements, for the heir set this feature supports (spouses, parents,
children, one generation of grandchildren through sons, grandparents one
degree up, and full/paternal/maternal siblings):

  - hajb (blocking): a nearer heir fully excludes a farther one.
  - fixed shares (fard): the Qur'anically-specified fractions.
  - asabah (residue): the nearest class of agnatic residuary heirs takes
    the entire remainder; farther classes get nothing.
  - takmil (completion): a closer category's two-thirds ceiling (daughters,
    or full sisters) is shared with the corresponding farther category
    (son's daughters, or paternal sisters).
  - awl: proportional reduction when fixed shares exceed the whole estate.
  - radd: proportional return of a surplus to fixed-share blood relatives
    when no residuary heir exists to absorb it.

Deliberately NOT implemented — these are genuinely disputed or vanishingly
rare classical corner cases; guessing at them would be worse than refusing,
so the engine detects them and reports a warning instead of a silent
answer (see docs/FARAID.md, "Known limitations"):

  - al-Akdariyyah (grandfather + exactly one full sister + a fixed-share
    mother/grandmother, no other descendants or siblings): the classical
    exceptional re-division of grandfather's and sister's shares is not
    applied; the ordinary rules run instead and the result is flagged.
  - A surplus with literally no heir present except a spouse (no blood
    relative at all): classical Hanafi doctrine sends this to the state
    treasury (bait al-mal) rather than the spouse, which is not a role
    this calculator can decide for a given jurisdiction. The surplus is
    left unallocated with a warning instead of being assigned either way.
"""

from fractions import Fraction

from app.services.faraid.base import (
    Adjustment,
    BlockedHeir,
    CalculationResult,
    HeirInput,
    HeirShare,
    RuleSet,
)
from app.services.faraid.evidence import evidence_ids


class _Category:
    """Accumulator for one heir category while the algorithm runs — kept
    mutable and only converted to a frozen HeirShare/BlockedHeir once the
    final fraction (including any residue) is known."""

    __slots__ = ("heir_type", "count", "fraction", "mode", "evidence")

    def __init__(self, heir_type: str, count: int) -> None:
        self.heir_type = heir_type
        self.count = count
        self.fraction = Fraction(0)
        self.mode: str | None = None
        self.evidence: tuple[str, ...] = ()


class HanafiRuleSet(RuleSet):
    key = "hanafi"

    def calculate(self, heirs: HeirInput) -> CalculationResult:  # noqa: C901 — inherently branchy domain
        h = heirs
        steps: list[str] = []
        warnings: list[str] = []
        blocked: list[BlockedHeir] = []
        cats: dict[str, _Category] = {}

        def cat(heir_type: str, count: int) -> _Category:
            if heir_type not in cats:
                cats[heir_type] = _Category(heir_type, count)
            return cats[heir_type]

        # ── Descendant existence flags ──────────────────────────────────────
        has_agnatic_male_descendant = h.sons > 0 or h.grandsons_via_son > 0
        has_any_descendant = (
            h.sons > 0 or h.daughters > 0 or h.grandsons_via_son > 0 or h.granddaughters_via_son > 0
        )

        # ── Hajb: ascendants ────────────────────────────────────────────────
        grandfather_eligible = h.paternal_grandfather and not h.father
        if h.paternal_grandfather and not grandfather_eligible:
            blocked.append(
                BlockedHeir(
                    "paternal_grandfather",
                    1,
                    "Blocked by the father.",
                    evidence_ids("HANAFI_HAJB", "HANAFI_GRANDFATHER_AS_FATHER"),
                )
            )

        paternal_grandmother_eligible = h.paternal_grandmother and not h.mother and not h.father
        if h.paternal_grandmother and not paternal_grandmother_eligible:
            reason = "Blocked by the mother." if h.mother else "Blocked by the father."
            blocked.append(
                BlockedHeir("paternal_grandmother", 1, reason, evidence_ids("HANAFI_HAJB"))
            )

        maternal_grandmother_eligible = h.maternal_grandmother and not h.mother
        if h.maternal_grandmother and not maternal_grandmother_eligible:
            blocked.append(
                BlockedHeir(
                    "maternal_grandmother", 1, "Blocked by the mother.", evidence_ids("HANAFI_HAJB")
                )
            )

        # ── Hajb: grandchildren through a son ───────────────────────────────
        grandsons_via_son_eligible = h.grandsons_via_son if h.sons == 0 else 0
        if h.grandsons_via_son and h.sons:
            blocked.append(
                BlockedHeir(
                    "grandsons_via_son",
                    h.grandsons_via_son,
                    "Blocked by a surviving son.",
                    evidence_ids("HANAFI_HAJB"),
                )
            )

        granddaughters_via_son_present = h.granddaughters_via_son if h.sons == 0 else 0
        if h.granddaughters_via_son and h.sons:
            blocked.append(
                BlockedHeir(
                    "daughters_of_sons",
                    h.granddaughters_via_son,
                    "Blocked by a surviving son.",
                    evidence_ids("HANAFI_HAJB"),
                )
            )

        # ── Hajb: siblings ───────────────────────────────────────────────────
        ascendant_blocks_siblings = h.father or h.paternal_grandfather

        def ascendant_or_descendant_sibling_block() -> str | None:
            if h.father:
                return "Blocked by the father."
            if h.paternal_grandfather:
                return "Blocked by the paternal grandfather (standing in for the father)."
            if has_agnatic_male_descendant:
                return "Blocked by a surviving son or son's son."
            return None

        full_sibling_block_reason = ascendant_or_descendant_sibling_block()
        full_brothers_eligible = h.full_brothers if full_sibling_block_reason is None else 0
        full_sisters_eligible = h.full_sisters if full_sibling_block_reason is None else 0
        if full_sibling_block_reason:
            if h.full_brothers:
                blocked.append(
                    BlockedHeir(
                        "full_brothers",
                        h.full_brothers,
                        full_sibling_block_reason,
                        evidence_ids("HANAFI_HAJB"),
                    )
                )
            if h.full_sisters:
                blocked.append(
                    BlockedHeir(
                        "full_sisters",
                        h.full_sisters,
                        full_sibling_block_reason,
                        evidence_ids("HANAFI_HAJB"),
                    )
                )

        if full_sibling_block_reason is not None:
            paternal_sibling_block_reason = full_sibling_block_reason
        elif full_brothers_eligible > 0:
            paternal_sibling_block_reason = "Blocked by a full brother."
        else:
            paternal_sibling_block_reason = None

        paternal_brothers_eligible = (
            h.paternal_brothers if paternal_sibling_block_reason is None else 0
        )
        if paternal_sibling_block_reason:
            if h.paternal_brothers:
                blocked.append(
                    BlockedHeir(
                        "paternal_brothers",
                        h.paternal_brothers,
                        paternal_sibling_block_reason,
                        evidence_ids("HANAFI_HAJB"),
                    )
                )
            if h.paternal_sisters:
                blocked.append(
                    BlockedHeir(
                        "paternal_sisters",
                        h.paternal_sisters,
                        paternal_sibling_block_reason,
                        evidence_ids("HANAFI_HAJB"),
                    )
                )

        uterine_block_reason: str | None = None
        if ascendant_blocks_siblings:
            uterine_block_reason = (
                "Blocked by the father." if h.father else "Blocked by the paternal grandfather."
            )
        elif has_any_descendant:
            uterine_block_reason = "Blocked by a surviving child or grandchild through a son."
        maternal_brothers_eligible = h.maternal_brothers if uterine_block_reason is None else 0
        maternal_sisters_eligible = h.maternal_sisters if uterine_block_reason is None else 0
        if uterine_block_reason:
            if h.maternal_brothers:
                blocked.append(
                    BlockedHeir(
                        "maternal_brothers",
                        h.maternal_brothers,
                        uterine_block_reason,
                        evidence_ids("HANAFI_HAJB", "QURAN_4_12_UTERINE_SIBLINGS"),
                    )
                )
            if h.maternal_sisters:
                blocked.append(
                    BlockedHeir(
                        "maternal_sisters",
                        h.maternal_sisters,
                        uterine_block_reason,
                        evidence_ids("HANAFI_HAJB", "QURAN_4_12_UTERINE_SIBLINGS"),
                    )
                )

        # ── Fixed shares ─────────────────────────────────────────────────────
        fixed_total = Fraction(0)

        if h.decedent_gender == "female" and h.husband:
            frac = Fraction(1, 4) if has_any_descendant else Fraction(1, 2)
            c = cat("husband", 1)
            c.fraction, c.mode, c.evidence = frac, "fixed", evidence_ids("QURAN_4_12_SPOUSE")
            fixed_total += frac
            steps.append(
                f"Husband: {frac} "
                f"({'1/4 — descendants present' if has_any_descendant else '1/2 — no descendants'})."
            )

        if h.decedent_gender == "male" and h.wives > 0:
            total = Fraction(1, 8) if has_any_descendant else Fraction(1, 4)
            c = cat("wives", h.wives)
            c.fraction, c.mode, c.evidence = total, "fixed", evidence_ids("QURAN_4_12_SPOUSE")
            fixed_total += total
            steps.append(
                f"Wives ({h.wives}): {total} collectively, split equally "
                f"({total / h.wives} each) "
                f"({'1/8 — descendants present' if has_any_descendant else '1/4 — no descendants'})."
            )

        father_residue_eligible = False
        grandfather_residue_eligible = False

        if h.father:
            if has_agnatic_male_descendant:
                frac = Fraction(1, 6)
                c = cat("father", 1)
                c.fraction, c.mode, c.evidence = frac, "fixed", evidence_ids("QURAN_4_11_PARENTS")
                fixed_total += frac
                steps.append(
                    "Father: 1/6 fixed (a son or son's son is present, so no residuary share)."
                )
            elif has_any_descendant:
                frac = Fraction(1, 6)
                c = cat("father", 1)
                c.fraction, c.mode, c.evidence = (
                    frac,
                    "fixed_and_residuary",
                    evidence_ids("QURAN_4_11_PARENTS", "HANAFI_ASABAH"),
                )
                fixed_total += frac
                father_residue_eligible = True
                steps.append(
                    "Father: 1/6 fixed, plus the residue as the nearest agnate "
                    "(only daughters/son's-daughters present, no son or son's son)."
                )
            else:
                father_residue_eligible = True
                cat("father", 1)
                steps.append(
                    "Father: no fixed share (no descendants) — takes the residue as the nearest agnate."
                )
        elif grandfather_eligible:
            if has_agnatic_male_descendant:
                frac = Fraction(1, 6)
                c = cat("paternal_grandfather", 1)
                c.fraction, c.mode, c.evidence = (
                    frac,
                    "fixed",
                    evidence_ids("HANAFI_GRANDFATHER_AS_FATHER"),
                )
                fixed_total += frac
                steps.append("Paternal grandfather (standing in for the father): 1/6 fixed.")
            elif has_any_descendant:
                frac = Fraction(1, 6)
                c = cat("paternal_grandfather", 1)
                c.fraction, c.mode, c.evidence = (
                    frac,
                    "fixed_and_residuary",
                    evidence_ids("HANAFI_GRANDFATHER_AS_FATHER", "HANAFI_ASABAH"),
                )
                fixed_total += frac
                grandfather_residue_eligible = True
                steps.append(
                    "Paternal grandfather: 1/6 fixed, plus the residue as the nearest agnate."
                )
            else:
                grandfather_residue_eligible = True
                cat("paternal_grandfather", 1)
                steps.append(
                    "Paternal grandfather: no fixed share (no descendants) — takes the residue as the "
                    "nearest agnate."
                )

        sibling_count_all = (
            h.full_brothers
            + h.full_sisters
            + h.paternal_brothers
            + h.paternal_sisters
            + h.maternal_brothers
            + h.maternal_sisters
        )
        spouse_only = (h.decedent_gender == "female" and h.husband) or (
            h.decedent_gender == "male" and h.wives > 0
        )
        umariyyatain = (
            h.father
            and h.mother
            and not has_any_descendant
            and sibling_count_all == 0
            and spouse_only
            and not h.paternal_grandfather
            and not h.paternal_grandmother
            and not h.maternal_grandmother
        )

        if h.mother:
            if has_any_descendant or sibling_count_all >= 2:
                frac = Fraction(1, 6)
                reason = (
                    "children/grandchildren present"
                    if has_any_descendant
                    else "two or more siblings present"
                )
                c = cat("mother", 1)
                c.fraction, c.mode, c.evidence = frac, "fixed", evidence_ids("QURAN_4_11_PARENTS")
                fixed_total += frac
                steps.append(f"Mother: 1/6 fixed ({reason}).")
            elif umariyyatain:
                remainder_after_spouse = Fraction(1) - fixed_total
                frac = remainder_after_spouse / 3
                c = cat("mother", 1)
                c.fraction, c.mode, c.evidence = frac, "fixed", evidence_ids("HANAFI_UMARIYYATAIN")
                fixed_total += frac
                steps.append(
                    f"Mother (Umariyyatain — both parents plus a single spouse only): a third of the "
                    f"remainder after the spouse's share = 1/3 x {remainder_after_spouse} = {frac}."
                )
            else:
                frac = Fraction(1, 3)
                c = cat("mother", 1)
                c.fraction, c.mode, c.evidence = frac, "fixed", evidence_ids("QURAN_4_11_PARENTS")
                fixed_total += frac
                steps.append(
                    "Mother: 1/3 fixed (no children/grandchildren, fewer than two siblings)."
                )

        grandmother_count = (1 if paternal_grandmother_eligible else 0) + (
            1 if maternal_grandmother_eligible else 0
        )
        if grandmother_count > 0:
            total = Fraction(1, 6)
            per_head = total / grandmother_count
            if paternal_grandmother_eligible:
                c = cat("paternal_grandmother", 1)
                c.fraction, c.mode, c.evidence = (
                    per_head,
                    "fixed",
                    evidence_ids("HANAFI_GRANDMOTHER_SHARE"),
                )
            if maternal_grandmother_eligible:
                c = cat("maternal_grandmother", 1)
                c.fraction, c.mode, c.evidence = (
                    per_head,
                    "fixed",
                    evidence_ids("HANAFI_GRANDMOTHER_SHARE"),
                )
            fixed_total += total
            steps.append(
                f"Grandmother(s) ({grandmother_count} eligible): 1/6 collectively, {per_head} each."
            )

        # ── Daughters, and daughters-of-sons (with takmil completion) ───────
        daughters_residuary = h.daughters > 0 and h.sons > 0
        if h.daughters > 0 and not daughters_residuary:
            frac = Fraction(1, 2) if h.daughters == 1 else Fraction(2, 3)
            c = cat("daughters", h.daughters)
            c.fraction, c.mode, c.evidence = frac, "fixed", evidence_ids("QURAN_4_11_CHILDREN")
            fixed_total += frac
            steps.append(
                f"Daughters ({h.daughters}), no son present: {frac} fixed collectively "
                f"({frac / h.daughters} each)."
            )

        gd_residuary = granddaughters_via_son_present > 0 and grandsons_via_son_eligible > 0
        if granddaughters_via_son_present > 0 and not gd_residuary:
            if h.daughters >= 2:
                blocked.append(
                    BlockedHeir(
                        "daughters_of_sons",
                        granddaughters_via_son_present,
                        "Two or more daughters already take the full 2/3 ceiling shared between "
                        "daughters and daughters of sons.",
                        evidence_ids("HANAFI_TAKMIL"),
                    )
                )
            elif h.daughters == 1:
                frac = Fraction(1, 6)
                c = cat("daughters_of_sons", granddaughters_via_son_present)
                c.fraction, c.mode, c.evidence = (
                    frac,
                    "fixed",
                    evidence_ids("HANAFI_TAKMIL", "HANAFI_GRANDCHILDREN_VIA_SON"),
                )
                fixed_total += frac
                steps.append(
                    f"Daughters of sons ({granddaughters_via_son_present}): 1/6 collectively, completing "
                    f"the one daughter's 1/2 up to the 2/3 ceiling."
                )
            else:
                frac = Fraction(1, 2) if granddaughters_via_son_present == 1 else Fraction(2, 3)
                c = cat("daughters_of_sons", granddaughters_via_son_present)
                c.fraction, c.mode, c.evidence = (
                    frac,
                    "fixed",
                    evidence_ids("HANAFI_GRANDCHILDREN_VIA_SON"),
                )
                fixed_total += frac
                steps.append(
                    f"Daughters of sons ({granddaughters_via_son_present}), no daughter or son's son "
                    f"present: {frac} fixed collectively (by analogy to daughters)."
                )

        # ── Uterine (maternal) siblings — always pure fard, never asabah ────
        total_uterine = maternal_brothers_eligible + maternal_sisters_eligible
        if total_uterine > 0:
            frac = Fraction(1, 6) if total_uterine == 1 else Fraction(1, 3)
            per_head = frac / total_uterine
            if maternal_brothers_eligible:
                c = cat("maternal_brothers", maternal_brothers_eligible)
                c.fraction = per_head * maternal_brothers_eligible
                c.mode, c.evidence = "fixed", evidence_ids("QURAN_4_12_UTERINE_SIBLINGS")
            if maternal_sisters_eligible:
                c = cat("maternal_sisters", maternal_sisters_eligible)
                c.fraction = per_head * maternal_sisters_eligible
                c.mode, c.evidence = "fixed", evidence_ids("QURAN_4_12_UTERINE_SIBLINGS")
            fixed_total += frac
            steps.append(
                f"Uterine (maternal) siblings ({total_uterine} total): {frac} collectively, split "
                f"equally regardless of sex ({per_head} each) — never residuary."
            )

        # ── Full & paternal sisters: fixed fard, or deferred to the residue pool ──
        female_descendant_trigger = h.daughters > 0 or granddaughters_via_son_present > 0
        full_sisters_ceiling_used = Fraction(0)
        full_sisters_residuary_mode: str | None = None  # "bi_ghayr" | "maal_ghayr" | None

        if full_sibling_block_reason is None and full_sisters_eligible > 0:
            if full_brothers_eligible > 0:
                full_sisters_residuary_mode = "bi_ghayr"
            elif female_descendant_trigger:
                full_sisters_residuary_mode = "maal_ghayr"
            else:
                frac = Fraction(1, 2) if full_sisters_eligible == 1 else Fraction(2, 3)
                full_sisters_ceiling_used = frac
                c = cat("full_sisters", full_sisters_eligible)
                c.fraction, c.mode, c.evidence = frac, "fixed", evidence_ids("QURAN_4_176_SIBLINGS")
                fixed_total += frac
                steps.append(
                    f"Full sisters ({full_sisters_eligible}), no full brother, no daughter/son's-"
                    f"daughter present: {frac} fixed collectively."
                )

        paternal_sisters_residuary_mode: str | None = None
        if paternal_sibling_block_reason is None and h.paternal_sisters > 0:
            if paternal_brothers_eligible > 0:
                paternal_sisters_residuary_mode = "bi_ghayr"
            elif (
                female_descendant_trigger
                and full_sisters_residuary_mode is None
                and full_sisters_eligible == 0
            ):
                paternal_sisters_residuary_mode = "maal_ghayr"
            elif female_descendant_trigger:
                # A full sister already claims the asabah-ma'al-ghayr role (or absorbed all residue in
                # bi_ghayr mode with a full brother) — nothing is left for paternal sisters this way.
                blocked.append(
                    BlockedHeir(
                        "paternal_sisters",
                        h.paternal_sisters,
                        "A full sister takes precedence for the residuary share alongside daughters/"
                        "son's-daughters, leaving nothing for a paternal sister this way.",
                        evidence_ids("HANAFI_ASABAH"),
                    )
                )
            else:
                remaining_ceiling = Fraction(2, 3) - full_sisters_ceiling_used
                if remaining_ceiling <= 0:
                    blocked.append(
                        BlockedHeir(
                            "paternal_sisters",
                            h.paternal_sisters,
                            "Two or more full sisters already take the full 2/3 ceiling shared between "
                            "full and paternal sisters.",
                            evidence_ids("HANAFI_TAKMIL"),
                        )
                    )
                else:
                    target = Fraction(1, 2) if h.paternal_sisters == 1 else Fraction(2, 3)
                    frac = min(target, remaining_ceiling)
                    c = cat("paternal_sisters", h.paternal_sisters)
                    c.fraction, c.mode, c.evidence = (
                        frac,
                        "fixed",
                        evidence_ids("QURAN_4_176_SIBLINGS", "HANAFI_TAKMIL"),
                    )
                    fixed_total += frac
                    note = (
                        " completing the full sister's ceiling" if full_sisters_ceiling_used else ""
                    )
                    steps.append(
                        f"Paternal (consanguine) sisters ({h.paternal_sisters}): {frac}{note}."
                    )

        # ── Awl: fixed shares exceed the whole estate ───────────────────────
        adjustment = Adjustment("none", fixed_total, fixed_total)
        residue = Fraction(1) - fixed_total

        if fixed_total > 1:
            scale = Fraction(1) / fixed_total
            for c in cats.values():
                if c.mode and c.mode.startswith("fixed") and c.fraction > 0:
                    c.fraction *= scale
            adjustment = Adjustment(
                "awl",
                fixed_total,
                Fraction(1),
                f"Fixed shares totalled {fixed_total}, exceeding the estate. Every fixed share was "
                f"scaled by {scale} so the total equals exactly 1.",
            )
            warnings.append(
                f"Awl applied: fixed shares totalled {fixed_total} (> 1). All fixed shares were "
                f"reduced proportionally."
            )
            steps.append(
                f"Awl: total fixed shares = {fixed_total} > 1 — scaling every fixed share by {scale}."
            )
            residue = Fraction(0)

        # ── Residuary (asabah) pool — exactly one class, in priority order ──
        pool_assigned = False
        if residue > 0:
            if h.sons > 0:
                pool_assigned = self._assign_pool(
                    cats,
                    residue,
                    [
                        ("sons", h.sons, 2, "QURAN_4_11_CHILDREN"),
                        ("daughters", h.daughters, 1, "QURAN_4_11_CHILDREN"),
                    ],
                    steps,
                    "Sons (with daughters as co-residuaries)",
                )
            elif grandsons_via_son_eligible > 0:
                pool_assigned = self._assign_pool(
                    cats,
                    residue,
                    [
                        (
                            "grandsons_via_son",
                            grandsons_via_son_eligible,
                            2,
                            "HANAFI_GRANDCHILDREN_VIA_SON",
                        ),
                        (
                            "daughters_of_sons",
                            granddaughters_via_son_present,
                            1,
                            "HANAFI_GRANDCHILDREN_VIA_SON",
                        ),
                    ],
                    steps,
                    "Sons of sons (with daughters of sons as co-residuaries)",
                )
            elif father_residue_eligible:
                c = cats["father"]
                c.fraction += residue
                c.mode = "residuary" if c.mode is None else "fixed_and_residuary"
                c.evidence = c.evidence or evidence_ids("HANAFI_ASABAH")
                pool_assigned = True
                steps.append(f"Residue of {residue} to the father as the nearest agnate.")
            elif grandfather_residue_eligible:
                c = cats["paternal_grandfather"]
                c.fraction += residue
                c.mode = "residuary" if c.mode is None else "fixed_and_residuary"
                c.evidence = c.evidence or evidence_ids(
                    "HANAFI_GRANDFATHER_AS_FATHER", "HANAFI_ASABAH"
                )
                pool_assigned = True
                steps.append(
                    f"Residue of {residue} to the paternal grandfather as the nearest agnate."
                )
            elif full_brothers_eligible > 0:
                pool_assigned = self._assign_pool(
                    cats,
                    residue,
                    [
                        ("full_brothers", full_brothers_eligible, 2, "HANAFI_ASABAH"),
                        (
                            "full_sisters",
                            full_sisters_eligible
                            if full_sisters_residuary_mode == "bi_ghayr"
                            else 0,
                            1,
                            "HANAFI_ASABAH",
                        ),
                    ],
                    steps,
                    "Full brothers (with full sisters as co-residuaries)",
                )
            elif full_sisters_residuary_mode == "maal_ghayr":
                pool_assigned = self._assign_pool(
                    cats,
                    residue,
                    [("full_sisters", full_sisters_eligible, 1, "HANAFI_ASABAH")],
                    steps,
                    "Full sisters as residuaries alongside daughters/son's-daughters",
                )
            elif paternal_brothers_eligible > 0:
                pool_assigned = self._assign_pool(
                    cats,
                    residue,
                    [
                        ("paternal_brothers", paternal_brothers_eligible, 2, "HANAFI_ASABAH"),
                        (
                            "paternal_sisters",
                            h.paternal_sisters
                            if paternal_sisters_residuary_mode == "bi_ghayr"
                            else 0,
                            1,
                            "HANAFI_ASABAH",
                        ),
                    ],
                    steps,
                    "Paternal brothers (with paternal sisters as co-residuaries)",
                )
            elif paternal_sisters_residuary_mode == "maal_ghayr":
                pool_assigned = self._assign_pool(
                    cats,
                    residue,
                    [("paternal_sisters", h.paternal_sisters, 1, "HANAFI_ASABAH")],
                    steps,
                    "Paternal sisters as residuaries alongside daughters/son's-daughters",
                )

        unallocated = Fraction(0)
        if residue > 0 and not pool_assigned:
            # ── Radd: no residuary heir — return the surplus to fixed-share blood
            # relatives (never to a spouse) in proportion to their shares.
            blood_relative_total = sum(
                (c.fraction for t, c in cats.items() if t not in ("husband", "wives")),
                Fraction(0),
            )
            if blood_relative_total > 0:
                scale = Fraction(1) + residue / blood_relative_total
                for t, c in cats.items():
                    if t not in ("husband", "wives") and c.fraction > 0:
                        c.fraction *= scale
                adjustment = Adjustment(
                    "radd",
                    fixed_total,
                    fixed_total + residue,
                    f"No residuary heir exists. The surplus of {residue} was returned to the present "
                    f"fixed-share blood relatives in proportion to their shares (spouses do not "
                    f"participate in radd).",
                )
                warnings.append(
                    f"Radd applied: {residue} of unclaimed estate returned proportionally to fixed-share "
                    f"blood relatives."
                )
                steps.append(
                    f"Radd: surplus of {residue} redistributed to blood relatives, scaling by {scale}."
                )
            else:
                # Only spouse(s) present, no blood relative at all — genuinely disputed corner case.
                unallocated = residue
                warnings.append(
                    f"{residue} of the estate is left unallocated: the only heir(s) present are a "
                    f"spouse, with no blood relative to receive radd. Classical Hanafi doctrine sends "
                    f"such a surplus to the state treasury (bait al-mal) rather than the spouse — this "
                    f"is jurisdiction-dependent and NOT decided by this calculator. Consult a scholar "
                    f"and/or the applicable succession law before distributing it."
                )
                steps.append(
                    f"No residuary heir and no other blood relative — {residue} left unallocated "
                    f"(see warnings)."
                )

        # ── Known-unresolved composition: al-Akdariyyah ─────────────────────
        # Checked on the raw input, not the derived `_eligible` flags: under the
        # ordinary hajb rule applied above, the grandfather blocks the sister
        # entirely (he stands in for the father) — that IS the ordinary answer.
        # The classical exception some Hanafi authorities apply specifically to
        # THIS composition gives her a share anyway via a special re-division;
        # we deliberately don't guess at that, only flag that it applies here.
        if (
            grandfather_eligible
            and not has_any_descendant
            and h.full_sisters == 1
            and h.full_brothers == 0
            and h.paternal_brothers == 0
            and h.paternal_sisters == 0
            and h.maternal_brothers == 0
            and h.maternal_sisters == 0
        ):
            warnings.append(
                "This composition (paternal grandfather + exactly one full sister, no other "
                "descendants or siblings) is the classical 'al-Akdariyyah' exceptional case, which "
                "some Hanafi authorities resolve with a special re-division of the grandfather's and "
                "sister's shares. That exceptional re-division is NOT applied here — the figures above "
                "use the ordinary rules. Verify this specific case with a qualified scholar."
            )

        # ── Assemble eligible/blocked lists from the accumulator ────────────
        eligible: list[HeirShare] = []
        for c in cats.values():
            if c.fraction > 0:
                eligible.append(
                    HeirShare(c.heir_type, c.count, c.fraction, c.mode or "fixed", c.evidence)
                )
            elif c.count > 0:
                blocked.append(
                    BlockedHeir(
                        c.heir_type,
                        c.count,
                        "No share remains after higher-priority heirs.",
                        c.evidence,
                    )
                )

        return CalculationResult(
            eligible=eligible,
            blocked=blocked,
            steps=steps,
            warnings=warnings,
            adjustment=adjustment,
            unallocated=unallocated,
        )

    @staticmethod
    def _assign_pool(
        cats: dict[str, _Category],
        residue: Fraction,
        members: list[tuple[str, int, int, str]],
        steps: list[str],
        label: str,
    ) -> bool:
        """Split `residue` across `members` = [(heir_type, count, weight, evidence_key), ...] in
        proportion to count*weight. Returns False (no-op) if every member has count 0."""
        total_weight = sum(count * weight for _, count, weight, _ in members)
        if total_weight <= 0:
            return False
        per_weight = residue / total_weight
        for heir_type, count, weight, ev_key in members:
            if count <= 0:
                continue
            c = cats.setdefault(heir_type, _Category(heir_type, count))
            c.fraction += per_weight * weight * count
            c.mode = "residuary" if c.mode is None else "fixed_and_residuary"
            c.evidence = tuple(set(c.evidence) | {ev_key}) if c.evidence else evidence_ids(ev_key)
        steps.append(
            f"{label}: residue of {residue} split {', '.join(f'{t}={c}x{w}' for t, c, w, _ in members)}."
        )
        return True
