"""
Faraid (Hanafi) engine unit tests — pure Python, no database.

Every expected value below is derived independently from standard Faraid
rules/textbook examples (hand-computed in the PR description / code review,
not by running this calculator) — never copied from the engine's own output.
Where a case is a well-known named example (Umariyyatain, the classic
husband+2-sisters Awl case, etc.) that is called out in a comment.
"""

from decimal import Decimal
from fractions import Fraction

import pytest
from pydantic import ValidationError

from app.schemas.faraid import FaraidCalculateRequest
from app.services.faraid.base import HeirInput
from app.services.faraid.engine import calculate as calculate_full
from app.services.faraid.hanafi import HanafiRuleSet
from app.services.faraid.money import allocate

RULESET = HanafiRuleSet()


def calc(**kwargs):
    gender = kwargs.pop("decedent_gender", "male")
    return RULESET.calculate(HeirInput(decedent_gender=gender, **kwargs))


def share(result, heir_type):
    for s in result.eligible:
        if s.heir_type == heir_type:
            return s
    return None


def blocked_reason(result, heir_type):
    for b in result.blocked:
        if b.heir_type == heir_type:
            return b.reason
    return None


def total_eligible_fraction(result) -> Fraction:
    return sum((s.fraction for s in result.eligible), Fraction(0))


def assert_reconciles(result):
    """Universal invariant: every present heir's fraction, plus whatever is
    explicitly left unallocated, accounts for exactly the whole estate."""
    assert total_eligible_fraction(result) + result.unallocated == Fraction(1)


# ── Spouses ──────────────────────────────────────────────────────────────────


def test_husband_only_no_descendants_leaves_unallocated_radd_edge_case():
    result = calc(decedent_gender="female", husband=True)
    assert share(result, "husband").fraction == Fraction(1, 2)
    # No blood relative at all -> classical radd-to-blood-relatives doesn't
    # apply; left unallocated with a warning rather than guessed either way.
    assert result.unallocated == Fraction(1, 2)
    assert any("bait al-mal" in w or "unallocated" in w.lower() for w in result.warnings)
    assert_reconciles(result)


def test_wife_and_son_wife_gets_eighth_son_gets_rest():
    result = calc(wives=1, sons=1)
    assert share(result, "wives").fraction == Fraction(1, 8)
    assert share(result, "sons").fraction == Fraction(7, 8)
    assert_reconciles(result)


def test_three_wives_with_son_split_equally():
    result = calc(wives=3, sons=1)
    wives = share(result, "wives")
    assert wives.fraction == Fraction(1, 8)
    assert wives.count == 3
    assert wives.fraction / wives.count == Fraction(1, 24)
    assert_reconciles(result)


def test_four_wives_only_no_blood_relative_unallocated():
    result = calc(wives=4)
    assert share(result, "wives").fraction == Fraction(1, 4)
    assert result.unallocated == Fraction(3, 4)
    assert_reconciles(result)


# ── Parents ──────────────────────────────────────────────────────────────────


def test_father_mother_no_descendants_no_siblings():
    result = calc(father=True, mother=True)
    assert share(result, "mother").fraction == Fraction(1, 3)
    assert share(result, "father").fraction == Fraction(2, 3)
    assert_reconciles(result)


def test_umariyyatain_husband_father_mother():
    """The classic 'al-'Umariyyatain' example: husband + both parents, no
    descendants, no siblings. Textbook answer: husband 1/2, mother 1/6
    (a third of the 1/2 remainder), father 1/3 (the rest)."""
    result = calc(decedent_gender="female", husband=True, father=True, mother=True)
    assert share(result, "husband").fraction == Fraction(1, 2)
    assert share(result, "mother").fraction == Fraction(1, 6)
    assert share(result, "father").fraction == Fraction(1, 3)
    assert_reconciles(result)


def test_umariyyatain_wife_father_mother():
    """Same doctrine applied with a wife instead of a husband: wife 1/4,
    mother a third of the 3/4 remainder = 1/4, father the rest = 1/2."""
    result = calc(wives=1, father=True, mother=True)
    assert share(result, "wives").fraction == Fraction(1, 4)
    assert share(result, "mother").fraction == Fraction(1, 4)
    assert share(result, "father").fraction == Fraction(1, 2)
    assert_reconciles(result)


def test_mother_reduced_to_sixth_by_two_siblings_even_though_blocked_by_father():
    """The famous 'two-or-more siblings' rule counts siblings even when they
    themselves are blocked from inheriting by the father."""
    result = calc(father=True, mother=True, full_brothers=2)
    assert share(result, "mother").fraction == Fraction(1, 6)
    assert blocked_reason(result, "full_brothers") is not None
    assert_reconciles(result)


# ── Sons / daughters ─────────────────────────────────────────────────────────


def test_two_sons_one_daughter_no_parents():
    result = calc(sons=2, daughters=1)
    sons = share(result, "sons")
    assert sons.fraction == Fraction(4, 5)
    assert sons.fraction / sons.count == Fraction(2, 5)
    assert share(result, "daughters").fraction == Fraction(1, 5)
    assert_reconciles(result)


def test_father_mother_two_sons_one_daughter():
    """Independently recomputed by hand: mother 1/6, father 1/6-fixed-only
    (a son is present, so father takes no residue), remaining 2/3 split
    2:2:1 among the two sons and one daughter -> son 4/15 each, daughter 2/15."""
    result = calc(father=True, mother=True, sons=2, daughters=1)
    assert share(result, "mother").fraction == Fraction(1, 6)
    father = share(result, "father")
    assert father.fraction == Fraction(1, 6)
    assert father.share_mode == "fixed"
    sons = share(result, "sons")
    assert sons.fraction / sons.count == Fraction(4, 15)
    assert share(result, "daughters").fraction == Fraction(2, 15)
    assert_reconciles(result)


def test_one_daughter_no_son_with_father_takes_remainder():
    result = calc(father=True, daughters=1)
    assert share(result, "daughters").fraction == Fraction(1, 2)
    father = share(result, "father")
    assert father.fraction == Fraction(1, 2)
    assert father.share_mode == "fixed_and_residuary"
    assert_reconciles(result)


def test_two_daughters_ceiling_two_thirds():
    result = calc(daughters=2, father=True)
    assert share(result, "daughters").fraction == Fraction(2, 3)
    assert share(result, "father").fraction == Fraction(1, 3)
    assert_reconciles(result)


def test_daughter_alone_gets_radd_to_full_estate():
    result = calc(daughters=1)
    assert share(result, "daughters").fraction == Fraction(1)
    assert result.adjustment.kind == "radd"
    assert_reconciles(result)


# ── Siblings ─────────────────────────────────────────────────────────────────


def test_full_brother_and_sister_alone_residuary_two_to_one():
    result = calc(full_brothers=1, full_sisters=1)
    assert share(result, "full_brothers").fraction == Fraction(2, 3)
    assert share(result, "full_sisters").fraction == Fraction(1, 3)
    assert_reconciles(result)


def test_two_brothers_one_sister_matches_two_to_one_weighting():
    result = calc(full_brothers=2, full_sisters=1)
    brothers = share(result, "full_brothers")
    sisters = share(result, "full_sisters")
    assert brothers.fraction / brothers.count == Fraction(2, 5)
    assert sisters.fraction == Fraction(1, 5)
    assert_reconciles(result)


def test_full_brother_blocks_paternal_brother_and_sister():
    result = calc(full_brothers=1, paternal_brothers=1, paternal_sisters=1)
    assert share(result, "full_brothers").fraction == Fraction(1)
    assert blocked_reason(result, "paternal_brothers") == "Blocked by a full brother."
    assert blocked_reason(result, "paternal_sisters") == "Blocked by a full brother."
    assert_reconciles(result)


def test_uterine_siblings_split_equally_regardless_of_sex():
    # A full brother absorbs the residue as asabah so the result isn't muddied
    # by radd — full/consanguine siblings don't block uterine ones, so this
    # composition isolates the fixed 1/3-collectively, 1/6-each uterine rule.
    result = calc(maternal_brothers=1, maternal_sisters=1, full_brothers=1)
    assert share(result, "maternal_brothers").fraction == Fraction(1, 6)
    assert share(result, "maternal_sisters").fraction == Fraction(1, 6)
    assert result.adjustment.kind == "none"
    assert_reconciles(result)


def test_uterine_siblings_never_residuary_single_heir_gets_radd():
    result = calc(maternal_brothers=1)
    assert share(result, "maternal_brothers").fraction == Fraction(1)
    assert result.adjustment.kind == "radd"
    assert_reconciles(result)


def test_uterine_siblings_blocked_by_daughter():
    result = calc(daughters=1, maternal_brothers=2, father=True)
    assert blocked_reason(result, "maternal_brothers") is not None
    assert_reconciles(result)


# ── Grandparents ─────────────────────────────────────────────────────────────


def test_paternal_grandfather_alone_takes_everything_as_asabah():
    result = calc(paternal_grandfather=True)
    assert share(result, "paternal_grandfather").fraction == Fraction(1)
    assert_reconciles(result)


def test_father_blocks_paternal_grandfather():
    result = calc(father=True, paternal_grandfather=True)
    assert blocked_reason(result, "paternal_grandfather") == "Blocked by the father."
    assert_reconciles(result)


def test_mother_blocks_both_grandmothers():
    result = calc(mother=True, paternal_grandmother=True, maternal_grandmother=True)
    assert blocked_reason(result, "paternal_grandmother") is not None
    assert blocked_reason(result, "maternal_grandmother") is not None
    assert_reconciles(result)


def test_father_blocks_paternal_grandmother_but_not_maternal():
    result = calc(father=True, paternal_grandmother=True, maternal_grandmother=True)
    assert blocked_reason(result, "paternal_grandmother") == "Blocked by the father."
    # Maternal grandmother is not on the father's line, so she is not blocked by him.
    assert share(result, "maternal_grandmother") is not None
    assert_reconciles(result)


def test_two_eligible_grandmothers_split_sixth_equally():
    # A full brother absorbs the residue as asabah (siblings don't block
    # grandmothers) so this isolates the plain 1/6-collectively rule from radd.
    result = calc(paternal_grandmother=True, maternal_grandmother=True, full_brothers=1)
    pgm = share(result, "paternal_grandmother")
    mgm = share(result, "maternal_grandmother")
    assert pgm.fraction == Fraction(1, 12)
    assert mgm.fraction == Fraction(1, 12)
    assert pgm.fraction + mgm.fraction == Fraction(1, 6)
    assert result.adjustment.kind == "none"
    assert_reconciles(result)


# ── Grandchildren through a son ──────────────────────────────────────────────


def test_grandsons_via_son_blocked_by_surviving_son():
    result = calc(sons=1, grandsons_via_son=2, granddaughters_via_son=1)
    assert blocked_reason(result, "grandsons_via_son") == "Blocked by a surviving son."
    assert blocked_reason(result, "daughters_of_sons") == "Blocked by a surviving son."
    assert_reconciles(result)


def test_grandsons_via_son_alone_act_as_sons():
    result = calc(grandsons_via_son=2)
    assert share(result, "grandsons_via_son").fraction == Fraction(1)
    assert_reconciles(result)


def test_daughter_of_son_completes_one_daughters_ceiling():
    """1 daughter (1/2) + 1 son's-daughter, no son/son's-son -> the son's
    daughter collectively completes the female-descendant ceiling to 2/3,
    i.e. she gets 1/6. With nothing else present, radd then applies to
    both (no residuary heir exists)."""
    result = calc(daughters=1, granddaughters_via_son=1)
    d = share(result, "daughters")
    gd = share(result, "daughters_of_sons")
    # Ratio before radd was 1/2 : 1/6 = 3:1; radd preserves that ratio.
    assert d.fraction / gd.fraction == Fraction(3, 1)
    assert_reconciles(result)


def test_two_daughters_exhaust_ceiling_blocking_daughters_of_sons():
    result = calc(daughters=2, granddaughters_via_son=3, father=True)
    assert share(result, "daughters").fraction == Fraction(2, 3)
    assert blocked_reason(result, "daughters_of_sons") is not None
    assert_reconciles(result)


def test_two_daughters_one_grandson_via_son_residue_to_grandson_alone():
    result = calc(daughters=2, grandsons_via_son=1)
    assert share(result, "daughters").fraction == Fraction(2, 3)
    assert share(result, "grandsons_via_son").fraction == Fraction(1, 3)
    assert_reconciles(result)


# ── Awl ──────────────────────────────────────────────────────────────────────


def test_awl_husband_two_full_sisters_classic_example():
    """The textbook Awl example: husband + two full sisters. Fixed shares
    1/2 + 2/3 = 7/6 > 1, so every share is scaled by 6/7: husband 3/7,
    sisters 4/7 collectively (2/7 each)."""
    result = calc(decedent_gender="female", husband=True, full_sisters=2)
    assert result.adjustment.kind == "awl"
    assert share(result, "husband").fraction == Fraction(3, 7)
    sisters = share(result, "full_sisters")
    assert sisters.fraction == Fraction(4, 7)
    assert sisters.fraction / sisters.count == Fraction(2, 7)
    assert_reconciles(result)


def test_awl_husband_mother_two_full_sisters():
    """Husband 1/2 + mother 1/6 (2 siblings present) + 2 full sisters 2/3
    = 4/3 > 1, scaled by 3/4: husband 3/8, mother 1/8, sisters 1/2 (1/4 each)."""
    result = calc(decedent_gender="female", husband=True, mother=True, full_sisters=2)
    assert result.adjustment.kind == "awl"
    assert share(result, "husband").fraction == Fraction(3, 8)
    assert share(result, "mother").fraction == Fraction(1, 8)
    sisters = share(result, "full_sisters")
    assert sisters.fraction == Fraction(1, 2)
    assert sisters.fraction / sisters.count == Fraction(1, 4)
    assert_reconciles(result)


def test_awl_scaled_shares_still_sum_to_exactly_one():
    result = calc(decedent_gender="female", husband=True, full_sisters=2)
    assert total_eligible_fraction(result) == Fraction(1)


# ── Radd ─────────────────────────────────────────────────────────────────────


def test_radd_two_grandmothers_alone_split_estate_equally():
    result = calc(paternal_grandmother=True, maternal_grandmother=True)
    assert result.adjustment.kind == "radd"
    assert share(result, "paternal_grandmother").fraction == Fraction(1, 2)
    assert share(result, "maternal_grandmother").fraction == Fraction(1, 2)
    assert_reconciles(result)


def test_radd_mother_and_two_uterine_siblings_split_evenly():
    """Mother 1/6 (reduced by 2 siblings) + uterine siblings 1/3 collectively
    = 1/2 fixed, no residuary heir -> radd doubles everyone: mother 1/3,
    each uterine sibling 1/3."""
    result = calc(mother=True, maternal_brothers=1, maternal_sisters=1)
    assert result.adjustment.kind == "radd"
    assert share(result, "mother").fraction == Fraction(1, 3)
    assert share(result, "maternal_brothers").fraction == Fraction(1, 3)
    assert share(result, "maternal_sisters").fraction == Fraction(1, 3)
    assert_reconciles(result)


def test_radd_never_gives_extra_to_spouse():
    """Wife + mother, no descendants, no siblings: wife's fixed 1/4 must
    stay exactly 1/4 even though there IS a residuary-less surplus — only
    the mother (blood relative) benefits from radd."""
    result = calc(wives=1, mother=True)
    assert share(result, "wives").fraction == Fraction(1, 4)
    assert result.adjustment.kind == "radd"
    assert share(result, "mother").fraction == Fraction(3, 4)
    assert_reconciles(result)


# ── al-Akdariyyah (flagged, not silently resolved) ──────────────────────────


def test_akdariyyah_composition_is_flagged_unresolved():
    result = calc(paternal_grandfather=True, full_sisters=1, mother=True)
    assert any("Akdariyyah" in w for w in result.warnings)


# ── Invalid input (schema-level validation) ─────────────────────────────────


def _valid_payload(**overrides):
    payload = {
        "decedent_gender": "male",
        "gross_estate": "100000.00",
        "heirs": {"sons": 1},
    }
    payload.update(overrides)
    return payload


def test_rejects_zero_estate():
    with pytest.raises(ValidationError):
        FaraidCalculateRequest.model_validate(_valid_payload(gross_estate="0"))


def test_rejects_negative_estate():
    with pytest.raises(ValidationError):
        FaraidCalculateRequest.model_validate(_valid_payload(gross_estate="-5"))


def test_rejects_non_numeric_estate():
    with pytest.raises(ValidationError):
        FaraidCalculateRequest.model_validate(_valid_payload(gross_estate="not-a-number"))


def test_rejects_deductions_exceeding_estate():
    with pytest.raises(ValidationError):
        FaraidCalculateRequest.model_validate(_valid_payload(gross_estate="1000", debts="2000"))


def test_rejects_male_decedent_with_husband_heir():
    with pytest.raises(ValidationError):
        FaraidCalculateRequest.model_validate(_valid_payload(heirs={"husband": True}))


def test_rejects_female_decedent_with_wives_heir():
    with pytest.raises(ValidationError):
        FaraidCalculateRequest.model_validate(
            _valid_payload(decedent_gender="female", heirs={"wives": 1})
        )


def test_rejects_more_than_four_wives():
    with pytest.raises(ValidationError):
        FaraidCalculateRequest.model_validate(_valid_payload(heirs={"wives": 5}))


def test_rejects_unsupported_madhhab():
    with pytest.raises(ValidationError):
        FaraidCalculateRequest.model_validate(_valid_payload(madhhab="shafii"))


def test_rejects_no_heirs_at_all():
    with pytest.raises(ValidationError):
        FaraidCalculateRequest.model_validate(_valid_payload(heirs={}))


def test_rejects_unknown_heir_field():
    with pytest.raises(ValidationError):
        FaraidCalculateRequest.model_validate(_valid_payload(heirs={"sons": 1, "pet_dog": True}))


# ── Fraction accuracy ────────────────────────────────────────────────────────


def test_all_shares_are_exact_fractions_not_floats():
    result = calc(father=True, mother=True, sons=2, daughters=1)
    for s in result.eligible:
        assert isinstance(s.fraction, Fraction)


def test_no_float_arithmetic_leaks_into_a_recurring_fraction_case():
    """1/3 has no exact float/decimal representation — the engine must carry
    it as a Fraction all the way through, not round it prematurely."""
    result = calc(father=True, mother=True)
    assert share(result, "mother").fraction == Fraction(1, 3)
    assert share(result, "mother").fraction.denominator == 3


# ── Money reconciliation ─────────────────────────────────────────────────────


def test_allocate_splits_a_third_each_with_no_lost_pennies():
    result = allocate(
        Decimal("100.00"), [("a", Fraction(1, 3)), ("b", Fraction(1, 3)), ("c", Fraction(1, 3))]
    )
    assert sum(result.values()) == Decimal("100.00")
    assert sorted(result.values(), reverse=True)[0] == Decimal("33.34")
    assert list(result.values()).count(Decimal("33.33")) == 2


def test_allocate_reconciles_exactly_for_awkward_cents():
    shares = [
        ("son", Fraction(4, 15)),
        ("son2", Fraction(4, 15)),
        ("daughter", Fraction(2, 15)),
        ("mother", Fraction(1, 6)),
        ("father", Fraction(1, 6)),
    ]
    total = Decimal("100000.37")
    result = allocate(total, shares)
    assert sum(result.values()) == total


def test_full_engine_money_reconciles_to_the_penny():
    request = FaraidCalculateRequest.model_validate(
        {
            "decedent_gender": "male",
            "gross_estate": "250000.00",
            "funeral_expenses": "1500.00",
            "debts": "3000.00",
            "heirs": {"father": True, "mother": True, "sons": 2, "daughters": 1},
        }
    )
    response = calculate_full(request)
    total_amount = sum(Decimal(h.amount) for h in response.eligible_heirs)
    assert total_amount == Decimal(response.net_estate)
    assert response.reconciliation.difference == "0.00"


def test_bequest_capped_at_one_third_with_warning():
    request = FaraidCalculateRequest.model_validate(
        {
            "decedent_gender": "male",
            "gross_estate": "90000.00",
            "bequest": "50000.00",
            "heirs": {"sons": 1},
        }
    )
    response = calculate_full(request)
    # after_debts = 90000; cap = 30000
    assert response.bequest == "30000.00"
    assert response.net_estate == "60000.00"
    assert any("exceeds the classical cap" in w for w in response.warnings)


def test_unsupported_madhhab_raises_at_engine_level_too():
    with pytest.raises(ValidationError):
        FaraidCalculateRequest.model_validate(
            {
                "decedent_gender": "male",
                "gross_estate": "1000",
                "madhhab": "maliki",
                "heirs": {"sons": 1},
            }
        )
