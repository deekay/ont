# B3 evidence-layer hardening — steps 1–2: rule extraction and source check

> **Status: DRAFT — steps 1–2 (invariant extraction + source check). Awaiting
> ChatLunatique's adversarial passes (step 3).** Branch `clean-build-b3`,
> stacked on `main` @ the B2 buildable-complete merge (`03495bd`). Produced
> 2026-06-15 on DK's "continue the adversarial build process" greenlight
> (event `d031752d`). Per the normative-hardening amendment this phase runs the
> five steps (rule extraction → source check → adversarial content pass →
> attacks become negative tests → sign-off), in the form of
> [`B1_WIRE_HARDENING.md`](./B1_WIRE_HARDENING.md) and
> [`B2_KERNEL_HARDENING.md`](./B2_KERNEL_HARDENING.md). This document is the
> output of **steps 1–2** for the L3 evidence layer (future `@ont/evidence`).
> Promotion to `normative` is per-section, DK-ratified — **nothing here is law
> yet**, and the genuinely-open consensus questions are parked for DK in §5
> (parking rule: new consensus law is DK's to rule, never agent-decided).
>
> **Phase gate (canon).** B3 implementation is unblocked: B2 is merged
> ([SOFTWARE_CANON.md](./SOFTWARE_CANON.md) sequencing — "implementation for
> phase N+1 may not begin until phase N is merged"). This doc + the conformance
> suite design land first; implementation follows the adversarial review, never
> before it.

## §0 — Purpose / scope / tests (the required component statement)

Per *nothing-is-precious*, every new component needs a written purpose/scope/
tests statement before code.

- **Purpose.** Construct and **cryptographically verify** the evidence the B2
  ownership kernel consumes — Bitcoin inclusion proofs, accumulator membership
  proofs, served-bytes (data-availability) witnesses, auction-transcript
  completeness witnesses — and the multi-publisher convergence that derives the
  canonical root. B3 turns "the publisher says so" into "anyone can check it."
- **Scope (in).** `@ont/evidence`: proof-bundle assembly + structural and
  against-Bitcoin verification, accumulator membership-proof construction,
  served-bytes witness production + verification (bytes → anchored root under
  `batchSize`), completeness-witness production, **recovery-descriptor evidence
  witness** production + verification, witness gathering, and the canonical-root
  merge (Model B — see §5.2).
- **Scope (out).** No ownership decisions. B3 decides nothing the kernel
  decides: not who owns a name, not the auction winner, not whether a deadline
  passed. Those stay in `@ont/consensus`. B3 also excludes adapters (publisher/
  resolver I/O is B4) and surfaces (B5).
- **Tests.** The gate is adversarial (§4): the convergence attack battery and a
  hostile-evidence battery, run as production tests **against the real B2
  kernel** — a swapped or lying evidence implementation must not move any kernel
  verdict.

## §1 — The defining contract: B3 is NON-DECIDING

This is the one invariant the whole layer is organized around, and the canon B3
gate.

- **EV is a witness, not a callback.** The kernel never calls into B3 to *ask*
  for a verdict; it consumes a verified witness **as data** and re-checks it
  itself. `da-verdict.ts` and `transcript-completeness.ts` already encode this:
  the witness is an opaque input object, never a function handle, endpoint, or
  bare boolean.
- **The hostile-evidence property.** Replace `@ont/evidence` with an
  adversarial or buggy implementation and **no `@ont/consensus` verdict
  changes**. B3 can fail to *produce* a passing witness (then the kernel fails
  closed — correct), but it can never *fabricate* one the kernel accepts,
  because acceptance is the kernel re-verifying the cryptographic binding to the
  anchor's witnessed facts (`anchoredRoot`, `batchSize`, `minedHeight`).
- **Consequence for the suite.** The hostile-evidence battery (§4.2) is the
  primary B3 deliverable, not an afterthought: it is the executable proof of
  this contract.

## §2 — B3 deliverables, traced to the kernel contracts they feed

Every B3 deliverable exists to feed a *consumption contract* the B2 kernel
already pins. The kernel files name these explicitly; B3 produces the
verifier-checkable input each one consumes opaquely today.

| # | B3 deliverable | Feeds (kernel contract) | Kernel annotation |
| --- | --- | --- | --- |
| D-BI | Bitcoin header/inclusion verification (Merkle + PoW) | `proof-bundle.ts` → `verifyProofBundleAgainstBitcoin` / `bitcoinInclusion` section | "does NOT verify the cited Bitcoin txns are in PoW-backed blocks — for that, see verifyProofBundleAgainstBitcoin" |
| D-SB | Served-bytes witness: bytes → `anchoredRoot` under `batchSize`, bound to one anchor | `da-verdict.ts` (`includable`/`holdsPriority`) | "producing and cryptographically verifying that witness … is the B3 deliverable (D8)" |
| D-AM | Accumulator membership-proof construction | `proof-bundle.ts` → `verifyAccumulatorMembership` (`@ont/protocol`) | structural bundle check cites accumulator membership |
| D-CW | Completeness witness: counted-bid set is the complete set over the lot's block/soft-close range | `transcript-completeness.ts` (T2) | "the concrete verifier-checkable format and the lot's block range are a B3 deliverable" |
| D-CV | Canonical-root merge (multi-publisher convergence) | `batch-exclusion.ts` / `reopen-resolution.ts` (consume `excludedBatchIds`, derived insertions) | the kernel consumes a derived canonical root; deriving it is B3 |
| D-PB | Proof-bundle assembly (both sources) | `verifyProofBundleStructure` (`bitcoin_l1_direct_auction` \| `accumulator_batch_claim`) | structural self-consistency, then against-Bitcoin |
| D-RC | Recovery-descriptor evidence witness: armed descriptor head demonstrably witnessed by `h_r + W_r` | `recovery-invoke-authority.ts` (`acceptRecoverOwner`, §3c evidence gate) | "the 'demonstrably witnessed' descriptor-evidence format is a B3 evidence-layer deliverable … `{ kind: "b3-verified-recovery-descriptor-witness", witnessedByHeight }`" |

## §3 — Evidence-layer invariants (E-series) + source check

Source-check tags: **[cited]** has a normative/candidate spec home;
**[ratified: #N]** rests on a ratified decision; **[candidate-stays]** has no
ratifying source yet (harden later, DK-ratified per section); **[DK-decision]**
needs a ruling before it can be law — parked in §5.

### Bitcoin inclusion (feeds D-BI)

- **E-BI1 — PoW-backed headers.** A cited anchor tx is accepted only if its
  block header carries valid proof-of-work and chains to a pinned checkpoint.
  *[cited: BITCOIN_ANCHORED_NAME_ACCUMULATOR.md "Data availability rules"; mine
  the `@ont/bitcoin` prototype — Merkle+PoW verifier tested vs a real mainnet
  block per STATUS.md].* Test: tamper a header's bits/nonce ⇒ reject.
- **E-BI2 — Merkle inclusion.** The anchor txid must Merkle-prove into the cited
  block's merkle root. *[cited: same].* Test: swap a sibling hash in the path ⇒
  reject.
- **E-BI3 — producers MUST emit `bitcoinInclusion`.** Closes the standing
  STATUS gap ("producers don't emit the `bitcoinInclusion` section, so the
  light-client path is not closed end-to-end"). *[candidate-stays — proposed B3
  rule].* Test: a bundle missing `bitcoinInclusion` is structurally valid but
  **not** Bitcoin-settled (the two-tier `verifyProofBundleStructure` vs
  `…AgainstBitcoin` distinction is preserved).

### Served-bytes witness (feeds D-SB)

- **E-SB1 — root reconstruction binds to the anchor.** Re-hash the served
  leaves, reconstruct the root under `batchSize`, and compare byte-identical to
  the anchor's `anchoredRoot`. *[ratified: da-windows (#49) S3/S4; D8].* Test:
  one flipped leaf byte ⇒ root mismatch ⇒ reject.
- **E-SB2 — single first-servable height (whole-batch).** The witness models
  whole-batch service via one first-servable height, matching `da-verdict`'s
  D2/D8 shape; **per-leaf granularity is the open D4 question (§5.1)**.
  *[ratified: #49 S2/S3; partial-service DK-decision].*
- **E-SB3 — wrong-anchor binding fails closed.** A witness whose root /
  `batchSize` / anchor binding does not match yields NOT includable / NOT
  priority. *[ratified: D4 fail-closed].* Test: present a valid witness for
  anchor A against anchor B ⇒ reject.
- **E-SB4 — withholding cannot be faked.** If no bytes are served by the
  deadline, no passing witness exists; B3 cannot synthesize one. *[cited:
  DA_MARKER_FOLD.md §6c challenge; convergence "defeats withhold-then-reveal"].*
  Test (adversarial, §4.1): withhold ⇒ kernel fails closed.
- **E-SB5 — no clock, no receipt time, no endpoint identity as authority.** The
  only height that may enter is the anchor's current-chain mined height; local
  receipt time, wall clock, first-seen height, and "which endpoint served it"
  are never authority inputs. *[cited: `da-verdict.ts` D2/D3 — "no broadcast
  time, first-seen height, or publisher assertion may enter"].* Test: a witness
  carrying a receipt timestamp / endpoint id is ignored or rejected, never used
  to satisfy a deadline.

### Accumulator membership (feeds D-AM)

- **E-AM1 — membership verifies against the anchored root.** A name's leaf
  verifies via `verifyAccumulatorMembership(root, proof)`. *[cited:
  `@ont/protocol/accumulator-membership.ts`; BITCOIN_ANCHORED_NAME_ACCUMULATOR.md].*
- **E-AM2 — insertion-unique, commuting inserts.** The accumulator is
  insert-only; distinct-leaf inserts commute (the basis for order-independent
  merge, E-CV2). *[cited: accumulator doc; convergence doc Model B].*
- **E-AM3 — non-membership / wrong-root fails.** A proof for a name not in the
  root, or against the wrong root, fails. *[cited].* Test: membership proof
  against a sibling root ⇒ reject.

### Completeness witness (feeds D-CW) — **range semantics are a DK decision (§5.3)**

- **E-CW1 — verifier-checkable completeness.** The witness demonstrates the
  counted-bid set is the complete set over the lot's block/soft-close range,
  with the range **derived from Bitcoin-witnessed heights** (not producer-
  asserted), checkable without trusting the producer. *[DK-decision: concrete
  format + range semantics — T2-neg-02, §5.3].*
- **E-CW2 — producer-assertion is never trusted.** Already enforced in B2 (T2);
  B3 must supply the *verifiable* alternative, not a self-asserted flag.
  *[ratified: T2 / canon Item 4].*
- **E-CW3 — hide-then-reveal is governed by the range rule.** A bid hidden then
  revealed after soft-close must be resolved by the (DK-ruled) range rule, not
  by retroactively decertifying a complete transcript. *[DK-decision — §5.3;
  carries T2-neg-02].*

### Convergence / canonical-root merge (feeds D-CV)

- **E-CV1 — Model B is canonical; Model A retires.** Leaderless delta-merge
  (`mergeBlock`/`runBatchRail`) derives the canonical next root; the
  single-node `RootChain` is internal chaining only, never the contested-claims
  policy. *[DK-decision — adopt-B recommendation, §5.2; convergence doc "pick B,
  retire A"].*
- **E-CV2 — order-independent convergence.** Every honest node computes the same
  canonical root for a window in any processing order. *[cited: convergence doc;
  already proven in `da-convergence-sim.test.ts` — productionize as a property
  test against the kernel].*
- **E-CV3 — same-leaf conflict is first-writer-wins, fed to notice-window.**
  `commitPriority` resolves a same-leaf contest as the merge primitive; the
  contested-claims *policy* is the kernel's notice-window, consuming
  `runBatchRail` output (not raw `mergeBlock`). *[candidate-stays; kernel owns
  the policy].*
- **E-CV4 — a malicious delta cannot unseat a finalized name or fork the root.**
  *[cited: convergence doc adversary analysis].* Test (adversarial, §4.1).

### Recovery-descriptor evidence (feeds D-RC)

- **E-RC1 — verifier-checkable descriptor witness.** B3 produces a witness that
  the name's armed descriptor-v2 head was demonstrably witnessed by `h_r + W_r`
  (`h_r` = invoke mined height; `W_r` = recovery-evidence window, a launch-freeze
  param, `1 ≤ W_r ≤ challengeWindowBlocks`). B2's `acceptRecoverOwner` consumes
  it opaquely as `{ kind: "b3-verified-recovery-descriptor-witness",
  witnessedByHeight }` and **remains the decider** (R2–R8 authorization stays in
  the kernel). *[ratified: recovery-auth (#50-b1); RECOVERY_AUTH §3c].*
- **E-RC2 — fail closed on late/absent/unverified evidence.** Late, missing, or
  unverified descriptor evidence yields no authorization, so no recovery state
  opens. *[ratified: §3c fail-closed].* Test: witness at `h_r + W_r + 1` ⇒ no
  authorization.
- **E-RC3 — the §8.3 BIP322 wallet proof is non-authorizing corroboration.** B3
  may construct it, but it carries no witnessing deadline and can neither block
  nor substitute for the descriptor evidence. *[cited: `recovery-invoke-
  authority.ts` — "NON-authorizing corroboration … no witnessing deadline"].*

### Cross-cutting (the §1 contract, made executable)

- **E-ND1 — swapping evidence cannot move a kernel verdict.** A hostile/buggy
  `@ont/evidence` produces no verdict change in `@ont/consensus`. *[ratified:
  canon B3 gate].* Test: the hostile-evidence battery (§4.2).
- **E-ND2 — zero ownership logic in B3.** No claim-gate / auction / transfer /
  recovery decision lives in `@ont/evidence`; enforced by a
  research-quarantine-style import + surface test (like B2's zero-I/O lock).
  *[ratified: canon L3 "non-deciding"].*
- **E-ND3 — transport affects liveness, not integrity.** Which endpoint served
  bytes, over what protocol, can change *whether* a witness is gathered in time,
  never *what* it proves. A "trust me, I saw it" field is a bug, not a witness:
  every accepted fact reduces to a cryptographic check against the anchor's
  witnessed commitment. *[ratified: §1 contract; `da-verdict.ts` S4].*
- **E-ND4 — reorg ⇒ re-derive from current-chain mined heights.** On reorg, all
  heights are recomputed from the current canonical chain; no first-seen or
  local height survives as authority (mirrors the kernel's one-clock rule).
  *[cited: da-windows (#49) S1; `notice-window.ts` Z9 current-chain height].*
  Test: a witness valid pre-reorg whose anchor is reorged out re-derives to
  invalid.

## §4 — The adversarial gate

### §4.1 Convergence attack battery (production tests vs the B2 kernel)

The three canon cases, run end-to-end against `@ont/consensus`:

1. **Withholding.** Anchor a root, never serve the bytes ⇒ kernel fails closed
   (no includable / no priority). (E-SB4)
2. **Hide-then-reveal.** Serve bytes / reveal a bid late, after the deadline /
   soft-close ⇒ no retroactive priority or decertification. (E-SB4 / E-CW3)
3. **Multi-publisher merge.** Concurrent deltas from multiple publishers
   converge to one canonical root; a malicious delta cannot unseat a finalized
   name. (E-CV2 / E-CV4)

### §4.2 Hostile-evidence battery (the §1 contract)

For each witness kind (served-bytes, membership, inclusion, completeness):
present a forged witness (wrong root, swapped Merkle path, insufficient PoW,
wrong-anchor binding, self-asserted completeness) and assert the kernel verdict
is identical to the no-witness case — **fail closed, never accept**.

### §4.3 Scale

Measure issuance throughput / proof sizes at target batch sizes; update **R11**
in [RISKS.md](../RISKS.md). *(Numbers, not a gate on correctness.)*

## §5 — Open decisions parked for DK (recommendations, DK rules)

These three are the genuine *consensus* questions B3 surfaces. Drafted
decision-ready; **not** agent-decided.

### §5.1 DA verdict granularity table (PR-2 / conflict C5) — **ruling makeable now**
PR-2 (the registry's commitment-match spec-PR) carries the granularity table:
the disposition per failure class. Fee → whole-batch and DA-deadline →
whole-batch are the recorded dispositions; the **open fork is leaf-level
commitment / well-formedness: per-leaf-drop vs batch-poison** (ruleIds D4, D8,
A4, A6, B9). The leaf *construction* half (C6) is already settled by
commitment-match (#52) — committed leaf = `H(ownerPubkey)`, so B3 builds to that
[**CL: confirm #52's ratification tier**]. **Recommendation:** per-leaf-drop for
leaf-level malformedness (drop only the bad leaf; Σ gᵢ over the surviving
committed set), keeping fee / DA-deadline whole-batch. The C5 ruling is makeable
now — a decision-ready packet already exists in
[`B2_SPEC_PR_PACKETS.md`](./B2_SPEC_PR_PACKETS.md) (PR-2); only the concrete
served-bytes / leaf *bytes* are B3-gated. Ripple: the served-bytes witness shape
(E-SB2) and the resolver's serving granularity.

### §5.2 Model A vs Model B convergence — **ratify Model B**
The repo carries two convergence models; the design note already recommends
picking the leaderless merge (B) and retiring the single-leader rail (A).
**Recommendation:** ratify Model B as canonical (E-CV1), retire Model A to
quarantine. Low-risk: B's convergence guarantee is already proven in sim.

### §5.3 Completeness-witness format + soft-close range (T2-neg-02)
The concrete verifier-checkable completeness-witness format and the lot's
block/soft-close range semantics are unspecified (the sole vector B2 deferred to
B3). **Recommendation:** define the range as a closed block interval pinned by
the anchor, with the witness enumerating the counted-bid txids provably within
it; resolve hide-then-reveal (E-CW3) by the interval boundary, not retroactive
decertification. Needs a named spec PR before E-CW1/E-CW3 can be law.

## §6 — Mining map (existing code → deliverable)

Old code is mined for vectors + documenting tests only (quarantine rules).

| Existing | Mineable into |
| --- | --- |
| `packages/bitcoin` (Merkle+PoW verifier, ~2.3k LOC, tested vs mainnet block) | D-BI — harden + close the `bitcoinInclusion` emit gap (E-BI3) |
| `@ont/protocol/accumulator-membership.ts` (`verifyAccumulatorMembership`) | D-AM — already the membership primitive; build the construction side |
| `packages/core/src/research/{delta-merge-sim,da-convergence-sim}.ts` + tests | D-CV — productionize Model B; the convergence property test exists |
| `apps/resolver` `runBatchRail`/`mergeBlock` path | D-CV — the canonical-root derivation the resolver never wired (B4 consumes it) |
| `@ont/consensus/proof-bundle.ts` `verifyProofBundleStructure` | D-PB — the structural contract B3 assembles to |
| `recovery-descriptor.ts` (B1 descriptor digest) + `docs/research/RECOVERY_EVIDENCE_TIMING.md` | D-RC — descriptor-head witness; B2 `acceptRecoverOwner` is the decider |

## §7 — Carry-forwards

- **T2-neg-02** (auction soft-close completeness range): the one required
  conformance vector B2 deferred. Lands here via §5.3 + E-CW1/E-CW3.
- **`bitcoinInclusion` emit gap** (STATUS "Prototype"): closed by E-BI3.
- **`batch-rail.ts` re-key to bond-opens (#37) trigger** before the resolver
  consumes it (B2 carry-forward).
