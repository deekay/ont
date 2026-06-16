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

## 8. I-REC design (recovery-invoke integration) — design-first

The recovery-invoke enforcement orchestrator: an untrusted supply presents a verified confirmed-invoke
seam fact + the recovery descriptor `D` + current name-state; I-REC cross-binds the fact, mints the §3c
descriptor witness (recompute-not-trust) at the confirmed `h_r`, and feeds the kernel `acceptRecoverOwner`.
Returns an **evidence trace + admission verdict** (never a state mutation), mirroring I-HARNESS. Lives in
`@ont/claim-path`.

The kernel surface (already audited, B2/B3 §2):
```
acceptRecoverOwner(invokeFacts, descriptorEvidence, nameState, recoveryParams) -> { accepted, reason }
  invokeFacts:       RecoverOwnerInvokeFacts { prevStateTxid, newOwnerPubkey, flags, successorBondVout,
                       challengeWindowBlocks, recoveryDescriptorHash, signature, minedHeight=h_r }
  descriptorEvidence: { descriptor, witness:{kind:"b3-verified-recovery-descriptor-witness", witnessedByHeight} }
  nameState:         { ownerPubkey, headTxid, currentOwnershipRef, recoveryDescriptorHeadHash, …Sequence }
  recoveryParams:    { recoveryEvidenceWindowBlocks W_r }
```
The witness is only mintable by `verifyRecoveryDescriptorWitness` (@ont/evidence, D-RC) — a producer-
asserted `{witnessedByHeight}` is rejected by the kernel. So I-REC's whole job is to MINT that witness
from chain-bound facts and wire it in; it never re-checks the descriptor authorization (R2/R3/R4/R7 stay
kernel).

**Design-concur — RESOLVED (ChatLunatique, event 67a92497).**
1. **h_r binding → C (consume a verified confirmed-invoke seam fact).** `verifyProofBundleAgainstBitcoin`'s
   direct-L1 source is auction/settlement-shaped (`auctionTranscript`/`winner`/`settlementProof`) and does
   not model a RecoverOwner tx without inventing a new bundle source (don't bend it); B (a raw single-tx
   inclusion verifier) hides a D-BI refactor inside the recovery slice. I-REC consumes a **closed,
   verified `ConfirmedRecoverOwnerInvoke` seam fact** (B4's inclusion adapter produces it; fixture in B3) —
   NOT a loose producer assertion. The h_r firewall lives in the (already-green) inclusion/D-BI builder
   behind the seam; I-REC derives both the D-RC input and the kernel `minedHeight` from that one fact.
2. **invokeFacts provenance → structured + UNMINED.** The seam carries the parsed invoke payload as
   `invokeFields` WITHOUT `minedHeight`; I-REC builds the kernel `RecoverOwnerInvokeFacts` by adding
   `minedHeight` from the confirmed invoke. An `invokeFields` carrying `minedHeight` / `source` / a
   timestamp / a witness fails closed (closed-shape). The kernel still owns R7 signature + authority.
3. **nameState → seam, closed-shape.** Current consensus state (fixture in B3, indexer in B4), never
   derived; `acceptRecoverOwner` owns the R2/R3/R4/R5/R7/R10 reason vocabulary in the authority trace.
4. **Scope / output → authorization verdict, NO state mutation.** `acceptRecoverOwner` does NOT rotate the
   owner — the engine opens `pendingRecovery` only after PR-34 successor-bond/address checks, then rotation
   happens at finalization. So I-REC (PR-34 out) emits an **admission verdict, not a delta**:
   `{ authorized:true, kind:"recovery-invoke-authorized", proposedOwnerPubkey, challengeWindowBlocks,
   recoveryDescriptorHash }` — and the happy path asserts NO owner / new-bond / `pendingRecovery` mutation
   is emitted. (Bond-continuity #79 + PR-34 successor-bond = a later slice that would emit the real
   `pendingRecovery` delta.)

**Seam shape (closed):**
```
ConfirmedRecoverOwnerInvoke {            // verified inclusion/adapter output (h_r firewall behind it)
  txid, minedHeight (h_r), recoveryDescriptorHash (chain-committed), invokeFields: UnminedInvokeFields }
UnminedInvokeFields {                     // RecoverOwnerInvokeFacts MINUS minedHeight (closed)
  prevStateTxid, newOwnerPubkey, flags, successorBondVout, challengeWindowBlocks,
  recoveryDescriptorHash, signature }
enforceRecoveryInvoke({ confirmedInvoke, descriptor, nameState, recoveryParams }) -> { trace, verdict }
```

**Pipeline (fail-closed each step):**
```
  1. validate + CROSS-BIND  closed-shape all inputs; invokeFields.recoveryDescriptorHash ===
                            confirmedInvoke.recoveryDescriptorHash else rec-cross-bind-mismatch (before
                            D-RC/kernel — no "fields for invoke A + inclusion of tx B")
  2. witness                verifyRecoveryDescriptorWitness({ descriptor, committedDescriptorHash =
                            confirmedInvoke.recoveryDescriptorHash, confirmedInvokeMinedHeight =
                            confirmedInvoke.minedHeight }) -> mint | rc-* reject (surfaced in trace)
  3. authority              acceptRecoverOwner({ ...invokeFields, minedHeight: confirmedInvoke.minedHeight },
                            { descriptor, witness }, nameState, recoveryParams) -> { accepted, reason }
  4. verdict                accepted -> { authorized:true, kind:"recovery-invoke-authorized",
                            proposedOwnerPubkey, challengeWindowBlocks, recoveryDescriptorHash }; else
                            { authorized:false, reason } — NO name-state delta
```
The confirmed height is the ONLY height used (witnessedByHeight = kernel minedHeight = confirmedInvoke.minedHeight).

**`rec.*` red battery:** happy invoke → `recovery-invoke-authorized` + proposedOwnerPubkey/challengeWindow/
descriptorHash, asserting **no owner / new-bond / pendingRecovery mutation** is emitted; determinism; the
confirmed height is the only height (witness + kernel minedHeight both = h_r); a producer-supplied
witness/`witnessedByHeight` field fails closed (closed-shape — replaces "witnessed-too-late", which #86/
D-RC makes unreachable); cross-bind (`invokeFields` hash ≠ confirmed hash) → `rec-cross-bind-mismatch`;
descriptor digest ≠ committed hash → `rc-descriptor-hash-mismatch` (via D-RC, no witness, reject); kernel
rejects surfaced in the trace (wrong ownershipRef R4 / stale head R3 / non-cancel flags); malformed
confirmed-invoke / `invokeFields` (extra `minedHeight`) / descriptor / nameState / params → fail-closed;
never throws.

## 9. I-FEE design (gate-fee enforcement) — design-first

The gate-fee enforcement orchestrator: bind a confirmed batch anchor, run the audited
`gateFeeValidation` over the committed leaf set + the fee witness, and emit an **admission verdict +
trace** (Σ g ≥ paid). Closes the STATUS gap "aggregate gate-fee Σ g not enforced in the path." Lives in
`@ont/claim-path`.

**Key finding — `gateFeeValidation` is self-contained.** It already recompute-don't-trusts everything:
`paidFee = Σ(spent prevout values) − Σ(anchor outputs)` from the COMPLETE anchor tx + each prevout tx
(`legacyTxidOf` binds the fee tx to `anchor.anchorTxid` and each prevout to its input — `gf-anchor-txid-
mismatch` / `gf-prevout-txid-mismatch`), and `requiredFee = Σ g(canonicalNameByteLength)` over the FULL
committed leaf set (#52: dropped/DA-excluded leaves still count); it also binds the committed batch to the
anchor (`batch.anchoredRoot/batchSize === anchor.*` → `gf-batch-not-bound-to-anchor`). So I-FEE's
integration value is NOT re-checking fees — it is feeding `gateFeeValidation` a **chain-bound** anchor
(not a producer assertion) and returning an admission verdict + trace, mirroring I-REC.

**Why two slices (the block-170 fixture constraint).** The literal in-path enforcement needs the gate-fee
stage to recompute `paidFee` from the inclusion-bound anchor's COMPLETE tx. The I-HARNESS happy fixture's
anchor is the REAL block-170 payment txid (`PAYMENT_TXID`) with a real-PoW inclusion proof, so a fee
witness there would require block-170's real payment tx as a `LegacyTransaction` (+ its block-9 prevout) —
fixture archaeology — or a re-mined synthetic block. That constraint is why the gate-fee logic ships first
as the standalone **I-FEE-A** (synthetic coherent fixture, no inclusion/PoW needed — the confirmed-anchor
seam IS the chain-bound boundary), and the in-path **I-FEE-PATH** stage uses a small synthetic path
fixture (or re-keys just that path test). I-FEE-PATH is REQUIRED before B3-integration is merge-ready (it
closes the STATUS gap) — it is NOT deferred to B4. (B4 only swaps the fixture seams for the real
indexer/adapter, which already parses the anchor tx so the fee witness is free.)

**Seam shape (closed):**
```
ConfirmedBatchAnchor {                    // verified inclusion/adapter output (h firewall behind it)
  anchorTxid, minedHeight, anchoredRoot, batchSize }
enforceGateFee({ confirmedAnchor, committedBatch, feeWitness }) -> { trace, verdict }
  committedBatch: CommittedBatchContents { anchoredRoot, batchSize, leaves[] }   // @ont/consensus
  feeWitness:     GateFeeWitness { anchorTx, prevoutTxs[], schedule }            // @ont/consensus
```

**Pipeline (fail-closed each step):**
```
  1. validate     closed-shape the confirmedAnchor seam fact (anchorTxid/anchoredRoot hex, minedHeight +
                  batchSize u32) — else gf-input-malformed
  2. gate-fee     gateFeeValidation({ minedHeight, anchoredRoot, batchSize, anchorTxid } FROM the
                  confirmed anchor, committedBatch, feeWitness) -> { accepted, reason }; gateFeeValidation
                  binds fee-tx (legacyTxidOf) + committed batch (root/size) to that chain-bound anchor
  3. verdict      accepted -> { adequate:true, kind:"gate-fee-adequate" }; else { adequate:false, reason }
```
No name-state mutation (admission only). The anchor facts come ONLY from the confirmed-anchor seam; a
hostile fee witness (different tx) → `gf-anchor-txid-mismatch`, a hostile committed batch (different root)
→ `gf-batch-not-bound-to-anchor`, underpayment → `gf-underpaid`, all surfaced in the trace.

**Design-concur — RESOLVED (ChatLunatique, event 79f82499): SPLIT into two slices.** CL concurs the key
finding + the seam, but a standalone `enforceGateFee` alone does NOT close "Σ g not enforced in the path,"
so the path wire-in is mandatory before B3-integration is merge-ready (NOT deferred to B4).
- **I-FEE-A (this slice):** build standalone `enforceGateFee({ confirmedAnchor, committedBatch, feeWitness })`
  with the synthetic coherent fixture + the `fee.*` battery. Confirmed: confirmed-anchor seam shape is
  right; `committedBatch` is the FULL committed set (#52), not the served delta; `committedBatch`/`feeWitness`
  may come from seams but the orchestrator MUST call `gateFeeValidation` itself; output is admission-only
  `{ adequate:true, kind:"gate-fee-adequate" }`, no mutation; fee-tx⇔anchor + batch⇔anchor binds stay
  `gateFeeValidation`'s (no duplicate I-FEE check).
- **I-FEE-PATH (follow-up, before merge-ready):** wire a MANDATORY gate-fee stage into `enforceBatchedClaim`
  immediately after the inclusion anchor-bind and before availability/completeness — `enforceBatchedClaim`
  cannot reach `verdict`/`nameStateDelta` unless gate-fee admission passes. NO producer boolean like
  `feeAdequate`. If the real block-170 tx fee fixture is too expensive, use a small synthetic path fixture
  or re-key just that path test (CL-approved). Pin: path gate-fee failure stops before any `nameStateDelta`.

**`fee.*` red battery (I-FEE-A; CL red pins):** adequate anchor → `gate-fee-adequate` admission + no
mutation (verdict keys = exactly `{adequate, kind}`); determinism; hostile fee tx (`anchorTx` ≠ confirmed
txid) → `gf-anchor-txid-mismatch`; hostile batch (root ≠ confirmed root) → `gf-batch-not-bound-to-anchor`;
underpaid (Σ g > paid) → `gf-underpaid`; **multi-leaf full-set Σ g** (#52: a droppable 3rd leaf still
counts → underpaid) pinned; malformed confirmed anchor → `gf-input-malformed`; never throws. Fixtures
mirror the kernel `gate-fee.test.ts` recipe (synthetic prevout txs + anchor tx via `legacyTxidOf`, so
`paidFee = Σ spent − Σ outputs`).

## 10. I-FEE-PATH design (mandatory gate-fee stage in enforceBatchedClaim) — design-first

The gap-closer: make gate-fee a MANDATORY stage in `enforceBatchedClaim` so a batched claim cannot reach
`verdict`/`nameStateDelta` unless gate-fee admission passes. Closes STATUS "Σ g not enforced in the path."
Required before B3-integration is merge-ready.

**Pipeline change (5 stages):** `inclusion → gate-fee → availability → completeness → verdict`. The new
stage runs AFTER the inclusion anchor-bind (so the chain-bound anchor exists) and BEFORE availability
(so an underpaid/fee-faulty batch never reaches a name-state delta). `ClaimStep` gains `"gate-fee"`; the
reason precedence extends: inclusion-fault BEFORE gate-fee, gate-fee BEFORE availability/completeness.

**Reuse I-FEE-A.** Right after inclusion binds `{txid, height, root}` (+ `anchor.batchSize`), construct a
`ConfirmedBatchAnchor { anchorTxid: bound.txid, minedHeight: bound.height, anchoredRoot: bound.root,
batchSize: anchor.batchSize }` and call `enforceGateFee({ confirmedAnchor, committedBatch, feeWitness })`.
If `!adequate` → `reject("gate-fee", verdict.reason)` (the `gf-*` reason surfaced). DRY — no second
gate-fee path; the inclusion bind already yields the chain-bound anchor I-FEE-A consumes.

**SCHEDULE IS A TRUSTED LAUNCH PARAM, NOT SEAM-SUPPLIED (false-accept defense).** `gateFeeValidation`'s
`requiredFee` is computed from `feeWitness.schedule`; if the untrusted batch-data seam supplied the
schedule, a hostile seam could pick a tiny schedule and an underpaid batch would falsely admit. So the
orchestrator assembles the `GateFeeWitness` = `{ anchorTx, prevoutTxs }` (from the seam) + `schedule`
(from a TRUSTED launch-freeze param on `input`, alongside `window`). The seam never chooses the schedule.

**New seam material (the indexer/adapter has it; fixture in B3):**
- `committedBatchForRoot(anchoredRoot) -> CommittedBatchContents | null` — the FULL committed leaf set
  (leafKeyHex + canonicalNameByteLength). NOT derivable from `servedDelta` (which carries keyHex/valueHex
  but no name byte length, the sole input to g()). Withheld (`null`) → fail closed at gate-fee.
- `feeTxForAnchor(anchorTxid) -> { anchorTx, prevoutTxs } | null` — the parsed anchor tx + its input
  prevout txs (NO schedule). `legacyTxidOf(anchorTx)` must equal the bound anchor txid (gateFeeValidation
  enforces → `gf-anchor-txid-mismatch`).
The cross-binds stay `gateFeeValidation`'s: fee-tx⇔anchor (`legacyTxidOf`) and committedBatch⇔anchor
(root/size). `committedBatch.batchSize` must equal the bound anchor's `batchSize`.

**Fixture — re-key the I-HARNESS path fixture to a synthetic mineable fee-adequate anchor.** The current
happy/availability/completeness tests use the real block-170 payment anchor (`PAYMENT_TXID`), whose tx
can't be reconstructed as a `LegacyTransaction` for the fee witness. CL-approved: replace it with a
SYNTHETIC coherent anchor — a fee-adequate anchor `LegacyTransaction` (inputs from prevout txs, an
OP_RETURN-style output, `Σ inputs − Σ outputs ≥ Σ g`), placed in a synthetic block with an easy-`nBits`
mined header (`headerMeetsTarget` passes; the I-SPV in-test miner pattern) so `verifyProofBundleAgainstBitcoin`
still verifies inclusion. The synthetic anchor txid feeds BOTH the bundle's `bitcoinInclusion.anchors[0].txid`
AND the fee witness's `anchorTx`. Real-block-170 PoW byte-order stays pinned by `block-header.test.ts` /
`validate-header-chain.test.ts` / `proof-bundle.test.ts`, so the integration test losing it is fine.

**Design-concur — open calls (my leans):**
1. **Reuse `enforceGateFee` inside `enforceBatchedClaim`** (vs call `gateFeeValidation` directly). **Lean:
   reuse** — the inclusion bind yields a `ConfirmedBatchAnchor`; one gate-fee code path.
2. **Seam vs input.** Extend `BatchDataSource` with `committedBatchForRoot` + `feeTxForAnchor` (mirrors
   `servedLeavesForRoot`, B4-substitutable); the **schedule is a trusted launch param on `input`** (NOT
   the seam). **Lean: this split.**
3. **Fixture re-key.** Re-key the whole `enforce-batched-claim.test.ts` base fixture to the synthetic
   anchor (uniform), vs keep block-170 for inclusion-reject tests + synthetic only for path tests. **Lean:
   uniform synthetic** (simpler; inclusion-reject behavior is identical on a synthetic header).

**Planned `path.gatefee.*` red battery (sketch, pending concur):** happy claim passes gate-fee then
proceeds to accept (+ delta); **underpaid → reject AT gate-fee, NO availability/completeness step, NO
`nameStateDelta`**; hostile fee tx (`anchorTx` ≠ bound txid) → reject at gate-fee; committed batch withheld
(`null`) → reject at gate-fee; a HOSTILE LOW SCHEDULE cannot come from the seam (schedule is the trusted
param — pin that the seam has no schedule channel); gate-fee runs only AFTER inclusion (an inclusion fault
still rejects at inclusion, never reaching gate-fee); precedence pin (gate-fee before availability).
