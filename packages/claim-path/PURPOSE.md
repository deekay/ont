# @ont/claim-path — purpose / scope / tests

*(Required component statement, per the ratified nothing-is-precious amendment: every new component
declares its purpose, scope, and tests.)*

## Purpose

The **B3 integration orchestrator** — `enforceBatchedClaim` — that wires the audited B3 §2 evidence
layer into a live end-to-end batched-claim enforcement. It is the one place where Bitcoin inclusion
(SPV), canonical-root derivation, membership, availability, completeness, and the kernel verdict have
to **compose**. It threads the already-ratified `@ont/consensus` predicates and `@ont/evidence`
builders, fails closed at the first failed stage in a fixed precedence, and returns an **evidence
trace + verdict** — never a bare ownership mutation. See `docs/core/B3_INTEGRATION_PLAN.md`.

## Scope

- **Pure + deterministic + fixture-backed (B3).** No I/O, no network, no clock, no randomness.
- **Typed data-source seams** — `BitcoinHeaderSource` (the SPV canonical-header seam, reused from
  `@ont/consensus`) and `BatchDataSource` (base + served leaves by anchored identity). Fixture-backed
  here; **B4 substitutes the real publisher/indexer/resolver/canonical-header adapters** behind the
  same seams.
- **No new consensus law.** Every decision is an already-audited `@ont/consensus` / `@ont/evidence`
  call (`verifyProofBundleAgainstBitcoin`, `deriveCanonicalRoot`, `verifyAvailabilityHeight`,
  `evaluateBatchCompleteness`, the kernel verdict). The orchestrator only *sequences* them and fails
  closed; it never re-decides.
- **Reason precedence (CL):** inclusion/header fails before availability/completeness; missing served
  bytes fails before any canonical-root accept; completeness fails before any name-state delta. The
  trace preserves each underlying audited reason; the top-level reason wraps, never erases, it.
- **Output is a verdict + delta, never an applied mutation** — B4 applies the returned `NameStateDelta`.

### Out of scope (→ B4)

Real network adapters (publisher/indexer/resolver/canonical-header source), W15 transport, and applying
the name-state delta to live state.

## Tests

`hrns.*` (enforce-batched-claim.test.ts): fail-closed at each stage in precedence — absent/corrupt
Bitcoin inclusion, stale/noncanonical header, missing served bytes, N±1/duplicate leaf, no
non-content (oracle/timestamp/receipt) channel; the happy path produces a clean accept trace + delta;
the trace preserves the underlying audited reason. The conformance battery is the contract: a hostile
data source cannot move a verdict.
