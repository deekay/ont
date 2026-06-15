# B3 evidence-layer hardening — steps 1–2: rule extraction and source check

> **Status: DRAFT rev 3 — steps 1–2 (invariant extraction + source check).
> ChatLunatique review round 1 (`65750eb`) returned 4 decomposition blockers +
> 2 edits; all addressed here — see §8 (review record).** Branch
> `clean-build-b3`, stacked on `main` @ the B2 buildable-complete merge
> (`03495bd`). Produced 2026-06-15 on DK's "continue the adversarial build
> process" greenlight (event `d031752d`). Per the normative-hardening amendment
> this phase runs the five steps (rule extraction → source check → adversarial
> content pass → attacks become negative tests → sign-off), in the form of
> [`B1_WIRE_HARDENING.md`](./B1_WIRE_HARDENING.md) and
> [`B2_KERNEL_HARDENING.md`](./B2_KERNEL_HARDENING.md). Output of **steps 1–2**
> for the L3 evidence layer (future `@ont/evidence`). **Nothing here is law
> yet**; the open consensus questions are parked decision-ready for DK in §5
> (parking rule: new consensus law is DK's to rule, never agent-decided).
>
> **The boundary that organizes this rev.** ChatLunatique's round-1 finding:
> several deliverables were claimed in-scope/ratified when they actually turn on
> open consensus rulings. Per the canon boundary rule — *anything that changes
> whether an anchor counts or which root is canonical is kernel law, not
> evidence construction* ([SOFTWARE_CANON.md](./SOFTWARE_CANON.md)) — each B3
> deliverable is now tagged **FREE** (pure witness construction against
> already-ratified rules; build now) or **GATED** (B3 implements *after* a named
> spec-PR ruling). §2 carries the split; §5 carries the docket.

## §0 — Purpose / scope / tests (the required component statement)

- **Purpose.** Construct and **cryptographically verify** the evidence the B2
  ownership kernel consumes — turning "the publisher says so" into "anyone can
  check it." B3 decides nothing; it witnesses.
- **Scope (in), buildable now (FREE).** Bitcoin inclusion verification (D-BI),
  accumulator membership-proof construction (D-AM), proof-bundle structural
  assembly (D-PB), recovery descriptor-head witness (D-RC, §3c half), the
  served-bytes root-reconstruction binding mechanics (D-SB binding half), and
  bond-continuity / release-fact witnessing (D-BC witness half).
- **Scope (in), drafted but GATED on a ruling.** The served-evidence
  *verifier-checkable shape* (D-SB / PR-1), completeness witness + range (D-CW /
  T2-neg-02), canonical-root derivation (D-CV / PR-3·5·9·16 + Model B), and
  gate-fee economic evidence (D-GF / g(name) + PR-2). Specified here; **no
  implementation until the cited ruling lands.**
- **Scope (out).** No ownership decisions (kernel), no adapters (B4), no
  surfaces (B5).
- **Tests.** The gate is adversarial (§4): the convergence battery + a
  hostile-evidence battery, run as production tests **against the real B2
  kernel** — forged evidence must equal the no-witness (fail-closed) case.

## §1 — The defining contract: B3 is NON-DECIDING

- **EV is a witness, not a callback.** The kernel consumes a verified witness
  **as data** and re-checks it itself; `da-verdict.ts` and
  `transcript-completeness.ts` already encode this (opaque input object, never a
  handle, endpoint, or bare boolean).
- **The hostile-evidence property, stated precisely (CL finding 6).** A swapped
  or buggy `@ont/evidence` can never make the kernel **accept** something it
  should reject — forged or invalid evidence cannot flip a verdict to a false
  accept. It *can* fail to produce a valid witness; then the kernel fails closed,
  which is the **correct** verdict, not a corruption of one. The bar (§4.2):
  forged evidence produces exactly the no-witness, fail-closed outcome.
- **Consequence.** The hostile-evidence battery (§4.2) is the primary B3
  deliverable — the executable proof of this contract.

## §2 — B3 deliverables, traced to the kernel contracts they feed

| # | Deliverable | Feeds (kernel contract) | Status |
| --- | --- | --- | --- |
| D-BI | Bitcoin header/inclusion verification (Merkle + PoW) | `proof-bundle.ts` → `verifyProofBundleAgainstBitcoin` / `bitcoinInclusion` | **FREE** [cited] |
| D-AM | Accumulator membership-proof construction | `proof-bundle.ts` → `verifyAccumulatorMembership` (`@ont/protocol`) | **FREE** [cited] |
| D-PB | Proof-bundle structural assembly (both sources) | `verifyProofBundleStructure` | **FREE** (structural); against-Bitcoin via D-BI |
| D-RC | Recovery descriptor-head witness (witnessed by `h_r+W_r`) | `recovery-invoke-authority.ts` §3c; `engine.ts:104-127`; `indexer.ts:47-51` | **FREE** [ratified #50-b1/§3c]; R11 bond-spend/successor edge rides **PR-34** |
| D-BC | Bond-continuity / release-fact witness (spend facts only) | `reopen-resolution.ts` (release-height **derivation stays kernel**) | **FREE** witness side; release rule is kernel |
| D-SB | Served-bytes witness: bytes → `anchoredRoot` under `batchSize`, bound to one anchor | `da-verdict.ts` `ServedEvidence` | binding **FREE**; the verifier-checkable `firstServableHeight` shape is **GATED on PR-1** |
| D-CW | Completeness witness + lot block/soft-close range | `transcript-completeness.ts` (T2) | **GATED on T2-neg-02** (§5.5) |
| D-CV | Canonical-root derivation (multi-publisher merge) | `batch-exclusion.ts` (consumes the derived root) | **GATED on PR-3 · PR-5 · PR-9 · PR-16 + Model B** (§5.3) |
| D-GF | Gate-fee economic evidence: prevout/intrinsic-fee witness, Σ g over committed leaves, N-source, mismatch verdict | `gate-fee.ts` amount-adequacy conjunct | **GATED on g(name) schedule + PR-2 Σg granularity** (§5.4) |

## §3 — Evidence-layer invariants (E-series) + source check

Tags: **[cited]** has a spec home; **[ratified: #N]** rests on a ratified
decision; **[candidate-stays]** no ratifying source yet; **[GATED: PR-x]** B3
implements after the ruling — listed for completeness, **not buildable
pre-ruling**.

### Bitcoin inclusion — D-BI (FREE)
- **E-BI1 — PoW-backed headers.** A cited anchor tx is accepted only if its
  block header has valid PoW and chains to a pinned checkpoint. *[cited:
  BITCOIN_ANCHORED_NAME_ACCUMULATOR.md "Data availability rules"; mine
  `@ont/bitcoin`].* Test: tamper bits/nonce ⇒ reject; wrong-chain/orphan header ⇒ reject.
- **E-BI2 — Merkle inclusion.** Anchor txid must Merkle-prove into the cited
  block's merkle root. *[cited].* Test: swap a sibling hash ⇒ reject.
- **E-BI3 — producers MUST emit `bitcoinInclusion`.** Closes the STATUS gap.
  *[candidate-stays — proposed B3 rule].* Test: a bundle missing it is
  structurally valid but **not** Bitcoin-settled.

### Accumulator membership — D-AM (FREE)
- **E-AM1 — membership verifies against the anchored root** via
  `verifyAccumulatorMembership`. *[cited].*
- **E-AM2 — insertion-unique, commuting inserts** (the basis for
  order-independent merge). *[cited].*
- **E-AM3 — non-membership / wrong-root fails.** *[cited].* Test: proof against
  a sibling root ⇒ reject.

### Served-bytes witness — D-SB
- **E-SB1 — root reconstruction binds to the anchor (FREE).** Re-hash served
  leaves, reconstruct the root under `batchSize`, compare byte-identical to
  `anchoredRoot`; bound to THIS anchor. *[ratified: da-windows (#49) S3/S4;
  D8].* Test: one flipped leaf byte ⇒ mismatch ⇒ reject; witness for anchor A vs
  anchor B ⇒ reject.
- **E-SB2 — `firstServableHeight` must be verifier-checkable, not attested
  (GATED: PR-1).** B2 reads `firstServableHeight` opaquely and does **not** prove
  it; the witness shape that makes servability independently checkable is PR-1.
  Until PR-1, B3 must not ship a witness that lets a producer assert the height.
  *[GATED: PR-1 — §5.2].* Required negative test: a **forged-early
  `firstServableHeight`** / producer-attested servability **rejects** — this is
  the "trust me, I saw it" field we must kill (CL finding 2).
- **E-SB3 — wrong-anchor binding fails closed.** Root / `batchSize` / anchor
  mismatch ⇒ NOT includable / NOT priority. *[ratified: D4 fail-closed].*
- **E-SB4 — withholding cannot be faked.** No bytes by the deadline ⇒ no valid
  witness; the kernel fails closed. *[cited: DA_MARKER_FOLD.md §6c].* Test
  (§4.1): withhold ⇒ fail closed.
- **E-SB5 — no clock / receipt time / endpoint identity as authority.** Only the
  anchor's current-chain mined height may enter. *[cited: `da-verdict.ts`
  D2/D3].* Test: a receipt-timestamp / endpoint-id field is never used to satisfy
  a deadline.

### Recovery descriptor-head witness — D-RC (FREE; §3c half)
- **E-RC1 — verifier-checkable descriptor witness.** B3 attests the name's armed
  descriptor-v2 head was witnessed by `h_r+W_r` (`W_r` launch-freeze,
  `1 ≤ W_r ≤ challengeWindowBlocks`); B2's `acceptRecoverOwner` consumes
  `{ kind: "b3-verified-recovery-descriptor-witness", witnessedByHeight }` and
  **remains the decider** (R2–R8 stay in the kernel). *[ratified: recovery-auth
  (#50-b1); §3c].*
- **E-RC2 — fail closed on late/absent/unverified evidence.** *[ratified: §3c].*
  Test: witness at `h_r+W_r+1` ⇒ no authorization; a descriptor witnessed from an
  **old ownership interval** (R4) ⇒ reject.
- **E-RC3 — §8.3 BIP322 wallet proof is non-authorizing corroboration.** No
  witnessing deadline; cannot block or substitute for the descriptor evidence.
  *[cited: `recovery-invoke-authority.ts`].*
- **E-RC4 — bond-spend / qualifying-successor evidence (R11) rides PR-34
  (GATED).** The invoke's bond-spend + successor + outpoint-conflict mechanics
  are a second evidence surface not settled by the §3c descriptor witness.
  *[GATED: PR-34 — §5.6].*

### Bond-continuity / release facts — D-BC (FREE witness side)
- **E-BC1 — witness the Bitcoin-derived bond-spend / release facts only.** B3
  surfaces the spend facts `reopen-resolution.ts` consumes; the latest-release-
  height **derivation and re-auction rule stay in the kernel**. *[cited:
  `reopen-resolution.ts`; #41/#79].* Test: a fabricated release fact not backed
  by an on-chain spend ⇒ rejected before the kernel sees it.

### Completeness witness — D-CW (GATED: T2-neg-02 — §5.5)
- **E-CW1 — verifier-checkable completeness over a Bitcoin-derived range.** The
  counted-bid set is provably complete over the lot's block/soft-close range,
  range **derived from Bitcoin-witnessed heights**, checkable without trusting
  the producer. *[GATED: T2-neg-02 — §5.5].*
- **E-CW2 — producer-assertion is never trusted.** *[ratified: T2 / canon Item 4].*
- **E-CW3 — hide-then-reveal governed by the range rule**, not retroactive
  decertification. *[GATED: T2-neg-02 — §5.5].*

### Canonical-root derivation — D-CV (GATED: PR-3·5·9·16 + Model B — §5.3)
*All E-CV invariants are **B3-implements-after-ruling**; listed for completeness.*
- **E-CV1 — Model B leaderless merge is canonical; Model A retires.** *[GATED:
  §5.3].*
- **E-CV2 — order-independent convergence** (same canonical root, any order).
  *[cited: convergence doc; proven in `da-convergence-sim.test.ts` — productionize
  after the rulings].*
- **E-CV3 — same-leaf conflict = first-writer-wins primitive, fed to the kernel's
  notice-window policy** (`runBatchRail`, not raw `mergeBlock`). *[GATED: §5.3].*
- **E-CV4 — a malicious delta cannot unseat a finalized name or fork the root.**
  *[cited: convergence adversary analysis].* Test (§4.1).

### Gate-fee economic evidence — D-GF (GATED: g(name) + PR-2 — §5.4)
- **E-GF1 — prevout/intrinsic-fee witness + Σ g over the committed leaf set.** B3
  witnesses the actual fee from the Bitcoin tx and reconciles it against the
  committed batch; the **g(name) schedule and amount-adequacy verdict** are the
  ruling. *[GATED: g(name) schedule + PR-2 Σg granularity — §5.4].* Negative:
  a **self-declared Σg** (not derived from committed leaves) rejects.

### Cross-cutting (the §1 contract, made executable)
- **E-ND1 — swapping evidence cannot make the kernel accept** (forged ⇒
  fail-closed, identical to no-witness). *[ratified: canon B3 gate].* Test: §4.2.
- **E-ND2 — zero ownership logic in B3** (no claim-gate / auction / transfer /
  recovery *decision*); enforced by a quarantine-style import + surface test.
  *[ratified: canon L3 "non-deciding"].*
- **E-ND3 — transport affects liveness, not integrity.** Which endpoint served
  bytes, over what protocol, changes *whether* a witness is gathered, never
  *what* it proves. A "trust me, I saw it" field is a bug, not a witness.
  *[ratified: §1 contract; `da-verdict.ts` S4].*
- **E-ND4 — reorg ⇒ re-derive from current-chain mined heights** (no first-seen /
  local height as authority). *[cited: da-windows (#49) S1; PR-9].* Test: a
  witness valid pre-reorg whose anchor is reorged out re-derives to invalid.

## §4 — The adversarial gate

### §4.1 Convergence attack battery (production tests vs the B2 kernel)
1. **Withholding** ⇒ kernel fails closed. (E-SB4)
2. **Hide-then-reveal** (late bytes / late bid) ⇒ no retroactive priority or
   decertification. (E-SB4 / E-CW3)
3. **Multi-publisher merge** ⇒ one canonical root; a malicious delta cannot
   unseat a finalized name. (E-CV2 / E-CV4 — after §5.3 rulings)

### §4.2 Hostile-evidence battery (the §1 contract)
Each forged witness must produce exactly the no-witness, fail-closed outcome:
- forged-early `firstServableHeight` / producer-attested servability;
- wrong-chain / orphan block header;
- stale pre-reorg anchor height;
- missing prevout fee witness; self-declared Σg;
- recovery descriptor evidence from an **old ownership interval**;
- (once DK rules) canonical-root PR-3 / PR-5 / PR-9 / PR-16 cases.

### §4.3 Scale
Measure issuance throughput / proof sizes at target batch sizes; update **R11**
in [RISKS.md](../RISKS.md). *(Numbers, not a correctness gate.)*

## §5 — Open decisions parked for DK (recommendations; DK rules)

The B3 decision docket. Drafted decision-ready; **not** agent-decided. The FREE
deliverables (§2) proceed without these; the GATED ones wait.

### §5.1 PR-2 — DA verdict granularity table (conflict C5)
Disposition per failure class. Fee → whole-batch and DA-deadline → whole-batch
are recorded; the **open fork is leaf-level commitment / well-formedness:
per-leaf-drop vs batch-poison** (ruleIds D4, D8, A4, A6, B9). C6 (leaf =
`H(ownerPubkey)`) reads settled by commitment-match (#52) [**CL: confirm tier**].
**Open sub-question (CL):** do dropped leaves still count in Σ g? The registry
text says "Σ gᵢ over the full committed set regardless of drops"; a per-leaf-drop
reading would exclude them — **these conflict; DK must pick.** **Rec:**
per-leaf-drop for malformedness, Σ g over the *surviving* committed set (flag the
registry-text tension). Packet: [`B2_SPEC_PR_PACKETS.md`](./B2_SPEC_PR_PACKETS.md)
PR-2 — ruling makeable now; only the concrete bytes are B3-gated.

### §5.2 PR-1 — served-evidence verifier-checkable witness shape *(new — CL finding 2)*
B2 consumes `firstServableHeight` opaquely and does not prove it; the DA docs
mark the served-evidence definition the hard half still open. **Rec:** a witness
shape that re-derives servability from on-chain + served-bytes facts (challenge
response by `h+W+C`), with **no producer-attested height** admissible. Until
ruled, D-SB ships only the binding/reconstruction half (E-SB1).

### §5.3 Canonical-root cluster — PR-3 + PR-5 + PR-9 + PR-16 + Model B *(new — CL finding 1)*
One decision packet, because each changes *which root is canonical* (kernel law):
PR-3 root-chain transition / `prevRoot`-anchor identity; PR-5 first-anchor-wins =
earliest-VALID-anchor; PR-9 reorg re-derivation + replay determinism; PR-16
intra-block / intra-tx total order; plus ratifying **Model B** (leaderless merge)
and retiring Model A. **Rec:** ratify Model B + PR-3/5/9/16 together; B's
convergence is already proven in sim. D-CV implements only after this packet.

### §5.4 Gate-fee economics — g(name) schedule + amount-adequacy *(new — CL finding 4)*
B2 left fee-amount adequacy, the `g(name)` schedule, and batchSize-vs-leaf-count
reconciliation to downstream (`gate-fee.ts`; DECISIONS #62; return-queue F1/F2/F3
ride `g(name)` deferred to B3). **Split:** the fee-*fact* witness (prevout fee, Σ
over committed leaves, N-source) is B3 (D-GF); the **`g(name)` schedule + adequacy
verdict is a launch-freeze parameter + spec ruling** (not pure evidence). **Rec:**
route `g(name)` to the launch-parameter freeze; B3 supplies only the witnessed
fee fact. Do not let it fall between B2 and B3.

### §5.5 T2-neg-02 — completeness-witness format + soft-close range
The concrete witness format + the lot's block/soft-close range (the one vector B2
deferred). **Under-specified points to settle (CL):** which anchor pins the range
(opening vs reopen lot); how soft-close extensions move the terminal height; how
same-block bids at the boundary are included; what reorg depth makes the range
stable. **Rec:** a closed block interval pinned by the lot's opening anchor,
terminal height advanced by each soft-close extension, boundary same-block bids
included, range stable at the PR-9 reorg depth. Needs a named spec PR.

### §5.6 PR-34 — recovery bond-spend / qualifying-successor evidence
The R11 bond-spend + successor + outpoint-conflict surface (E-RC4) is a second
recovery evidence stream not settled by the §3c descriptor witness. **Rec:** rule
PR-34 (and PR-33 descriptor-chain) so D-RC's bond-spend half can be specified; the
§3c descriptor-head half (E-RC1–RC3) proceeds now.

## §6 — Mining map (existing code → deliverable)
| Existing | Mineable into |
| --- | --- |
| `packages/bitcoin` (Merkle+PoW verifier, tested vs mainnet) | D-BI — harden + close the emit gap (E-BI3) |
| `@ont/protocol/accumulator-membership.ts` | D-AM — membership primitive; build the construction side |
| `packages/core/src/research/{delta-merge-sim,da-convergence-sim}.ts` + tests | D-CV — productionize Model B **after §5.3** |
| `apps/resolver` `runBatchRail`/`mergeBlock` | D-CV — canonical-root derivation the resolver never wired |
| `@ont/consensus/proof-bundle.ts` `verifyProofBundleStructure` | D-PB — structural contract B3 assembles to |
| `recovery-descriptor.ts` (B1) + `docs/research/RECOVERY_EVIDENCE_TIMING.md` | D-RC — descriptor-head witness |
| `gate-fee.ts` + the fee-fact-eligibility (#81) selection | D-GF — fee-fact witness (schedule is launch-param, §5.4) |

## §7 — Carry-forwards
- **T2-neg-02** (soft-close completeness range): the one required vector B2
  deferred — lands via §5.5 + E-CW1/CW3.
- **`bitcoinInclusion` emit gap** (STATUS "Prototype"): closed by E-BI3.
- **`batch-rail.ts` re-key to bond-opens (#37)** before the resolver consumes it.

## §8 — Review record
- **Round 1 (ChatLunatique, `65750eb`).** Mechanical gates clean; 4 decomposition
  blockers + 2 edits. (1) canonical-root merge in-scope while its rulings unparked
  → split FREE/GATED, PR-3·5·9·16 + Model B to §5.3, E-CV downgraded. (2) E-SB4
  overclaimed the served-bytes witness → PR-1 gate + forged-early-height negative
  (E-SB2). (3) recovery descriptor evidence missing from §2 → D-RC/E-RC (added in
  rev 2). (4) gate-fee `g(name)` evidence missing → D-GF + §5.4. (5) D-CV
  mis-traced to `reopen-resolution` → split out D-BC. (6) "no verdict changes"
  imprecise → §1 reworded. §5 recs + §4 battery expanded per the round-1 gate bar.
