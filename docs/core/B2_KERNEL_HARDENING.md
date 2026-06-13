# B2 Kernel Hardening — steps 1–2: rule extraction and source check

> **Status: DRAFT — awaiting step-3 adversarial content pass (ChatLunatique).**
> Branch `clean-build-b2`. Produced 2026-06-13 during the autonomous session (DK
> grant, event `9c1e1ba7`). Per the normative-hardening amendment, B2 hardening
> runs the 5 steps (rule extraction → source check → adversarial content pass →
> attacks become negative tests → sign-off); this document is the output of
> **steps 1–2** for the L2 audited kernel (future `@ont/consensus`), in the form
> of [`B1_WIRE_HARDENING.md`](./B1_WIRE_HARDENING.md). Promotion to normative is
> per-section, DK-ratified — queued on DK's return list; nothing here is law yet.
>
> **Provenance.** Three extraction tranches (multi-agent, one extractor per
> kernel area + cross-area merge + completeness critic), then a single writer
> pass (this assembly) that applied the merge's overlap rulings and recorded
> every critic verdict challenge as an explicit step-2 correction. Tranche 1:
> the five canon-named areas (89 rules). Tranche 2, commissioned by tranche
> 1's critic: transfer, value-record, recovery, settlement bond consequences,
> reorg re-derivation (78 rules). Tranche 3, commissioned by the combined
> critic for the scope still unowned: winner selection / bid acceptance, and
> kernel-wide glue (evaluation order, evidence deadlines, parameter surface)
> (26 rules). Tranche 2's critic agent was orphaned by a session interrupt;
> it was re-run identically from the journaled extraction+merge results — the
> combined critique below is that re-run's output.
>
> **Decision dependencies.** Both pre-B2 named decisions are now RULED
> PROVISIONAL pending DK under the autonomous-session protocol:
> **da-windows (#49)** — window algebra pinned in the DA agreement §6e (merged);
> **recovery-auth (#50)** — fresh recovery-key BIP340 under a v2 descriptor
> (branch `spec-recovery-auth`, not yet in main). Rules marked
> `blockedOnDecision` read against the provisional rulings and FINALIZE only at
> DK ratification; if DK flips either decision, the flagged rules re-derive.
> Papers (analysis tier, never authority here):
> [`../research/DA_WINDOWS.md`](../research/DA_WINDOWS.md) (merged), and the
> recovery-auth paper on branch `spec-recovery-auth` (Decision #50's entry
> carries the link; it resolves when that branch merges).

## How to read this document

- Every rule is a testable MUST/MUST NOT statement over (event bytes, prior
  state, chain facts) — the kernel is a pure function; any rule that smells of
  I/O, wall-clock, or network is misfiled and that is a finding.
- *Verdict* `cited` = doc authority exists (tier noted via the source's status
  header; `docs/research/` and `ARCHITECTURE.md` are analysis tier and never
  authority). `candidate-stays` = grounded only in code or unratified text;
  *needed spec work* names the spec change required before promotion.
- *Step-2 corrections* record where a completeness critic challenged a verdict
  and how the writer disposed of it — struck verdicts stay visible. Reviewer
  may counter any disposition in step 3.
- *Legacy evidence* references old code as behavioral evidence only — never
  authority (B0 law: docs are the spec).
- Negative tests are first-class: every reject path proposed here must exist as
  a vector before implementation (tests-first, per phase).


## 0. Shared definitions (kernel vocabulary)

Adopted as written from the tranche-1 merge pass (critic: "the best part of the merge output"), extended by tranche 2:

- **anchor mined height (h)** — The block height of the block, on the canonical chain, containing the accepted anchor transaction — the single clock fact from which every deadline (h+W, h+W+C, h+W_notice) is computed. The definition must state which mined instance owns h when a byte-identical payload is mined twice (A8/A2 front-running flag) and that h is only a stable input at K-deep confirmation (reorg behavior is the open da-windows/reorg spec work). *(used by: Anchor acceptance (A2, A3, A8, A13), DA verdict (D1, D3, D9), Gate-fee validation (F9, F12), Transcript completeness (T17, T20), Batched-path transitions (B2, B22))*
- **accepted anchor / acceptance-stage vocabulary** — A staged vocabulary the doc must define once: decoded (passes B1 wire decode per WIRE_FORMAT §4.4) → accepted (passes the root-chain transition rule — prevRoot linkage, no-op/duplicate rejection, same-block ordering; A7-A9's named spec PR) → eligible (accepted AND fee-valid AND DA-valid) → finalized (K-deep). Every area currently says 'accepted'/'applied'/'eligible' with slightly different meanings; the composition order and whether an ineligible anchor consumes a chain position are part of this definition (A-gaps 'acceptance-stage composition'). *(used by: Anchor acceptance (A1, A5, A7-A10), DA verdict (D2, D8 'applied anchors'), Gate-fee validation (F1, F9), Batched-path transitions (B9), Transcript completeness (T17))*
- **batch (and batch identity)** — The leaf set exclusively committed by an accepted anchor's (newRoot, batchSize) pair. The definition must pin the batch's identifier — anchor instance (txid) vs commitment (newRoot) — since the same newRoot re-anchored verifies against both (A5 flag) and the DA clock, proof bundles, and duplicate handling all need one identity (A-gaps, D-gaps). *(used by: Anchor acceptance (A4, A5), DA verdict (D2, D8, duplicate-anchor gap), Gate-fee validation (F1, F6, F7), Batched-path transitions (B9, B10))*
- **authoritative N (batchSize consistency)** — The number of names in a batch as derived from the commitment-checked committed leaf set, never the publisher's self-declared batchSize field; the verdict when the field and the leaf set disagree must be defined once (ineligible, per A4/F6 direction). N drives Σ g_i (gate fee) and commitment satisfaction (DA). *(used by: Anchor acceptance (A4), DA verdict (D8, batchSize gap), Gate-fee validation (F1, F6))*
- **served-bytes evidence (servedEvidence / first-servable height)** — The B3-witnessed, independently-verifiable evidence that a batch's bytes were demonstrably servable, including how first-servable height is established. Currently a typed hole (D-gaps): no spec text defines the admissible witness shape, and D14 notes that a non-self-verifying witness makes the kernel trust an evidence-layer assertion. Every consumer must cite the one B3 definition; none may improvise. *(used by: DA verdict (D1, D2, D4, D13, D14), Anchor acceptance (A2, A10), Gate-fee validation (F6 — Σ g_i computability), Batched-path transitions (B10, B11))*
- **eligible claim** — A claim that counts in lifecycle transitions: carried by a well-formed leaf (per the B3 leaf format) verifying against an accepted anchor's committed root, from a batch that is fee-valid and DA-eligible, for a name not gated bond-first (>4 chars), evaluated under the earliest-valid-anchor rule. This single definition is what 'exactly one claim' / 'two or more claims' counts over — resolving the cheap-claims-vs-DA-valid-claims wording conflict. *(used by: Batched-path transitions (B3, B4, B6), DA verdict (D10), Gate-fee validation (F11), Transcript completeness (T17))*
- **qualifying bond** — On-chain form plus threshold, defined once: a well-formed AuctionBid event (WIRE_FORMAT §4.3) whose bond output binding holds (output at bondVout exists, payment script, value exactly bidAmountSats, same transaction — T12's spec PR) and whose amount meets the opening floor for the name (the higher of the length-price curve and the long-name minimum, pending the AUCTION.md-vs-DECISIONS-#11 reconciliation). The mapping '#37 qualifying bond IS an AuctionBid meeting the floor, including bond-first' is implied everywhere and stated nowhere (T-gaps). *(used by: Gate-fee validation (F10, F11, F13), Transcript completeness (T7, T8, T12), Batched-path transitions (B6))*
- **window boundary convention** — One half-open-interval convention for every height window: which events at exactly the edge height (h+W, h+W+C, h+W_notice close, auction close, soft-close start, maturity height) are inside. Currently each area carries its own off-by-one flag and legacy is self-contradictory (A13). Define once, apply everywhere, with edge−1/edge/edge+1 vectors per window. *(used by: Anchor acceptance (A13), DA verdict (D13), Gate-fee validation (F12), Transcript completeness (T6, T18), Batched-path transitions (B2, B6, B15, B20))*
- **settlement / settled** — The auction-resolved condition: 'settled' as the height-derived phase (strictly after the final extension-adjusted close, per the convention above) PLUS the ownership-materialization verdict (winner's ownerPubkey/bond/amount become the name record) evaluated at a stated confirmation depth. The definition must say settlement is a derived predicate, what depth makes it stable, and that no settlement transaction or adapter step exists (#42). *(used by: Transcript completeness (T6, T16), Batched-path transitions (B13, B17, B18, B20), Gate-fee validation (F9 — replay discipline))*
- **consensus parameters (W, C, K, W_notice, W_auction, C_soft, g, floors, maturityBlocks, short-name threshold)** — All window/value parameters enter the kernel as explicit CONSENSUS_PARAMS (canon Item 5: ChatLunatique signs the surface); every rule ships parameterized; no conformance vector pins research-sim defaults (K=6/W=2/C=3) or STATUS placeholders as protocol values. W/C/K await the open da-windows decision; the rest are launch-parameter-freeze work. STATUS's parameter table needs W/C/K rows added when ruled (D12). *(used by: all five areas (A3, A13, D3, D9, D12, F1, F9, F10, T6, T8, T17, T20, B2, B6, B14, B15, B20, B21, B22))*
- **canonical event order / same-block total order** — Ascending block height, then transaction order within the block, then explicitly-specified deeper tie levels. DECISIONS #25 ratifies tx-order tie-break for auction bids only; A9 extends it to anchors and legacy code adds vout/txid/bidderCommitment levels — both without doc authority. One named spec PR (shared by anchor acceptance, transcript, and batched-path per their own crossAreaNotes) must define the full total order and what #25's 'otherwise tied' means; note #37 forbids any ordering-based AWARD, so the order governs chain extension, increments, and merge sequencing only. *(used by: Anchor acceptance (A9), Transcript completeness (T10), Batched-path transitions (intra-block ordering gap), Gate-fee validation (F12 same-block composition flag))*
- **first-anchor-wins (earliest valid anchor)** — Among claims binding the same (canonical name, owner key), the lifecycle keys to the earliest anchor that passed all eligibility verdicts; forfeited/excluded anchors confer no priority and a post-exclusion re-anchor starts a fresh window at its own height. (The conflict-resolved merge of A12/B8 with D5/B11.) 'Competing claim' for collision purposes means distinct-owner-key claims only (B5's spec PR) — same-(name,owner) re-claims are idempotent. *(used by: Anchor acceptance (A12), DA verdict (D5, D6), Batched-path transitions (B5, B8, B11))*
- **leaf format / owner binding** — The batched-claim leaf: accumulator key = sha256(canonical name bytes); committed value binds the claimed owner key via ONE construction (H(ownerPubkey) per the publisher spec vs raw pubkey per legacy — the open A6/B9 conflict B3 must pin); non-canonical name bytes are rejected, never normalized. A B3 deliverable that A6, B9, and T16's ownerPubkey materialization all consume. *(used by: Anchor acceptance (A6), Batched-path transitions (B9), Transcript completeness (T16), DA verdict (D8 — what 'bytes match the commitment' verifies))*
- **kernel purity contract** — Every kernel verdict is a pure deterministic predicate over (encoded event bytes, witnessed chain facts, prior kernel state, witnessed evidence): no DB, network, clock, UI, or adapter/evidence judgment may enter; the evidence layer witnesses and can never override (SOFTWARE_CANON L2 + boundary rule, ratified). Stated once in the hardening doc preamble; A10/D1/T1/B2/B22/F2/F8 become citations plus area-specific negative tests. *(used by: all five areas (A10, D1, D14, F2, F8, T1, T20, B2, B22))*
- **name state head** *(tranche 2)* — The txid of the transaction that most recently changed a name's state on the canonical chain. The sole target selector that a Transfer or non-cancel RecoverOwner prevStateTxid must equal; advanced by every applied state-changing event (replay immunity rests on universal advance); no two names may ever share a head. Initial value for batched-final names is undefined and MUST be per-name unique — the finalizing anchor txid alone cannot serve (batch-shared; see conflict). Distinct from, and to be defined in the same spec PR as, the ownership interval reference. *(used by: X4, X5, R5, R16, V5, Z2, tranche-1 B* (initial head of batched-final names))*
- **ownership interval / ownershipRef** *(tranche 2)* — The ownership generation of a name between interval-opening on-chain events; ownershipRef is the 32-byte identifier of the event that opened the current interval — per legacy: the last L1 state txid for L1-rail names, the txid of the accepted anchor transaction (tranche-1 anchor vocabulary; do not coin a second term) that finalized the claim for batched-rail names, and the request txid after recovery completion. The spec PR must enumerate interval-opening events (claim finality, transfer, settlement, recovery completion — the recovery case blocked on recovery-auth) and define interval ends (transfer, completion, nullification, bond-break release). *(used by: V2, V4, V5, V10, V13, R4, R6, X14)*
- **armed descriptor** *(tranche 2)* — The recovery descriptor at the head of the current ownership interval's descriptor chain — the only descriptor a non-cancel RecoverOwner event may commit to by recoveryDescriptorHash. Superseded (non-head), prior-interval, and foreign-name descriptors never authorize. Legacy violates this (any historical descriptor matches by hash); head-only must be specced. *(used by: R1, R2, R6, R7, R9)*
- **pendingRecovery window** *(tranche 2)* — The pair (h_req, deadline) where h_req = mined height of the accepted non-cancel RecoverOwner transaction on the canonical chain and deadline = h_req + challengeWindowBlocks. Cancel admissible iff mined height < deadline (strict); completion fires at the first canonical height >= deadline; one shared boundary, no gap or overlap. During an open window the current owner key remains the pre-request owner (pending recovery-auth). Recomputed from the request's new mined height on reorg. *(used by: R13, R14, R15, R16, R17, R18, X13, V2, Z2)*
- **maturity height** *(tranche 2)* — The first canonical-chain height at which a name's bond carries no ownership consequence: bond spend cannot invalidate (S14), transfers need no bond conjuncts (X8), recovery invocation is no longer admissible (R12). One boundary comparator pinned once for all consumers — legacy: height >= maturityHeight is mature, continuity binds strictly below. Computed as the spec-ratified settlement anchor + MATURITY_BLOCKS (anchor choice open, see S3 conflict; value is launch-freeze). *(used by: X6, X8, S2, S3, S4, S12, S14, R12)*
- **required bond amount** *(tranche 2)* — The per-name amount any successor bond must meet or exceed: set at settlement to the winning bid amount (S1) for auction-settled names; relation to the STATUS min-bond floor parameter (which governs opening/claim bonds) must be ruled in the same PR (see conflict). Comparator for successors: value >= required (to ratify per S13 neededSpecWork). *(used by: X6, S1, S13, R11)*
- **qualifying successor bond** *(tranche 2)* — An output at the event's declared successorBondVout in the same transaction that spends the name's current bond outpoint, of spendable payment-class script (objective script predicate to be specced — legacy scriptType === 'payment'), value >= the name's required bond amount, whose outpoint is not a reserved bond outpoint. For recovery, whether the script must pay the descriptor's recoveryAddress is open (R11 flag). u8 vout bounds successor outputs to index <= 255. *(used by: X6, X7, S6, S7, S13, R11)*
- **reserved bond outpoint** *(tranche 2)* — Membership in the kernel's bond-outpoint exclusivity set: outpoints currently serving as the live bond of a name, a pending acquisition, or (in/out to be ruled — legacy excludes them) a bond backing an accepted bid in an open auction. No two live names or pending acquisitions may reference the same outpoint (DECISIONS #5); contention between same-transaction events resolves deterministically by the intra-block/intra-transaction evaluation order (open gap). *(used by: X7, S13, R11)*
- **release height** *(tranche 2)* — The block height of the canonical-chain transaction whose spend broke a name's bond continuity (the invalidating spend), recorded as the anchor of the name's next auction generation (lot identity reopen-{name}-after-{release_height}). Needs a deterministic latest-rule with tx-level tiebreak for multiple same-height breaking observations; reorg-sensitive — re-derived from the current canonical chain only. *(used by: S7, S8, S9, Z2)*
- **commit priority** *(tranche 2)* — The deterministic total order over claim commits: ascending (anchor mined height, intra-block transaction index, txid). Resolves same-name multi-batch conflicts outside a live window (first-anchor-wins at the height level); orders merges inside a window but never awards a contested name. Requires intra-block position evidence in transcripts/witnesses (T*/B3 evidence-shape consequence). Tuple pinned by the Z7/B* spec PR; tranche-1 B* adopts the identical term. *(used by: Z6, Z7, Z3 (same shape, ratified Decision #25), tranche-1 B*, tranche-1 T* (position evidence))*
- **owner-signed chain acceptance** *(tranche 2)* — The shared parameterized predicate for §8.1 value records and §8.2 recovery descriptors: signed by the current owner key over the domain-labeled digest of the object's own fields; bound to the current ownership interval via ownershipRef; first entry has sequence exactly 1 and null previous hash; each successor has sequence exactly head+1 and previousHash equal to the recomputed signed digest of the current head (signature bytes deliberately excluded — content-addressed, malleability-proof); stale, gapped, mis-linked, or prior-interval entries reject. Defined once in V*, instantiated by R*. *(used by: V3, V4, V6, V7, V8, V9, R2, R3, R4)*
- **current owner key** *(tranche 2)* — The owner key recorded in the name's current state — the only key whose signature can move the name (X2), publish records (V2), arm descriptors (R2), or cancel a recovery (R15). Must be explicitly defined during an open pendingRecovery window (legacy: unchanged until completion) — the mid-window ambiguity is recovery-auth-blocked but the term needs one definition site so V2/X2/R15 cite it rather than each implying their own. *(used by: X2, X3, V2, R2, R15)*

## 1. Rule inventory (step 1)

Tranche 1 — the five canon-named areas:

### Anchor acceptance (A*)

- **A1.** The kernel MUST treat a mined OP_RETURN payload as a RootAnchor candidate only if it decodes exactly per the normative wire spec (5-byte frame with magic "ONT", version 0x01, event type 0x0b, then prevRoot(32) ‖ newRoot(32) ‖ batchSize(u32) — 73 bytes total); a payload that is truncated at any offset, carries trailing bytes, has wrong magic/version, or any other event type MUST NOT open a batch.
  *Sources:* `docs/spec/WIRE_FORMAT.md` §4.4 RootAnchor — 73 bytes (normative, wire-normative #48) — "frame ‖ `prevRoot`(32) ‖ `newRoot`(32) ‖ `batchSize`(u32)."; `docs/spec/WIRE_FORMAT.md` §4 Event layouts (normative) — "a decoder MUST reject truncated payloads (at any byte offset) and trailing bytes"; `docs/spec/WIRE_FORMAT.md` §3 Event frame (normative) — "A decoder MUST reject any event type byte not in the registry.".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/core/src/root-anchor.ts:43`.
  *Proposed tests:*
    - (−) A 0x0b payload truncated at every byte offset, and one with a single trailing byte, mined in a confirmed tx: no batch opens, kernel state is byte-identical to before.
    - (−) Mined payloads with version 0x02, bad magic, an unassigned type byte, and the retired 0x0d are never anchor candidates (reuse the B1 frame-sweep vectors at the kernel boundary).
    - (+) The 73-byte golden RootAnchor vector (pinned byte-identical against the BDK spike per canon Item 2) decodes and enters anchor evaluation with prevRoot/newRoot/batchSize bound exactly as decoded.
  *Attack flag:* Spec is silent on a transaction carrying multiple OP_RETURN outputs / multiple decodable anchors: legacy extracts ALL of them and silently skips malformed outputs (root-anchor.ts:43-56). Two implementations differing on skip-vs-reject or first-vs-all fork the namespace; the hardening pass must pin 'every output independently tested, exactly the decodable ones count' or an explicit one-anchor-per-tx rule.
  *Attack flag:* Silent-skip means an almost-valid anchor is invisible rather than invalidating: an attacker can craft a payload that decodes under a buggy lenient decoder but not under the spec decoder — conformance must sweep near-miss encodings.

- **A2.** Every availability and notice deadline for an anchored batch MUST be computed solely from the accepted anchor's mined block height; the kernel MUST NOT consume any other on-chain event (the retired AvailabilityMarker 0x0d included) or any off-chain/receipt timestamp as a deadline clock.
  *Sources:* `docs/core/DECISIONS.md` entry 47 marker-fold (ratified 2026-06-11) — "All deadline windows key off the anchor's mined height — a fact Bitcoin witnesses."; `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` §6b Key the timing decision off the anchor (candidate tier, rewritten per #47) — "the **anchor itself is the availability commitment**: a batch anchored at height `h` commits its leaves via the anchored root (and `batchSize`), and its bytes must be demonstrably servable by height `h+W`"; `docs/spec/WIRE_FORMAT.md` §3 Event type registry (normative) — "`0x0d` | **Retired — never reuse** (was AvailabilityMarker; marker-fold (#47))".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/core/src/indexer.ts:869`.
  *Proposed tests:*
    - (+) With an anchor mined at height h, every derived deadline is a pure function of h (h+W availability, h+W_notice notice); recomputing with identical inputs at different wall-clock times yields byte-identical verdicts.
    - (−) A mined legacy 41-byte AvailabilityMarker payload appearing between h and h+W changes no deadline verdict and no kernel state.
    - (−) Served-bytes evidence keyed to local receipt time (not a height-witnessed fact) cannot flip any verdict — the predicate signature admits no such input (the da-convergence-sim 'naive vs proposed' fork case re-expressed as a production negative test).
  *Attack flag:* Anchors are unsigned: a mempool observer can copy a publisher's anchor payload into its own transaction and mine it earlier, starting the h+W clock before the publisher intended (grief: the batch forfeits if bytes miss h+W). The spec nowhere addresses anchor-payload front-running; hardening must analyze it (cost is the copier's tx fee, and Σ-gates if gate-fee enforcement applies to the copy).
  *Attack flag:* A reorg moves the anchor's mined height and therefore every deadline; the clock is only stable under the K-depth rule (A3) plus a reorg rule that does not exist in spec text yet.

- **A3.** An anchored batch MUST NOT count toward the canonical root until the anchor's block is at least K blocks deep, with W ≤ K and K ≥ W + C; at and beyond that depth the eligibility verdict MUST be decidable from witnessed inputs alone and identical on every replay.
  *Sources:* `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` §6a Confirmation lag absorbs honest propagation (candidate tier) — "A delta anchored at height `h` is only eligible for the canonical root once `h` is K-deep. Set the availability window `W ≤ K`."; `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` §11 Prototype (candidate tier) — "The `K ≥ W + C` window invariant is enforced.".
  *Verdict:* **cited (restated)** — see step-2 correction below.
  *Step-2 correction:* Sources state different invariant strengths (§6a/§10: W ≤ K; §11 prototype: K ≥ W + C). Step-2 correction superseded by events: da-windows (#49, provisional pending DK, merged) pins the strong form K ≥ W + C as S6 — the rule restates per §6e and conflict C3 is resolved by that ruling.
  *Needed spec work:* W, C, K values are the open pre-B2 da-windows decision; the rule ships parameterized and the values are launch-freeze/named-decision work.
  *Blocked on decision:* `da-windows`.
  *Legacy evidence (never authority):* `packages/core/src/research/da-convergence-sim.ts:135`.
  *Proposed tests:*
    - (−) At confirmation depth K−1 the batch does not count toward the canonical root even with fully satisfying availability evidence.
    - (+) At depth K with satisfying evidence the batch counts, and the verdict is identical for verifiers replaying from genesis vs. live followers (parameterized over the eventual W/C/K ruling).
    - (−) Kernel construction with parameters violating W ≤ K or K ≥ W + C is rejected (invariant test, value-independent).
  *Attack flag:* DA agreement §6c describes the challenge outcome as having 'an objective, eventually-consistent answer' — 'eventually-consistent' is not a pure predicate; the B2 rule must be restated as decidable at a fixed height over a witnessed evidence set or the kernel cannot be pure.
  *Attack flag:* A reorg straddling the K boundary can flip eligibility; reorg handling is explicitly still open (OPEN_QUESTIONS §6) and rides on the same da-windows decision.

- **A4.** The anchored (newRoot, batchSize) pair is the exclusive commitment defining a batch's content: the kernel MUST NOT admit any leaf that fails membership verification against the anchored newRoot, and MUST NOT treat a served byte set inconsistent with the anchored commitment (including a leaf count that contradicts batchSize) as satisfying the anchor.
  *Sources:* `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` §8b The transport layer (candidate tier) — "The anchor commits the batch (root + `batchSize`); every node verifies fetched bytes against that on-chain commitment before using them."; `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` §6b (candidate tier) — "a batch anchored at height `h` commits its leaves via the anchored root (and `batchSize`)".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/core/src/indexer.ts:762`.
  *Proposed tests:*
    - (−) A leaf whose membership proof fails against the anchored newRoot (forged owner, stale root, wrong key) is excluded with zero state effect — the byte source is untrusted.
    - (−) A served byte set whose leaf count contradicts the anchored batchSize does not satisfy the anchor's commitment (and cannot feed Σ gates in the gate-fee predicate).
    - (+) An all-verifying leaf set consistent with batchSize merges exactly its own names and nothing else (equivocation vector: anchor one root, serve different bytes — detection is mechanical).
  *Attack flag:* Legacy code records batchSize for observability only and never cross-checks it against served leaves (indexer.ts:762) — a publisher can understate batchSize to shrink the Σ-gates the fee check requires while the root commits more leaves. The batchSize-consistency check must be stated explicitly at B2 hardening because the gate-fee rule's N must come from the commitment-checked batch, not the publisher's self-declared field.
  *Attack flag:* Per-leaf membership verification (legacy behavior) vs. full-batch root recomputation from prevRoot (RISKS equivocation defense) are different checks with different failure modes; the spec must pin which one defines 'the bytes match the commitment'.

- **A5.** A batched-claim leaf MUST enter name state only via a root that an accepted, mined RootAnchor committed; leaves presented against an unanchored root, or against an anchor the kernel rejected, MUST have no effect on kernel state.
  *Sources:* `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` §1 The convergence requirement (candidate tier) — "**(a)** its commitment is anchored in a Bitcoin block — *objective*, everyone sees Bitcoin"; `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Claim (candidate tier) — "A claim binds: - normalized name - intended owner key - Bitcoin anchor - full batch data needed for replay - fixed per-name gate amount".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/core/src/indexer.ts:885`.
  *Proposed tests:*
    - (−) Injecting fully-verifying leaves against a root that was never anchored on-chain changes nothing (legacy applyBatchData refusal re-expressed against the new kernel API).
    - (−) Leaves against a root whose anchor was observed but rejected (stale prevRoot, malformed) have no effect.
    - (+) The same leaves, after their root's anchor is accepted, merge deterministically — acceptance order of (anchor, bytes) arrival does not change the final state.
  *Attack flag:* The admission gate keys on the root value, not the anchor instance: if the same newRoot is ever re-anchored in a different context, leaves verify against both — anchor identity (txid) vs. commitment identity (root) must be disambiguated in the spec.

- **A6.** A batched-claim leaf is well-formed only if its accumulator key equals sha256 of the canonical name bytes and its committed value binds the claimed owner key; a leaf carrying a non-canonical name or an owner binding that does not verify MUST NOT enter name state.
  *Sources:* `docs/spec/ONT_PUBLISHER_PROTOCOL_SPEC.md` POST /claim/quote (candidate tier, hardens B3/B4) — ""leaf": "<32B hex = sha256(name)>"  // what leaf the publisher will insert"; `docs/spec/ONT_PUBLISHER_PROTOCOL_SPEC.md` POST /claim/quote (candidate tier) — "The wallet validates `leaf === sha256(name)` and `ownerCommitment === H(ownerPubkey)` before paying"; `docs/spec/WIRE_FORMAT.md` §2 Names (normative) — "a name inside any encoded payload appears only in canonical form. A decoder MUST reject a payload whose name bytes are non-canonical".
  *Verdict:* **split** — see step-2 correction below; cited half stands, the named clause is candidate-stays.
  *Step-2 correction:* The leaf-shape half stays cited; the owner-binding construction's authority is a JSON field comment in the adapter-tier publisher protocol spec — candidate-stays, and rides cross-area conflict C6. neededSpecWork: owner-binding construction stated at consensus tier.
  *Legacy evidence (never authority):* `packages/core/src/indexer.ts:810`.
  *Proposed tests:*
    - (−) A leaf whose key is not sha256(canonical name bytes) is rejected.
    - (−) A leaf whose committed value does not bind the claimed owner key is rejected (lying-publisher vector: right name, wrong owner binding).
    - (−) A leaf naming `Alice` (non-canonical bytes) is rejected, not normalized — reject-don't-normalize pinned at the kernel boundary exactly as §2 pins it on the wire.
    - (+) A well-formed leaf (key = sha256(name), value binds owner key) enters provisional state.
  *Attack flag:* Owner-binding divergence: the publisher spec commits H(ownerPubkey) as the leaf value, but the only code that ever ran binds the RAW ownerPubkey hex as the proof value (indexer.ts:811-813). Two constructions of 'value binds owner' fork the root; the served-bytes/leaf format spec (B3) must pin one before the B2 merge predicate is written.
  *Attack flag:* Legacy normalizes leaf names instead of rejecting non-canonical input (indexer.ts:804-809) — direct conflict with the wire's reject-don't-normalize law; the witness format must mandate canonical name bytes.

- **A7.** An anchor MUST extend the canonical root chain only if its prevRoot equals the canonical accumulator root at the anchor's position in Bitcoin order; an anchor whose prevRoot is stale, forged, or unknown MUST be rejected without changing the chain tip.
  *Sources:* `docs/GLOSSARY.md` anchor (candidate tier — describes the payload, does not state the acceptance rule) — "the on-chain commitment of a batch: one Bitcoin transaction whose OP_RETURN carries `prevRoot → newRoot` for the accumulator"; `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` §6a (candidate tier — implies a different linkage model) — "Deltas already prove against the **confirmed root `R_{h−K}`** (K blocks back), not the tip.".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* A named spec PR defining the root-chain transition rule: what an accepted anchor's prevRoot must equal, reconciling strict tip-linkage (the only behavior that ever ran — RootChain rejects stale_or_wrong_prev_root) with the delta-merge model (DA §6a: deltas prove against R_{h−K}; derived roots anchored after merge). No spec/ text currently states the acceptance semantics; the glossary only describes the payload.
  *Legacy evidence (never authority):* `packages/core/src/root-anchor.ts:121`.
  *Proposed tests:*
    - (−) An anchor whose prevRoot is the tip from two transitions ago is rejected and the tip is unchanged (the R2 stale-root-chaining vector).
    - (−) An anchor with a random/forged prevRoot is rejected.
    - (+) An anchor whose prevRoot equals the canonical root at its Bitcoin position extends the chain to its newRoot.
  *Attack flag:* Strict tip-linkage is a griefing surface: anyone who lands a tiny valid anchor first invalidates every other publisher's in-flight anchor for that tip (the R2 throughput collapse) — racing is free unless gate-fee enforcement prices each chain extension.
  *Attack flag:* The two linkage models give different verdicts for the same chain history; until the spec PR rules, any implementation choice is an invented rule (canon Item 1 violation).

- **A8.** The kernel MUST reject a no-op anchor (newRoot equal to prevRoot) and MUST NOT apply the same prevRoot → newRoot transition more than once; a duplicate or replayed anchor payload MUST leave kernel state unchanged.
  *Sources:* `docs/GLOSSARY.md` anchor (candidate tier — descriptive only) — "Anchoring is what gives a batch Bitcoin ordering and timestamping.".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* Same named spec PR as A7 (root-chain transition rule): no spec text states no-op rejection or duplicate-transition handling; legacy rejects no_op_transition and duplicates only as a side effect of tip movement.
  *Legacy evidence (never authority):* `packages/core/src/root-anchor.ts:125`.
  *Proposed tests:*
    - (−) An anchor with newRoot == prevRoot is rejected (no-op cannot consume a chain position or start any deadline clock).
    - (−) A byte-identical anchor payload mined a second time (replay/copy) does not re-apply; state after the duplicate equals state before it.
    - (+) A distinct valid transition applies exactly once.
  *Attack flag:* Duplicate-anchor handling determines which mined instance owns the deadline clock and the txid recorded in proof bundles — if the earliest copy wins, the unsigned-anchor front-running grief from A2 follows; the spec PR must state which instance is 'the' anchor.

- **A9.** When one block contains multiple RootAnchor candidates, the kernel MUST evaluate them in the block's transaction order, so that which anchor extends the chain (and which reject as stale) is deterministic and identical for every verifier.
  *Sources:* `docs/GLOSSARY.md` first-anchor-wins (candidate tier — states the claim-level rule, not the anchor-level one) — "the earliest Bitcoin-anchored claim holds. Ordering inside a window never awards a contested name (bonds do).".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* Same named spec PR as A7: same-block anchor ordering exists only in code (applyBlock walks transactions in order). DECISIONS entry 25 ratifies block-transaction-order tie-break for auction bids only — extending it to anchors is a new rule that needs its own spec text, not an analogy.
  *Legacy evidence (never authority):* `packages/core/src/root-anchor.ts:104`.
  *Proposed tests:*
    - (+) Two anchors with the same prevRoot in one block: the earlier-tx-index anchor extends the chain, the later one rejects as stale; the outcome is reproducible from the block alone.
    - (−) Property: no evaluation-order permutation an implementation might use internally can produce a different tip than the transaction-order result.
  *Attack flag:* A miner controls intra-block ordering and can choose which publisher's competing anchor applies — under bond-opens (#37) this can grief (invalidate a competitor's batch) but never award a name; the spec PR should state that bound explicitly so the residual is documented, not discovered.

- **A10.** The anchor-acceptance verdict MUST be a pure deterministic predicate over the anchor's event bytes, witnessed chain facts (mined height, txid, position in block, confirmation depth, transaction fee), prior kernel state, and witnessed served-bytes evidence; no network fetch, wall clock, database read, or publisher input may enter the decision.
  *Sources:* `docs/core/SOFTWARE_CANON.md` The boundary rule (ratified 2026-06-11) — "whether an anchor counts, whether a batch's bytes surfaced in time, whether the fees covered the batch, whether a transcript is complete enough to award — it lives in the kernel, as a pure predicate over witnessed inputs"; `docs/core/SOFTWARE_CANON.md` Layer vocabulary, L2 ownership kernel (ratified) — "No DB, no network, no clock, no UI".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:252`.
  *Proposed tests:*
    - (+) Property: identical (event bytes, chain facts, prior state, evidence) inputs produce byte-identical verdicts across runs, hosts, and replay-from-genesis vs. live-follow.
    - (−) Zero I/O imports in @ont/consensus, enforced by the research-quarantine-style boundary test the B2 gate requires.
    - (−) The predicate's type signature admits no wall-time, URL, or callback parameter through which availability could be 'checked live' instead of witnessed (the legacy batchDataProvider seam MUST NOT reappear inside the kernel).
  *Attack flag:* The legacy audited engine ignores RootAnchor events entirely (engine.ts:252) — anchor acceptance has never lived inside the audited boundary, so there is no boundary behavior to preserve; any 'mined' behavior comes from indexer code outside the manifest and routes through the spec first.
  *Attack flag:* DA §6c's challenge phrasing tempts an implementation to poll mirrors at verdict time; the served-evidence must arrive as a B3-witnessed input or purity is silently broken.

- **A11.** An accepted anchor MUST NOT change the owner, value records, or transfer state of any existing name: anchored batches are insertion-only, and a batched claim MUST NOT take a name that is already final.
  *Sources:* `docs/core/DECISIONS.md` entry 26 V1 on-chain event set (ratified, amended by #47) — "root anchors and availability markers support batched acquisition; they do not authorize transfers or mutable value updates"; `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` §5 The key decomposition (candidate tier) — "A delta only **inserts** names; it never mutates an existing name (transfers are separate and owner-signed). Uniqueness is enforced at insertion."; `docs/GLOSSARY.md` first-anchor-wins (candidate tier) — "when the same name is claimed on different batches outside a live window, the earliest Bitcoin-anchored claim holds".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/core/src/indexer.ts:835`.
  *Proposed tests:*
    - (−) A batch leaf for an already-final name with a different owner: the takeover is refused, the existing owner is unchanged (first-anchor-wins denial protection).
    - (−) No anchored batch content can alter any name's transfer chain or value-record head — anchors carry no authorization and the kernel exposes no path from batch data to mutation.
    - (+) Insertion of a not-yet-claimed valid name via an accepted anchor creates exactly one provisional claim.
  *Attack flag:* Uniqueness is enforced against kernel state, which depends on the DA verdicts of earlier batches: a name 'already inserted' by a later-forfeited batch must not block honest re-claiming — the insertion-uniqueness check must be defined over the post-DA-verdict state, and the spec does not yet say so.

- **A12.** When the same claim (name plus owner key) appears in more than one accepted anchor, the kernel MUST key the claim's entire lifecycle off the earliest accepted anchor; a later re-anchor of the same claim MUST NOT extend, reset, or shift its notice window or deadlines.
  *Sources:* `docs/GLOSSARY.md` first-anchor-wins (candidate tier) — "the earliest Bitcoin-anchored claim holds"; `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` §11 Prototype (candidate tier) — "a batch that missed the window simply re-anchors later and registers at the valid height; nothing is permanently lost for the long tail".
  *Verdict:* ~~cited~~ → **candidate-stays** (step-2 correction).
  *Step-2 correction:* Neither source states the window-keying content (GLOSSARY first-anchor-wins covers priority, not window restarts). Downgraded; resolution rides cross-area conflict C1.
  *Legacy evidence (never authority):* `packages/core/src/indexer.ts:845`.
  *Proposed tests:*
    - (+) Same name+owner re-anchored at h2 > h1: lifecycle stays keyed to h1; the notice-window close height is unchanged after the re-anchor.
    - (−) A re-anchor cannot extend provisionality or restart a window that was about to close (anti-stalling: an owner cannot keep a name perpetually provisional by re-anchoring).
    - (+) Out-of-order witnessing (the later anchor's bytes arrive first): the final state still keys to the earliest accepted anchor — arrival order is irrelevant.
  *Attack flag:* Interaction with §11's missed-window re-anchor path: a claim whose first anchor forfeited DA must register 'at the valid height' (the re-anchor), while a claim whose first anchor was valid keys to the first — earliest-VALID-anchor, not earliest-anchor, is the precise rule and the spec text does not yet draw that line; a withholder must not inherit its forfeited anchor's earlier priority (that would resurrect withhold-then-reveal).

- **A13.** Each batched claim's notice window MUST open at the claim's (earliest valid) anchor mined height, and the finalize / nullify / contested outcome MUST be derived only at currentHeight ≥ anchorHeight + W_notice as a pure function of chain facts at that height; W_notice is a parameter, not a value this rule fixes.
  *Sources:* `docs/core/DECISIONS.md` entry 37 bond-opens (ratified 2026-06-04) — "a verifier checks, at `currentHeight ≥ anchorHeight + W_notice`, whether a qualifying bond landed"; `docs/GLOSSARY.md` notice window (candidate tier) — "the waiting period a claim's anchor opens before the claim can finalize"; `docs/GLOSSARY.md` final (candidate tier) — "Finality is derived from chain state at the window's closing height, not from any server's say-so.".
  *Verdict:* **cited**.
  *Needed spec work:* W_notice is a STATUS placeholder ('6 blocks (test); target = weeks', explicitly not frozen) — placeholders cannot ground a value, so the rule ships parameterized; freezing W_notice (and the height-keyed decay schedule recommended in AUCTION.md) is launch-freeze work.
  *Legacy evidence (never authority):* `packages/core/src/indexer.ts:517`.
  *Proposed tests:*
    - (+) Parameterized: at currentHeight = anchorHeight + W_notice with exactly one claim and no qualifying bond, the claim finalizes; at close−1 it is still provisional (pins the ≥ comparison with vectors at close−1, close, close+1).
    - (−) A qualifying bond landing before the close prevents finalization (escalates to auction); the same bond landing after the close cannot reopen or contest the final claim.
    - (−) No input other than chain facts at the evaluation height can change the outcome (a publisher receipt or resolver assertion of finality is not an input).
  *Attack flag:* Boundary off-by-one: legacy uses height ≥ closeHeight for finality (indexer.ts:517) but blockHeight ≤ closeHeight for in-window collision (indexer.ts:828) — events landing exactly at the close height are simultaneously 'in-window' and 'window-closed'; the hardening pass must pin one half-open interval or two implementations disagree on boundary-block bonds and collisions.

- **A14.** Anchor acceptance MUST NOT depend on the identity of the anchor transaction's funder, broadcaster, or publisher: any Bitcoin transaction carrying a well-formed RootAnchor is evaluated by the same predicate, with no allowlist, registration, or identity input.
  *Sources:* `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Design Rule (candidate tier) — "Publishers and resolvers help users publish, store, find, and verify data. They never decide who owns a name. Ownership is the deterministic result of Bitcoin ordering, ONT validity rules, public notice, and owner-key signatures."; `docs/core/DECISIONS.md` Fairness Principles To Carry Into The Launch Rewrite — "Names with the same objective policy inputs are treated identically by the protocol."; `docs/spec/ONT_PUBLISHER_PROTOCOL_SPEC.md` Goals (candidate tier) — "**Replaceable:** any publisher can serve any wallet; a wallet can fall back to a different publisher or to direct L1.".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/core/src/root-anchor.ts:43`.
  *Proposed tests:*
    - (+) Property: the acceptance predicate's input signature contains no publisher/broadcaster identity; two byte-identical anchors funded from unrelated wallets yield identical verdicts.
    - (−) No configuration input (allowlist, trusted-publisher set) exists through which one of two otherwise-identical anchors could be refused — the self-anchored batch-of-one (the L1 fallback in ONT_ISSUANCE_FEE_MECHANICS §4) is accepted by exactly the same rule.
  *Attack flag:* Miner self-issuance: a miner mining its own anchor recaptures the gate fee (ISSUANCE_FEE §8 names this as a known, hashrate-bounded residual) — neutrality means the kernel cannot and should not detect it; the spec should restate the bound so reviewers don't read it as a gap.

**Gaps — Anchor acceptance duties with no spec text at all:**

- Root-chain transition semantics: no spec/ text states what an accepted anchor's prevRoot must equal, how competing anchors on the same tip resolve, whether no-op/duplicate anchors reject, or how same-block anchors order (A7-A9 are grounded only in packages/core/src/root-anchor.ts). The strict tip-linkage the legacy RootChain enforces and the delta-merge model (deltas proven against R_{h−K}, DA §6a) are two incompatible linkage rules and no document chooses.
- Multiple anchors per transaction / multiple OP_RETURN outputs: no document says whether all decodable anchor outputs count, only the first, or the tx is invalid; legacy silently collects all and skips malformed outputs (root-anchor.ts:43-56).
- Reorg handling for accepted anchors: rollback/re-evaluation of anchor-derived state when an anchor's block reorgs has no spec text (OPEN_QUESTIONS §6 marks it 'still open: reorg handling, which is the W/C/K window design') — it interacts with the da-windows decision but the state-rollback rule itself is unwritten.
- Acceptance-stage composition: no document orders the sub-verdicts (structural validity, prevRoot linkage, gate-fee, DA eligibility) or says whether a fee-invalid or DA-forfeited anchor still consumes its prevRoot → newRoot chain position; every ordering gives a different griefing surface and none is specified.
- Anchor identity in kernel state: no spec text pins which chain facts are recorded per accepted anchor (txid, mined height, tx index) and which identifier names the batch (newRoot vs anchor txid) for cross-referencing by proof bundles and the DA evidence — the glossary's 'anchors' in the proof-bundle entry has no defined identifier.


### DA verdict (D*)

- **D1.** The kernel's DA verdict MUST be computable as a pure deterministic predicate over (anchor facts: mined height, anchored root, batchSize; served-bytes evidence; window parameters W, C): identical inputs MUST yield the identical verdict on every verifier, and no local receipt time, wall clock, database, or network access may participate in the decision.
  *Sources:* `docs/core/SOFTWARE_CANON.md` Layer vocabulary, L2 ownership kernel row [ratified] — "the fail-closed data-availability deadline verdict ... as pure deterministic predicates ... No DB, no network, no clock, no UI"; `docs/core/DECISIONS.md` 47. marker-fold, Implications [ratified decision log] — "The B2 DA verdict is the pure predicate `eligible(anchor, servedEvidence, W, C)`"; `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` 6b. Key the *timing* decision off the anchor [candidate] — "The clock starts at the anchor's mined height — a fact Bitcoin witnesses, identical for everyone".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/core/src/research/da-convergence-sim.ts:95`.
  *Proposed tests:*
    - (+) Property: the verdict is identical across simulated verifier nodes with deliberately divergent local receipt data, and invariant under evaluation order/permutation of the evidence set.
    - (−) A predicate variant keyed on per-node local receipt height produces divergent roots (re-express the legacy fork-vs-converge test as the documenting negative).
    - (−) Zero-I/O-imports enforcement test on @ont/consensus (research-quarantine style): any import of network/fs/clock modules fails the build.
  *Attack flag:* Purity is only as strong as the servedEvidence definition: if the B3 witness is not independently verifiable, two honest verifiers hold different 'witnessed facts' and the pure predicate converges on nothing — DA agreement §8b explicitly puts the convergence burden on the evidence rules.

- **D2.** The DA verdict MUST be the boolean predicate eligible(anchor, servedEvidence, W, C), consuming exactly the anchor's witnessed facts (mined height, anchored root, batchSize per the normative RootAnchor layout) plus the evidence layer's served-bytes witness; it MUST NOT consume any other on-chain event, marker height, or publisher self-attestation.
  *Sources:* `docs/core/DECISIONS.md` 47. marker-fold, Implications [ratified decision log] — "The B2 DA verdict is the pure predicate `eligible(anchor, servedEvidence, W, C)`; B3 defines the served-bytes witness format it consumes"; `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` 10. What this resolves vs. what's still open, item 2 [candidate] — "the B2 kernel predicate `eligible(anchor, servedEvidence, W, C)` and the B3 served-bytes witness format it consumes"; `docs/spec/WIRE_FORMAT.md` 4.4 RootAnchor — 73 bytes [normative] — "frame ‖ `prevRoot`(32) ‖ `newRoot`(32) ‖ `batchSize`(u32)".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/core/src/research/da-convergence-sim.ts:31-49`.
  *Proposed tests:*
    - (+) API-level test: the predicate evaluates from (anchor, servedEvidence, W, C) alone — no other inputs exist in the signature or are reachable.
    - (−) Evidence objects carrying foreign fields (e.g. a legacy markerHeight) MUST NOT change the verdict; an evidence shape that fails the witness schema is rejected, never partially consumed.
  *Attack flag:* servedEvidence has no specified format yet (B3): until pinned, 'demonstrably servable by h+W' is not machine-decidable and any implementation choice smuggles evidence semantics the spec never ratified.

- **D3.** For a batch whose anchor is mined at height h, the availability deadline MUST be computed as h+W and the challenge deadline as h+W+C, where h is the anchor transaction's mined block height; no other timestamp (broadcast time, first-seen height, publisher assertion) may enter the deadline arithmetic.
  *Sources:* `docs/core/DECISIONS.md` 47. marker-fold, The rule [ratified decision log] — "a batch anchored at height `h` must have its bytes demonstrably servable by `h+W`, with the fail-closed challenge window (`h+W+C`)"; `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` 6b. Key the *timing* decision off the anchor [candidate] — "its bytes must be demonstrably servable by height `h+W`. The clock starts at the anchor's mined height".
  *Verdict:* **cited**.
  *Blocked on decision:* `da-windows`.
  *Legacy evidence (never authority):* `packages/core/src/research/da-convergence-sim.ts:96-101`.
  *Proposed tests:*
    - (+) Parameterized vectors at several (W,C) pairs: evidence with first-servable height inside the window yields eligible.
    - (−) withhold-past-W: first-servable height past the deadline yields excluded at every later evaluation height.
    - (−) Deadline computed from any height other than the anchor's mined height (e.g. anchor first-seen or evidence-arrival height) fails the conformance vector.
  *Attack flag:* Boundary inclusivity ('by height h+W') is not pinned in spec text — ≤ vs < differs by one block and only the sim's ≤ exists (see D13).
  *Attack flag:* Reorg can change h itself; verdict behavior across an anchor reorg is unspecified (DECISIONS Open Question 6: 'Still open: reorg handling, which is the W/C/K window design').

- **D4.** If no party serves bytes matching the anchored commitment by the challenge deadline, every verifier MUST exclude the batch; the verdict fails closed — absent or insufficient served-evidence MUST yield ineligible, never a trusted or provisional include.
  *Sources:* `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` 6c. Fail closed, with an attributable challenge [candidate] — "If a delta is anchored but its **bytes can't be produced by anyone** within a second challenge window, it is **uniformly excluded** — every honest node drops it"; `docs/core/DECISIONS.md` 47. marker-fold, The rule [ratified decision log] — "the §6c uniform-exclusion rule of the DA agreement unchanged"; `docs/GLOSSARY.md` data availability [candidate] — "a batch whose bytes don't surface in time is excluded, never trusted".
  *Verdict:* **cited**.
  *Blocked on decision:* `da-windows`.
  *Legacy evidence (never authority):* `packages/core/src/research/da-convergence-sim.test.ts:98`.
  *Proposed tests:*
    - (−) anchor-but-don't-serve: an anchored batch with no service evidence is excluded by every simulated verifier.
    - (−) Fail-closed default: missing/empty servedEvidence yields excluded, not pending-include or fail-open.
    - (+) Commitment-matching service inside the window yields eligible.
  *Attack flag:* 'Bytes can't be produced by anyone' quantifies over an open server set — a pure predicate sees only the evidence presented to it, so evidence-gathering completeness is silently delegated to B3/adapters; an under-collecting adapter turns fail-closed exclusion into censorship of honest batches.
  *Attack flag:* Partial service is unaddressed: whether serving a strict subset of a batch's leaves makes the batch (or only those leaves) eligible has no spec text — the legacy indexer merged per-leaf while the sim excluded per-batch.

- **D5.** Bytes first served after the challenge deadline MUST NOT revive an excluded anchor; the only path back for the affected leaves is a new anchor, which starts its own window and registers at the new anchor's height with no priority inherited from the excluded anchor.
  *Sources:* `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` 6d. Contested leaves: hard window, escalate to L1 [candidate] — "Miss it → **forfeit priority**"; `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` 11. Prototype (2026-05-23) [candidate] — "a batch that missed the window simply re-anchors later and registers at the valid height"; `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` 6b. Key the *timing* decision off the anchor [candidate] — "bytes that miss `h+W` forfeit per §6c/§6d".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/core/src/research/da-convergence-sim.test.ts:182`.
  *Proposed tests:*
    - (−) serve-after-C revival attempt: evidence with first-servable height past the challenge deadline never flips the verdict at any later evaluation height.
    - (+) Same leaves re-anchored at h' become eligible under the new anchor's window and register effective at h'.
    - (−) A re-anchored batch claiming the original excluded anchor's height/priority is rejected — no priority inheritance.
  *Attack flag:* Permanence of exclusion ('permanently', 'late revival is impossible by rule') is stated only in analysis-tier text (research/DA_MARKER_FOLD.md §3); spec §6c says 'uniformly excluded' without an explicit no-revival clause, so an implementer could read exclusion as evaluation-time-relative. The hardening pass must add explicit no-revival spec text.

- **D6.** A claim from a batch that failed the availability deadline MUST NOT hold or take priority on a contested name: a later-revealed claim, however much earlier anchored, MUST NOT evict a claim whose batch met its deadline, and an excluded batch MUST be filtered out before any priority or merge comparison runs.
  *Sources:* `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` 6d. Contested leaves: hard window, escalate to L1 [candidate] — "To hold priority on a *contested* name, a claim's data must be demonstrably available by the hard deadline (6b). Miss it → **forfeit priority**"; `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Data Availability [candidate] — "contested names rely on the hard availability deadline so hidden claims cannot appear later and steal priority".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/core/src/research/da-convergence-sim.test.ts:136 (and the drop-before-merge rule at da-convergence-sim.ts:133-137)`.
  *Proposed tests:*
    - (−) Withhold-then-reveal: attacker anchors earlier on a contested name, withholds, reveals after the deadline — the in-time honest claimant wins on every verifier.
    - (+) Both claimants in time: the contest proceeds under the batched-path/bond-opens rules with neither excluded.
    - (−) Property: filtering an excluded delta before merge is equivalent to it never existing — it never participates in commit-priority tie-breaks.
  *Attack flag:* Selective reveal at the boundary: an attacker who arranges first-servable exactly at the deadline exploits D13's unpinned inclusivity to win on some implementations and lose on others — a convergence fork on a contested name, the worst case in §3.

- **D7.** Excluding a batch MUST remove only that batch's own leaves from consideration; exclusion MUST NOT alter, freeze, or take any name claimed in other batches, and the resulting state MUST equal the state computed as if the excluded batch never existed.
  *Sources:* `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Data Availability [candidate] — "exclusion cannot take someone else's name; it only prevents the withheld data from counting"; `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` 4. What the self-harm reframe does — and doesn't — fix [candidate] — "a hidden delta only fails to register *its own* names; it can't freeze or corrupt anyone else's".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/core/src/research/da-convergence-sim.test.ts:67-95`.
  *Proposed tests:*
    - (+) With batch X excluded, every other batch's names register identically to a world where X was never anchored (state equivalence property).
    - (−) An exclusion implementation that perturbs an unrelated name's owner or the root over remaining leaves fails the property.
  *Attack flag:* The guarantee leans on the insert-only/commutative merge fact (§5): if batched-path transitions ever admit non-insert operations inside batches, exclusion stops being self-contained — a scope coupling the batched-path area must hold.

- **D8.** Served bytes count toward the verdict only if they verify against the anchored commitment (the anchored root, with batchSize); bytes failing the commitment MUST NOT count as service, bytes for a root never anchored MUST be refused, and the identity of the byte source or transport MUST NOT affect the verdict.
  *Sources:* `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` 8b. The transport layer [candidate] — "every node verifies fetched bytes against that on-chain commitment before using them. So a byte source can't lie: wrong bytes fail the commitment no matter who delivered them"; `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` 6c. Fail closed, with an attributable challenge [candidate] — "has *anyone* served bytes matching the anchored commitment?".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/core/src/indexer.ts:885-894 (applyBatchData refuses unanchored roots) and indexer.ts:796-821 (mergeVerifiedLeaves drops leaves failing proof against the anchored root)`.
  *Proposed tests:*
    - (−) wrong-bytes-matching-nothing presented as service has no effect on the verdict.
    - (−) Bytes verifying against a root that was never an applied on-chain anchor are refused — no state can be injected against an unanchored root.
    - (+) Identical commitment-matching bytes delivered via different sources/mirrors yield the identical verdict (transport independence).
  *Attack flag:* batchSize's role is underspecified: the anchor 'commits its leaves via the anchored root (and batchSize)' but nothing says whether service must cover exactly batchSize leaves, or what the verdict is when an anchor's batchSize contradicts the bytes the root verifies — a publisher could anchor a true root with a false batchSize.

- **D9.** A batch anchored at height h MUST NOT enter the canonical confirmed root until h is K-deep, and the window parameters MUST fit inside the confirmation lag so the whole eligibility decision resolves before finalization — the spec states W ≤ K, and the enforced prototype invariant is K ≥ W + C.
  *Sources:* `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` 6a. Confirmation lag absorbs honest propagation [candidate] — "A delta anchored at height `h` is only eligible for the canonical root once `h` is K-deep. Set the availability window `W ≤ K`."; `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` 11. Prototype (2026-05-23) [candidate] — "The `K ≥ W + C` window invariant is enforced.".
  *Verdict:* **cited**.
  *Blocked on decision:* `da-windows`.
  *Legacy evidence (never authority):* `packages/core/src/research/da-convergence-sim.ts:85-87 (validateWindows: K >= W+C) and :146 (finalizedThrough = now - K)`.
  *Proposed tests:*
    - (+) An eligible anchor at h is absent from the confirmed root while tip < h+K and present once tip ≥ h+K.
    - (−) A parameter triple with K < W+C is rejected at kernel construction.
    - (−) A batch whose challenge deadline has not passed at the finalization height never finalizes into the confirmed root (no include-then-retract).
  *Attack flag:* §6a's stated constraint (W ≤ K) is weaker than the prototype's enforced invariant (K ≥ W+C): with C > 0 and W = K the challenge resolves after finalization, opening a divergence window the spec text as written permits. The hardening pass must pick the strong form explicitly.

- **D10.** A claim from a batch that fails the DA verdict MUST NOT count for any lifecycle purpose: it cannot finalize, cannot collide/nullify another claim, cannot stand as the claim a qualifying bond escalates against, and cannot hold provisional status.
  *Sources:* `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Data Availability [candidate] — "A claim only counts if the underlying batch data is available under the protocol's DA rule."; `docs/core/DECISIONS.md` 7. One-path acquisition [ratified decision log, amended by #37] — "If no competing DA-valid claim for the same name lands in the window, the name finalizes"; `docs/spec/AUCTION.md` Provisional Utility [candidate] — "`provisional` | claim anchored, DA-valid, notice window open".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/core/src/indexer.ts:822-841 (live collision/nullify logic applies to any root-verified leaf with no DA-deadline gate — the disclosed gap)`.
  *Proposed tests:*
    - (−) A withheld competing claim does not nullify an available claim at window close.
    - (−) A claim from an excluded batch never finalizes and is never reported provisional.
    - (+) The sole DA-valid claim finalizes even when excluded batches also claimed the same name.
  *Attack flag:* Nullification-by-withholding: if collision counting runs before the DA verdict is resolvable (claims still inside h+W+C at window arithmetic time), an attacker griefs with anchored-withheld collisions; the composition order of DA verdict × notice-window arithmetic is unspecified and must be pinned jointly with the batched-path area.

- **D11.** The kernel MUST NOT accept or consume any availability-marker event: wire type 0x0d is retired-never-reuse and rejected at decode, and no kernel deadline may key off any on-chain event other than the anchor itself.
  *Sources:* `docs/spec/WIRE_FORMAT.md` 3. Event frame — Event type registry [normative] — "`0x0d` | **Retired — never reuse** (was AvailabilityMarker; marker-fold (#47))"; `docs/spec/WIRE_FORMAT.md` 4.5 AvailabilityMarker (0x0d) — RETIRED [normative] — "A v1 decoder MUST reject `0x0d`"; `docs/core/DECISIONS.md` 47. marker-fold, The rule [ratified decision log] — "The separate on-chain availability marker (wire event `0x0d`) is retired."; `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` 6b. Key the *timing* decision off the anchor [candidate] — "No second event exists, so the anchor-now-publish-later flow — anchoring while withholding bytes for later reveal — is impossible to *signal*".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/core/src/research/da-convergence-sim.ts:40-41 (markerHeight input — the pre-fold shape the new kernel must not reproduce)`.
  *Proposed tests:*
    - (−) Kernel-level re-assertion that no marker-typed event reaches the predicate (the wire-level 0x0d reject vector already exists in the B1 suite).
    - (−) The predicate's input schema has no marker-height slot; an evidence/anchor object smuggling one is rejected by schema, not silently ignored differently across implementations.
    - (+) The verdict is fully computable from the anchor's witnessed facts plus served evidence alone.
  *Attack flag:* The reopen trigger is live: marker-fold reopens by named spec PR if external review surfaces a consensus role for a second timestamp before the B2 kernel freezes its DA predicate — the predicate freeze checklist must check that trigger explicitly.

- **D12.** W, C, and K MUST enter the kernel as explicit consensus parameters; no DA rule may hard-code window values, and no conformance vector may pin the research-sim defaults (K=6, W=2, C=3) or any other numbers as protocol values before the launch-parameter freeze.
  *Sources:* `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` 10. What this resolves vs. what's still open, item 1 [candidate] — "**Pin the windows.** Choose `K` (confirmation depth), `W ≤ K` (availability deadline, measured from the anchor's mined height), and the challenge window"; `docs/core/SOFTWARE_CANON.md` Item 5 — B2 gate [ratified] — "ChatLunatique signs the CONSENSUS_PARAMS surface"; `docs/core/STATUS.md` Known-incomplete [candidate/parameter table] — "The data-availability windows are enforced only in the research simulations.".
  *Verdict:* **cited**.
  *Needed spec work:* W/C/K values are launch-freeze work; STATUS.md's parameter table currently has no W/C/K rows even as placeholders — rows must be added when da-windows is ruled, and the values frozen before launch.
  *Blocked on decision:* `da-windows`.
  *Legacy evidence (never authority):* `packages/core/src/research/da-convergence-sim.ts:69-72 (createDefaultDaWindows K=6/W=2/C=3 — research placeholders)`.
  *Proposed tests:*
    - (+) Property over the parameter space satisfying D9's constraint: the predicate is total and correct at multiple (W,C,K) triples, not just one.
    - (−) Kernel construction rejects missing or invalid parameters (non-integer, negative, K < W+C).
  *Attack flag:* Sim defaults can fossilize: vectors written against K=6/W=2/C=3 risk becoming de-facto frozen parameters — the inventory rule says placeholders cannot pass candidate.

- **D13.** Deadline comparisons MUST be inclusive: bytes first servable at exactly height h+W meet the availability deadline, and at exactly h+W+C meet the challenge deadline.
  *Sources:* `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` 6b. Key the *timing* decision off the anchor [candidate — grounds the boundary's existence, not its inclusivity] — "its bytes must be demonstrably servable by height `h+W`".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* Named spec PR amending DA agreement §6b/§6c to pin inclusive (≤) deadline comparisons with explicit boundary vectors; today the ≤ reading exists only in sim code.
  *Legacy evidence (never authority):* `packages/core/src/research/da-convergence-sim.ts:97-101 (markerHeight <= deadline, networkServableFromHeight <= serveDeadline)`.
  *Proposed tests:*
    - (+) first-servable = h+W exactly yields eligible (boundary vector).
    - (−) first-servable = h+W+C+1 yields excluded; an implementation using strict < fails the h+W boundary vector.
  *Attack flag:* A one-block ambiguity at the deadline is a convergence fork by construction — exactly the boundary-divergence class §3 warns about; any cross-implementation disagreement here splits roots on contested names.

- **D14.** A swapped, sharded, or hostile evidence implementation MUST NOT be able to change any DA verdict given the same witnessed facts: the verdict is a function of the presented witness data only, and the kernel MUST validate the witness's verifiability rather than trust the evidence layer's conclusion.
  *Sources:* `docs/core/SOFTWARE_CANON.md` Layer vocabulary — the boundary rule [ratified] — "The evidence layer *witnesses* facts (and can be swapped, sharded, or distrusted); it can never override a kernel verdict."; `docs/core/SOFTWARE_CANON.md` Item 5 — B3 gate [ratified] — "a swapped or hostile evidence implementation cannot change any kernel verdict (negative-test battery)".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `apps/resolver/src/index.ts:1163-1209 (live DA loop: trusted fetch-with-backoff, no deadline, no adversarial-evidence handling — the behavior this rule replaces)`.
  *Proposed tests:*
    - (−) Negative battery: forged witness (false first-servable height where checkable), truncated witness, and witness bound to a different anchor are rejected or verdict-neutral — never flip a verdict to eligible.
    - (+) Two independent evidence implementations feeding identical witnessed facts produce the identical kernel verdict.
  *Attack flag:* The hard case: a witness asserting an earlier first-servable height is not self-verifying from chain data — unless B3's format makes servability evidence independently checkable, the kernel ends up trusting an evidence-layer assertion, honoring the boundary rule in form while violating it in substance. This is the design's own #1 external-review ask (OPEN_QUESTIONS §1, item 1).

**Gaps — DA verdict duties with no spec text at all:**

- Served-bytes witness definition: no spec text defines what evidence of 'demonstrably servable by h+W' IS (admissible witness shape, who may produce it, how first-servable height is established). Explicitly deferred to B3 (DA agreement §10 item 2, OPEN_QUESTIONS §1 item 1), but the kernel's acceptance predicate over servedEvidence cannot be written without it — the predicate is currently a typed hole.
- Verdict granularity (per-leaf vs whole-batch): no spec text says whether unserved/unverifiable leaves exclude the whole batch or only those leaves. The legacy indexer merged per-leaf (indexer.ts:796-821); the research sim excluded per-batch — two incompatible behaviors, neither ratified.
- Reorg semantics of the verdict: the anchor's mined height h can change or vanish in a reorg; no spec text covers re-evaluation, window restart, or verdict stability across reorgs (DECISIONS Open Question 6 marks reorg handling open and part of the W/C/K window design — blocked on da-windows).
- Duplicate anchors sharing one root: when the same newRoot is anchored at two heights, no spec text says which anchor's height starts the DA clock (marker-fold removed marker-to-anchor matching but not anchor duplication).
- Pending-state semantics: what the kernel reports for an anchor whose challenge window is still open at the evaluation height (not-yet-decidable vs excluded-until-proven) has no spec text; AUCTION.md's 'provisional ... DA-valid' state presupposes an answer no rule provides.
- batchSize consistency: no spec text defines the verdict for an anchor whose batchSize field contradicts the leaves the anchored root verifies.
- W/C/K parameter rows are entirely absent from STATUS.md's parameter table — not even placeholders exist for the area's only numeric parameters.


### Gate-fee validation (F*)

- **F1.** A batch anchor committing to N names MUST count toward the canonical root only if its Bitcoin transaction paid a miner fee F >= the sum of the per-name gate amounts (Sigma g_i) of the names in the batch; an anchor whose transaction fee is below Sigma g_i MUST NOT contribute any name to name state.
  *Sources:* `docs/spec/ONT_ISSUANCE_FEE_MECHANICS.md` 4. Recommended mechanics — the gate *is* the anchor's miner fee — "counts toward the canonical root **only if its Bitcoin transaction paid a fee `F ≥ Σ gᵢ`.**"; `docs/ONT.md` What's real today — designed, built, live — "the rule that a batch's Bitcoin fee must cover the full ₿1,000 × N of the names inside it"; `docs/core/SOFTWARE_CANON.md` Layer vocabulary (L2 ownership kernel row) — "aggregate gate-fee validation"; `docs/core/DECISIONS.md` 44. boundary-manifest — "cheap-rail finalization rules and anchor-acceptance rules (aggregate gate-fee validation, DA deadline enforcement) to move inside".
  *Verdict:* **cited**.
  *Needed spec work:* Gate amount g = ₿1,000 is a STATUS placeholder/baseline; the rule is parameterized on g, value frozen at launch-parameter freeze.
  *Legacy evidence (never authority):* `apps/publisher/src/index.ts:80`.
  *Proposed tests:*
    - (−) Anchor tx for a 10,000-name batch paying only a typical blockspace fee (e.g. 500 sats, the legacy publisher default) is excluded: zero of its names enter name state.
    - (−) Anchor tx paying Sigma g_i minus 1 satoshi is excluded (exact boundary, off-by-one).
    - (+) Anchor tx paying exactly Sigma g_i counts; all N names become eligible (fee equality is sufficient, no strict-greater requirement).
    - (+) Anchor tx paying Sigma g_i plus blockspace overhead counts identically (overpayment never invalidates).
  *Attack flag:* Sigma g_i is only computable once the batch contents are known: a fee verdict issued before the DA window resolves can be gamed by withholding bytes — the fee predicate must compose with the DA verdict, never run on self-declared totals.
  *Attack flag:* Fee mechanics doc is candidate tier and self-describes as 'Not yet a frozen spec' — hardening must promote section 4 before B2 freezes this predicate.

- **F2.** The fee fact F the kernel consumes MUST be the anchor transaction's intrinsic fee, computed as Sigma(input values) − Sigma(output values) from witnessed Bitcoin facts; no asserted fee value (publisher claim, receipt, or off-chain attestation) may substitute for the computed fee.
  *Sources:* `docs/spec/ONT_ISSUANCE_FEE_MECHANICS.md` 4. Recommended mechanics — the gate *is* the anchor's miner fee — "compute the anchor tx's exact fee (`Σ inputs − Σ outputs`) and check it. No oracle, no off-chain trust"; `docs/spec/ONT_ISSUANCE_FEE_MECHANICS.md` 5. Why this satisfies every invariant — "the fee is checked from Bitcoin, not asserted by anyone".
  *Verdict:* **cited**.
  *Proposed tests:*
    - (+) Fee-computation vector: given witnessed prevout values and outputs, the predicate recomputes F byte-deterministically and matches the pinned value.
    - (−) An envelope/witness carrying an asserted fee field that contradicts the computed Sigma inputs − Sigma outputs is ignored: the verdict follows the computed value.
    - (−) Anchor with one prevout value witness missing yields no fee fact and the anchor MUST NOT count (fail-closed, see attack flag).
  *Attack flag:* The spec grounds the check in 'a full verifier already replays Bitcoin and holds the UTXO set' — that is I/O outside the pure kernel; B3 must deliver prevout-value witnesses as chain facts, and the predicate's behavior when a prevout witness is absent is specified nowhere (fail-closed is implied, not stated).
  *Attack flag:* Out-of-band miner payment or CPFP child fees are not part of Sigma inputs − Sigma outputs of the anchor tx; the spec never states explicitly that only the anchor transaction's own intrinsic fee counts, leaving a lobbying surface ('the package paid enough').

- **F3.** The minimum valid fee MUST be per-name and batch-invariant: claiming k names costs ~k·g whether anchored as k solo anchors or one batch of k; no fee rule may discount the gate as batch size grows (batching may amortize only blockspace overhead).
  *Sources:* `docs/spec/ONT_ISSUANCE_FEE_MECHANICS.md` 2. Two hard constraints (these do the elimination) — "Claiming `k` names must cost `~k · g`, whether done as `k` solo claims or one batch of `k`"; `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Claim — "Batching saves blockspace; it must not discount the anti-spam gate.".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `apps/publisher/src/publisher.ts:172`.
  *Proposed tests:*
    - (+) Property test: for random N in [1, 100000], the minimum fee accepted by the predicate equals N × g exactly (linear, no volume discount).
    - (−) A schedule or implementation that accepts fee = g + epsilon for N > 1 ('one gate covers the batch') is rejected by the conformance suite.
  *Attack flag:* A squatter batching a million names under one tx fee is the precise attack this kills; any future 'bulk pricing' parameter proposal violates constraint C1 by construction and must be unrepresentable in the predicate.

- **F4.** Only the anchor transaction's miner fee counts toward the gate: satoshis paid to any transaction output — publisher change, a service-fee output, a burn output, or any other destination — MUST NOT count toward F. The gate sink is miners via the fee, never the publisher and never the project.
  *Sources:* `docs/spec/ONT_ISSUANCE_FEE_MECHANICS.md` 2. Two hard constraints (these do the elimination) — "The gate has to be a protocol-mandated cost the publisher **cannot pocket or compete away**"; `docs/GLOSSARY.md` claim gate — "it goes to Bitcoin miners, not to any registrar or operator"; `docs/ONT.md` Fees and bonds, not rent — "paid to Bitcoin miners — not to a registrar, treasury, or operator".
  *Verdict:* **cited**.
  *Proposed tests:*
    - (−) Anchor tx where Sigma g_i sits in a change output back to the publisher (intrinsic fee small) is excluded — outputs subtract from F, so 'gate as output' can never satisfy the rule.
    - (−) Anchor tx routing Sigma g_i to a provably-unspendable burn output with low intrinsic fee is excluded (burn was a rejected design; only fee counts).
    - (+) Anchor tx with publisher change output AND intrinsic fee >= Sigma g_i counts (change is permitted, it just doesn't count toward F).
  *Attack flag:* Miner self-issuance: a miner including its own anchor recaptures the fee, issuing names at hashrate-bounded discount — spec section 8 accepts this as a known bounded residual; the test suite should document it rather than pretend to prevent it.

- **F5.** The fee that satisfies an anchor's gate check MUST be the fee of the one Bitcoin transaction carrying that anchor; a single transaction's fee MUST NOT be counted toward more than one anchor's gate requirement.
  *Sources:* `docs/spec/ONT_ISSUANCE_FEE_MECHANICS.md` 4. Recommended mechanics — the gate *is* the anchor's miner fee — "The fee is intrinsic to that one transaction, so it can't be reused across anchors.".
  *Verdict:* **cited**.
  *Proposed tests:*
    - (−) A transaction carrying two RootAnchor OP_RETURN payloads cannot have its fee double-counted: at most one anchor (or neither, pending the spec ruling below) may have its gate satisfied by F.
    - (+) Two anchors in two transactions each evaluated against their own intrinsic fee independently.
  *Attack flag:* Neither WIRE_FORMAT.md nor any kernel doc states whether one Bitcoin transaction may carry multiple ONT events/anchors; if two anchors ride one tx, naive per-anchor fee evaluation counts the same F twice — the gate is halved. Spec must pin one-anchor-per-tx or define fee attribution.

- **F6.** The kernel MUST compute Sigma g_i deterministically from the anchored batch's committed contents (the leaves behind the anchored root), via a protocol-defined g(name) schedule, and MUST NOT trust any self-declared per-batch total; an anchor whose declared batchSize is inconsistent with the committed leaf set MUST NOT have its gate evaluated against the smaller count.
  *Sources:* `docs/spec/ONT_ISSUANCE_FEE_MECHANICS.md` 8. Known properties and residuals (honest) — "must be encoded so the `F ≥ Σ gᵢ` check is mechanical from the batch contents"; `docs/spec/ONT_ISSUANCE_FEE_MECHANICS.md` 4. Recommended mechanics — the gate *is* the anchor's miner fee — "A batch anchor committing to `N` names with gate amounts `g₁…g_N`".
  *Verdict:* candidate-stays — **challenge held open**, see below.
  *Step-2 correction:* Reverse challenge: critic argues partial doc authority exists (ONT_ISSUANCE_FEE_MECHANICS.md §8 g(name) schedule language), so candidate-stays may be too weak. HELD for step-3 review — reviewer to confirm upgrade or keep.
  *Needed spec work:* Named spec PR defining the g(name) schedule encoding and the authoritative N source (batchSize field vs committed leaf count, with the mismatch verdict) so the F >= Sigma g_i check is mechanical — flagged by the spec itself as residual work, no rule text exists today.
  *Legacy evidence (never authority):* `apps/publisher/src/publisher.ts:8`.
  *Proposed tests:*
    - (−) Anchor declaring batchSize = 1 whose served batch contains 10,000 leaves does not pass the gate check at fee = 1 × g (mismatch cannot understate N).
    - (−) Batch bytes whose leaf count differs from the anchor's batchSize field is rejected/ineligible rather than gate-checked against either count silently.
    - (+) Gate sum recomputed from served leaves matches N × g for a uniform-gate batch and drives the F >= Sigma g_i verdict.
  *Attack flag:* RootAnchor (WIRE_FORMAT §4.4) carries only prevRoot/newRoot/batchSize — no per-name gate amounts; whether N comes from the batchSize field or the served leaf set, and what happens on mismatch, is specified nowhere. An attacker controls both the field and the bytes.
  *Attack flag:* The fee-mechanics 'scarce short names higher' g(name) line predates bond-opens (#37): with ≤4-char names mandatory bond-first there may be no short-name cheap claims at all — old-model leakage suspect for the adversarial pass.

- **F7.** Gate-fee failure is batch-atomic: an anchor whose fee fails F >= Sigma g_i MUST be rejected as a unit — no name in the batch enters name state, and no partial or pro-rata acceptance of a prefix of the batch is permitted.
  *Sources:* `docs/spec/ONT_PUBLISHER_PROTOCOL_SPEC.md` Anchor tx construction — "Fee MUST be `≥ Σ gates` of the batched names. Consensus rejects the batch otherwise"; `docs/spec/ONT_PUBLISHER_PROTOCOL_SPEC.md` Goals (and non-goals) — "the consensus rule "fee ≥ Σ gates" caps what they can pocket".
  *Verdict:* ~~cited~~ → **candidate-stays** (step-2 correction).
  *Step-2 correction:* Sole source is the adapter-tier publisher protocol spec restating consensus behavior secondhand. Downgraded; neededSpecWork: restate in ONT_ISSUANCE_FEE_MECHANICS.md (consensus tier).
  *Proposed tests:*
    - (−) Underfunded anchor (fee = Sigma g_i − 1): every name in the batch is absent from the resulting state — no 'first k names whose gates are covered' acceptance.
    - (+) The same leaves re-anchored later by a sufficiently-funded anchor register at the new anchor height (failure is not permanent forfeiture of the names, only of that anchor).
  *Attack flag:* Batch-atomic rejection means a publisher's 1-satoshi underpayment voids 10,000 innocent users' priority; the users' money is protected by pay-on-proof, but a malicious publisher can burn customers' time/priority at low cost — disclosed nowhere as a grief surface.
  *Attack flag:* Authority is the publisher protocol spec (candidate, hardens for B3/B4) describing a consensus behavior; the kernel-side statement of batch-atomicity should be restated in the B2 kernel spec text during hardening, not left in an adapter doc.

- **F8.** The self-sovereign single-name anchor MUST be validated by the identical rule with N = 1: an anchor for one name whose transaction fee is >= g counts; the kernel MUST NOT apply any different or additional fee rule to publisher-batched vs self-posted anchors.
  *Sources:* `docs/spec/ONT_ISSUANCE_FEE_MECHANICS.md` 4. Recommended mechanics — the gate *is* the anchor's miner fee — "The self-sovereign case is the same rule with `N = 1`."; `docs/spec/ONT_ISSUANCE_FEE_MECHANICS.md` 5. Why this satisfies every invariant — "`N = 1` is the un-censorable fallback and the price ceiling on publishers".
  *Verdict:* **cited**.
  *Proposed tests:*
    - (+) Batch-of-one anchor with fee >= g registers the name identically to a name inside a 10k batch (same predicate, same state result).
    - (−) Batch-of-one anchor with fee < g is excluded by the same path as F1 (no special-case leniency for self-claims).
    - (+) Property: the predicate's verdict is a function of (anchor facts, batch contents, fee) only — no publisher-identity input exists in its signature.
  *Attack flag:* If the predicate ever takes a publisher identity or endpoint as input, the censorship-resistance floor (invariant I5) silently breaks — the zero-I/O purity test should assert the predicate signature carries no source-identity parameter.

- **F9.** The gate-fee verdict MUST key to the anchor transaction as mined on the canonical chain at K-deep confirmation and be reproducible by deterministic replay across reorgs: an anchor reorged out before K depth has no fee fact, and re-evaluation after re-mining MUST use the new transaction's intrinsic fee.
  *Sources:* `docs/spec/ONT_ISSUANCE_FEE_MECHANICS.md` 8. Known properties and residuals (honest) — "standard `K`-confirm finality and deterministic replay handle reorgs, same as the rest of the path"; `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` 6a. Confirmation lag absorbs honest propagation — "A delta anchored at height `h` is only eligible for the canonical root once `h` is K-deep.".
  *Verdict:* **cited**.
  *Blocked on decision:* `da-windows`.
  *Proposed tests:*
    - (−) Anchor valid at the tip but reorged out before reaching K depth contributes nothing; replay over the reorg fixture is byte-deterministic.
    - (+) Permutation/reorg property: two honest replays over the same final canonical chain produce identical gate verdicts regardless of intermediate tip history.
    - (−) An anchor re-broadcast after a reorg with a lower fee in the replacement tx fails the gate even though the original (orphaned) tx paid enough.
  *Attack flag:* K is one of the W/C/K values in the open pre-B2 da-windows decision; the rule shape is extractable but the confirmation depth the fee verdict waits for cannot be finalized until that ruling lands.

- **F10.** A bond qualifies if and only if its amount (integer satoshis) is >= the opening floor for the name, defined as the higher of the length-price curve and the long-name minimum; a bond below the floor MUST NOT open an auction, contest a claim, or count as a qualifying bid.
  *Sources:* `docs/spec/AUCTION.md` Opening Bond Floors — "The opening bid must meet the higher of two floors"; `docs/GLOSSARY.md` bond — "A **qualifying bond** (at or above the bond floor) is the only thing that opens an auction (Decision #37)"; `docs/core/DECISIONS.md` 37. Bond opens the auction — "The ₿50,000 escalation floor becomes load-bearing (the cost to open/contest an auction) and graduates from placeholder to a launch decision.".
  *Verdict:* **cited**.
  *Needed spec work:* All floor values are STATUS placeholders (launch-parameter freeze); and the AUCTION.md-table vs DECISIONS-#11-clamp contradiction must be reconciled by the hardening pass before this rule's parameters can promote.
  *Legacy evidence (never authority):* `packages/protocol/src/bond.ts:8`.
  *Proposed tests:*
    - (−) Bond of floor − 1 satoshi posted against an in-window claim does not escalate the name (window then closes clean → claim finalizes).
    - (+) Bond of exactly the floor escalates the name to auction (at-or-above semantics, boundary pinned).
    - (−) For a 1-char name, a ₿50,000 bond (long-name minimum) does not qualify — the higher of the two floors governs.
  *Attack flag:* Live spec inconsistency: AUCTION.md's floor table prices 5–11 char names above ₿50,000 (e.g. ₿6,250,000 at 5 chars), but DECISIONS #11 resolves 'the length-scaled curve is now clamped to the structurally scarce ≤4-char set... 5+ char names use the gate + contention' and legacy code clamps >4 chars to the flat floor. Which floor a 5-char contested name's opening bond must meet is contradictory across authority docs.
  *Attack flag:* Floors fixed in satoshis drift with BTC price (R5, accepted bet) — deterrence strength floats.

- **F11.** The kernel MUST escalate a name to auction only upon a qualifying bond (posted against an in-window claim, or bond-first with no prior claim), and MUST NOT award a contested name to any claim lacking a qualifying bond: one in-window claim with no bond finalizes; two or more claims with no qualifying bond nullify the name (no owner, reopens); a bare collision can deny, never award.
  *Sources:* `docs/core/DECISIONS.md` 37. Bond opens the auction (escalation trigger = bond, not bare claim) — "a name is acquired only by (a) an uncontested cheap claim that finalizes, or (b) the winning bond in an auction"; `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Bond opens the auction; a bare collision can only nullify — "A claim with no bond can deny, never award."; `docs/spec/CONTESTED_AUCTION_REFERENCE.md` Core Rule — "The bond, not a second claim alone, is the escalation trigger.".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/core/src/indexer.ts:519`.
  *Proposed tests:*
    - (−) Two DA-valid claims, zero bonds, window closes: neither claimant owns the name; state shows nullified/no-owner and the name reopens for claiming.
    - (−) Ordering-based award is unrepresentable: with 2+ bondless claims, no (anchor height, tx-index, txid) ordering input can produce an owner — the rejected pre-#37 rule must have a documenting negative test.
    - (+) Single claim, no bond, window closes clean: claim finalizes (the long tail).
    - (+) Bond-first: a qualifying bond with no prior cheap claim opens the auction for the named lot.
    - (−) A nullified name cannot silently un-nullify: replay from snapshot preserves the no-owner verdict.
  *Attack flag:* Spite-griefer residual (accepted per #37): colliding a ₿1,000 claim denies a targeted name with no payoff; the documenting test should pin that denial is the worst case and the target's bond ends it.
  *Attack flag:* Which competing claims count toward 'two or more' depends on the DA-validity of each claim ('two or more DA-valid claims', CONTESTED_AUCTION_REFERENCE) — this rule consumes the DA-verdict area's output, whose windows are unruled (da-windows); the predicate shape stands, its claim-counting input does not finalize until then.

- **F12.** The finalize/nullify/escalate outcome MUST be deadline-derived as a pure predicate over chain facts: at currentHeight >= anchorHeight + W_notice the verdict is determined solely by whether a qualifying bond landed within the notice window — no ordering-based award path, no randomness, no clock other than block height.
  *Sources:* `docs/core/DECISIONS.md` 37. Bond opens the auction (escalation trigger = bond, not bare claim) — "Deadline-derived in the engine (a verifier checks, at `currentHeight ≥ anchorHeight + W_notice`, whether a qualifying bond landed); no ordering-based award path"; `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Bond opens the auction; a bare collision can only nullify — "Both outcomes are deadline-derived (a verifier observes, at `currentHeight ≥ anchorHeight + W_notice`, whether a qualifying bond landed).".
  *Verdict:* **cited**.
  *Needed spec work:* W_notice is a placeholder (STATUS: '6 blocks (test); target = weeks', not frozen); rule stands parameterized, value is launch-freeze work, and the boundary inclusivity needs one sentence of spec text at hardening.
  *Proposed tests:*
    - (−) Qualifying bond mined after the window deadline does not contest the finalized claim (it is an already-owned attempt, not a contest).
    - (+) Identical chain prefixes evaluated by two verifiers at different wall-clock times yield identical verdicts (block height is the only clock).
    - (−) Boundary vector: a bond in the block at exactly anchorHeight + W_notice — pinned in/out per the spec ruling (currently ambiguous, see attack flag).
  *Attack flag:* The #37 formula gives the check height, not the bond-landing interval's edge: whether a bond mined in block anchorHeight + W_notice is inside or outside the window is stated nowhere — a miner aiming at the boundary block exploits whichever reading implementations disagree on.
  *Attack flag:* Same-block composition: bond and competing claim (or two bonds) in one block need the #25 same-block tie-break composed in; not restated in any bond-window spec text.

- **F13.** An AuctionBid event MUST count as a bid only if the bid transaction's output at index bondVout exists, is a spendable payment output, and has a value in satoshis exactly equal to the event's bidAmountSats; a bid whose declared amount is not fully backed by that single bond output MUST be ignored.
  *Sources:* `docs/spec/WIRE_FORMAT.md` 4.3 AuctionBid — "frame ‖ `flags`(1) ‖ `bondVout`(1) ‖ `settlementLockBlocks`(u32) ‖ `bidAmountSats`(u64)"; `docs/spec/CONTESTED_AUCTION_REFERENCE.md` Role In The Current Design (auction path properties) — "every bid backed by real bitcoin capital".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* Named spec PR stating the bond-output binding rule (existence at bondVout, exact-value equality, permitted script classes, one-bond-one-bid exclusivity) as kernel spec text — today it exists only in legacy engine code and a LAUNCH.md status-table aside ('bond value = bid at bondVout'), neither of which is rule authority.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:320`.
  *Proposed tests:*
    - (−) Bid whose bondVout points past the transaction's last output (missing bond output) is ignored.
    - (−) Bid whose output at bondVout is an OP_RETURN/non-payment script is ignored.
    - (−) Bid where output value = bidAmountSats − 1 (or +1) is ignored — exact equality, not >=.
    - (+) Bid with payment output at bondVout exactly equal to bidAmountSats is recorded.
  *Attack flag:* Nothing prevents two AuctionBid events (same tx or two txs, different names) from pointing at the same UTXO as their bond — one pile of sats backing multiple names' bids; a one-bond-one-bid exclusivity rule exists nowhere.
  *Attack flag:* 'Spendable payment output' has no doc definition (legacy code's scriptType === 'payment' is the only articulation); whether the bond output must be controlled by the bid's ownerPubkey or may be a third party's is unspecified.

- **F14.** A same-bidder replacement bid MUST spend the earlier bid's bond outpoint; a later bid by the same bidder that does not spend the prior bond outpoint MUST NOT replace the earlier bid (preventing one bidder from holding multiple live bids on one lot without committing fresh capital per live bid).
  *Sources:* `docs/spec/AUCTION.md` Real Mechanism Choices (normative shape) — "same-bidder rebids should replace earlier bids by spending the earlier bond outpoint".
  *Verdict:* **cited**.
  *Proposed tests:*
    - (+) Second bid by the same bidderCommitment spending the first bid's bond outpoint replaces it: only the new bid is live, the old bond is released into the new bond.
    - (−) Second bid by the same bidderCommitment leaving the first bond outpoint unspent does not replace the first bid (pinned verdict: ignored, per the spec ruling hardening must make).
    - (−) A third party spending a bidder's bond outpoint in a non-bid transaction does not transfer or replace the bid.
  *Attack flag:* The spec text says 'should', not MUST — hardening must MUST-ify and pick the reject verdict for the violating case (ignore the new bid vs invalidate both), or implementations will diverge.
  *Attack flag:* 'Same bidder' is identified by bidderCommitment (sha256 of a free-text bidderId, WIRE_FORMAT §6) — a bidder trivially mints fresh bidderIds to evade the replacement rule entirely; the rule constrains honest wallets, not adversaries, and the adversarial pass should weigh whether it carries any consensus weight at all.

- **F15.** A name of 4 characters or fewer MUST NOT be acquirable through the batched claim path: no cheap claim on a ≤4-char name may finalize; such names enter only via a qualifying length-scaled opening bond (mandatory bond-first).
  *Sources:* `docs/ONT.md` How you get a name — one path — "they are **bond-first**, meaning they start directly at the auction step below with a large opening bond"; `docs/GLOSSARY.md` bond-first — "mandatory (with length-scaled opening bonds) for names of 4 characters or fewer"; `docs/core/STATUS.md` Key numbers — "Short-name opening bond (≤4 chars, **mandatory bond-first** — no cheap-claim path)".
  *Verdict:* **cited**.
  *Needed spec work:* The ≤4 threshold and the in-batch handling of short-name leaves need spec text at hardening; threshold value confirms at launch-parameter freeze.
  *Legacy evidence (never authority):* `packages/protocol/src/bond.ts:17`.
  *Proposed tests:*
    - (−) A 4-char name inside an otherwise valid, fully-funded batch does not finalize at notice-window close (pinned verdict needed: leaf invalid vs claim-never-finalizes — see attack flag).
    - (+) A 5-char name in the same batch finalizes normally (threshold boundary).
    - (+) A ≤4-char name acquired via bond-first auction with a bond meeting the length-scaled floor settles to ownership.
  *Attack flag:* No doc states what the kernel does with a ≤4-char leaf inside a batch: is the leaf invalid (does it poison the batch? does its gate still count in Sigma g_i?), or merely a claim that can never finalize? Each reading changes the F1/F6 arithmetic and the batch-atomicity story (F7).
  *Attack flag:* The 4-char threshold is 'working baseline' (STATUS), not frozen — parameterize the predicate on the threshold.

**Gaps — Gate-fee validation duties with no spec text at all:**

- g(name) schedule encoding: the per-name gate schedule that makes F >= Sigma g_i mechanical from batch contents has no rule text anywhere — ONT_ISSUANCE_FEE_MECHANICS §8 itself names it as unfinished work.
- Source of N for the gate sum: whether Sigma g_i is computed over the anchor's batchSize field or the served leaf set, and the verdict when they disagree, is specified in no document.
- Multiple ONT anchors/events per Bitcoin transaction: fee attribution (and whether the case is legal at all) is specified nowhere in WIRE_FORMAT.md or any kernel doc.
- Bond output validity: no spec text defines what makes a transaction output a valid bond (script class, spendability, whether it must be controlled by the bid's ownerPubkey) or forbids one UTXO backing multiple bids.
- Notice-window boundary semantics: whether a bond landing in block anchorHeight + W_notice exactly is in-window is stated nowhere; only the check-height formula exists.
- Whether bond-first/auction entries owe any gate fee: the cheap path's gate is fully specified in intent, but no document says whether an opening bond or auction bid transaction must also satisfy a per-name gate (the fee-mechanics 'short names higher' schedule line predates bond-opens and may be dead).
- Missing-witness behavior for the fee predicate: no spec text says the verdict when prevout values cannot be witnessed (fail-closed is implied by the system's posture, never stated for the fee check).
- Mid-auction bond spend: AUCTION.md covers the winner's bond continuity after settlement, but what happens to a live bid whose bond UTXO is spent before auction close (retraction? bid voided? auction state rollback?) has no spec text.


### Transcript completeness (T*)

- **T1.** The kernel MUST decide every auction/acquisition outcome from a transcript via a pure deterministic predicate over (encoded event bytes, prior name state, witnessed chain facts); the predicate MUST NOT consult I/O, network, database, wall-clock time, or any adapter/evidence-layer judgment, and no layer outside the kernel may override its verdict.
  *Sources:* `docs/core/SOFTWARE_CANON.md` Layer vocabulary — the boundary rule [ratified core] — "whether a transcript is complete enough to award — it lives in the kernel, as a pure predicate over witnessed inputs"; `docs/core/SOFTWARE_CANON.md` Layer vocabulary, L2 row [ratified core] — "No DB, no network, no clock, no UI"; `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Design Rule [candidate] — "Ownership is the deterministic result of Bitcoin ordering, ONT validity rules, public notice, and owner-key signatures.".
  *Verdict:* **cited**.
  *Proposed tests:*
    - (+) Determinism property: identical (event bytes, prior state, chain facts) inputs produce byte-identical verdicts across repeated invocations and across suite vs driver implementations.
    - (−) Research-quarantine-style import test: the build fails if the transcript predicate module imports any I/O, DB, network, or clock dependency (the B2 gate's zero-I/O lock).
    - (−) A hostile/swapped evidence-layer stub supplying the same witnessed facts cannot change any transcript verdict (kernel verdict function has no other input channel).
  *Attack flag:* Any rule below whose source implies the indexer/resolver 'recognizes' or 'accepts' something is server-authority leakage bait; the kernel restatement must strip the actor.

- **T2.** The kernel MUST NOT award or settle a contested-auction outcome from a bid set that is not witnessed as the complete set of well-formed AuctionBid events for the auction lot over the auction's full block range (including soft-close extensions) on the canonical chain; a transcript omitting any such bid MUST fail the completeness predicate rather than certify a winner.
  *Sources:* `docs/core/SOFTWARE_CANON.md` Item 4 — Tests before implementation [ratified core] — "an omitted auction bid, or a forged summary must provably be unable to mint, steal, or falsely finalize a name"; `docs/core/STATUS.md` Known-incomplete [canonical status] — "It does not prove the listed set is the complete set of L1 bids — a producer that omits a genuinely higher bid still passes structural verification."; `docs/core/SOFTWARE_CANON.md` Item 5, B3 gate [ratified core] — "proof-bundle assembly (including the auction transcript the kernel's completeness predicate consumes)".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/consensus/src/proof-bundle.ts:505-511 (HONEST RESIDUAL TRUST comment: legacy verifier explicitly does NOT check set-completeness)`.
  *Proposed tests:*
    - (−) Omitted-bid test: a transcript listing every bid except one higher qualifying bid present in the witnessed block range MUST be ruled incomplete — no award, no winner certified.
    - (−) Forged-summary test: a transcript asserting completeness (producer flag) without enumeration evidence covering the lot's block range MUST be rejected.
    - (+) A transcript enumerating all AuctionBid events for the lot's block range (accepted and rejected) passes completeness and awards the highest qualifying bid.
  *Attack flag:* The sufficient completeness witness is undefined (B3 deliverable): a kernel that accepts any producer-asserted completeness claim recreates the STATUS-disclosed omitted-bid hole even while this rule reads as satisfied.
  *Attack flag:* If 'the auction's block range' excludes soft-close extension blocks, a late extension-window bid can be omitted while the transcript still looks complete — the range definition must be close-after-extensions, not the initial close.

- **T3.** For v1 the kernel MUST count as transcript bids only AuctionBid events carried in Bitcoin L1 transactions on the witnessed canonical chain; bids asserted from any other source (off-chain logs, resolver state, future substrates) MUST NOT enter the completeness predicate.
  *Sources:* `docs/spec/CONTESTED_AUCTION_REFERENCE.md` Auction Family [candidate] — "visible L1 bid transactions"; `docs/core/DECISIONS.md` Entry 35 — Contested auction family [decision record] — "on-chain bonded bids"; `docs/OPEN_QUESTIONS.md` 2.1 L1 auction bid mechanics — scope note [open-questions register] — "there is no off-chain auction on the batched claim path".
  *Verdict:* ~~cited~~ → **candidate-stays** (step-2 correction).
  *Step-2 correction:* Its own sources hold the question open (DECISIONS #35 is a working assumption naming alternatives). Downgraded; neededSpecWork: close the auction-form question or scope the rule to the assumed form explicitly.
  *Legacy evidence (never authority):* `packages/consensus/src/proof-bundle.ts:419-423 (transcriptSource must equal "bitcoin_l1_bid_transactions")`.
  *Proposed tests:*
    - (−) A transcript declaring any source other than Bitcoin L1 bid transactions (e.g. an off-chain log source tag) MUST be rejected by the v1 predicate.
    - (−) A bid entry with no corresponding witnessed L1 transaction (txid absent from the chain facts) MUST NOT count toward the outcome.
    - (+) All-L1 transcript with witnessed inclusion for every bid passes the source gate.
  *Attack flag:* The exact source-tag vocabulary (bitcoin_l1_bid_transactions and the future-source tags) exists only in legacy code and the LAUNCH.md narrative, not in spec/; the kernel-consumed enum needs spec text or the tag becomes producer-defined.

- **T4.** Every payload the transcript predicate counts MUST decode as a well-formed wire event under WIRE_FORMAT §3-§4 (valid frame, registered non-retired type, exact layout with no truncation or trailing bytes, INCLUDES_NAME flag set, canonical name bytes); a payload failing wire decode MUST NOT be counted as a bid and MUST NOT change the verdict.
  *Sources:* `docs/spec/WIRE_FORMAT.md` 3. Event frame [normative] — "A decoder MUST reject any event type byte not in the registry."; `docs/spec/WIRE_FORMAT.md` 4.3 AuctionBid [normative] — "The INCLUDES_NAME flag (bit 0) MUST be set; a decoder MUST reject a bid without it."; `docs/spec/CONTESTED_AUCTION_REFERENCE.md` Basic Flow [candidate] — "the highest valid bonded bidder wins".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:126-149 (extractOntEvents silently skips undecodable payloads), engine.ts:251-254 (non-v1 event types ignored)`.
  *Proposed tests:*
    - (−) A transcript containing a retired 0x0d AvailabilityMarker payload, a truncated AuctionBid, or a bid with INCLUDES_NAME unset MUST yield the same verdict as the transcript without those payloads — none may count as a bid.
    - (−) A bid whose name bytes are non-canonical (contains A-Z) MUST NOT count (wire reject propagates into the predicate).
    - (+) All well-formed-per-§4.3 bids in a transcript are admitted to the eligibility checks.
  *Attack flag:* No spec text decides exclude-vs-abort: whether one malformed payload inside an otherwise complete enumeration invalidates the whole transcript or is deterministically dropped. Silent drop is the legacy behavior; the kernel spec must own the choice explicitly or two implementations will diverge on mixed transcripts.

- **T5.** A bid MUST be attributed to an auction only if its carried auctionLotCommitment equals the WIRE_FORMAT §6 lot commitment recomputed from that auction's (auctionId, canonical name, unlockBlock); a bid whose lot commitment differs MUST be excluded from that auction's transcript and MUST NOT affect its outcome.
  *Sources:* `docs/spec/WIRE_FORMAT.md` 6. Auction commitments [normative] — "auctionLotCommitment = sha256( lenPrefix("ont-auction-lot") ‖ lenPrefix(text(auctionId)) ‖ lenPrefix(name) ‖ lenPrefix(decimal(unlockBlock)) )"; `docs/core/DECISIONS.md` Entry 48 — wire-normative [decision record] — "B2 may treat wire shapes as law (closed field sets, full-width commitments collision-resistant per the W16 ruling)".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/core/src/experimental-auction.ts:288-290 (observations filtered by auctionLotCommitment equality before any other rule)`.
  *Proposed tests:*
    - (−) A bid committing to a different lot (wrong auctionId, wrong name, or wrong unlockBlock in the recomputed commitment) MUST NOT enter the transcript even if it names the same name string.
    - (−) A bid carrying a legacy 16-byte truncated lot commitment MUST NOT match any v1 lot (legacy layout is evidence-only, not a conformance target).
    - (+) Recomputed lot commitment over (auctionId, canonical name bytes, decimal unlockBlock) matches the on-chain bid's 32-byte field byte-for-byte.
  *Attack flag:* The bid event also carries name and unlockBlock in plaintext (§4.3); nothing in spec says the plaintext fields MUST agree with the lot-commitment preimage — a bid whose plaintext name differs from its committed lot name needs an explicit reject rule or producers can display one name while committing to another.

- **T6.** The kernel MUST derive the auction phase deterministically from block height as exactly one of pending_unlock, awaiting_opening_bid, live_bidding, soft_close, settled (any other phase string MUST be rejected): height below unlockBlock ⇒ pending_unlock; at/after unlock with no accepted opening bid ⇒ awaiting_opening_bid; an accepted opening bid at height b0 sets close = b0 + W_auction; an accepted bid within the final C_soft blocks moves close to max(close, bid height + C_soft) with no hard extension cap; height strictly after the final close ⇒ settled.
  *Sources:* `docs/spec/WIRE_FORMAT.md` 6. Auction commitments, state field 4 [normative] — "exactly one of pending_unlock, awaiting_opening_bid, live_bidding, soft_close, settled; anything else MUST be rejected"; `docs/spec/AUCTION.md` Auction Timing [candidate] — "Bid inside the final 144 blocks moves close to bid block + 144"; `docs/spec/CONTESTED_AUCTION_REFERENCE.md` Basic Flow [candidate] — "bids near the end extend the soft close".
  *Verdict:* **split** — see step-2 correction below; cited half stands, the named clause is candidate-stays.
  *Step-2 correction:* The §6 field pin stays cited (WIRE_FORMAT normative); the matching/derivation arithmetic has no doc text and is candidate-stays, consistent with the extraction's own T13/T14 standard.
  *Needed spec work:* Launch-parameter freeze of W_auction (placeholder 1,008 blocks) and C_soft (placeholder 144 blocks), plus the height-keyed launch decay schedule (30d→14d→7d recommendation) — STATUS placeholders cannot ground the values.
  *Legacy evidence (never authority):* `packages/core/src/auction-state.ts:12-17,170-203 (phase strings and height-derived transition function); packages/core/src/experimental-auction.ts:556-561 (close extension via max())`.
  *Proposed tests:*
    - (−) A state assertion carrying any phase string outside the five-string registry MUST be rejected (WIRE_FORMAT §6 negative vector reused kernel-side).
    - (−) A bid confirmed strictly after the final (extension-adjusted) close MUST be rejected as auction_closed with no effect on winner, close, or required minimum.
    - (−) A bid confirmed below unlockBlock MUST be rejected (before_unlock) and MUST NOT open the auction.
    - (+) Property test: a chain of N qualifying soft-close bids each extends close to its height + C_soft with no upper bound (no hard cap).
    - (+) Phase function golden vectors at every boundary height (unlock-1, unlock, close, close+1, soft-close start) match the spec transitions.
  *Attack flag:* Uncapped soft close is a deliberate mechanism choice, but its grief cost is acknowledged unmodeled ('grief-cost modeling for uncapped soft close' in What Still Needs Work) — an attacker can extend capital lock indefinitely at the cost of escalating qualifying raises.
  *Attack flag:* Boundary inclusivity (is a bid AT the close block valid? legacy uses strictly-greater for settled) is stated only by code; off-by-one divergence between implementations is consensus-fatal.

- **T7.** The kernel MUST NOT open an auction or award a contested name without a qualifying opening bid meeting the opening floor: a lot with zero accepted bids MUST resolve to no auction and no owner (an unopened lot is not a failed auction), and a bare claim MUST NOT take a contested name.
  *Sources:* `docs/spec/AUCTION.md` Real Mechanism Choices [candidate] — "a valid bonded opening bid is what creates the auction"; `docs/core/DECISIONS.md` Entry 37 — bond-opens [decision record] — "a name is acquired only by (a) an uncontested cheap claim that finalizes, or (b) the winning bond in an auction"; `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Contested Auction [candidate] — "The escalation trigger is the bond, not a second claim alone".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/core/src/auction-sim.ts:278 (status unopened when no winning bid); docs/LAUNCH.md legacy scheduled-catalog 'unopened' state is compatibility residue`.
  *Proposed tests:*
    - (−) A transcript containing only below-floor bid attempts MUST yield no auction, no winner, and no owner.
    - (−) A transcript with two cheap claims and zero bids/bonds MUST NOT award the name to either claim (it nullifies — see T17).
    - (+) A single qualifying opening bid at/after unlock opens the auction and starts the W_auction window at its height.
  *Attack flag:* AUCTION.md still carries the legacy scheduled-catalog compatibility path as an open question — old-model leakage bait for B2: the kernel must not inherit an 'unopened catalog entry' state machine from quarantined fixtures.

- **T8.** A bid below the required minimum MUST be rejected and MUST NOT become leader, extend the close, or alter the required minimum — where the required minimum is the opening floor (the higher of the length price and the long-name minimum) for the first bid, and max(absolute raise floor, percentage raise) over the current highest bid thereafter, with the stronger soft-close percentage applied when the bid falls in the soft-close window.
  *Sources:* `docs/spec/AUCTION.md` Opening Bond Floors [candidate] — "The opening bid must meet the higher of two floors"; `docs/spec/CONTESTED_AUCTION_REFERENCE.md` Basic Flow [candidate] — "each later bid must clear the current minimum"; `docs/spec/AUCTION.md` Real Mechanism Choices [candidate] — "bids that extend an auction during soft close should face a stronger minimum increment than ordinary mid-auction bids".
  *Verdict:* **cited**.
  *Needed spec work:* Launch-parameter freeze: opening floor curve (₿100,000,000 halving curve, ₿50,000 long-name minimum), normal raise max(₿1,000, 5%), soft-close raise max(₿1,000, 10%) — all explicitly placeholders in AUCTION.md/STATUS and cannot pass candidate as values.
  *Legacy evidence (never authority):* `packages/core/src/experimental-auction.ts:455-480 (below_opening_minimum), 519-554 (below_minimum_increment with soft-close increment selection)`.
  *Proposed tests:*
    - (−) An opening bid one satoshi below the parameterized floor MUST be rejected and MUST NOT open the auction.
    - (−) A raise meeting the normal increment but below the soft-close increment, confirmed inside the soft-close window, MUST be rejected and MUST NOT extend the close.
    - (+) A raise exactly at max(absolute floor, percentage) is accepted and becomes leader (boundary equality pinned).
  *Attack flag:* Percentage-raise rounding (basis-point math on bigint satoshis) is unspecified; a one-satoshi rounding divergence between implementations forks the accept/reject verdict on the same bid.

- **T9.** Given a complete transcript, the kernel MUST award the auction to the highest accepted qualifying bonded bid; a transcript or settlement designating any lower accepted bid as winner MUST be rejected.
  *Sources:* `docs/spec/CONTESTED_AUCTION_REFERENCE.md` Basic Flow [candidate] — "the highest valid bonded bidder wins"; `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Contested Auction [candidate] — "the largest bond wins"; `docs/core/STATUS.md` Components — Contested-auction bonded bid [canonical status] — "Proof bundle now enforces highest-bid-wins + distinct-bid well-formedness (was a gap).".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/consensus/src/proof-bundle.ts:473-487 (direct.winner.isHighestBid soundness check)`.
  *Proposed tests:*
    - (−) A transcript whose declared winner amount is lower than another accepted bid's amount MUST fail (the legacy lower-bid-as-winner attack).
    - (−) A declared winner whose txid references no accepted bid in the set MUST fail.
    - (+) Winner equals the unique highest accepted bid; verdict awards it.
  *Attack flag:* 'Highest accepted' is only sound after T2 completeness and T8 acceptance filtering — stating this rule without those two lets a producer manufacture 'highest' by omission or by mislabeling rejected bids as accepted.

- **T10.** The transcript verdict MUST be invariant under event presentation order: the kernel MUST evaluate events in canonical Bitcoin order (ascending block height, then transaction order within the block), and when two competing bids for the same name confirm in the same block and are otherwise tied under the auction rules, the bid appearing earlier in the block's transaction order MUST win.
  *Sources:* `docs/core/DECISIONS.md` Entry 25 — Same-block auction tie-break rule [decision record] — "the bid appearing earlier in the block's transaction order wins"; `docs/ONT.md` What ONT commits to [plain-language source of truth] — "ownership is computed by replaying Bitcoin, not by anyone's judgment"; `docs/core/SOFTWARE_CANON.md` Item 5, B2 gate [ratified core] — "property tests over event orderings (reorg/permutation invariance where the spec claims it)".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/core/src/experimental-auction.ts:1073-1094 (comparator: blockHeight, txIndex, vout, txid, bidderCommitment)`.
  *Proposed tests:*
    - (+) Permutation property: shuffling the presentation order of a transcript's events never changes the verdict (kernel sorts by height then tx index before evaluation).
    - (−) Two same-block equal bids: a transcript awarding the later-in-block bid MUST be rejected; the earlier tx-order bid wins.
    - (+) Golden vector with interleaved multi-block bids replays to the same leader sequence as canonical-order application.
  *Attack flag:* Decision #25's 'otherwise tied' is undefined (equal amounts? equal at the required minimum?); the legacy comparator's deeper tie levels (vout, txid lexicographic, bidderCommitment) have no doc authority — same-block application order also changes the required increment for the second bid, so the full total order is consensus-bearing and must be specified, not inherited from code.

- **T11.** A later bid by a bidder with a standing accepted bid in the same auction (same bidderCommitment) MUST be rejected unless its transaction spends the standing bid's bond outpoint; an accepted replacement MUST create one new bond for the full new amount, with the prior bond consumed by the replacing transaction and not separately released.
  *Sources:* `docs/spec/AUCTION.md` Real Mechanism Choices [candidate] — "same-bidder rebids should replace earlier bids by spending the earlier bond outpoint"; `docs/core/DECISIONS.md` Entry 35 — Contested auction family, rebid shape [decision record] — "a same-bidder rebid can replace that bidder's prior bid only if the new transaction spends the prior bid-bond output".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/core/src/experimental-auction.ts:429-453 (prior_bid_not_replaced reject), 563-572 (replaced_by_self_rebid bookkeeping)`.
  *Proposed tests:*
    - (−) A second bid with the same bidderCommitment whose transaction does not spend the standing bond outpoint MUST be rejected (prior_bid_not_replaced) regardless of amount.
    - (−) A replacement bid whose new bond is less than the full new bid amount MUST be rejected (no bond-splitting across two bids).
    - (+) A replacement spending the prior bond outpoint and creating a full-amount new bond is accepted; the prior bond is marked consumed by the replacement transaction.
  *Attack flag:* Bidder identity is the hash of free-text bidderId: a bidder trivially evades the rebid rule by committing a fresh bidderId per bid, leaving two live bonds and an inflated apparent bidder count — the rule constrains honest wallets only unless identity is bound to something real (key or bond lineage).

- **T12.** An AuctionBid MUST NOT count in a transcript unless the bid transaction's output at its declared bondVout exists, is a payment output, and its value equals bidAmountSats — the bond fully backing the bid must be created in the same transaction as the bid event.
  *Sources:* `docs/spec/CONTESTED_AUCTION_REFERENCE.md` Core Rule [candidate] — "every bid backed by real bitcoin capital"; `docs/spec/CONTESTED_AUCTION_REFERENCE.md` Basic Flow [candidate] — "bidders submit Bitcoin-backed bids for the name".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* Named B2 spec PR defining bond binding precisely: the value relation (exact equality vs >=), the required script form for a bond output, the same-transaction requirement, and bondVout reference semantics — candidate docs say only that bids are 'backed by real bitcoin capital', which is not a testable predicate.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:298-333 (applyAuctionBid: missing bond output, non-payment script, and value !== bidAmountSats all reject)`.
  *Proposed tests:*
    - (−) Bid whose bondVout indexes no output MUST NOT count.
    - (−) Bid whose bond output value differs from bidAmountSats (one satoshi either way, pending the equality-vs-floor ruling) MUST NOT count.
    - (−) Bid whose bond output is a non-payment script (e.g. OP_RETURN) MUST NOT count.
    - (+) Bid with a same-tx payment output at bondVout exactly matching bidAmountSats is admitted.
  *Attack flag:* Nothing in any doc states who must be able to spend the bond output (bidder-controlled vs anyone-can-spend); a bid 'backed' by an attacker-burnable script satisfies the letter of 'real bitcoin capital' while making the returnable-bond promise false.

- **T13.** A bid whose settlementLockBlocks does not equal the auction lot's required settlement-lock value MUST be rejected and MUST NOT become leader or extend the close.
  *Sources:* `docs/spec/WIRE_FORMAT.md` 6. Auction commitments, state field 11 [normative — defines the field, not the matching rule] — "settlementLockBlocks | decimal"; `docs/spec/AUCTION.md` Winner Bond And Maturity [candidate] — "Winner bond maturity period | 52,560 blocks".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* Named B2 spec PR defining the per-lot required settlement lock (where the lot's value comes from — the launch maturity parameter — and that a mismatching bid rejects); only the wire field and the placeholder maturity value exist in docs today. The 52,560-block value itself is launch-freeze work.
  *Legacy evidence (never authority):* `packages/core/src/experimental-auction.ts:325-349 (settlement_lock_mismatch reject before any other eligibility check)`.
  *Proposed tests:*
    - (−) A bid carrying settlementLockBlocks different from the lot's required lock MUST be rejected even when its amount qualifies.
    - (+) A bid matching the lot's settlement lock proceeds to the other eligibility checks.
  *Attack flag:* Without this rule a winning bidder could self-select a shorter maturity by encoding a smaller settlementLockBlocks — the field rides inside the signed bid, so only a kernel-side equality check stops maturity shopping.

- **T14.** A bid whose auctionStateCommitment does not equal the WIRE_FORMAT §6 state commitment recomputed over the kernel-derived auction state immediately preceding the bid MUST be rejected as stale and MUST NOT become leader or extend the close.
  *Sources:* `docs/spec/WIRE_FORMAT.md` 6. Auction commitments [normative — defines the construction, not the matching rule] — "auctionStateCommitment = sha256( lenPrefix("ont-auction-state") ‖ lenPrefix(f₁) ‖ … ‖ lenPrefix(f₁₁) )"; `docs/LAUNCH.md` Auction Settlement Becomes Ownership [launch narrative — context] — "the observed pre-bid auction-state commitment".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* Named B2 spec PR deciding whether a stale auctionStateCommitment rejects the bid at all (vs. being advisory), and pinning 'pre-bid state' to an exact definition — state as of which height and which intra-block ordering — since the wire spec only defines the hash construction.
  *Legacy evidence (never authority):* `packages/core/src/experimental-auction.ts:403-427 (stale_state_commitment reject); :311-320 (pre-bid state recomputation per observation)`.
  *Proposed tests:*
    - (−) A bid committing to the auction state as of two bids ago (stale leader/highest fields) MUST be rejected if the reject semantics are ratified.
    - (+) Recomputing the 11-field state commitment from the kernel-derived pre-bid state matches the bid's carried 32-byte commitment (PIN, including absent-field empty-lenPrefix rendering).
  *Attack flag:* Reject-on-stale creates a same-block race: the current leader can bid against itself to invalidate every competitor bid already in the mempool (their commitments go stale on confirmation), a cheap soft-close defense the spec never weighs.
  *Attack flag:* If currentBlockHeight (field 3) is part of the committed state, every bid's commitment is height-sensitive and confirmation delay alone can stale an honest bid — the spec must say which fields the pre-bid match actually binds.

- **T15.** The kernel MUST verify every revealed transcript identity against its on-chain commitment by recomputing the full-width 32-byte WIRE_FORMAT §6 constructions (bidderCommitment from bidderId; auctionLotCommitment from auctionId/name/unlockBlock; auctionStateCommitment from the eleven ordered fields) and MUST reject any reveal whose recomputed hash differs from the bid's carried commitment; commitment comparison MUST be full 32-byte equality, never truncated.
  *Sources:* `docs/spec/WIRE_FORMAT.md` 6. Auction commitments [normative] — "No truncation anywhere: B2's transcript-completeness predicate may treat all three as full-width collision-resistant commitments."; `docs/core/DECISIONS.md` Entry 48 — wire-normative [decision record] — "B2 may treat wire shapes as law (closed field sets, full-width commitments collision-resistant per the W16 ruling)".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/core/src/experimental-auction.ts:289,319 (commitment-equality joins); legacy 16-byte truncated commitments at auction-bid-package.ts (evidence of the retired construction only)`.
  *Proposed tests:*
    - (−) A transcript revealing a bidderId or auctionId whose recomputed commitment does not equal the on-chain 32-byte field MUST be rejected.
    - (−) A reveal matching only the first 16 bytes of the commitment (legacy truncation) MUST be rejected — comparison is full-width.
    - (−) A state reveal with a phase string outside the five-string registry MUST be rejected before hashing (per §6 field 4).
    - (+) PIN: all three commitments recomputed from revealed inputs (including absent-field 0x0000 rendering and decimal canonical form) match the on-chain bid byte-for-byte.
  *Attack flag:* Collision resistance binds the text, not the actor: bidderId and auctionId are unconstrained trimmed UTF-8, so commitment matching proves 'someone knew this string', not 'this key/capital is this bidder' — identity-sensitive rules (T11 rebid) inherit this weakness.

- **T16.** When an auction reaches settled, the kernel MUST materialize ownership from the winning bid itself — the winning bid's ownerPubkey becomes the name's owner key, the winning bid's bond outpoint becomes the live name bond, and the winning amount becomes the required bond — and this transition MUST execute inside the audited kernel boundary, never in an adapter or indexer.
  *Sources:* `docs/spec/CONTESTED_AUCTION_REFERENCE.md` Settlement [candidate] — "the winning bid carries the owner key"; `docs/spec/AUCTION.md` Real Mechanism Choices [candidate] — "winning bids should carry the eventual owner key"; `docs/core/DECISIONS.md` Entry 42 — settlement-into-core [decision record] — "move auction settlement into the frozen boundary"; `docs/spec/CONTESTED_AUCTION_REFERENCE.md` Basic Flow [candidate] — "the winning bond becomes the live name bond".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:298-333 (legacy applyAuctionBid only validates/records — settlement lived outside the boundary, the exact gap #42 closes); packages/consensus/src/proof-bundle.ts:442-471 (winner/owner/bond consistency checks)`.
  *Proposed tests:*
    - (+) Settled transcript materializes a name record owned by the winning bid's ownerPubkey with the winning bid's (txid, bondVout) as the live bond anchor and the winning amount as required bond.
    - (−) A transcript whose declared winner ownerPubkey differs from the winning bid's ownerPubkey MUST be rejected.
    - (−) A settlement whose current bond outpoint txid differs from the winning bid txid, or whose bond value is below the required amount, MUST be rejected.
    - (−) Boundary-manifest test: no module outside the kernel allowlist can produce the settled-ownership transition (CI ratchet per boundary-manifest #44).
  *Attack flag:* LAUNCH.md's open settlement questions (separate winner-acknowledgement step, split-lock pre-maturity shape) could change this rule's shape; building the simple winner-materializes form is the documented direction but the kernel spec should state those questions are closed for v1 or carry them as named decisions.

- **T17.** At the notice deadline — observed as currentHeight ≥ anchorHeight + W_notice, with all deadlines keyed off the anchor's mined height per marker-fold (#47) — the kernel MUST rule each claimed name from the complete witnessed set of in-window DA-valid claims and qualifying bonds: exactly one DA-valid claim and no qualifying bond ⇒ finalize; two or more DA-valid claims and no qualifying bond ⇒ nullified (no owner, name reopens); any qualifying bond (against a claim or bond-first) ⇒ escalate to auction. A bare collision MUST NOT award.
  *Sources:* `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Public Notice [candidate] — "if the window expires with exactly one cheap claim and no qualifying bond, that claim finalizes through the accumulator"; `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Contested Auction — bond opens [candidate] — "a verifier observes, at currentHeight ≥ anchorHeight + W_notice, whether a qualifying bond landed"; `docs/core/DECISIONS.md` Entry 47 — marker-fold [decision record] — "All deadline windows key off the anchor's mined height — a fact Bitcoin witnesses."; `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Data Availability [candidate] — "A claim only counts if the underlying batch data is available under the protocol's DA rule.".
  *Verdict:* **cited**.
  *Needed spec work:* W_notice is a placeholder (STATUS: '6 blocks (test); target = weeks', decay schedule 'not frozen') — launch-freeze work; and the claim-eligibility input ('DA-valid') cannot finalize until the open da-windows decision rules the W/C/K values, since whether a claim counts at the notice deadline depends on its DA challenge timeline relative to that deadline.
  *Blocked on decision:* `da-windows`.
  *Proposed tests:*
    - (−) Two DA-valid claims, no bond, at the deadline: a transcript awarding either claimant MUST be rejected — the only valid verdict is nullified/no owner.
    - (−) An acquisition transcript that omits a witnessed second in-window claim MUST fail completeness rather than finalize the listed claim (omission cannot mint).
    - (−) A claim whose batch fails the DA verdict MUST NOT count toward finalize or nullify (exclusion denies only the withheld data, never takes another's name).
    - (+) One DA-valid claim, no qualifying bond, deadline reached ⇒ finalize; same inputs with a qualifying bond ⇒ escalate; bond-first with no prior claim ⇒ escalate.
  *Attack flag:* The verdict consumes the DA predicate (separate kernel area): if the DA challenge window (h+W+C) can end after the notice deadline (h+W_notice), the claim set at deadline time is not yet decidable — the window interleaving is exactly what da-windows must rule, and any implementation choice before that ruling is improvisation.

- **T18.** A claim or bid that confirms after a name is already final MUST NOT enter that name's acquisition transcript and MUST NOT alter its outcome — it is an already-owned attempt, not a contest.
  *Sources:* `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Public Notice [candidate] — "claims that arrive after a name is already final are already-owned attempts, not contests".
  *Verdict:* **cited**.
  *Proposed tests:*
    - (−) A claim anchored after finalization MUST NOT reopen the notice window, nullify, or escalate the final name.
    - (−) A qualifying-size bond posted after finalization MUST NOT open an auction on the final name (the bond path exists only in-window or bond-first pre-finality).
    - (+) Final name's state is byte-identical before and after replaying a post-final claim event.
  *Attack flag:* 'Already final' must be height-exact: a claim in the same block as the deadline boundary needs an inclusive/exclusive ruling, or reorg edges let a late claim flip between contest and inert across implementations.

- **T19.** A RecoverOwner sequence in a name's transcript MUST validate fail-closed: a cancel (veto) event counts only if owner-key-signed and confirmed within the pending recovery's challengeWindowBlocks, an invoke MUST reference the armed descriptor by recoveryDescriptorHash, and an invoke event MUST NOT change ownership until the recovery-auth decision names the authorized invoke-path signer — until ruled, the kernel MUST treat invoke-path authorization as unsatisfiable.
  *Sources:* `docs/spec/ONT_RECOVERY_INVOKE_SPEC.md` What's missing in code, item 2 [candidate] — "The invoke-path signer isn't yet defined. This is the open protocol question."; `docs/spec/ONT_RECOVERY_INVOKE_SPEC.md` Suggested wallet surface [candidate] — "Cancel a pending recovery during the challenge window. Owner-key signed."; `docs/spec/WIRE_FORMAT.md` 5. Keys and owner-key Schnorr digests [normative] — "Authorization semantics — which key must have produced a signature for an event to change name state — are kernel rules (B2), not wire.".
  *Verdict:* ~~cited~~ → **candidate-stays** (step-2 correction).
  *Step-2 correction:* The fail-closed default in the statement is invented — the spec holds the invoke-path signer open ('isn't yet defined'). Downgraded and blocked on recovery-auth; Decision #50 (provisional pending DK) now supplies the direction — finalize at ratification.
  *Blocked on decision:* `recovery-auth`.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:440-642 (applyRecoverOwner request/cancel paths; pendingRecovery tracking)`.
  *Proposed tests:*
    - (−) A cancel event confirmed after the pending recovery's challengeWindowBlocks have elapsed MUST be rejected.
    - (−) An invoke whose recoveryDescriptorHash does not equal the armed descriptor's digest MUST NOT create a pending recovery.
    - (−) Until recovery-auth is ruled: no signature of any kind satisfies invoke-path authorization (fail-closed holding test, replaced when the decision lands).
    - (+) Owner-key-signed cancel inside the challenge window aborts the pending recovery and restores the prior owner state (veto path, decidable today).
  *Attack flag:* challengeWindowBlocks rides inside the event the recoverer broadcasts; nothing cited binds it to the armed descriptor's value at the kernel layer — a recoverer choosing a 1-block window neuters the veto unless an equality check with the descriptor is ratified (the descriptor digest covers its own challengeWindowBlocks, but the cross-check is unstated kernel work).

- **T20.** Every transcript deadline and window (unlock, auction close, soft-close extension, notice deadline, recovery challenge window) MUST be computed from Bitcoin block heights present in the witnessed chain facts under a frozen, monotonic, height-keyed schedule; market-derived system characteristics MUST NOT shrink any window, and any adaptive behavior MUST be extend-only.
  *Sources:* `docs/spec/AUCTION.md` Window Schedule — Decay Rule [candidate] — "Use a frozen, monotonic, height-keyed schedule. Do not let market-derived system characteristics shrink windows."; `docs/spec/AUCTION.md` Window Schedule — Decay Rule [candidate] — "If adaptive behavior exists at all, it should be extend-only"; `docs/core/DECISIONS.md` Entry 37 — bond-opens [decision record] — "Deadline-derived in the engine (a verifier checks, at currentHeight ≥ anchorHeight + W_notice, whether a qualifying bond landed)".
  *Verdict:* **cited**.
  *Needed spec work:* The height-keyed decay schedule values (90d→60d→30d→14d→7d phases) are an unfrozen recommendation — launch-freeze work; the rule is stated parameterized over the schedule function.
  *Proposed tests:*
    - (−) The verdict function exposes no timestamp, bonded-value, bidder-count, or claim-volume input — type-level/property test that only heights and event bytes can vary the deadline outcome.
    - (+) Monotonicity property: for any two anchor heights h1 < h2, window(h1) ≥ window(h2) under the frozen schedule (decay only by height).
    - (−) Injecting simulated 'market maturity' signals (more bidders, more bonded value) MUST NOT produce a shorter window for the same anchor height.
  *Attack flag:* Wire events carry an issuedAt timestamp in off-chain shapes (§8): any transcript rule that ever consults issuedAt instead of mined height reintroduces wall-clock into consensus — flag for the B2 hunting list.

- **T21.** Each accepted bid counted in a transcript MUST be a distinct L1 transaction: a transcript listing the same bid txid more than once, or padding the set with duplicate or malformed txids, MUST be rejected — not silently deduplicated.
  *Sources:* `docs/core/STATUS.md` Components — Contested-auction bonded bid [canonical status] — "Proof bundle now enforces highest-bid-wins + distinct-bid well-formedness (was a gap)."; `docs/core/SOFTWARE_CANON.md` Item 4 — Tests before implementation [ratified core] — "a forged summary must provably be unable to mint, steal, or falsely finalize a name".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/consensus/src/proof-bundle.ts:489-503 (direct.bids.unique: dedupe on txid, count must match; only syntactically valid 32-byte txids count as unique)`.
  *Proposed tests:*
    - (−) A transcript with the same bid txid listed twice MUST be rejected (duplicate-stuffing/second-winner smuggling).
    - (−) A bid entry with a malformed (non-32-byte-hex) txid MUST NOT pass as 'unique' — it fails well-formedness rather than slipping through dedupe.
    - (+) All-distinct valid-txid bid set passes well-formedness.
  *Attack flag:* The rule's prescriptive home is a STATUS component capability note plus canon's test mandate, not a spec/ MUST sentence — restate it in the B2 kernel spec section during hardening so the authority is not a status table.

- **T22.** The kernel MUST treat auction generations as distinct lots: the first auction for a name is the opening lot, and after an early bond break a reopened lot MUST be accepted only if its anchor equals the latest recorded bond-break release block for that name; a reopen bid anchored to any other block MUST NOT open an auction or enter any transcript.
  *Sources:* `docs/spec/AUCTION.md` Bond Breaks And Reauction [candidate] — "the indexer recognizing a reopened auction only if its anchor equals the latest recorded bond-break release block"; `docs/spec/AUCTION.md` Bond Breaks And Reauction [candidate] — "Reauction identity | Anchored to the release block".
  *Verdict:* **cited**.
  *Needed spec work:* The auctionId grammar (opening-{name} / reopen-{name}-after-{release_height}) lives only in the LAUNCH.md narrative the AUCTION.md parenthetical points at — it must land in a spec/ section before the lot-commitment preimage (T5) is fully specified; 'no cooldown' and floor-reset values are placeholders for launch freeze.
  *Legacy evidence (never authority):* `packages/core/src/experimental-auction.ts:233-234 (lot id: reopen-{name}-after-{unlockBlock} vs opening-{name})`.
  *Proposed tests:*
    - (−) A reopen lot anchored to a block that is not the latest recorded bond-break release block (an old settled generation, a malformed reopen, a stale release height) MUST NOT open an auction.
    - (−) Bids committing to a prior generation's lot MUST NOT count in the new generation's transcript (lot commitments differ — generations cannot collapse into one lot).
    - (+) After a witnessed pre-maturity bond spend at height h, a reopen lot anchored to h opens with the length-floor opening minimum.
  *Attack flag:* The cited sentence names 'the indexer' as the recognizer — server-authority leakage as written; the kernel restatement must make release-block matching a pure predicate over witnessed bond-spend facts.
  *Attack flag:* 'Latest recorded bond-break release block' presumes a witnessed bond-continuity history; if that witness is incomplete the reopen gate is decided on partial facts — the release-block witness needs the same completeness treatment as the bid set (T2).

**Gaps — Transcript completeness duties with no spec text at all:**

- No spec text defines the transcript artifact the kernel consumes: required fields, encoding, or which events it must enumerate. The acceptedBids/winner/settlementProof shape exists only in legacy code (packages/consensus/src/proof-bundle.ts) and the GLOSSARY 'proof bundle' entry's passing mention; CONTESTED_AUCTION_REFERENCE itself lists 'proof bundle shape for auction settlement' under What Still Needs Work.
- No spec text defines the completeness witness — what evidence suffices for the kernel to treat a bid set as the complete set of L1 AuctionBid events over a lot's block range. STATUS discloses the gap ('set-completeness vs L1 still needs the light-client path') but no rule states the sufficient condition; B3 owns the witness format, B2 owns the predicate, and neither side has text.
- No spec text states the on-chain form of 'posting a qualifying bond': that a qualifying bond IS an AuctionBid event meeting the opening floor — including for bond-first openings with no prior claim. The mapping from #37's 'qualifying bond' vocabulary to the wire's single AuctionBid event is implied everywhere and stated nowhere.
- No spec text defines the total application order of same-block transcript events beyond Decision #25's 'otherwise tied' tie-break: what 'tied' means, whether same-block non-tied bids apply in tx order for increment/extension purposes, and the deeper tie levels (legacy code uses height → txIndex → vout → txid → bidderCommitment with only height/tx-order having doc authority).
- No spec/ text defines the auctionId grammar (opening-{name} / reopen-{name}-after-{release_height}); it lives only in the LAUNCH.md narrative, yet it is preimage material for the normative §6 lot commitment.
- No spec text decides exclude-vs-abort for a transcript containing a wire-malformed payload (silently drop the payload vs fail the transcript) — legacy code silently skips; fail-closed direction is implied but unstated.
- No spec text decides whether a stale auctionStateCommitment rejects a bid (legacy rejects), nor defines 'pre-bid state' exactly — height and intra-block ordering — for the state-commitment match.
- No spec text binds the AuctionBid's plaintext name/unlockBlock fields to the lot-commitment preimage (consistency requirement between §4.3 plaintext and §6 committed values).
- No spec text requires the RecoverOwner event's challengeWindowBlocks to equal the armed descriptor's challengeWindowBlocks at validation time (the cross-object equality the veto's safety depends on).


### Batched-path transitions (B*)

- **B1.** A name's batched-path lifecycle state MUST be exactly one of {provisional, collided, contested, final, nullified}, derived deterministically from (claim anchor height, the set of eligible competing claims, qualifying bonds, current chain height); the product-tier 'quiet' label MUST NOT exist as a kernel state and MUST NOT alter any transition.
  *Sources:* `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Implementation Status [candidate] — "the notice-window lifecycle (provisional → final | nullified)"; `docs/spec/AUCTION.md` Provisional Utility [candidate] — "`quiet` | no contest after an early sub-window, e.g. `7-14 days` | higher confidence, still not final"; `docs/GLOSSARY.md` provisional [candidate] — "a claim that is anchored but whose notice window is still open".
  *Verdict:* ~~cited~~ → **candidate-stays** (step-2 correction).
  *Step-2 correction:* Cited section is AUCTION.md 'Provisional Utility' — recommended product state language, not consensus rule text. Downgraded; neededSpecWork: consensus-tier statement in AUCTION.md or the state machine.
  *Proposed tests:*
    - (+) State-derivation table: for fixed (anchorHeight, W_notice, bond set, collision set), sweeping currentHeight yields provisional→final, collided→nullified, and bond-in-window→contested exactly per the table.
    - (−) Property: no input combination yields a state outside the five-element set; in particular no 'quiet', 'unopened', or legacy status value is reachable.
    - (−) Elapsing an early sub-window (the product 'quiet' threshold) with otherwise identical inputs produces byte-identical kernel state — quiet has zero kernel effect.
  *Attack flag:* AUCTION.md's Provisional Utility table is explicitly 'product posture'; if the kernel imports 'quiet' it creates a state the chain does not witness
  *Attack flag:* the table row for provisional says 'DA-valid' — eligibility verdicts are inputs, so an implementation caching state across a flipped DA verdict desynchronizes

- **B2.** A claim's notice window MUST open at its batch anchor's mined height h and close at h + W_notice, and every finality transition MUST be evaluated as a pure predicate over chain facts at heights — never wall-clock, receipt time, or publisher say-so.
  *Sources:* `docs/core/DECISIONS.md` Decision Log §37 bond-opens [ratified] — "a verifier checks, at `currentHeight ≥ anchorHeight + W_notice`, whether a qualifying bond landed"; `docs/core/DECISIONS.md` Decision Log §47 marker-fold [ratified] — "All deadline windows key off the anchor's mined height — a fact Bitcoin witnesses."; `docs/GLOSSARY.md` notice window [candidate] — "the waiting period a claim's anchor opens before the claim can finalize".
  *Verdict:* **cited**.
  *Needed spec work:* W_notice is a launch-freeze parameter (STATUS: '6 blocks (test); target = weeks', placeholder, not frozen); the AUCTION.md height-keyed decay schedule is a recommendation, not frozen — neither value can ground the constant, only the mechanism.
  *Legacy evidence (never authority):* `packages/core/src/indexer.ts:513-527`.
  *Proposed tests:*
    - (+) Window predicate is a pure function of (anchorHeight, W_notice, currentHeight): same inputs give same verdict across repeated and reordered evaluation.
    - (−) A claim at currentHeight = h + W_notice − 1 is not final; advancing exactly one block flips it — pinning the close height to the anchor, not to any observation time.
    - (−) Zero I/O property: the transition module imports no clock/network/db (research-quarantine-style import test per the B2 gate).
  *Attack flag:* boundary inclusivity is unstated: whether a qualifying bond mined exactly at height h + W_notice is in-window (#37 writes the verifier check as ≥ but never the bond-side comparison) — one block of ambiguity decides contested vs final

- **B3.** A name MUST finalize to its claimant's owner key if and only if, at window close, exactly one eligible claim (anchor accepted, DA-eligible, gate-fee covered) exists for the name and no qualifying bond landed inside the window.
  *Sources:* `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Public Notice [candidate] — "if the window expires with exactly one cheap claim and no qualifying bond, that claim finalizes through the accumulator"; `docs/core/DECISIONS.md` Decision Log §37 bond-opens [ratified] — "One cheap claim, no bond by the deadline → finalizes (the long tail, unchanged)."; `docs/LAUNCH.md` Acquisition Flow [narrative, supplementary] — "If no qualifying bond is posted against the name in that window (and no competing claim with no bond lands), the claim finalizes through the accumulator.".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/core/src/indexer.ts:516-520`.
  *Proposed tests:*
    - (+) Single eligible claim, empty bond set, height ≥ close: finalizes to the claim's owner key.
    - (−) Qualifying bond anywhere inside the window ⇒ the claim never reaches final (it reaches contested), even after close height passes.
    - (−) A second eligible distinct-owner claim inside the window ⇒ not final (nullified path), regardless of which claim anchored first.
    - (−) A claim from a DA-excluded or fee-failing batch does not count toward 'exactly one' and cannot finalize.
  *Attack flag:* 'exactly one' silently depends on the three eligibility verdicts from other kernel areas; if any verdict is evaluated at a different height than window close, the claim count can differ between honest nodes

- **B4.** If at window close two or more eligible claims with no qualifying bond exist for the name, the name MUST transition to nullified — it resolves to no owner and reopens for claiming; a claim with no bond MUST NOT ever award a contested name.
  *Sources:* `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Public Notice [candidate] — "if the window expires with two or more cheap claims and no bond, the name is nullified — it resolves to *no owner* and reopens for claiming (a bare collision can deny, never award)"; `docs/core/DECISIONS.md` Decision Log §37 bond-opens [ratified] — "Two+ cheap claims, no bond → the name is **nullified** (no owner) and reopens for claiming."; `docs/spec/CONTESTED_AUCTION_REFERENCE.md` Core Rule [candidate] — "If two or more DA-valid claims for the same name land inside the notice window with **no bond**, the name does not finalize and is **nullified**".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/core/src/indexer.ts:825-834`.
  *Proposed tests:*
    - (+) Two distinct-owner eligible claims in one window, no bond: at close the name is nullified and resolves to no owner.
    - (−) Ordering permutation battery: swapping anchor order, block position, or batch membership of the two claims never awards either claimant (deny-never-award).
    - (−) A miner-style front-run (competing claim ordered first in the same block) gains nothing: outcome is still nullified, never ownership.
  *Attack flag:* spite-grief denial is the accepted residual of #37 — tests must pin that nullification costs the griefer the gate with zero payoff
  *Attack flag:* CONTESTED_AUCTION_REFERENCE says 'DA-valid claims' while the state machine says 'cheap claims' — an ineligible (withheld) colliding claim must NOT nullify, or withholding becomes a free denial weapon

- **B5.** Two claims for the same name MUST count as a collision only when their owner keys differ; a duplicate or re-anchored claim binding the same (name, owner key) MUST be idempotent — it neither collides, nor extends, nor resets the window.
  *Sources:* `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Public Notice [candidate — does not define 'competing claim'] — "if the window expires with two or more cheap claims and no bond, the name is nullified"; `docs/GLOSSARY.md` nullified [candidate — same gap] — "two or more claims with no qualifying bond collide in a window".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* Named spec PR to ONT_ACQUISITION_STATE_MACHINE.md defining 'competing claim' as a distinct-owner-key claim for the same canonical name, and stating same-(name,owner) re-claims are idempotent. Current spec text counts raw claims, under which an attacker who copies a victim's exact leaf into their own batch — or a publisher re-anchoring honestly — would nullify the victim's name.
  *Legacy evidence (never authority):* `packages/core/src/indexer.ts:825-857`.
  *Proposed tests:*
    - (+) Same (name, owner) claim appearing in two anchored batches: name stays provisional and finalizes normally; merged state is identical to the single-claim case.
    - (−) Replayed identical leaf in an attacker-controlled batch does not set the collided flag and cannot nullify the victim's claim.
    - (−) Distinct-owner claim with the same name does collide — the owner-key comparison, not leaf bytes, is the discriminator.
  *Attack flag:* leaf-copy nullification: under the literal current text, re-anchoring someone's own claim is a collision — a free, gate-cost-shifted denial attack the distinct-owner definition closes

- **B6.** A name MUST transition to contested if and only if a qualifying bond (at or above the bond floor) is posted inside the notice window — against an existing eligible claim, or bond-first with no prior claim — and a contested name MUST escalate to the L1 bonded auction; claim count alone MUST NOT escalate.
  *Sources:* `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Contested Auction [candidate] — "A name escalates to the bonded L1 auction when a **qualifying bond** is posted — either against an existing in-window claim, or **bond-first** with no prior cheap claim"; `docs/core/DECISIONS.md` Decision Log §37 bond-opens [ratified] — "**Decision: a bond — not a bare claim — opens the auction.**"; `docs/GLOSSARY.md` bond [candidate] — "A **qualifying bond** (at or above the bond floor) is the only thing that opens an auction (Decision #37)".
  *Verdict:* **cited**.
  *Needed spec work:* The escalation floor (₿50,000) is a STATUS placeholder that #37 says 'graduates from placeholder to a launch decision' — rule stays parameterized on bondFloor until launch freeze.
  *Proposed tests:*
    - (+) Qualifying bond posted mid-window against an existing claim ⇒ state becomes contested and an auction opens for the name.
    - (+) Bond-first: qualifying bond with no prior claim opens the auction directly.
    - (−) Sub-floor bond inside the window does not contest: at close the single claim finalizes (or collision nullifies) exactly as if no bond existed.
    - (−) Any number of bare claims never escalates: ten distinct-owner claims, no bond ⇒ nullified, no auction.
  *Attack flag:* 'qualifying' is doing all the work: dust-bond griefing (posting a sub-floor bond to confuse adapters) must be a no-op in the kernel predicate
  *Attack flag:* a bond posted in the same block as window close hits the B2 boundary ambiguity

- **B7.** A claim or bond that lands at or after a name's finality MUST be refused as an already-owned attempt: it MUST NOT change the owner, reopen or extend any window, nullify the name, or open an auction.
  *Sources:* `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Public Notice [candidate] — "claims that arrive after a name is already final are already-owned attempts, not contests"; `docs/GLOSSARY.md` first-anchor-wins [candidate] — "Ordering inside a window never awards a contested name (bonds do).".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/core/src/indexer.ts:835-840`.
  *Proposed tests:*
    - (−) Distinct-owner claim anchored one block after window close against a finalized name: incumbent owner unchanged, no collided flag, no new window.
    - (−) Qualifying bond posted after finality opens no auction and cannot evict the final owner.
    - (+) The refused attempt is observable (refusal recorded) without any state mutation of the incumbent record.
  *Attack flag:* spec covers post-final claims but is silent on post-final bonds — the only doc ground is the in-window phrasing of #37; an explicit negative test must pin that a rich attacker cannot bond-open against a final name

- **B8.** Among non-conflicting claims for the same name anchored in different batches, the earliest accepted Bitcoin anchor MUST govern the claim's window and priority (first-anchor-wins); a later re-anchor of the same claim MUST NOT extend or reset provisionality.
  *Sources:* `docs/GLOSSARY.md` first-anchor-wins [candidate] — "when the same name is claimed on different batches outside a live window, the earliest Bitcoin-anchored claim holds"; `docs/core/DECISIONS.md` Decision Log §51-era snapshot, line 1135 [record] — "first-anchor-wins with deterministic priority, live since 2026-06-09".
  *Verdict:* ~~cited~~ → **candidate-stays** (step-2 correction).
  *Step-2 correction:* Critic verified the cited line is an open-questions register note, not a decision entry. Downgraded; neededSpecWork: state the rule in ONT_ACQUISITION_STATE_MACHINE.md (or a DECISIONS entry) before promotion.
  *Legacy evidence (never authority):* `packages/core/src/indexer.ts:844-857`.
  *Proposed tests:*
    - (+) Same-owner claim re-anchored at a later height: claimHeight and window stay keyed to the earliest anchor; resulting state identical to single-anchor case.
    - (−) Re-anchoring cannot push noticeWindowCloseHeight forward — a claimant cannot keep their own name perpetually provisional (or dodge an incoming bond) by re-anchoring.
    - (−) Permutation property: processing the two anchors in either discovery order converges to the earliest-anchor window (kernel inputs are chain-ordered events, so this MUST be order-invariant).
  *Attack flag:* late-surfacing earlier anchor re-keys the window backwards in time — combined with a DA-delayed reveal this could close a window retroactively; the interaction with the B11 forfeit rule must be pinned (a deadline-missing earlier anchor must NOT win priority)

- **B9.** A claim MUST enter per-name state only through a leaf that verifies against an accepted anchor's committed root (membership proof binding the canonical name to its owner key); a forged, mismatched, or non-canonical-name leaf MUST be ignored without affecting the batch's other leaves or any existing name state.
  *Sources:* `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` §8b The transport layer [candidate] — "every node verifies fetched bytes against that on-chain commitment before using them. So a byte source can't lie"; `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Claim [candidate] — "A claim binds: normalized name, intended owner key, Bitcoin anchor, full batch data needed for replay"; `docs/spec/WIRE_FORMAT.md` §4.4 RootAnchor [normative] — "frame ‖ `prevRoot`(32) ‖ `newRoot`(32) ‖ `batchSize`(u32)".
  *Verdict:* **split** — see step-2 correction below; cited half stands, the named clause is candidate-stays.
  *Step-2 correction:* The exclusion of a failing leaf is cited; the per-leaf granularity clause ('without affecting the batch's other leaves') has no doc text — candidate-stays, and is exactly cross-area conflict C5 (per-leaf vs whole-batch verdict granularity). neededSpecWork: DA agreement must state verdict granularity.
  *Legacy evidence (never authority):* `packages/core/src/indexer.ts:796-874`.
  *Proposed tests:*
    - (−) Forged leaf (proof fails against newRoot), owner-mismatch leaf (proof value ≠ claimed owner key), and uppercase-name leaf are each dropped; the remaining valid leaves of the same batch merge unaffected.
    - (−) Leaves presented against a root that no accepted anchor committed are refused wholesale (cannot inject names via an unanchored root).
    - (+) A verifying leaf from a hostile transport source merges identically to one from the publisher — transport identity is not an input.
  *Attack flag:* per-leaf drop semantics mean a publisher can construct a batch where the victim's leaf is subtly malformed (claim paid, never counts) — bounded ~$1 per #38, but the negative tests must pin that malformation never corrupts neighbors

- **B10.** When the data-availability verdict excludes a batch, the kernel MUST exclude every claim of that batch from all per-name transitions, uniformly for every verifier; exclusion MUST only remove the batch's own leaves — it MUST NOT alter any other name's state or unseat any final owner.
  *Sources:* `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` §6c Fail closed, with an attributable challenge [candidate] — "it is **uniformly excluded** — every honest node drops it"; `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` §5 The key decomposition [candidate] — "including vs. excluding `D` changes **only whether `D`'s own leaves exist** — nothing else in the tree moves"; `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Data Availability [candidate] — "exclusion cannot take someone else's name; it only prevents the withheld data from counting".
  *Verdict:* **cited**.
  *Blocked on decision:* `da-windows`.
  *Proposed tests:*
    - (+) Batch excluded by the DA verdict: all its claims vanish from claim counts (a collision caused solely by an excluded claim resolves as if it never existed).
    - (−) Exclusion of batch D leaves every name not claimed in D byte-identical, and cannot flip any final name back to unowned or to a different owner.
    - (−) An excluded batch's claims cannot re-enter on later byte arrival for the same anchor (uniform and permanent per anchor).
  *Attack flag:* the rule's shape is final but its trigger heights (W, C, K) are the open da-windows decision — any test fixture must parameterize them
  *Attack flag:* uniformity depends on every verifier evaluating the same verdict input; if served-bytes evidence (B3 witness) differs between nodes, 'uniform' silently fails — kernel must take the verdict as an explicit witnessed input, never compute it from local fetch success

- **B11.** A claim whose batch bytes were not demonstrably available by the anchor-keyed hard deadline MUST forfeit contest priority permanently: it MUST NOT later evict, collide with, escalate against, or out-prioritize a claim that met the deadline.
  *Sources:* `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` §6d Contested leaves: hard window, escalate to L1 [candidate] — "Miss it → **forfeit priority** (this kills the withhold-then-reveal theft vector: you cannot hide a claim and later surface it to evict an earlier, available claimant)"; `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Data Availability [candidate] — "contested names rely on the hard availability deadline so hidden claims cannot appear later and steal priority".
  *Verdict:* **cited**.
  *Blocked on decision:* `da-windows`.
  *Proposed tests:*
    - (−) Hide-then-reveal: claim anchored at h, bytes first served after the deadline — the claim cannot nullify, contest, or take the name from a later available claimant.
    - (−) A forfeited earlier anchor cannot exploit B8 first-anchor-wins: priority among claims is among deadline-meeting claims only.
    - (+) Bytes served exactly within the window: claim keeps full priority (boundary fixture parameterized on W/C).
  *Attack flag:* this rule is unenforceable until da-windows is ruled and the B3 served-bytes witness format exists — until then the live behavior (retry with backoff, packages/core retained none of the deadline) is the documented gap in STATUS Known-incomplete

- **B12.** An auction for a name MUST come into existence only when a valid bonded opening bid meeting the opening floor (the higher of the length price and the long-name minimum) is confirmed; no catalog entry, schedule, or expiry state may create, imply, or settle an auction.
  *Sources:* `docs/spec/AUCTION.md` Real Mechanism Choices (normative shape) [candidate] — "a valid bonded opening bid is what creates the auction"; `docs/spec/AUCTION.md` Opening Bond Floors [candidate, placeholder numbers] — "The opening bid must meet the higher of two floors"; `docs/LAUNCH.md` Legacy Scheduled-Catalog Compatibility State [narrative, supplementary] — "In the user-started model, no auction exists until a valid bonded opening bid confirms.".
  *Verdict:* **cited**.
  *Needed spec work:* Opening-floor curve values (₿100,000,000 halving curve, ₿50,000 long-name minimum) are explicit placeholders — rule stays parameterized on floor(nameLength) until launch-parameter freeze.
  *Legacy evidence (never authority):* `packages/core/src/indexer.ts:1003-1052`.
  *Proposed tests:*
    - (+) Confirmed opening bid at exactly the floor for its name length creates a live auction whose lot commitment recomputes from (auctionId, name, unlockBlock).
    - (−) Opening bid below floor(nameLength): no auction exists; later transitions treat the name as never escalated.
    - (−) The legacy 'unopened' scheduled-catalog state is unreachable: no fixture without a confirmed opening bid produces any auction or settlement (old-model leakage hunt).
  *Attack flag:* the lot commitment binds (auctionId, name, unlockBlock) — a bid whose recomputed lot commitment mismatches its claimed lot must be refused or attackers mint parallel lots for one name (legacy checks this at indexer.ts:1043-1045; the kernel predicate must own it)

- **B13.** An auction MUST be in exactly one phase of {pending_unlock, awaiting_opening_bid, live_bidding, soft_close, settled}, derived deterministically from (unlock height, accepted-bid set, close height, soft-close window, current height); any other phase value MUST be rejected.
  *Sources:* `docs/spec/WIRE_FORMAT.md` §6 Auction commitments [NORMATIVE per wire-normative (#48)] — "exactly one of `pending_unlock`, `awaiting_opening_bid`, `live_bidding`, `soft_close`, `settled`; anything else MUST be rejected"; `docs/spec/AUCTION.md` Auction Timing [candidate] — "Bid inside the final `144` blocks moves close to bid block + `144`".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/core/src/auction-state.ts:170-203`.
  *Proposed tests:*
    - (+) Phase sweep over heights for a fixed bid transcript: pending_unlock before unlock, awaiting_opening_bid until first accepted bid, live_bidding, soft_close inside the final window, settled strictly after close.
    - (−) A state commitment carrying any phase string outside the five is rejected (wire vector already exists; kernel property: derived phase is always in-set).
    - (−) Reorg fixture: dropping the block containing the last accepted bid moves a 'settled' auction back to an open phase deterministically — settlement is a height-derived predicate, not a latched event.
  *Attack flag:* 'settled' is derived purely from height > close — there is no settlement transaction, so a reorg can unsettle an auction after a winner materialized; the spec never states the required confirmation depth for settlement (gap G2)

- **B14.** A later bid MUST be accepted only if it is at least the current required minimum — max(absoluteFloor, percentageIncrement of the standing high), using the stronger soft-close percentage when the bid lands inside the soft-close window; a below-minimum bid MUST be rejected without changing leader, close height, or required minimum.
  *Sources:* `docs/spec/AUCTION.md` Bid Escalation [candidate, placeholder numbers] — "Normal minimum raise | max(₿1,000, `5%`)"; `docs/spec/AUCTION.md` Real Mechanism Choices (normative shape) [candidate] — "bids that extend an auction during soft close should face a stronger minimum increment than ordinary mid-auction bids".
  *Verdict:* **cited**.
  *Needed spec work:* Increment values (₿1,000 floor, 5%/10%) are placeholders — parameterize; additionally the spec never defines percentage rounding direction or base (5% of standing high, rounded how?) — that precision must land in the hardening spec PR before vectors can be pinned.
  *Legacy evidence (never authority):* `packages/core/src/experimental-auction.ts:524-554`.
  *Proposed tests:*
    - (−) Bid at requiredMinimum − 1 sat is rejected; auction state (leader, close, requiredMinimum) is byte-identical before and after.
    - (+) Bid at exactly requiredMinimum is accepted and becomes leader.
    - (−) Inside soft close, a bid clearing the normal increment but not the soft-close increment is rejected.
    - (−) Rejected bid inside the soft-close window does NOT extend the close (extension is a consequence of acceptance only).
  *Attack flag:* rounding ambiguity: floor vs ceil on the percentage term lets implementations disagree by 1 sat on acceptance — a consensus split vector
  *Attack flag:* whether a rejected late bid extends the close is unstated in spec text; legacy extends only on acceptance — if rejection extended, free close-griefing with dust bids

- **B15.** An accepted bid inside the soft-close window MUST move the auction close to bid height + softCloseExtension; the close height MUST be monotone non-decreasing across the transcript and MUST NOT be subject to a hard extension cap.
  *Sources:* `docs/spec/AUCTION.md` Auction Timing [candidate, placeholder numbers] — "Bid inside the final `144` blocks moves close to bid block + `144`"; `docs/spec/AUCTION.md` Auction Timing [candidate] — "Hard cap on extensions | None"; `docs/spec/CONTESTED_AUCTION_REFERENCE.md` Auction Family [candidate] — "no hard extension cap in the current design".
  *Verdict:* **cited**.
  *Needed spec work:* Window and extension block counts (1,008 / 144) are placeholders — parameterize until launch freeze.
  *Legacy evidence (never authority):* `packages/core/src/experimental-auction.ts:556-561`.
  *Proposed tests:*
    - (+) Accepted bid at close − 1: close moves to bid height + extension; phase returns to soft_close as the new close approaches.
    - (−) Property over arbitrary transcripts: close height never decreases (extend-only, Math.max semantics).
    - (+) Chained late bids extend indefinitely — no transcript length terminates the auction other than blocks passing the latest close.
  *Attack flag:* no hard cap means a capital-rich griefer can hold an auction open forever at escalating cost — AUCTION.md accepts this; the kernel must not import any 'eventually force-end' heuristic that text does not grant

- **B16.** A rebid by the same bidder MUST replace that bidder's earlier standing bid by spending the earlier bid's bond outpoint; the replaced bond becomes releasable and exactly one standing bid per bidder remains.
  *Sources:* `docs/spec/AUCTION.md` Real Mechanism Choices (normative shape) [candidate] — "same-bidder rebids should replace earlier bids by spending the earlier bond outpoint".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/core/src/experimental-auction.ts:563-572`.
  *Proposed tests:*
    - (+) Same bidderCommitment rebids higher: earlier outcome flips to replaced (bond releasable at the rebid height), new bid leads.
    - (−) A 'rebid' that does not spend the earlier bond outpoint is refused as a replacement (cannot hold two live bonds under one standing-bid identity).
    - (−) Replacement must still clear the minimum increment — self-replacement cannot lower the standing high.
  *Attack flag:* bidder identity is the bidderCommitment, which is bidder-chosen: one party can trivially use fresh commitments per bid and never trigger replacement, stacking standing bonds — the rule constrains honest wallets, not adversaries; spec should state what replacement protects (capital efficiency) so reviewers don't read it as a security boundary

- **B17.** When an auction reaches settled, the kernel MUST finalize ownership natively: the highest accepted bid is the winner, the winning bid's ownerPubkey becomes the name's owner key, the winning bond outpoint becomes the live name bond, the winning amount becomes the required bond, and the name enters maturity until the bond release height — with no adapter or separate settlement transaction deciding any of it.
  *Sources:* `docs/core/DECISIONS.md` Decision Log §42 settlement-into-core [ratified] — "**move auction settlement into the frozen boundary**, so the audited trust surface determines all ownership transitions"; `docs/spec/AUCTION.md` Real Mechanism Choices (normative shape) [candidate] — "the current working path is that a settled winner materializes directly into a live owned name"; `docs/LAUNCH.md` Auction Settlement Becomes Ownership [narrative, supplementary] — "the winning bid's `ownerPubkey` becomes the live owner key for the name".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/core/src/indexer.ts:1074-1140`.
  *Proposed tests:*
    - (+) Settled transcript materializes a name record whose owner key, bond outpoint, required bond, and maturity height all equal the winning bid's fields; the documenting test for DECISIONS #42 required by the B2 gate.
    - (−) No bid transcript can produce an owner other than the highest accepted bid's ownerPubkey (property over generated transcripts).
    - (−) Adapter-authority battery: a hostile evidence/adapter layer presenting a different 'winner' cannot change the kernel's settlement verdict (B3-gate negative reused here).
    - (+) Lifecycle continuation: the settled owner can be the prevState authority for a subsequent value record and (post-maturity) transfer.
  *Attack flag:* winner correctness is only as strong as transcript completeness (other area): an omitted higher bid passes structural settlement — STATUS discloses the bundle 'does not prove the listed set is the complete set of L1 bids'
  *Attack flag:* legacy refuses materialization when the winning bond was spent_before_allowed_release (indexer.ts:1107-1109) — that pre-settlement bond-spend condition exists in no spec text (gap G7)
  *Attack flag:* settled is height-derived (B13) so settlement must be stated at a confirmation depth or a reorg can re-decide the owner

- **B18.** Before maturity the winner's bond MUST remain continuous: a pre-maturity transfer MUST spend the current bond and create a valid successor bond in the same transaction, and a bond spent early without a valid successor MUST release the name (active ownership invalidated, name reopens for a new auction generation).
  *Sources:* `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Bonded Ownership [candidate] — "a broken bond invalidates active ownership before maturity"; `docs/spec/AUCTION.md` Bond Breaks And Reauction [candidate] — "If bond continuity breaks early | Name is released"; `docs/GLOSSARY.md` maturity [candidate] — "Spending the bond early without a valid successor forfeits the name (it reopens — an ONT rule, not a Bitcoin timelock).".
  *Verdict:* **cited**.
  *Needed spec work:* Maturity duration (52,560 blocks) is a placeholder; the epoch-halving helper is named prototype residue to remove — both are launch-freeze items.
  *Legacy evidence (never authority):* `packages/core/src/experimental-auction.ts:677-712`.
  *Proposed tests:*
    - (−) Bond spent before maturity height with no same-transaction successor: name transitions to released; owner authority over the name ends at that height.
    - (+) Pre-maturity transfer spending the bond and creating a successor in one transaction preserves ownership continuity and does not reset the maturity clock.
    - (−) Successor bond created in a different transaction than the spend does not satisfy continuity.
  *Attack flag:* 'valid successor bond' (amount? vout? same value as required bond?) is never defined in spec text — without a minimum-value rule a winner could swap to a dust successor and keep the name (gap G6)

- **B19.** A name released by an early bond break MUST reopen only as a fresh auction generation anchored to the latest recorded bond-break release height: the reopened lot identity is reopen-{name}-after-{release_height} (first auctions are opening-{name} with eligibility block 0), and a reopen whose anchor does not equal the latest release height for that name MUST be refused.
  *Sources:* `docs/spec/AUCTION.md` Bond Breaks And Reauction [candidate] — "Reauction identity | Anchored to the release block"; `docs/LAUNCH.md` Released-Name Reauction Path [narrative, supplementary] — "The indexer only recognizes a reopened auction if its anchor equals the latest recorded bond-break release block for that name."; `docs/spec/AUCTION.md` Bond Breaks And Reauction [candidate] — "Who can reopen the name | Anyone".
  *Verdict:* **cited**.
  *Needed spec work:* Reauction floor reset and zero cooldown are placeholder rows; and the rule text lives partly in LAUNCH.md voiced as 'the indexer only recognizes' — the hardening spec PR must restate it as a kernel predicate (adapter-voiced spec text is server-authority leakage).
  *Legacy evidence (never authority):* `packages/core/src/indexer.ts:1019-1025; packages/core/src/experimental-auction.ts:226-235`.
  *Proposed tests:*
    - (−) Reopen bid whose unlockBlock differs from the latest release height (stale generation, fabricated height, or an older release after two breaks) creates no auction.
    - (−) An old settled lot commitment cannot be reused to capture the released name (distinct lot identities cannot collapse).
    - (+) After a recorded release at height r, a bid anchored to r with lot reopen-{name}-after-{r} opens a fresh auction at the length floor.
  *Attack flag:* the rule depends on 'latest recorded bond-break release block' being itself a kernel-derived chain fact; if release recording stays adapter-side, a lying adapter mints reopen generations

- **B20.** At the maturity height the name MUST transition from bonded owner to mature owner: owner-key authority survives bond release, post-maturity transfers MUST NOT require a successor bond, and the maturity clock MUST NOT reset on transfer.
  *Sources:* `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Bonded Ownership [candidate] — "owner-key authority can survive bond release"; `docs/spec/AUCTION.md` Winner Bond And Maturity [candidate] — "Maturity reset on transfer | No | Original clock continues"; `docs/GLOSSARY.md` mature owner [candidate] — "ownership with no remaining bond encumbrance, indistinguishable from an uncontested claimant's".
  *Verdict:* **cited**.
  *Needed spec work:* Maturity period value is a placeholder (launch freeze); whether maturity scales with bond/length is an open review question — rule stays parameterized on maturityBlocks.
  *Proposed tests:*
    - (+) Bond spent at or after maturity height: name remains owned by the owner key (no release transition).
    - (−) One block before maturity the same spend releases the name — pinning the boundary.
    - (+) Pre-maturity transfer then maturity at the original height: the clock did not reset for the buyer.
  *Attack flag:* maturity boundary inclusivity (at maturity height vs strictly after) is unstated — same class of off-by-one as B2

- **B21.** A name at or below the short-name length threshold (currently 4 characters) MUST NOT be acquirable through the batched claim path: its only award path is the mandatory bond-first auction with the length-scaled opening floor, and a batched claim on such a name MUST NOT finalize.
  *Sources:* `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Contested Auction [candidate] — "The ≤4-char length-scaled opening bonds are the *mandatory* bond-first case of this same mechanism."; `docs/GLOSSARY.md` bond-first [candidate] — "mandatory (with length-scaled opening bonds) for names of 4 characters or fewer"; `docs/core/STATUS.md` Key numbers [candidate, working baseline] — "≤4 chars, **mandatory bond-first** — no cheap-claim path".
  *Verdict:* **cited**.
  *Needed spec work:* The threshold (4) and curve are 'working baseline', not frozen — parameterize; and the enforcement point is unspecified: the spec never says whether a batched short-name claim is refused at merge, never opens a window, or is refused at finalization. The hardening PR must pick one (refuse-at-merge is the clean fail-closed shape).
  *Proposed tests:*
    - (−) Batched claim on a 4-char name: no notice window opens and no finalization occurs at any height.
    - (−) A colliding batched claim on a short name also cannot nullify-grief a concurrent bond-first auction for it.
    - (+) Bond-first opening bid at the short-name floor acquires the name through settlement (B12/B17 path).
  *Attack flag:* if enforcement is finalization-time only, a short-name batched claim could sit 'provisional' and mislead users/wallets for the whole window — surfaces would display ownership the kernel can never grant

- **B22.** Window lengths consumed by batched-path transitions MUST come from a frozen, monotonic, height-keyed schedule of the claim's anchor height; any adaptive behavior MUST be extend-only, and no market-derived system characteristic may shrink a window.
  *Sources:* `docs/spec/AUCTION.md` Decay Rule [candidate] — "Use a frozen, monotonic, height-keyed schedule. Do not let market-derived system characteristics shrink windows."; `docs/spec/AUCTION.md` Decay Rule [candidate] — "If adaptive behavior exists at all, it should be **extend-only**".
  *Verdict:* **cited**.
  *Needed spec work:* The concrete schedule (90d → 7d over ~18 months) is a recommendation, not frozen — the schedule function freezes at launch; the rule's shape (pure function of anchor height, extend-only max) is final now.
  *Proposed tests:*
    - (+) window(claim) = max(heightKeyedFloor(anchorHeight), adaptiveExtension(...)) — property: output never below the height-keyed floor.
    - (−) Injecting any state-derived signal (claim volume, bond totals, distinct keys) that would shorten a window is rejected by construction: the window function's only inputs are anchor height and frozen constants.
    - (−) Monotonicity: for anchor heights h1 < h2 the scheduled floor never increases out of phase order (frozen decay only).
  *Attack flag:* this is the kernel-purity rule that keeps the window predicate I/O-free — any implementation reading 'market maturity' is the exact adversary-distortable input the spec names unsafe

- **B23.** When both an L1 auction-settled record and a batched-path record exist for one name, the L1 record MUST take precedence — the batched claim path can never override a name settled on L1.
  *Sources:* `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` One Path [candidate — implies but does not state precedence] — "These are not two product lanes; they are two outcomes of the same claim state machine.".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* No spec text states cross-path precedence; the rule exists only in a code comment ('the bonded core wins any collision, so the cheap rail can never override a name settled on L1'). Named spec PR to ONT_ACQUISITION_STATE_MACHINE.md must either (a) state L1 precedence as a defensive invariant, or (b) prove the dual-record state unreachable under B3-B7 and state that instead — silently keeping a code-only tiebreak inside the audited kernel is exactly the leakage the hardening hunts.
  *Legacy evidence (never authority):* `packages/core/src/indexer.ts:541-563`.
  *Proposed tests:*
    - (−) Construct (or prove unconstructible) a history where a batched claim finalizes for a name with a live auction-settled record: resolution must yield the L1 owner.
    - (+) Reachability analysis as executable property: under correct B6 escalation, a name with a qualifying bond never also reaches batched finality.
  *Attack flag:* if the dual-record state is reachable at all, the transition rules have a hole upstream — precedence would be masking a consensus bug rather than deciding a legitimate tie

- **B24.** After nullification the name MUST resolve to no owner and MUST reopen for claiming: a fresh eligible claim on a nullified name opens a fresh notice window and may finalize, contested-escalate, or nullify again exactly as on a never-claimed name.
  *Sources:* `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Public Notice [candidate] — "it resolves to *no owner* and reopens for claiming"; `docs/GLOSSARY.md` nullified [candidate] — "the name resolves to **no owner** and reopens for claiming".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/core/src/indexer.ts:825-841 (DIVERGES: legacy refuses a new distinct-owner claim on a nullified name via the post-final takeover branch — old code never implements reopen; evidence of the missing transition, never authority)`.
  *Proposed tests:*
    - (−) A nullified name never resolves to any owner at any later height (the nullified record cannot leak an owner key).
    - (+) New claim anchored after nullification opens a fresh window and finalizes clean — the documenting test that fixes the legacy divergence.
    - (−) The original colliding claimants get no priority on reopen: their nullified claims are spent; only a new anchored claim counts.
  *Attack flag:* reopen semantics are one line of spec text: whether the nullified claimants may re-claim instantly (grief loop: collide → reopen → collide), and whether any cooldown applies, is unstated — AUCTION.md's reauction cooldown question covers bond breaks, not nullification

**Gaps — Batched-path transitions duties with no spec text at all:**

- Window-close boundary semantics: no spec text pins whether an event mined exactly at anchorHeight + W_notice (or exactly at the maturity/auction-close height) is inside or outside the window — DECISIONS #37 gives the verifier check as ≥ but never the event-side comparison; every deadline rule (B2, B6, B13, B15, B20) inherits the off-by-one.
- Reorg behavior for batched-path state: no spec text defines what happens to provisional/final/nullified/settled status when the anchor, bond, or winning-bid block is reorged out, nor the confirmation depth at which finality and settlement verdicts are evaluated (DA §6a's K-deep rule covers root eligibility only). SOFTWARE_CANON's B2 gate demands reorg-invariance property tests 'where the spec claims it' — currently the spec claims it nowhere for the notice window or settlement.
- Intra-block ordering: no spec text defines tie-breaks when multiple batched-path events for one name land in one block (two anchors extending the root chain, a bond and the close in the same block, two opening bids in one block); legacy walks 'in transaction order' (indexer.ts:748-753) as a code-only convention. #37 removed ordering-based AWARD, but ordering still determines chain extension and soft-close extension heights.
- Escalation binding: no spec text links a contested cheap claim's notice window to the resulting auction's timing fields — what unlockBlock/lot identity an escalated-from-claim auction carries (LAUNCH.md specifies opening-{name}/reopen-{name} lots only), and whether the auction window starts at the bond height or the notice-window close.
- Loser-bond release: 'loser bonds become releasable after settlement' exists only in LAUNCH.md narrative and legacy outcome enums (replaced_by_self_rebid, releasable); no spec/ text states when an outbid bond unlocks or what a premature loser-bond spend means for the transcript.
- Batch-level state machine: SOFTWARE_CANON names 'batched-path state transitions (merge, first-anchor-wins)' as kernel scope, but no spec doc enumerates the batch's own states (observed → eligible → applied | excluded) or says a batch exclusion is terminal per anchor — only the per-name consequences are written (DA §5/§6c).
- Pre-settlement bond-spend rule: legacy refuses to materialize a winner whose bond was spent before allowed release (indexer.ts:1107-1109), and the definition of a 'valid successor bond' (minimum value, script form, vout binding) for B18 continuity exists in no spec text.
- Nullification reopen mechanics beyond one sentence: cooldowns, re-claim rights of the colliding parties, and whether nullification is per-claim-generation or per-name state are unspecified (AUCTION.md's cooldown questions cover bond-break reauctions only).


Tranche 2 — the critic-commissioned areas:

### Value-record authority (V*)

- **V1.** The kernel's value-record acceptance verdict MUST be a deterministic pure predicate over exactly (the candidate record envelope, the name's current ownership interval, and the current record-chain head for that interval); it MUST NOT read wall-clock time, network, storage, or any other input.
  *Sources:* `docs/core/SOFTWARE_CANON.md` Layer vocabulary — L2 ownership kernel (ratified) — "every rule that decides name state, as pure deterministic predicates — ordered, witnessed inputs in; name state out … No DB, no network, no clock, no UI"; `docs/core/SOFTWARE_CANON.md` Item 5 — B2 ownership kernel (ratified) — "bond maturity/continuity, transfer/recovery/value-record authority".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `apps/resolver/src/validation.ts:74-126`.
  *Proposed tests:*
    - (+) Property test: identical (record, interval, head) inputs produce identical verdicts across repeated evaluation and across implementations.
    - (−) A record whose issuedAt is far in the future or past relative to the host clock is judged identically at any evaluation time — verdict does not vary with system time (purity probe).
    - (−) Boundary-manifest-style import test: the value-record predicate module has zero I/O/clock imports.
  *Attack flag:* issuedAt is the only time-shaped field in the envelope; any implementation comparing it to 'now' breaks purity and yields observer-dependent verdicts — must be explicitly tested against.

- **V2.** A value record MUST be rejected unless its ownerPubkey equals the current owner key of the name's current ownership interval in prior state.
  *Sources:* `docs/core/DECISIONS.md` Decision #17 — Off-chain destination authentication (decision log) — "Off-chain destinations are authenticated by signatures from the current owner key."; `docs/ONT.md` Ownership on Bitcoin, records off it (plain-language tiebreak) — "Records — what a name points to — are signed off-chain by the current owner key"; `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Bonded Ownership (candidate) — "the owner key controls value records and transfer authorization".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `apps/resolver/src/validation.ts:87-92`.
  *Proposed tests:*
    - (+) Record signed by, and naming, the current interval's owner key is accepted (all other predicate inputs valid).
    - (−) Record with a correctly self-consistent signature but ownerPubkey ≠ current owner key is rejected (legacy owner_mismatch path).
    - (−) Record signed by the previous owner's key immediately after a transfer confirms is rejected.
  *Attack flag:* 'Current owner key' is undefined mid-recovery (during an open challengeWindowBlocks window) until recovery-auth is ruled — an attacker could race records in that window; the R* area owns the state definition, this predicate consumes it.
  *Attack flag:* A provisional (notice-window-open) claimant publishing records to appear owned: whether an interval exists pre-finality is unspecified (see gaps).

- **V3.** A value record MUST be rejected unless signature is a valid 64-byte BIP340 Schnorr signature by ownerPubkey over the WIRE_FORMAT §8.1 digest of the record's own fields; a signature produced under any other domain label or context MUST NOT validate a value record.
  *Sources:* `docs/spec/WIRE_FORMAT.md` §8.1 Value record (normative) — "Digest: sha256( lenPrefix("ont-value-record") ‖ version(1) ‖ lenPrefix(name) ‖ ownerPubkey(32) ‖ ownershipRef(32) ‖ sequence(u64) ‖ nullFlag(previousRecordHash(32)) ‖ valueType(1) ‖ u16(payloadByteLen) ‖ payloadBytes ‖ lenPrefix(issuedAt) )"; `docs/spec/WIRE_FORMAT.md` §5 Keys and owner-key Schnorr digests (normative) — "A signature valid in one context MUST NOT verify in any other"; `docs/core/DECISIONS.md` Decision #17 — Off-chain destination authentication (decision log) — "authenticated by signatures from the current owner key".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/protocol/src/value-record.ts:90-112`.
  *Proposed tests:*
    - (+) Golden vector: record signed over the §8.1 digest verifies and is accepted.
    - (−) Bit-flipped signature, or signature over a digest with any single field altered (name, ownershipRef, sequence, payload byte), is rejected.
    - (−) Cross-context: a valid ont-recovery-descriptor signature over the structurally identical field prefix (same name/ownerPubkey/ownershipRef/sequence/nullFlag-prev) does not verify as a value record — only the domain label differs.
  *Attack flag:* The §8.1 and §8.2 digests share an identical structural prefix (version ‖ name ‖ ownerPubkey ‖ ownershipRef ‖ sequence ‖ nullFlag(prev)); domain separation by label is the only thing preventing cross-object signature replay — the cross-context negative vector is load-bearing.

- **V4.** A value record MUST be rejected unless its ownershipRef equals the current ownership interval reference for the name; a record bearing a prior interval's reference MUST be rejected even when its ownerPubkey equals the current owner key (same-key reacquisition).
  *Sources:* `docs/core/DECISIONS.md` Decision #17 — Off-chain destination authentication (decision log) — "Destination records form a signed append-only chain scoped to the current ownership interval."; `docs/core/DECISIONS.md` Decision #17 — Rationale (decision log) — "Binding the destination chain to an ownership interval prevents a stale record from an earlier ownership period from becoming current again if the same key later reacquires the same name."; `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Value Records (candidate) — "Value records are sequence-numbered and predecessor-linked within an ownership interval, so a client can verify record order and reject stale records from prior owners.".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `apps/resolver/src/validation.ts:94-101`.
  *Proposed tests:*
    - (+) Record whose ownershipRef equals the current interval reference is accepted.
    - (−) Record carrying the previous interval's reference after a transfer is rejected (ownership_ref_mismatch).
    - (−) Reacquisition replay: owner key K owns name in interval 1, loses it, reacquires in interval 2 — a validly signed interval-1 record (same key, same name) is rejected in interval 2.
    - (−) Cross-name replay within one batch: two names finalized by the same anchor share the same interval-reference bytes — a record for name A replayed against name B is rejected (digest binds name).
  *Attack flag:* Batched-rail names finalized by one anchor share the same ownershipRef bytes (the anchor txid keys many names' intervals); only the digest's name field separates them — the cross-name replay negative test is required.

- **V5.** The ownership interval reference for a name MUST be defined as the 32-byte identifier of the on-chain event that opened the current ownership interval — per legacy behavior: the last L1 state txid for L1-rail names, and the txid of the accepted anchor transaction that finalized the claim for batched-rail names — and a record's ownershipRef MUST equal it byte-exactly.
  *Sources:* `docs/core/DECISIONS.md` Decision #17 — Off-chain destination authentication (decision log) — "ownership interval reference"; `docs/spec/WIRE_FORMAT.md` §8.1 Value record (normative) — "`ownershipRef`(32-hex)".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* Named spec PR defining 'ownership interval reference' precisely per rail (last L1 state txid vs finalizing accepted-anchor txid), and enumerating which events open a new interval (claim finality, transfer, settlement/winner-becomes-owner, RecoverOwner completion). DECISIONS #17 names the field; no doc defines its value — the definition exists only in legacy code.
  *Blocked on decision:* `recovery-auth`.
  *Legacy evidence (never authority):* `apps/resolver/src/validation.ts:38-66`.
  *Proposed tests:*
    - (+) L1-rail name: a record referencing the latest state txid is accepted; batched-rail name: a record referencing the finalizing anchor txid is accepted.
    - (−) Record referencing any other 32-byte value (the claim txid, an earlier state txid, a non-finalizing anchor) is rejected.
  *Attack flag:* Whether RecoverOwner opens a new interval at invocation or only at challenge-window close determines which ref is 'current' mid-recovery — cannot be pinned until recovery-auth is ruled.
  *Attack flag:* Interval references derived from txids inherit reorg risk: if the interval-opening tx reorgs out, every record bound to it dangles (Z* area, no spec text).

- **V6.** The first value record of an ownership interval MUST have sequence exactly 1 and previousRecordHash exactly null; a first record with any other sequence (including the wire-valid 0) or with a non-null previousRecordHash MUST be rejected.
  *Sources:* `docs/core/DECISIONS.md` Decision #17 — Off-chain destination authentication (decision log) — "The first record in an ownership interval should have sequence `1` and no previous record hash."; `docs/spec/WIRE_FORMAT.md` §8.1 Value record (normative) — "Chain rules (sequence exactly +1, hash links to head) are kernel/adapter material, not wire.".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `apps/resolver/src/validation.ts:102-118`.
  *Proposed tests:*
    - (+) Empty chain + record with sequence 1 and previousRecordHash null is accepted.
    - (−) Empty chain + record with sequence 0 (wire-shape-valid per the §8 sequence-bound) is rejected by the kernel.
    - (−) Empty chain + record with sequence 2, or sequence 1 with a non-null previousRecordHash, is rejected.
  *Attack flag:* Wire admits sequence 0 ('non-negative integer' per the §8 sequence-bound ruling) but the chain rule starts at 1 — the kernel must reject 0 explicitly rather than assume the wire layer filtered it.

- **V7.** A non-first value record MUST have sequence exactly equal to the current chain head's sequence plus 1; a record with sequence less than or equal to the head's (stale/duplicate) or greater than head+1 (gap) MUST be rejected.
  *Sources:* `docs/core/DECISIONS.md` Decision #17 — Off-chain destination authentication (decision log) — "Later records should increment sequence exactly by one"; `docs/spec/WIRE_FORMAT.md` §8.1 Value record (normative) — "Chain rules (sequence exactly +1, hash links to head) are kernel/adapter material, not wire.".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `apps/resolver/src/validation.ts:104-118`.
  *Proposed tests:*
    - (+) Head at sequence n + record with sequence n+1 (and correct linkage) is accepted.
    - (−) Head at sequence 3 + record with sequence 2 or 3 is rejected as stale (distinct reject from gap).
    - (−) Head at sequence 3 + record with sequence 5 is rejected as a gap — sequence cannot skip missing predecessors.
    - (−) Edge: head at the wire bound 2^53−1 — no successor can be valid (any +1 exceeds the §8 sequence-bound); chain extension fails closed.
  *Attack flag:* Gap rejection makes withheld intermediate records a liveness grief: a party hiding the true head blocks all successors at honest verifiers — kernel verdict is correct, mitigation is adapter-layer (multi-resolver), do not 'fix' it in the kernel.
  *Attack flag:* At head sequence 2^53−1 the chain freezes permanently — fail-closed but should be stated in spec text.

- **V8.** A non-first value record MUST carry previousRecordHash exactly equal to the canonical record hash of the current chain head for its ownership interval; any mismatch MUST be rejected.
  *Sources:* `docs/core/DECISIONS.md` Decision #17 — Off-chain destination authentication (decision log) — "point to the canonical hash of the previous destination-record statement"; `docs/spec/WIRE_FORMAT.md` §8.1 Value record (normative) — "Chain rules (sequence exactly +1, hash links to head) are kernel/adapter material, not wire.".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `apps/resolver/src/validation.ts:119-124`.
  *Proposed tests:*
    - (+) Record linking the recomputed hash of the actual head is accepted.
    - (−) Record with correct sequence n+1 but previousRecordHash pointing at record n−1 (or any non-head record) is rejected — sequence alone never suffices.
    - (−) Record linking a hash of a forged head (valid 32-byte hex, wrong content) is rejected; the verifier recomputes the head's hash rather than trusting a declared value (the legacy PB5 soundness lesson).
  *Attack flag:* Verifiers must recompute the head's hash from its fields, never trust a stored/declared recordHash — the legacy proof-bundle PB5 gap was exactly trusting declared hashes and skipping signatures.

- **V9.** The canonical record hash used for previousRecordHash linkage MUST be the WIRE_FORMAT §8.1 digest of the predecessor record's fields (the signed digest; the predecessor's signature bytes are excluded from the hash).
  *Sources:* `docs/core/DECISIONS.md` Decision #17 — Off-chain destination authentication (decision log) — "the canonical hash of the previous destination-record statement"; `docs/spec/WIRE_FORMAT.md` §8.1 Value record (normative) — "Digest: sha256( lenPrefix("ont-value-record") ‖ version(1) ‖ lenPrefix(name) ‖ …".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* Named spec PR (kernel spec or a WIRE_FORMAT §8.1 sentence) stating that the record hash IS the §8.1 digest and that the signature is deliberately outside the hash. DECISIONS #17 says 'canonical hash' but no doc defines the function; legacy code (computeValueRecordHash = the signing digest; proof-bundle comment 'The recordHash IS the signed digest') is the only definition.
  *Legacy evidence (never authority):* `packages/protocol/src/value-record.ts:114-116; packages/consensus/src/proof-bundle.ts:626-631`.
  *Proposed tests:*
    - (+) Golden vector: record hash of a fixture record equals its §8.1 digest; a successor linking that digest is accepted.
    - (−) Successor linking sha256(full JSON envelope) or sha256(digest ‖ signature) — plausible wrong constructions — is rejected.
    - (+) Two envelopes with identical fields but different valid BIP340 signatures (re-randomized aux) yield one identical record hash — linkage is content-addressed, signature-malleability cannot fork the chain.
  *Attack flag:* Excluding the signature from the hash means the chain pins content lineage, not signature bytes: BIP340 signing with random aux can produce many valid signatures over one digest, all hashing identically. This is the safe choice (kills signature-malleability forks) but the spec must say it is intended.

- **V10.** On an ownership-interval change by transfer, the prior interval's value-record chain MUST cease to be current and the new owner's chain MUST begin fresh (sequence 1, null previousRecordHash) under the new interval reference; the kernel MUST treat every transfer as non-preserving unless and until an explicit preserve signal is specified by a named spec change.
  *Sources:* `docs/core/DECISIONS.md` Decision #18 — Destination behavior on transfer (decision log) — "Ownership transfer does not automatically preserve the prior owner's value record."; `docs/core/DECISIONS.md` Decision #18 — Destination behavior on transfer (decision log) — "After transfer, the new owner may publish a fresh value record under their own key and sequence space."; `docs/core/DECISIONS.md` Decision #17 — Off-chain destination authentication (decision log) — "Old owner-signed destination records become stale once ownership changes on-chain.".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/consensus/src/proof-bundle.ts:620-624`.
  *Proposed tests:*
    - (+) After a transfer, the new owner's sequence-1/null-prev record under the new interval reference is accepted.
    - (−) After a transfer, the new owner submitting sequence head+1 continuing the OLD chain (old interval ref or old chain head linkage) is rejected — sequence space resets.
    - (−) A Transfer event with any unassigned flags bit set does not cause record preservation; the prior chain is still not current (fail-closed against invented preserve bits).
  *Attack flag:* Decision #18 permits 'an explicit preserve signal' but WIRE_FORMAT §4.1 assigns no Transfer flag-bit semantics — an implementation honoring an unassigned bit as 'preserve' would smuggle unsigned semantics past the spec. Fail closed: all transfers clear. (Flag-bit assignment is X* area.)

- **V11.** The kernel MUST NOT use issuedAt to order, accept, or reject value records relative to one another; chain order is established solely by sequence and previousRecordHash linkage.
  *Sources:* `docs/core/DECISIONS.md` Decision #17 — Off-chain destination authentication (decision log) — "Owner-issued timestamps are metadata, not the canonical ordering rule."; `docs/core/DECISIONS.md` Decision #17 — Rationale (decision log) — "Sequence numbers plus predecessor hashes let clients prove update order, not just inspect the latest signed value.".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/protocol/src/value-record.ts:271-277`.
  *Proposed tests:*
    - (+) A record whose issuedAt is EARLIER than its predecessor's is accepted when sequence and linkage are correct — timestamps never veto chain order.
    - (−) A record with a later issuedAt but stale sequence is rejected — recency of timestamp grants nothing.
  *Attack flag:* Owners can freely backdate or future-date issuedAt (the wire timestamp-form ruling pins shape, not truth); surfaces must not present issuedAt as verified recency — presentation is adapter/B5 concern, but a kernel that secretly compares timestamps would import this lie into consensus.

- **V12.** Acceptance or rejection of a value record MUST NOT change name ownership state; the value-record predicate is one-way dependent on ownership state and never writes it.
  *Sources:* `docs/core/DECISIONS.md` Decision #16 — Ownership versus destination placement (decision log) — "Loss of off-chain destination data does not affect on-chain ownership validity."; `docs/GLOSSARY.md` value record (candidate) — "ownership and records are separate layers — a stale record never means a lost name"; `docs/LAUNCH.md` Transfers — "Mutable value records do not transfer ownership. They only update what a name points to.".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/consensus/src/proof-bundle.ts:576-667`.
  *Proposed tests:*
    - (+) Property test: for any sequence of value-record submissions (valid and invalid), the ownership component of kernel state is byte-identical before and after.
    - (−) A name whose entire record chain is lost/absent still verifies its ownership unchanged (loss of destination data never degrades ownership).

- **V13.** A value record for a name with no current ownership interval — unclaimed, nullified, or invalidated/released ownership — MUST be rejected.
  *Sources:* `docs/core/DECISIONS.md` Decision #17 — Off-chain destination authentication (decision log) — "Destination records form a signed append-only chain scoped to the current ownership interval."; `docs/ONT.md` Ownership on Bitcoin, records off it (plain-language tiebreak) — "Records — what a name points to — are signed off-chain by the current owner key".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `apps/resolver/src/validation.ts:82-86`.
  *Proposed tests:*
    - (−) Record for a never-claimed name is rejected (no interval exists to scope a chain to).
    - (−) Record for a nullified name (bare-collision outcome, no owner) is rejected.
    - (−) Record for a name whose pre-maturity ownership was invalidated by a broken bond is rejected.
  *Attack flag:* Provisional claims: no doc states whether a notice-window-open claimant has an interval yet — an attacker-claimant could seed records pre-finality to look owned. Unspecified (see gaps); fail-closed reading is reject until final.

- **V14.** The value-record acceptance predicate MUST be identical for names acquired on the batched (accumulator) rail and on the L1 auction rail; the acquisition rail MUST NOT be an input to the verdict beyond the ownership interval reference it produced.
  *Sources:* `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Owner-Key Control (candidate) — "The owner-key model should not depend on whether the name came from an uncontested accumulator claim or a contested L1 auction.".
  *Verdict:* ~~cited~~ → **candidate-stays** (step-2 correction).
  *Step-2 correction:* Sole source is a single candidate-tier 'should' sentence about the owner-key model generally — it does not state the record-predicate rail-uniformity rule. Reasonable inference, but under source-check discipline: downgraded; neededSpecWork: rail-uniformity of the value-record predicate stated at consensus tier.
  *Legacy evidence (never authority):* `apps/resolver/src/validation.ts:56-66`.
  *Proposed tests:*
    - (+) The same record chain (same key, same fields modulo interval ref) validates identically against an interval produced by either rail.
    - (−) Property/structural test: the predicate's input type carries no rail discriminant; a hostile 'rail' field in the envelope is rejected by the closed field set (wire) and never reaches the kernel.
  *Attack flag:* The legacy resolver had separate interval constructors per rail (validation.ts:56-66) — rail-leakage into the rewrite's verdict (e.g., different rules for accumulator names) would be old-model leakage; hunt for it at the B2 gate.

- **V15.** A value record whose payload byte length exceeds the accepted-payload cap parameter ACCEPTED_PAYLOAD_CAP MUST be rejected, where ACCEPTED_PAYLOAD_CAP MUST NOT exceed the wire encodable bound of 65,535 bytes (rule stated parameterized; no value can be pinned today).
  *Sources:* `docs/spec/WIRE_FORMAT.md` §8.1 Value record (normative) — "A lower *accepted-payload* cap is launch policy (kernel/adapters), not wire."; `docs/core/STATUS.md` parameter table (candidate; placeholder) — "| Destination record max payload | **65,535 bytes** | placeholder |".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* Launch-parameter freeze must set ACCEPTED_PAYLOAD_CAP (STATUS's 65,535 is an explicit placeholder and cannot pass candidate), and a named spec PR must assign the enforcement layer — WIRE_FORMAT §8.1 says only 'kernel/adapters', leaving the boundary allocation undecided.
  *Legacy evidence (never authority):* `packages/protocol/src/value-record.ts:184-185`.
  *Proposed tests:*
    - (+) Record with payload exactly at ACCEPTED_PAYLOAD_CAP bytes is accepted (parameterized vector).
    - (−) Record with payload of ACCEPTED_PAYLOAD_CAP+1 bytes is rejected at the assigned layer; record above 65,535 never reaches the kernel (wire-unencodable, u16 prefix).
  *Attack flag:* If adapters enforce a lower cap than the kernel, a kernel-valid record becomes unstorable — the policy-vs-validity split OPEN_QUESTIONS §5.1 wants surfaced; storage griefing via max-size payloads times unbounded sequence is adapter-policy territory, not a kernel input.

**Gaps — Value-record authority duties with no spec text at all:**

- Owner equivocation / same-sequence forks: no rule selects between two validly-signed records carrying the same sequence and linkage in one interval (no tie-break, no canonical-head rule). RISKS.md §3.2 documents detection-without-adjudication and OPEN_QUESTIONS §5.2 leaves 'current head' undefined across resolvers — both analysis-tier, neither a rule. The kernel's 'value-record authority' duty has no spec text for which fork is the name's record state.
- Provisional/pre-final claims: no spec text states whether a value record may attach before a claim is final (notice window open, DA verdict pending), or the fate of a chain begun under a claim that later nullifies. Interacts with the open da-windows decision (when batched-claim finality lands), so its resolution should wait on or coordinate with that ruling.
- Interval-end paths other than transfer: Decision #18 covers transfer only. No spec text states record-chain fate when an interval ends by recovery completion, no-bond nullification, or pre-maturity bond break ('a broken bond invalidates active ownership before maturity' — ONT_ACQUISITION_STATE_MACHINE, candidate).
- Kernel value-record state shape: no spec defines the kernel's value-record output (current head per name/interval) or its transition function the way ownership transitions are specified — only per-record acceptance language exists (DECISIONS #17 plus the §8.1 deferral sentence).
- Malformed-sequence invalidation behavior: DECISIONS.md Open Questions §6 still lists 'invalidation behavior for malformed sequences' as undefined — whether a malformed or forked submission merely rejects or poisons/invalidates the existing chain has no spec text.


### Reorg re-derivation and replay determinism (Z*)

- **Z1.** Name state MUST be a deterministic function of (canonical-chain view: ordered ONT event bytes with their block heights and intra-block transaction indexes; served evidence) and nothing else: two verifiers given identical inputs MUST compute identical name state, independent of wall clock, network, byte-arrival order, or local receipt time.
  *Sources:* `docs/ONT.md` Nobody decides — allocation is neutral (plain-language tiebreak, citable per canon Item 1) — "Every participant computes who owns what by replaying Bitcoin in order, and two honest observers always get the same answer."; `docs/core/SOFTWARE_CANON.md` Layer vocabulary, L2 ownership kernel (ratified) — "every rule that decides name state, as pure deterministic predicates — ordered, witnessed inputs in; name state out ... No DB, no network, no clock, no UI".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/core/src/research/da-convergence-sim.ts:21-26`.
  *Proposed tests:*
    - (+) Property: replay the same canonical chain through two independent kernel instances and through randomized byte-arrival/delivery schedules with fixed chain order — resulting state and roots are byte-identical in every run.
    - (−) A kernel variant whose verdict consults local receipt time (the da-convergence-sim 'naive' rule) produces divergent roots across nodes with different local views — the conformance suite must demonstrate the fork and reject any implementation exhibiting it.
    - (−) Static boundary test: zero I/O imports (no clock, network, fs, db) in @ont/consensus, per the B2 gate's research-quarantine-style enforcement.
  *Attack flag:* Determinism is only relative to the servedEvidence input; DA agreement §3 admits honest verifiers cannot prove non-availability, so convergence of the servedEvidence set itself is the open B3 witness question — a spec reading where each node assembles its own evidence set quietly reintroduces the fork Z1 forbids.

- **Z2.** Any incrementally maintained, snapshotted, or checkpoint-restored state MUST equal the state produced by a full replay from the launch height over the same canonical chain; an implementation MUST NOT retain (latch) a name, verdict, or deadline derived from a chain view that the current canonical chain no longer contains.
  *Sources:* `docs/ONT.md` What ONT commits to, commitment 2 (plain-language tiebreak) — "ownership is computed by replaying Bitcoin, not by anyone's judgment."; `docs/core/SOFTWARE_CANON.md` Layer vocabulary, L2 ownership kernel (ratified) — "ordered, witnessed inputs in; name state out".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `apps/resolver/src/index.ts:254-273`.
  *Proposed tests:*
    - (+) Property: for random block sequences containing reorgs, an incremental indexer that rewinds and re-ingests equals a fresh kernel replay from launch height — state, roots, and per-name records byte-identical.
    - (−) An anchor is orphaned by a reorg below the checkpoint: any name minted by that anchor MUST disappear after rewind; a surviving (latched) name is a failure (re-expresses packages/core/src/indexer-accumulator-names.test.ts reorg case against the new API).
    - (−) Snapshot round-trip then reorg: restoring a snapshot whose tip block is no longer canonical and continuing without rewind/rebuild MUST be detectable as divergence from fresh replay.
  *Attack flag:* Replay-from-genesis has no defined starting point in citable text — launch height and the genesis empty root exist only in analysis-tier research and as the ONT_LAUNCH_HEIGHT env var in legacy adapters (see gaps).
  *Attack flag:* Year-ten replay depends on historical batch bytes still being retrievable (OPEN_QUESTIONS §1.2, unfunded archival) — equivalence is vacuous if history is unservable; fail-closed exclusion of a historically-served batch on late replay would fork late joiners against early ones.

- **Z3.** If two competing auction bids for the same name are confirmed in the same block and are otherwise tied under the auction rules, the kernel MUST award the tie to the bid appearing earlier in the block's transaction order, and MUST NOT use fee, txid, or arrival order to break such a tie.
  *Sources:* `docs/core/DECISIONS.md` Decision Log, entry 25 — Same-block auction tie-break rule (ratified decision) — "If two competing auction bids for the same name are confirmed in the same block and are otherwise tied under the auction rules, the bid appearing earlier in the block's transaction order wins.".
  *Verdict:* **cited**.
  *Proposed tests:*
    - (+) Two otherwise-tied bids in one block: the bid at the lower intra-block transaction index wins; outcome is identical across replays and arrival-order permutations.
    - (−) An implementation breaking the tie by txid lexicographic order, higher fee, or first-received MUST fail the vector where txIndex order and those orders disagree.
    - (−) Tie-break MUST NOT engage when bids are not otherwise tied: a strictly higher qualifying bid later in the same block still wins (tie-break never overrides highest-qualifying-bond).
  *Attack flag:* 'Otherwise tied under the auction rules' is undefined — tied on bidAmountSats alone, or also on bond size/unlockBlock? An implementation could widen or narrow 'tied' to steer outcomes; needs a precise tie predicate at B2 hardening.
  *Attack flag:* Miner influence is acknowledged and accepted in the decision's own rationale (a miner can order its own tied bid first); flag for the ChatLunatique reorg/timing pass rather than re-litigate.
  *Attack flag:* Evaluating the rule requires intra-block transaction order, so a proof bundle/witness must carry position evidence, not just txids — evidence-shape requirement for B3 and the T* transcript.

- **Z4.** A batch anchored at height h MUST NOT contribute to the confirmed canonical root until h is at least K blocks deep on the canonical chain; the confirmed-root sequence MUST therefore be invariant under any reorg that replaces only blocks less than K deep.
  *Sources:* `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` §6a Confirmation lag absorbs honest propagation (candidate) — "A delta anchored at height `h` is only eligible for the canonical root once `h` is K-deep.".
  *Verdict:* **cited**.
  *Blocked on decision:* `da-windows`.
  *Proposed tests:*
    - (−) An anchor at depth K−1 contributes nothing to the confirmed root; a kernel that includes it fails.
    - (+) The same anchor at depth K enters the confirmed root deterministically.
    - (+) Property (reorg invariance): for random chains, any reorg replacing only blocks shallower than K leaves the entire confirmed-root sequence unchanged.
  *Attack flag:* The spec defines eligibility for the confirmed root but never defines the tip-side provisional view's reorg behavior or forbids acting on sub-K state — a surface that presents provisional state as final games the boundary without violating the letter.
  *Attack flag:* K is unpinned (da-windows); a small K re-exposes the §3 boundary divergence the lag exists to absorb — parameter choice is consensus-critical, not tuning.

- **Z5.** Every availability and notice deadline MUST be computed as the anchor's mined height on the current canonical chain plus a frozen constant (servable by h+W; challenge close / includable at h+W+C; notice at h+W_notice), MUST be recomputed from the anchor's new mined height whenever a reorg changes the block containing the anchor, and MUST NOT be keyed to wall-clock time, first-seen time, or any node-local receipt fact.
  *Sources:* `docs/core/DECISIONS.md` Decision Log, entry 47 — marker-fold (ratified decision) — "All deadline windows key off the anchor's mined height — a fact Bitcoin witnesses."; `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` §6b Key the timing decision off the anchor (candidate) — "The clock starts at the anchor's mined height — a fact Bitcoin witnesses, identical for everyone.".
  *Verdict:* **cited**.
  *Blocked on decision:* `da-windows`.
  *Legacy evidence (never authority):* `packages/core/src/research/da-convergence-sim.ts:91-96`.
  *Proposed tests:*
    - (+) Nodes with deliberately different local receipt times over one canonical chain produce identical deadline verdicts (productionizes the da-convergence-sim 'proposed' convergence property).
    - (−) A deadline keyed to local receipt or wall-clock time forks nodes straddling the boundary — the suite must exhibit the fork and reject the implementation.
    - (+) Property: a reorg that moves the anchor from height h to h' shifts every derived deadline to exactly h'+constant; no deadline retains the old h.
  *Attack flag:* Reorg-to-extend: a publisher (or allied miner) who gets its own anchor orphaned and re-mined later receives a fresh, later clock — interacting with holdsPriority on contested names this is a withhold-then-reveal variant the marker-fold text does not address; needs an explicit rule (e.g., priority keyed to the earliest mined instance vs the current one) in the da-windows spec PR.
  *Attack flag:* Spec is silent on whether served evidence collected against the old h remains valid after the anchor re-mines at h' (see gaps; B3 witness format).

- **Z6.** The root derived from a set of DA-valid, non-conflicting (disjoint-leaf) batch insertions MUST be invariant under permutation of batch application order: the root is a function of the leaf set, not of order or arrival time.
  *Sources:* `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` §5 The key decomposition (candidate) — "Disjoint insertions **commute** ... the root is a function of the *set* of leaves, not the order or arrival time."; `docs/core/SOFTWARE_CANON.md` Item 5, B2 gate (ratified) — "property tests over event orderings (reorg/permutation invariance where the spec claims it)".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/core/src/research/delta-merge-sim.ts:318-321`.
  *Proposed tests:*
    - (+) Property: random sets of disjoint batches applied in every (sampled) permutation yield one identical root.
    - (−) Batches that conflict on a name are NOT order-free: a kernel that resolves the conflict by application order (last-write or first-applied) instead of commit priority (Z7) must fail the vector where application order and commit priority disagree.
  *Attack flag:* The invariance claim is scoped to disjoint insertions only; quoting it unscoped would 'prove' order-independence exactly where order decides ownership (same-name conflicts) — tests must pin the scope.

- **Z7.** When the same name is inserted by multiple anchored batches, the kernel MUST resolve the conflict by one deterministic total order over claim commits — ascending (anchor mined height, intra-block transaction index, txid) — so that outside a live window the earliest Bitcoin-anchored claim holds and replay order never depends on arrival.
  *Sources:* `docs/GLOSSARY.md` first-anchor-wins (glossary; in the canon Item 1 implement list) — "when the same name is claimed on different batches outside a live window, the earliest Bitcoin-anchored claim holds."; `docs/spec/ONT_PUBLISHER_PROTOCOL_SPEC.md` Why this is small (candidate; passing mention, not a rule section) — "the resolver/indexer applies the deterministic rule (Bitcoin commit priority, txid tiebreak)".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* Named spec PR pinning the commit-priority total order — the height-level rule (first-anchor-wins) is glossary-grounded, but the sub-height tuple (txIndex then txid) exists only in research-sim code and analysis docs, and the two doc mentions disagree: ONT_PUBLISHER_PROTOCOL_SPEC.md says 'txid tiebreak' (omitting txIndex) while RISKS.md says '(height, tx-index)'. Define the tuple once in ONT_ACQUISITION_STATE_MACHINE.md's merge section and reconcile both texts.
  *Legacy evidence (never authority):* `packages/core/src/research/delta-merge-sim.ts:238-246`.
  *Proposed tests:*
    - (+) Same name in two batches at different heights, outside any live window: the earlier anchor height wins regardless of application or arrival order.
    - (+) Same block: the commit at the lower intra-block transaction index wins; txid breaks the (theoretical) same-index tie deterministically.
    - (−) An implementation using txid order where txIndex order disagrees (the publisher-spec literal reading) must fail the disagreement vector.
    - (−) Within a live window, commit priority MUST NOT award the contested name — it may only order the merge; the collision still nullifies (no-award negative test, guards the GLOSSARY scope sentence 'Ordering inside a window never awards a contested name').
  *Attack flag:* Same-block tie gaming by fee/miner ordering is real but valueless for acquisition per RISKS ('only a delta-determinism floor') — yet that bound itself rests on the bond-opens rule; if bond-opens ever weakens, this tie-break silently becomes an award rule.
  *Attack flag:* A 'live window' boundary case: two claims whose windows do not overlap by one block — whether first-anchor-wins or the collision/nullify path applies at the exact boundary height is unstated.

- **Z8.** A batch's membership/insertion proofs MUST be validated against the confirmed root R_{h−K} (the confirmed canonical root K blocks before the batch's anchor height), not against the tip root or any sub-K root.
  *Sources:* `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` §6a Confirmation lag absorbs honest propagation (candidate) — "Deltas already prove against the **confirmed root `R_{h−K}`** (K blocks back), not the tip.".
  *Verdict:* **cited**.
  *Blocked on decision:* `da-windows`.
  *Proposed tests:*
    - (+) A delta proven against R_{h−K} validates and merges.
    - (−) A delta proven against the tip root, or against a root anchored inside the last K blocks, is rejected.
    - (+) Property: because the proof base is ≥K deep, no reorg shallower than K can invalidate an accepted delta's proof base (proof-base stability test).
  *Attack flag:* WIRE_FORMAT §4.4 RootAnchor carries prevRoot(32) but no citable text states the required relation between prevRoot and R_{h−K} (must they be equal? how do multiple anchors inside one K window chain?) — a publisher could point prevRoot at a stale or sibling root; the anchor-acceptance rule (A*) must close this.

- **Z9.** A claim's notice-window outcome (final / nullified / escalated) MUST be derived, at evaluation height ≥ anchorHeight + W_notice, purely from the set of DA-valid claims and qualifying bonds on the current canonical chain within the window — never latched from an observation made on a superseded chain view; a reorg that changes that set MUST change the derived outcome identically for all verifiers.
  *Sources:* `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Contested Auction — Bond opens the auction; a bare collision can only nullify (candidate) — "Both outcomes are deadline-derived (a verifier observes, at `currentHeight ≥ anchorHeight + W_notice`, whether a qualifying bond landed).".
  *Verdict:* **cited**.
  *Blocked on decision:* `da-windows`.
  *Proposed tests:*
    - (+) Property: replaying chains where a bond or second claim is added/removed by reorg inside the window, every verifier derives the same outcome from the final canonical chain; outcome equals fresh-replay outcome (ties into Z2).
    - (−) A node that latched 'final' at window expiry and ignores a reorged-in qualifying bond (still inside the window on the new chain) diverges from fresh replay and must fail.
    - (−) A bond mined strictly after anchorHeight + W_notice MUST NOT convert a final name to contested (deadline is exclusive of late bonds).
  *Attack flag:* Window-expiry boundary vs reorg: a bond in the window's last block can reorg out, flipping contested→final; nothing in citable text ties W_notice expiry to the K-depth stability boundary (the da-windows W/C/K design is named in DECISIONS.md Open Questions 6 as the open reorg-handling answer) — until ruled, 'final' has no stated stabilization depth.
  *Attack flag:* Whether the qualifying-bond test reads the bond's own mined height on the current chain (re-derived) or its first-seen height is unstated — same reorg-to-extend family as Z5.

- **Z10.** An auction's close height MUST be a deterministic function of the bid transactions confirmed on the canonical chain — base window plus soft-close extensions computed from confirmed bid block heights (a bid inside the final soft-close window of S blocks moves close to bidBlock + S) — and mempool or unconfirmed events MUST NOT affect the close or the outcome.
  *Sources:* `docs/spec/AUCTION.md` Auction Timing (candidate; values placeholder per STATUS.md) — "Bid inside the final `144` blocks moves close to bid block + `144`"; `docs/spec/AUCTION.md` Window Schedule Bottom Line (candidate) — "Reduce windows by passage of block height only.".
  *Verdict:* **cited**.
  *Needed spec work:* Parameter values (base window 1,008; soft-close 144; launch-era schedule) are STATUS.md placeholders — launch-freeze work; the rule is stated parameterized on (baseWindow, softClose).
  *Proposed tests:*
    - (+) A confirmed bid at height b inside the final S blocks moves the close to b + S; chained late bids extend repeatedly (no hard cap), all derived from confirmed heights only.
    - (−) An unconfirmed/mempool bid MUST NOT extend the close or alter the winner; an implementation reading mempool state fails the purity battery.
    - (+) Property: close height and winner are invariant under bid arrival-order permutation and depend only on the confirmed (height, txIndex) bid set.
  *Attack flag:* Reorg edge at the close: a reorged-out late bid retracts its extension, moving the close height backward and potentially flipping the winner retroactively ('a bid or close appears final, then disappears' — acknowledged only in analysis-tier RISKS.md); no citable text states the depth at which a close/settlement verdict is reorg-stable — same open W/C/K family as Z9.
  *Attack flag:* Unbounded extension (no hard cap) means close height is unboundedly sensitive to single late bids; grief accepted by the spec's philosophy, but each extension is a fresh reorg-sensitive boundary.

- **Z11.** Per-claim window lengths MUST be computed from a frozen, monotonic, height-keyed schedule of the claim's anchor height — window(claim) = max(height_keyed_floor(anchor_height), adaptive_extension(...)) — any adaptive behavior MUST be extend-only, and market-derived system characteristics MUST NOT shorten any window.
  *Sources:* `docs/spec/AUCTION.md` Decay Rule (candidate) — "Use a frozen, monotonic, height-keyed schedule. Do not let market-derived system characteristics shrink windows."; `docs/spec/AUCTION.md` Decay Rule (candidate) — "window(claim) = max(height_keyed_floor(anchor_height), adaptive_extension(...))".
  *Verdict:* **cited**.
  *Needed spec work:* Schedule values (90d→7d phases) are recommendations / STATUS placeholders — launch-freeze work; additionally adaptive_extension's permitted inputs must be specified as deterministic chain facts before the kernel can host it at all (see attack flags).
  *Proposed tests:*
    - (+) Claims anchored at heights across each phase boundary get exactly the phase's window; the mapping is a pure function of anchor height and identical on every replay.
    - (−) Any computed window shorter than height_keyed_floor(anchor_height) — e.g., driven by claim volume, bonded value, or bidder count — is rejected (shrink is forbidden in every state).
    - (+) Property: monotonicity — for anchor heights h1 < h2 the scheduled floor never increases out of order with the frozen schedule (no oscillation).
  *Attack flag:* adaptive_extension(...) has no defined input set: if it consumes anything other than canonical-chain facts it violates kernel purity (canon: no clock, no network) and breaks Z1; if it consumes manipulable chain-visible signals, an adversary can extend windows to lock competitors' capital — extend-only bounds the damage direction but not the grief.
  *Attack flag:* The spec's own unsafe-shrink list (bonded value, bidder count, key count, volumes) is the attack catalogue: every listed signal is adversary-manufacturable at launch.

- **Z12.** No kernel predicate may consume wall-clock time, local timestamps, or any non-chain time source: every temporal condition in the kernel MUST be expressed and evaluated in block heights of the canonical chain, and off-chain timestamps inside signed payloads (e.g., issuedAt) MUST be treated as opaque committed bytes, never compared to a current time.
  *Sources:* `docs/core/SOFTWARE_CANON.md` Layer vocabulary, L2 ownership kernel (ratified) — "No DB, no network, no clock, no UI"; `docs/spec/AUCTION.md` Window Schedule Bottom Line (candidate) — "Reduce windows by passage of block height only."; `docs/spec/WIRE_FORMAT.md` §8 Off-chain owner-signed shapes (normative, wire-normative #48) — "Every `issuedAt` is the literal form".
  *Verdict:* **cited**.
  *Proposed tests:*
    - (−) Static test: @ont/consensus has zero clock/Date/timer/I-O imports (the canon B2 gate's research-quarantine-style enforcement).
    - (+) Property: replays executed at arbitrary real-world times and speeds produce byte-identical state (no hidden time dependence).
    - (−) A value-record or recovery rule that rejects/accepts a payload by comparing issuedAt to 'now' must fail conformance; issuedAt influences only digest bytes.
  *Attack flag:* issuedAt is normative wire content but semantically untethered: any future rule that gives it meaning (freshness, expiry) re-imports wall-clock into the audited boundary — the V* and R* extractors must keep ordering on sequence/predecessor links, with issuedAt as display metadata only.

- **Z13.** The frozen DA window parameters MUST satisfy the structural constraint W ≤ K (availability deadline inside the confirmation lag), and the kernel MUST treat K, W, and C as frozen consensus constants, not runtime inputs; the strictly stronger K ≥ W + C invariant currently enforced by the prototype MUST be either ratified into the rule text or rejected by the da-windows decision.
  *Sources:* `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` §6a Confirmation lag absorbs honest propagation (candidate) — "Set the availability window `W ≤ K`."; `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` §11 Prototype (candidate file, prototype-description section) — "The `K ≥ W + C` window invariant is enforced.".
  *Verdict:* **cited (restated)** — see step-2 correction below.
  *Step-2 correction:* Superseded by da-windows (#49, provisional pending DK, MERGED): DA agreement §6e S6 pins the strong form K ≥ W + C (the weaker W ≤ K is 'implied by, and superseded by, the strong form'), and S5 makes (K, W, C) per-network consensus parameters passed to the kernel as inputs — no frozen constants. Rule restated per §6e; its closing condition is resolved. Step-3 carry: Z4/Z5/Z8 gain §6e citations in the same spec PR.
  *Needed spec work:* K/W/C values are unset (STATUS placeholders; DESIGN calls them 'Unpinned — reorg-safety + data-availability deadlines'); the K ≥ W + C form lives only in the §11 prototype narrative and must be promoted into §6 rule text (or explicitly weakened to W ≤ K) by the da-windows named spec PR before freeze.
  *Blocked on decision:* `da-windows`.
  *Legacy evidence (never authority):* `packages/core/src/research/da-convergence-sim.ts:85-86`.
  *Proposed tests:*
    - (−) Kernel construction with W > K (or, if ratified, K < W + C) is rejected at parameter-validation time — frozen-constant constraint test (mirrors the sim's constructor guard).
    - (+) Property with conforming parameters: every includable/holdsPriority deadline (h+W, h+W+C) resolves at or before the anchor becomes K-deep, so confirmed-root inclusion never precedes the DA verdict.
  *Attack flag:* If only W ≤ K is ratified (without K ≥ W + C), the challenge window C can extend past K-depth: a batch becomes confirmed-root-eligible while its fail-closed challenge is still open — the verdict and the confirmation boundary cross, exactly the ordering bug the prototype's stronger invariant prevents.

**Gaps — Reorg re-derivation and replay determinism duties with no spec text at all:**

- Reorg handling is OPEN by name: DECISIONS.md Open Questions item 6 still lists 'reorg handling' under 'Need to define', deferring it to 'the W/C/K window design (see #39 and STATUS.md's DA Known-incomplete entry)'. No spec text defines kernel behavior under a reorg deeper than K, or whether any ownership verdict ever becomes permanently irreversible; 're-run the rule from the reorg point' exists only in analysis-tier research (docs/research/BITCOIN_ANCHORED_NAME_ACCUMULATOR.md:265).
- No spec text ties the non-DA clocks — notice window expiry, auction close, settlementLockBlocks/unlockBlock, bond maturity — to the K-depth reorg-stability boundary: at what depth a final/nullified/auction-settled verdict stops being reorg-mutable is nowhere stated (Z9/Z10 attack flags are the precise holes).
- Same-block cross-event ordering has no spec text outside Decision #25's tied-auction-bids case: e.g., a Transfer and a RecoverOwner for the same name in one block; a qualifying bond and the claim's window-expiry in the same block; an anchor and a bond on the same name in one block. The kernel needs a total intra-block evaluation order over all five event types.
- Served-evidence validity across a reorg that changes the anchor's mined height (h → h'): no text says whether evidence of servability-by-old-h+W carries over, must be re-witnessed, or whether priority keys to the earliest mined instance — the reorg-to-extend / late-reveal-via-re-mining hole (blocked on da-windows; witness format is B3).
- Duplicate / re-mined event handling at replay is undefined: the same event bytes (or same-name claim commit) mined twice after a reorg re-broadcast — DECISIONS.md Open Questions 6 still lists 'duplicate bid handling' and 'invalidation behavior for malformed sequences' as needing definition (transcript-side duplicate-stuffing is T*, but the replay-side rule is missing).
- Replay starting point is unpinned in citable text: launch height and the genesis state (empty-tree root R₀ 'at the announced height') appear only in analysis-tier research and as the ONT_LAUNCH_HEIGHT env var in legacy adapters (apps/resolver/src/index.ts:262); no spec/STATUS entry defines where replay-from-genesis begins — launch-freeze spec work.
- No spec text defines the provisional (sub-K, tip-side) state view at all: what a verifier may assert between anchor inclusion and K-depth, and how that view must behave under reorg, is entirely unwritten (only product-tier state labels in AUCTION.md's Provisional Utility table).


### Settlement consequences (bond release) (S*)

- **S1.** When a contested auction reaches settlement, the kernel MUST bind the name's live bond anchor to the winning bid's bond outpoint (the winning bid transaction's output at its declared bondVout) and the name's required bond amount to the winning bid amount; the kernel MUST NOT record any other outpoint or amount as the name's bond state.
  *Sources:* `docs/LAUNCH.md` Auction Settlement Becomes Ownership [tier: unclassified — no ledger row, see crossAreaNotes] — "the winning bid bond outpoint becomes the live bond anchor for the name"; `docs/LAUNCH.md` Auction Settlement Becomes Ownership — "the winning bid amount becomes the name's required bond amount"; `docs/spec/CONTESTED_AUCTION_REFERENCE.md` Settlement [candidate] — "the winning bond becomes the name's live bond"; `docs/core/DECISIONS.md` 42. Auction settlement moves inside the frozen core (resolves A3) [ratified decision] — "move auction settlement into the frozen boundary".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/core/src/indexer.ts:1124-1133`.
  *Proposed tests:*
    - (+) Replay a settled auction transcript; assert name state binds currentBond exactly to (winnerBidTxid, bondVout) and requiredBondSats exactly to the winning bid amount.
    - (−) A state vector binding the live bond to any other outpoint (e.g. a loser's bond, or a different vout of the winning tx) or a different amount fails the settlement conformance check.
  *Attack flag:* LAUNCH self-describes this section as 'the implementation direction, not a forever-frozen protocol commitment' — hedged text must be promoted or replaced before this rule can harden.
  *Attack flag:* requiredBondSats = winning bid amount means successor bonds (S13) must match the full auction-clearing price forever until maturity; spec never states whether that is intended for very high clearing prices.

- **S2.** A name created by settlement MUST enter the immature (bond-maturity) state at settlement and MUST remain immature until its maturity height; immaturity, maturity, and release MUST be derived exclusively from block heights and event bytes, never from wall-clock time or any service's say-so.
  *Sources:* `docs/LAUNCH.md` Auction Settlement Becomes Ownership [unclassified] — "the name enters bond maturity until the maturity block"; `docs/GLOSSARY.md` maturity [candidate] — "After maturity the bond releases."; `docs/LAUNCH.md` Normative Scope — "bond continuity, maturity, and release rules for auction-settled names".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/core/src/indexer.ts:1111-1129`.
  *Proposed tests:*
    - (+) Settled name at heights below maturity height reports immature/bonded status as a pure function of (state, height).
    - (−) No kernel API accepts a timestamp or external maturity attestation; property test that maturity status is invariant under everything except block height and prior state.
  *Attack flag:* GLOSSARY 'maturity' is defined as a period 'after an auction' while the settlement-lock clock in legacy code starts at the winning bid's mined height — the two readings diverge whenever the auction extends after the winning bid (see S3).

- **S3.** A settled name's maturity height MUST equal a single spec-named anchor height plus the maturity duration (legacy behavior: winning bid's mined height + settlementLockBlocks), computed identically by every verifier; the spec MUST name the anchor point (winning-bid height vs settlement height) before this rule can finalize.
  *Sources:* `docs/GLOSSARY.md` settlement lock [candidate] — "how long a winning bond stays locked after settlement"; `docs/spec/WIRE_FORMAT.md` 4.3 AuctionBid [normative] — "`settlementLockBlocks`(u32)".
  *Verdict:* **cited (restated)** — see step-2 correction below.
  *Step-2 correction:* Critic is right that decision-log text exists and the extractor missed it — but DECISIONS #9 (maturity starts at settlement) and #12 (maturity clock starts at commit block height) themselves diverge, and both diverge from legacy winning-bid-height + settlementLockBlocks under soft-close. Restated: the rule cites #9/#12 and routes the three-way reconciliation through the named spec PR (GLOSSARY 'settlement lock' sides with #9).
  *Needed spec work:* Named spec PR to AUCTION.md settlement section defining the maturity-height formula and its anchor: GLOSSARY says the lock runs 'after settlement' but legacy code computes winnerBondReleaseBlock = winning bid blockHeight + settlementLockBlocks. One must be ratified; the other retired.
  *Legacy evidence (never authority):* `packages/core/src/experimental-auction.ts:650-653`.
  *Proposed tests:*
    - (+) Golden vector: settled auction yields maturityHeight = specAnchorHeight + MATURITY_BLOCKS, byte-identical across implementations.
    - (−) A transcript where bid height and settlement height differ (soft-close extensions) must produce exactly one maturity height; a verifier using the unratified anchor fails the vector.
  *Attack flag:* If the clock anchors to the winning-bid height (legacy), a winner who bids early in a long soft-close-extended auction has already burned down part of the lock at settlement — extending the auction shrinks the real post-settlement commitment, gaming the maturity guarantee.

- **S4.** The maturity duration MUST be one fixed protocol parameter (MATURITY_BLOCKS, placeholder 52,560 blocks) applied uniformly to every settled name; the kernel MUST NOT apply an epoch-halving or any other variable maturity schedule.
  *Sources:* `docs/spec/AUCTION.md` Winner Bond And Maturity [candidate] — "the protocol must choose one maturity model and remove or clearly quarantine the other"; `docs/spec/CONTESTED_AUCTION_REFERENCE.md` Settlement [candidate] — "The exact maturity duration should be a simple fixed parameter before launch"; `docs/core/STATUS.md` Launch parameters (auction + notice mechanics) [candidate, placeholder] — "fixed **52,560 blocks (~1 yr)**; epoch-halving helper is prototype residue to remove or quarantine".
  *Verdict:* ~~cited~~ → **candidate-stays** (step-2 correction).
  *Step-2 correction:* Every source hedges (AUCTION.md 'Prototype constant to resolve', DECISIONS #13 'current lead launch recommendation', STATUS 'placeholder'). A flat MUST NOT converts a documented lean into law. Downgraded; restated as the conditional #13 supports; neededSpecWork: the maturity-model freeze decides it.
  *Needed spec work:* Parameter value is a STATUS placeholder — freezing MATURITY_BLOCKS is launch-freeze work; the rule is stated parameterized.
  *Legacy evidence (never authority):* `packages/consensus/src/state.ts:27`.
  *Proposed tests:*
    - (+) All settled names across a property-test corpus get the same MATURITY_BLOCKS regardless of name length, bid size, or auction generation.
    - (−) Kernel exposes no epoch/halving maturity input; a fixture using the legacy epoch-halving helper output must mismatch and fail.
  *Attack flag:* STATUS marks the value 'placeholder / test override' — a test override path leaking into the kernel would make maturity environment-dependent; the CONSENSUS_PARAMS surface must carry the only value.

- **S5.** The kernel MUST refuse to settle ownership from a winning bid whose settlementLockBlocks field differs from the protocol maturity parameter; the per-bid wire field is a commitment to be validated, never a bidder-chosen maturity override.
  *Sources:* `docs/spec/WIRE_FORMAT.md` 4.3 AuctionBid [normative] — "`settlementLockBlocks`(u32)"; `docs/spec/CONTESTED_AUCTION_REFERENCE.md` Settlement [candidate] — "The exact maturity duration should be a simple fixed parameter before launch".
  *Verdict:* ~~candidate-stays~~ → **cited** (step-2 correction).
  *Step-2 correction:* DECISIONS #12 is real decision-log authority for exactly this rule (deterministic maturity from launch rules at commit confirmation; 'cannot be adjusted discretionarily'). Upgraded to cited per #12; only the comparator/rejection mechanics remain neededSpecWork.
  *Needed spec work:* Named spec PR to AUCTION.md: state how the bid's settlementLockBlocks reconciles with the fixed parameter (reject mismatches vs ignore the field vs retire the field at the wire). Legacy code silently ignores the bid's field and uses the policy value — neither validates, so a bid commits to one lock while state applies another.
  *Legacy evidence (never authority):* `packages/core/src/experimental-auction.ts:652`.
  *Proposed tests:*
    - (−) A winning bid carrying settlementLockBlocks = 0 (or any value != MATURITY_BLOCKS) must not settle into ownership with a shortened maturity; the settlement predicate rejects it.
    - (+) Bid with settlementLockBlocks == MATURITY_BLOCKS settles normally and maturityHeight reflects exactly that duration.
  *Attack flag:* Without this rule a bidder picks its own maturity (settlementLockBlocks=1 -> instant mature owner, gutting the year-locked-capital deterrent of bond-opens (#37)).
  *Attack flag:* The auctionStateCommitment (WIRE_FORMAT §6 field 11) also carries settlementLockBlocks — a bid can commit to an observed state whose lock differs from the bid's own field; spec must say which binds.

- **S6.** From settlement until the maturity height, the name's current bond outpoint MUST remain unspent on the canonical chain, except by a transaction the kernel validates as an ownership event (transfer/recovery) that spends that outpoint and creates a valid successor bond in the same transaction.
  *Sources:* `docs/LAUNCH.md` Bond Continuity Consequences [unclassified] — "the winner bond remains the live bond through the maturity period"; `docs/spec/AUCTION.md` Winner Bond And Maturity [candidate] — "Bond continuity before maturity | Required"; `docs/LAUNCH.md` Bonds And Maturity — "Before maturity, a transfer must move the bond by spending the current bond outpoint and creating a valid successor bond in the same transaction."; `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Bonded Ownership [candidate] — "the bond must remain continuous".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:364-396`.
  *Proposed tests:*
    - (+) Pre-maturity transfer spending the current bond outpoint and creating a valid successor in the same tx preserves ownership and updates the live bond anchor.
    - (−) Pre-maturity spend of the bond outpoint in a transaction with no valid same-tx successor invalidates the name (reject path for each missing piece: no spend of old outpoint, successor in a different tx, successor below required amount).
  *Attack flag:* Continuity is an ONT rule, not a Bitcoin timelock (GLOSSARY) — the kernel can only assign consequences to observed spends; the bond is spendable by whoever holds the funding wallet key, which is distinct from the owner key (Decision #41), so a funding-wallet compromise releases the name without any owner-key signature.

- **S7.** If the current bond outpoint of an immature auction-settled name is spent before the maturity height without a same-transaction valid successor bond, the kernel MUST invalidate active ownership: the name is released, has no owner, and reopens for acquisition.
  *Sources:* `docs/spec/AUCTION.md` Bond Breaks And Reauction [candidate] — "If bond continuity breaks early | Name is released"; `docs/GLOSSARY.md` maturity [candidate] — "Spending the bond early without a valid successor forfeits the name"; `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Bonded Ownership [candidate] — "a broken bond invalidates active ownership before maturity".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:655-689`.
  *Proposed tests:*
    - (−) Spend the live bond at maturityHeight-1 with no successor: name state becomes invalid/released; resolution returns no owner.
    - (+) Spend with a same-tx valid successor at the declared vout: continuity preserved, no release.
    - (−) Property: release fires regardless of which key signed the Bitcoin spend — no owner-signature exemption path exists.
  *Attack flag:* 'Released' vs 'forfeit': GLOSSARY says forfeits, AUCTION says released — same outcome, but hardening should pick one term (jargon law).
  *Attack flag:* Release is observable only as the absence of a valid successor in the spending tx; a tx with an ONT transfer event that fails validation but still creates a look-alike successor output must still release (legacy engine checks the output independent of event validity at engine.ts:669-678 — spec must state this).

- **S8.** The kernel MUST define a released name's release height as the block height of the canonical-chain transaction whose spend broke bond continuity, and MUST record it as the objective anchor for the name's next auction generation.
  *Sources:* `docs/LAUNCH.md` Bond Continuity Consequences [unclassified] — "if the winning bond continuity breaks before maturity, the released name can be opened again through a new auction generation anchored to the release block"; `docs/spec/AUCTION.md` Bond Breaks And Reauction [candidate] — "Reauction identity | Anchored to the release block".
  *Verdict:* **split** — see step-2 correction below; cited half stands, the named clause is candidate-stays.
  *Step-2 correction:* DECISIONS #5 (bond continuity breaks → name released; reauction 'anchored to the release block') plus AUCTION.md Bond Breaks And Reauction are cited authority for the anchoring rule. Candidate-stays narrowed to the genuinely unstated clause: the deterministic tiebreak for multiple same-height breaking observations.
  *Needed spec work:* Named spec PR defining 'release height' precisely (the breaking spend's block height) — both docs use 'the release block' without ever defining which block that is; the definition exists only in legacy code (height of the invalidating transaction).
  *Legacy evidence (never authority):* `packages/core/src/indexer.ts:1057-1071`.
  *Proposed tests:*
    - (+) Bond break at height H records release height exactly H; the next valid auction generation anchors to H.
    - (−) A reopen attempt anchored to the settlement height, the maturity height, or H±1 is not recognized as the next generation.
  *Attack flag:* Two breaking observations for the same name (e.g. a stale record and its successor both invalidated) need a deterministic 'latest' rule; legacy takes max height with no tx-level tiebreak for same-height events.

- **S9.** A reopened auction for a released name MUST be recognized only if its lot anchor (unlockBlock) equals the latest recorded bond-break release height for that name, with lot identity reopen-{name}-after-{release_height}; a first-generation auction MUST carry anchor 0 with lot identity opening-{name}; a bid whose lot commitment binds any other anchor MUST NOT open or join that name's auction.
  *Sources:* `docs/LAUNCH.md` Released-Name Reauction Path [unclassified] — "The indexer only recognizes a reopened auction if its anchor equals the latest recorded bond-break release block for that name."; `docs/LAUNCH.md` Released-Name Reauction Path — "reopened auction: `reopen-{name}-after-{release_height}`"; `docs/spec/WIRE_FORMAT.md` 6. Auction commitments [normative] — "auctionLotCommitment = sha256( lenPrefix("ont-auction-lot") ‖ lenPrefix(text(auctionId)) ‖ lenPrefix(name) ‖ lenPrefix(decimal(unlockBlock)) )".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/core/src/indexer.ts:1019-1025`.
  *Proposed tests:*
    - (+) After a recorded release at height H, a bid whose lot commitment binds unlockBlock=H opens the new generation.
    - (−) Bids anchored to a stale (earlier) release height, a fabricated future height, or unlockBlock=0 after a release must be excluded from the lot — old settled auctions and malformed reopens never collapse into the live generation.
  *Attack flag:* The doc states the rule in adapter voice ('The indexer only recognizes') — promotion must restate it as a pure kernel predicate over (bid bytes, recorded release facts), or an indexer remains the deciding party.
  *Attack flag:* 'Latest recorded' is reorg-sensitive: a reorg that moves or removes the breaking spend changes which generation is valid (Z* interaction).
  *Attack flag:* Reauction floor reset ('floor resets to length floor; no cooldown') is a STATUS placeholder row and an open AUCTION.md review question — entry-floor consequences of release cannot freeze yet (launch-freeze work).

- **S10.** A bond backing a non-winning accepted bid MUST remain locked from bid confirmation until settlement and MUST become releasable only after settlement; the kernel MUST NOT treat any losing bond as releasable at any height before settlement.
  *Sources:* `docs/LAUNCH.md` Bond Continuity Consequences [unclassified] — "loser bonds become releasable after settlement"; `docs/GLOSSARY.md` bond [candidate] — "Bonds are locked, not spent — returnable after release".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/core/src/experimental-auction.ts:668,703-715`.
  *Proposed tests:*
    - (+) After settlement, every superseded accepted bid's bond is reported releasable at the settlement-derived release height.
    - (−) Before settlement, no accepted bid's bond (leading or superseded) is releasable; a spend observed pre-settlement classifies as spent-before-allowed-release.
  *Attack flag:* The exact releasable height (legacy: final auction close + 1) exists only in code — 'after settlement' needs a height (gap: settlement height is undefined in any doc).
  *Attack flag:* 'Releasable' has no stated enforcement consequence for losers: the kernel cannot prevent a Bitcoin spend of a loser's own UTXO, so the rule is only meaningful as a consequence assignment (see S11 for the winner side); the loser-side consequence of an early spend is unspecified.

- **S11.** At settlement, the kernel MUST verify that the winning bid's bond outpoint has not been spent on the canonical chain between bid confirmation and settlement (other than by kernel-valid successor events); a bid whose bond was spent before its allowed release MUST NOT settle into ownership.
  *Sources:* `docs/spec/CONTESTED_AUCTION_REFERENCE.md` Core Rule [candidate] — "every bid backed by real bitcoin capital".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* Named spec PR adding bid-bond continuity to AUCTION.md's settlement rules: define the unspent-from-confirmation-through-settlement predicate for the winning bond, and the consequence (settlement refusal vs bid disqualification with the next-highest bid winning — these produce different owners and the choice is unspecified).
  *Legacy evidence (never authority):* `packages/core/src/indexer.ts:1107-1109`.
  *Proposed tests:*
    - (−) Winning bidder spends their bond UTXO mid-auction, auction settles: no ownership materializes from that bid (and the spec-chosen consequence — no owner vs runner-up wins — is pinned by vector).
    - (−) Bond spent in the same block as settlement boundary: off-by-one pinned by vector.
    - (+) Winning bond unspent through settlement settles normally.
  *Attack flag:* Without this rule a bidder wins with freed capital (post bond, bid to the top, spend the bond, collect the name) — defeating the bonded-auction premise at zero cost.
  *Attack flag:* If the consequence is 'runner-up wins', a bidder can grief by outbidding then self-spending to hand the name to a colluding second bid below market price; if 'no owner', a leader can convert any auction into denial. The spec choice must be attacked before ratification.

- **S12.** A pre-maturity transfer MUST NOT reset or extend the maturity clock: the successor bond inherits the name's original maturity height unchanged.
  *Sources:* `docs/spec/AUCTION.md` Winner Bond And Maturity [candidate] — "Maturity reset on transfer | No | Original clock continues"; `docs/LAUNCH.md` Transfers [unclassified] — "maturity clock does not reset".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:398-409`.
  *Proposed tests:*
    - (+) Chain of pre-maturity transfers: maturityHeight is byte-identical in state after each hop.
    - (−) A state transition that emits a later (or earlier) maturityHeight after transfer fails the conformance vector.
  *Attack flag:* No-reset means a buyer near maturity inherits an almost-free name lock — combined with S3's bid-height anchor ambiguity, transfer timing games could shave the effective lock; the X* extraction should cross-check.

- **S13.** A valid successor bond MUST be verified by the kernel as: an output at the event's declared successorBondVout in the same transaction that spends the current bond outpoint, of spendable payment type, with value at least the name's required bond amount, whose outpoint does not already serve as the live bond of any other name.
  *Sources:* `docs/LAUNCH.md` Bonds And Maturity [unclassified] — "creating a valid successor bond in the same transaction"; `docs/LAUNCH.md` Glossary — "The dedicated output backing an immature auction-settled name."; `docs/spec/WIRE_FORMAT.md` 4.1 Transfer [normative] — "`successorBondVout`(1)".
  *Verdict:* **split** — see step-2 correction below; cited half stands, the named clause is candidate-stays.
  *Step-2 correction:* The #5/#27 conjuncts (same-transaction successor bond output, required amount, no shared live bond outpoint, declared successor vout verified) are cited — consistent with X6/X7. Candidate-stays only for the payment-class script predicate and the reservation-registry scope (rides the logged X7/S13/R11 conflict).
  *Needed spec work:* Named spec PR defining 'valid successor bond': no doc defines 'valid'. Must state the amount comparator (legacy: successor >= requiredBondSats but bid bond == bidAmountSats exactly — engine.ts:320 vs :379; the inconsistency needs a ruling), the script-type requirement, and bond-outpoint exclusivity across names ('dedicated' in the glossary is the only textual hint).
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:375-396`.
  *Proposed tests:*
    - (−) Successor below required amount, successor at wrong vout, successor of non-payment script type, and successor outpoint already backing another name: each individually rejected with the name released (or the event ignored, per the spec's chosen consequence).
    - (+) Successor exactly at required amount and one strictly above both validate.
  *Attack flag:* Exclusivity check in legacy code spans only materialized names, not bonds backing live auction bids — one UTXO could simultaneously be an auction bid bond and a successor bond; spec must close or accept this.
  *Attack flag:* Two ownership events in one transaction (e.g. transfer + recovery) sharing one successor output is unaddressed.

- **S14.** At any height at or after the maturity height, a spend of the bond MUST NOT invalidate ownership: owner-key authority survives bond release, mature transfers MUST NOT require a successor bond, and a mature owner's kernel authority MUST be indistinguishable from an accumulator-final owner's.
  *Sources:* `docs/LAUNCH.md` Bonds And Maturity [unclassified] — "After maturity, owner-key authority can survive bond release."; `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Bonded Ownership [candidate] — "mature transfers do not require successor bond continuity"; `docs/GLOSSARY.md` mature owner [candidate] — "ownership with no remaining bond encumbrance, indistinguishable from an uncontested claimant's".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:364`.
  *Proposed tests:*
    - (+) Spend the bond at exactly maturityHeight and at maturityHeight+1: name remains owned; subsequent transfer without successor bond validates.
    - (−) Boundary pin: identical spend at maturityHeight-1 without successor releases the name (the inclusive/exclusive edge gets explicit vectors both sides).
  *Attack flag:* No doc states whether the block exactly at maturityHeight is mature (legacy: height >= maturityHeight is mature, continuity required strictly below) — an off-by-one between implementations is an ownership-divergence bug; promotion must pin the boundary in spec text.
  *Attack flag:* Doc voice is permissive ('can survive') — must be restated as MUST NOT invalidate for testability.

- **S15.** The kernel MUST NOT materialize auction ownership for a name unless the auction has an actual settled winning bid; an auction lot that closes, expires, or exists only as catalog/compat state with no accepted bid MUST yield no owner.
  *Sources:* `docs/LAUNCH.md` Legacy Scheduled-Catalog Compatibility State [unclassified] — "Settlement materialization only happens for auctions with an actual settled winning bid."; `docs/core/DECISIONS.md` 37. Bond opens the auction (escalation trigger = bond, not bare claim) [ratified decision] — "a name is acquired only by (a) an uncontested cheap claim that finalizes, or (b) the winning bond in an auction".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/core/src/indexer.ts:1076-1087`.
  *Proposed tests:*
    - (−) Auction window passes with zero accepted bids: no NameRecord materializes; the name remains claimable (bond-opens negative vector).
    - (−) A transcript asserting phase=settled but containing no accepted winning bid is rejected by the settlement predicate.
    - (+) Lot with one qualifying opening bid that settles materializes ownership normally.
  *Attack flag:* The legacy scheduled-catalog 'unopened' path is explicitly not the launch story — old-model leakage risk if any catalog-driven materialization survives into the kernel (ChatLunatique hunting-list item).

- **S16.** At settlement the kernel MUST set the name's live owner key to the ownerPubkey carried in the winning bid, and MUST NOT derive the owner key from any other source — no separate settlement transaction, winner-acknowledgement step, or operator assignment may decide it.
  *Sources:* `docs/LAUNCH.md` Auction Settlement Becomes Ownership [unclassified] — "the winning bid's `ownerPubkey` becomes the live owner key for the name"; `docs/spec/AUCTION.md` Real Mechanism Choices (normative shape) [candidate] — "winning bids should carry the eventual owner key"; `docs/spec/WIRE_FORMAT.md` 4.3 AuctionBid [normative] — "`ownerPubkey`(32)".
  *Verdict:* **split** — see step-2 correction below; cited half stands, the named clause is candidate-stays.
  *Step-2 correction:* Positive half (winning bid's ownerPubkey becomes the live owner key) stays cited (LAUNCH.md + AUCTION.md). The exclusive negative half ('no separate settlement transaction, winner-acknowledgement step, or operator assignment') overstates — LAUNCH.md expressly holds the winner-acknowledgement step open. Negative clause candidate-stays; the acknowledgement-step question flagged for a named decision.
  *Legacy evidence (never authority):* `packages/core/src/indexer.ts:1125`.
  *Proposed tests:*
    - (+) Settled transcript: materialized owner key equals the winning bid's ownerPubkey byte-for-byte.
    - (−) Any post-settlement event purporting to assign a different initial owner (without a kernel-valid transfer from the winning ownerPubkey) is rejected.
  *Attack flag:* LAUNCH 'Settlement Questions Still Open' lists 'whether final launch protocol wants a separate winner-acknowledgement step' — an unresolved (unnamed, undecided) question that would change this rule; it is not one of the two named pre-B2 decisions, so it needs either explicit closure or a named decision before B2 freeze.
  *Attack flag:* ownerPubkey is public in the bid (LAUNCH notes the open question of 'a more private winner-key mechanism') — front-running concerns belong to bid mechanics, not settlement.

**Gaps — Settlement consequences (bond release) duties with no spec text at all:**

- Settlement height is defined nowhere: no doc names the height at which an auction becomes 'settled' (legacy code: final auction close + 1, experimental-auction.ts:654-655). S10's loser-release timing and S2's maturity entry both consume it; without it 'after settlement' is untestable.
- Effect of bond-break release on the released owner's previously signed artifacts: no spec text states where the ownership interval ends for value-record and transfer validation when a name is released pre-maturity (interacts with V* sequence/predecessor rules and X*).
- Bond consequences for rejected bids and self-rebid-replaced bonds: AUCTION.md says same-bidder rebids 'replace earlier bids by spending the earlier bond outpoint', but no text states when bonds behind rejected (non-accepted) bids are free to move, or what an early spend of a replaced bond means at settlement.
- Reorg treatment of settlement, maturity, and release facts: none of the settlement sources state what happens when the settling block, the maturity-anchor block, or the bond-break release block is reorged out (Z* owns reorg generally, but the bond-consequence side has zero spec text to consume).
- Loser-side consequence of a pre-settlement bond spend: even with S11 (winner side), no text assigns any consequence to a losing bidder spending their bond mid-auction — whether their bid still counts toward increments/soft-close extensions affects auction outcomes and is unspecified.


### Recovery authority (arming + cross-object) (R*)

- **R1.** The kernel MUST NOT enter pendingRecovery (or otherwise change name state via RecoverOwner) for a name that has no owner-armed recovery descriptor; a name with no armed descriptor is owner-key-only and has no recovery path.
  *Sources:* `docs/core/DECISIONS.md` 40. Recovery is opt-in; its veto should be delegable to a non-custodial watcher — "Recovery stays **optional**: a name with no recovery descriptor is one key, cold-storage style, with nothing to monitor."; `docs/ONT.md` If you lose your key — "Only you can set it up, and only your pre-arranged backup keys can use it — recovery can never be turned into a way for someone else to take a name.".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:539 (proofAvailable defaults false ⇒ request ignored when no descriptor/proof evidence exists)`.
  *Proposed tests:*
    - (−) RecoverOwner invoke whose recoveryDescriptorHash matches no descriptor in the witnessed evidence set MUST be ignored (no pendingRecovery, owner unchanged).
    - (−) Name claimed and never armed: any RecoverOwner invoke, however well-formed, leaves state identical (property over arbitrary payloads).
    - (+) Name with a valid armed descriptor plus matching evidence enters pendingRecovery (under the eventual recovery-auth-ruled signer predicate).
  *Attack flag:* Absence of a descriptor is unprovable from served evidence alone — the rule is only sound stated fail-closed (no witnessed descriptor evidence ⇒ reject), never as 'verify none exists'.

- **R2.** A recovery descriptor is armed-valid only if its 64-byte Schnorr signature verifies over the WIRE_FORMAT §8.2 descriptor digest under the descriptor's ownerPubkey, AND that ownerPubkey equals the name's current owner key in kernel state; a descriptor signed by any other key MUST NOT arm recovery.
  *Sources:* `docs/spec/WIRE_FORMAT.md` 8.2 Recovery descriptor (ont-recovery-descriptor, descriptorVersion 1) — "Digest (= the descriptor hash the on-chain RecoverOwner event references)"; `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Owner-Key Control — "optional recovery setup or veto artifacts"; `docs/DESIGN.md` 3 (Recovery) — "Recovery is owner-armed and **not** revocation".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `apps/resolver/src/validation.ts:134-148 (verifyRecoveryDescriptor + currentOwnerPubkey match)`.
  *Proposed tests:*
    - (−) Descriptor self-consistently signed by key K where K is not the current owner key MUST NOT arm (owner_mismatch).
    - (−) Descriptor with ownerPubkey = current owner but signature by a different key MUST fail digest verification.
    - (−) Cross-context: a valid ont-transfer-owner or ont-recover-owner signature over overlapping fields MUST NOT verify as a descriptor signature (domain separation).
    - (+) Current-owner-signed descriptor with exact §8.2 digest verifies and arms.
  *Attack flag:* WIRE_FORMAT §5 explicitly routes authorization semantics to B2 — the wire only verifies (sig, key, digest); without this kernel rule any keyholder could arm a descriptor for any name.

- **R3.** Within one ownership interval, descriptor-chain acceptance MUST require sequence to be exactly the current head's sequence + 1 (first descriptor: sequence 1, previousDescriptorHash null) and previousDescriptorHash to equal the §8.2 digest of the current chain head; stale, gapped, or mis-linked descriptors MUST be rejected.
  *Sources:* `docs/spec/WIRE_FORMAT.md` 8.2 Recovery descriptor (ont-recovery-descriptor, descriptorVersion 1) — "`sequence`, `previousDescriptorHash`(32-hex or null)"; `docs/spec/WIRE_FORMAT.md` 8.1 Value record (ont-value-record, recordVersion 1) — "Chain rules (sequence exactly +1, hash links to head) are kernel/adapter material, not wire.".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* Named spec PR adding a descriptor-chain acceptance section to ONT_RECOVERY_INVOKE_SPEC.md (or the B2 kernel spec): exactly-next sequence from 1 per ownership interval, previousDescriptorHash = digest of current head, null only for the first. §8.1's chain-rule routing sentence exists only for value records; nothing states it for descriptors.
  *Legacy evidence (never authority):* `apps/resolver/src/validation.ts:160-184 (stale_sequence / sequence_gap / predecessor_mismatch)`.
  *Proposed tests:*
    - (−) Descriptor with sequence equal to head's (stale) rejected.
    - (−) Descriptor with sequence = head+2 (gap) rejected.
    - (−) Descriptor with correct sequence but previousDescriptorHash pointing at a non-head ancestor rejected.
    - (+) head=null + (sequence 1, previousDescriptorHash null) accepted; head=S_n + (n+1, hash(S_n)) accepted.
  *Attack flag:* If chain acceptance is adapter-side only, two resolvers can hold divergent heads and the kernel's notion of 'the armed descriptor' (R6) forks — the chain rule must be a kernel predicate over witnessed descriptor evidence, not a store guard.

- **R4.** A descriptor MUST bind to the current ownership interval: its ownershipRef MUST equal the current interval's reference, and a descriptor armed in a prior ownership interval MUST NOT authorize recovery after ownership rotates (transfer, settlement, or completed recovery).
  *Sources:* `docs/spec/WIRE_FORMAT.md` 8.2 Recovery descriptor (ont-recovery-descriptor, descriptorVersion 1) — "`ownerPubkey`(32-hex), `ownershipRef`(32-hex), `sequence`"; `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Value Records — "sequence-numbered and predecessor-linked within an ownership interval".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* No doc defines ownershipRef semantics anywhere. Named spec PR must define 'ownership interval' and ownershipRef (legacy: lastStateTxid for L1 names; finalizing anchor txid for accumulator names) and state that descriptor chains die at interval rotation. The state-machine quote covers value records only — descriptors need their own statement.
  *Legacy evidence (never authority):* `apps/resolver/src/validation.ts:51-53 (ownershipRefOf = record.lastStateTxid) and 151-157 (ownership_ref_mismatch)`.
  *Proposed tests:*
    - (−) Descriptor with ownershipRef = a prior interval's ref rejected even though signed by the then-owner.
    - (−) After a transfer, an invoke committing to the previous interval's descriptor head MUST NOT create pendingRecovery.
    - (+) Fresh descriptor with ownershipRef = current lastStateTxid accepted; chain restarts at sequence 1 in the new interval.
  *Attack flag:* Without interval binding, a seller's old recovery descriptor outlives a sale and lets the seller reclaim the name — the exact theft Decision #40 forbids.

- **R5.** A non-cancel RecoverOwner event MUST bind to the name's current state: its prevStateTxid MUST equal the lastStateTxid of the name's current ownership interval; otherwise the event MUST be ignored.
  *Sources:* `docs/spec/WIRE_FORMAT.md` 4.2 RecoverOwner — 171 bytes — "frame ‖ `prevStateTxid`(32) ‖ `newOwnerPubkey`(32) ‖ `flags`(1) ‖ `successorBondVout`(1) ‖ `challengeWindowBlocks`(u32) ‖ `recoveryDescriptorHash`(32) ‖ `signature`(64, Schnorr)."; `docs/spec/ONT_RECOVERY_INVOKE_SPEC.md` What's missing in code — "the previous state's bond input (the current name bond UTXO)".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* The wire defines the field; no doc states the kernel matching rule. The recovery-invoke spec's B2 section must state prevStateTxid-equals-current-state as the acceptance predicate (it is the replay protection across intervals).
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:458-466 (findNameRecordByLastStateTxid on payload.prevStateTxid)`.
  *Proposed tests:*
    - (−) Invoke with prevStateTxid = an older state txid of the same name ignored (stale-state replay).
    - (−) Invoke with prevStateTxid matching no name ignored, affects nothing.
    - (+) Invoke with prevStateTxid = current lastStateTxid proceeds to the remaining checks.

- **R6.** A non-cancel RecoverOwner event's recoveryDescriptorHash MUST equal the §8.2 digest of the ARMED descriptor, where the armed descriptor MUST be defined as exactly the chain head of the current ownership interval; an invoke committing to a superseded (non-head) or foreign descriptor MUST be ignored.
  *Sources:* `docs/spec/WIRE_FORMAT.md` 8.2 Recovery descriptor (ont-recovery-descriptor, descriptorVersion 1) — "Digest (= the descriptor hash the on-chain RecoverOwner event references)"; `docs/spec/ONT_RECOVERY_INVOKE_SPEC.md` What this means for the meeting / signet testing — "a resolver enforces the chain-of-descriptors".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* Named spec PR defining 'armed descriptor' (proposed shared term) as the current-interval chain head and requiring hash equality at invoke. The normative text only establishes that the event references a descriptor digest; head-only is stated nowhere and the legacy code violates it.
  *Legacy evidence (never authority):* `apps/resolver/src/index.ts:1674-1689 (getRecoveryDescriptorByHash matches ANY descriptor in ANY chain, not the head)`.
  *Proposed tests:*
    - (−) Owner rotates descriptor S1→S2; invoke committing to hash(S1) MUST be ignored (superseded descriptor — the compromised-old-recovery-wallet attack).
    - (−) Invoke committing to a valid descriptor of a DIFFERENT name's chain ignored.
    - (+) Invoke committing to hash(current head) passes the descriptor-binding check.
  *Attack flag:* Legacy behavior is the attack: any historical descriptor remains invocable by hash, so rotating away from a compromised recovery wallet does not disarm it. The spec must close this or explicitly own it.

- **R7.** At recovery invocation the kernel MUST check that the wallet proof's normalized signingProfile equals the armed descriptor's normalized signingProfile, and MUST NOT enter pendingRecovery for a descriptor whose profile is anything other than a proof-supported profile (descriptorVersion 1 / proofVersion 1: only bip322).
  *Sources:* `docs/spec/WIRE_FORMAT.md` 8.2 Recovery descriptor (ont-recovery-descriptor, descriptorVersion 1) — "at recovery invocation the verifier MUST also check that the proof's normalized `signingProfile` equals the descriptor's normalized `signingProfile`"; `docs/spec/WIRE_FORMAT.md` 8.2 Recovery descriptor (ont-recovery-descriptor, descriptorVersion 1) — "a descriptor naming any other profile is well-formed yet cannot be invoked".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/protocol/src/recovery-wallet-proof.ts:122-128 (profile match + unsupported_recovery_signing_profile)`.
  *Proposed tests:*
    - (−) Descriptor armed with profile 'future-musig' (grammar-valid): any invoke against it MUST never reach pendingRecovery.
    - (−) Proof whose normalized profile differs from the descriptor's MUST be rejected at the cross-object stage even when each envelope is shape-valid.
    - (+) Descriptor and proof both normalizing to bip322 pass the profile check.
  *Attack flag:* This is the rare normative §8 sentence explicitly routed to B2 — losing it during kernel implementation would let a shape-valid future-profile descriptor be invoked under a bip322 proof.

- **R8.** Cross-object field-equality battery: the kernel MUST require (proof ↔ descriptor) name, recoveryAddress, challengeWindowBlocks, and recoveryDescriptorHash = digest(descriptor) to match, and (proof ↔ on-chain event) prevStateTxid, newOwnerPubkey, successorBondVout, challengeWindowBlocks, and recoveryDescriptorHash to be byte-equal; any mismatch MUST reject the invocation.
  *Sources:* `docs/spec/WIRE_FORMAT.md` 8.3 Recovery wallet proof (ont-recovery-wallet-proof, proofVersion 1) — "`prevStateTxid`(32-hex), `recoveryDescriptorHash`(32-hex), `newOwnerPubkey`(32-hex), `successorBondVout`, `challengeWindowBlocks`"; `docs/spec/ONT_RECOVERY_INVOKE_SPEC.md` What exists today — "Posted off-chain to the resolver via `/recovery-proofs`, not embedded in the on-chain payload.".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* Only the profile-equality leg (R7) is normative; the full equality battery exists solely in code. The recovery-invoke B2 section must enumerate the exact field-equality set between event, proof, and descriptor.
  *Legacy evidence (never authority):* `packages/protocol/src/recovery-wallet-proof.ts:107-156 (verifyRecoveryWalletProof) + apps/resolver/src/index.ts:1657-1671 (expected-fields wiring from the on-chain event)`.
  *Proposed tests:*
    - (−) One test per field: proof matching the descriptor but with newOwnerPubkey (resp. prevStateTxid, successorBondVout, challengeWindowBlocks, recoveryDescriptorHash) differing from the mined event MUST reject.
    - (−) Proof bound to descriptor A presented against an event committing to descriptor B (both valid) MUST reject.
    - (+) Fully-matching event/proof/descriptor triple passes the battery.
  *Attack flag:* The proof's optional chainTip fields are signed but no rule checks them against chain facts — they are an unverified freshness hint; spec must either give them a kernel meaning or state they are advisory (else they imply false replay protection).

- **R9.** Shape (final form blocked): the kernel MUST NOT enter pendingRecovery unless a recovery wallet proof for the invocation verifies as a BIP322 signature by the armed descriptor's recoveryAddress key over the regenerated §8.3 message, taken as witnessed evidence; whether this proof is the invoke authorization itself or supplementary to an on-chain signature is the open recovery-auth question.
  *Sources:* `docs/spec/WIRE_FORMAT.md` 8.3 Recovery wallet proof (ont-recovery-wallet-proof, proofVersion 1) — "signed **BIP322 by the recovery address key** over a normalized *text message*, and verified by a BIP322 verifier"; `docs/spec/ONT_RECOVERY_INVOKE_SPEC.md` What exists today — "BIP322 signature proving the recovery wallet controls the recovery address.".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* The ratified recovery-auth decision must state the proof's required role in the invoke predicate (sole authorizer vs corroborating evidence) before this rule can finalize; then a named spec PR lands it in the recovery spec's B2 section.
  *Blocked on decision:* `recovery-auth`.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:526-545 (proofAvailable gate, fail-closed) + apps/resolver/src/index.ts:1642-1671`.
  *Proposed tests:*
    - (−) Invoke with no witnessed proof for the committed proof identity MUST be ignored (fail closed).
    - (−) Proof whose BIP322 verification returns false (including structurally malformed signature bytes — verify false, never throw, per §8.3) MUST NOT create pendingRecovery.
    - (+) Verified proof from the descriptor's recoveryAddress, matching R8's battery, satisfies the wallet-control leg.
  *Attack flag:* BIP322 verification embeds Bitcoin script semantics — the B2 purity gate must treat the verifier as a deterministic pure function over (address, message, signature) with no network/UTXO lookups, or recovery verdicts stop being replayable.

- **R10.** Shape (blocked): the kernel MUST validate the non-cancel RecoverOwner event's 64-byte signature field under the recovery-auth-ruled semantics (descriptor-embedded owner signature (a), fresh recovery-wallet signature (b), or another ruled form); until recovery-auth is ratified the kernel MUST fail closed and accept no non-cancel RecoverOwner event.
  *Sources:* `docs/spec/ONT_RECOVERY_INVOKE_SPEC.md` What's missing in code (item 2) — "The invoke-path signer isn't yet defined. **This is the open protocol question.**"; `docs/core/B1_WIRE_HARDENING.md` Explicitly routed out of B1 — "RecoverOwner authorization semantics (open question a/b/c) | B2 recovery-authority hardening".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* The recovery-auth named decision, ratified into ONT_RECOVERY_INVOKE_SPEC.md §2; it must also reconcile WIRE_FORMAT §4.2's normative `signature`(64, Schnorr) field name with whatever occupies it (the ratified §8.3 proof commitment is now 32 bytes, so the legacy commitment-in-slot packing no longer fits the 64-byte field).
  *Blocked on decision:* `recovery-auth`.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:515-524 + packages/protocol/src/recovery-wallet-proof.ts:209-217 (legacy filled the slot with proofHash ‖ 32 reserved zero bytes — a commitment, not a signature)`.
  *Proposed tests:*
    - (−) Until ruled: every non-cancel RecoverOwner event is rejected by the kernel (fail-closed pin that flips only with the ratified rule).
    - (−) Post-ruling: signature/commitment valid under the wrong key/context (cross-context vectors per §5) MUST reject.
    - (+) Post-ruling: the ruled signer's well-formed authorization is accepted (vector to be defined with the ruling).
  *Attack flag:* Option (a) would make the slot a static, publicly-known value (the arming signature) replayable by anyone who has seen the descriptor — the ruling must address replay; flagged, not decided.
  *Attack flag:* Normative wire text labels the field `signature`(64, Schnorr) while the only deployed behavior put a non-signature commitment there — divergence between normative naming and legacy evidence.

- **R11.** A non-cancel RecoverOwner transaction MUST spend the name's current live bond outpoint among its inputs and MUST create output[successorBondVout] that is a qualifying successor bond (payment-class script, value ≥ the name's required bond) whose outpoint is not already reserved by another name; otherwise the invocation MUST be ignored.
  *Sources:* `docs/spec/ONT_RECOVERY_INVOKE_SPEC.md` What's missing in code (item 1) — "the previous state's bond input (the current name bond UTXO)"; `docs/spec/ONT_RECOVERY_INVOKE_SPEC.md` What's missing in code (item 1) — "the successor bond output (locked at the recovery address)"; `docs/DESIGN.md` 3 (Recovery) — "invoking it posts an on-chain request through a temporary UTXO".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* The invoke-spec text describes builder inputs, not an acceptance rule. Named spec PR stating the transaction-shape predicate, including whether the successor bond MUST pay to the descriptor's recoveryAddress (the spec parenthetical implies it; legacy never checks it) — bond-qualification thresholds defer to the settlement-bonds (S*) rules.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:484-513 (missing_bond_spend / invalid_successor_bond / successor_bond_conflict)`.
  *Proposed tests:*
    - (−) Invoke that does not spend the current bond outpoint ignored.
    - (−) Invoke whose output[successorBondVout] is missing, non-payment (e.g. OP_RETURN), or under the required bond value ignored.
    - (−) Invoke whose successor outpoint is already another name's bond ignored (conflict).
    - (+) Invoke spending the live bond and creating a qualifying successor bond at the named vout passes the shape check.
  *Attack flag:* 'Locked at the recovery address' is asserted in spec prose but unverified in legacy code — if the kernel doesn't compare the successor scriptPubKey to the descriptor's recoveryAddress, the invoker can route the bond anywhere while claiming recovery.

- **R12.** A non-cancel RecoverOwner invocation MUST be accepted only while the name's bond is immature (event mined height strictly below the name's maturity height); recovery of mature, bond-released names MUST be rejected absent a separately specified post-maturity recovery anchor.
  *Sources:* `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Implementation Status — "recovery prototype for immature bonded names".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* The cited line is status text, not a rule (the ledger says status statements are historical). Named spec PR must state the maturity boundary for invocation and explicitly rule the post-maturity posture (research/OWNER_KEY_RECOVERY.md analyzes it but is analysis tier).
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:476-482 (recovery_requires_immature_bond)`.
  *Proposed tests:*
    - (−) Invoke mined at height ≥ maturityHeight ignored even with valid descriptor/proof/bond shape.
    - (−) Boundary: invoke at exactly maturityHeight ignored (legacy uses >=); pin whichever boundary the spec states.
    - (+) Invoke one block before maturity with all other checks passing enters pendingRecovery.
  *Attack flag:* If the challenge window can straddle maturity (h_req < maturityHeight < h_req + W), the interaction between window completion, bond release, and continuity rules is unspecified — straddle cases need explicit spec text.

- **R13.** A name MUST have at most one pendingRecovery at a time: while a pendingRecovery exists, any further non-cancel RecoverOwner invocation for that name MUST be ignored.
  *Sources:* `docs/spec/ONT_RECOVERY_INVOKE_SPEC.md` What exists today — "the indexer recognizes the `RECOVER_OWNER` event type and tracks `pendingRecovery` state.".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* Single-pending is implied by the singular 'pendingRecovery state' but never stated as a rule; the spec must also rule what a second invoke means (ignored vs supersedes) and whether owner-key transfer during pending is allowed — both listed only in analysis-tier 'Conflict Rules To Define'.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:468-474 (recovery_already_pending)`.
  *Proposed tests:*
    - (−) Second valid-looking invoke during an open window ignored; first pendingRecovery unchanged.
    - (+) After cancel or completion clears pendingRecovery, a fresh invoke is admissible again.
  *Attack flag:* First-invoke-wins plus single-pending lets whoever lands first (including a compromised recovery wallet) lock out a competing legitimate invocation for a full window — griefing surface the spec should acknowledge.

- **R14.** The pendingRecovery window MUST be computed as: finalize deadline = (mined height of the accepted invoke transaction on the canonical chain) + challengeWindowBlocks, with challengeWindowBlocks a u32 in [1, 2^32−1] equal across event, proof, and descriptor (R8); window length is a parameter whose launch value is not yet frozen.
  *Sources:* `docs/spec/WIRE_FORMAT.md` 4.2 RecoverOwner — 171 bytes — "`challengeWindowBlocks`(u32)"; `docs/DESIGN.md` 3 (Recovery) — "your original key holds a **veto** during a challenge window".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* Named spec PR stating the window arithmetic and boundary semantics; the default/minimum window value (legacy 144) is a launch-freeze parameter — per the inventory rule, a placeholder value cannot ground the rule, so it stays parameterized.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:558 (finalizeHeight = event.blockHeight + payload.challengeWindowBlocks); packages/protocol/src/events.ts:394-399 (≥1 assert); packages/protocol/src/recovery-descriptor.ts:11 (default 144)`.
  *Proposed tests:*
    - (−) challengeWindowBlocks = 0 never arms or invokes (wire/kernel reject).
    - (+) Window-arithmetic property: for arbitrary W in range, cancel admissible iff mined height < h_req + W; completion iff height ≥ h_req + W (one shared boundary, no off-by-one gap or overlap).
  *Attack flag:* Owner-chosen W with only a ≥1 floor lets an attacker-friendly descriptor arm W=1 (veto nearly impossible) — minimum window must be a frozen protocol parameter, not a descriptor field the kernel trusts blindly.

- **R15.** Cancel/veto authorization (defined): a RecoverOwner event with the CANCEL flag set MUST be accepted only if its 64-byte Schnorr signature verifies under the name's CURRENT owner key over the ont-recover-owner domain-separated digest of the cancel event's own fields (flags including the CANCEL bit); any other signer MUST be rejected.
  *Sources:* `docs/spec/ONT_RECOVERY_INVOKE_SPEC.md` What exists today — "for the **veto path** during the challenge window. The owner key signs a cancellation authorization."; `docs/spec/WIRE_FORMAT.md` 5. Keys and owner-key Schnorr digests — "**RecoverOwner:** `sha256( lenPrefix("ont-recover-owner") ‖ prevStateTxid(32) ‖ newOwnerPubkey(32) ‖ flags(1) ‖ successorBondVout(1) ‖ challengeWindowBlocks(u32) ‖ recoveryDescriptorHash(32) )`"; `docs/spec/ONT_RECOVERY_INVOKE_SPEC.md` What's missing in code (item 2) — "The cancel-authorization function exists and is clearly the veto-path signer.".
  *Verdict:* **cited (restated)** — see step-2 correction below.
  *Step-2 correction:* Owner-key cancel stays cited as the defined veto signer today (invoke spec + WIRE §5). But 'any other signer MUST be rejected' freezes legacy against ratified intent: DECISIONS #40 makes a delegable, non-custodial, abort-only watcher credential the decided target shape (construction open — OPEN_QUESTIONS §4.1). Restated with a #40 carve-out: the exclusivity clause holds until the watcher-credential construction lands, then relaxes by named amendment.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:611-628 (verifyRecoverOwnerCancelAuthorization against record.currentOwnerPubkey); packages/protocol/src/events.ts:9 (RECOVER_OWNER_FLAG_CANCEL = 0x01), 343-358 (digest)`.
  *Proposed tests:*
    - (−) Cancel signed by the proposed new owner key (recovery wallet) rejected — only the vetoing owner key cancels.
    - (−) Cancel signature computed over the digest with the CANCEL bit clear MUST NOT verify for a cancel event (flags byte is digest material — no invoke/cancel cross-replay).
    - (+) Current-owner-signed cancel inside the window clears pendingRecovery.
  *Attack flag:* The CANCEL flag bit value (0x01) exists only in legacy code — normative WIRE_FORMAT §4.2 defines no flag-bit registry for RecoverOwner, so the invoke/cancel discriminator is currently unspecified at the wire level (needs a named §4 amendment; see crossAreaNotes).

- **R16.** Cancel binding and timeliness: a cancel MUST reference the open pendingRecovery (legacy: cancel.prevStateTxid = the pending request's txid), MUST carry newOwnerPubkey, challengeWindowBlocks, and recoveryDescriptorHash equal to the pending request's values, and MUST be mined at a height strictly below the finalize deadline; otherwise it MUST be ignored.
  *Sources:* `docs/spec/ONT_RECOVERY_INVOKE_SPEC.md` What's missing in code (item 3) — "the owner private key + the pending recovery's descriptor hash + the bond input"; `docs/DESIGN.md` 3 (Recovery) — "your original key holds a **veto** during a challenge window".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* Named spec PR stating cancel binding: which txid the cancel's prevStateTxid names (legacy overloads it to mean the request txid, not a state txid — undocumented), the exact field-equality set, and the strict-before deadline boundary.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:581-609 (findNameRecordByPendingRecoveryTxid, cancel_too_late, mismatched_request) + 701-709`.
  *Proposed tests:*
    - (−) Cancel mined at exactly the finalize deadline height ignored (too late); recovery completes.
    - (−) Cancel with any of newOwnerPubkey/challengeWindowBlocks/recoveryDescriptorHash differing from the pending request ignored.
    - (−) Cancel referencing a txid that is no open pendingRecovery ignored.
    - (+) Exact-match cancel one block before the deadline cancels.
  *Attack flag:* Legacy equality check omits successorBondVout — a cancel can bind to a request while disagreeing on that field; spec must close or own the omission.
  *Attack flag:* prevStateTxid means 'current state txid' in invokes but 'request txid' in cancels — silent field overloading inside one normative layout is a misimplementation magnet.

- **R17.** A valid cancel MUST be abort-only: its sole state effect is clearing the pendingRecovery (the pre-request owner key remains the owner); a cancel MUST NOT change the owner key, and the cancel's newOwnerPubkey field is binding material only.
  *Sources:* `docs/core/DECISIONS.md` 40. Recovery is opt-in; its veto should be delegable to a non-custodial watcher — "a **watchtower holding a name-scoped, abort-only credential** (can cancel a malicious recovery, can never move the name)".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:630-640 (withoutPendingRecovery; owner unchanged)`.
  *Proposed tests:*
    - (+) After a valid cancel: currentOwnerPubkey unchanged, pendingRecovery cleared, the proposed owner never appears in state.
    - (−) A cancel constructed to smuggle an owner rotation (any payload variation) MUST NOT change currentOwnerPubkey.
  *Attack flag:* Legacy leaves the live bond rotated to the invoker's successor output even after a successful veto (bond moved at request time, never restored at cancel) — the vetoed attacker then controls the name's bond UTXO, a continuity/grief hazard the spec must resolve (interacts with bond-continuity rules, S* area).

- **R18.** Completion: at the first canonical-chain height ≥ (request mined height + challengeWindowBlocks) with no valid cancel mined strictly before that deadline, the kernel MUST rotate ownership — the pendingRecovery's proposed newOwnerPubkey becomes the current owner key, the ownership interval rotates (new interval ref = the request txid), and pendingRecovery clears; descriptor and value-record chains of the prior interval die per R4.
  *Sources:* `docs/DESIGN.md` 5 (sovereignty invariants, item 5) — "that opens a challenge window in which **your main key can cancel it**"; `docs/ONT.md` If you lose your key — "so a lost key is not the end of your name".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* The principle (window then completion) is doc-grounded but the precise transition — deadline boundary, what becomes the new interval ref, that completion requires no event of its own — exists only in code. Named spec PR for the completion predicate; the cited DESIGN/ONT lines are narrative, not a testable rule.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:186-218 (refreshDerivedState: owner := proposedOwnerPubkey, lastStateTxid := requestedTxid at finalizeHeight)`.
  *Proposed tests:*
    - (+) No cancel: at deadline height the owner is the proposed key; at deadline−1 it is still the old owner (boundary pin).
    - (−) Valid cancel before the deadline: completion never fires, including when replay later reaches the deadline height.
    - (+) Determinism/permutation property: replaying the same blocks in one pass vs incrementally yields the identical post-completion state.
  *Attack flag:* Legacy completion happens in a derived-state refresh keyed on a caller-supplied currentHeight, not on event application — if the new kernel keeps that shape, completion must still be a deterministic function of chain height with no dependence on when the refresh is invoked.

- **R19.** All recovery verdicts (arm, invoke, cancel, completion) MUST be pure deterministic predicates over (event bytes, prior name state, witnessed descriptor/proof evidence, canonical-chain facts); the kernel MUST take recovery evidence as explicit witnessed inputs, MUST treat absent or unverifiable evidence as failing (fail closed), and MUST NOT consult network, wall-clock, or storage in the decision.
  *Sources:* `docs/core/SOFTWARE_CANON.md` Layer vocabulary (L2 ownership kernel row) — "No DB, no network, no clock, no UI"; `docs/core/SOFTWARE_CANON.md` The boundary rule, stated once — "it lives in the kernel, as a pure predicate over witnessed inputs".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:526-537 (options.recoveryWalletProofAvailable?.(...) ?? false — an injected callback, I/O-shaped, though fail-closed by default)`.
  *Proposed tests:*
    - (+) Determinism property: identical (events, state, evidence set, heights) inputs produce byte-identical recovery verdicts across repeated runs and implementations.
    - (−) Empty evidence set: every invoke is rejected; no code path can block, fetch, or defer.
    - (−) Boundary-manifest-style zero-I/O import test covers the recovery module (no net/fs/Date in the kernel package).
  *Attack flag:* The legacy availability checker hides an evidence-timing question: 'available' as of WHEN? A pure restatement needs the evidence set pinned to a defined observation rule, or proof-withholding/late-publication games decide outcomes (see gaps; shaped like the DA fail-closed problem).

**Gaps — Recovery authority (arming + cross-object) duties with no spec text at all:**

- Delegable abort-only veto credential (Decision #40's target shape: watchtower with a name-scoped, abort-only credential) — the credential construction is declared an open design problem and has zero spec text; the kernel's cancel predicate (R15) currently admits only the owner key.
- Conflict/ordering rules during pendingRecovery: owner transfer vs invoke in the same block, transfer during an open window, value-record authority during the window, successor-bond spend during the window, cancel-vs-completion at the boundary height — enumerated only in analysis-tier research/OWNER_KEY_RECOVERY.md ('Conflict Rules To Define'); no spec text anywhere.
- Descriptor disarm/revocation: no spec text says how an owner un-arms recovery (e.g. whether a chain entry can clear the recovery path, or rotation-to-new-address is the only tool); legacy chains can only append.
- Recovery for accumulator/cheap-rail (UTXO-less) names: ONT_ACQUISITION_STATE_MACHINE.md lists 'UTXO-less recovery for accumulator names' as not canonical; R11's bond-spend shape cannot apply to bondless names and no alternative is specified.
- Evidence-timing rule for recovery evidence: by when must the descriptor and wallet proof have been served/witnessed relative to the invoke's mined height (late-proof replay is explicitly unimplemented per the invoke spec's source notes); without a window rule, proof-withholding then late-reveal can flip verdicts.
- ownershipRef semantics: the field is normative wire shape (§8.1/§8.2) but no document defines what it must equal or when intervals rotate — needed by R4/R18 and shared with value records.
- challengeWindowBlocks launch parameter: no STATUS row, no minimum; legacy default 144 is placeholder-grade — launch-freeze work.
- RecoverOwner flags-bit registry: normative §4.2 defines flags(1) with no bit assignments; the CANCEL bit (0x01) that splits this whole area into invoke vs veto paths is code-only.


### Transfer authority (X*)

- **X1.** Name ownership state MUST change only through on-chain ONT events applied under kernel rules (settlement, Transfer, RecoverOwner); a value record, resolver answer, or any other off-chain artifact MUST NOT change a name's owner key.
  *Sources:* `docs/core/DECISIONS.md` Decision Log #4 Transfer semantics — "Transfers are signed on-chain transfer records."; `docs/LAUNCH.md` Transfers — "Transfers are ownership events, not resolver updates."; `docs/LAUNCH.md` Transfers — "Mutable value records do not transfer ownership. They only update what a name points to."; `docs/core/DECISIONS.md` Decision Log #16 Ownership versus destination placement — "Loss of off-chain destination data does not affect on-chain ownership validity.".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:226-255`.
  *Proposed tests:*
    - (−) A validly owner-signed value record naming a different owner key produces zero ownership change.
    - (−) No sequence of resolver/publisher-supplied inputs changes an owner key without an on-chain event reaching the kernel.
    - (+) An on-chain Transfer satisfying X2-X11 changes the owner key; nothing else in the suite does.

- **X2.** A Transfer event MUST change name state only if its 64-byte signature is a valid BIP340 Schnorr signature over the WIRE_FORMAT §5 ont-transfer-owner digest computed from the event's own decoded fields (prevStateTxid, newOwnerPubkey, flags, successorBondVout), verifying against the owner key recorded in the target name's current state; no other key (prior owner, incoming owner, recovery key, publisher) can authorize a transfer.
  *Sources:* `docs/spec/WIRE_FORMAT.md` 5. Keys and owner-key Schnorr digests (normative) — "Transfer: sha256( lenPrefix("ont-transfer-owner") ‖ prevStateTxid(32) ‖ newOwnerPubkey(32) ‖ flags(1) ‖ successorBondVout(1) )"; `docs/spec/WIRE_FORMAT.md` 5. Keys and owner-key Schnorr digests (normative) — "Authorization semantics — which key must have produced a signature for an event to change name state — are kernel rules (B2), not wire."; `docs/core/DECISIONS.md` Decision Log #1 Ownership model — "valid acquisition, update, and transfer operations must be authorized by signatures from the corresponding private key"; `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Owner-Key Control (candidate) — "Once a name is final, the owner key is the stable authority layer. It signs: transfers"; `docs/DESIGN.md` 4. Trust surface — The guarantee in one table — "A transfer is valid only if the current owner's key signed it".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:347-362`.
  *Proposed tests:*
    - (+) A transfer signed by the current owner key over the exact payload fields applies.
    - (−) Signature by a random key over the same digest: no state change.
    - (−) Signature by the incoming newOwnerPubkey (recipient self-authorization): no state change.
    - (−) Signature by the previous owner after their transfer applied: no state change (their key is no longer the state's owner key).
    - (−) Signature over field values differing from the carried payload (e.g. different newOwnerPubkey): no state change.
    - (−) Kernel-level cross-context check: a valid ont-recover-owner signature over the shared prefix fields presented inside a Transfer event authorizes nothing (mirrors the §5 wire rule from the kernel side).
  *Attack flag:* The §5 digest excludes both the name and the carrying txid: authorization binds to a name only through prevStateTxid (ambiguity risk flagged on X4) and to no particular carrying transaction (extraction risk flagged on X10).

- **X3.** A Transfer event that fails any conjunct of the acceptance predicate MUST NOT change any name state at all — no owner change, no state-head advance, no bond-state change, no recovery or value-record side effect; the event is ignored, and signature verification over malformed bytes MUST return false, never abort.
  *Sources:* `docs/DESIGN.md` 4. Trust surface — The rules, plainly (rule 2) — "No signature from your key ⇒ the name does not move. Full stop."; `docs/ONT.md` What owning a name means — "A signature from that key is the only thing that can move a name.".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:339-345 (ignored verdicts mutate nothing); packages/protocol/src/events.ts:271-276 (verify returns false in catch)`.
  *Proposed tests:*
    - (−) Reject battery: for every reject path (unknown head, bad signature, missing bond spend, inadequate successor bond, conflicting outpoint, non-owned state) assert the post-event state is byte-identical to the prior state — no partial effects.
    - (−) Malformed signature bytes (not a valid curve point/scalar encoding) yield a false verdict without throwing — the kernel never crashes on adversarial bytes (same philosophy as the shape-only-gate ruling).

- **X4.** A Transfer MUST target exactly the name whose current state head (the txid of the transaction that most recently changed that name's state) equals the event's prevStateTxid; if no owned name's state head equals prevStateTxid the Transfer MUST NOT change any state; one Transfer MUST NOT apply to more than one name.
  *Sources:* `docs/spec/WIRE_FORMAT.md` 4.1 Transfer — 135 bytes (normative; shape only — the event carries no name field) — "frame ‖ prevStateTxid(32) ‖ newOwnerPubkey(32) ‖ flags(1) ‖ successorBondVout(1) ‖ signature(64, Schnorr)."; `docs/DESIGN.md` 4. Trust surface — The rules, plainly (rule 2) — "a Schnorr signature from that key over the exact transfer (prevStateTxid, new owner, …)".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* Named spec PR adding a state-head linkage section to the B2 kernel spec (ONT_ACQUISITION_STATE_MACHINE.md or its successor): define 'name state head', state that prevStateTxid must equal it and is the transfer/recovery target selector, and forbid two names ever sharing a state head (or define a deterministic selection). No doc currently states the linkage semantics — §4.1 gives only the field shape and §5 explicitly routes semantics to B2.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:337,691-699`.
  *Proposed tests:*
    - (+) Transfer with prevStateTxid equal to the name's current head applies to exactly that name.
    - (−) prevStateTxid equal to no known head (random txid): no state change anywhere.
    - (−) prevStateTxid equal to a stale (pre-transfer) head of the same name: no state change.
    - (−) Ambiguity guard: if a state with two names sharing a head is constructible, the kernel verdict must be deterministic and spec-defined, never map-iteration-order-dependent.
  *Attack flag:* Legacy target lookup returns the first map-iteration match (engine.ts:691-699); if two names ever shared a lastStateTxid (one transaction touching two names) selection would be insertion-order-dependent — nondeterminism inside the kernel.
  *Attack flag:* The event carries no name field, so the touched name is unparseable without prior state — acceptable for a pure kernel but must be stated, since proof/indexer layers will otherwise guess.

- **X5.** An applied Transfer MUST advance the target name's state head to the txid of its carrying transaction; a Transfer whose prevStateTxid no longer equals the current head — including a byte-identical replay of an already-applied Transfer mined again later — MUST NOT change any state; among multiple valid Transfers referencing the same head, exactly the first in Bitcoin canonical order applies.
  *Sources:* `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Design Rule (candidate) — "Ownership is the deterministic result of Bitcoin ordering, ONT validity rules, public notice, and owner-key signatures."; `docs/DESIGN.md` 4. Trust surface — The rules, plainly (rule 3) — "Everyone computes the same ownership state by replaying the same Bitcoin transactions in Bitcoin's order.".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* Same named spec PR as X4 (state-head linkage): state that every applied state-changing event advances the head and that authorizations against a superseded head are permanently dead. The Bitcoin-ordering authority is cited; the head-advance mechanism that delivers replay immunity is stated in no doc.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:410-411,429-430`.
  *Proposed tests:*
    - (−) Replay the identical Transfer event bytes in a later block after it applied once: no state change (head moved).
    - (−) A second valid transfer signed against the pre-transfer head, mined after the first: no state change.
    - (+) Two valid transfers against the same head in one block: exactly the earlier one in canonical order applies; the later is a no-op.
    - (+) Property: permuting unrelated events never changes the transfer verdict; reordering two same-head transfers swaps only which of them applies.
  *Attack flag:* Replay immunity rests entirely on head advance: any future state-changing event that fails to advance the head would resurrect old transfer authorizations. The spec sentence must be universal (every state change advances the head), not transfer-specific.

- **X6.** For a name before maturity, a Transfer MUST be applied only if its carrying transaction both spends the name's current bond outpoint and creates a successor bond output at output index successorBondVout whose value is at least the required bond amount (parameter, launch-freeze); failing either conjunct the Transfer MUST NOT change state.
  *Sources:* `docs/core/DECISIONS.md` Decision Log #4 Transfer semantics — "Pre-maturity transfers must also move the bonded UTXO."; `docs/core/DECISIONS.md` Decision Log #5 Bond continuity — "Every pre-maturity transfer must spend the current bond outpoint."; `docs/core/DECISIONS.md` Decision Log #5 Bond continuity — "The successor bond output must contain at least the required bond amount."; `docs/core/DECISIONS.md` Decision Log #27 Pre-maturity transfer linkage — "the signed transfer payload includes the successor bond output index (`vout`)"; `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Bonded Ownership (candidate) — "a transfer must spend the current bond and create a successor bond in the same transaction".
  *Verdict:* **cited**.
  *Needed spec work:* Parameterized: the required bond amount is a STATUS.md placeholder (min bond ₿50,000; ≤4-char curve) — value freezes at launch-parameter freeze. Separately, the objective 'qualifying bond output' script predicate must be specced (see gaps) before the conjunct is fully testable.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:364-396`.
  *Proposed tests:*
    - (+) Pre-maturity transfer spending the current bond outpoint and creating an adequate successor at the signed vout applies; owner, bond outpoint, and head all update atomically.
    - (−) Carrying transaction does not spend the current bond outpoint: no state change.
    - (−) successorBondVout indexes a nonexistent output: no state change.
    - (−) Successor output value one sat below the required bond amount: no state change.
    - (−) Successor output of a non-qualifying script shape: no state change (pins the bond-output predicate once specced).
  *Attack flag:* Fee erosion: #5 notes fees should be funded separately; a successor output that slips below threshold simply invalidates the transfer — the kernel must not round or forgive, and wallet layers must guard it.
  *Attack flag:* successorBondVout is u8: outputs at index >255 can never be successor bonds — a wire bound with kernel consequence the spec should state explicitly.

- **X7.** A Transfer MUST NOT be applied if its successor bond outpoint (carrying txid, successorBondVout) is already referenced as the live bond outpoint of another name or pending acquisition; no two live names or pending acquisitions may ever reference the same bond outpoint.
  *Sources:* `docs/core/DECISIONS.md` Decision Log #5 Bond continuity — "No two live names or pending acquisitions may reference the same bond outpoint at the same time.".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:388-396 (bondOutpointIsReserved check)`.
  *Proposed tests:*
    - (−) Two pre-maturity transfers of different names carried in one transaction naming the same successorBondVout: at most one applies, deterministically.
    - (−) Transfer naming a successor outpoint already serving another live name's bond: no state change.
    - (+) Two transfers in one transaction with distinct successor vouts, each adequate: both apply.
  *Attack flag:* Contention order: which of two same-transaction transfers wins the shared outpoint must be deterministic (Bitcoin order within the transaction's event sequence) — unstated anywhere; ties into the same-transaction multiplicity gap.

- **X8.** At or after maturity, a Transfer MUST be applied without any bond spend or successor bond output requirement; the kernel MUST NOT impose bond-continuity conjuncts on a mature name's transfer (the signed successorBondVout byte carries no semantic effect in the mature path).
  *Sources:* `docs/core/DECISIONS.md` Decision Log #4 Transfer semantics — "Post-maturity transfers do not require bond continuity."; `docs/core/DECISIONS.md` Decision Log #27 Pre-maturity transfer linkage — "mature transfers do not require successor bond output linkage"; `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Bonded Ownership (candidate) — "mature transfers do not require successor bond continuity"; `docs/LAUNCH.md` Transfers — "no successor bond is required".
  *Verdict:* **cited**.
  *Needed spec work:* Parameterized: maturity duration is a STATUS.md placeholder (~52,560 blocks) — launch-freeze. One spec sentence must also pin the boundary comparison (see attack flag).
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:364,420-431`.
  *Proposed tests:*
    - (+) Mature transfer in a transaction with no bond inputs or outputs applies; owner and head update, bond fields untouched.
    - (+) Transfer mined at exactly height == maturity height applies under mature rules (pins the boundary once the spec rules it).
    - (−) Transfer at height == maturity height − 1 without bond spend: no state change (immature rules still bind).
  *Attack flag:* Off-by-one at the maturity boundary is unstated in every doc ('before/after maturity' only); legacy treats blockHeight == maturityHeight as mature (engine.ts:364). A one-block disagreement between implementations is a one-block theft/denial window — the spec must pin >= vs >.
  *Attack flag:* The dead-but-signed successorBondVout byte in mature transfers admits arbitrary values; harmless under this rule, but the spec should explicitly say 'ignored' (or require 0) so implementations do not invent semantics.

- **X9.** An applied Transfer MUST NOT change the name's maturity height; the maturity anchor remains the original acquisition/settlement height through any number of transfers.
  *Sources:* `docs/core/DECISIONS.md` Decision Log #4 Transfer semantics — "Transfer does not reset the original maturity clock."; `docs/core/DECISIONS.md` Decision Log #5 Bond continuity — "The original acquisition height remains the maturity anchor."; `docs/LAUNCH.md` Transfers — "maturity clock does not reset".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:398-412 (maturityHeight carried unchanged through the record spread)`.
  *Proposed tests:*
    - (+) Pre-maturity transfer: maturityHeight is unchanged after application.
    - (+) Chain of N pre-maturity transfers: maturity still arrives at the original height; the Nth buyer's bond releases on the original schedule.
    - (−) No transfer construction exists that extends or shortens the lockup: a name one block from maturity transfers and matures next block.

- **X10.** The transfer-acceptance predicate MUST NOT depend on sale price, payment outputs, or any commercial term; apart from the bond conjuncts (X6, X7) the kernel MUST NOT read the carrying transaction's other outputs to decide ownership.
  *Sources:* `docs/core/DECISIONS.md` Decision Log #30 Atomic transfer-for-payment model — "It should not need to interpret sale price terms or payment semantics to determine who owns a name."; `docs/core/DECISIONS.md` Decision Log #30 Atomic transfer-for-payment model — "The sale price is not an ONT consensus field.".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:335-438 (no payment fields consulted anywhere in the transfer path)`.
  *Proposed tests:*
    - (+) A mature transfer carried in a transaction paying the seller nothing still applies — documents that payment enforcement is deliberately outside the kernel.
    - (+) Property: two transactions identical except for non-bond outputs yield identical transfer verdicts.
    - (−) No kernel input exists whose payment amount flips a transfer verdict (predicate-surface audit test).
  *Attack flag:* Free-floating authorization extraction: the §5 digest excludes the carrying txid, so a mature-sale authorization signed for tx A can be ripped out and mined in tx B without the payment. #30 assigns the defense to the wallet layer ('seller authorization must be bound to the exact Bitcoin transaction that pays the seller' via cooperative PSBT + a seller-controlled input). The kernel cannot detect underpayment by design — B5's transfer flow must ship that binding or mature sales are unsafe; keep this boundary loudly documented.

- **X11.** A Transfer MUST NOT change state for a name that is not in an owned state: a provisional claim in its notice window, a contested name in a live auction, a nullified name, a name invalidated by broken bond continuity, and a nonexistent name MUST all be unaffected by any Transfer event.
  *Sources:* `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Owner-Key Control (candidate) — "Once a name is final, the owner key is the stable authority layer."; `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` State Model (candidate) — "C["Final accumulator owner"] ... F["Bonded owner"] ... G["Mature owner"] ... --> H["Owner-key transfer"]"; `docs/DESIGN.md` 6. Economics — The bond — "The winner becomes owner — and can point and transfer the name — the moment the auction settles".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:339-345 (invalid-status records reject); engine.ts transfers reach only owned auction-derived records`.
  *Proposed tests:*
    - (−) Transfer referencing the head of a name invalidated by broken bond continuity: no state change.
    - (−) Transfer attempting to move a provisional batched claim during its notice window: no state change.
    - (−) Transfer against a name in a live auction: no state change.
    - (+) Transfer in the block after auction settlement applies (bonded owner transfers immediately, with X6 continuity).
  *Attack flag:* The only authority is the state diagram plus 'once a name is final' — no MUST sentence prohibits transferring provisional claims; pre-trading claims during the notice window is excluded only by inference and must be stated at promotion.
  *Attack flag:* Related unresolved design question: DESIGN.md §10.13 Q3 (free transfer vs transfer-friction for cheap-issued names) vs CONFORMANCE.md F4 claiming "'free transfer' decided" with no numbered decision — see crossAreaNotes; could alter this rule for accumulator names.

- **X12.** The transfer-acceptance predicate MUST be identical for accumulator-finalized and auction-settled names, except that the bond conjuncts (X6, X7) apply only to immature bonded names; no transfer rule may branch on acquisition origin otherwise.
  *Sources:* `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Owner-Key Control (candidate) — "The owner-key model should not depend on whether the name came from an uncontested accumulator claim or a contested L1 auction.".
  *Verdict:* ~~cited~~ → **candidate-stays** (step-2 correction).
  *Step-2 correction:* Same lone candidate 'should' sentence as V14, plus the tranche's own logged doc-status conflict (CONFORMANCE.md F4 claims 'free transfer decided' with no DECISIONS entry; DESIGN.md §10.13 Q3 holds transfer-friction open). Downgraded, rail-scoped, pending the reconciling named decision — matching the merge's own proposedResolution.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:335-438 — counter-evidence: the legacy engine only ever transfers auction-derived records; accumulator-name transfers have no implementation at all`.
  *Proposed tests:*
    - (+) Property: an accumulator-final name and a mature auction name with the same owner key and state head produce identical verdicts for identical Transfer event bytes.
    - (+) An accumulator-finalized name accepts an owner-signed transfer end-to-end (impossible in legacy code — a new-kernel-only test).
    - (−) No code path exists where acquisition origin (outside maturity/bond state) changes a transfer verdict (predicate-surface audit).
  *Attack flag:* 'should not depend' is soft language for a kernel invariant — promotion must restate it as MUST.
  *Attack flag:* This rule is unsatisfiable for the batched path until the accumulator-name initial state head gap is closed (see gaps): without a defined head, an accumulator name's first transfer cannot satisfy X4 at all.

- **X13.** An applied Transfer MUST cancel any pending recovery request on the same name (the owner key's direct action supersedes an in-flight recovery, and the voided recovery MUST NOT later complete).
  *Sources:* `docs/DESIGN.md` 10.13 Open Questions To Settle Next (item 1) — "Still to spec: the tx + the transfer-resets-arming rule."; `docs/spec/CONFORMANCE.md` 3. Functional requirements — F6 Recover (candidate) — "prototyped in recovery-sim.ts (thief-can't-steal, owner-recovers, prior-owner-can't-recover-transferred)".
  *Verdict:* **candidate-stays**.
  *Assembly patch: critic found X13 (same-block transfer-vs-invoke ordering) missing its recovery-auth flag — added; finalizes with Decision #50 ratification.*
  *Needed spec work:* The 'transfer-resets-arming rule' spec PR that DESIGN.md §10.13 explicitly names as still-to-spec: define the transfer↔pending-recovery interaction (cancellation of an in-flight request, and whether a transfer also disarms the recovery descriptor) inside B2 recovery-authority hardening. Legacy behavior (withoutPendingRecovery on every applied transfer) is the only complete statement today.
  *Blocked on decision:* `recovery-auth`.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:399,421 (withoutPendingRecovery on both transfer paths); 711-714`.
  *Proposed tests:*
    - (+) Transfer applied during a recovery challenge window removes the pending recovery from state.
    - (−) The voided recovery's completion at challenge-window expiry: no state change.
    - (−) Prior owner's recovery artifacts cannot move the name after a transfer (mirrors recovery-sim's prior-owner-can't-recover-transferred case).
  *Attack flag:* Double-edged: a thief holding the stolen owner key can transfer-away to void the true owner's in-flight recovery. Whether transfers are restricted during a challenge window is exactly recovery-auth territory — extracting the legacy behavior must not pre-decide that ruling.

- **X14.** On an applied Transfer, value-record authority MUST move to the new owner key and the prior owner's current value record is cleared by default; any preserve behavior is an explicit opt-in signal and MUST NOT be the default.
  *Sources:* `docs/core/DECISIONS.md` Decision Log #17 Off-chain destination authentication — "On ownership transfer, destination authority moves to the new owner key."; `docs/core/DECISIONS.md` Decision Log #18 Destination behavior on transfer — "On transfer, the current off-chain destination record is cleared by default."; `docs/core/DECISIONS.md` Decision Log #18 Destination behavior on transfer — "A transfer format may support an explicit preserve signal, but preserve is not the default behavior.".
  *Verdict:* **cited**.
  *Proposed tests:*
    - (+) After a transfer, a fresh value record signed by the new owner with sequence 1 and no previous-record hash is the valid head of the new interval.
    - (−) Any prior-owner-signed value record (any sequence) verifies as stale after the transfer and cannot become current.
    - (−) Absent a spec-defined preserve signal, no transfer flag bit causes the old record to carry over.
  *Attack flag:* #18's 'explicit preserve signal' has no defined carrier — the Transfer flags byte is the obvious slot but no flag registry exists (see gaps); until a named decision defines one, every flag bit must mean no-preserve, fail-closed.

- **X15.** The transfer verdict MUST be a deterministic pure function of (the event bytes, the carrying transaction's inputs/outputs/txid, its block height on the canonical chain, and prior name state); it MUST NOT consult wall-clock time, network state, a database, or any input outside those witnessed facts.
  *Sources:* `docs/core/SOFTWARE_CANON.md` Layer vocabulary — L2 ownership kernel (ratified) — "every rule that decides name state, as pure deterministic predicates ... No DB, no network, no clock, no UI"; `docs/core/SOFTWARE_CANON.md` The boundary rule — "it lives in the kernel, as a pure predicate over witnessed inputs"; `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Design Rule (candidate) — "Ownership is the deterministic result of Bitcoin ordering, ONT validity rules, public notice, and owner-key signatures.".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:335-438 (already pure over state + transaction + height)`.
  *Proposed tests:*
    - (+) Property: identical (event, carrying tx, height, prior state) yields the identical verdict across runs and across independent implementations.
    - (+) Structural: zero I/O imports in the transfer module, enforced by the B2 research-quarantine-style boundary test.
    - (−) Verdict is independent of map iteration order / insertion history of unrelated names (guards the X4 ambiguity class).

**Gaps — Transfer authority duties with no spec text at all:**

- Transfer flags(1) bit registry: no spec text defines any transfer flag bit, nor whether unknown bits reject (fail-closed) or pass. The byte sits inside the signed §5 digest yet legacy code never inspects it (packages/protocol/src/wire.ts:123; no check in engine.ts applyTransfer). DECISIONS #18 names a future 'explicit preserve signal' without defining one. Kernel duty with zero spec text.
- Initial state head of an accumulator-finalized name: no spec text says what prevStateTxid the first transfer of a batched-final name must reference — no per-name txid exists (the anchor txid is shared by the whole batch). No legacy implementation exists either (the legacy engine transfers only auction-derived records). Blocks X4/X12 for the batched path; the producing transition belongs to tranche-1 B*.
- Qualifying-bond-output predicate: no doc defines which output script shapes count as a successor bond output for X6/X7 (legacy uses scriptType === 'payment', engine.ts:378). The kernel needs an objective chain-fact predicate; DECISIONS #5 states only existence and amount.
- Same-transaction event multiplicity and order: no spec text on whether one Bitcoin transaction may carry multiple ONT events (two Transfers, or a Transfer plus RecoverOwner) and in what order they apply; legacy applies them in extraction order (engine.ts:284-286). Affects X5 first-wins and X7 outpoint contention.
- Mature-transfer batchability: DESIGN.md §5 says a mature/accumulator transfer is 'batchable through the same path in the target design', but no spec text defines a Transfer riding the batched path (head semantics, anchor linkage, DA exposure). If intended, it needs full spec; if not, the spec should say transfers are L1-only events.


Tranche 3 — gap-closure areas (commissioned by the combined critic; cross-area notes inline, no separate merge pass):

### Winner selection and bid acceptance (Q*)

- **Q1.** An AuctionBid MUST be accepted as the opening bid of a name's auction if and only if no accepted bid for that lot precedes it and its bidAmountSats is greater than or equal to the name's opening floor (Q2), with every other acceptance clause (Q3, Q4, Q12-Q15) also satisfied; a qualifying opening bid is what creates the auction — no auction exists for a lot until one is accepted.
  *Sources:* `docs/spec/AUCTION.md` Opening Bond Floors — "The opening bid must meet the higher of two floors"; `docs/spec/AUCTION.md` Real Mechanism Choices (normative shape) — "the current user-started launch story should not describe unopened names as failed auctions; a valid bonded opening bid is what creates the auction"; `docs/core/DECISIONS.md` Decision Log #37 Bond opens the auction — "A qualifying bond — posted against an existing claim, or **bond-first** with no prior claim → opens the L1 auction; **largest bond wins**."; `docs/GLOSSARY.md` bond — "A **qualifying bond** (at or above the bond floor) is the only thing that opens an auction (Decision #37); the largest bond wins."; `docs/LAUNCH.md` Legacy Scheduled-Catalog Compatibility State — "In the user-started model, no auction exists until a valid bonded opening bid confirms.".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/core/src/experimental-auction.ts:455-516 (opening-bid acceptance; below_opening_minimum reject)`.
  *Proposed tests:*
    - (+) A bid exactly at the opening floor, satisfying all other clauses, is accepted and the auction exists from its confirmation height.
    - (−) A bid one satoshi below the opening floor is not accepted; no auction exists for the lot afterward (the unopened state is 'no auction', not a failed auction).
    - (−) With zero accepted opening bids by the relevant deadline, winner selection (Q9) is undefined for the lot — no path awards the name through the auction machinery.
  *Attack flag:* AUCTION.md's floor sentence read alone suggests floor satisfaction suffices; the acceptance predicate is a conjunction (floor AND bond binding AND lot binding AND timing AND rebid mechanics) and must be stated as one predicate in one place, or an implementer will accept a floor-meeting bid with a phantom bond output

- **Q2.** The opening floor for a name MUST be computed as max(lengthPrice(L), longNameMinimum), where L is the byte length of the canonical name (WIRE_FORMAT §2), lengthPrice starts at the 1-character price and halves for each additional character, and both the 1-character price and longNameMinimum are launch-freeze consensus parameters passed to the kernel (placeholders today: ₿100,000,000 at 1 character; ₿50,000 long-name minimum).
  *Sources:* `docs/spec/AUCTION.md` Opening Bond Floors — "Length price: starts at ₿100,000,000 (≈1 BTC) for a 1-character name and halves for each additional character."; `docs/spec/AUCTION.md` Opening Bond Floors — "Long-name minimum: ₿50,000. Once the length price falls below this, the minimum applies."; `docs/core/STATUS.md` Launch parameters (auction + notice mechanics) — "Opening-bid floor | higher of the length price (₿100,000,000 at 1 char, halving per char) and the ₿50,000 long-name minimum (lengths 12–32) | placeholder".
  *Verdict:* **cited**.
  *Needed spec work:* Launch-freeze: exact floor values are STATUS placeholders and cannot pass candidate (inventory rule) — the rule is parameterized over (openingPriceAt1Char, longNameMinimum). A named spec PR must also pin the halving rounding direction (AUCTION.md's ₿195,312 at length 10 matches floor division only) and resolve the open review question whether reopened auctions reset to the length floor (STATUS's reauction row says floor resets; AUCTION.md lists it as open).
  *Legacy evidence (never authority):* `packages/protocol/src/bond.ts:8 (getBondSats curve); packages/core/src/auction-policy.ts:60-76 (max of curve and openingFloorSats)`.
  *Proposed tests:*
    - (+) Floors for lengths 1, 10, 11, 12, and 32 equal AUCTION.md's table values under the placeholder parameters (pins rounding at length 10).
    - (−) For a length-12 name, a bid meeting the length price but below the long-name minimum is not accepted as an opening bid.
    - (+) Property: under two distinct (openingPriceAt1Char, longNameMinimum) parameterizations, the kernel's floor function follows max(halving curve, minimum) with no baked constant.
  *Attack flag:* Unpinned rounding of the halving curve (floor vs ceiling at length 10: ₿195,312 vs ₿195,313) is a consensus split between independent implementations
  *Attack flag:* The floor must key off canonical name byte length; this is only unambiguous because WIRE_FORMAT §2 rejects non-canonical name bytes — cite, do not re-derive

- **Q3.** An AuctionBid MUST NOT be accepted unless its bid transaction contains an output at index bondVout (the payload's declared bond output) whose value in satoshis equals bidAmountSats exactly; the declared bid amount and the posted on-chain bond value are one number — a bid declaring more than its bond posts, or posting more than it declares, is not accepted.
  *Sources:* `docs/LAUNCH.md` Implementation And Validation Status — "Returnable bond output + OP_RETURN bid payload, engine-validated (bond value = bid at `bondVout`)"; `docs/spec/WIRE_FORMAT.md` 4.3 AuctionBid — up to 184 bytes — "frame ‖ `flags`(1) ‖ `bondVout`(1) ‖ `settlementLockBlocks`(u32) ‖ `bidAmountSats`(u64) ‖ `ownerPubkey`(32)"; `docs/spec/CONTESTED_AUCTION_REFERENCE.md` Core Rule — "every bid backed by real bitcoin capital".
  *Verdict:* **cited**.
  *Needed spec work:* The equality predicate exists in docs only as a LAUNCH.md implementation-status note; promote it into AUCTION.md mechanism text, stating exact equality (not at-least) and the missing-output case (no output at bondVout ⇒ not accepted). WIRE_FORMAT §4.3 is the normative field shape; the binding to transaction outputs is the kernel rule to write.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:298-333 (applyAuctionBid: auction_bid_missing_bond_output, auction_bid_bond_output_not_payment, auction_bid_bond_value_mismatch)`.
  *Proposed tests:*
    - (−) Payload bidAmountSats one satoshi above the bondVout output value ⇒ not accepted.
    - (−) Payload bidAmountSats one satoshi below the bondVout output value ⇒ not accepted.
    - (−) Declared bondVout index with no corresponding transaction output ⇒ not accepted.
    - (+) Output value exactly equal to bidAmountSats at the declared bondVout ⇒ bid passes this clause.
  *Attack flag:* If 'at least' replaced 'equals exactly', a bidder could post one oversized output and later claim the same output backs a larger rebid without new capital; exact equality plus one-bond-output-per-bid closes this — the spec text must say 'equals exactly'

- **Q4.** The output at bondVout MUST be a spendable payment output (a key-addressed script class the spec enumerates), and an AuctionBid whose declared bond output is a data-carrier or provably unspendable output MUST NOT be accepted.
  *Sources:* `docs/GLOSSARY.md` bond — "Bonds are locked, not spent — returnable after release — and are an ONT-level designation over a plain output, enforced by the audited core, not by Bitcoin script."; `docs/LAUNCH.md` Implementation And Validation Status — "Returnable bond output + OP_RETURN bid payload".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* No spec text defines which script classes qualify as a bond output. GLOSSARY's 'returnable' implies spendable, but the kernel needs an exact predicate (legacy: scriptType === 'payment'). Named spec PR: enumerate qualifying script classes and state that OP_RETURN/known-unspendable outputs at bondVout reject.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts:313-319 (bondOutput.scriptType !== "payment" ⇒ ignored)`.
  *Proposed tests:*
    - (−) bondVout pointing at the OP_RETURN data output ⇒ not accepted.
    - (−) bondVout pointing at a provably unspendable script with value equal to the bid ⇒ not accepted.
    - (+) bondVout pointing at a standard payment output (e.g. P2TR/P2WPKH) ⇒ bid passes this clause.
  *Attack flag:* A bid whose bondVout points at the OP_RETURN payload output itself (or any unspendable script) passes a naive 'output exists with matching value' check while posting a bond that can never be released, moved, or spent for a rebid — breaking the returnability premise and the S* bond-continuity rules downstream

- **Q5.** Once an auction has an accepted leader, a later bid outside the soft-close window MUST NOT be accepted unless bidAmountSats is greater than or equal to the normal required minimum, computed from the current highest accepted bid as max(leader + ABS_RAISE, ceil(leader × (1 + PCT_RAISE))) and in all cases strictly greater than the leader, where ABS_RAISE and PCT_RAISE are launch-freeze consensus parameters (placeholders: ₿1,000 and 5%).
  *Sources:* `docs/core/DECISIONS.md` Decision Log #35 Contested auction family — "normal bids must clear `max(0.00001 BTC, 5%)`"; `docs/spec/AUCTION.md` Bid Escalation — "| Normal minimum raise | max(₿1,000, `5%`) |"; `docs/core/STATUS.md` Launch parameters (auction + notice mechanics) — "Minimum raise (normal) | max(₿1,000, **5%**) | placeholder".
  *Verdict:* **cited**.
  *Needed spec work:* Launch-freeze the two values (placeholders cannot pass candidate). The doc shorthand 'max(₿1,000, 5%)' states neither the base of the percentage, the rounding direction, nor strict-vs-non-strict comparison; legacy computes max(leader + abs, ceil(leader × 10500 / 10000)), accepts ≥ the minimum, with a guard that the minimum strictly exceeds the leader. Pin this exact formula by named spec PR.
  *Legacy evidence (never authority):* `packages/core/src/auction-policy.ts:78-97 (calculateLaunchAuctionMinimumIncrementBidSats); packages/core/src/experimental-auction.ts:524-554 (below_minimum_increment reject)`.
  *Proposed tests:*
    - (+) A bid exactly at the computed required minimum is accepted (pins ≥, not >).
    - (−) A bid one satoshi below the required minimum is not accepted.
    - (−) A bid equal to the current leader is not accepted (strict-exceed guard).
    - (+) Property: over arbitrary leader values and two distinct (ABS_RAISE, PCT_RAISE) parameterizations, the required minimum strictly exceeds the leader and equals max(leader+abs, ceil(leader×(1+pct))).
  *Attack flag:* Floor-rounding of the percentage term would let a bidder clear the published '5%' raise with strictly less than 5% — rounding must be ceiling or the stated percentage is a lie
  *Attack flag:* Comparison direction (accept at exactly the minimum vs strictly above) is consensus-relevant; if implementations disagree, the same transcript yields different accepted sets and different winners

- **Q6.** A bid inside the soft-close window MUST clear the stronger soft-close required minimum, computed exactly as Q5 but with the soft-close parameters (placeholders: ₿1,000 absolute, 10%); a bid inside the window that clears only the normal minimum MUST NOT be accepted, and the close height does not move.
  *Sources:* `docs/core/DECISIONS.md` Decision Log #35 Contested auction family — "soft-close bids must clear `max(0.00001 BTC, 10%)`"; `docs/core/DECISIONS.md` Decision Log #35 Contested auction family — "stronger minimum increments for bids that would extend the auction"; `docs/spec/AUCTION.md` Bid Escalation — "| Soft-close minimum raise | max(₿1,000, `10%`) |"; `docs/spec/AUCTION.md` Real Mechanism Choices (normative shape) — "bids that extend an auction during soft close should face a stronger minimum increment than ordinary mid-auction bids".
  *Verdict:* **cited**.
  *Needed spec work:* Launch-freeze the values; same formula pinning as Q5. Also pin the trigger: AUCTION.md's timing table keys the stronger increment off position (inside the final soft-close window) while #35 keys it off effect ('bids that would extend'); the two coincide only because, under the Q7 extension formula, every accepted in-window bid extends — the spec must state one normative trigger (position-based recommended) rather than relying on that derived equivalence.
  *Legacy evidence (never authority):* `packages/core/src/auction-policy.ts:83-88 (soft-close parameter selection); packages/core/src/experimental-auction.ts:519-528`.
  *Proposed tests:*
    - (+) An in-window bid at the soft-close minimum is accepted and the close extends.
    - (−) An in-window bid clearing the normal minimum but below the soft-close minimum is not accepted and the close height is unchanged.
    - (+) An out-of-window bid clearing only the normal minimum is accepted (the stronger increment applies only inside the window).
  *Attack flag:* If the trigger were effect-based and extension ever became optional or capped, a sniper could bid in-window at the weaker normal increment while claiming non-extension; a position-based trigger removes the ambiguity

- **Q7.** When a bid is ACCEPTED at height hb inside the final SOFT_CLOSE_BLOCKS blocks of the current close height, the close height MUST move to max(currentClose, hb + SOFT_CLOSE_BLOCKS); extensions are extend-only (the close height is non-decreasing), there is no hard cap on the number of extensions, and a bid that is not accepted MUST NOT move the close height.
  *Sources:* `docs/spec/AUCTION.md` Auction Timing — "Bid inside the final `144` blocks moves close to bid block + `144`"; `docs/spec/AUCTION.md` Auction Timing — "| Hard cap on extensions | None | N/A |"; `docs/core/DECISIONS.md` Decision Log #35 Contested auction family — "no hard extension cap in the current design; a cap would create a known final edge and reintroduce sniping pressure"; `docs/core/STATUS.md` Launch parameters (auction + notice mechanics) — "Soft-close window / extension | **144 blocks (~1 day)**; a bid inside the final 144 blocks moves close to bid block + 144 | placeholder".
  *Verdict:* **cited**.
  *Needed spec work:* Launch-freeze SOFT_CLOSE_BLOCKS (placeholder 144; launch-era schedule per AUCTION.md Window Schedule). Pin the window boundary inclusivity ('inside the final 144 blocks' is boundary-ambiguous; legacy treats hb ≥ close − 144 as in-window) and state the max() extend-only form explicitly (currently only implied by 'moves close to bid block + 144').
  *Legacy evidence (never authority):* `packages/core/src/experimental-auction.ts:519-561 (extension applied only on the accepted path); packages/core/src/auction-policy.ts:100-110 (isLaunchAuctionSoftCloseWindow)`.
  *Proposed tests:*
    - (+) An accepted bid at height close − 1 moves the close to (close − 1) + SOFT_CLOSE_BLOCKS.
    - (−) A rejected (below-soft-close-minimum) bid inside the window leaves the close height unchanged.
    - (−) An accepted bid strictly before the window start leaves the close height unchanged.
    - (+) Property: close heights are non-decreasing over every bid sequence (extend-only).
  *Attack flag:* Only accepted bids may extend: if rejected bids extended the close, a griefer could hold an auction open forever with below-minimum dust bids at zero bond cost — the negative test is mandatory
  *Attack flag:* A boundary off-by-one (close − 144 vs close − 143 as window start) is a consensus split and also shifts which increment (Q5 vs Q6) applies at the boundary height

- **Q8.** A bid from a bidder (identified by bidderCommitment) who already has a standing accepted bid in the auction MUST NOT be accepted unless the new bid transaction spends the prior bid-bond outpoint; an accepted replacement creates one new bond output for the full new bid amount, the prior bond is consumed by the replacement transaction and is never separately released, and the replaced bid ceases to be the bidder's standing bid.
  *Sources:* `docs/core/DECISIONS.md` Decision Log #35 Contested auction family — Current rebid shape — "a same-bidder rebid can replace that bidder's prior bid only if the new transaction spends the prior bid-bond output"; `docs/core/DECISIONS.md` Decision Log #35 Contested auction family — Current rebid shape — "the new transaction creates one new bid bond for the full new bid amount"; `docs/core/DECISIONS.md` Decision Log #35 Contested auction family — Current rebid shape — "the prior bond is not separately released during the rebid; it is consumed by the replacement transaction"; `docs/spec/AUCTION.md` Real Mechanism Choices (normative shape) — "same-bidder rebids should replace earlier bids by spending the earlier bond outpoint".
  *Verdict:* **cited**.
  *Needed spec work:* Named spec PR must define bidder identity: either bind bidderCommitment to something unforgeable/unmintable (a key, or the bond-outpoint chain itself) or restate replacement as purely outpoint-based (any bid spending a standing bid-bond outpoint replaces that bid, regardless of bidderCommitment); and decide the self-raise increment question explicitly.
  *Legacy evidence (never authority):* `packages/core/src/experimental-auction.ts:429-453 (prior_bid_not_replaced reject), 563-572 (replaced_by_self_rebid), 1025-1032 (didObservationSpendStandingBond)`.
  *Proposed tests:*
    - (+) A rebid spending the prior bid-bond outpoint and clearing the required minimum is accepted; the prior bid is marked replaced and is no longer the bidder's standing bid.
    - (−) A bid with the same bidderCommitment that does NOT spend the prior bid-bond outpoint is not accepted, and the prior standing bid is unchanged.
    - (−) A replacement bid below the required minimum is not accepted and the prior standing bid remains standing (the failed replacement consumes nothing).
    - (−) Documented-hole vector: two standing bids funded by one wallet under two distinct bidderCommitments are both accepted under the rule as written — pinned as the gameable behavior the Q8 spec PR must close.
  *Attack flag:* 'Same bidder' is decided solely by bidderCommitment equality, and bidderCommitment is sha256 over an arbitrary uncommitted bidderId text (WIRE_FORMAT §6) bound to no key, signature, or UTXO — one economic actor trivially evades the rule with a fresh bidderId per bid and holds multiple standing bids (e.g. shill-raising the required minimum, then abandoning the decoy bond); as written the rule constrains only honest self-identifying bidders
  *Attack flag:* Docs are silent on the self-raise case: a replacement by the CURRENT LEADER must still clear the Q5/Q6 minimum over their own leading bid (legacy enforces this), otherwise a leader could re-time the soft close with a +1-sat self-rebid

- **Q9.** When an auction settles, the winner MUST be the accepted bid with the largest bidAmountSats in the auction's complete transcript ('largest bond wins'; 'the highest accepted bid becomes the winner'); a bid that was not accepted MUST NOT be selected regardless of its amount; if two otherwise-tied accepted bids confirmed in the same block, the bid earlier in the block's transaction order wins (Decision #25 — extracted as Z3, consumed here, not re-extracted).
  *Sources:* `docs/core/DECISIONS.md` Decision Log #37 Bond opens the auction — "opens the L1 auction; **largest bond wins**"; `docs/LAUNCH.md` Auction Settlement Becomes Ownership — "the highest accepted bid becomes the winner"; `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Contested Auction — "It is opened by a bond, and the **largest bond wins**."; `docs/core/STATUS.md` Components — Contested-auction bonded bid — "Proof bundle now enforces **highest-bid-wins** + **distinct-bid** well-formedness (was a gap).".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/core/src/experimental-auction.ts:611-660 (winner = final currentLeader at settle); packages/core/src/indexer.ts:1074-1140 (reconcileExperimentalAuctionOwnedNames winner materialization)`.
  *Proposed tests:*
    - (+) Among accepted bids, the largest amount wins and its bid identifies the winner (txid, bondVout, ownerPubkey handed to S*).
    - (−) A larger-amount bid that was rejected at acceptance time (e.g. a rebid that did not spend the prior bond outpoint) does not win; the largest ACCEPTED bid does.
    - (−) Cross-area with T*: removing one accepted bid from the transcript makes the completeness predicate fail rather than selecting a different winner.
    - (+) Property: the selected winner is invariant under permutation of bid arrival order given identical chain-ordering facts (block height, tx index), per the Item 5 reorg/permutation gate.
  *Attack flag:* Under open-ascending with enforced increments the largest accepted bid is necessarily the last accepted bid, so 'largest' and 'latest' coincide; if any future rule admits an accepted bid at or below the leader, the two selection rules diverge — the spec must state 'largest, ties per Decision #25' as the normative form and treat last-accepted as a derived property, not the definition
  *Attack flag:* Winner selection is only defined over a transcript T* has judged complete; the kernel predicate must take the T* completeness verdict as a precondition so an omitted-bid transcript can never award the next-lower bid

- **Q10.** A below-floor (or otherwise non-accepted) opening bid MUST NOT open an auction or create a contested state: the name's notice-window outcome (finalize / nullify) MUST be computed exactly as if the non-qualifying bid had never confirmed, and a non-qualifying bid MUST NOT count as a claim or collision toward nullification.
  *Sources:* `docs/GLOSSARY.md` bond — "A **qualifying bond** (at or above the bond floor) is the only thing that opens an auction (Decision #37)"; `docs/core/DECISIONS.md` Decision Log #37 Bond opens the auction — "One cheap claim, no bond by the deadline → finalizes (the long tail, unchanged)."; `docs/core/DECISIONS.md` Decision Log #37 Bond opens the auction — "When a contested name's auction window expires with **zero qualifying bonds**"; `docs/LAUNCH.md` Legacy Scheduled-Catalog Compatibility State — "In the user-started model, no auction exists until a valid bonded opening bid confirms.".
  *Verdict:* **cited**.
  *Proposed tests:*
    - (−) Single cheap claim plus one below-floor bid inside the notice window ⇒ the claim finalizes exactly as if the bid never existed.
    - (−) A below-floor bond-first bid with no prior claim ⇒ the name remains unowned and unclaimed; no auction, no contested state.
    - (+) An at-floor qualifying bond inside the window ⇒ the name is contested and the auction exists (the contrast case).
  *Attack flag:* A non-qualifying AuctionBid is neither a qualifying bond nor a claim — no doc states which bucket it falls into; without the explicit null-effect clause an implementer could count it as a colliding claim (wrongly nullifying a single honest claim) or as a weak contest — both are denial vectors cheaper than the floor

- **Q11.** A bid that fails any acceptance clause MUST contribute nothing to auction state: it does not become or change the leader, does not change the required minimum, does not extend or move the close height, does not replace or invalidate the bidder's standing bid, and is not in the accepted-bid set that winner selection (Q9) ranges over; its only permissible trace is as a rejected entry in evidence/transcript material.
  *Sources:* `docs/LAUNCH.md` Auction Settlement Becomes Ownership — "the highest accepted bid becomes the winner"; `docs/spec/CONTESTED_AUCTION_REFERENCE.md` Basic Flow — "each later bid must clear the current minimum".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* No spec text states the rejected-bid null-effect as a rule; the cited lines only imply it. AUCTION.md needs one sentence stating that a non-accepted bid has no effect on auction state, so every reject path in Q1–Q15 composes to 'nothing happened' — without it an implementer could let a rejected bid extend the soft close or bump the required minimum (both free grief vectors).
  *Legacy evidence (never authority):* `packages/core/src/experimental-auction.ts:311-609 (every rejected branch records an outcome and continues without touching currentLeader or finalAuctionCloseBlock)`.
  *Proposed tests:*
    - (−) Reject battery: for each reject reason (below floor, below normal minimum, below soft-close minimum, bond-value mismatch, missing bond output, non-payment bond output, rebid not spending prior bond, post-close, pre-eligibility, lot mismatch, settlement-lock mismatch, stale state commitment), auction state after the bid equals auction state before it, except for the rejected-entry record.
    - (+) Property: derived auction state over any bid sequence equals derived state over the subsequence of accepted bids only.
  *Attack flag:* If a rejected bid raised the required minimum or extended the close, below-minimum dust bids would be a zero-bond-cost denial tool against live auctions

- **Q12.** A bid confirmed at a height strictly greater than the auction's close height (the close as it stands after all prior accepted-bid extensions; close-height derivation is Z10, cross-area) MUST NOT be accepted; a bid on a reopened lot confirmed before that lot's release-anchored eligibility block MUST NOT be accepted.
  *Sources:* `docs/spec/AUCTION.md` Auction Timing — "| Base auction window | `1,008` blocks | ~7 days |"; `docs/spec/AUCTION.md` Auction Timing — "Bid inside the final `144` blocks moves close to bid block + `144`"; `docs/LAUNCH.md` Released-Name Reauction Path — "The indexer only recognizes a reopened auction if its anchor equals the latest recorded bond-break release block for that name.".
  *Verdict:* **cited**.
  *Needed spec work:* Launch-freeze the base window value (placeholder 1,008 blocks; launch-era schedule per AUCTION.md Window Schedule). Pin the close-boundary inequality in spec text: legacy settles when currentHeight > closeHeight, so a bid AT the close height is still in-window — AUCTION.md never states the inequality.
  *Legacy evidence (never authority):* `packages/core/src/experimental-auction.ts:351-401 (before_unlock and auction_closed rejects), 918-942 (settled when observation height > finalAuctionCloseBlock)`.
  *Proposed tests:*
    - (−) A bid confirmed at close + 1 is not accepted.
    - (+) An otherwise-valid bid confirmed exactly at the close height is accepted (and extends per Q7, being inside the final window).
    - (−) A bid on a reopen lot confirmed before the lot's release height is not accepted.
  *Attack flag:* An inclusive-vs-exclusive close off-by-one both splits consensus on which bids exist and shifts the Q7 soft-close trigger window by one block

- **Q13.** A bid MUST be counted toward exactly the auction whose lot commitment equals the bid's auctionLotCommitment (binding auctionId, canonical name, and unlockBlock per WIRE_FORMAT §6); the first auction of a name has auctionId `opening-{name}` with eligibility block 0 and a reopened auction has auctionId `reopen-{name}-after-{release_height}`, recognized only if its anchor equals the name's latest recorded bond-break release block; a bid whose lot commitment matches no recognized lot MUST NOT be accepted into any transcript.
  *Sources:* `docs/spec/WIRE_FORMAT.md` 6. Auction commitments — "auctionLotCommitment = sha256( lenPrefix("ont-auction-lot") ‖ lenPrefix(text(auctionId)) ‖ lenPrefix(name) ‖ lenPrefix(decimal(unlockBlock)) )"; `docs/LAUNCH.md` Released-Name Reauction Path — "first auction: `opening-{name}` with eligibility block `0`"; `docs/LAUNCH.md` Released-Name Reauction Path — "reopened auction: `reopen-{name}-after-{release_height}`"; `docs/LAUNCH.md` Released-Name Reauction Path — "The indexer only recognizes a reopened auction if its anchor equals the latest recorded bond-break release block for that name.".
  *Verdict:* **cited**.
  *Needed spec work:* Move the canonical auctionId grammar (opening-{name}, reopen-{name}-after-{release_height}) and the reopen-anchor recognition rule out of LAUNCH.md narrative prose into candidate spec text (AUCTION.md); add the cleartext-name/lot-commitment agreement requirement.
  *Legacy evidence (never authority):* `packages/core/src/experimental-auction.ts:226-235 (getExperimentalLaunchAuctionId), 288-290 (bids filtered by auctionLotCommitment equality)`.
  *Proposed tests:*
    - (+) A bid whose auctionLotCommitment matches the recognized lot is counted toward exactly that auction.
    - (−) A bid whose lot commitment matches no recognized lot (e.g. fabricated auctionId) appears in no transcript and affects no auction.
    - (−) A reopen-lot bid whose embedded release height is not the name's latest recorded bond-break release block is not recognized.
    - (−) A bid whose cleartext name disagrees with the lot-committed name is rejected (pending the agreement-rule spec PR).
  *Attack flag:* The lot commitment binds the name redundantly with the bid's cleartext name field (WIRE_FORMAT §4.3); the spec must require both to agree (or name one as binding) — a bid whose cleartext name and lot-committed name differ otherwise lets two readers disagree about which name was bid on
  *Attack flag:* auctionId is free text under a hash: only the opening-/reopen- naming convention makes lots canonical, and that convention currently lives in LAUNCH.md prose, not in AUCTION.md or the wire spec — an unrecognized but well-formed auctionId creates a phantom lot whose 'transcript' a hostile resolver could present

- **Q14.** A bid MUST NOT be accepted unless its declared settlementLockBlocks equals the auction lot's settlement-lock parameter (the per-lot value fixed from the consensus maturity parameter at lot creation); a bid declaring any other lock value is not accepted.
  *Sources:* `docs/spec/WIRE_FORMAT.md` 4.3 AuctionBid — up to 184 bytes — "frame ‖ `flags`(1) ‖ `bondVout`(1) ‖ `settlementLockBlocks`(u32)"; `docs/GLOSSARY.md` settlement lock — "the parameter implementing *maturity*: how long a winning bond stays locked after settlement (currently 52,560 blocks ≈ 1 year, a placeholder)".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* No spec text requires the bid's settlementLockBlocks to equal the lot parameter — the rule exists only in legacy code (settlement_lock_mismatch reject). Named spec PR must state the equality rule (or the rejected alternative that the winning bid's declared value binds), because S* maturity consumes the winner's lock value. The maturity value itself is a launch-freeze placeholder (52,560 blocks) and stays parameterized.
  *Legacy evidence (never authority):* `packages/core/src/experimental-auction.ts:325-349 (settlement_lock_mismatch reject)`.
  *Proposed tests:*
    - (−) A bid declaring settlementLockBlocks different from the lot parameter (including 0) is not accepted.
    - (+) A bid declaring exactly the lot's settlement-lock value passes this clause.
    - (−) Property over transcripts: no bid with a mismatching lock value can ever be selected by Q9 (it is never in the accepted set).
  *Attack flag:* Without the equality rule a winner could declare settlementLockBlocks = 0 and exit the bond immediately after settlement, gutting maturity and bond continuity (S*) while every honest bidder priced in the real lock — the highest-leverage unstated rule in this area

- **Q15.** A bid whose auctionStateCommitment does not equal the commitment (WIRE_FORMAT §6 construction) of the auction's derived pre-bid state MUST NOT be accepted.
  *Sources:* `docs/spec/WIRE_FORMAT.md` 6. Auction commitments — "`auctionStateCommitment = sha256( lenPrefix("ont-auction-state") ‖ lenPrefix(f₁) ‖ … ‖ lenPrefix(f₁₁) )` over exactly these eleven fields"; `docs/LAUNCH.md` Auction Settlement Becomes Ownership — "Each experimental `AUCTION_BID` carries the lot commitment, the observed pre-bid auction-state commitment, the bidder commitment, the bid amount".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* WIRE_FORMAT §6 (normative) defines the construction and LAUNCH.md describes the field, but no doc states the mismatch consequence — the reject exists only in legacy code (stale_state_commitment). Named spec PR must decide binding-vs-evidentiary. If binding: reconcile with Decision #25 (two same-block bids cannot both commit to each other's post-states — the later-in-block bid is stale by construction, making #25's 'otherwise tied' case near-unreachable and handing block-position power back to miners, the R16 family); also specify the matching window for the currentBlockHeight field (legacy quietly accepts a commitment matching ANY candidate height in a derived phase window — matchAuctionStateCommitmentWithinWindow — a loosening documented nowhere). If evidentiary: state what the commitment is for (transcript audit) so it is not dead weight.
  *Legacy evidence (never authority):* `packages/core/src/experimental-auction.ts:403-427 (stale_state_commitment reject), 980-1023 (matchAuctionStateCommitmentWithinWindow height-window matching)`.
  *Proposed tests:*
    - (−) A bid carrying a state commitment over a stale leader/minimum (one accepted bid behind) is not accepted (pins current behavior until the spec PR rules).
    - (−) Same-block competition vector: two valid competing bids in one block — the later-in-block bid is stale-rejected under the binding rule; pinned explicitly as the Decision #25 interaction the spec PR must resolve.
    - (+) A bid whose state commitment matches the derived pre-bid state (within the specified height-matching rule) is accepted.
  *Attack flag:* Binding mismatch-rejection lets the current leader grief competitors: every accepted bid invalidates all in-flight bids built against the prior state, and a leader can self-rebid (+minimum) just before close to stale-out a competitor's higher in-flight bid — interacts with Q7 extension timing and Decision #25
  *Attack flag:* The height-window matching loophole means the 'exact' commitment is actually satisfiable at many heights; whatever the spec decides, the matching predicate must be stated exactly or two implementations will disagree on acceptance

**Gaps — Winner selection and bid acceptance duties with no spec text at all:**

- Bidder identity is undefined in all docs: bidderCommitment is sha256 over arbitrary uncommitted bidderId text (WIRE_FORMAT §6) bound to no key, signature, or funds, yet the same-bidder rebid rule (DECISIONS #35) keys on it; one actor can hold multiple standing bids via fresh bidderIds. A named spec PR must define bidder identity or restate replacement as purely outpoint-based.
- No doc states the consequence of an auctionStateCommitment mismatch (binding reject vs evidentiary record); legacy rejects, and a binding rule conflicts with Decision #25's same-block tie scenario and creates a leader-side stale-out grief vector. Named spec PR required (see Q15).
- No doc requires a bid's declared settlementLockBlocks to equal the lot's settlement-lock parameter; the rule exists only in legacy code, yet S* maturity consumes the winner's declared value — a 0-lock winning bid would gut maturity (see Q14).
- No doc defines which transaction-output script classes qualify as a bid-bond output; GLOSSARY's 'returnable' implies spendable but the predicate is unstated (see Q4).
- The increment shorthand 'max(₿1,000, 5%)' leaves the percentage base, rounding direction, and strict-vs-non-strict comparison unstated, and the soft-close increment trigger is stated two non-identical ways (position-based in AUCTION.md timing, effect-based in DECISIONS #35); consensus formulas must be pinned in spec text (see Q5/Q6).
- The canonical auctionId grammar (opening-{name} / reopen-{name}-after-{release_height}) and the reopen-anchor recognition rule live only in LAUNCH.md narrative prose; they gate which bids count toward which lot and must move into candidate spec text in AUCTION.md (see Q13).
- WIRE_FORMAT §6's normative phase vocabulary (pending_unlock, awaiting_opening_bid) encodes the legacy scheduled-catalog lifecycle; under bond-opens (#37) user-started auctions the kernel needs a stated mapping from bond-opens states onto this enum (or a wire-normative amendment) — old-model leakage at a normative boundary.
- The close-height boundary inequality (bid AT the close height is in-window; the auction settles strictly after it) is stated nowhere in docs; legacy pins it in code only. Off-by-one here splits consensus and shifts the Q6/Q7 soft-close window (joint with Z10).

**Cross-area notes (Q*, rendered inline — no tranche-3 merge pass):**

- Same-block tie-break (Decision #25) is extracted as Z3 (tranche 2); Q9 consumes Z3's earlier-in-block-transaction-order rule and does not re-extract it.
- Close-height derivation at settlement is Z10 (tranche 2); Q7 defines how accepted bids move the close and Q12 consumes the resulting close height — Q7/Q12/Z10 must be reviewed together for the boundary inequality (gap above).
- T* (auction-transcript completeness, tranche 1) is a precondition of Q9: winner selection is defined only over a transcript T* judged complete; an omitted accepted bid is a T* failure, never a Q re-selection. STATUS's 'distinct-bid well-formedness' proof-bundle note is T*/B3 material, not a Q rule.
- S* (settlement-bonds, tranche 2) consumes Q9's winner as a given input: winner-becomes-owner (settlement-into-core #42), ownerPubkey binding, winning-bond-becomes-live-bond, maturity. Q14's settlement-lock equality is the joint Q/S input that pins S*'s maturity clock and must land in the same spec PR S* cites.
- The escalation trigger and notice-window verdict (qualifying bond inside the notice window vs bond-first; finalize/nullify/contest decided at anchorHeight + W_notice per DECISIONS #37) belong to the claim-lifecycle/notice-window rules (tranche-1 batched-path/transcript areas); Q rules begin once a lot exists — Q1/Q10 state only what qualifies or fails the opening bid itself.
- Bid wire well-formedness (frame, INCLUDES_NAME flag, canonical name bytes, sizes, full-width commitments) is B1-normative (WIRE_FORMAT §3-§6, wire-normative #48); a payload failing wire decode never reaches the Q predicates and is not a 'rejected bid' in the Q11 sense — it is not an ONT event at all.
- Aggregate gate-fee validation (F*, tranche 1) does not apply to bids: bids are standalone L1 transactions paying their own miner fees; no Q rule consumes F*.
- No Q rule depends on the RecoverOwner invoke-path signer, so recovery-auth (#50) imposes no blockedOnDecision in this area; da-windows (#49) likewise — bids are L1 events, not batched claims, so no data-availability deadline gates bid visibility (L1-completeness of the bid set vs the chain is the open STATUS Known-incomplete light-client item, owned by T*/B3).
- Loser-bond release after settlement and the winner-bond-spent-before-settlement case (legacy indexer skips winner materialization on spent_before_allowed_release) are S*/bond-continuity territory; Q9 selects the winner among accepted bids regardless of later bond-spend events.


### Kernel-wide glue (ordering, evidence deadlines, parameter surface) (G*)

- **G1.** When two or more competing AuctionBid events for the same name are confirmed in the same block and are otherwise tied under the auction rules, the kernel MUST award the tie to the bid appearing earlier in the block's transaction order; a later-ordered tied bid MUST NOT win.
  *Sources:* `docs/core/DECISIONS.md` Decision Log, entry 25 — Same-block auction tie-break rule [tier: ratified decision log] — "If two competing auction bids for the same name are confirmed in the same block and are otherwise tied under the auction rules, the bid appearing earlier in the block's transaction order wins.".
  *Verdict:* **cited**.
  *Proposed tests:*
    - (+) Two same-block AuctionBids for one name, equal under the tie predicate: the bid at the lower block transaction index wins; the derived owner matches it.
    - (−) An implementation that awards the later-ordered tied bid, or tie-breaks by txid/fee/hash instead of block transaction order, fails the vector.
    - (−) Tied bids in different blocks: #25's rule must NOT be invoked (earlier height resolves under the general auction rules, not the same-block tie rule); a kernel that applies tx-index ordering across blocks fails.
  *Attack flag:* 'otherwise tied under the auction rules' is defined nowhere: the tie predicate (equal bidAmountSats? two bids that each clear the prior minimum without having seen each other?) must be pinned, or implementations will disagree about when #25 even applies.
  *Attack flag:* A miner can place its own tied bid earlier in a block it mines; #25 accepts this for determinism/legibility, but the spec should say so explicitly — RISKS.md's 'tie-break gaming is low value' analysis (analysis tier) is argued for cheap-claim merge ties, not for bonded bid ties, where the tie winner does win the name.
  *Attack flag:* Whether the earlier-ordered tied bid resets the minimum-increment basis for later bids in the same block is order-dependent and presupposes the G2 total order; #25 alone does not answer it.

- **G2.** The kernel MUST define one total evaluation order over all ONT events of a single block across all event classes — Transfer (0x03), AuctionBid (0x07), RecoverOwner (0x09), RootAnchor (0x0b) — and derived name state MUST be the deterministic result of folding events in exactly that order: blocks in ascending height; transactions within a block in the block's transaction order; ONT events within one transaction in a defined intra-transaction order (G3); and bond-continuity invalidation for a transaction's spent inputs evaluated at one stated point relative to that transaction's events. A conforming implementation MUST NOT evaluate same-block events in any other order.
  *Sources:* `docs/core/SOFTWARE_CANON.md` Layer vocabulary, L2 ownership-kernel row [tier: ratified B0 plan] — "every rule that decides name state, as pure deterministic predicates — ordered, witnessed inputs in; name state out"; `docs/core/SOFTWARE_CANON.md` Item 5 — Inside-out phasing, B2 gate [tier: ratified B0 plan] — "property tests over event orderings (reorg/permutation invariance where the spec claims it)"; `docs/core/DECISIONS.md` Decision Log, entry 25 — Same-block auction tie-break rule [tier: ratified decision log; the only ordering fact any doc pins] — "the bid appearing earlier in the block's transaction order wins".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* Named spec PR (a kernel evaluation-order section, in ONT_ACQUISITION_STATE_MACHINE.md or a new B2 kernel spec) stating the total order: ascending height; block transaction order within a block (the order #25 already presupposes); intra-transaction order per G3; and the evaluation point of bond-continuity invalidation (legacy behavior: the spent-immature-bond set is snapshotted before the transaction's events and invalidation applied after them). Same-head transfer races (X5), same-transaction outpoint contention (X7/S13), same-block transfer-vs-recovery (X13/R16), and single-pendingRecovery (R13) all presuppose this order and cannot promote ahead of it.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts — applyBlockTransactionsWithProvenance (~lines 159-184) groups transactions by ascending blockHeight; applySingleBlockTransactions (~lines 258-296) walks transactions in the supplied block order, applies each transaction's ONT events, snapshots spent immature bonds before the transaction's events (collectSpentImmatureBonds) and runs invalidateBrokenBondContinuity after them.`.
  *Proposed tests:*
    - (+) Vector pair: the same two same-block conflicting events presented in both transaction orders, each pinned to its order's outcome (the pair documents that block order, and only block order, decides).
    - (−) An implementation that orders same-block events by txid, fee rate, or event-type precedence instead of block transaction order fails the vector pair.
    - (+) Permutation property: for same-block events touching pairwise-disjoint names, every interleaving produces identical derived state.
    - (−) Order-sensitivity confinement property: any pair of event sequences differing only in the order of events on disjoint names that produces different state is a conformance failure (order-sensitivity may exist only where events conflict).
  *Attack flag:* With no pinned order, two honest replayers can derive different owners from the same block whenever two same-block events touch one name — a fork with no attacker, the DA agreement's §3 hazard reproduced inside a single block.
  *Attack flag:* Miner ordering power over same-block conflicting events (transfer-vs-transfer on one head, transfer-vs-recovery) is unanalyzed: RISKS.md's 'ordering buys nothing' argument covers claims and bids, not owner-event races.

- **G3.** The spec MUST state whether one Bitcoin transaction may carry more than one ONT event. If multiple events per transaction are valid, the kernel MUST evaluate them in ascending output index (vout), and same-transaction conflicts (two events naming the same successor bond outpoint, or two events touching one name) MUST resolve deterministically under that order. If multiple events are not valid, a transaction carrying more than one ONT OP_RETURN payload MUST have one uniform disposition (reject-all or first-only), applied identically by every conforming kernel.
  *Sources:* `docs/core/SOFTWARE_CANON.md` Layer vocabulary, L2 ownership-kernel row [tier: ratified B0 plan] — "ordered, witnessed inputs in; name state out"; `docs/spec/WIRE_FORMAT.md` §3 Event frame [tier: normative — defines per-payload framing only; per-transaction multiplicity is unstated] — "Every ONT OP_RETURN payload begins with the 5-byte frame".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* Same evaluation-order spec PR as G2. It must also rule the interaction with the wire reject rules: when one transaction carries a valid event plus an undecodable payload, is the transaction poisoned or the bad payload skipped — legacy silently skips, which lets strict and lenient decoders see different event sets from one transaction.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts — extractOntEvents (~lines 126-147) flatMaps every OP_RETURN output in vout order and silently drops payloads that fail decode; multiple events per transaction are accepted and applied in vout order.`.
  *Proposed tests:*
    - (+) A transaction carrying two valid ONT events is evaluated in ascending vout order (or rejected whole, per the ruling); the vector pins exactly one outcome.
    - (−) A transaction with two events claiming the same successor bond vout: the pinned single outcome (deterministic winner or whole-transaction reject) — any other result fails.
    - (−) A transaction with one valid event plus one undecodable ONT-magic payload: the pinned uniform disposition — implementations that diverge (skip vs poison) on either side of the pin fail.
  *Attack flag:* Silent skip of undecodable payloads inside a transaction that also carries a valid event means a borderline payload (e.g., one decoder build accepts, another rejects) changes the evaluated event set — a convergence break smuggled in below the event level.
  *Attack flag:* Same-transaction outpoint contention (two events declaring the same successorBondVout) is an undefined input to X7/S13's bond-outpoint reservation rule until this rule exists.

- **G4.** Every height-triggered transition the kernel owns — notice-window close (finalize / nullify / escalate), auction close and soft-close extension expiry, pending-recovery finalization at requestedHeight + challengeWindowBlocks, bond maturity, and the DA verdicts eligibleAt/includable/holdsPriority — MUST be specified to take effect at a single stated point relative to the evaluation of the trigger-height block's events, and every deadline comparison MUST use one stated boundary convention: inclusive deadlines ('by h+X' means height <= h+X) and eligibility H >= h+K per §6e S2, extended explicitly to the non-DA windows or explicitly varied per window.
  *Sources:* `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` §6e Window algebra — S2 [tier: candidate; da-windows (#49) provisional pending DK, merged to main] — ""By h+X" means "at a height <= h+X"; a witness at the deadline height exactly is in-window. Eligibility: eligibleAt(anchor, H, K) := H >= h+K."; `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` Bond opens the auction; a bare collision can only nullify [tier: candidate] — "Both outcomes are deadline-derived (a verifier observes, at currentHeight >= anchorHeight + W_notice, whether a qualifying bond landed)."; `docs/core/SOFTWARE_CANON.md` Item 5 — Inside-out phasing, B2 gate [tier: ratified B0 plan] — "property tests over event orderings (reorg/permutation invariance where the spec claims it)".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* The evaluation-order spec PR must rule, per transition class: does the transition apply before or after the trigger-height block's events (legacy answers exactly one case — a recovery cancel mined at finalizeHeight is rejected, i.e., transition-first at the boundary); and must extend the §6e inclusive convention to W_notice, auction close, soft-close extension, maturity, and challengeWindowBlocks, or state a divergent convention per window explicitly. Until then every '>=' vs '>' in a non-DA window is implementation folklore.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts — refreshDerivedState (~lines 186-218) finalizes pendingRecovery at currentHeight >= finalizeHeight in a separate derived-state pass whose ordering vs block-event application is caller-defined, not kernel-defined; applyRecoverOwnerCancel (~line 591) rejects a cancel with event.blockHeight >= finalizeHeight.`.
  *Proposed tests:*
    - (+) Boundary triples (deadline-1 / deadline / deadline+1) for each transition class: notice close, auction close, soft-close extension, recovery finalization, maturity — each height pinned to one outcome.
    - (−) A RecoverOwner cancel mined at exactly finalizeHeight must take the pinned outcome (legacy: rejected, transition-first); an implementation on the other side of the boundary fails.
    - (−) Same-height transition-vs-event vector: a Transfer signed by the pre-recovery owner in the finalize-height block — exactly one of accept/reject is pinned; both behaviors passing is a suite failure.
    - (+) The h+K-1 / h+K eligibility pair and the h+W / h+W+C boundary vectors (§6e mandated; the DA instances are owned by the D*/Z* areas — included here only as the convention's reference instances).
  *Attack flag:* A veto (cancel) mined in the finalize-height block is the owner's last-block defense: an off-by-one disagreement between implementations here is a recovery-theft window.
  *Attack flag:* Whether a bid mined exactly at the close height extends the soft close decides auctions at the boundary; the soft-close text ('a bid inside the final 144 blocks') does not say whether the close-height block is inside.
  *Attack flag:* A transfer in the recovery-finalize block has two plausible authorizing keys (pre-recovery owner vs recovered owner) depending on whether the transition applies before or after the block's events.

- **G5.** Where the spec claims order-independence — disjoint batched-path insertions — the kernel verdict MUST be invariant under permutation of batch arrival and merge order; everywhere the spec does not claim order-independence, conformance MUST NOT assume it, and the B2 suite MUST carry property tests over event orderings that pin both halves: invariance where claimed, documented order-sensitivity where not.
  *Sources:* `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` §5 The key decomposition [tier: candidate] — "Disjoint insertions commute (proved in delta-merge-sim.ts): the root is a function of the set of leaves, not the order or arrival time."; `docs/core/SOFTWARE_CANON.md` Item 5 — Inside-out phasing, B2 gate [tier: ratified B0 plan] — "property tests over event orderings (reorg/permutation invariance where the spec claims it)"; `docs/GLOSSARY.md` first-anchor-wins [tier: candidate] — "Ordering inside a window never awards a contested name (bonds do).".
  *Verdict:* **cited**.
  *Proposed tests:*
    - (+) Permutation property: N batches inserting pairwise-disjoint names, evaluated in every permutation of arrival/merge order, produce one identical root and name state.
    - (−) Two batches claiming the same name inside a live window: permuting arrival order must not change the outcome class (collision/nullify per the B*-owned merge rule); an implementation whose outcome class flips with arrival order fails.
    - (−) An implementation whose derived root for disjoint-name batches depends on arrival order (e.g., list-fold sensitive accumulator) fails the permutation sweep.
  *Attack flag:* The commutativity claim's proof lives in a research simulation (analysis-tier evidence, packages/core/src/research/delta-merge-sim.ts); the B2 property test is what turns the claim into law — if any conflicting-leaf edge falsifies it, the spec text must change by named PR, not the test soften.

- **G6.** A non-cancel RecoverOwner anchored at height h_r MUST be evaluable only against a witnessed-evidence verdict over its referenced evidence objects — the recovery descriptor whose digest equals the event's recoveryDescriptorHash (WIRE_FORMAT §8.2) and the recovery wallet proof (WIRE_FORMAT §8.3) — and that evidence MUST be demonstrably witnessed/served at a height <= h_r + W_r for a consensus parameter W_r, measured on the §6e clock (h_r is the mined height of the RecoverOwner's containing block on the evaluator's current best chain, re-derived on reorg) with inclusive boundaries; evidence first witnessed after the deadline MUST NOT make the event evaluable retroactively, and absence at the deadline MUST yield the same fail-closed verdict for every honest evaluator.
  *Sources:* `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` §6e Window algebra — S1/S2/S4 [tier: candidate; da-windows (#49) provisional pending DK — the machinery this rule parameterizes on] — "All windows are measured in Bitcoin block heights from h, the mined height of the anchor's containing block in the evaluator's current best chain. On reorg, h re-derives from the new containing block; every deadline moves with it."; `docs/core/SOFTWARE_CANON.md` The boundary rule, stated once [tier: ratified B0 plan] — "if a rule can change who owns a name — whether an anchor counts, whether a batch's bytes surfaced in time, whether the fees covered the batch, whether a transcript is complete enough to award — it lives in the kernel, as a pure predicate over witnessed inputs"; `docs/spec/WIRE_FORMAT.md` §8.2 Recovery descriptor [tier: normative — defines the evidence object, not the deadline] — "Digest (= the descriptor hash the on-chain RecoverOwner event references)"; `docs/spec/WIRE_FORMAT.md` §8.3 Recovery wallet proof [tier: normative — defines the evidence object, not the deadline] — "it is signed BIP322 by the recovery address key over a normalized text message".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* Named spec PR instantiating the §6e algebra for recovery evidence: define the clock (the RecoverOwner's mined height h_r), the witnessing window W_r (reuse W, or a new CONSENSUS_PARAMS member — either way it enters the G10 surface), whether a challenge analogue C_r exists, and the relation to challengeWindowBlocks (is witnessed-by-deadline a precondition of creating pendingRecovery, or of finalization). The evidence-object set depends on recovery-auth (#50, provisional, branch spec-recovery-auth, NOT in main): the provisional direction (fresh recovery-key BIP340 signature under a v2 descriptor) would make the descriptor the load-bearing witnessed object and could fold the wallet proof's role into the on-chain signature — the deadline rule must stay parameterized over the object set until DK rules.
  *Blocked on decision:* `recovery-auth`.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts — applyRecoverOwnerRequest (~lines 526-545) decides proof availability by calling an injected recoveryWalletProofAvailable callback (OntEventApplicationOptions, ~lines 114-118) at evaluation time, with no height deadline: receipt-relative, I/O-shaped, non-convergent.`.
  *Proposed tests:*
    - (+) Evidence witnessed at exactly h_r + W_r (inclusive boundary): the RecoverOwner is evaluable and creates pendingRecovery (parameterized vector — instantiated once the spec PR pins W_r).
    - (−) Evidence first witnessed at h_r + W_r + 1: the event is uniformly not evaluable; an implementation that admits late-revealed evidence (or evaluates against node-local receipt) fails.
    - (−) Witnessed descriptor whose digest does not equal the event's recoveryDescriptorHash: fail-closed, no pendingRecovery.
    - (+) Replay determinism: same canonical chain + same witnessed-evidence set, presented to two evaluators with different receipt histories, yields byte-identical recovery state.
  *Attack flag:* Withhold-then-reveal recovery evidence: invoke recovery while keeping the descriptor/proof unservable, surface it only after the owner's challenge window has passed — the exact theft shape §6d kills for claims is currently unkilled for recovery, because no witnessing deadline exists.
  *Attack flag:* Evaluation-time availability (the legacy callback) makes two honest replayers disagree about whether a RecoverOwner ever created pendingRecovery — a per-name ownership fork, the §3 hazard at the recovery layer.
  *Attack flag:* If W_r is allowed to exceed challengeWindowBlocks, a recovery could finalize before its own evidence deadline closes — the spec PR must add a validity constraint (the recovery analogue of K >= W + C).

- **G7.** Every kernel verdict that depends on off-chain material — batch bytes, auction transcript, recovery descriptor, recovery wallet proof, value-record and descriptor chains — MUST be a deterministic predicate over (event bytes, prior state, chain facts, witnessed-evidence input); the kernel MUST NOT perform an evaluation-time availability query, any I/O, or any wall-clock read, and an absent witness MUST fail closed: the verdict goes against eligibility, identically for every honest evaluator.
  *Sources:* `docs/core/SOFTWARE_CANON.md` Layer vocabulary, L2 ownership-kernel row [tier: ratified B0 plan] — "No DB, no network, no clock, no UI"; `docs/core/SOFTWARE_CANON.md` The boundary rule, stated once [tier: ratified B0 plan] — "it lives in the kernel, as a pure predicate over witnessed inputs. The evidence layer witnesses facts (and can be swapped, sharded, or distrusted); it can never override a kernel verdict."; `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` §6e Window algebra — S4 [tier: candidate; da-windows (#49) provisional pending DK] — "The kernel consumes a served-bytes witness (format = B3 deliverable) and returns a verdict; it never does I/O and never asks "did I receive the bytes."".
  *Verdict:* **cited**.
  *Legacy evidence (never authority):* `packages/consensus/src/engine.ts — the recoveryWalletProofAvailable callback (~lines 114-118, consumed at ~line 526) is the live counterexample: an availability query injected into event application.`.
  *Proposed tests:*
    - (−) Zero-I/O enforcement: a research-quarantine-style import test fails the build if @ont/consensus imports any network/fs/db/clock module (the B2 gate names this test).
    - (+) Referential transparency: every exported kernel predicate, called twice with identical (event, state, chain facts, evidence) values, returns identical verdicts — property-tested across the suite's vector corpus.
    - (−) Two evaluators with different local receipt timelines but the same witnessed-evidence input must emit identical verdicts; any divergence is a conformance failure (the convergence negative).
  *Attack flag:* The witnessed-evidence input format is a B3 deliverable that does not exist yet; until it is specified, any 'witnessed' parameter is a placeholder shape — a kernel API that types it as a boolean (available: yes/no) quietly re-creates the callback hole, because the boolean's provenance is unverifiable.

- **G8.** Accepted value-record and recovery-descriptor chains are keyed by ownershipRef to an ownership interval. The kernel MUST define derived state as a pure re-derivation from (current canonical chain, witnessed evidence set): when a reorg orphans the interval-opening transaction, chains keyed to the orphaned interval's ownershipRef MUST cease to bind name state, and MUST bind again only by re-validating against the interval as re-formed on the new canonical chain (which MAY carry a different ownershipRef); the fate of a chain MUST NOT depend on its pre-reorg acceptance history.
  *Sources:* `docs/spec/WIRE_FORMAT.md` §8.1 Value record [tier: normative — establishes the ownershipRef keying; says nothing about reorg fate] — "ownerPubkey(32-hex), ownershipRef(32-hex), sequence"; `docs/core/SOFTWARE_CANON.md` Item 5 — Inside-out phasing, B2 gate [tier: ratified B0 plan] — "property tests over event orderings (reorg/permutation invariance where the spec claims it)"; `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` §6e Window algebra — S1 [tier: candidate; the reorg re-derivation precedent for anchors] — "On reorg, h re-derives from the new containing block; every deadline moves with it."; `docs/core/DECISIONS.md` Open Questions, item 6 — Canonical indexing and tie-breaking rules [tier: decision-log open question — OPEN, noted as instructed] — "Still open: reorg handling, which is the W/C/K window design (see #39 and STATUS.md's DA Known-incomplete entry).".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* Named spec PR defining: (1) ownershipRef derivation — today only legacy code defines it (the interval-opening anchor/state txid); no doc states what the 32 bytes are; (2) the re-validation rule after interval re-formation — because the §8.1/§8.2 digests cover ownershipRef, pre-reorg signatures cannot replay into an interval with a different ownershipRef (state this as the load-bearing property, and require owners to re-issue); (3) sequence-chain restart semantics in the re-formed interval; (4) whether a reorg shallower than K can ever change an interval-opening txid the kernel already exposed (interaction with §6e S6's never-revised-for-availability guarantee — that guarantee covers DA verdicts, not txid identity).
  *Legacy evidence (never authority):* `apps/resolver/src/validation.ts:65 (ownershipRef: record.anchorTxid) and apps/resolver/src/index.ts:1109 (ownershipRef: accumulator.anchorTxid) — legacy keys intervals by the reorg-able opening txid and has no re-derivation path for accepted chains after that txid is orphaned.`.
  *Proposed tests:*
    - (+) Reorg property: orphan the interval-opening transaction, re-form the interval under a different opening txid; records re-issued under the new ownershipRef resolve; derived state equals a from-genesis replay of the new chain plus the witnessed evidence set (no path-dependence on the pre-reorg acceptance).
    - (−) A record or descriptor citing the orphaned ownershipRef, previously accepted, must not bind name state after re-derivation; an implementation that grandfathers pre-reorg acceptances fails.
    - (−) Cross-interval replay: a validly-signed record from interval A presented against re-formed interval B (different ownershipRef) must reject on digest grounds — pinning that the signature, not the acceptance history, is what blocks replay.
    - (+) Reorg-depth pair: an orphaning reorg shallower than K vs deeper than K — both pinned, documenting whether eligibility depth shields interval identity (expected: it does not; only the DA verdict is depth-shielded).
  *Attack flag:* If a spec PR ever made ownershipRef reorg-stable but name-scoped (e.g., hash of name+owner only), pre-reorg records could replay into a different claimant's re-formed interval — the digest-covers-ownershipRef property is what blocks cross-interval replay and must be stated, not assumed.
  *Attack flag:* Txid keying means a shallow reorg that re-mines the same anchor bytes under a different txid silently invalidates every record and descriptor the owner issued — a grief/usability edge the spec must own explicitly (re-issue burden falls on the owner).
  *Attack flag:* A resolver holding the orphaned interval's chain can keep serving it to laggard clients; the kernel rule must make such chains identifiably stale (their ownershipRef no longer derivable from the canonical chain), so serving them is detectable, not just wrong.

- **G9.** The kernel MUST receive (K, W, C) as inputs — per-network consensus parameters — and @ont/consensus MUST NOT contain any of their values as a constant; every DA-deadline rule MUST be evaluable at any valid (K, W, C) parameterization.
  *Sources:* `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` §6e Window parameters (S5/S7) [tier: candidate; da-windows (#49) provisional pending DK, merged to main] — "(K, W, C) are per-network consensus parameters, passed to the kernel as inputs (no constant in @ont/consensus)"; `docs/core/DECISIONS.md` Decision Log, entry 49 — da-windows [tier: decision log, provisional pending DK] — "S5 (K, W, C) are per-network consensus parameters; kernel code is parametric."; `docs/core/SOFTWARE_CANON.md` Item 5 — Inside-out phasing, B2 gate [tier: ratified B0 plan] — "ChatLunatique signs the CONSENSUS_PARAMS surface".
  *Verdict:* **cited**.
  *Proposed tests:*
    - (+) The full DA vector suite passes at the provisional (6, 2, 3) and at a second valid parameterization (e.g., (10, 3, 4)).
    - (−) A reference implementation with any of K/W/C hardcoded passes the first parameterization and must fail the second — the suite asserts the failure (mutation-style check on the suite itself).
    - (−) S6-violation rejects: parameterizations with K < W + C, or any of K/W/C < 1, are rejected before evaluation (the (K,W,C) instance is owned by the restated Z13; referenced here as the surface's validity-constraint model).
  *Attack flag:* A kernel API that accepts (K, W, C) but validates them against compile-time defaults (or falls back to defaults when absent) is a baked constant wearing a parameter signature — the two-parameterization vectors (G11) are the only mechanical detector.

- **G10.** CONSENSUS_PARAMS MUST be a closed, enumerated set: every parameter any kernel rule consumes MUST be a member; every member MUST state type, units, validity constraints, and freeze status; and a kernel rule referencing a non-member parameter MUST be a conformance failure. The sweep of the current spec corpus yields exactly these members (types/bounds as currently documented): K, W, C (block counts; K>=1, W>=1, C>=1, K>=W+C; provisional 6/2/3, launch-freeze placeholders); W_NOTICE, the notice window (blocks; type unresolved — scalar today vs the recommended frozen monotone height-keyed schedule with extend-only adaptivity; test value 6 blocks, target weeks; placeholder, not frozen); AUCTION_WINDOW (blocks; 1,008 placeholder; launch-era height-keyed schedule recommended; scalar-vs-schedule unresolved); SOFT_CLOSE_WINDOW (blocks; 144 placeholder; rule shape: a bid inside the final S blocks moves close to bid block + S; hard cap on extensions: none — a mechanism choice, not a number); MIN_RAISE_NORMAL and MIN_RAISE_SOFT_CLOSE (composite max(absolute sats floor, percentage); placeholders max(1000 sats, 5%) and max(1000 sats, 10%); no rounding rule stated); OPENING_FLOOR(length) (sats curve; 100,000,000 sats at 1 char halving per char, 50,000-sat floor at lengths 12-32; 'higher of two floors'; placeholder); QUALIFYING_BOND_MIN, the escalation floor (sats; 50,000 placeholder; load-bearing per bond-opens (#37)); MATURITY_BLOCKS / settlement lock (blocks; 52,560 placeholder; the model itself — fixed vs epoch-halving — is an unresolved prototype constant; consumed for maturity, bond continuity, and validation of the per-bid settlementLockBlocks field); GATE_SCHEDULE g(name) (sats per name; long-tail 1,000-sat baseline, short names higher; encoding open — must make the F >= sum(g_i) check mechanical; consumed by the gate-fee rule); ACCEPTED_PAYLOAD_CAP (bytes; constraint <= 65,535, the normative wire encodable bound; kernel-accepted value unset — 'launch policy'); CHALLENGE_WINDOW_BOUNDS (min/max for the per-event challengeWindowBlocks u32 — no bounds stated in any doc; legacy default 144 is code-only); and, if any window is ruled height-keyed, the schedule's anchor height and phase table become members.
  *Sources:* `docs/core/SOFTWARE_CANON.md` Item 5 — Inside-out phasing, B2 gate [tier: ratified B0 plan] — "ChatLunatique signs the CONSENSUS_PARAMS surface"; `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` §6e Window parameters (S5) [tier: candidate; (#49) provisional] — "(K, W, C) are per-network consensus parameters, passed to the kernel as inputs (no constant in @ont/consensus)"; `docs/core/STATUS.md` Launch parameters (auction + notice mechanics) [tier: canonical status doc — freeze-status inventory; placeholder values cannot ground a rule] — "every value here is a placeholder / working default, not a frozen launch constant"; `docs/spec/AUCTION.md` Decay Rule [tier: candidate] — "window(claim) = max(height_keyed_floor(anchor_height), adaptive_extension(...))"; `docs/spec/ONT_ISSUANCE_FEE_MECHANICS.md` §8 Known properties and residuals [tier: candidate] — "The per-name schedule (long tail ₿1,000 / ~$1; scarce short names higher) must be encoded so the F ≥ Σ gᵢ check is mechanical from the batch contents."; `docs/spec/WIRE_FORMAT.md` §8.1 Value record [tier: normative] — "A lower accepted-payload cap is launch policy (kernel/adapters), not wire."; `docs/spec/CONTESTED_AUCTION_REFERENCE.md` Timing Defaults [tier: candidate] — "These must be frozen before mainnet launch if they are part of consensus.".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* Named spec PR: a CONSENSUS_PARAMS section (natural home: a new B2 kernel spec, cross-linked from STATUS.md) that owns the closed table — member name, type, units, validity constraints, freeze status — and resolves the typing questions the corpus leaves open: scalar vs height-keyed schedule for W_NOTICE/AUCTION_WINDOW/SOFT_CLOSE (AUCTION.md recommends schedules, STATUS lists scalars); bounds for challengeWindowBlocks; the rounding rule for percentage increments; the maturity model (fixed vs epoch-halving); the g(name) encoding. Every value freezes at the launch-parameter freeze (inventory rule: placeholders cannot pass candidate — this rule is therefore statable only parameterized, never with values).
  *Proposed tests:*
    - (+) Closed-surface test: the kernel's parameter type exposes exactly the enumerated members; adding, removing, or renaming a member fails a manifest-pinned test until the spec table changes (boundary-manifest (#44) style ratchet).
    - (−) Validity-constraint rejects per member once bounds land: out-of-bounds challengeWindowBlocks, zero/negative window values, a GATE_SCHEDULE that is not total over valid names — each rejected before any event evaluation.
    - (−) No-default test: constructing the kernel without an explicit CONSENSUS_PARAMS value fails; there is no implicit default parameterization (defaults are baked constants by another name).
  *Attack flag:* challengeWindowBlocks is an unbounded u32 chosen by the event author: 4 billion blocks arms a permanent denial-of-finality pendingRecovery; 0 (or tiny) arms instant-finalize theft that defeats the veto — bounds are not tuning, they are the recovery security model.
  *Attack flag:* Percentage minimum raises over integer satoshis without a stated rounding rule are gameable at small amounts (a 5% raise of 19 sats rounds to 0 under floor-rounding — a free 'raise').
  *Attack flag:* Height-keyed schedules without a pinned anchor height are unevaluable as pure predicates; if schedules land, their anchor and phase table must be parameters, or the kernel silently consumes a deployment-time fact.
  *Attack flag:* An open (non-closed) parameter surface lets an implementation add a tunable that changes verdicts while still 'passing' conformance at the documented members — closure is what makes the ChatLunatique sign-off meaningful.

- **G11.** B2 conformance MUST run its vector suite at two distinct parameterizations of every CONSENSUS_PARAMS member that any vector exercises, chosen so that an implementation with that member baked in as a constant cannot pass both runs.
  *Sources:* `docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md` §6e Window parameters block [tier: candidate; (#49) provisional — states the discipline for (K, W, C) only] — "and vectors at two distinct parameterizations so a baked-in constant cannot pass"; `docs/core/DECISIONS.md` Decision Log, entry 49 — da-windows, S7 [tier: decision log, provisional pending DK] — "B2 conformance MUST carry: boundary vectors exactly at h+W and h+W+C plus one block after each; the h+K−1/h+K eligibility pair; mixed-batch priority/inclusion negatives (bytes first served in (h+W, h+W+C]); S6-violation rejects; and vectors at two distinct parameterizations so a baked-in constant cannot pass."; `docs/core/SOFTWARE_CANON.md` Item 5 — Inside-out phasing, B2 gate [tier: ratified B0 plan] — "ChatLunatique signs the CONSENSUS_PARAMS surface".
  *Verdict:* **candidate-stays**.
  *Needed spec work:* The doc text states the two-parameterization discipline only for (K, W, C); the generalization to every CONSENSUS_PARAMS member must be written into the same CONSENSUS_PARAMS spec section as G10 (one sentence: the §6e S7 discipline applies surface-wide). Until then the generalized MUST rests on the analogy, not on text. The (K, W, C) instance is already citable and belongs with the restated Z13 in the D*/Z* areas.
  *Proposed tests:*
    - (+) The full B2 suite executes at parameterization P1 and P2 where every CONSENSUS_PARAMS member differs and, per member, at least one vector's expected outcome differs between runs.
    - (−) Mutation check on the suite itself: for each member, a build of the reference kernel with that member frozen at its P1 value must fail at least one P2 vector — run as part of suite review, not shipped CI.
  *Attack flag:* Two parameterizations that differ only in members no vector exercises prove nothing — the discipline needs a coverage clause: for each member, at least one vector whose expected outcome differs between the two runs (otherwise a baked constant in an unexercised member passes trivially).

**Gaps — Kernel-wide glue (ordering, evidence deadlines, parameter surface) duties with no spec text at all:**

- Total intra-block / intra-transaction evaluation order: no doc states any total order — DECISIONS #25 pins exactly one fact (same-block tied bids resolve by block transaction order) and SOFTWARE_CANON only says inputs arrive 'ordered'. The proposed shape (G2/G3: height order, then block transaction order, then ascending vout, with a stated bond-continuity invalidation point) matches discovered legacy behavior but has zero doc authority. This gap blocks promotion of every same-block race rule extracted in tranche 2 (X5 same-head transfer races, X7/S13 same-transaction outpoint contention, X13/R16 same-block transfer-vs-recovery, R13 single pendingRecovery).
- Height-triggered-transition evaluation point: no doc states whether a transition firing at height H applies before or after block H's events (G4). Legacy answers only the recovery-cancel boundary (cancel at finalizeHeight rejected). Each of notice close, auction close, soft-close extension, recovery finalization, and maturity needs its boundary ruled and pinned by vectors; the §6e inclusive convention is stated only for the DA windows.
- Recovery-evidence witnessing deadline: the served-evidence analogue of the DA agreement's h+W rule simply does not exist for RecoverOwner — no doc names a height by which the descriptor/wallet proof must be witnessed (G6). The §6e machinery (#49) is ready to instantiate; the instantiation is blocked in part on recovery-auth (#50, provisional, on branch spec-recovery-auth, not in main), which decides the evidence-object set. Until the spec PR lands, the R2-R9 recovery pipeline has an unpinned temporal input and replay determinism (Z1/Z2) is unachievable for recovery.
- ownershipRef is undefined in spec: WIRE_FORMAT §8.1/§8.2 carry the field normatively but no doc states what the 32 bytes are; only legacy code defines it (the interval-opening anchor/state txid — apps/resolver/src/validation.ts:65). The orphaned-evidence re-derivation rule (G8) cannot promote until ownershipRef derivation is spec text. Reorg handling is itself OPEN — recorded in DECISIONS.md, Open Questions item 6 ('Still open: reorg handling'); note: the commissioning prompt pointed at docs/OPEN_QUESTIONS.md §6, but that section is the wallet/payment-substrate list — the reorg OPEN entry lives in DECISIONS.md's Open Questions, item 6.
- CONSENSUS_PARAMS surface: no doc enumerates the closed set (G10). Only (K, W, C) have stated validity constraints (§6e S6); challengeWindowBlocks has no bounds anywhere (the sharpest hole — it is author-chosen on the wire); percentage increments lack a rounding rule; the maturity model (fixed vs epoch-halving) is an unresolved prototype constant; the g(name) gate-schedule encoding is an open residual (ISSUANCE §8); and whether W_NOTICE/AUCTION_WINDOW/SOFT_CLOSE are scalars or height-keyed schedules is unresolved between STATUS (scalars) and AUCTION.md (recommended schedules) — the surface cannot be typed until that is ruled.
- Every economic parameter value in the corpus is a STATUS.md placeholder and cannot ground a rule (inventory rule: placeholders can't pass candidate): all G9-G11 rules and every deadline rule are statable only parameterized; pinning values is launch-parameter-freeze work, explicitly out of B2 scope.

**Cross-area notes (G*, rendered inline — no tranche-3 merge pass):**

- G1/G2 feed the winner-selection / bid-acceptance predicate the combined critic commissioned separately (its missing-item 1): #25's tie-break is the only ordering fact that predicate may treat as cited; everything else it needs from ordering is the G2 gap.
- First-anchor-wins merge ordering (GLOSSARY; SOFTWARE_CANON 'batched-path state transitions (merge, first-anchor-wins)') is tranche-1 B* territory and is not re-extracted; G5 owns only the kernel-wide permutation-invariance test obligation over it.
- The (K, W, C) instances of parameter-validity (S6 rejects) and the includable/holdsPriority/eligibleAt boundary vectors are owned by the D*/Z* areas — the critic has already ordered Z13 restated per §6e/#49; G9 (parametric kernel) and the restated Z13 must land as one consistent pair, with G10/G11 generalizing the surface rather than duplicating the (K,W,C) rules.
- G6 supplies the missing temporal pin that tranche-2 R19 (fail-closed witnessed recovery evidence) presupposes; R13 (single pendingRecovery) and R15 (cancel signer) interact with G4's boundary ruling at finalizeHeight. G6 carries blockedOnDecision recovery-auth alongside the R* family — per the decision-status update, #50 is provisional on branch spec-recovery-auth and these rules stay parameterized.
- G8 joins V4/R4 (ownershipRef-keyed chains) and Z1/Z2 (replay determinism): the V*/Z* notes already call this a joint gap; G8 makes the re-derivation shape precise and adds the cross-interval-replay negative that the digest-covers-ownershipRef wire fact (normative, §8.1/§8.2) makes provable.
- ACCEPTED_PAYLOAD_CAP: the 65,535-byte encodable bound is B1/normative wire law; the kernel-accepted cap is the V* accepted-payload rule's parameter — enumerated in G10, rule owned by V*. GATE_SCHEDULE g(name) is consumed by the F* gate-fee rule (F >= sum of gates) — enumerated in G10, rule owned by F*. MATURITY_BLOCKS validation against the per-bid settlementLockBlocks field is S5/S* territory (the critic's S5 challenge already routes it to Decision #12) — G10 only enumerates the parameter.
- G7 (witnessed-evidence purity) generalizes §6e S4 from the DA verdict to every evidence-consuming verdict; the DA instance is D* territory, the transcript-completeness instance is T* territory — G7 is the kernel-wide statement the B2 zero-I/O gate test enforces once.
- The B3 served-bytes witness format is the named dependency of G6/G7/G8: every witnessed-evidence input in this area types against a B3 deliverable that does not exist yet; B2 should define the interface as an opaque, verifier-checkable witness now and let B3 fill the format (SOFTWARE_CANON phase-sequencing allows reviewed interface tests early).


## 2. Cross-area conflicts (resolve before step-3 sign-off)

From the merge passes. Each carries the merge's proposed resolution direction; none is decided here — open named decisions stay open, the rest are step-3 review material.

- **C1** [A12, B8, D5, B11] Lifecycle keying contradiction: A12/B8 key a re-anchored claim's window and priority to the EARLIEST accepted anchor (re-anchor never shifts the window), while D5/B11 require that an anchor excluded by the DA verdict confers NO priority and that the only path back is a NEW anchor that starts its own window and registers at the new height. Read literally together, a claim whose first anchor was DA-forfeited would still own the earlier window per A12/B8 — resurrecting withhold-then-reveal (A12's own attack flag draws this line).
  *Proposed resolution:* Define first-anchor-wins over the earliest VALID anchor: the earliest anchor that passed all eligibility verdicts (accepted + DA-eligible + gate-fee-covered). A forfeited/excluded anchor inherits nothing (D5/B11 form); among valid anchors, the earliest governs and re-anchors are idempotent (A12/B8 form). One sentence of spec text in the first-anchor-wins definition closes it; no open named decision is implicated (the W/C/K values stay da-windows).

- **C2** [A7, A3, D9] Two incompatible root-chain linkage models: A7 extracts strict tip-linkage (anchor's prevRoot must equal the canonical root at its Bitcoin position; the only behavior that ever ran, root-anchor.ts) while A3/D9's source (DA agreement §6a) says deltas prove against the confirmed root R_{h−K}, K blocks back — a delta-merge model under which a stale-tip prevRoot can be legitimate. The two models give different accept/reject verdicts for identical chain histories, and A9's same-block ordering plus F-area's question of whether a fee-invalid anchor consumes a chain position both depend on which model holds.
  *Proposed resolution:* This is A7's already-named spec PR (root-chain transition rule). The merge pass should not choose; it should require the PR to (a) state what an accepted anchor's prevRoot must equal, (b) reconcile with D9's K-deep eligibility so both areas read one model, and (c) answer the gap of whether structurally-valid-but-ineligible (fee/DA-failing) anchors consume a prevRoot→newRoot position.

- **C3** [A3, D9] Window-invariant strength conflict, verified in repo text: DA agreement §6a and §10 state only W ≤ K, but §11's prototype enforces K ≥ W + C. A3 asserts both as the rule; D9 flags that with C > 0 and W = K the weak form lets the challenge window resolve AFTER finalization, permitting include-then-retract — exactly what D9's no-retract test forbids.
  *Proposed resolution:* Hardening text should adopt the strong form (K ≥ W + C) as the construction invariant, with §6a's W ≤ K noted as implied by it. The W/C/K values themselves remain the open da-windows decision; only the inequality's form needs ratifying.
  Writer note: resolved by da-windows (#49, provisional pending DK, merged): DA agreement §6e S6 pins K ≥ W + C with W ≥ 1, C ≥ 1.

- **C4** [B4, D10, B11] Nullification claim-counting definition conflict, verified in repo text: ONT_ACQUISITION_STATE_MACHINE.md L85 nullifies on 'two or more cheap claims' (raw count) while CONTESTED_AUCTION_REFERENCE.md L38 requires 'two or more DA-valid claims'. Under the raw-count reading, an anchored-withheld claim nullifies an honest claim for free — directly contradicting D10 (a DA-failing claim cannot collide/nullify) and B11 (forfeit priority).
  *Proposed resolution:* Pin the DA-valid form everywhere (D10/CONTESTED_AUCTION_REFERENCE reading) and amend the state-machine sentence by named spec PR. This forces the ordering constraint that collision counting cannot run before the colliding claims' DA verdicts are decidable (see orderingNotes).

- **C5** [B9, D4, D7, F7, F6] Verdict-granularity conflict: B9 specifies per-leaf drop (a forged/malformed leaf is ignored without affecting the batch's other leaves — legacy indexer behavior), the DA area's sim evidence and D4's exclusion model are per-batch (the research sim excluded whole batches; D-gaps name the two as incompatible and unratified), and F7 makes gate-fee failure batch-atomic. No document says which granularity applies to which failure class, and the choice changes F6's Σ g_i base and D7's exclusion-equivalence property.
  *Proposed resolution:* One granularity table in the hardening doc, per failure class: fee failure → whole-batch (F7, already cited); DA deadline failure → whole-batch (D4/§6c uniform exclusion); leaf-level commitment/well-formedness failure → pick per-leaf drop or batch-poison explicitly (per-leaf is the legacy behavior; either way it must be stated, not inherited). Independently pin that Σ g_i is computed over the full committed leaf set regardless of any leaf-level drops, so dropping leaves can never shrink the fee requirement.

- **C6** [A6, B9] Owner-binding construction conflict: A6's source (publisher protocol spec) commits H(ownerPubkey) as the leaf value, while B9's consumed leaf shape (and the only code that ever ran, indexer.ts:811-813) binds the RAW ownerPubkey hex as the proof value. Two constructions of 'value binds owner' produce different roots for the same logical batch — a hard fork of the namespace if two implementations differ.
  *Proposed resolution:* The B3 leaf/served-bytes format spec must pin one construction before B2's merge predicate is written; A6 and B9 then both cite it rather than restate it. Reject-don't-normalize for name bytes (A6's other half) is independent and already wire-law.

- **C7** [A1, F5] Multi-anchor-per-transaction direction conflict: A1's attack flag proposes pinning 'every OP_RETURN output independently tested, exactly the decodable ones count' (legacy extracts all), but F5 requires that one transaction's fee never satisfy more than one anchor's gate — naive per-anchor evaluation under the all-outputs-count model double-counts F and halves the gate. The two areas are pulling toward incompatible defaults.
  *Proposed resolution:* Single joint ruling in the anchor-acceptance spec PR: either one-anchor-per-tx (with the verdict for txs carrying more — reject all vs first-wins — stated), or all-decodable-count plus an explicit fee-attribution rule F5 can cite. Neither area should ship its own default.

- **C8** [F10, T8, B12, B21] Opening-floor source conflict (live spec inconsistency, flagged by both F and T areas): AUCTION.md's Opening Bond Floors table prices 5–11 char names above ₿50,000, contradicting DECISIONS #11's resolved clamp (length-scaled curve applies only to the ≤4-char set; 5+ char names use gate + contention) and STATUS's key-numbers row. Every floor-consuming rule (F10 qualifying bond, T8 first-bid minimum, B12 auction creation, B21 short-name bond-first) inherits the contradiction.
  *Proposed resolution:* Reconcile by named PR before any floor-dependent rule promotes; the ratified decision log (#11) outranks the candidate AUCTION.md table, so the table is presumptively stale — but the values themselves are launch-freeze placeholders either way and the rules ship parameterized on floor(nameLength).

- **C9** [D13, A13, B2, F12, T6, T18, B20] Window-boundary convention conflict: D13 proposes inclusive (≤) deadline comparisons for h+W and h+W+C (sim-only grounding, candidate-stays); A13 documents that legacy simultaneously uses height ≥ closeHeight for finality AND blockHeight ≤ closeHeight for in-window collision (boundary-block events are both in-window and window-closed); F12/B2 note the bond-side comparison at h+W_notice is stated nowhere; T6's legacy uses strictly-after-close for settled; B20 has the same off-by-one at maturity. The areas are each about to pin a boundary independently.
  *Proposed resolution:* Define ONE half-open-interval convention in the hardening doc's shared-definitions section and apply it to every window (notice close, availability deadline h+W, challenge deadline h+W+C, auction close, soft-close, maturity), with boundary-block vectors at edge−1/edge/edge+1 for each. D13's inclusive proposal becomes one instance of the convention via its named spec PR rather than a DA-local rule.
  Writer note: da-windows (#49) S2 pins inclusive (≤) comparisons for the h+W / h+W+C deadlines — that ruling settles the DA half of this conflict. The notice-window, collision-window, and maturity boundaries (A13/F12/B2/T6/B20) are NOT covered by S2 and need the same one-convention treatment in step 3; extending S2's convention kernel-wide is the writer-recommended direction.

- **C10** [B13, T16, B17, F9, D9] Settlement stability conflict: B13 specifies 'settled' as a purely height-derived, non-latched phase whose reorg fixture deterministically un-settles an auction, while T16/B17 materialize ownership (owner key, live bond, required bond) at settled — with no stated confirmation depth. F9/D9 apply K-deep discipline to fee and root eligibility but nothing applies it to settlement, so a reorg can re-decide an owner after materialization.
  *Proposed resolution:* State that the settlement/ownership-materialization verdict is evaluated at the same K-deep confirmation discipline as the other finality verdicts (direction only — the K value and full reorg-handling rule are the open da-windows/reorg spec work both areas already flag).

- **C11** [A11, B4, B24] Insertion-uniqueness state-basis conflict: A11 enforces uniqueness at insertion against kernel state, but kernel state depends on the DA verdicts of earlier batches — a name 'already inserted' by a later-forfeited batch must not block honest re-claiming (A11's flag), and B24 requires nullified names to reopen while the legacy code B24 cites refuses post-nullification claims. The uniqueness check and the reopen rule assume different definitions of 'name already taken'.
  *Proposed resolution:* Define the uniqueness/occupancy check over the post-DA-verdict, post-lifecycle state: only names held by a finalized (or live provisional from an eligible batch) claim block insertion; excluded-batch insertions and nullified names do not occupy. One shared 'occupied name' definition serves A11, B4, and B24.

- **C12 (tranche 2)** [X4, X5, V5, R4, R5, R18] Two near-identical but diverging linkage targets are being defined independently: X4/X5's 'name state head' (advances on EVERY applied state-changing event; replay immunity rests on universal advance) vs V5/R4's 'ownership interval reference' (rotates only at interval-OPENING events: claim finality, transfer, settlement, recovery completion). Both resolve to legacy lastStateTxid for L1 names today, but they diverge wherever a state change is not an interval opening — notably during pendingRecovery (does a non-cancel invoke advance the head? legacy rotates the bond but not lastStateTxid until completion) and at recovery completion, where R18 sets the new interval ref to the REQUEST txid even though rotation happens at the deadline height with no transaction (V5's 'txid of the event that opened the interval' has no literal referent). R5 ('prevStateTxid = lastStateTxid of current ownership interval') silently assumes the two terms coincide.
  *Proposed resolution:* One named spec PR (the X4/X5 state-head PR) defines both terms and their exact relation: head = txid of the most recent applied state-changing event; interval ref = the head value at the most recent interval-opening event; enumerate exhaustively which events advance the head and which open intervals. Recovery-mid-window behavior stays parameterized on the open recovery-auth decision — define both terms now, leave the invoke-advances-head question explicitly to that ruling.

- **C13 (tranche 2)** [X4, X12, V5] Batched-rail names break X4's uniqueness requirement under V5's definition: V5 sets the batched-rail interval reference to the finalizing accepted-anchor txid, which is SHARED by every name in the batch. X4 forbids two names sharing a state head (Transfer carries no name field, so the head is the sole target selector), and X12 demands rail-identical transfer predicates. If a batched name's initial state head is the anchor txid, the first transfer of any name in a multi-name batch is ambiguous or nondeterministic — X4/X12 are unsatisfiable for the batched path. X*'s own gap list flags the missing initial head; V5 supplies a value that cannot work for X4. (V4 escapes this for value records only because the §8.1 digest binds the name; the Transfer wire shape does not.)
  *Proposed resolution:* The state-head spec PR must define a per-name-unique initial head for batched-final names (e.g., a name-disambiguated derivation from the anchor txid) or a wire change adding name binding to Transfer. The producing transition is tranche-1 B*'s (batched-path transitions) — B* must emit whatever initial head the PR defines; V5's interval ref can remain the shared anchor txid since the §8.1/§8.2 digests bind the name, but head and interval ref then provably differ for batched names, reinforcing conflict 1's need for two distinct defined terms.

- **C14 (tranche 2)** [X6, S1, S13] Incompatible definitions of 'required bond amount': X6 treats it as a global launch-frozen parameter (STATUS min-bond placeholder, ₿50,000 / ≤4-char curve), while S1 binds it per-name to the winning bid amount at settlement and S13 validates successors against 'the name's required bond amount'. A successor bond adequate under X6's global floor could be inadequate under S1's per-name amount (any auction clearing above the floor) — different verdicts on the same transfer. S13 separately flags the comparator inconsistency (successor >= required vs bid bond == bidAmount exactly).
  *Proposed resolution:* Required bond amount is per-name kernel state set by S1 (winning bid amount for auction-settled names; the STATUS floor parameter applies only as the opening/claim bond minimum). X6 and R11 consume the per-name recorded amount, never a global constant. The same spec PR pins the comparator (>= for successors) per S13's neededSpecWork.

- **C15 (tranche 2)** [X7, S13, R11] Incompatible scopes for the bond-outpoint exclusivity registry: X7 (citing DECISIONS #5) covers 'live names or pending acquisitions'; S13's definition covers only live names of materialized records, and its attack flag notes legacy excludes bonds backing live auction bids entirely — so one UTXO could simultaneously back an auction bid and serve as a successor bond. R11 applies a third paraphrase ('not already reserved by another name'). Three rules, three registry scopes.
  *Proposed resolution:* Define the reservation registry once in S* (see sharedDefinitions 'reserved bond outpoint'): live name bonds + pending-acquisition bonds + (rule explicitly in or out) bonds behind accepted bids in open auctions. X7 and R11 reference the single registry.

- **C16 (tranche 2)** [X1, S7, R18] X1's closed enumeration ('ownership state MUST change only through on-chain ONT events: settlement, Transfer, RecoverOwner') contradicts two other tranche-2 rules: S7 invalidates ownership on a plain Bitcoin spend that breaks bond continuity (not an ONT event — and legacy fires it independent of any event's validity), and R18 rotates ownership at a deadline height with no event at all (completion requires no transaction). Z9's deadline-derived notice outcomes (final/nullified) are the same shape on the batched path. Taken literally, X1 forbids transitions the kernel must perform.
  *Proposed resolution:* Restate X1 as: ownership changes only through kernel-defined transitions over canonical-chain facts, enumerating ALL transitions — settlement, Transfer, RecoverOwner request/cancel/completion, bond-continuity-break release, and deadline-derived window outcomes. The rule's intent (no value record, resolver answer, or off-chain artifact ever moves an owner key) is fully preserved and stays X1's core.

- **C17 (tranche 2)** [X13, R13, R15, R16] Two cancellation mechanisms for pendingRecovery with no defined interaction: X13 voids an in-flight recovery via any applied Transfer, bypassing R15's owner-signed cancel digest and R16's binding/timeliness battery entirely (no CANCEL flag, no field-equality checks, no strictly-before-deadline boundary). Both authorize via the same owner key but with different predicates and different binding material; X13 also creates the thief-transfers-away-to-void-recovery attack both areas flag. R13's single-pending lifecycle and R16's cancel-too-late boundary assume the explicit cancel path is the only clearing mechanism before the deadline.
  *Proposed resolution:* Both areas already route this to the open recovery-auth decision — correct. Keep X13 extracted as legacy behavior with blockedOnDecision:recovery-auth (it currently lacks that marker despite its own attack flag saying extraction must not pre-decide the ruling); promote neither the transfer-cancels shape nor any transfer-restricted-during-window shape until recovery-auth rules. The DESIGN.md §10.13 'transfer-resets-arming' spec PR should land as part of that ruling, not before.

- **C18 (tranche 2)** [R17, R11, S6, S7] Post-cancel bond custody contradicts the continuity model: R11 makes a valid invoke spend the live bond and rotate it to the invoker's successor output; R17's cancel is abort-only and never restores the bond — so after a successful veto, the vetoed (possibly malicious) invoker controls the name's live bond UTXO. Under S6/S7 that invoker can then spend it without a successor and release the owner's name unilaterally. S6's model (the live bond anchor tracks the owner through maturity) is incompatible with a state where bond control and ownership permanently diverge.
  *Proposed resolution:* Joint S*/R* spec rule for post-cancel bond state — e.g., the cancel transaction must itself spend the invoker's successor output and create an owner-controlled qualifying successor (mirroring X6's continuity shape), or the kernel re-anchors the live bond at cancel. This is mostly independent of the recovery-auth signer question and should not wait on it; flag in the same PR whether a straddling challenge window (R12's maturity-straddle flag) changes the answer.

- **C19 (tranche 2)** [S2, S3, S10] Conflict against the tranche-1 canonical 'settlement' definition: every S rule keys off a settlement moment, but 'settlement height' exists only in legacy code (final auction close + 1), and S3's sources disagree on the maturity anchor — GLOSSARY says the lock runs 'after settlement' while legacy computes winning-bid-height + settlementLockBlocks (divergent whenever soft-close extends the auction past the winning bid; the early-bidder burns down the lock pre-settlement). If tranche-1's canonical 'settlement' is a kernel transition event rather than a height-derived phase (S* crossAreaNotes flag this), S2's maturity entry and S10's loser-releasability are keyed to an undefined or differently-defined moment.
  *Proposed resolution:* Extend the tranche-1 canonical settlement definition by named spec PR with an explicit settlement height formula (and ratify S3's anchor: settlement height vs winning-bid height — GLOSSARY's reading closes the soft-close gaming hole and is the safer direction to propose, but it changes legacy behavior). S2/S3/S10 then consume that one definition; do not let S* coin a second settlement vocabulary.

- **C20 (tranche 2)** [Z7] Commit-priority tuple doc conflict touching tranche-1 B* (which owns merge/first-anchor-wins): ONT_PUBLISHER_PROTOCOL_SPEC.md (candidate) says 'Bitcoin commit priority, txid tiebreak' — omitting the intra-block transaction index — while RISKS.md and the legacy sim use ascending (height, txIndex, txid). The two orders pick different winners for same-block commits. Z3 (ratified Decision #25) uses txIndex for tied auction bids, so the txid-only reading is also inconsistent with the one ratified tie-break in the system.
  *Proposed resolution:* One named spec PR pins the tuple as ascending (anchor mined height, intra-block transaction index, txid) — consistent with Decision #25 — in the B* merge section, and reconciles the publisher-spec sentence. B* keeps the transition rule; Z keeps only the permutation-invariance property (see overlaps).

- **C21 (tranche 2)** [Z13] Conflict against tranche-1 D* scope: the DA agreement's §6a rule text says W ≤ K while the §11 prototype enforces the strictly stronger K ≥ W + C. If only W ≤ K is ratified, a batch can become confirmed-root-eligible (K-deep, Z4) while its fail-closed challenge window (h+W+C) is still open — the DA verdict and the confirmation boundary cross, which is exactly the ordering bug the stronger invariant prevents. Tranche-1 D* owns the eligible(anchor, servedEvidence, W, C) predicate this constrains.
  *Proposed resolution:* The da-windows named decision must either promote K ≥ W + C into §6 rule text or explicitly accept and spec the crossing. D* should adopt Z13's promotion question (Z's own crossAreaNotes agree); Z retains only the frozen-constants and reorg-invariance facets.

- **C22 (tranche 2)** [Z11, Z1, Z12] Internal purity tension: Z11 admits an adaptive_extension(...) term in window computation with no defined input set, while Z1/Z12 forbid any kernel input beyond canonical-chain facts. If adaptive_extension consumes anything off-chain it breaks Z1's determinism; if it consumes manipulable chain-visible signals, the spec's own unsafe-shrink list is the attack catalogue (extend-only bounds direction, not grief).
  *Proposed resolution:* Spec PR must either restrict adaptive_extension's inputs to enumerated deterministic canonical-chain facts (making it a pure height-keyed function) or delete it and keep only the frozen monotonic floor. No kernel hosting before that ruling.

- **C23 (tranche 2)** [X11, X12] Doc-status conflict blocking promotion for accumulator names: spec/CONFORMANCE.md F4 claims "'free transfer' decided" (2026-05-24) while DESIGN.md §10.13 Q3 still lists transferability of cheap-issued names (free transfer vs transfer-friction/harden-before-resale) as open, and no numbered DECISIONS.md entry exists. If transfer-friction were adopted, X12's rail-uniformity invariant is wrong as stated and X11's owned-state gate gains a rail-dependent branch.
  *Proposed resolution:* Needs a named decision (or a CONFORMANCE correction citing one) reconciling F4 with §10.13 Q3 before X11/X12 promote for accumulator names. Do not decide here; X11/X12 stay candidate for the batched rail.

- **C24 (tranche 2)** [S1, S6, S8, S9, S15, S16] Normativity-ledger conflict (process-blocking, flagged by S* itself): docs/LAUNCH.md — the primary rule-bearing text for live-bond binding, continuity consequences, release height, reopened auctions, and settlement-materialization — has no row in the SOFTWARE_INVENTORY.md ledger and no status header. Under canon Item 1 (code implements only normative; candidate becomes law only via named spec PR), these S rules currently cite text with no classification at all, an assumption incompatible with every other area's sourcing discipline.
  *Proposed resolution:* Before any S rule promotes: classify LAUNCH.md's settlement sections in the ledger (entering as candidate per the hardening amendment) or move the rules into spec/AUCTION.md by named spec PR. Orchestrator-level fix; no rule content needs to change.


## 3. Overlap rulings (applied)

- [A3, D9] K-deep eligibility for the canonical root plus the W/C/K window invariant extracted in both areas, citing the same DA agreement §6a/§11 text. → keep in: DA verdict (D9); anchor acceptance cites it and keeps only the fact that acceptance produces the height h the gate consumes.
- [A2, D3, D11] All deadlines keyed solely off the anchor's mined height; retired 0x0d marker and receipt-time clocks excluded — A2 restates D3's arithmetic and D11's marker rejection. → keep in: DA verdict (D3 for the arithmetic, D11 for the marker exclusion); anchor acceptance keeps only the front-running attack flag (unsigned anchor payload copyable), which is acceptance-side.
- [A4, D8] Served bytes count only if they verify against the anchored (newRoot, batchSize) commitment, source-independent — extracted nearly verbatim in both areas. → keep in: DA verdict (D8); gate-fee (F6) cites it as the source of authoritative N; anchor acceptance keeps only the per-leaf-vs-full-batch-recompute check question, which the root-chain spec PR owns.
- [A5, A6, B9] Leaf admission rules — leaves enter name state only via an accepted anchor's committed root, and leaf well-formedness (key = sha256(canonical name), value binds owner, reject non-canonical) — extracted in anchor acceptance and again as B9's merge gate. → keep in: Batched-path transitions (B9, the merge predicate — canon names 'merge' as that area's scope), folding in A6's well-formedness detail; the leaf format itself is B3 work both areas must cite (see A6/B9 conflict).
- [A11, B7, T18] Post-finality inertness (late claims/bonds are already-owned attempts) and no-takeover-of-final-names extracted three times. → keep in: Batched-path transitions (B7); anchor acceptance keeps only A11's first half (anchors carry no transfer/mutation authorization, DECISIONS #26 — genuinely anchor-scoped); transcript completeness drops T18 except as a transcript-membership filter citing B7.
- [A12, B8] First-anchor-wins / re-anchor idempotency (window keyed to earliest anchor, re-anchor cannot extend provisionality) extracted in both areas. → keep in: Batched-path transitions (B8) — SOFTWARE_CANON L2 names first-anchor-wins as batched-path scope; the merged rule must use the earliest-VALID-anchor definition from the A12/D5 conflict resolution.
- [A13, F12, B2, B3, T17] The notice-window close arithmetic and the finalize/nullify/escalate outcome table at currentHeight ≥ anchorHeight + W_notice extracted in four areas (T17 restates the whole table; F12 restates the deadline-derived predicate; A13 restates window-open + outcome). → keep in: Batched-path transitions (B2/B3/B4/B6 own the table). T17 keeps only its completeness facet (a transcript omitting a witnessed in-window claim/bond fails — omission cannot mint); gate-fee keeps only the bond-qualification facts (what makes a bond qualifying); anchor acceptance keeps only 'acceptance fixes the h the window opens at'.
- [F11, B4, B6, T7] Bond-opens (#37): qualifying bond is the only escalation trigger, bare collision denies-never-awards, no auction without a qualifying opening bid — extracted in three areas. → keep in: Batched-path transitions (B4/B6) for the per-name escalation/nullification; transcript completeness keeps T7's auction-side half (an unopened lot is not a failed auction); gate-fee drops F11.
- [F10, T8] Opening floor / qualifying-bond threshold (higher of length curve and long-name minimum) defined in both the gate-fee and transcript extractions. → keep in: Transcript completeness (T8 owns floors and increments as auction rules; 'aggregate gate-fee validation' per canon is the anchor Σ g_i check, not bond floors). B6 and F11's successor cite 'qualifying bond' as a shared definition.
- [F13, T12] Bond-output binding for bids (output at bondVout exists, payment script, value exactly bidAmountSats, same-tx) extracted identically in both areas, both candidate-stays on the same missing spec PR. → keep in: Transcript completeness (T12); one named spec PR serves both — gate-fee area drops F13.
- [F14, T11, B16] Same-bidder rebid must spend the prior bond outpoint — extracted three times with the same MUST-ify/sybil-evasion caveats. → keep in: Transcript completeness (T11, the most complete statement incl. full-amount new bond); F14 and B16 drop.
- [B12, T7, B13, T6, B14, T8, B15] The auction lifecycle cluster duplicated across batched-path and transcript areas: auction creation by qualifying opening bid (B12≈T7), five-phase height-derived machine (B13≈T6), increment minimums incl. soft-close (B14≈T8), soft-close extension monotone/no-cap (B15≈T6). → keep in: Transcript completeness (T6/T7/T8) — canon's named area is 'auction-transcript completeness' and the phase/bid rules are what the transcript predicate evaluates; batched-path keeps only B6 (escalation entry point) and consumes the settled outcome.
- [B17, T16] Settlement materializes ownership from the winning bid (ownerPubkey → owner, bond outpoint → live name bond, amount → required bond) inside the audited boundary — extracted in both areas with the same #42 citation. → keep in: Transcript completeness (T16), since it consumes the completeness verdict directly. Note: canon L2 explicitly includes 'settlement', and the post-settlement remainder — bond continuity/maturity (B18/B20), loser-bond release (gap), pre-settlement bond-spend rule — currently has no dedicated extractor; B18/B20 stay in batched-path as the de-facto owner, flagged to the orchestrator (both F and B crossAreaNotes already raise this).
- [B19, T22] Reauction lot identity anchored to the latest bond-break release block, both noting the 'indexer recognizes' server-authority leakage and the auctionId grammar gap. → keep in: Transcript completeness (T22, lot identity is preimage material for the §6 lot commitment); batched-path keeps B18 (the release trigger that produces the release-height fact T22 consumes).
- [A10, D1, T1, B2, B22, F8] The kernel purity contract (pure deterministic predicate over witnessed inputs; no DB/network/clock/UI; evidence layer cannot override; zero-I/O import test) restated as a rule in at least three areas and as test matter in two more. → keep in: One kernel-wide statement in the hardening doc's preamble/shared section, cited by every area; each area keeps only its area-specific negative tests (e.g. A10's no-batchDataProvider-seam, D1's divergent-receipt property, F8's no-identity-parameter signature check, T1's hostile-evidence stub).
- [D6, B11] Withhold-then-reveal forfeit: a deadline-missing claim cannot evict/out-prioritize an in-time claim — extracted in both DA and batched-path areas. → keep in: DA verdict (D6, with the drop-before-merge property); batched-path keeps only the one-line interaction with B8 (priority is computed among deadline-meeting claims only).
- [D7, B10] Exclusion is self-contained (removes only the excluded batch's own leaves; state equals the never-existed world) — extracted in both areas. → keep in: DA verdict (D7 owns the state-equivalence property); B10 reduces to consuming the verdict bit in claim counting.
- [D10, B3, B4] DA-failing claims count for no lifecycle purpose (cannot finalize, collide, or anchor a bond escalation) — D10 states the lifecycle consequences that B3/B4's 'eligible claim' input already encodes. → keep in: Batched-path transitions (the consequences live where the transitions live, via the shared 'eligible claim' definition); DA verdict exports only the per-batch eligible/excluded bit.
- [F15, B21] Short-name (≤4 char) names have no cheap-claim path — extracted in both areas with the same unspecified-enforcement-point flag. → keep in: Batched-path transitions (B21, it is a lifecycle gate); gate-fee keeps only the open Σ g_i interaction (whether a short-name leaf's gate counts), which resolves with the granularity table from the B9/D4/F7 conflict.
- [A14, F8] Identity-blind predicates (no publisher/broadcaster/allowlist input; self-anchored batch-of-one validated by the same rule) extracted in both areas. → keep in: Anchor acceptance (A14) as the canonical neutrality statement; F8 keeps only the fee-specific N=1 equivalence and cites A14 for identity-blindness.
- [X6, X7, S6, S13, R11] Successor-bond qualification, bond continuity, and outpoint exclusivity extracted three times: X6/X7 (transfer-side conjuncts), S6/S13 (continuity model + 'valid successor bond' definition), R11 (recovery-side shape, which already defers thresholds to S*). Note the X* crossAreaNotes mislabel ('bond side effects belong to tranche-1 B*') — B* is batched-path transitions; the correct home is tranche-2 S*. → keep in: Settlement consequences (S*) — S13 holds the qualifying-successor predicate and the reservation registry; X6/X7 and R11 reduce to invoking it as conjuncts of their event predicates.
- [X8, S14] Mature-path rules extracted twice: no bond conjuncts on mature transfers, bond spend at/after maturity carries no ownership consequence, and the identical >= boundary off-by-one flag appears in both. → keep in: Settlement consequences (S*) — S14 owns maturity semantics and the boundary comparator; X8 keeps only the transfer-predicate branch condition referencing S*'s maturity height.
- [X9, S12] Maturity-clock no-reset on pre-maturity transfer extracted twice from the same sources (DECISIONS #4/#5, AUCTION.md, LAUNCH.md), with near-identical tests. → keep in: Settlement consequences (S*) — maturityHeight is bond state; S12 keeps the rule, X9 becomes a cross-referenced test in the transfer suite.
- [X14, V10] Transfer-clears-value-record (DECISIONS #17/#18) extracted twice, including the identical fail-closed unassigned-flag-bit reasoning. X*'s own notes concede 'X14 owns only the transfer-side trigger' but X14 as written restates the whole rule. → keep in: Value-record authority (V*) — V10 owns interval-reset semantics and fail-closed no-preserve; X* keeps only the trigger reference plus the Transfer flags-bit registry gap (which is X*'s wire-adjacent duty).
- [X15, V1, R19, Z1, Z12] The L2 purity/determinism rule (SOFTWARE_CANON L2 row: pure deterministic predicates, no DB/network/clock/UI) extracted five times, once per area, each with its own zero-I/O-import structural test. → keep in: Reorg/replay determinism (Z*) — Z1+Z12 state the single kernel-wide rule and the one structural import test over @ont/consensus; X15/V1/R19 reduce to their valuable area-specific content, the exact input-tuple enumeration of each predicate (which IS worth keeping per area).
- [V11, Z12] issuedAt-is-opaque extracted twice: V11 (timestamps never order/veto records) and Z12's final clause (issuedAt treated as committed bytes, never compared to now). → keep in: Value-record authority (V*) — V11 keeps the record-ordering rule and its tests; Z12 keeps the kernel-wide no-clock clause without restating the value-record specifics.
- [V4, V6, V7, V8, V9, R3, R4] The owner-signed chain-acceptance predicate is extracted twice as mirrors: value records (V4/V6-V9 over §8.1) and recovery descriptors (R3/R4 over §8.2) share sequence-exactly-+1, first=(1, null), previousHash = signed digest of head (signature excluded), and ownershipRef interval binding — legacy implements both as mirrors in apps/resolver/src/validation.ts. R*'s notes already propose one shared definition. → keep in: Value-record authority (V*) — define one parameterized chain predicate there (fullest source grounding via DECISIONS #17); R3/R4 instantiate it for §8.2 with descriptor-specific deltas only. V9's hash-is-the-signed-digest spec sentence covers both instantiations in one PR.
- [Z4, Z13] Confirmed-root K-depth eligibility (DA §6a) and the W/C/K structural constraint plainly duplicate tranche-1 D* scope (the fail-closed DA deadline verdict and its window machinery). → keep in: Tranche-1 D* (DA verdict) — D* owns eligibility and window constraints; Z keeps only the reorg-invariance corollary (confirmed-root sequence invariant under sub-K reorgs) as a property test.
- [Z8] Proof-base rule (deltas prove against R_{h−K}) and the open prevRoot↔R_{h−K} relation duplicate tranche-1 A* scope (anchor acceptance); Z's own notes assign the prevRoot chaining question to A*. → keep in: Tranche-1 A* (anchor acceptance) — A* owns the proof-base and prevRoot relation; Z keeps the proof-base-stability-under-shallow-reorg property.
- [Z5] Deadline arithmetic (servable by h+W, challenge close h+W+C, notice h+W_notice keyed to anchor mined height) duplicates tranche-1 D*'s core (Decision #47 marker-fold). → keep in: Tranche-1 D* — deadline computation stays there; Z keeps the reorg-recomputation requirement (deadlines re-derive from the anchor's NEW mined height h') and receipt-time-independence property, which are genuinely Z material.
- [Z9] The notice-window outcome predicate (final/nullified/escalated at anchorHeight + W_notice) duplicates tranche-1 B* scope (batched-path claim-lifecycle transitions). → keep in: Tranche-1 B* — the outcome predicate; Z keeps the no-latching/re-derivation-equals-fresh-replay invariance and the late-bond-exclusive-deadline negative test.
- [Z7] First-anchor-wins / commit-priority conflict resolution is a batched-path state transition — tranche-1 B* scope by the canon L2 row's own wording; Z6 (disjoint-insertion commutativity) is the genuine Z-side invariance property. → keep in: Tranche-1 B* — the transition rule with the pinned (height, txIndex, txid) tuple (see conflict on Z7); Z keeps Z6 plus the negative test that conflicting batches resolve by commit priority, not application order.
- [X1, V12] 'A value record never changes ownership' stated in both areas (both citing DECISIONS #16). → keep in: Transfer authority (X*) — X1 owns the closed list of what may change ownership (as amended per the X1/S7/R18 conflict); V12 keeps the one-way-dependency property test (ownership component byte-identical across any record-submission sequence).

## 4. Predicate evaluation order

- DA verdict presupposes anchor acceptance: eligible(anchor, servedEvidence, W, C) consumes the accepted anchor's mined height h and (newRoot, batchSize) — an anchor that fails decode (A1) or the root-chain transition rule (A7-A9) never opens a DA window. Anchor acceptance must also define when h becomes a usable witnessed fact (B3 header/inclusion witnessing, K-depth).
- Gate-fee verdict presupposes the commitment check and served bytes: Σ g_i is only computable from the commitment-checked committed leaf set (F6 ← A4/D8), so the fee predicate cannot run before the batch contents are servable/witnessed — a fee verdict on self-declared totals is gameable by withholding (F1 flag). The composition feeValid ∧ daValid (is an underpaid-but-served batch excluded identically to an unserved one, and in which order?) is specified nowhere and must be pinned as part of the acceptance-stage composition definition.
- Acceptance-stage composition order is itself consensus-bearing: whether a structurally-valid but fee-invalid or DA-forfeited anchor still consumes its prevRoot→newRoot chain position changes the verdict for every LATER anchor under A7's tip-linkage model — the root-chain spec PR must order the sub-verdicts (structural → linkage → fee → DA) explicitly; every ordering yields a different griefing surface (A-gaps).
- Notice-window outcomes presuppose decidable DA verdicts: the finalize/nullify/escalate table (B3/B4/B6, T17) counts eligible claims at h+W_notice, but a claim's DA verdict is only decidable at its anchor's h+W+C. Unless da-windows rules W+C ≤ W_notice (or defines the interleaving), the claim set at the close height is not yet decidable — T17 and D10 both flag this as the exact da-windows question; no area may improvise an interleaving before that ruling.
- Exclusion filters before merge/priority: excluded batches must be dropped before any first-anchor-wins or commit-priority comparison runs (D6's drop-before-merge property), and B8's earliest-anchor selection must be evaluated only over deadline-meeting claims (B11) — running priority before the DA filter resurrects withhold-then-reveal.
- Insertion-uniqueness evaluates over post-DA-verdict state: A11's 'name already inserted' check depends on the DA verdicts of earlier batches (a later-forfeited batch's insertion must not block honest re-claiming), so occupancy is computed after exclusion filtering, and B24's reopen-after-nullification consumes the same post-verdict occupancy definition.
- Transcript award presupposes completeness then acceptance filtering: T9 (highest accepted bid wins) is only sound after T2 (set completeness over the extension-adjusted block range) and T8 (qualifying/increment filtering); and because each accepted bid changes the required minimum and possibly the close height for subsequent bids (T8/B14/B15), bids must be applied in the canonical same-block total order BEFORE increment checks — the order is an input to acceptance, not just a tie-break.
- Settlement presupposes phase derivation, completeness, and confirmation depth: T16/B17 ownership materialization runs only on a settled phase (T6/B13, height-derived), over a completeness-passing transcript (T2), and — per the B13/T16/F9 conflict resolution — at K-deep stability; reorg handling for all of these rides on the same open da-windows decision.
- Short-name gate ordering: where B21/F15's ≤4-char refusal is enforced (refuse-at-merge vs never-finalize) determines whether short-name leaves participate in Σ g_i (F1/F6 arithmetic) and in collision counting (B4) — the enforcement point must be chosen jointly with the verdict-granularity table, not per-area.
- Reauction generation presupposes kernel-recorded release facts: T22/B19's reopen-lot acceptance consumes 'latest recorded bond-break release block', which only exists if bond-continuity breaks (B18) are themselves kernel-derived chain facts recorded before reopen evaluation — if release recording stays adapter-side, a lying adapter mints generations (B19 flag); the release-fact witness needs the same completeness treatment as the bid set (T22 flag).
- Cross-path precedence is last-resort: B23's L1-over-batched precedence should only ever evaluate after B6 escalation has run — if escalation is correct the dual-record state is unreachable, and the hardening PR must either prove unreachability or state precedence as a defensive invariant, not let a code-only tiebreak mask an upstream transition hole.
- Scope flag for the orchestrator (not an ordering dependency, recorded for completeness): canon L2 includes 'claim lifecycle, settlement' — post-settlement bond continuity/maturity (B18/B20), loser-bond release, and transfer/recovery/value-record authority (T19 touches recovery only as transcript matter, blocked on recovery-auth) sit outside the five named areas; both the F and B extractors flagged this and the merged doc needs an owner for that remainder.
- Per-event cross-area conjunct order for L1 ownership events: resolve target via name state head (X4/R5) -> name state class gate (X11 owned / R12 immature / S15 settled) -> maturity branch (S* maturity height decides whether bond conjuncts engage, X8/S14) -> signature/authority (X2, R15, R10) -> bond conjuncts (S13 qualifying successor + reserved-outpoint registry, consumed by X6/X7/R11) -> atomic application (X3): head advance, bond anchor update, interval rotation, pendingRecovery effects commit together or not at all. Conjuncts span four areas; X3's no-partial-effects rule is the cross-area atomicity contract.
- A total intra-block (and intra-transaction, for multi-event txs) evaluation order across all five L1 event types is the unstated precondition for: X5 first-wins among same-head transfers, X7/S13 same-transaction outpoint contention, R13 single-pending, X13/R* same-block transfer-vs-invoke, and S13's two-events-one-successor case. X*, R*, and Z* each list it as a gap; it must be defined once (extend Decision #25's txIndex principle) before any of those rules is well-defined.
- Settlement precedes everything downstream: S1/S16 outputs (initial owner key, live bond anchor, required bond amount, initial state head) are inputs to X2/X4/X6, R2/R5, and V2/V5. Every S rule in turn presupposes tranche-1 T*'s transcript-completeness verdict and a deterministic close height (Z10), which depends only on the confirmed bid set. The winner-selection layer between T* and S* (floors, increments, soft-close validity, highest-accepted-bid, same-bidder rebid replacement) belongs to no announced area — both S* and Z* flag it; orchestrator must assign it or S15/S16/Z3 sit on an undefined input.
- Bond-break classification is order-dependent: a spend of a live bond outpoint releases the name (S7) only if the spending transaction does NOT carry a kernel-valid Transfer/RecoverOwner with a qualifying successor (X6/R11) — so event validation must be evaluated before continuity-break classification. Legacy checks look-alike successor outputs independent of event validity (S7 attack flag); the spec must state event-validity-first (or define the legacy independent-output check as the rule).
- Recovery pipeline order: descriptor-chain acceptance (R2-R4, instantiating the shared chain predicate) presupposes the current ownership interval ref (V5 shared definition), which presupposes the last applied interval-opening event; armed-descriptor head determination (R6) presupposes chain acceptance; cross-object checks (R7/R8 profile + equality battery) presuppose the armed descriptor; wallet-proof verification (R9) and bond shape (R11, consuming S13) come last before window arming (R14). The evidence-timing rule (by when descriptor/proof must be witnessed relative to invoke height) is the unpinned input to this whole chain — structurally the tranche-1 D* served-evidence problem, and should reuse whatever window machinery da-windows produces.
- Recovery completion (R18) is height-triggered, not event-triggered: at the deadline height it must apply at a defined point relative to same-height events (R16's cancel is strictly-before; an old-owner Transfer mined at the deadline height is currently undefined), and identically under incremental and full replay (Z2). Legacy's refresh-on-demand derived-state shape is not order-safe; the completion predicate must be a function of chain height applied in replay order.
- Interval rotation precedes chain validation: V4/R4 verdicts depend on whether the rotating event (transfer per X14/V10, recovery completion per R18, release per S7) has been applied first — a record or descriptor evaluated against the pre-rotation interval gets the opposite verdict. Mid-pendingRecovery, 'current owner key' (V2) and 'current interval' (V5) are recovery-auth-blocked inputs; V* and R* predicates consume, never define, them.
- Batched-path gating order across tranches: tranche-1 D* DA verdict (deadlines h+W, h+W+C) -> confirmed-root eligibility at K depth (Z4, D*-owned) and proof base R_{h-K} (Z8, A*-owned) -> merge of DA-valid disjoint batches (Z6 commutativity) -> same-name resolution by commit priority (Z7, B*-owned) -> notice-window outcome (Z9, B*-owned) -> V* interval creation for finalized names. Z13's open K >= W + C question decides whether the DA verdict always resolves before confirmed-root eligibility; if only W <= K is ratified, the order can cross (conflict logged).
- Reorg recomputation order (Z2/Z5): on canonical-chain change, rewind to the fork point and re-derive in chain order — anchor-keyed deadlines from new mined heights (Z5) before window outcomes (Z9/B*); release heights (S8) before reopened-lot recognition (S9); state-head rollback (X5) can resurrect a previously-dead competing transfer, and pendingRecovery facts (request/cancel/completion) re-derive per R14/R18 arithmetic. No verdict may be latched from a superseded chain view; ownershipRef-bound record/descriptor chains orphaned by a reorged interval-opening tx have no revalidation rule yet (V*/Z* joint gap).
- Value-record and descriptor predicates are one-way dependent on ownership state (V12): evaluate ownership transitions for a height first, then off-chain-object acceptance against the resulting state; record/descriptor acceptance never writes ownership, so within a height the ownership pass strictly precedes the chain-acceptance pass.

## 5. Step-2 source-check record

### Tranche-1 critic: verdict challenges and dispositions

- **B8** — Cited without real doc authority. The source 'DECISIONS.md Decision Log §51-era snapshot, line 1135' is not a decision entry — line 1135 sits in the DECISIONS.md 'Open Questions' register (item 6, 'Canonical indexing and tie-breaking rules — [PARTIALLY ANSWERED]'), reads 'cheap-rail merge is first-anchor-wins with deterministic priority, live since 2026-06-09', uses retired vocabulary ('cheap-rail'), and describes legacy code as live rather than ratifying a rule; the same item lists reorg and duplicate handling as still open. With the other source being candidate-tier GLOSSARY, B8 should be candidate-stays pending the first-anchor-wins definition spec PR the merge pass already proposes.
  *Disposition:* Critic verified the cited line is an open-questions register note, not a decision entry. Downgraded; neededSpecWork: state the rule in ONT_ACQUISITION_STATE_MACHINE.md (or a DECISIONS entry) before promotion.

- **A12** — Cited, but neither source states the window-keying content. GLOSSARY 'first-anchor-wins' states priority among non-conflicting claims ('the earliest Bitcoin-anchored claim holds'), not that a re-anchor cannot extend/reset/shift notice deadlines; DA agreement §11 actually says a missed batch 'simply re-anchors later and registers at the valid height' — the opposite direction for forfeited anchors (the extraction's own A12/D5/B11 conflict). The no-shift clause has no doc text anywhere; by the extraction's own convention (cf. A7, A9) this is candidate-stays on the same definition PR as B8.
  *Disposition:* Neither source states the window-keying content (GLOSSARY first-anchor-wins covers priority, not window restarts). Downgraded; resolution rides cross-area conflict C1.

- **T6** — Inconsistent with the extraction's own T13/T14 standard ('defines the field, not the matching rule'). WIRE_FORMAT §6 field 4 normatively pins only the phase enumeration and its rejection; the derivation arithmetic — 'an accepted opening bid at height b0 sets close = b0 + W_auction', 'moves close to max(close, bid height + C_soft)', 'strictly after the final close ⇒ settled' — appears in no document. AUCTION.md 'Auction Timing' gives a base window of 1,008 blocks and a soft-close extension rule but never keys the close to the opening-bid height, and the strictly-after convention is legacy-engine behavior (the window-boundary conflict the merge pass flags). The enumeration half is cited; the arithmetic half should be candidate-stays or split out.
  *Disposition:* The §6 field pin stays cited (WIRE_FORMAT normative); the matching/derivation arithmetic has no doc text and is candidate-stays, consistent with the extraction's own T13/T14 standard.

- **B1** — Cited, but the cited AUCTION.md 'Provisional Utility' section undercuts the rule: it is explicitly 'Recommended state language' for product posture, it RECOMMENDS 'quiet' as a state in its table, and its table does not contain 'nullified' at all. No document defines the kernel lifecycle state set as exactly {provisional, collided, contested, final, nullified}, nor states that quiet must not exist as a kernel state. The rule is good synthesis (the states are individually grounded in #37/glossary) but the closed five-state set and the quiet exclusion are extraction inventions — candidate-stays with a named spec PR to pin the state set.
  *Disposition:* Cited section is AUCTION.md 'Provisional Utility' — recommended product state language, not consensus rule text. Downgraded; neededSpecWork: consensus-tier statement in AUCTION.md or the state machine.

- **T19** — Cited, but the load-bearing clause is invented: ONT_RECOVERY_INVOKE_SPEC.md 'What's missing in code' item 2 says the invoke-path signer 'isn't yet defined. This is the open protocol question.' The rule's 'until ruled, the kernel MUST treat invoke-path authorization as unsatisfiable' is a sensible fail-closed default no doc states — per canon Item 1 that is exactly a stop → named spec PR case, not a citable rule. The owner-key cancel/veto half has text ('clearly the veto-path signer'); the unsatisfiable-default half should be candidate-stays blocked on the recovery-auth decision.
  *Disposition:* The fail-closed default in the statement is invented — the spec holds the invoke-path signer open ('isn't yet defined'). Downgraded and blocked on recovery-auth; Decision #50 (provisional pending DK) now supplies the direction — finalize at ratification.

- **A3** — Cited, but its two candidate-tier sources state different invariants (DA §6a/§10: W ≤ K; §11 prototype: K ≥ W + C) and the rule asserts both conjunctively as one law — the extraction's own A3/D9 merge conflict says the inequality's form is what needs ratifying. A rule whose content IS the unresolved choice cannot carry a cited verdict; candidate-stays pending the da-windows decision (D9, which honestly attributes each form to its source, is the better-stated twin).
  *Disposition:* Sources state different invariant strengths (§6a/§10: W ≤ K; §11 prototype: K ≥ W + C). Step-2 correction superseded by events: da-windows (#49, provisional pending DK, merged) pins the strong form K ≥ W + C as S6 — the rule restates per §6e and conflict C3 is resolved by that ruling.

- **B9** — Cited, but the per-leaf granularity clause ('ignored without affecting the batch's other leaves') has no doc text: DA agreement §5 speaks at batch granularity (include/exclude of the delta), and the only doc text addressing an in-batch bad leaf — ONT_PUBLISHER_PROTOCOL_SPEC.md 'What the publisher must NOT do': including an already-taken name means 'consensus rejects the whole batch' — points the opposite way. Per-leaf drop is legacy indexer behavior; the extraction's own B9/D4/F7 conflict admits no document says which granularity applies. The membership-proof half is grounded; the granularity half should be candidate-stays on the granularity-table spec PR.
  *Disposition:* The exclusion of a failing leaf is cited; the per-leaf granularity clause ('without affecting the batch's other leaves') has no doc text — candidate-stays, and is exactly cross-area conflict C5 (per-leaf vs whole-batch verdict granularity). neededSpecWork: DA agreement must state verdict granularity.

- **T3** — Cited, but its own sources hold the question open: DECISIONS #35 is marked 'working assumption — the auction form ... explicitly one of the design brief's open feedback questions', and OPEN_QUESTIONS 2.1 is '[PARTIALLY ANSWERED — a choice remains]' recommending Option B (open non-binding signaling → sealed binding settlement) as the default, with only the no-off-chain-auction-on-the-batched-path scope note actually decided. Pinning 'only L1-carried AuctionBid events enter the completeness predicate' as cited law forecloses the recommended Option B; the verdict overstates what is ruled.
  *Disposition:* Its own sources hold the question open (DECISIONS #35 is a working assumption naming alternatives). Downgraded; neededSpecWork: close the auction-form question or scope the rule to the assumed form explicitly.

- **A6** — Cited, but the owner-binding half's authority is a JSON field comment in the candidate-tier publisher protocol spec (a B3/B4 adapter doc describing what a wallet checks in a quote response: ownerCommitment === H(ownerPubkey)) — and the extraction's own A6/B9 conflict notes the only code that ran bound the raw pubkey instead. By the extraction's own A7/T13 standard ('describes the payload, not the acceptance rule'), the owner-binding construction should be candidate-stays on the B3 leaf-format spec PR; only the key = sha256(canonical name) + reject-non-canonical half has wire-adjacent authority (WIRE_FORMAT §2).
  *Disposition:* The leaf-shape half stays cited; the owner-binding construction's authority is a JSON field comment in the adapter-tier publisher protocol spec — candidate-stays, and rides cross-area conflict C6. neededSpecWork: owner-binding construction stated at consensus tier.

- **F7** — Cited from the publisher protocol spec alone — an adapter-tier candidate doc restating consensus behavior secondhand ('Consensus rejects the batch otherwise', 'consensus rejects the whole batch'). That is precisely the server-side-restatement pattern the canon's hunting list flags, and batch-atomicity is one side of the unresolved granularity conflict the merge pass itself identifies (B9/D4/F7). Weak authority for a kernel rule; candidate-stays pending the granularity table is the safer verdict.
  *Disposition:* Sole source is the adapter-tier publisher protocol spec restating consensus behavior secondhand. Downgraded; neededSpecWork: restate in ONT_ISSUANCE_FEE_MECHANICS.md (consensus tier).

- **F6** — Reverse direction — candidate-stays where doc text partially exists: ONT_ISSUANCE_FEE_MECHANICS.md §8 states the g(name) schedule 'must be encoded so the F ≥ Σ gᵢ check is mechanical from the batch contents', and §4 ties N to the anchor's commitment. The derive-from-committed-contents requirement (the rule's core) is stated; only the concrete g(name) encoding is the admitted residual. The verdict could be split: cited for from-contents-never-self-declared, candidate-stays for the schedule encoding and the batchSize-mismatch verdict.
  *Disposition:* Reverse challenge: critic argues partial doc authority exists (ONT_ISSUANCE_FEE_MECHANICS.md §8 g(name) schedule language), so candidate-stays may be too weak. HELD for step-3 review — reviewer to confirm upgrade or keep.

### Combined critic: verdict challenges on tranche 2 and dispositions

- **Z13** — Cited, but now contradicted by merged text on both clauses. DA agreement §6e (da-windows #49, merged to main, provisional pending DK) (a) ratifies K ≥ W + C as the validity constraint S6 and explicitly states the weaker 'W ≤ K form read alone permits include-then-retract at W = K; it is implied by, and superseded by, the strong form' — so Z13's 'MUST satisfy W ≤ K' pins the superseded weak form; (b) §6e S5 states '(K, W, C) are per-network consensus parameters, passed to the kernel as inputs (no constant in @ont/consensus)' with mandatory vectors at two distinct parameterizations — directly contradicting Z13's 'MUST treat K, W, and C as frozen consensus constants, not runtime inputs'; (c) the rule's closing condition ('MUST be either ratified into the rule text or rejected by the da-windows decision') is now resolved. Z13 must be restated per §6e/Decision #49 (and Z4/Z5/Z8 should add §6e citations for the eligibleAt boundary and reorg re-derivation clauses while that PR is open).
  *Disposition:* Superseded by da-windows (#49, provisional pending DK, MERGED): DA agreement §6e S6 pins the strong form K ≥ W + C (the weaker W ≤ K is 'implied by, and superseded by, the strong form'), and S5 makes (K, W, C) per-network consensus parameters passed to the kernel as inputs — no frozen constants. Rule restated per §6e; its closing condition is resolved. Step-3 carry: Z4/Z5/Z8 gain §6e citations in the same spec PR.

- **S4** — Cited without settled authority for the prohibition. Every source hedges: AUCTION.md Winner Bond And Maturity says 'Prototype constant to resolve: ... Before launch, the protocol must choose one maturity model' (the choice is explicitly open); DECISIONS #13 says fixed maturity is the 'current lead launch recommendation' that the spec 'favors'; CONTESTED_AUCTION_REFERENCE Settlement says fixed 'unless the project explicitly revives a more complex schedule'; STATUS marks the model 'placeholder'. A flat 'MUST NOT apply an epoch-halving or any other variable maturity schedule' converts a documented lean into law — this should be candidate-stays pending the maturity-model freeze (or be restated as the conditional #13 actually supports).
  *Disposition:* Every source hedges (AUCTION.md 'Prototype constant to resolve', DECISIONS #13 'current lead launch recommendation', STATUS 'placeholder'). A flat MUST NOT converts a documented lean into law. Downgraded; restated as the conditional #13 supports; neededSpecWork: the maturity-model freeze decides it.

- **S16** — The positive half (owner key = winning bid's ownerPubkey) is genuinely cited (LAUNCH.md 'the winning bid's ownerPubkey becomes the live owner key'; AUCTION.md 'winning bids should carry the eventual owner key'). But the exclusive negative half — 'no separate settlement transaction, winner-acknowledgement step, or operator assignment may decide it' — is contradicted by the same LAUNCH.md page: 'Settlement Questions Still Open' lists 'whether final launch protocol wants a separate winner-acknowledgement step' as open, and the settlement-shape section is expressly 'the implementation direction, not a forever-frozen protocol commitment'. The negative clause overstates; split the rule or flag the acknowledgement-step question as a named open decision.
  *Disposition:* Positive half (winning bid's ownerPubkey becomes the live owner key) stays cited (LAUNCH.md + AUCTION.md). The exclusive negative half ('no separate settlement transaction, winner-acknowledgement step, or operator assignment') overstates — LAUNCH.md expressly holds the winner-acknowledgement step open. Negative clause candidate-stays; the acknowledgement-step question flagged for a named decision.

- **S3** — Candidate-stays for the wrong reason — doc text on the maturity anchor exists in the ratified decision log and the extractor missed it. DECISIONS #9 (Maturity anchor): maturity 'starts once the winning auction state has settled into ownership'; DECISIONS #12 (Maturity duration binding): 'The maturity clock starts at the commit block height.' These two themselves diverge (settlement vs commit confirmation) and both diverge from legacy winning-bid-height + settlementLockBlocks whenever soft-close extends the auction. The rule cannot claim 'the spec MUST name the anchor point' as if no text existed — it must cite #9/#12 and route the three-way reconciliation through the named spec PR (note GLOSSARY 'settlement lock' sides with #9).
  *Disposition:* Critic is right that decision-log text exists and the extractor missed it — but DECISIONS #9 (maturity starts at settlement) and #12 (maturity clock starts at commit block height) themselves diverge, and both diverge from legacy winning-bid-height + settlementLockBlocks under soft-close. Restated: the rule cites #9/#12 and routes the three-way reconciliation through the named spec PR (GLOSSARY 'settlement lock' sides with #9).

- **S5** — Candidate-stays, but DECISIONS #12 is real decision-log authority for exactly this rule: 'Every auction-acquired name receives a deterministic maturity duration from the launch rules in effect when its commit confirms', the duration 'must be computable from pre-announced objective protocol parameters' and 'cannot be adjusted discretionarily after the acquisition is committed'. That is the authority that the per-bid settlementLockBlocks wire field cannot be a bidder-chosen override and must validate against the protocol parameter. S5 should cite #12 and be upgradeable to cited; only the comparator/rejection mechanics remain spec work.
  *Disposition:* DECISIONS #12 is real decision-log authority for exactly this rule (deterministic maturity from launch rules at commit confirmation; 'cannot be adjusted discretionarily'). Upgraded to cited per #12; only the comparator/rejection mechanics remain neededSpecWork.

- **S8** — Candidate-stays, but the core anchoring rule has ratified decision-log text the sources omit: DECISIONS #5 (Bond continuity) — 'If bond continuity breaks before maturity, the name immediately loses active ownership. A released name can be opened again through a new auction generation anchored to the release block' — plus AUCTION.md Bond Breaks And Reauction ('Reauction identity: Anchored to the release block'). Only the deterministic latest-rule/tx-level tiebreak for multiple same-height breaking observations is genuinely unstated. Cite #5 and narrow the candidate-stays to the tiebreak clause.
  *Disposition:* DECISIONS #5 (bond continuity breaks → name released; reauction 'anchored to the release block') plus AUCTION.md Bond Breaks And Reauction are cited authority for the anchoring rule. Candidate-stays narrowed to the genuinely unstated clause: the deterministic tiebreak for multiple same-height breaking observations.

- **S13** — Candidate-stays as a composite, but most conjuncts carry decision-log authority: DECISIONS #5 ('The same transaction must create a successor bond output'; 'must contain at least the required bond amount'; 'No two live names or pending acquisitions may reference the same bond outpoint at the same time') and #27 ('the signed transfer payload includes the successor bond output index (vout)'; 'the indexer verifies that the referenced output exists and meets the required bond threshold'). X6/X7 cite exactly these entries and are verdict 'cited'. Only the payment-class script predicate and the reservation-registry scope (the logged X7/S13/R11 conflict) lack doc text. Split S13: cite the #5/#27 conjuncts, keep candidate-stays only for script class and registry scope.
  *Disposition:* The #5/#27 conjuncts (same-transaction successor bond output, required amount, no shared live bond outpoint, declared successor vout verified) are cited — consistent with X6/X7. Candidate-stays only for the payment-class script predicate and the reservation-registry scope (rides the logged X7/S13/R11 conflict).

- **V14** — Cited on a single candidate-tier 'should' sentence that does not state the rule: ACQ state machine Owner-Key Control says 'The owner-key model should not depend on whether the name came from an uncontested accumulator claim or a contested L1 auction' — a statement about owner-key authority generally, not about the value-record acceptance predicate or its input set. No DECISIONS/ONT.md/normative text states rail-uniformity of the record predicate. The rule is a reasonable inference but under the source-check discipline (canon Item 1 hardening step 2) it should be candidate-stays.
  *Disposition:* Sole source is a single candidate-tier 'should' sentence about the owner-key model generally — it does not state the record-predicate rail-uniformity rule. Reasonable inference, but under source-check discipline: downgraded; neededSpecWork: rail-uniformity of the value-record predicate stated at consensus tier.

- **X12** — Cited on the same lone candidate 'should' sentence as V14, while the repo carries an unresolved doc-status conflict the tranche itself logged: CONFORMANCE.md F4 claims "'free transfer' decided" with no DECISIONS entry, and DESIGN.md §10.13 Q3 still lists transferability of cheap-issued names (free vs transfer-friction/harden-before-resale) as open. If transfer-friction were adopted, X12 as stated is wrong for the batched rail. The merge findings' own proposedResolution says X11/X12 'stay candidate for the batched rail' — the verdict should be candidate-stays (at minimum rail-scoped) pending the reconciling named decision.
  *Disposition:* Same lone candidate 'should' sentence as V14, plus the tranche's own logged doc-status conflict (CONFORMANCE.md F4 claims 'free transfer decided' with no DECISIONS entry; DESIGN.md §10.13 Q3 holds transfer-friction open). Downgraded, rail-scoped, pending the reconciling named decision — matching the merge's own proposedResolution.

- **R15** — Cited, but the absolutist clause pre-decides against a ratified decision's stated direction. Sources support owner-key cancel as legacy behavior (invoke spec: the cancel-authorization function 'is clearly the veto-path signer'; WIRE §5 defines the digest but expressly disclaims authorization semantics to B2). However DECISIONS #40 (ratified) says the challenge-window veto 'should be delegable to a non-custodial watcher' holding 'a name-scoped, abort-only credential' — i.e., a non-owner-key cancel path is the decided target shape, with the credential construction open. 'Any other signer MUST be rejected' freezes legacy in a way #40 explicitly intends to relax; the rule needs a delegation carve-out citing #40 or should be candidate-stays/flagged alongside the recovery-auth family.
  *Disposition:* Owner-key cancel stays cited as the defined veto signer today (invoke spec + WIRE §5). But 'any other signer MUST be rejected' freezes legacy against ratified intent: DECISIONS #40 makes a delegable, non-custodial, abort-only watcher credential the decided target shape (construction open — OPEN_QUESTIONS §4.1). Restated with a #40 carve-out: the exclusivity clause holds until the watcher-credential construction lands, then relaxes by named amendment.


## 6. Completeness record

Tranche-1 critic found the following canon-L2 scope missing; tranche 2 was commissioned to cover it:

- Transfer authority — canon Item 5 B2 explicitly lists 'transfer/recovery/value-record authority' in the B2 kernel scope (docs/core/SOFTWARE_CANON.md L137-138), and WIRE_FORMAT.md §5 (normative) states 'Authorization semantics — which key must have produced a signature for an event to change name state — are kernel rules (B2), not wire' while defining the ont-transfer-owner digest. ONT_ACQUISITION_STATE_MACHINE.md 'Owner-Key Control' and DECISIONS #4 (transfer semantics), #27 (pre-maturity transfer linkage), #30 (atomic transfer-for-payment) name the rules. NO extracted rule states the transfer-acceptance predicate (valid owner-key Schnorr over the §5 digest, prevStateTxid linkage to the current state, unauthorized/forged transfer changes nothing). B18/B20 cover only the bond-continuity side effects of transfers, not who may authorize one — and the B2 gate requires a documenting test for every DECISIONS entry naming a consensus rule.
- Value-record authority — canon Item 5 B2 ('value-record authority'); WIRE_FORMAT.md §8.1 (normative) explicitly defers 'Chain rules (sequence exactly +1, hash links to head)' to kernel material; ONT_ACQUISITION_STATE_MACHINE.md 'Value Records' states records are sequence-numbered and predecessor-linked within an ownership interval so clients can reject stale records from prior owners. Zero extracted rules cover value records anywhere; the only mention is A11's negative (anchors don't mutate them).
- Recovery arming and cross-object recovery authority — SOFTWARE_INVENTORY.md hardens ONT_RECOVERY_INVOKE_SPEC.md as 'B2 (authority rules)', and WIRE_FORMAT.md §8.2 (normative) explicitly routes check (b) — at invocation the proof's normalized signingProfile MUST equal the descriptor's — to 'recovery-authority semantics, B2 scope (routed out of B1)'. T19 covers only the in-transcript invoke/cancel slice; the owner-signed descriptor arming step, the descriptor sequence/predecessor chain, and the §8.2(b) profile-equality check are covered by no rule.
- Loser-bond release at settlement — canon L2 includes 'settlement' (SOFTWARE_CANON.md L29), and LAUNCH.md 'Bond Continuity Consequences' states 'loser bonds become releasable after settlement'. No extracted rule states when/whether non-winning bid bonds release (the merge findings themselves call the post-settlement remainder unowned, confirming the gap rather than filling it).
- Kernel-wide reorg re-derivation — the B2 gate requires 'property tests over event orderings (reorg/permutation invariance where the spec claims it)' (SOFTWARE_CANON.md L139-141) and ONT.md commitment 2 claims ownership is computed by replaying Bitcoin; ONT_ISSUANCE_FEE_MECHANICS.md §8 says 'standard K-confirm finality and deterministic replay handle reorgs, same as the rest of the path'. Only F9 instantiates this (fee facts only) and T10 covers presentation order; no rule states that every kernel verdict re-derives identically from the post-reorg canonical chain — the B13/T16/F9 settlement-stability conflict the merge pass found exists precisely because no rule owns this invariant.

*Tranche-1 critic assessment:* This is a strong extraction over the five named eligibility areas and the merge pass is genuinely load-bearing — I verified its key conflicts against repo text and they are real (acquisition state machine 'two or more cheap claims' vs contested-reference/DECISIONS-#7 'DA-valid claims'; DA §6a 'W ≤ K' vs §11 'K ≥ W + C'; the AUCTION.md floor table vs the #11 clamp; the §6a delta-merge linkage model vs A7's tip-linkage), and the ordering notes correctly identify the consensus-bearing composition questions (notice-close vs DA-decidability, acceptance-stage ordering). But it is not yet ready to become B2_KERNEL_HARDENING.md steps 1-2 as-is, for two reasons. First, coverage: canon L2 is 'every rule that decides name state' including 'claim lifecycle, settlement' and Item 5 B2's explicit 'transfer/recovery/value-record authority' — transfer authorization, value-record chain rules, recovery arming/cross-object checks (all of which WIRE_FORMAT §5/§8.1/§8.2 normatively route to B2), and loser-bond release have no extracted rules at all; the extraction flags this remainder in a scope note but a hardening doc whose step-1 rule set silently omits roughly a third of the audited boundary will fail its own B2 gate (documenting test per DECISIONS consensus entry — #4, #27, #30, #40 are uncovered), so the missing areas need an owner and at least a sixth rule area before the doc is assembled. Second, verdict hygiene: canon step 2 says a rule 'cites its authority (ONT.md, DECISIONS.md, STATUS) or stays candidate', and a noticeable cluster of 'cited' verdicts rests on an open-questions register note (B8), invented fail-closed defaults (T19), derivation arithmetic no doc states (T6), conflicting candidate sources asserted conjunctively (A3), product-tier recommendation tables (B1), or adapter-spec restatements (A6, F7) — these should be re-verdicted candidate-stays with their named spec PRs before step 2's source check inherits false authority. With the post-settlement/authority remainder assigned, the ~10 challenged verdicts corrected, and the shared-definitions section adopted as written (it is the best part of the merge output), this is ready to assemble.

**Combined-coverage critic (after tranche 2)** — found five duties still unowned; tranche 3 was commissioned in response (winner selection / bid acceptance covers the first; kernel-wide glue covers the evaluation-order, recovery-evidence-deadline, orphaned-evidence, and CONSENSUS_PARAMS duties):

- Winner selection (the 'highest-qualifying-bond wins' duty, named verbatim in SOFTWARE_CANON.md Item 5's B2 bullet alongside bond-opens-auction): no rule in either tranche extracts the predicate that decides WHICH bid wins and which bids are accepted into the transcript at all. Tranche-1 T* judges whether a transcript is complete enough to award; tranche-2 S* consumes 'the winning bid' as a given input (S1/S15/S16 all presuppose it); Z3 covers only the same-block tie (Decision #25) and Z10 only the close height. Unextracted duties with real doc text: qualifying-bond/opening-floor acceptance (DECISIONS #37 'a qualifying bond... largest bond wins', GLOSSARY 'bond', AUCTION.md Opening Bond Floors 'the opening bid must meet the higher of two floors'), minimum-increment validity normal vs soft-close (DECISIONS #35 increment parameters, AUCTION.md Bid Escalation), same-bidder rebid replacement spending the prior bid-bond outpoint (DECISIONS #35 'Current rebid shape'), bond-amount-equals-bid binding at the declared bondVout (LAUNCH.md implementation table 'bond value = bid at bondVout'), and highest-accepted-bid-wins itself (LAUNCH.md 'the highest accepted bid becomes the winner'; ACQ state machine 'largest bond wins'). The tranche-2 merge findings' own orderingNotes concede this layer 'belongs to no announced area' — it must be commissioned before S15/S16/Z3 have a defined input.
- Kernel-wide total intra-block and intra-transaction evaluation order across the five L1 event classes (Transfer, RecoverOwner, AuctionBid, RootAnchor, plus height-triggered transitions): SOFTWARE_CANON.md's L2 row defines the kernel as predicates over 'ordered, witnessed inputs in', and the B2 gate requires 'property tests over event orderings', but Decision #25 pins only the same-block auction-bid tie. No rule in either tranche defines the order in which same-block/same-transaction events are applied, which X5 (first-wins among same-head transfers), X7/S13 (same-transaction outpoint contention), R13 (single pendingRecovery), X13/R16 (same-block transfer-vs-invoke/cancel), and R18-at-deadline-height all presuppose. The merge findings list it as a gap in three areas; a gap acknowledged in notes is still a missing rule — nobody owns it.
- Recovery-evidence witnessing deadline: by what canonical-chain height a recovery descriptor and wallet proof must be demonstrably witnessed/served for a non-cancel RecoverOwner at height h to be evaluable (the served-evidence analogue of the DA agreement's h+W rule). R19 makes evidence a witnessed input and fails closed on absence, but no rule pins WHEN absence is decided, so the R2-R9 pipeline has an unpinned temporal input — replay determinism (Z1/Z2) is not achievable without it. The canon assigns recovery authority and the fail-closed witnessed-evidence posture to L2 (Layer vocabulary row; 'The boundary rule, stated once'); the orderingNotes flag it and point at the da-windows machinery, which now exists (DA agreement §6e, Decision #49) and could be instantiated, but no rule was extracted.
- Re-derivation rule for off-chain evidence chains after a reorg orphans an interval-opening transaction: value-record and descriptor chains are keyed to ownershipRef (V4/R4) and kernel state must be re-derived from the current canonical chain (Z2), but value records and descriptors are not chain events, so 'replay in chain order' does not define what happens to an accepted chain whose interval-opening txid no longer exists, or whether previously-served records re-validate against a re-formed interval. V*/Z* notes call this a joint gap; no rule exists. Canon basis: the L2 row makes value-record authority a kernel duty over witnessed inputs, and Item 5's gate demands reorg/permutation property tests.
- The CONSENSUS_PARAMS surface as a closed, enumerated set: SOFTWARE_CANON.md Item 5's B2 gate requires 'ChatLunatique signs the CONSENSUS_PARAMS surface', and DA agreement §6e S5 (Decision #49, now merged) requires (K, W, C) to be kernel inputs with no baked constant. Parameters appear rule-by-rule across both tranches (K/W/C, W_notice, MATURITY_BLOCKS, ACCEPTED_PAYLOAD_CAP, soft-close S, increments, opening floors, required bond, challengeWindowBlocks bounds) but no extracted rule defines the complete parameter set, each parameter's type/bounds/freeze status, and the kernel-is-parametric requirement (§6e's two-distinct-parameterizations conformance discipline generalized). Without it the gate artifact has no rule to test against.

*Combined assessment:* With both tranches, coverage of SOFTWARE_CANON.md Item 5's B2 duty list is close but not closed: the five tranche-2 areas genuinely fill the tranche-1 critic's named gaps (transfer, value-record, recovery, settlement/bond-release, reorg re-derivation), sourcing is mostly verifiable against repo text, and the merge findings' conflict/overlap/sharedDefinitions work is the right shape for B2_KERNEL_HARDENING.md step 1. But assembly cannot be declared complete yet for four reasons. First, one canon-named duty — 'highest-qualifying-bond wins' — still has no owning area: the winner-selection/bid-acceptance predicate between T*'s transcript verdict and S*'s settlement consequences is unextracted despite real doc text (DECISIONS #35/#37, AUCTION.md floors/increments, LAUNCH.md highest-accepted-bid), and both S* and Z* sit on it as an undefined input; it must be commissioned (with the kernel-wide event-ordering rule, the recovery-evidence deadline, the orphaned-evidence-chain reorg rule, and the CONSENSUS_PARAMS surface as smaller companions). Second, roughly ten verdicts need correction before step 2's source-check is trustworthy — the S* extractor systematically missed ratified decision-log entries (#5, #9, #12), Z13 is now contradicted by the merged §6e/Decision #49 algebra (parameters-as-inputs and K ≥ W + C supersede its text), and V14/X12/R15/S4/S16 mark as 'cited' things that are leans, single candidate sentences, or open questions. Third, the logged cross-area conflicts (state-head vs interval-ref, required-bond-amount, X1's closed enumeration, the settlement-moment definition, post-cancel bond custody) are exactly the named-spec-PR queue the canon's stop→spec-PR→code loop demands, and steps 1-2 can proceed in parallel with them only if each conflicted rule carries its blocking marker (X13 is still missing its recovery-auth flag). Fourth, the normativity-ledger hole is process-blocking for S*: LAUNCH.md (and RISKS.md, which Z7's tuple question leans on) have no SOFTWARE_INVENTORY.md row, so several S rules cite unclassified text — an orchestrator-level fix that must land before any S promotion. Verdict: sufficient to start assembling B2_KERNEL_HARDENING.md steps 1-2 now for the X/V/R/Z areas and most of S, provided the missing winner-selection extraction is commissioned immediately, the verdict corrections above are applied, and the recovery-auth-blocked rules (correctly flagged — Decision #50 is on branch spec-recovery-auth, not main) stay parameterized rather than resolved.

*Writer note on the combined assessment's four conditions:* (1) winner-selection extraction = tranche 3 area Q (done); (2) verdict corrections = the DISPOSITIONS_T2 records in §5 (applied at the rules); (3) conflicted rules carry blocking markers (X13 patched); (4) the SOFTWARE_INVENTORY.md ledger rows for LAUNCH.md and RISKS.md land in this branch alongside this document.

## 7. Next steps (3–5)

1. **Step 3 — adversarial content pass:** ChatLunatique attacks rule statements,
   verdicts, conflict resolutions, dispositions, and the attack flags; held
   items (F6, plus any disposition counters) get rulings; conflicts C1–C24 get
   resolutions or named-decision routings.
2. **Step 4 — attacks become negative tests:** every surviving attack flag lands
   in the B2 conformance suite as a vector (negative tests first-class).
3. **Step 5 — sign-off and promotion walk:** per-section, DK ratifies; queued to
   DK's return list per the autonomous-session protocol. The B2 conformance
   suite is written against this document BEFORE `@ont/consensus` implementation
   begins (tests-first, B0 law).

