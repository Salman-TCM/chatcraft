# Faraid (Islamic Inheritance) Calculator

A deterministic calculation engine for Islamic inheritance shares, exposed as
a REST endpoint and as an agent tool. All arithmetic runs on Python
`Fraction` (shares) and `Decimal` (money) — no LLM ever computes, rounds, or
estimates a share.

> **Not a fatwa. Not legal advice.** This is a calculation aid for the
> Hanafi rule set as commonly taught. Every response includes a disclaimer
> to this effect. Verify results — especially anything flagged as a warning
> — with a qualified Islamic scholar and, for actual estate administration,
> a legal professional in the relevant jurisdiction.

## Architecture

```
backend/app/schemas/faraid.py          Pydantic request/response models
backend/app/services/faraid/
  base.py            Madhhab-agnostic data model (HeirInput, HeirShare,
                      BlockedHeir, Adjustment, CalculationResult) + the
                      RuleSet interface every madhhab implements
  evidence.py         Reference registry (Qur'an citations + named classical
                      positions) — topic descriptions only, never verbatim
                      quotations
  hanafi.py           HanafiRuleSet — hajb, fixed shares, asabah, takmil,
                      awl, radd
  money.py            Decimal-safe "largest remainder" apportionment so
                      individual amounts always sum exactly to the total
  registry.py         madhhab key -> RuleSet lookup
  engine.py           Orchestration: estate deductions -> ruleset -> money
                       allocation -> response. Single entry point used by
                       both the API and the agent tool.
backend/app/api/faraid.py              POST /api/v1/faraid/calculate
backend/app/api/agents.py              calculate_faraid tool (schema,
                                         dispatch, system-prompt behavior)
backend/tests/test_faraid_engine.py    Pure-logic unit tests (no DB)
backend/tests/test_faraid_api.py       API integration tests
backend/tests/test_faraid_tool.py      Agent-tool wiring tests
```

Nothing is persisted — a calculation is stateless in, structured result out.

## API usage

```
POST /api/v1/faraid/calculate
Authorization: Bearer <token>
Content-Type: application/json

{
  "decedent_gender": "male",
  "gross_estate": "250000.00",
  "funeral_expenses": "1500.00",
  "debts": "3000.00",
  "bequest": "0",
  "currency": "GBP",
  "madhhab": "hanafi",
  "heirs": {
    "father": true,
    "mother": true,
    "sons": 2,
    "daughters": 1
  }
}
```

Every money field is a **decimal string**, never a JSON number — this keeps
the wire format unambiguous and avoids float round-tripping. `heirs` fields
default to absent/zero; set only what applies. Response (`{"success": true,
"data": {...}}`):

```json
{
  "net_estate": "245500.00",
  "eligible_heirs": [
    {
      "heir_type": "mother",
      "count": 1,
      "fraction": "1/6",
      "percentage": "16.6667%",
      "amount": "40916.67",
      "share_mode": "fixed",
      "evidence": [{"id": "QURAN_4_11_PARENTS", "reference": "Qur'an 4:11", "topic": "...", "is_quranic": true}]
    }
  ],
  "blocked_heirs": [],
  "adjustment": {"kind": "none", "original_fixed_total": "1/3", "adjusted_fixed_total": "1/3", "note": ""},
  "calculation_steps": ["Mother: 1/6 fixed (children/grandchildren present).", "..."],
  "warnings": [],
  "reconciliation": {"sum_of_fractions": "1", "sum_of_amounts": "245500.00", "unallocated_amount": "0.00", "net_estate": "245500.00", "difference": "0.00"},
  "disclaimer": "This is a deterministic calculation ... not a fatwa and not legal advice ..."
}
```

`fraction` is the **total** for that whole heir category (e.g. both sons
combined) — divide by `count` for the per-head amount. Any heir category
present in the input but receiving zero appears in `blocked_heirs` with a
plain-language `reason`, whether that's classical hajb (blocked by a nearer
heir) or a completion ceiling already used up by a closer category.

Validation errors (bad estate figures, gender/heir inconsistency,
unsupported madhhab, no heirs at all, unknown fields) return `400`/`422`
with `{"success": false, "error": "...", "code": "..."}`.

## Agent tool usage

Enable the **Faraid Calculator** toggle in an agent's Tools tab (backend key:
`faraid`, in `AgentToolsConfig`). This exposes a `calculate_faraid` tool to
the agent's tool-use loop and adds a system-prompt block requiring the model
to:

1. Ask the user for every field it needs — decedent's gender, estate figures,
   and an explicit answer for each heir category that could plausibly apply.
   Silence about an heir is never treated as "confirmed absent."
2. Never compute, estimate, or restate a share itself — always call the tool.
3. Relay validation errors back to the user for correction rather than
   guessing a fix.
4. Explain the result in plain language, including any warnings and the
   fatwa/legal-advice disclaimer.

The tool is safe to expose on public agent shares (`_PUBLIC_SHARE_TOOL_ALLOWLIST`
in `app/api/agents.py`) — it's a pure calculation with no database or network
access and no cost billed to the agent owner.

## Supported heirs

Husband; wife/wives (up to 4); sons; daughters; father; mother; paternal
grandfather; paternal grandmother; maternal grandmother; full brothers/
sisters; paternal (consanguine) brothers/sisters; maternal (uterine)
brothers/sisters; sons of sons (`grandsons_via_son`); daughters of sons
(`granddaughters_via_son`).

Not modelled: distant kindred (*dhawul arham*), a second generation of
grandchildren (son's son's children), or great-grandparents. A request
using only the fields above never needs them.

## Supported rules (Hanafi)

- **Hajb (blocking):** father blocks the paternal grandfather; mother blocks
  both grandmothers, father blocks the paternal one; a son or son's son
  blocks all grandchildren through sons and all siblings; a full brother
  blocks paternal (consanguine) siblings entirely.
- **Fixed shares (fard):** spouse, parents, grandmother(s), daughters (with
  no son), sons'-daughters (with no son and no son's-son), full/paternal
  sisters (with no brother and no daughter/son's-daughter present), and
  uterine siblings (always fixed, never residuary).
- **Takmil (completion):** a closer category's two-thirds ceiling (daughters,
  or full sisters) is shared with the corresponding farther category (son's
  daughters, or paternal sisters) — the farther category gets only what the
  ceiling has not already used.
- **Asabah (residue):** the single nearest non-empty class of agnatic
  residuary heirs takes the entire remainder, in priority order: sons (with
  daughters riding along 2:1) → sons of sons (with son's-daughters, same
  ratio) → father → paternal grandfather → full brothers (with full sisters)
  → full sisters alone alongside daughters/son's-daughters → paternal
  brothers (with paternal sisters) → paternal sisters alone alongside
  daughters/son's-daughters.
- **al-'Umariyyatain / al-Gharrawayn:** when the only heirs are both parents
  and exactly one spouse, the mother takes a third of the *remainder* after
  the spouse's share, not a third of the whole estate.
- **Awl:** when fixed shares sum to more than the whole estate, every fixed
  share is scaled down proportionally so the total is exactly 1.
- **Radd:** when fixed shares sum to less than the whole estate and no
  residuary heir exists, the surplus is returned to the present fixed-share
  blood relatives in proportion to their shares. Spouses never receive radd
  while a blood relative is present.
- **Estate deductions:** funeral expenses and debts are subtracted first; a
  bequest (*wasiyyah*) is then capped at a third of what remains (exceeding
  the cap requires unanimous heir consent, which this calculator has no way
  to verify — it caps the amount and warns instead).

Every rule above cites its reference in `evidence.py` — `Qur'an 4:11`, `4:12`,
and `4:176` for the directly Qur'anic ones, and a named classical Hanafi
position for the rest (grandfather-as-father, the two special cases below,
hajb, asabah, takmil). None of it is a verbatim quotation.

## Known limitations — flagged, not guessed

Two genuinely disputed or vanishingly rare classical corner cases are
**detected but not silently resolved**. The calculator still returns a
result (using the ordinary rules above) but adds a warning:

- **al-Akdariyyah** — paternal grandfather + exactly one full sister, no
  other descendants or siblings. Some Hanafi authorities apply a special
  re-division of the grandfather's and sister's shares here; this calculator
  applies the ordinary rule instead (which blocks the sister) and flags that
  the exception may apply.
- **Sole spouse, no blood relative at all** — if literally the only heir is
  a spouse, classical Hanafi doctrine sends the unclaimed surplus to the
  state treasury (*bait al-mal*) rather than the spouse. That is a
  jurisdiction question this calculator cannot decide, so the surplus is
  left unallocated with a warning rather than assigned either way.

If a response contains any `warnings`, treat the figures as provisional and
get scholarly/legal confirmation before acting on them.

## Adding another madhhab

1. Create `backend/app/services/faraid/<name>.py` implementing `RuleSet`
   (see `base.py`) — one `calculate(heirs: HeirInput) -> CalculationResult`
   method containing that school's hajb/fixed/asabah/awl/radd logic.
2. Add evidence entries for anything citing a different reference or a
   position specific to that school, in `evidence.py`.
3. Register it in `registry.py`:
   ```python
   _REGISTRY: dict[str, RuleSet] = {
       "hanafi": HanafiRuleSet(),
       "<name>": YourRuleSet(),
   }
   ```
4. Nothing else changes — `engine.py`, the API route, and the agent tool all
   dispatch through `registry.get_ruleset(request.madhhab)`, so the new
   madhhab is immediately available in both places. Add a dedicated test
   file mirroring `test_faraid_engine.py`, with independently-derived
   expected values for that school's rules (never copy expected values from
   the new implementation's own output).
