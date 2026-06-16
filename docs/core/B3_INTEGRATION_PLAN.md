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
  pipeline (4 stages — CL concur event 9f4cebb4; compose the ratified §2 calls, fail-closed each step):
    1. inclusion     verifyProofBundleAgainstBitcoin vs headerSource (NOT the deprecated structural
                     alias) — SUBSUMES SPV/header-canonicality + the bundle's structural accumulator
                     MEMBERSHIP
    2. availability  verifyAvailabilityHeight (#84; fail-closed over the presented bytes)
    3. completeness  evaluateBatchCompleteness (#83) — OWNS the prevRoot→newRoot replay; the harness
                     builds the per-leaf projections + the availability-derived daVerdict
    4. verdict       accept + name-state delta, or reject
  output: { trace: <per-step evidence + reason>, verdict: <accept/reject + name-state delta> }
```

The separate `membership` + `canonical-root` stages are DROPPED (not independently isolatable without
duplicating already-audited checks): inclusion subsumes membership, completeness owns the replay. The
distinct value `deriveCanonicalRoot` adds beyond replay — CONTESTED distinct-owner routing to L1 (#84
O3) — is a follow-up **I-CONTESTED** slice.

**Orchestration invariants (mined from batch-rail.ts, re-keyed):** DA-filter before merge;
deterministic Bitcoin-coordinate ordering (height, txIndex, vout); notice-window lifecycle;
contested→L1; late-claim→already-owned.

**`hrns.*` red battery (coherent fixtures — real block-170 anchor + real accumulator roots + a resident
proof bundle, so green only accepts when the real calls pass):** honest claim accepts (ordered trace +
delta); absent inclusion + stale/noncanonical header reject at `inclusion`; inclusion failure stops
before availability/completeness; withheld served bytes reject at `availability` before completeness;
a committed-`batchSize`/served-count mismatch rejects at `completeness` while availability still
reconstructs; completeness failure stops before any name-state delta; **content-only** — withheld
content rejects and only presenting the actual matching content mints the witness (no timestamp/receipt
revival, per #84/O1; "no revival after a settled reject" would be a separate prior-verdict/finalize-once
vector); seam throws (header/batch) become a failed trace step, never an exception.

**Scope guards:** fixture sources only (no network); pure + deterministic; outputs trace+verdict, never
a bare mutation; uses ONLY ratified predicates (no new consensus law).

**Design calls — RESOLVED (CL event 9f4cebb4):** (a) seams `headerSource` + `batchDataSource` + trace
`{step, ok, reason, evidence?}` — right altitude (no separate served-bytes seam; the orchestrator runs
availability itself so no timestamp/receipt is authority). (b) new `@ont/claim-path` package. (c) thread
the §2 predicates explicitly (no new composite); fail closed at the first failed stage, trace shows
which predicate rejected.

## 7. I-SPV design (second slice) — the canonical-best-chain header source (#82 launch gate)

I-HARNESS depends on a `BitcoinHeaderSource` (the inclusion seam consumed by
`verifyProofBundleAgainstBitcoin`); the harness battery used a **fixture** source. I-SPV makes that
source **trustworthy** — a light-client header verifier that turns raw 80-byte headers into a canonical
best-chain `BitcoinHeaderSource`, so a valid-PoW-but-off-chain header cannot be substituted. This is the
#82 launch gate ("verify against Bitcoin with an independent canonical best-chain header source").

**The gap.** Per-header PoW (`headerMeetsTarget` / `bitsToTarget`) exists but is **internal/unexported**
in `proof-bundle.ts`; there is **no header-chain linkage / best-chain validator** anywhere, and
`@ont/bitcoin` has no header primitives. Header layout: `nBits` at bytes 72–75 (LE), `prevBlock` at
bytes 4–36 (internal LE); block hash = `reverse(dsha256(header))`, and `header[i].prevBlock ==
dsha256(header[i-1])` (internal order).

**Deliverable (sketch).**
```
validateHeaderChain(headersHex: string[], startHeight: number, prevCheckpointHashHex?: string)
  -> { ok: true, headerSource: BitcoinHeaderSource } | { ok: false, reason }
  - per header i: 80-byte + headerMeetsTarget(header) (PoW)            else reject
  - i>0 (and i==0 vs prevCheckpointHashHex if given): prevBlock(i) == dsha256(header[i-1])  else reject
  - headerSource.headerHexAtHeight(h) = the validated header at h, or null outside the validated range
```
The I-HARNESS inclusion seam consumes the returned `headerSource`; B4 feeds the real network headers.

**Open calls for CL design-concur.**
1. **Location.** A new `@ont/bitcoin` primitive (my lean — the Bitcoin-primitive home, like `legacyTxidOf`;
   reusable by both `proof-bundle.ts` and `@ont/claim-path`), vs `@ont/claim-path`-local.
2. **PoW helper.** Relocate `headerMeetsTarget` / `bitsToTarget` from `proof-bundle.ts` → `@ont/bitcoin`
   (single source; `proof-bundle.ts` re-imports — behavior-preserving, the `legacyTxidOf` (#85) /
   `accumulatorRootOf` (#83) relocation precedent), vs reimplement in the validator (PoW duplication).
   My lean: relocate. NB: touches audited `proof-bundle.ts` (a #44-aware move).
3. **Scope.** B3 first cut = a **linear** chain (per-header PoW + prev-hash linkage from a trusted
   checkpoint) producing the source — this already closes the "off-chain-header substitution" gate for a
   given chain. Difficulty-**retarget** validation (the 2016-block adjustment) + most-work **reorg/best-chain
   selection** among competing forks = a flagged follow-up **I-SPV-2** (heavier; arguably B4 network
   territory). My lean: linear-first; pull reorg/retarget forward only if you want the full launch-gate now.

**Planned `spv.*` red battery:** a linear PoW+linkage chain validates → `headerHexAtHeight` returns the
right headers; bad PoW rejects; broken linkage (wrong `prevBlock`) rejects; an off-chain header (valid
PoW, wrong linkage) rejects; checkpoint-mismatch at i==0 rejects; non-80-byte/malformed rejects;
`headerHexAtHeight` returns null outside the validated range; total/fail-closed, never throws.
