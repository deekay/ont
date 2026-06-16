# B3 integration — wiring the audited evidence layer into a live batched-claim enforcement

> **Status: DRAFT — phase brief, design-first. Writer: ClaudeleLunatique. Reviewer:
> ChatLunatique (pending). DK confirms scope + the B3/B4 boundary.** Opens after the B3 §2
> audited evidence table merged to `main` @ `7c04f7f` (DK ratified merge+push, event f52d1918).
> Branch: `clean-build-b3-integration`.

## 1. The gap

The B3 §2 evidence layer is **pure and tested but never called from production**: the kernel
predicates (`@ont/consensus`: acceptRecoverOwner, gateFeeValidation, evaluateBatchCompleteness,
deriveCanonicalRoot, resolveReopen, da-verdict, transcriptCompleteness, …) and the `@ont/evidence`
builders (buildBitcoinInclusion, buildMembershipProof, verifyAvailabilityHeight,
buildAccumulatorBatchClaimBundle, buildBondContinuityWitness, verifyRecoveryDescriptorWitness) are
standalone functions with golden/conformance batteries — **nothing orchestrates them over real chain
data into an end-to-end verdict.** The old live path (`@ont/core` indexer, batch-rail) was
decommissioned at B1 and is quarantined-readable. B3 integration = make the DA enforcement actually
RUN end-to-end (the "production" in "DA enforcement production").

## 2. The B3 / B4 boundary (working assumption — DK to confirm)

- **B3 integration (this phase):** the MINIMAL orchestration that makes the audited path enforce a
  batched claim END-TO-END and FAIL CLOSED — over fixture / test chain sources — proving the pieces
  compose and the withhold-then-reveal DA defense works. No new consensus law (wires already-ratified
  predicates). This is the "does the enforcement actually work" demonstration.
- **B4 (deferred):** the real production adapters — publisher, indexer, resolver, canonical-header
  source, W15 transport — that feed the B3 enforcement from the live network.

The seam: B3 integration defines the *enforcement orchestrator* + its typed data-source SEAMS; B4
implements those seams against the real network. (Mirrors how the kernel takes witnesses as typed
inputs and B3 §2 filled the formats.)

## 3. Candidate slices (dependency-ordered)

- **I-HARNESS — end-to-end batched-claim enforcement harness (RECOMMENDED FIRST).** One runnable flow:
  Bitcoin block fixtures → buildBitcoinInclusion + membership + canonical-root (deriveCanonicalRoot) →
  served-bytes / availability (verifyAvailabilityHeight) → completeness (evaluateBatchCompleteness) →
  the kernel verdict → name-state. Proves the §2 pieces compose; pins the **withhold-then-reveal
  fail-closed** end-to-end (the sharpest open item, STATUS §Known-incomplete). Mines
  `research/batch-rail.ts` for the merge/notice-window/collision orchestration; defines the data-source
  seams B4 implements. No new law.
- **I-SPV — verify-against-Bitcoin enforcement (the #82 launch gate).** A canonical-best-chain header
  source seam + enforce `verifyProofBundleAgainstBitcoin` in the path (today clients call the
  deprecated structural alias). STATUS: "launch clients do not enforce … yet." Launch-blocking per
  da-trust-model (#82).
- **I-REC — recovery-evidence resolver.** Build `RecoveryEvidenceSupply` (run
  verifyRecoveryDescriptorWitness over presented descriptors + invoke commitments) feeding
  acceptRecoverOwner (which fails closed today with no evidence supplied).
- **I-FEE — gate-fee fact witness wiring.** Feed gateFeeValidation the complete-tx + committed-leaf
  witness in the path (Σ g ≥ paid enforcement; STATUS: "aggregate gate-fee enforcement designed, not
  implemented").

## 4. Sequencing (recommended)

1. **I-HARNESS** first — it composes everything, proves end-to-end fail-closed, and surfaces the exact
   seams the other slices + B4 need. Tests-first; fixture chain data.
2. **I-SPV** early after — it's the launch gate and foundational to "verify against Bitcoin".
3. **I-REC** + **I-FEE** — independent wiring once the harness seams exist.
4. Full network adapters → **B4**.

## 5. Design-concur — RESOLVED (ChatLunatique, event 480d89aa)

1. **B3/B4 boundary — CONFIRMED.** B3 integration owns pure orchestration + typed data-source seams +
   fixture/fake sources proving enforcement correctness; B4 owns the real
   publisher/indexer/resolver/canonical-header adapters. This **restates the ratified clean-build
   phasing** (#46 / B0: "B3 batched claim path (DA enforcement production) → B4
   publisher/indexer/resolver") — the established line, not a new decision. DK's "advance to B3
   integration" (event f52d1918) + that ratification = the boundary; DK may still redirect to a
   broader B3.
2. **First slice — I-HARNESS** (not I-SPV first). The **SPV seam is present from day one**: a fixture
   canonical-header source is fine; a deprecated structural-only path is NOT acceptable.
3. **batch-rail.ts — MINE, do not import.** Harvest the invariants (DA-filter-before-merge,
   deterministic Bitcoin-coordinate ordering, notice-window lifecycle, contested→L1,
   late-claim→already-owned) into the production orchestrator, re-keyed around #47 folded anchor / #84
   VerifiedAvailability / #83 completeness / D-CV projections; strip the old markerHeight/local-node
   semantics; quarantine the sim after extraction.

**Added constraint (CL):** the orchestrator outputs an **evidence trace + kernel verdict**, NOT a bare
ownership mutation — keeps false-accept review sharp and makes B4 adapter substitution clean.

## 6. I-HARNESS design (first slice)

The end-to-end batched-claim enforcement orchestrator over fixture chain data. Pure (no I/O); consumes
typed data-source seams; returns an **evidence trace + kernel verdict** (never a bare mutation).

```
enforceBatchedClaim(input, sources) -> { trace, verdict }
  sources (typed seams — fixture-backed in B3; real adapters in B4):
    - headerSource:    canonical best-chain headers (the SPV seam — fixture now, real in B4)
    - batchDataSource: leaves for an anchored root (membership + served bytes)
  pipeline (compose the ratified §2 pieces, fail-closed at each step):
    1. inclusion     buildBitcoinInclusion + verifyProofBundleAgainstBitcoin vs headerSource
                     (NOT the deprecated structural alias)
    2. canonical-root deriveCanonicalRoot over the anchored deltas (#47 folded anchor / D-CV)
    3. membership    buildMembershipProof / verify each presented leaf vs the anchored root
    4. availability  verifyAvailabilityHeight (#84; fail-closed over the presented bytes)
    5. completeness  evaluateBatchCompleteness (#83)
    6. verdict       the audited kernel predicate(s) consume the above as witnessed inputs
  output: { trace: <per-step evidence + reason>, verdict: <accept/reject + name-state delta> }
```

**Orchestration invariants (mined from batch-rail.ts, re-keyed):** DA-filter before merge;
deterministic Bitcoin-coordinate ordering (height, txIndex, vout); notice-window lifecycle;
contested→L1; late-claim→already-owned.

**`hrns.*` red battery (CL's pins):** absent/corrupt Bitcoin inclusion rejects; stale/noncanonical
fixture header rejects; missing served bytes rejects (fail-closed availability); N−1 / N+1 / duplicate
leaf rejects (completeness); **withhold-then-reveal grants no revival** (once forfeited under #84 a late
reveal does not resurrect); a local receipt / source timestamp is ignored (no oracle channel); plus the
happy path producing a clean accept trace.

**Scope guards:** fixture sources only (no network); pure + deterministic; outputs trace+verdict, never
a bare mutation; uses ONLY ratified predicates (no new consensus law).

**Design Qs for CL before the red battery:** (a) the seam interfaces (headerSource / batchDataSource) +
the trace shape — right altitude? (b) package home — a new `@ont/claim-path` orchestrator vs extending
an existing package? (c) the verdict step — one composite predicate call, or the orchestrator threads
the several §2 predicates (my lean: thread them, since each is independently audited)?
