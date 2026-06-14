# B2 Step-4 Triage Protocol

> **Normativity: `analysis`** - review/checklist artifact for
> [`B2_STEP4_WORKLIST.md`](./B2_STEP4_WORKLIST.md). It records the agreed
> pre-authoring gate from the step-4 protocol: every attack flag is classified
> before vector authoring, and no vector may invent consensus law that is not
> legally derivable from current docs.

## Purpose

Step 4 turns the 266 attack flags from
[`B2_STEP4_WORKLIST.md`](./B2_STEP4_WORKLIST.md) into B2 conformance evidence.
The first pass is triage, not authoring. Each row must land in exactly one
class:

| Class | Meaning | Next action |
| --- | --- | --- |
| `vector-now` | The expected accept/reject verdict is legally derivable from current normative, ratified, or otherwise citable B2 authority without adding a new rule. | Author a vector under [`B2_VECTOR_SCHEMA.json`](./B2_VECTOR_SCHEMA.json). |
| `provisional-vector` | The verdict is derivable only under a named provisional decision, currently `da-windows (#49)` or `recovery-auth (#50)`. | Author only with `decisionDeps` and `flipMarker`; flip or retire if DK reverses the decision. |
| `spec-blocked` | The attack is real or plausible, but the current docs do not legally choose a consensus verdict. | Add to the spec-PR registry; do not author a vector yet. |
| `retired-with-reason` | The flag is duplicate, superseded, adapter-only, presentation-only, old-model leakage, or a bounded residual that the kernel must not reject. | Mark retired with a concrete reason and any surviving citation. |

## Output Contract

The classified worklist v2 must preserve the original row text or a stable row
reference and add, for every row:

- `triageClass`: one of the four classes above.
- `source`: path plus section, decision entry, or rule id that licenses the
  class.
- `reason`: one or two sentences explaining why the class follows from the
  source.
- `decisionDeps`: named decision dependencies, if any.
- `specPr`: named spec change when `triageClass=spec-blocked`.
- `vectorId`: proposed vector id only for `vector-now` or
  `provisional-vector`.

## Review Gate

Before any B2 vectors are locked, the reviewer checks:

1. **No invented law.** A negative vector may reject only when the cited docs
   already require rejection. Real attacks with missing law are
   `spec-blocked`, not vectors.
2. **No legacy authority leak.** Legacy code may provide bytes, fixtures, or
   cross-checks, but it cannot license the expected verdict.
3. **Provisional decisions are traceable.** Any row depending on #49 or #50 is
   `provisional-vector`, names the dependency, and has a flip marker in the
   eventual vector.
4. **Candidate-stays rules stay honest.** If the rule is still
   `candidate-stays`, the triage must say what current text is citable and
   what spec work remains before promotion.
5. **Retirements are explicit.** A retired row needs a reason specific enough
   that a later reviewer can tell whether a security concern was intentionally
   accepted, routed to adapters, or made obsolete.
6. **Schema guardrails hold.** Every authored vector validates against
   [`B2_VECTOR_SCHEMA.json`](./B2_VECTOR_SCHEMA.json), including
   `attackFlagRef`, `authorityTier`, `expected.verdict`, and rule/area
   consistency.

## Spec-PR Registry Minimum

Every `spec-blocked` row should map to a named registry item rather than a
free-form todo. Registry items should state:

- affected rules/areas;
- missing consensus decision;
- candidate authority text that is insufficient today;
- attack flags waiting on it;
- whether the item blocks B2 implementation or only promotion.

This keeps step 4 from becoming a dumping ground: vectors cover law we have,
spec PRs name law we still need, and retirements document risks we deliberately
do not encode as kernel rejects.
