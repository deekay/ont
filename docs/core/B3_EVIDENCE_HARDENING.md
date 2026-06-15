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
> **The headline (rev 4, amended rev 6+; D-SB-avail RESOLVED 2026-06-15): B3 is
> ratified-construction — the one open consensus decision (D-SB-avail, §5.2) is now
> RATIFIED as #84 availability-height (O1+O3).** Round 2 established that the
> rules I had parked as "DK decisions" were already **ratified law** — #51–#56
> (PR-1/2/3/4/16/23) and the **#66 spec-PR-matrix ratification of PR-5..36**. So most
> of B3 is *pure construction*: produce and cryptographically verify witnesses that
> **conform to** the ratified rules, plus their concrete byte layouts (themselves B3
> deliverables, DK-ratified at promotion, as the B1 wire format was). Those
> deliverables are **FREE** (buildable now). **Former exception now resolved:**
> D-SB-avail — the first-servable-HEIGHT attribution (§6c) — was GATED on a DK
> consensus decision; **DK ratified `availability-height` (#84) as O1+O3**, so it is
> now FREE/buildable too (§5.2 verifier contract). The only remaining
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

All **FREE** (buildable now) — D-SB-avail's former gate (§5.2) is RATIFIED as #84.
"Conforms to" names the ratified rule the witness must satisfy; B3 supplies the
construction + concrete bytes, never a new rule.

| # | Deliverable | Feeds | Conforms to (ratified) |
| --- | --- | --- | --- |
| D-BI | Bitcoin header/inclusion verification (Merkle + PoW) + canonical-header-source pinning | `proof-bundle.ts` `verifyProofBundleAgainstBitcoin` | cited (BITCOIN_ANCHORED_NAME_ACCUMULATOR.md) |
| D-AM | Accumulator membership-proof construction | `verifyAccumulatorMembership` (`@ont/protocol`) | cited (accumulator doc) |
| D-PB | Proof-bundle structural assembly | `verifyProofBundleStructure` | structural |
| D-SB-bind | Served-bytes **content** binding: `prevRoot + servedDelta → newRoot` under batchSize | `da-verdict.ts` `ServedEvidence` (binding half) | **FREE** [#51 / #52 / #53; built] |
| D-SB-avail | Served-bytes **first-servable-HEIGHT** attribution (mints `VerifiedAvailabilityHeight`) | `da-verdict.ts` includable/holdsPriority | **FREE** [#84 availability-height O1+O3; §5.2 contract] |
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

### §5.2 D-SB-avail — first-servable-height attribution (§6c) — **RATIFIED #84 availability-height (O1+O3); now FREE/buildable**
**RESOLVED.** DK ratified `availability-height` (#84) as **O1 + O3** (event 4e11b64b,
2026-06-15). The mini-design below is preserved as the decision record; the **verifier
contract this slice builds** is stated immediately after it. Full paper:
[`docs/research/DA_AVAILABILITY_HEIGHT.md`](../research/DA_AVAILABILITY_HEIGHT.md);
DECISIONS #84.

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

*Ripple / status:* **RATIFIED #84 (O1+O3) — D-SB-avail may now mint
`VerifiedAvailabilityHeight`.** D-SB-bind (content binding) stands and the kernel
verdicts already consume the height (ratified #49).

#### Verifier contract (the slice this builds)

Per O1, `firstServableHeight = h` (the anchor's **confirmed mined height**), gated on
the **presented** content witness reconstructing the anchored commitment; absent that,
fail closed. Per the O1 amendment, the height **always collapses to `h`** for a
non-faulted batched claim — there is **no late-served `(h+W, h+W+C]` height** for the
accumulator path (priority races route to L1, O3). The height is never producer-
attested (#51 (iii)); it is the confirmed mined height tied to the same anchor the
presented bytes reconstruct.

`verifyAvailabilityHeight({ baseLeaves, servedDelta, binding, confirmedAnchorMinedHeight })`
→ `{ bound, firstServableHeight: VerifiedAvailabilityHeight }`:
1. **Reconstruction (O1 fail-closed over presented bytes):** runs `bindServedBytes`
   (D-SB-bind) — throws if the presented base+delta do not reconstruct `anchoredRoot`
   (incomplete / extra / hidden / non-insert-only / stale prevRoot).
2. **Height provenance (no producer attestation):** `confirmedAnchorMinedHeight` is the
   confirmed-chain mined height (sourced from a verified D-BI bitcoin inclusion); it
   must be a non-negative integer **and equal `binding.anchorHeight`**, so the stamped
   height is the confirmed mined height of the very anchor the bytes reconstruct.
3. **Mint (O1):** `firstServableHeight = confirmedAnchorMinedHeight` as the branded
   `VerifiedAvailabilityHeight`. Only this path mints it; a bare number cannot reach
   `toServedEvidence`.

Conformance (E-AV battery): E-AV1 presented-bytes-reconstruct → mints `h`, and the
kernel reads includable + holdsPriority; E-AV2 bytes do not reconstruct (missing /
extra / wrong root) → fail closed, no mint; E-AV3 height provenance — a confirmed
height disagreeing with the binding anchor (a producer-attested height) → fail closed;
E-AV4 O1 collapse — the minted height is exactly `h`, never a presentation time.

*Design point (RESOLVED, CL design review on `724fcae`):* the confirmed mined height
enters as a validated number documented as D-BI/D-PB-sourced, with an
`=== binding.anchorHeight` provenance gate. **CL accepted this minimal verified-height-
fact contract** and explicitly ruled *against* consuming the raw `BuiltBitcoinInclusion`
object here: that shape is proof *material*, not a branded verified-inclusion result, so
passing it in would look tighter without itself proving PoW / Merkle / canonical-chain.
The honest split: D-BI / D-PB verify Bitcoin inclusion and establish the confirmed
mined-height fact; D-SB-avail consumes that already-verified height. Replacing the raw
number with a branded verified-anchor-height object is left as a **D-PB assembly
tightening** (typing/coupling), not a slice-3 correctness concern. **Deferred** past the
§11 assembly slice (CL design review on `4c0e3fd`) to a named follow-up — *branded
verified-anchor-height coupling* — so D-SB-avail stays closed; §11 D-PB is assembly-only
and gates the anchor height/txid against the embedded D-BI inclusion instead.

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

**Boundary RESOLVED + red battery AUTHORED (CL D-CV confirm).** CL confirmed: deterministic
ordering is allowed; ownership selection is not (#37 rejects height/txid priority as an
acquisition winner; #69 counts only distinct-owner DA-valid priority-bearing claims). So for a
distinct-owner same-leaf collision D-CV emits a canonical `contested-no-owner` representation —
neither owner value enters the SMT; same-owner duplicates coalesce; batch-local duplicates fail
closed; DA-excluded / non-priority leaves are skipped with no contest / nullify effect. To stop
**winner leakage** the disposition is COMPUTED from the actual grouping and cross-checked against
the projection's claimed `duplicateHandling`; a contradiction fails closed. D-CV **consumes** the
locked #83 closed projection (`DcvClosedLeafProjection`) — it does not re-define leaf key/name,
owner identity/binding, anchor coords, batch-id/duplicate handling, DA verdict, or base relation.
`deriveCanonicalRoot(input) → { derived, newRoot, leaves, reason }` (`batch-exclusion.ts`).

The §6c deadline-clock / `cv.earliest-valid-governs` windows aspect is **scoped out** to da-windows
(#49) — D-CV owns the canonical root + provenance, not the timing; `cv.same-block-order` folds into
`cv.commute` (order-independence). CL agreed the deadline-clock stays outside D-CV but ruled base
exactness + duplicate/value coherence ARE on this surface (review round 1):
- **Exact base horizon, per included priority leaf.** `base.baseRootHeight === minedHeight - K`
  (matches #83's exact relation and the pinned D-SB-bind snapshot) — a too-recent OR too-old base
  fails closed (`<= h-K` would re-admit already-K-deep anchors, a design change we are NOT making).
  The exactness is checked for EACH included priority leaf, not once against the first/min anchor
  height (CL r2): a multi-leaf input mixing anchor heights (e.g. one leaf at 110, another at 111,
  under a single 104 base) is malformed for this surface and fails closed.
- **Contest preserves the signal.** A contest-only delta derives with `contested-no-owner` provenance
  and `newRoot === prevRoot`; it must NOT collapse to `dcv-no-op` (that would erase the nullify/reopen
  signal). `dcv-no-op` fires only when nothing inserted AND nothing contested.
- **Value/binding coherence.** `leaf.valueHex === projection.ownerValueBindingHex` (D-CV must not fold
  one value while the provenance binds another); same-owner duplicates with a conflicting value fail
  closed; a duplicate base key fails closed (no silent `Map` overwrite).
- **Duplicate-handling both directions + non-priority.** Claimed `unique` for a real collision AND
  claimed `distinct-owner-contested` for a real unique (a false-contest denial vector) both fail
  closed; an includable-but-`holdsPriority:false` duplicate is skipped with no nullify (#69 counts only
  priority-bearing claims, not only `excluded`).
- **Deterministic provenance.** `leafKeyHex = H(name)` is NOT recomputed, so a same-key bucket carrying
  more than one distinct `name` would make the returned provenance order-dependent — it fails closed
  (CL green-review). `K >= 0` (negative confirmation depth is malformed); the batch-local-duplicate key
  is a structured `JSON.stringify([batchId, leafKeyHex])` (no separator-collision / NUL).

cv.* battery (24, GREEN — `deriveCanonicalRoot` implemented; CL red-OK on `2dfc29b` + green review):
`derives-canonical-root` · `prevroot-k-deep` ·
`base-too-old` · `mixed-anchor-height-base-exactness` · `base-root-binding` · `duplicate-base-key` ·
`negative-K` · `no-op-anchor` · `commute` ·
`no-contest-decision` · `no-contest-only-no-op` (contest-only ⇒ derive, not no-op) ·
`winner-leakage-guard` · `false-contest-claim` · `same-owner-coalesce` · `same-owner-conflicting-value`
· `value-binding-mismatch` · `same-key-name-mismatch` (order-independent reject) ·
`excluded-duplicate-no-nullify` · `non-priority-no-nullify` ·
`reorg-rederive` · `stale-base` · `insert-only` · `batch-local-duplicate` · `malformed`.

## §11 — Third FREE slice: D-PB proof-bundle assembly design

Design-first → **OK'd by CL (design review on `4c0e3fd`)** with the tightenings folded below.
**Classification: FREE / structural** — the proof-bundle SHAPE is fixed by the resident
verifiers `verifyProofBundleStructure` + `verifyProofBundleAgainstBitcoin`
(`@ont/consensus`, `proof-bundle.ts`); D-PB supplies the construction that produces a
`proofSource: "accumulator_batch_claim"` bundle they accept. It introduces **no new rule** and
decides nothing — the BUILDER half of the proof bundle. DK confirmed this as the next slice
(option 2, after the B3-green milestone); CL concurred.

**What it builds.** `buildAccumulatorBatchClaimBundle(input) → OntProofBundle` in `@ont/evidence`
(L3), assembling a bundle from already-built sub-witnesses:
- D-AM `BuiltMembershipProof` (`{rootHex, proof:{keyHex,value,siblings[]}}`) →
  `accumulatorProof {root, leaf, value, siblings[]}`.
- the cited batch anchor `{anchorTxid, anchorHeight}` → `batchAnchor`, plus an **optional** D-BI
  `BuiltBitcoinInclusion` → `bitcoinInclusion.anchors[]` (present → Bitcoin-settled; absent →
  structure-only).
- ownership + an optional already-signed value-record chain → `ownershipProof
  {currentOwnerPubkey, ownershipRef}` and `valueRecordChain.records[]` (D-PB attaches each
  `recordHash`; sequence + `previousRecordHash` linkage).
- fixed envelope: `format:"ont-proof-bundle"`, `bundleVersion:0`, `proofSource`, `name`,
  `normalizedName`, `assuranceTier`, `verificationGoal`.

**Composition stance (CL ruling — consume verified facts, don't re-derive; no self-verify).**
D-PB takes the OUTPUTS of D-AM / D-BI and assembles them; it does NOT re-run PoW / Merkle /
membership and does NOT call the verifier. Its correctness obligation is exactly *"assembles a
bundle the resident verifier accepts,"* asserted by running `verifyProofBundleStructure` +
`verifyProofBundleAgainstBitcoin` over the built bundle in the tests.

**Binding obligations the builder fails closed on (the cheap assembly coherence).**
- `membership.proof.keyHex === H(normalizedName)` (`sha256(utf8(normalizedName))`) — the embedded
  membership proof must be the proof for this name; a proof for a different key cannot be
  assembled into this name's bundle.
- membership value is non-null and `=== currentOwnerPubkey` — the value the proof commits to is
  the claimed owner (the no-false-accept gate).
- **anchor coherence (CL fix): when an inclusion is embedded, `batchAnchor.anchorTxid` AND
  `batchAnchor.anchorHeight` must BOTH match it** — the structure check only requires
  `anchorHeight` to exist, and against-Bitcoin cites the anchor by txid, so a wrong height would
  otherwise slip.
- value records: each record's `ownerPubkey` / `ownershipRef` match the ownership facts, the
  sequence is contiguous from 1, and `previousRecordHash` chains — D-PB NEVER signs and does not
  re-verify signatures (the kernel is the sole signature decider, CL ruling).

**Conformance battery (E-PB), instantiated against the resident verifiers (block-170 real PoW+Merkle):**
- `pb.assembles-valid` (E-PB1): a bundle built from a real D-AM proof + the block-170 D-BI
  inclusion + a **2-record** value chain passes BOTH `verifyProofBundleStructure` (all checks)
  and `verifyProofBundleAgainstBitcoin(bundle,{headerSource})` (`valid===true`) — asserting
  `btc.0.chain` passes (canonical-chain pinning, not just PoW+Merkle; CL r2).
- `pb.leaf-binds-name-owner` (E-PB2): assembled `leaf===H(normalizedName)` and `value===owner`;
  a proof whose `keyHex` ≠ `H(name)` or whose value ≠ owner fails closed at assembly.
- `pb.anchor-coherence` (E-PB2, CL fix): a cited anchor txid OR height that disagrees with the
  embedded inclusion fails closed.
- `pb.structure-vs-bitcoin` (E-PB3): a bundle assembled WITHOUT an inclusion is structurally
  valid but not Bitcoin-settled — `…Structure` passes, `…AgainstBitcoin` fails
  `btc.inclusion.present` (the two-tier distinction, mirrors E-BI3).
- `pb.tamper-fails-right-check` (E-PB4, CL fix — softened): tampering the assembled owner value /
  Merkle branch sets `valid=false` and the TARGETED resident check is **among** the failures
  (diagnostics may cascade) — hostile assembly ≡ no-witness acceptance effect (E-ND1).
- `pb.value-record-coherence` (E-PB5): a record not owned by the claimed owner, or a broken
  `previousRecordHash` chain, fails closed at assembly.
- `pb.value-record-bad-sig` (E-PB6, CL r2): D-PB is a pure placer — it does NOT pre-verify
  signatures (the kernel is the sole signature decider). A record with valid owner/ref/sequence/
  chain but an INVALID signature IS placed, and the kernel then fails it closed
  (`valueRecords.0.signature`) — forged record ≡ no-accept (E-ND1).

**Design questions — RESOLVED (CL design review on `4c0e3fd`).**
1. **Composition inputs.** Concur: no self-verify call inside the builder; consume built
   D-AM/D-BI facts, assert via the resident verifiers in tests. The builder still fails closed on
   the cheap coherence above.
2. **Value-record chain depth.** Use **2 records** so `previousRecordHash` linkage is exercised,
   not just hash/signature/owner on a single record.
3. **Branded verified-anchor-height coupling — DEFERRED** to a named follow-up so D-SB-avail
   stays closed. §11 D-PB is assembly-only; the anchor height/txid are gated against the embedded
   D-BI inclusion. The follow-up will couple a D-SB-avail `VerifiedAvailability` so the stamped
   height is the minted brand (typing/coupling only, no new law).

**Out of scope (confirmed).** D-PB does not verify the anchor tx's OP_RETURN commits the
accumulator root (the publisher/indexer/D-CV linkage — the structural verifier doesn't either),
and the `bitcoin_l1_direct_auction` bundle assembler is a separate slice.

## §12 — Fourth slice: D-PB branded verified-anchor-height coupling design

Design-first; **CL's picked next slice** after the D-PB sign-off (`6c11954`). The §11 D-PB
assembly deferred this; it is now the clean follow-up because the bundle-assembly surface
exists and D-SB-avail stays untouched. **Classification: FREE / structural — a typing/coupling
tightening, no new rule.** It consumes the already-ratified `firstServableHeight` (#84
availability-height, O1) that D-SB-avail mints; it adds no consensus law.

**What it adds.** An optional `availability: VerifiedAvailability` input to
`buildAccumulatorBatchClaimBundle`. When present it makes the **verified** D-SB-avail witness the
authority for the bundle's anchor height and served root, so the assembly is bound to the same
witness the kernel's includable/holdsPriority verdicts read — closing the loop D-SB-avail opened.

**Coupled obligations (when `availability` is present; all fail-closed).**
- **Branded height provenance.** `batchAnchor.anchorHeight := availability.firstServableHeight`
  (the branded `VerifiedAvailabilityHeight`). A bare number can no longer be the height source —
  only a D-SB-avail-minted brand can stamp the coupled height (the typing tightening §5.2 named).
- **Served-root binding.** `membership.rootHex === availability.bound.anchoredRoot` — the
  assembled accumulator root IS the root the served bytes reconstruct (D-SB-bind), not just any
  root the membership proof folds to.
- **Anchor-height agreement.** when an inclusion is embedded,
  `inclusion.height === availability.bound.anchorHeight` (= `firstServableHeight`, since D-SB-avail
  guarantees `bound.anchorHeight === firstServableHeight`).

**Honest scope (CL r2 fix #4 — no overclaim).** The coupling enforces those three equalities. It
still does **not** prove the anchor txid committed that root (the OP_RETURN/root linkage stays
publisher/D-CV). So the claim is precisely: *the stamped height is the verified-minted height, and
the assembled root is the served root* — not *the on-chain anchor commits this root*.

**Input shape — RULED B (discriminated input, CL on `007cd67`).** The assembler input is a union
of an UNCOUPLED and a COUPLED shape, so the branded height is the only height source at the type
boundary once `availability` exists (A still left a redundant bare height on the coupled surface
that future call sites could treat as meaningful):
- **UNCOUPLED (§11), unchanged:** `availability` absent ⇒ `anchor: { anchorTxid, anchorHeight }` —
  the structure-only / current assembly input.
- **COUPLED (§12):** `availability` present ⇒ `anchor` carries **only** `{ anchorTxid }`;
  `batchAnchor.anchorHeight` is sourced **solely** from `availability.firstServableHeight`. When an
  inclusion is embedded, gate `inclusion.txid === anchor.anchorTxid` and
  `inclusion.height === availability.bound.anchorHeight`.
- `anchorTxid` always comes from the caller/inclusion (D-SB-avail carries no txid).

**Red battery (E-PB7..E-PB11), against the real kernel verdicts:**
- `pb.coupling-binds-brand` (E-PB7): coupled ⇒ `batchAnchor.anchorHeight === firstServableHeight`
  and `accumulatorProof.root === bound.anchoredRoot`; the bundle round-trips green (incl. `btc.0.chain`).
- `pb.coupling-served-root` (E-PB8): `membership.rootHex !== bound.anchoredRoot` ⇒ fail closed.
- `pb.coupling-anchor-height` (E-PB9): `inclusion.height !== bound.anchorHeight` ⇒ fail closed.
- `pb.coupling-inconsistent-brand` (E-PB10, CL r2 add): a forged/cast `VerifiedAvailability` with
  `bound.anchorHeight !== firstServableHeight` ⇒ fail closed BEFORE stamping (D-PB does not blindly
  trust a contradictory branded object that is the coupling gate).
- `pb.coupling-no-overclaim` (E-PB11): a coupled bundle binds height (brand) + root (served) but the
  builder makes NO OP_RETURN/root-commit check, and the resident verifier doesn't either — the
  residual stays publisher/D-CV (the §11 out-of-scope note made executable, not just prose).

Built GREEN per CL's "proceed red→green on that shape" — discriminated union
(`UncoupledBatchClaimInput | CoupledBatchClaimInput`), 5 coupling vectors, `@ont/evidence` 45/45.

## §13 — Fifth slice: D-CW completeness witness + lot block/soft-close range design

Design-first; **CL's picked next slice** after D-CV, and CL ruled the four design calls
(message of 2026-06-15). **Classification: FREE — conforms to ratified PR-19 (increment /
soft-close / close-boundary economics) + PR-29 (auction-close boundary inclusivity, T6/T16/B13)
via #66.** The concrete verifier-checkable completeness-witness format + the lot block / soft-close
range encoding is the B3 deliverable (the long-parked `T2-neg-02`); the soft-close window / base
window numbers stay launch-freeze inputs (no baked constant).

**The slice.** The kernel `transcriptCompleteness` (T2) consumes the completeness witness as the
opaque `{kind:"b3-verified-completeness-witness"}` placeholder and explicitly DOES NOT compute the
lot's block range / soft-close window. D-CW supplies the concrete witness + makes the kernel
**recompute the range + completeness** over it.

**Headline — soft-close range ↔ completeness interdependence.** A bid mined in the final
`softCloseWindow` blocks of the current close extends `close` to `bidHeight + softCloseWindow`
(fixpoint, no hard cap) — but **acceptance-only** (PR-19 / B14 / B15): a *rejected* bid inside soft
close does NOT extend. So `close` is a function of the *accepted* bids, and a hidden late accepted
bid both escapes the count AND fails to extend `close` — exactly `T2-neg-02`. Therefore the kernel
must compute the final close from the **witnessed full bid/effect set, not the counted transcript**
(CL), or the hidden-extension attack survives.

**Scope split (CL ruling 1 — concur, widened).** The KERNEL recomputes range + completeness;
EVIDENCE builds the witness from Bitcoin-witnessed bid heights. `{txid,minedHeight}` alone is
underpowered because soft-close extension is acceptance-only, so the witness carries a **closed set
of resident-kernel accepted-bid effects** — the existing `acceptAuctionBid` `stateEffect`
(`"opens-auction"` / `"updates-leading-bid"` = accepted+extends; `"none"` = rejected, no extend)
threaded in as a witnessed verdict. **B3/evidence does NOT assert acceptance** — that is the
resident auction predicate's output; evidence only enumerates the L1 lot-bid txids + heights +
canonical order. Each bid carries `txIndex` (at least) so same-height fixtures are deterministic.

**Concrete witness shape (the B3 format the placeholder becomes):**
```
{ kind: "b3-verified-completeness-witness",
  lot: { openHeight, baseWindow, softCloseWindow },          // launch-freeze params as explicit inputs
  bids: [ { txid, minedHeight, txIndex, effect } ] }          // effect = resident AuctionBidStateEffect
```
- `openHeight` = the accepted opening-bid height (the `"opens-auction"` bid's `minedHeight`); the
  predicate may instead accept `initialCloseHeight` directly (CL ruling 2). `close0 = openHeight + baseWindow`.
- `producer-asserted` (and absent) still fail closed (T2 unchanged).

**Range fixpoint (CL ruling 2 — accepted bids only).** `close = close0`; process accepted bids
(`stateEffect ≠ "none"`) in canonical `(minedHeight, txIndex)` order; if `bidHeight` is in the
soft-close window of the *current* close, `close = max(close, bidHeight + softCloseWindow)`;
iterate/process to fixpoint (cascading late bids). No hard cap. `softCloseWindow > 0`; overflow /
malformed / negative params fail closed.

**PR-29 boundaries (CL ruling 3 — pinned, I did not guess).**
- `close` is **inclusive** for bids: `bidHeight <= close` is in range / valid; `close+1` is rejected;
  settlement is strictly after close.
- Soft-close trigger is position-based, **inclusive at both edges**:
  `bidHeight >= close - softCloseWindow && bidHeight <= close` (with `softCloseWindow > 0`).
- Edge vectors pinned at `start-1` (= `close - softCloseWindow - 1`), `start` (= `close - softCloseWindow`),
  `close`, and `close+1`.

**Completeness (CL ruling 4 — symmetric set equality, after final close).** The counted transcript
txid set must EQUAL the witnessed set of well-formed L1 AuctionBid events for the lot in
`[openHeight, finalClose]` — **accepted AND rejected** well-formed in-range lot bids (rejected bids
have no range/winner effect but ARE in the completeness set). Omission fails; counted
out-of-range / unwitnessed / foreign-lot padding fails.

**Planned `cw.*` red battery (against the kernel verdict, instantiated):**
- `cw.complete` — counted set == witnessed in-range set ⇒ complete.
- `cw.t2-neg-02-hidden-late-accepted` — a late accepted bid present in the witness (extends close)
  but omitted from the transcript ⇒ incomplete; final close computed from the witness, not the count.
- `cw.rejected-in-soft-close-no-extend` — a rejected bid in the soft-close window does NOT extend close.
- `cw.cascade` — a late accepted bid extends close, bringing a further bid into the new window (cascade).
- `cw.boundary-start-minus-1` / `cw.boundary-start` / `cw.boundary-close` / `cw.boundary-close-plus-1`
  — the four PR-29 edges.
- `cw.omitted-in-range-accepted` / `cw.omitted-in-range-rejected` — either omission ⇒ incomplete.
- `cw.out-of-range-padding` / `cw.foreign-lot-padding` / `cw.unwitnessed-padding` — counted-but-not-
  witnessed-in-range ⇒ incomplete.
- `cw.producer-asserted` — producer-asserted witness ⇒ fail closed (T2 unchanged).
- `cw.malformed-params` — negative/overflow `baseWindow`/`softCloseWindow`, `softCloseWindow <= 0` ⇒ fail closed.

**One sub-decision for CL + a ripple.** (a) Make the concrete `lot`/`bids` fields **required** for the
`b3-verified-completeness-witness` kind (my lean — a verifier-checkable witness IS the enumeration),
migrating the 3 existing `b2-vector-bindings` T2 placeholder vectors (only the one positive at line
646 needs a concrete witness; the extra-field/malformed-transcript ones reject before the range);
OR keep the fields **additive-optional** (bare placeholder retained for the non-range T1/T21 vectors,
range check engages only when present). (b) `acceptAuctionBid` is consumed as the effect source — does
the kernel RE-RUN it inline (full no-trust recompute, stateful over prior-bid state) or consume the
closed `stateEffect` set as a witnessed verdict (my lean — matches the existing consume-witnessed-
verdict pattern; the effect is kernel-law from `acceptAuctionBid`, not a B3 assertion)? On your
rulings I author the `cw.*` red battery then green.

### §13 update — CL rulings (a)+(b) folded (recompute acceptance, not trust it)

**(a) Required fields; kill the bare placeholder.** `kind:"b3-verified-completeness-witness"` now
REQUIRES `lot` + `bids` — a verifier-checkable witness IS the enumeration. No additive-optional
(that would preserve the old kind-only bypass as a second valid shape). The 3 existing
`b2-vector-bindings` T2 uses migrate via a `minimalConcreteWitness()` helper; they are
purity/determinism/reject checks (none asserts `complete:true` for the placeholder), so they stay
green against a well-formed concrete witness.

**(b) Recompute acceptance — do NOT trust a B3-supplied `effect`.** The kernel boundary treats
runtime input as hostile: a late accepted bid falsely marked `none` would shrink the final close and
let `T2-neg-02` pass. So the witness carries the **full bid + bond facts** each bid needs, and
`transcriptCompleteness` **recomputes** acceptance by folding the resident `acceptAuctionBid` over
the bids in canonical `(minedHeight, txIndex)` order — `acceptAuctionBid` already computes
`nextCloseHeight` (opening → `minedHeight + baseWindow`; soft-close → `max(close, minedHeight +
softCloseWindow)`), so the soft-close range falls out of the fold. The witness `effect` field is
OPTIONAL (fixture readability) and is treated as **asserted**: a mismatch vs the recomputed
`stateEffect` fails closed. This recomputes acceptance EFFECTS only (consensus law under PR-19/PR-29)
— it does NOT select a winner (T7/T9).

**Concrete witness shape:**
```
{ kind: "b3-verified-completeness-witness",
  lot: { openingFloorSats, params: AuctionParams, openHeight? },   // openHeight optional cross-check
  bids: [ { txid, txIndex, bidFacts: AuctionBidFacts, bondFacts: AuctionBondFacts, effect? } ] }
```
`AuctionParams` = the full resident shape (`baseWindowBlocks`, `softCloseWindowBlocks`, normal +
soft-close `minRaiseSats`/`minRaiseBasisPoints`). Fold: `prior0 = {openingFloorSats, leader:null,
close:null}`; per accepted bid update `prior`; `openHeight` = the single `opens-auction` bid's
height; `finalClose` = the fold's final close. Completeness = symmetric set-equality of the counted
txid set vs `{ bid.txid | openHeight <= minedHeight <= finalClose }` (accepted + rejected in-range).

**Added red pins (CL):** exactly one computed `opens-auction` (`lot.openHeight` if present must equal
it); **no-opener / two-openers / update-before-opener** fail closed;
`cw.effect-forgery-hidden-extension` (a bid whose supplied `effect="none"` but recomputation accepts
it in soft close ⇒ fail, not shrink the range); params carry every `acceptAuctionBid` input and
malformed/overflow values fail closed.

**§13 red-battery round 2 (CL).** Added: `cw.canonical-order` (fold sorts by `(minedHeight, txIndex)`,
not input order) + `cw.duplicate-chain-position` (same `(minedHeight, txIndex)` ⇒ fail, ordering
underdetermined); `cw.duplicate-witness-txid` (dup txid in the witness ⇒ fail, no silent set collapse);
`cw.bare-placeholder-rejected` (`{kind}` without `lot`/`bids` ⇒ `cw-witness-malformed`);
`cw.malformed-params` widened to zero / negative / overflow (`baseWindow=0`, `softCloseWindow=0/-1`,
`baseWindow=MAX_SAFE` close-height overflow); `cw.effect-forgery-impossible-opener` (a later update or
below-floor bid asserting `opens-auction` ⇒ fail — ANY asserted-effect mismatch, not only the
hidden-extension direction); `cw.invalid-lot-binding` (a witness bid whose `lotBinding.kind` ≠ the
resident verified binding ⇒ fail — the named foreign-lot boundary; a counted txid simply absent from
the witness is `cw.unwitnessed-padding`). 23 cw.* total (21 red, `producer-asserted` +
`bare-placeholder-rejected` green shape-guards). `softCloseWindow > 0` is D-CW-strict (stronger than
`acceptAuctionBid`'s `>= 0`).

**§13 red-battery round 3 (CL).** Two final pins: `cw.canonical-order-txindex` (same-height bids,
different `txIndex`, supplied reversed, asserted effects force the canonical `(minedHeight, txIndex)`
order — a height-only/input-order fold opens the wrong bid and mismatches its asserted effect), and
`cw.malformed-witness-bid` (a malformed witness-bid envelope — negative `txIndex` — ⇒ no throw +
`cw-witness-malformed`, forcing total fail-closed validation of the bid envelope before the fold).
25 cw.* total (23 red, `producer-asserted` + `bare-placeholder-rejected` green shape-guards).

**§13 GREEN (CL red-OK on `8ff3563`).** `completenessOverRange` implemented: total fail-closed witness
envelope validation (closed-shape, txid/txIndex/bid/bond shapes, `softCloseWindow > 0` D-CW-strict) +
duplicate txid / chain-position rejection BEFORE the fold; canonical `(minedHeight, txIndex)` sort;
fold the resident `acceptAuctionBid` threading `PriorAuctionState` (recompute every effect — a supplied
`effect` is cross-checked, never trusted); exactly one `opens-auction` + optional `openHeight`
cross-check; `finalClose` from the witnessed fold (not the count); symmetric set-equality of the counted
txids vs the witnessed in-range bids over `[openHeight, finalClose]`. 23 cw.* GREEN; `@ont/consensus`
445 pass / 2 skip (no regression), `@ont/evidence` 45/45, purity green.
