# B3 evidence-layer hardening — steps 1–2: rule extraction and source check

> **Status: DECOMPOSITION SIGNED OFF (ChatLunatique, rev 5 `e98460c`,
> 2026-06-15). rev 6 = freeze: 3 non-blocking source-hygiene fixes folded.**
> Steps 1–2 (invariant extraction + source check) for the L3 evidence layer.
> Decomposition: B3 is witness construction. Parked-decision docket (§5): the
> `g(name)` launch-freeze parameter, and — newly surfaced by D-SB — the §6c
> first-servable-height attribution (§5.2), the first genuine new-consensus-law
> item B3 has raised. See §8 for the review record.
> Branch `clean-build-b3`, stacked on `main` @ the B2 buildable-complete merge
> (`03495bd`). Produced 2026-06-15 on DK's "continue the adversarial build
> process" greenlight (event `d031752d`). Steps-1–2 output for the L3 evidence
> layer (future `@ont/evidence`), in the form of
> [`B1_WIRE_HARDENING.md`](./B1_WIRE_HARDENING.md) /
> [`B2_KERNEL_HARDENING.md`](./B2_KERNEL_HARDENING.md).
>
> **The headline (rev 4, amended rev 6+): B3 is mostly ratified-construction, with
> ONE open consensus decision (D-SB-avail, §5.2).** Round 2 established that the
> rules I had parked as "DK decisions" were already **ratified law** — #51–#56
> (PR-1/2/3/4/16/23) and the **#66 spec-PR-matrix ratification of PR-5..36**. So most
> of B3 is *pure construction*: produce and cryptographically verify witnesses that
> **conform to** the ratified rules, plus their concrete byte layouts (themselves B3
> deliverables, DK-ratified at promotion, as the B1 wire format was). Those
> deliverables are **FREE** (buildable now). **Exception:** D-SB-avail — the
> first-servable-HEIGHT attribution (§6c) — is **GATED on a DK consensus decision**
> (§5.2); its sibling D-SB-bind (content binding) is FREE and built. The other
> non-construction item is the `g(name)` gate-fee *schedule*, a launch-freeze
> parameter (§5.1). Nothing here is normative until its per-section promotion is
> ratified.

## §0 — Purpose / scope / tests (the required component statement)

- **Purpose.** Construct and **cryptographically verify** the evidence the B2
  ownership kernel consumes — turning "the publisher says so" into "anyone can
  check it." B3 decides nothing; it witnesses.
- **Scope (in).** Bitcoin inclusion verification (D-BI), accumulator
  membership-proof construction (D-AM), proof-bundle structural assembly (D-PB),
  recovery descriptor-head witness (D-RC), bond-continuity / release-fact
  witnessing (D-BC), the served-bytes witness + its concrete byte layout (D-SB),
  the completeness witness + range (D-CW), canonical-root derivation (D-CV), and
  the gate-fee *fact* witness (D-GF). All conform to ratified rules (§2).
- **Scope (out).** No ownership decisions (kernel); no adapters (B4); no surfaces
  (B5); and **not** the `g(name)` fee-schedule numbers (launch-freeze, §5).
- **Tests.** The gate is adversarial (§4): the convergence battery + a
  hostile-evidence battery, run as production tests **against the real B2
  kernel** — forged evidence must equal the no-witness (fail-closed) case.

## §1 — The defining contract: B3 is NON-DECIDING

- **EV is a witness, not a callback.** The kernel consumes a verified witness
  **as data** and re-checks it itself (`da-verdict.ts` / `transcript-
  completeness.ts` encode this: opaque input object, never a handle/endpoint/bool).
- **The hostile-evidence property, precisely.** A swapped or buggy `@ont/evidence`
  can never make the kernel **accept** what it should reject — forged/invalid
  evidence cannot flip a verdict to a false accept. It *can* fail to produce a
  valid witness; then the kernel fails closed, which is the **correct** verdict.
  Missing valid evidence can absolutely turn an otherwise-accepting path to reject
  — that is the design, not a regression. The bar (§4.2): forged evidence ≡ the
  no-witness, fail-closed outcome.
- **Consequence.** The hostile-evidence battery (§4.2) is the primary B3
  deliverable — the executable proof of this contract.

## §2 — B3 deliverables, each conforming to ratified rules

All **FREE** (buildable now) **except D-SB-avail (GATED on the §5.2 DK decision)**.
"Conforms to" names the ratified rule the witness must satisfy; B3 supplies the
construction + concrete bytes, never a new rule.

| # | Deliverable | Feeds | Conforms to (ratified) |
| --- | --- | --- | --- |
| D-BI | Bitcoin header/inclusion verification (Merkle + PoW) + canonical-header-source pinning | `proof-bundle.ts` `verifyProofBundleAgainstBitcoin` | cited (BITCOIN_ANCHORED_NAME_ACCUMULATOR.md) |
| D-AM | Accumulator membership-proof construction | `verifyAccumulatorMembership` (`@ont/protocol`) | cited (accumulator doc) |
| D-PB | Proof-bundle structural assembly | `verifyProofBundleStructure` | structural |
| D-SB-bind | Served-bytes **content** binding: `prevRoot + servedDelta → newRoot` under batchSize | `da-verdict.ts` `ServedEvidence` (binding half) | **FREE** [#51 / #52 / #53; built] |
| D-SB-avail | Served-bytes **first-servable-HEIGHT** attribution (mints `VerifiedAvailabilityHeight`) | `da-verdict.ts` includable/holdsPriority | **GATED on DK** (§5.2 consensus-law) |
| D-RC | Recovery descriptor-evidence **timing** witness (given engine-resolved head/interval, attests `D` witnessed by `≤ h_r+W_r`; does **not** resolve the current head) | `recovery-invoke-authority.ts` §3c | **#50-b1 / §3c** |
| D-BC | Bond-continuity / release-fact witness (spend facts only; **no canonical release on tied facts**) | `reopen-resolution.ts` (release-height derivation + same-height tiebreak stay kernel) | **#56**; tiebreak **#70** |
| D-CW | Completeness witness + lot block/soft-close range | `transcript-completeness.ts` (T2) | **PR-19 / PR-29** (#66); concrete format = T2-neg-02 |
| D-CV | Canonical-root derivation (delta-merge) | `batch-exclusion.ts` | **#53** prevRoot=`R_{h−K}` + **#54** + **#55** + **PR-5 / PR-9** (#66) |
| D-GF | Gate-fee **fact** witness: prevout/intrinsic fee + Σ g over the **full committed set** | `gate-fee.ts` amount-adequacy conjunct | **#52** (Σ g full-set, per-leaf-drop); `g(name)` schedule = launch-freeze (§5) |
| (D-RB) | Recovery bond-spend / qualifying-successor chain-fact witness — **separate** from D-RC, engine-slice/B4-side | engine recovery integration | **PR-34** (#66); excluded from `acceptRecoverOwner` |

## §3 — Evidence-layer invariants (E-series) + source check

Tags resolve to **ratified** / **cited** (consensus law) or **[B3-impl-req]** (a
B3 implementation requirement that is *not* consensus law — e.g. closing a STATUS
gap); the work is construction + concrete bytes, DK-ratified at promotion.

### Bitcoin inclusion — D-BI
- **E-BI1 — PoW + Merkle inclusion (what the verifier proves today).** Header is
  80 bytes, meets its PoW target, and Merkle-commits the anchor txid. *[cited;
  `proof-bundle.ts:307-365`].* Test: tamper bits/nonce ⇒ reject; swap a sibling
  hash ⇒ reject.
- **E-BI2 — canonical-header-source pinning is a distinct obligation.** PoW +
  Merkle alone prove *work*, not *best-chain*; canonical pinning runs only when a
  `headerSource` is supplied (`proof-bundle.ts:355-363`). B3 must **supply the
  headerSource** so wrong-chain / orphan headers reject. *[cited].* Test:
  orphan-but-valid-PoW header ⇒ reject only with headerSource.
- **E-BI3 — producers MUST emit `bitcoinInclusion`.** Closes the STATUS gap.
  *[B3-impl-req — closes the STATUS `bitcoinInclusion` emit gap; not consensus law].*

### Accumulator membership — D-AM
- **E-AM1 — membership verifies against the anchored root** (`verifyAccumulator-
  Membership`). *[cited].* **E-AM2 — insertion-unique, commuting inserts.**
  *[cited].* **E-AM3 — non-membership / wrong-root fails.** *[cited].*

### Served-bytes witness — D-SB
- **E-SB1 — root reconstruction binds to the anchor.** Re-hash served leaves,
  reconstruct under `batchSize`, compare byte-identical to `anchoredRoot`; bound
  to THIS anchor. *[ratified: #49 S3/S4; #51 (i)].*
- **E-SB2 — independently verifiable, no submitter trust (#51).** The witness +
  confirmed-chain facts alone must determine a single first-servable height
  comparable to `h+W`; **no producer-attested height, no external I/O** (#51
  (ii)+(iii)). The concrete byte layout is the B3 deliverable. *[ratified: #51].*
  Required negative: a **forged independently-verifiable first-servable proof**
  (and any producer-attested servability) **rejects** — the "trust me, I saw it"
  kill.
- **E-SB3 — wrong-anchor binding fails closed.** *[ratified: #51 (i); D4].*
  **E-SB4 — withholding ⇒ no valid witness ⇒ fail closed.** *[cited: §6c].*
  **E-SB5 — no clock / receipt time / endpoint identity as authority.**
  *[ratified: #51 (iii); `da-verdict.ts` D3].*

### Recovery descriptor-head witness — D-RC
- **E-RC1 — descriptor-evidence TIMING witness (scope guard, CL r3).** Given the
  already-resolved current head / current interval (engine-supplied,
  `engine.ts:104-127,577-646`), B3 attests the descriptor record/digest `D` was
  witnessed by `≤ h_r+W_r`. B3 does **not** resolve which head/interval is
  current — the predicate checks the supplied facts
  (`recovery-invoke-authority.ts:158-240`). B2's `acceptRecoverOwner` consumes
  `{ kind: "b3-verified-recovery-descriptor-witness", witnessedByHeight }` and
  **remains the decider**; `h_r+W_r` is the whole descriptor-authorization
  deadline. *[ratified: #50-b1 / §3c].* (A later slice that resolves
  descriptor-chain head semantics is no longer this FREE slice.)
- **E-RC2 — fail closed** on late/absent/unverified evidence; a descriptor from
  an **old ownership interval** (R4) rejects. *[ratified: §3c].*
- **E-RC3 — §8.3 BIP322 wallet proof is non-authorizing corroboration.** No
  deadline; cannot block/substitute. *[cited].*
- *Note:* the R11 bond-spend / qualifying-successor / outpoint-conflict surface is
  **deliberately excluded from `acceptRecoverOwner`** (`recovery-invoke-
  authority.ts:34-40`), so it is **not** a second descriptor witness; it is a
  separate recovery chain-fact witness (D-RB), conforming to ratified PR-34.

### Bond-continuity / release facts — D-BC
- **E-BC1 — witness the Bitcoin-derived bond-spend / release facts only**; the
  latest-release-height **derivation + re-auction rule stay in the kernel**, and
  B3 **must not emit a canonical latest release when tied facts exist** — the
  same-height release tiebreak stays parked in `reopen-resolution` (#70).
  *[ratified: #56; #70].* Test: a fabricated release fact with no on-chain spend
  ⇒ rejected before the kernel sees it; tied same-height spends ⇒ B3 surfaces
  both, picks neither.

### Completeness witness — D-CW
- **E-CW1 — verifier-checkable completeness over a Bitcoin-derived range.** The
  counted-bid set is provably complete over the lot's block/soft-close range,
  range **derived from Bitcoin-witnessed heights**. The boundary semantics are
  ratified (PR-19 / PR-29, #66); the concrete witness format + range encoding is
  the B3 deliverable (T2-neg-02). *[ratified: PR-19/PR-29; format = B3].*
- **E-CW2 — producer-assertion is never trusted.** *[ratified: T2 / canon Item 4].*
- **E-CW3 — hide-then-reveal governed by the ratified range rule**, not
  retroactive decertification. *[ratified: PR-19/PR-29].*

### Canonical-root derivation — D-CV
*Conforms to ratified linkage/order rules; "Model B" (leaderless delta-merge) is
the ratified mechanism (#53 names delta-merge) — "retiring Model A" is a B3
implementation cleanup (mine the Model-B sim, quarantine the rest), not a
consensus decision.*
- **E-CV1 — `prevRoot` = K-deep confirmed root `R_{h−K}`** (delta-merge), not the
  tip; ineligible anchors consume no position; `prevRoot==newRoot` rejects.
  *[ratified: #53].*
- **E-CV2 — one valid RootAnchor per tx; same-block apply order
  `(height, tx-index, vout)`, skip-bad.** *[ratified: #54, #55].*
- **E-CV3 — earliest VALID anchor governs** the deadline clock + proof-bundle
  txid; post-exclusion re-anchor starts a fresh window. *[ratified: PR-5 (#66)].*
- **E-CV4 — reorg ⇒ re-derive from the current best chain**; no first-seen /
  old-chain height as authority. *[ratified: PR-9 (#66); #49 S1].* Test: witness
  valid pre-reorg whose anchor is reorged out re-derives to invalid.
- **E-CV5 — order-independent convergence** (same canonical root, any processing
  order); a malicious delta cannot unseat a finalized name. **This is a B3
  conformance obligation** productionized from the sim — distinct from #53, which
  ratifies the delta-merge *linkage/envelope*. *[cited: convergence doc; proven
  in `da-convergence-sim.test.ts`].* Test (§4.1).
- **E-CV6 — contested-claim policy consumes `runBatchRail`, not raw
  `mergeBlock`.** The merge primitive is not the contested-claims policy; the
  kernel's notice-window decides contests. B3 surfaces the merge; it never
  resolves a contest. *[cited: convergence doc].*

### Gate-fee fact witness — D-GF
- **E-GF1 — prevout/intrinsic-fee witness + Σ g over the FULL committed leaf
  set.** B3 witnesses the actual tx fee and reconciles it against the full
  committed set (**dropped leaves still count in Σ g**, #52); a leaf-level
  malformed leaf drops only itself (#52). The `g(name)` *schedule* (the amount
  basis) is launch-freeze (§5). *[ratified: #52].* Negative: a **self-declared Σ
  g** not derived from committed leaves rejects; missing prevout fee witness ⇒
  fail closed.

### Cross-cutting (the §1 contract)
- **E-ND1 — swapping evidence cannot make the kernel accept.** Forged evidence
  yields the same **acceptance/ownership effect** as no-witness (`valid === false`,
  no false accept, no state movement); the *diagnostics* (failed check IDs) may
  legitimately differ and should stay useful. Missing valid evidence may reject —
  by design. *[ratified: canon B3 gate].* Test: §4.2.
- **E-ND2 — zero ownership logic in B3** (quarantine-style import + surface test).
  *[ratified: canon L3].*
- **E-ND3 — transport affects liveness, not integrity** ("trust me, I saw it" is
  a bug). *[ratified: §1; `da-verdict.ts` S4].*
- **E-ND4 — reorg ⇒ re-derive from current-chain mined heights.** *[ratified:
  PR-9; #49 S1].*

## §4 — The adversarial gate

### §4.1 Convergence attack battery (vs the B2 kernel)
1. **Withholding** ⇒ fail closed (E-SB4). 2. **Hide-then-reveal** ⇒ no
retroactive priority/decertification (E-SB4 / E-CW3). 3. **Multi-publisher merge**
⇒ one canonical root; a malicious delta cannot unseat a finalized name (E-CV5).

### §4.2 Hostile-evidence battery (forged ≡ no-witness, fail-closed)
- forged independently-verifiable `firstServableHeight` / producer-attested
  servability;
- wrong-chain / orphan block header (with headerSource);
- stale pre-reorg anchor height;
- missing prevout fee witness; self-declared Σ g;
- recovery descriptor evidence from an **old ownership interval**;
- fabricated bond-break / release fact with no on-chain spend.

### §4.3 Scale
Measure issuance throughput / proof sizes; update **R11** in
[RISKS.md](../RISKS.md). *(Numbers, not a correctness gate.)*

## §5 — Parked-decision docket

The #51–#56 ratifications + the #66 spec-PR matrix cleared the *binding* docket,
but D-SB surfaced one genuinely new consensus question (§5.2). Two items:

### §5.1 `g(name)` gate-fee schedule (launch-freeze)
B2 left the fee-amount adequacy basis (the `g(name)` schedule numbers, `fee ≥ Σ g`)
to downstream (`gate-fee.ts`; DECISIONS #62; return-queue F1/F2/F3). These are
**launch-freeze parameters**, not B3 consensus rules: B3 supplies the witnessed fee
*fact* (D-GF / E-GF1, conforming to #52's full-committed-set basis); the *numbers*
freeze with the other launch parameters (W/C/K, `W_r`, bond curve). **Rec:** route
`g(name)` to the launch-parameter freeze; do not block B3 construction on it.

### §5.2 D-SB-avail — first-servable-height attribution (§6c) — **NEW; DK consensus-law**
**Mini-design (design-first, per CL r-on-b89c8df). The first genuine new-consensus-
law item B3 has surfaced.** Full decision-ready paper for DK:
[`docs/research/DA_AVAILABILITY_HEIGHT.md`](../research/DA_AVAILABILITY_HEIGHT.md)
(proposed name `availability-height`). Summary below.

*The question.* D-SB-bind binds the served-bytes **content** (bytes → anchored
commitment under `prevRoot→newRoot`). The kernel's `includable` (≤ `h+W+C`) /
`holdsPriority` (≤ `h+W`) then consume a `firstServableHeight`. What confirmed-chain
fact mints a `VerifiedAvailabilityHeight` — independently verifiable from the witness
+ confirmed chain, never producer-attested (#51 (iii))?

*Classification: NOT pure B3 bytes — a DK consensus decision.* The witness **content
format** is a ratified B3 deliverable (DA §6e S4: "format = B3 deliverable") and is
built (D-SB-bind). But the **height attribution** is consensus-law, because:
- availability is **not positively provable** in general — DA §6c / §88–89: "you can
  show bytes *are* available; you can never prove it *isn't*." The mechanism is a
  *fail-closed challenge*, not a cryptographic timestamp.
- §6d needs a **per-batch served height** (a batch first served in `(h+W, h+W+C]` is
  includable but **forfeits priority**), so a pure "available-at-anchor" default is
  insufficient — the late-served height must be observably established.
- the concrete §6c challenge mechanism is **"working direction, open for challenge"**
  (DA §258, approach T2) — *not* ratified bytes.
- per the canon boundary rule, a rule that sets which batches are eligible / hold
  priority is **kernel law**, not evidence construction.

*Candidate confirmed-chain facts / options (for DK):*
- **O1 — fail-closed over the presented content witness; challenge is diagnostic
  only.** `firstServableHeight = h` for any batch whose **presented** verified
  content witness (D-SB-bind) reconstructs the anchored commitment; absent that
  witness, fail closed. A challenge event is **fault-attribution / diagnostic only,
  never a deciding event** — a unilateral "nobody can back this" is the rejected
  bonded-attestation shape in new clothes (§215) and could censor a valid batch (CL
  finding 3), and "absence of a confirmed exclusion" can't be relied on without
  chain-range completeness + duplicate/ordering rules. So the verdict rests on
  presented content, not on exclusion. *Gap:* `h` collapses the §6e S3 late-served
  branch for the batched path (see the amendment note in the rec).
- **O2 — positive availability attestation at a height.** A confirmed event records
  "bytes served by height X" → `firstServableHeight = X`, capturing the §6d late case.
  *Gap:* needs a poster-authorization / sybil model (§215 cautions on attestation).
- **O3 — direct-L1 settlement for contested (Approach A, §6d) over O1 for the long
  tail.** Contested marquee names settle full-data-on-L1 (no DA height problem);
  the batched tail uses O1's fail-closed default.

*Recommendation (DK rules):* **O1 + O3, stated as a consensus amendment.** Verdict
fail-closed over the presented content witness (O1, `firstServableHeight = h`),
priority-bearing contention routed to bonded/direct-L1 (O3). Keeps
`VerifiedAvailabilityHeight` a function of confirmed-chain facts (#51 (iii)) and
honours §6c/§88–89 + §215.
- **Amendment (CL finding 2):** O1 collapses `firstServableHeight` to `h` for
  non-faulted batched claims, which **drops the §6e S3 late-served branch
  (`(h+W, h+W+C]` includable-but-no-priority) for the accumulator path.** Acceptable
  *only because* O3 routes the priority race to L1. **If DK wants the long-tail
  batched path itself to preserve late-served priority, O2 (a positive on-chain
  timestamp) is forced instead** — naming this fork for DK.
- **Guard (CL finding 4 — #37 / #69):** a late/withheld cheap batched claim that is
  not DA-valid under the chosen rule must **not** open an auction (#37) or nullify
  (#69 notice-window); qualifying bonds / direct-L1 are the only priority-bearing
  path, so O1+O3 leaves no cheap hidden-collision grief.

The spec work DK would ratify: the `firstServableHeight` derivation rule (O1's
present-content-witness verdict) + whether the challenge stays diagnostic only or
becomes a rebuttable mechanism with exact response/range/reorg rules.

*Ripple / status:* until DK rules, **D-SB-avail cannot mint
`VerifiedAvailabilityHeight`**; D-SB-bind (content binding) stands and the kernel
verdicts already consume the height (ratified #49). This is drafted decision-ready;
**not** agent-decided. Pending CL's adversarial pass on this classification before it
goes to DK.

## §6 — Mining map (existing code → deliverable)
| Existing | Mineable into |
| --- | --- |
| `packages/bitcoin` (Merkle+PoW verifier, tested vs mainnet) | D-BI — harden; supply headerSource (E-BI2); close emit gap (E-BI3) |
| `@ont/protocol/accumulator-membership.ts` | D-AM |
| `packages/core/src/research/{delta-merge-sim,da-convergence-sim}.ts` + tests | D-CV — productionize the ratified delta-merge; quarantine Model A |
| `apps/resolver` `runBatchRail`/`mergeBlock` | D-CV — canonical-root derivation the resolver never wired |
| `@ont/consensus/proof-bundle.ts` | D-PB |
| `recovery-descriptor.ts` (B1) + `docs/research/RECOVERY_EVIDENCE_TIMING.md` | D-RC |
| `gate-fee.ts` + fee-fact-eligibility (#81) | D-GF (schedule is launch-freeze, §5) |

## §7 — Carry-forwards
- **T2-neg-02** (soft-close completeness range): the one required vector B2
  deferred — lands via D-CW (conform to ratified PR-19/PR-29; format is B3).
- **`bitcoinInclusion` emit gap** (STATUS "Prototype"): closed by E-BI3.
- **`batch-rail.ts` re-key to bond-opens (#37)** before the resolver consumes it.

## §8 — Review record
- **Round 1 (CL, `65750eb`).** 4 decomposition blockers + 2 edits → rev 2/3:
  D-RC added; gate-fee D-GF added; D-CV/reopen mis-trace split out as D-BC; §1
  wording fixed; FREE/GATED split introduced.
- **Round 2 (CL, `2dee8a1`).** Established the rulings I had parked are **already
  ratified**: #51 served-evidence-interface (PR-1), #52 commitment-match (PR-2:
  leaf=`H(ownerPubkey)`, per-leaf-drop, Σ g over full set), #53 root-chain-linkage
  (PR-3), #55 same-block-order (PR-16), and the #66 ratification of PR-5..36
  (incl. PR-5 earliest-valid, PR-9 reorg, PR-34 recovery bond-spend). Rev 4:
  collapsed every GATED item to FREE-conforming-to-ratified-rule; deleted the §5
  decision docket down to the lone `g(name)` launch-freeze parameter; fixed
  E-BI1 (split canonical-header-source into E-BI2); retagged E-SB to #51 with the
  forge-the-verifiable-proof negative; clarified R11 is excluded from D-RC.
- **Round 3 (CL, `5d42993`).** "Right architecture"; narrowed to the #52 §5.1
  reopen (already fixed in rev 4) + two FREE-classification guards → rev 5: D-RC
  reworded to a **timing** witness given engine-resolved head/interval (E-RC1);
  D-BC must not emit a canonical release on **tied** same-height facts (E-BC1,
  #70). CL cleared the first FREE slice (D-BI / D-AM) to start.
- **Sign-off (CL, rev 5 `e98460c`).** Decomposition **signed**: B3 is witness
  construction, no open DK consensus docket beyond `g(name)`; delta-merge⇒Model-B
  read confirmed (no Model-A/B decision remains; "retire Model A" = cleanup). rev
  6 freeze folds 3 non-blocking edits: E-BI3 retagged `[B3-impl-req]` (+ §3 tag
  key); E-CV5/E-CV6 sharpen the #53-linkage vs B3-convergence-obligation split and
  restore the `runBatchRail`-not-`mergeBlock` guard; E-ND1 + §9 hostile comparison
  assert **acceptance-effect equivalence** (`valid===false`, no false accept, no
  state movement), not byte-identical diagnostics.

## §9 — First FREE slice: D-BI / D-AM conformance-suite design

Tests-first, per CL's round-3 lead cases. New package `@ont/evidence` (L3,
non-deciding); the suite instantiates against the real `@ont/consensus` verdicts
so a hostile evidence impl is provably unable to move them (E-ND1).

- **D-BI — Bitcoin inclusion.**
  - `btc.pow`: a header with bad bits/nonce ⇒ fail (E-BI1).
  - `btc.merkle`: a swapped sibling hash in the path ⇒ fail (E-BI1).
  - `btc.structure-vs-against-bitcoin`: a bundle missing `bitcoinInclusion` is
    structurally valid but not Bitcoin-settled (E-BI3) — assert the two-tier
    `verifyProofBundleStructure` vs `…AgainstBitcoin` distinction.
  - `btc.canonical`: with a `headerSource` supplied, a valid-PoW **orphan** header
    that is not the canonical header at its height ⇒ fail; without `headerSource`,
    canonical pinning is not asserted (E-BI2).
- **D-AM — accumulator membership.**
  - `am.wrong-root`: membership proof against a sibling root ⇒ fail (E-AM3).
  - `am.non-membership`: proof for a name not in the root ⇒ fail (E-AM3).
  - `am.malformed`: a structurally malformed proof ⇒ fail closed, never throw.
- **Hostile-evidence comparison (E-ND1).** For each forged D-BI / D-AM witness,
  assert the same **acceptance/ownership effect** as the no-witness case
  (`valid === false`, no false accept, no state movement) — **not** byte-identical
  reports: `verifyProofBundleAgainstBitcoin` / membership checks may return
  different failed check IDs, and those diagnostics should stay useful. This is
  the executable form of the §1 contract.

## §10 — Second FREE slice: D-CV canonical-root derivation design

Design-first (per CL's `b89c8df` directive). **Classification: FREE** — every E-CV
invariant (§3) cites a ratified rule (#53 delta-merge linkage; #54/#55 anchor order;
PR-5 / PR-9 via #66) or the convergence-doc conformance obligation (E-CV5 / E-CV6). **No
new consensus law** — the one decision-adjacent line is fenced by E-CV6 and flagged below.

**What it productionizes (mining map §6).** The ratified "Model B" leaderless delta-merge:
`packages/core/src/research/delta-merge-sim.ts` (binary sparse-Merkle tree keyed by
`H(name)`, incremental insert) + `da-convergence-sim.ts` (`mergeBlock` /
`confirmedStateForNode` / `convergenceReport`, commit-priority ordering, `DaWindows`). The
Model-A (sequencer / leader) paths are **quarantined, not productionized** — #53 names
delta-merge as the mechanism. The resolver's `runBatchRail` / `mergeBlock` was **never wired**
(§6); the sim is the source of truth.

**Surface it adds — and what it composes with.** `@ont/consensus` already has
`deriveBatchedInsertions` (`batch-exclusion.ts`): the pure per-name *insertion provenance*
projection (excluded batches removed, prior-final names preserved-never-unseated, fail-closed,
sorted-deterministic). That is the exclusion-locality / preservation half (E-CV2 skip-bad +
E-CV5 "a malicious delta cannot unseat a finalized name"). D-CV adds the **root-derivation**
half on top: a pure `deriveCanonicalRoot(prevRoot, insertions) → { newRoot, derived, reason }`
that folds the provenance into one deterministic SMT root. Pure / total over witnessed +
current-chain inputs — no I/O, no `Date` / `Math.random` (the `@ont/consensus` purity gate, the
same one the b2 vector suite enforces).

**Base-root provisioning (CL's framing — D-SB-bind's "verified base state / root snapshot").**
D-CV pins `prevRoot = R_{h−K}`: the canonical root *after* applying every **valid** RootAnchor
up to and including height `h−K`, in `(height, tx-index, vout)` order, skip-bad
(E-CV1 / E-CV2 / E-CV3). So `R_{h−K}` is itself a `deriveCanonicalRoot` fixpoint over the
K-deep-confirmed prefix — exactly the base snapshot D-SB-bind binds the served delta against
(`prevRoot + servedDelta → newRoot`). D-CV is therefore the slice that pins how that base is
derived / provisioned.

**Tests-first red battery** (instantiated against the resident verdicts so a hostile merge
cannot move them, E-ND1):
- `cv.prevroot-k-deep`: `prevRoot` must be `R_{h−K}`, not the tip; a tip-root input ⇒ fail (E-CV1).
- `cv.no-op-anchor`: `prevRoot == newRoot` (empty / no-effect anchor) ⇒ reject (E-CV1).
- `cv.same-block-order`: two same-block RootAnchors apply in `(height, tx-index, vout)` order;
  reordering the inputs yields the **same** root; an invalid one is skipped, not fatal (E-CV2).
- `cv.earliest-valid-governs`: the earliest VALID anchor governs the deadline clock + bundle
  txid; a post-exclusion re-anchor starts a fresh window (E-CV3).
- `cv.reorg-rederive`: a delta valid pre-reorg whose anchor is reorged out re-derives to
  **excluded**; no first-seen / old-chain height as authority (E-CV4).
- `cv.commute`: order-independent convergence — the same canonical root for any processing
  order of distinct-leaf deltas; a malicious delta cannot unseat a finalized name (E-CV5; the
  sim's commutativity + miner-reorder-immunity properties).
- `cv.no-contest-decision` **(the anti-overreach guard, E-CV6).** Two competing
  **distinct-owner** deltas for the same name produce a **contested provenance** the kernel
  notice-window consumes — D-CV surfaces the merge + provenance and **never** declares a
  contest winner.
- `cv.malformed`: a malformed delta / base ⇒ fail closed (`derived:false`), never throws.

**The one decision-adjacent line — flagged for CL's adversarial pass.** The sim's `mergeBlock`
resolves same-name conflicts "by Bitcoin commit priority." Is commit-priority part of the
*canonical-root derivation* (deterministic, allowed in B3) or the *contested-claim decision*
(kernel-only, E-CV6)? My read: commit-priority may order **which delta occupies an SMT leaf** to
get a deterministic root + provenance, but it must **not** decide **ownership** of a contested
name — the notice-window does. So D-CV may use commit-priority to derive a deterministic root
and emit `contested` provenance, but must not declare an owner. This is the single place B3
could smuggle a consensus decision; confirm the boundary before the red→green slice.
