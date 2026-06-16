# @ont/evidence — purpose / scope / tests

> The written component statement required by *nothing-is-precious* (clean-build
> (#46)). Full design: [`docs/core/B3_EVIDENCE_HARDENING.md`](../../docs/core/B3_EVIDENCE_HARDENING.md).

**Purpose.** The L3 evidence layer (B3). Construct and cryptographically verify
the evidence the audited B2 kernel (`@ont/consensus`) consumes — Bitcoin
inclusion proofs, accumulator membership proofs, served-bytes witnesses,
auction-transcript completeness witnesses, recovery descriptor-evidence timing
witnesses, and the canonical-root (delta-merge) derivation. It turns "the
publisher says so" into "anyone can check it."

**The defining contract — NON-DECIDING.** `@ont/evidence` decides nothing the
kernel decides. Evidence is a witness consumed as data, never a callback. The
governing invariant: a swapped or hostile `@ont/evidence` can never make the
kernel **accept** something it should reject — forged evidence yields the same
acceptance/ownership effect as no-witness (fail-closed), differing only in
diagnostics. Missing valid evidence may fail closed — by design.

**Scope (in).** Witness construction + verification conforming to ratified
consensus rules (no new rules); concrete witness byte layouts; the convergence
delta-merge.

**Scope (out).** No ownership decisions (those stay in `@ont/consensus`); no
adapters/I/O (B4); no surfaces (B5); not the `g(name)` fee-schedule numbers
(launch-freeze parameters).

**Tests.** The gate is adversarial: a convergence battery + a hostile-evidence
battery run against the real `@ont/consensus` verdicts. First slice: D-BI
(Bitcoin inclusion) and D-AM (accumulator membership).
