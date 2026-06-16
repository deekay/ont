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

## 5. Open calls for CL design-concur

1. **B3/B4 boundary (§2):** is "B3 integration = end-to-end enforcement over fixtures + typed seams,
   full adapters → B4" the right line? (My lean: yes — keeps B3 about *enforcement correctness*, B4
   about *network plumbing*.)
2. **First slice:** I-HARNESS first (compose + prove fail-closed + surface seams), or I-SPV first
   (launch gate, foundational)? My lean: I-HARNESS — it de-risks the composition and the SPV slice
   then slots into a working harness.
3. **Mining batch-rail.ts:** harvest its leaderless delta-merge / notice-window / collision logic into
   the production orchestrator (re-keyed to the ratified predicates), then quarantine the sim — agreed?
