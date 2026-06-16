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

**Design-concur RESOLVED (CL event 5ee443fc; my picks recorded).**
1. **Location → `@ont/bitcoin` (concurred).** The pure header primitives + source builder live next to
   `legacyTxidOf` and export from `@ont/bitcoin`; `@ont/claim-path` only consumes the resulting
   `BitcoinHeaderSource` seam.
2. **PoW helper → relocate (concurred).** Moved `bitsToTarget` / `headerMeetsTarget` into `@ont/bitcoin`
   (`block-header.ts`); `proof-bundle.ts` imports `headerMeetsTarget`. Behavior-preserving for the audited
   verifier: all proof-bundle + trust-surface tests stay green, plus a new bitcoin-level pin for the known
   block-170 header → hash → target → `headerMeetsTarget` path so byte order cannot drift. **No #87
   boundary addendum is needed:** `proof-bundle.ts`'s trust surface *already* admits `@ont/bitcoin`
   (`trust-surface.test.ts` `CORE_DECIDERS_ALLOWED_BY_FILE`), so the import uses an already-granted
   permission — narrower than gate-fee #85, which actually *added* `@ont/bitcoin` to a verdict file. Only
   the import + the relocated primitive change; no new consensus law, no boundary-manifest extension.
3. **Scope → PREFERRED full #82 validator (CL's correctness point sustained; I do NOT keep the linear
   wording).** Linear self-target PoW + prev-linkage is **weaker than the name**: a fabricated child of a
   trusted checkpoint can pick easier `nBits`, satisfy `headerMeetsTarget(header)` against its *own*
   declared target, link to the checkpoint, and still be off-chain. PoW/Merkle alone prove inclusion in *a*
   valid-work header, not the canonical best chain (the local #82 warning). So I-SPV validates a presented
   candidate chain against Bitcoin network params: compact-target validity / `powLimit`, **expected `nBits`**
   across the range (the 2016-block **retarget** recomputed when a boundary is crossed; constant within a
   period), per-header PoW, prev-linkage, and **cumulative chainwork**. The de-scoped linear sub-slice
   (I-SPV-0) is declined — it adds little over the I-HARNESS fixture source (still accepts the easy-target
   child) and would defer the only valuable part. B4 may remain a network adapter/fetcher that *presents* a
   candidate chain; it need not own consensus validation (that lives here). Multi-fork **selection** among
   competing presented chains stays a B4 fetcher concern; I-SPV validates the presented chain + its work.

**Deliverable.**
```
validateHeaderChain(headersHex: string[], startHeight: number, params, prevCheckpointHashHex?)
  -> { ok: true, headerSource: BitcoinHeaderSource, cumulativeWorkHex } | { ok: false, reason }
  - per header i: 80-byte; bits=nBits(i); target=bitsToTarget(bits) in (0, powLimit]   else reject
  - bits(i) == expectedBits(i)   (period-constant; retarget recompute at 2016-boundary) else reject
  - headerMeetsTarget(header_i) against target(i) (PoW)                                  else reject
  - i>0 (and i==0 vs prevCheckpointHashHex if given): prevBlock(i)==dsha256(header[i-1]) else reject
  - cumulativeWork = checkpoint.cumulativeWork + Σ ( floor((2^256 - 1 - target_i) / (target_i + 1)) + 1 )  // = (~target)/(target+1)+1, Bitcoin Core GetBlockProof
  - headerSource.headerHexAtHeight(h) = the validated header at h, or null outside the range
```
The I-HARNESS inclusion seam consumes the returned `headerSource`; B4 presents the real network headers.

**Planned `spv.*` red battery:** a valid header chain validates → `headerHexAtHeight` returns the right
headers + `cumulativeWorkHex` accounted; bad PoW (header fails its own target) rejects; **easy-target
forged child** (self-target-valid but `nBits` easier than expected at its height, linked) **rejects** (the
#82 pin); `nBits` above `powLimit` / zero / out-of-range rejects; broken linkage (wrong `prevBlock`)
rejects; checkpoint-mismatch at i==0 rejects; retarget-boundary header with stale (un-recomputed) `nBits`
rejects; non-80-byte/malformed rejects; `headerHexAtHeight` returns null outside the validated range;
total/fail-closed, never throws. Plus a bitcoin-level block-170 pin (relocation byte-order guard).
