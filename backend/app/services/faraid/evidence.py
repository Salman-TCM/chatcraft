"""
Evidence registry for Faraid rules.

Each entry cites a *reference* (a Qur'anic ayah, or a named classical
jurisprudential position) and a short, original description of what that
reference covers — never a verbatim quotation or translation of scripture,
and never an invented ruling. Where a rule is Hanafi-specific ijtihad rather
than a direct Qur'anic text, that is stated explicitly.

This is informational metadata for transparency, not a substitute for
consulting a qualified scholar. See docs/FARAID.md for the fatwa disclaimer.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Evidence:
    id: str
    reference: str
    topic: str
    is_quranic: bool


EVIDENCE: dict[str, Evidence] = {
    "QURAN_4_11_CHILDREN": Evidence(
        id="QURAN_4_11_CHILDREN",
        reference="Qur'an 4:11",
        topic="Fixed shares for sons and daughters, and the 2:1 male:female residue ratio among them.",
        is_quranic=True,
    ),
    "QURAN_4_11_PARENTS": Evidence(
        id="QURAN_4_11_PARENTS",
        reference="Qur'an 4:11",
        topic="Fixed shares for father and mother, including the mother's reduction from a third to a "
        "sixth when the deceased leaves children or two or more siblings.",
        is_quranic=True,
    ),
    "QURAN_4_12_SPOUSE": Evidence(
        id="QURAN_4_12_SPOUSE",
        reference="Qur'an 4:12",
        topic="Fixed shares for a surviving husband or wife/wives, varying with whether the deceased "
        "left descendants.",
        is_quranic=True,
    ),
    "QURAN_4_12_UTERINE_SIBLINGS": Evidence(
        id="QURAN_4_12_UTERINE_SIBLINGS",
        reference="Qur'an 4:12",
        topic="Fixed shares for uterine (maternal) siblings in the absence of descendants and parents/"
        "grandparents — always a fixed share, split equally regardless of sex, never residuary.",
        is_quranic=True,
    ),
    "QURAN_4_176_SIBLINGS": Evidence(
        id="QURAN_4_176_SIBLINGS",
        reference="Qur'an 4:176",
        topic="Shares for full and paternal (consanguine) siblings when the deceased leaves no "
        "descendants — the basis for their fixed shares and 2:1 male:female residuary ratio.",
        is_quranic=True,
    ),
    "HANAFI_GRANDFATHER_AS_FATHER": Evidence(
        id="HANAFI_GRANDFATHER_AS_FATHER",
        reference="Hanafi classical jurisprudence (ijtihad, not a direct Qur'anic text)",
        topic="In the absence of the father, the paternal grandfather takes the father's fixed share "
        "and residuary position, and blocks siblings exactly as the father would. This is a "
        "Hanafi-specific position — other schools treat a grandfather co-inheriting with "
        "siblings differently.",
        is_quranic=False,
    ),
    "HANAFI_UMARIYYATAIN": Evidence(
        id="HANAFI_UMARIYYATAIN",
        reference="Classical ruling attributed to the second Caliph 'Umar, accepted by the Hanafi school "
        "(known as al-'Umariyyatain / al-Gharrawayn)",
        topic="When the only heirs are both parents and exactly one spouse (no descendants, no "
        "siblings), the mother takes a third of the remainder after the spouse's fixed share, "
        "not a third of the whole estate.",
        is_quranic=False,
    ),
    "HANAFI_HAJB": Evidence(
        id="HANAFI_HAJB",
        reference="Classical Hanafi fiqh (hajb / blocking rules)",
        topic="A nearer heir fully or partially excludes a more distant heir in the same or a "
        "subordinate category — e.g. a father excludes a paternal grandfather; a son excludes "
        "grandchildren through sons.",
        is_quranic=False,
    ),
    "HANAFI_ASABAH": Evidence(
        id="HANAFI_ASABAH",
        reference="Classical Hanafi fiqh (asabah / residuary heirs)",
        topic="After fixed (Qur'anic) shares are paid, the remaining estate passes to the nearest "
        "class of agnatic residuary heirs, commonly summarised from the hadith on giving fixed "
        "shares to their holders and the remainder to the nearest male relative "
        "(Sahih al-Bukhari, cited generally — not reproduced verbatim here).",
        is_quranic=False,
    ),
    "HANAFI_TAKMIL": Evidence(
        id="HANAFI_TAKMIL",
        reference="Classical Hanafi fiqh (takmil / completion shares)",
        topic="A closer category's two-thirds ceiling (e.g. daughters, or full sisters) is shared "
        "with the corresponding farther category (granddaughters through sons, or paternal "
        "sisters) — the farther category receives only what the ceiling has not already used.",
        is_quranic=False,
    ),
    "HANAFI_AWL": Evidence(
        id="HANAFI_AWL",
        reference="Classical Hanafi fiqh (awl / proportional reduction), traced to a ruling of the "
        "second Caliph 'Umar",
        topic="When fixed shares add up to more than the whole estate, every fixed share is reduced "
        "proportionally so the total equals exactly one.",
        is_quranic=False,
    ),
    "HANAFI_GRANDMOTHER_SHARE": Evidence(
        id="HANAFI_GRANDMOTHER_SHARE",
        reference="Hadith-based ruling (not a direct Qur'anic text), accepted across the major Sunni "
        "schools including Hanafi",
        topic="Grandmother(s) — paternal or maternal, whichever are not otherwise blocked — take a "
        "sixth of the estate collectively, split equally if more than one is eligible.",
        is_quranic=False,
    ),
    "HANAFI_GRANDCHILDREN_VIA_SON": Evidence(
        id="HANAFI_GRANDCHILDREN_VIA_SON",
        reference="Classical Hanafi fiqh (qiyas / analogy)",
        topic="In the absence of a son, a son's son and son's daughter are treated by analogy to a "
        "son and daughter respectively for both fixed-share and residuary purposes.",
        is_quranic=False,
    ),
    "HANAFI_RADD": Evidence(
        id="HANAFI_RADD",
        reference="Classical Hanafi fiqh (radd / return of the surplus)",
        topic="When fixed shares add up to less than the whole estate and no residuary heir exists, "
        "the surplus is returned to the present fixed-share blood-relative heirs in proportion "
        "to their shares (spouses do not participate in radd while a blood-relative heir "
        "exists).",
        is_quranic=False,
    ),
}


def evidence_ids(*keys: str) -> tuple[str, ...]:
    """Validate and return evidence keys as a tuple, failing loudly on a typo
    rather than silently citing nothing."""
    for k in keys:
        if k not in EVIDENCE:
            raise KeyError(f"Unknown evidence id: {k!r}")
    return tuple(keys)
