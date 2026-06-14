# B2 Spec-PR Decision Packets — decision-ready for DK

> **Normativity: `analysis`** — advisory recommendations, NOT ratified law.
> The neutral gap catalog is [B2_SPEC_PR_REGISTRY.md](./B2_SPEC_PR_REGISTRY.md)
> Part A (36 PRs); this file augments each with **Options → Recommendation →
> Ripple** so DK can rule a batch fast on return. A recommendation here is
> ClaudeleLunatique's advisory call (writer/reviewer/DK protocol); **DK
> decides**, ChatLunatique reviews the packet. Per the parking rule, no
> consensus law is agent-decided — these only make the choices legible.

Each packet keys to a registry PR by number and lists its flags. "Ratify as
recommended" = adopt the recommended option as a named spec decision (and, where
noted, a one-sentence amendment to the cited doc). PRs are independent unless a
packet says "pairs with PR-n".

---

## PR-1. B3 served-bytes / servedEvidence witness format (DA-predicate interface) — EXPANDED

**Flags (6):** D1-01, D2-01, D14-01, B8-01, B11-01, Z5-02. **Registry priority:** P0 for the interface stub (the kernel DA predicate is a typed hole without it); P2 for the concrete byte format (B3-gated). **Blocking dependency:** the B3 evidence layer for the concrete bytes (deferred deliverable; DA agreement §10 item 2, OPEN_QUESTIONS §1 item 1) — but the interface is definable now. Independent of #49/#50.

**Decision surface (the sub-rulings DK makes):**
1. Whether B2 defines `servedEvidence` as an opaque, verifier-checkable interface NOW (so the DA predicate is well-typed), deferring the concrete bytes to B3 — or waits for B3's full format.
2. The interface contract: the properties the kernel requires of `servedEvidence` independent of its byte layout.
3. The honest-verifier convergence property (two verifiers with the same confirmed-chain facts AND the same `servedEvidence` derive the same DA verdict).

**Options:**
- **(A) define the opaque interface now, defer bytes to B3** — `eligible(anchor, servedEvidence, W, C)` consumes `servedEvidence` as an abstract verifier-checkable type with a stated contract; B3 later fills the concrete byte format without changing the predicate signature.
- **(B) wait for B3's concrete format** — leave the DA predicate untyped until B3 lands.

**Recommendation (advisory, for DK ratification): (A).**
Define `servedEvidence` now as an opaque interface with a three-property contract: (i) **anchor binding** — the evidence is cryptographically bound to the anchor it serves (evidence for one anchor is not valid for another); (ii) **first-servable-height** — it determines a single first-servable height comparable to the `h+W` deadline; (iii) **independent verifiability** — any party can verify it from the `servedEvidence` object plus confirmed-chain facts (no external I/O, no trust in the submitter), so two verifiers with the same chain AND the same `servedEvidence` derive the same verdict. (B3 still owns evidence availability/convergence; the kernel verdict is deterministic over the presented `servedEvidence` + chain facts, not a claim that the chain alone supplies the evidence.) The B2 DA predicate `eligible(anchor, servedEvidence, W, C)` consumes this abstract type today; the concrete byte layout is B3's deliverable (P2). Option (B) leaves the entire D-area DA predicate a typed hole, so the whole DA-verdict family cannot be written or conformance-tested — unacceptable for B2.

**Minimal amendment text (one block, for the DA agreement / B2 kernel spec):**
> servedEvidence interface (B2). The DA-eligibility predicate `eligible(anchor, servedEvidence, W, C)` consumes `servedEvidence` as an opaque, verifier-checkable value satisfying: (i) it is cryptographically bound to `anchor` (evidence for one anchor is not valid for another); (ii) it determines a single first-servable height comparable to the `h+W` deadline; (iii) it is independently verifiable from the `servedEvidence` object plus confirmed-chain facts by any party, with no external I/O or trust in the submitter, so two verifiers with the same chain AND the same `servedEvidence` derive the same verdict. The concrete byte encoding is defined by the B3 evidence layer; B2 depends only on this interface.

**Ripple:**
- Unblocks the witness-CONSUMING halves of D1, D2, D14, B11 once the interface is defined (they author as vectors against the abstract type); likewise the witness-dependent halves of A2/A10, F6 (Σ gᵢ over committed leaves), and B10.
- The CONCRETE-format halves stay B3-gated (P2) — vectors asserting specific byte layouts wait for B3.
- **Pairs with PR-2** (commitment-match / B3 leaf format): the served bytes prove membership against the committed leaf PR-2 defines; the two B3 deliverables share the leaf/evidence shape.
- No new attack surface from the interface; it closes the typed hole.

**Non-goals / dependencies:**
- **Non-goal:** specifying the B3 byte format (deferred to B3; P2).
- **Dependency:** the B3 evidence layer for the concrete format; B2 depends only on the interface contract.
- **Independent of #49/#50** (the evidence interface is orthogonal to the window algebra and recovery authority).
- **Overlaps PR-2** (leaf format) — coordinate the leaf/evidence shape.

**Attack if rejected (what breaks without PR-1):**
- The B2 DA predicate `eligible(anchor, servedEvidence, W, C)` is a **typed hole** — it cannot be written, so the entire D-area (DA verdict) and the witness-dependent halves of A/F/B/Z cannot be conformance-tested (D1-01, D2-01, D14-01, B8-01, B11-01).
- "Demonstrably servable by `h+W`" stays undefined, so honest verifiers cannot be shown to **converge** — the §3 boundary/convergence hazard reopens on contested names.
- Reorg re-derivation of served evidence (Z5-02) has no defined input to re-check against the current chain.

---

## PR-2. Commitment-match construction: B3 leaf format + DA verdict granularity (conflicts C5, C6) — EXPANDED

**Flags (5):** A4-02, A6-01, D4-02, D8-01, B9-01. **Registry priority:** P0 (two divergent leaf constructions fork the root; the merge predicate cannot be written until one is pinned). **Blocking dependency:** B3 for the concrete leaf/served-bytes bytes, plus a named consensus-tier ruling on the owner-binding construction (C6) and the granularity table (C5) — the rulings are makeable now; the concrete bytes are B3-gated. Independent of #49/#50; pairs with PR-1.

**Decision surface (the sub-rulings DK makes):**
1. **Owner-binding (C6):** the committed leaf value = `H(ownerPubkey)` (publisher spec) or raw `ownerPubkey` (the only code that ran).
2. **Verdict granularity (C5):** the disposition per failure class — and specifically the leaf-level fork: **per-leaf-drop** vs **batch-poison**.
3. The meaning of "bytes match the commitment": per-leaf membership proof vs full-batch root recomputation from `prevRoot`.
4. `Σ gᵢ` (gate-fee sum) is pinned over the full committed leaf set regardless of any per-leaf drops.

**Options:**
- **(1) owner-binding** — (a) `H(ownerPubkey)` [follows the publisher spec; fixed-width, domain-separable] vs (b) raw `ownerPubkey` [what the legacy code committed].
- **(2) leaf-level granularity** — (a) **per-leaf-drop** (a malformed leaf is dropped; the rest of the batch stands) vs (b) **batch-poison** (one malformed leaf rejects the whole batch). [Fee shortfall and missed DA-deadline are whole-batch under both.]
- **(3) commitment-match** — (a) per-leaf Merkle membership against the committed root vs (b) full-batch root recomputation from `prevRoot` (recommend both: membership for inclusion + recomputation for completeness).

**Recommendation (advisory, for DK ratification):**
- **(1) = (a) `H(ownerPubkey)`** — docs-are-the-spec (clean-build #46 assumes the legacy code is wrong where it diverges); the publisher spec's `H(ownerPubkey)` is the published construction, fixed-width and domain-separable. Reconcile the code to the spec. (Genuine C6 fork, flagged: the only deployed code used raw `ownerPubkey`, so this is a deliberate spec-wins ruling, not a no-op.)
- **(2) — the central P0 fork; I lean (a) per-leaf-drop CONDITIONED on a detectable-malformation rule, but this is the packet's highest-uncertainty call.** Per-leaf-drop is resilient (one bad leaf does not deny honest co-claimants) but enables the **B9 selective-victim-drop grief** (a publisher includes a victim's leaf subtly malformed so it silently drops). The condition that closes B9: leaf well-formedness must be defined so a claimant can verify its OWN leaf committed correctly (a dropped leaf is detectable by its claimant, never silent). Absent that condition, **batch-poison (b)** is the safer ruling — it removes selective drop entirely, at the cost of collective grief (one bad leaf kills the batch). DK rules; I recommend per-leaf-drop + detectable-malformation, and name batch-poison as the conservative alternative.
- **(3) = both** — "bytes match the commitment" means each claimed leaf (per (1)) is provably a member of the anchored root, AND the root recomputes from `prevRoot` over the full committed leaf set (so no undeclared leaves were inserted).
- **(4)** `Σ gᵢ` is summed over the full committed leaf set regardless of per-leaf drops (a dropped leaf still counts toward the batch's gate-fee obligation), so dropping cannot dodge the fee.

**Minimal amendment text (one block, for the DA agreement / B2 kernel spec):**
> Commitment-match (B2). The committed leaf value is `H(ownerPubkey)`. The merge predicate verifies each claimed leaf is a member of the anchored root and recomputes the root from `prevRoot` over the full committed leaf set. Failure granularity: a fee shortfall or a missed DA deadline rejects the whole batch; a leaf-level well-formedness failure [drops only that leaf | rejects the whole batch — DK ruling], with leaf well-formedness defined so a claimant can verify its own leaf committed (no silent drop). `Σ gᵢ` is summed over the full committed leaf set regardless of drops. The concrete leaf/served-bytes encoding is the B3 deliverable.

**Ripple:**
- Locks A4 (membership-vs-recompute), A6 (owner-binding), D4/D8 (partial-service / `batchSize` role), B9 (per-leaf-drop) once ratified.
- Feeds the shared "eligible claim" / "leaf format" definitions PR-1's `servedEvidence` consumes (the served bytes prove membership against the leaf this PR defines) — **pairs with PR-1**.
- The concrete leaf bytes stay B3-gated; the construction + granularity RULINGS land now.
- The granularity ruling feeds the gate-fee (F) area: `Σ gᵢ` over the full committed set is F's fee-attribution input.

**Non-goals / dependencies:**
- **Non-goal:** the concrete B3 byte layout of a leaf (deferred to B3).
- **Dependency:** B3 for the bytes; a named consensus-tier ruling for C5 (granularity) + C6 (owner-binding) — both makeable now.
- **Independent of #49/#50.**
- **Pairs with PR-1** (the served-bytes witness proves membership against this leaf construction).

**Attack if rejected (what breaks without PR-2):**
- Two divergent leaf constructions (`H(ownerPubkey)` vs raw) compute **different roots** from the same batch — a consensus fork at the merge predicate (A6-01); the predicate cannot be written until one is pinned.
- Unstated leaf-level granularity leaves the **B9 selective-victim-drop grief** open (a publisher silently drops a victim's leaf), or — if implementations diverge on drop-vs-poison — an honest-node fork.
- Partial service (D4-02) and `batchSize`'s role (D8-01) stay undefined, so "did this batch serve its leaves" is undecidable.

---

## PR-3. Root-chain transition rule (conflict C2; the A7–A9 named PR) — EXPANDED

**Flags (5):** A5-01, A7-01, A7-02, A8-01, Z8-01. **Registry priority:** P0 (two linkage models give opposite verdicts for identical chain histories; no anchor-acceptance vector is derivable until one is chosen). **Blocking dependency:** a new named anchor-acceptance spec decision; the linkage-model RULING is independent of #49/#50 — it coordinates with D9's K-deep eligibility (the confirmed root `R_{h−K}` whose K is #49's already-provisional parameter, not a blocker for the model choice).

**Decision surface (the sub-rulings DK makes):**
1. **Linkage model (C2):** what an accepted anchor's `prevRoot` must equal — strict tip-linkage vs the DA §6a delta-merge `R_{h−K}` model.
2. Whether a structurally-valid-but-INELIGIBLE (fee/DA-failing) anchor consumes a `prevRoot→newRoot` position.
3. No-op / duplicate-transition rejection (re-anchoring the same `newRoot`; `prevRoot == newRoot`).
4. **Anchor identity (A5-01, A8-01):** which mined instance is "the" anchor owning the deadline clock and the proof-bundle txid, when the same `newRoot` is anchored more than once.
5. The `prevRoot` ↔ `R_{h−K}` relation and chaining of multiple anchors inside one K window (Z8-01); reconcile with D9's K-deep eligibility.

**Options:**
- **(1) linkage** — (a) strict tip-linkage (`prevRoot` must equal the current chain-tip root; the only behavior that ran) vs (b) delta-merge against the K-deep confirmed root `R_{h−K}` (the DA §6a model).
- **(2) ineligible-anchor position** — (a) an ineligible anchor consumes no `prevRoot→newRoot` position (confers nothing) vs (b) it consumes a position (blocks the slot).
- **(4) anchor identity** — (a) the earliest valid instance in the PR-16 total order owns the clock + proof-bundle txid vs (b) the gate keys on the root VALUE, instance-agnostic (A5-01's ambiguity).

**Recommendation (advisory, for DK ratification):**
- **(1) = (b) delta-merge against `R_{h−K}`.** Strict tip-linkage (a) is a griefing surface (A7-01): anyone who lands a tiny valid anchor first moves the tip and invalidates every other publisher's `prevRoot` — a cheap DoS on honest publishers. Delta-merge keys `prevRoot` off the K-deep CONFIRMED root (stable, not the volatile tip), so concurrent honest anchors in a K window merge rather than racing to invalidate each other; it is also the DA §6a model the spec already states. Reconcile the legacy strict-tip code to (b). (Genuine C2 fork — flagged; the two models give opposite verdicts on identical histories, A7-02.)
- **(2) = (a) ineligible anchor consumes no position** — a structurally-valid-but-fee/DA-failing anchor confers no `prevRoot→newRoot` transition (consistent with first-anchor-wins = earliest-VALID, PR-5; an ineligible anchor must not block the slot or honest successors).
- **(3) reject no-op / duplicate transitions** — re-anchoring an existing `newRoot`, or a `prevRoot == newRoot` no-op, is rejected (no state change, no clock reset, no duplicate position).
- **(4) = (a) earliest valid instance owns identity** — when the same `newRoot` is anchored more than once, the earliest valid instance in the PR-16 same-block/total order owns the deadline clock and the proof-bundle txid; later duplicates are no-ops per (3). Resolves A5-01 (key on the instance, not only the root value) and A8-01 (duplicate-anchor ownership) deterministically. **Depends on PR-16's total order** for "earliest."
- **(5)** `prevRoot` must equal `R_{h−K}` (the confirmed root K-deep below the anchor), and multiple anchors in one K window compose/merge by applying their deltas in the PR-16 order against that confirmed base; K is #49's parameter (coordinate with D9, not re-decided here).

**Minimal amendment text (one block, for the anchor-acceptance spec / DA agreement):**
> Root-chain transition (B2). An accepted RootAnchor's `prevRoot` must equal the confirmed root `R_{h−K}` (K-deep below the anchor's mined height); anchors are not tip-linked. A structurally-valid but ineligible (fee- or DA-failing) anchor consumes no `prevRoot→newRoot` position. A transition that re-anchors an existing `newRoot`, or whose `prevRoot == newRoot`, is a no-op and is rejected. When the same `newRoot` is anchored more than once, the earliest valid instance in the same-block total order owns the deadline clock and the proof-bundle txid; later instances are no-ops. Multiple anchors in one K window compose/merge by applying deltas in that order against `R_{h−K}`. (K is the #49 parameter.)

**Ripple:**
- Locks A5 (anchor identity), A7 (both flags — the grief is closed by delta-merge), A8 (duplicate-anchor ownership), Z8 (`prevRoot ↔ R_{h−K}` relation) once ratified.
- **Pairs with PR-5** (an ineligible/forfeited anchor confers no position/priority — the same earliest-VALID principle) and **PR-16** (anchor identity uses the same-block total order).
- **Coordinates with D9 / #49** on the K-deep root (`R_{h−K}`): the model is #49-independent but instantiates K from #49; no new #49 dependency for the model choice.
- Retires the strict-tip-linkage code path (the A7-01 grief surface).

**Non-goals / dependencies:**
- **Non-goal:** the K value itself (that is #49; PR-3 uses `R_{h−K}` parametrically).
- **Dependency:** PR-16 (total order) for the "earliest valid instance" identity rule; PR-5 (earliest-VALID) for the ineligible-anchor-confers-nothing principle.
- **Independent of #49/#50** for the linkage-model ruling (it coordinates with D9 on K-deep but does not re-decide #49).

**Attack if rejected (what breaks without PR-3):**
- The two linkage models give **opposite verdicts for identical chain histories** (A7-02) — an honest-node consensus fork at anchor acceptance; no anchor-acceptance vector is derivable until one is chosen (the P0 core).
- Strict tip-linkage left in place is a **cheap grief** (A7-01): a tiny first anchor invalidates every concurrent honest publisher's `prevRoot`.
- Duplicate-anchor ambiguity (A5-01, A8-01) leaves the deadline clock and proof-bundle txid **undefined** when the same root is anchored twice.
- `prevRoot`'s required relation stays unstated (Z8-01), so a stale/sibling-`prevRoot` reject is not derivable.

---

## PR-4. Multi-anchor-per-transaction / one-anchor-per-tx rule (conflict C7) — EXPANDED

**Flags (2):** A1-01, F5-01. **Registry priority:** P0 (anchor-acceptance and gate-fee areas pull toward incompatible defaults — fork risk). **Blocking dependency:** a new named spec decision, folded into the anchor-acceptance spec PR but stated separately so neither the A-area nor the F-area ships its own default. Independent of #49/#50; coordinates with PR-16 (intra-tx cohabitation) and PR-1/PR-2 (fee Σ over the committed set).

**Decision surface (the sub-rulings DK makes):**
1. **Anchor multiplicity (C7):** one-anchor-per-tx, or all-decodable-anchors-count.
2. (if one-per-tx) the verdict for a tx carrying more than one valid anchor — reject-all vs first-wins.
3. (if all-count) an explicit fee-attribution rule so one tx's intrinsic fee `F` cannot satisfy more than one anchor's gate (no Σ-gate double-count).
4. The disposition of malformed / non-anchor OP_RETURN outputs in the same tx — skip vs invalidate-tx (must match PR-16's cohabitation ruling).

**Options:**
- **(1) multiplicity** — (a) one-anchor-per-tx (at most one valid decodable RootAnchor per tx) vs (b) all-decodable-anchors-count.
- **(2) >1-anchor verdict (under a)** — reject-all (the whole tx) vs first-wins (the first decodable anchor).
- **(4) malformed-output disposition** — skip (ignore non-anchor/malformed outputs, process the single valid anchor) vs invalidate-tx (any malformed OP_RETURN poisons the tx).

**Recommendation (advisory, for DK ratification):**
- **(1) = (a) one-anchor-per-tx.** It closes the fork by construction: one tx → at most one valid anchor → one intrinsic fee `F` → one gate, so the Σ-gate double-count problem cannot arise (no fee-attribution rule needed). All-count (b) is more permissive but forces an explicit fee-attribution mechanism (split `F` across anchors so it cannot satisfy two gates) — added consensus surface for a marginal batching optimization (RootAnchors are naturally one-per-batch-root). The legacy "extract ALL, skip malformed" behavior (A1-01) is exactly the divergence clean-build reconciles toward the simpler spec rule.
- **(2) = reject-all.** A tx carrying more than one valid decodable RootAnchor is rejected wholesale — fail-closed and unambiguous. first-wins invites "which is first" ambiguity (vout order is publisher-controlled) and a silent drop of the loser; reject-all has neither.
- **(4) = skip (ignore malformed / non-anchor outputs), COUPLED to PR-16.** Malformed or non-ONT OP_RETURN outputs in the tx are ignored — they neither count toward the "one anchor" limit nor poison it — consistent with PR-16's skip-bad cohabitation recommendation and the A1 multi-OP_RETURN direction. **This MUST match PR-16's sub-decision (4):** if DK rules reject-all for cohabitation there, rule invalidate-tx here too; they are the same question at different granularity.
- Net: `F` attributes to the single valid anchor; the F-area gate (Σ gᵢ over that anchor's committed leaves, PR-1/PR-2) consumes `F` once — no double-count.

**Minimal amendment text (one block, for the anchor-acceptance spec):**
> Anchor multiplicity (B2). A Bitcoin transaction carries at most one valid decodable RootAnchor. A transaction carrying more than one valid decodable RootAnchor is rejected in whole. Malformed or non-ONT OP_RETURN outputs in the transaction are ignored — they neither count toward the single-anchor limit nor invalidate it (matching the kernel's cohabitation rule). The transaction's intrinsic fee `F` attributes to that single anchor for the gate-fee check, so no fee can satisfy more than one anchor's gate.

**Ripple:**
- Locks A1 (multi-OP_RETURN / multi-anchor) and F5 (multi-event-per-tx + fee double-count) once ratified.
- **Couples to PR-16** (the malformed-output / cohabitation disposition must be the same ruling) and **PR-1/PR-2** (`F` attributes once to the single anchor's gate-fee Σ).
- Closes the A-area-vs-F-area incompatible-default fork: neither ships its own multiplicity rule.
- Retires the legacy extract-all / skip-malformed path.

**Non-goals / dependencies:**
- **Non-goal:** the general intra-tx ordering of multiple ONT EVENTS (that is PR-16; PR-4 is specifically RootAnchor multiplicity + fee-attribution).
- **Dependency:** PR-16 for the cohabitation/skip-bad disposition (keep (4) consistent); PR-1/PR-2 for the fee Σ the single anchor's `F` feeds.
- **Independent of #49/#50.**

**Attack if rejected (what breaks without PR-4):**
- The A-area (anchor acceptance) and F-area (gate-fee) ship **incompatible defaults** for multi-anchor txs — an honest-node fork (the P0 core).
- Under all-count without a fee-attribution rule, one tx's fee `F` **double-counts** across multiple anchors' gates (F5-01) — a fee-evasion / Σ-gate exploit.
- The multi-OP_RETURN disposition stays unstated (A1-01), so skip-vs-reject diverges across implementations.

---

## PR-5. First-anchor-wins = earliest-VALID-anchor (conflict C1)

**Flags (4):** A12-01, D5-01, B8-01, B11-01. **Registry priority:** P1. **Blocking dependency:** new one-sentence named spec decision; no open named decision implicated (the recommended amendment is writable now and independent of #49 and PR-1, but is not ratified law until DK rules).

**Options**
- **(a) earliest-VALID-anchor** — the lifecycle keys to the earliest anchor that passed ALL eligibility verdicts (accepted + DA-eligible + gate-fee-covered); a forfeited/excluded anchor confers no priority, and a post-exclusion re-anchor starts a fresh window at its own height.
- **(b) earliest-ANCHORED** — the earliest decodable anchor on-chain wins priority regardless of whether it was ever eligible.

**Recommendation (advisory, for DK ratification): (a) earliest-VALID-anchor.**
Option (b) lets a withheld or DA-failed anchor resurrect priority simply by being earliest on-chain — the withhold-then-reveal resurrection attack — and lets an ineligible anchor block honest claimants. Option (a) closes both: a forfeited/excluded anchor confers no priority, and a post-exclusion re-anchor starts fresh, which is what "first-anchor-wins" is meant to express (the earliest *valid* claim holds; ordering never awards a contested name — bonds do, per #37). Conflict C1 resolves toward (a); same-(name,owner) re-claims are idempotent. This is the registry's stated conflict-resolved direction.

**Ripple**
- Locks the A12 / B8 / D5 / B11 (priority half) vectors once ratified.
- The recommended amendment is independent of #49 and PR-1 — those gate the *enforceability* of the forfeit verdict (served-bytes witness + window timing), not the definition itself; it is writable now as a one-sentence amendment to the first-anchor-wins definition (GLOSSARY + the DA agreement), but is not ratified law until DK rules.
- **Pairs with PR-6** (same first-anchor-wins definition block: "competing claim" = distinct-owner-key).
- No new attack surface; it removes one (withhold-then-reveal resurrection).

---

## PR-16. Kernel evaluation-order / intra-block + intra-transaction total order (conflict C20; gaps G2/G3) — EXPANDED

**Flags (13):** A9-01, F12-02, T10-01, Z7-02, S13-02, X5-01, X7-01, G1-03, G2-01, G2-02, G3-01, G3-02, G4-01. **Registry priority:** P0 (broad fork surface — without a pinned total order two honest replayers derive different owners). **Blocking dependency:** new named evaluation-order spec decision (ONT_ACQUISITION_STATE_MACHINE merge section or a new B2 kernel spec); independent of #49; the G4 recovery facets split across #50 (transfer-vs-recovery precedence), PR-35 (recovery-finalization transition point + cancel-at-finalizeHeight), and PR-13 (boundary convention) — PR-16 supplies only the common same-block order, not the recovery-finalization rule.

**Decision surface (the sub-rulings DK makes):**
1. The canonical same-block total-order tuple.
2. #25 reconciliation (block-tx-index vs the publisher-spec "txid tiebreak" sentence).
3. Whether one Bitcoin tx may carry multiple ONT events, and their intra-tx apply order.
4. Disposition when a valid event coexists with an undecodable payload in one tx (reject-all / first-only / skip-bad).
5. Same-outpoint contention (two events naming one `successorBondVout` / shared head outpoint).
6. Whether an accepted same-block bid resets the minimum-increment basis for later same-block bids.
7. The per-transition-class evaluation point (does a height-h-triggered transition fire before or after the height-h block's events).
8. The #37 bound (ordering governs chain extension / grief resistance, never awards a contested name).

**Options** (the live fork is mostly sub-decisions 3–6; 1–2, 7–8 have a clear lean):
- **(1) tuple** — (a) ascending (block height, intra-block transaction index, ascending vout) [Bitcoin-canonical, miner-observable] vs (b) any txid-derived order.
- **(3) multi-event tx** — (a) allow, apply each decodable event in ascending-vout order vs (b) one-ONT-event-per-tx (reject a tx carrying >1).
- **(4) undecodable cohabitation** — (a) skip-bad (process decodable events, ignore undecodable outputs) vs (b) reject-all (any undecodable ONT-shaped payload poisons the tx) vs (c) first-only.
- **(5) same-outpoint contention** — (a) earliest-in-total-order consumes the outpoint, later contenders rejected vs (b) reject-all-contenders.
- **(6) min-increment basis** — (a) running basis (apply bids in order, each accepted bid resets the basis) vs (b) pre-block basis (all same-block bids measured against the head-of-block state).

**Recommendation (advisory, for DK ratification):**
- **(1) tuple = (a)** ascending (height, tx-index, vout) — the chain's own deterministic order, miner-observable, and the only order #25 already commits to. This is the "commit-priority tuple."
- **(2) #25 reconciliation:** ratified #25 (earlier-in-block-transaction-order wins) controls; the publisher-spec "txid tiebreak" sentence is **superseded** (txid is grindable and is not the chain's apply order) — correct/delete it. Per A9, extending #25's tie-break from auction-bids to all same-block event classes is a NEW rule PR-16 states explicitly, not an analogy.
- **(3) = (a)** allow multiple decodable ONT events per tx, applied in ascending-vout order (rejecting a whole tx for carrying two events is brittle and itself miner-griefable).
- **(4) = (a) skip-bad** — each decodable ONT event is independently tested in vout order; undecodable / non-ONT outputs are ignored. Consistent with per-output wire framing and the A1 multi-OP_RETURN direction. (Alternative (b) reject-all is the more conservative fail-closed reading; flagged because it changes the borderline-payload attack surface — a genuine DK fork.)
- **(5) = (a)** earliest-in-total-order consumes the contested outpoint; a later event targeting an already-consumed outpoint is rejected (an ONT-layer double-spend of the bond/head outpoint).
- **(6) = (a) running basis** — same-block bids apply in total order, each accepted bid resetting the minimum-increment basis for later ones (the total order is a true apply sequence, not a set).
- **(7) eval point:** a transition triggered at height h is evaluated **after** all height-h block events are ordered and applied (the block is fully observed before height-h-triggered transitions fire); state per transition class.
- **(8) #37 bound:** ordering decides determinism and grief-resistance ONLY; a contested name is never awarded by ordering — the qualifying bond awards it (#37). State this verbatim.

**Minimal amendment text (one block, for the merge section):**
> Same-block total order. Within a confirmed block, ONT events apply in ascending order of (block height, intra-block transaction index, output index). Multiple ONT events in one transaction apply in ascending output-index order; undecodable or non-ONT outputs are ignored and do not poison sibling events. When two events would consume the same successor outpoint, the earliest in this order consumes it and later contenders are rejected. Accepted bids reset the minimum-increment basis for later same-block bids in this order. A transition triggered at height h is evaluated after all height-h events apply. This order governs chain-extension determinism and grief resistance only; it never awards a contested name — a contested name is awarded solely by the qualifying bond (Decision #37).

**Ripple:**
- Locks the priority/ordering halves of A9, T10, X5, X7, S13, Z7, G1, G2 (all three flags), G3 (both flags), and the same-block-ORDER touchpoint of G4 (the common order only — NOT G4's recovery-finalization rule, which is PR-35) once ratified.
- Retires the publisher-spec txid-tiebreak sentence and supersedes any "txid" ordering language repo-wide.
- **Pairs with PR-17** (state-head linkage / replay-immunity — X5's head-advance rests on this apply order) and **overlaps PR-13** (any height-boundary in the eval-point rule uses PR-13's convention).
- **G4 recovery facets are split — PR-16 + #50 do NOT close them alone:** (a) transfer-vs-recovery *precedence* inside a challenge window is **#50**-parameterized (cf. X13); (b) the **G4-01 cancel-at-finalizeHeight off-by-one** and the **G4-03 recovery-finalization transition point / which-key-authorizes-a-same-block-transfer** are **PR-35** territory, with the boundary edge itself under **PR-13**. PR-16 supplies ONLY the common same-block order; it does not by itself resolve the recovery-finalization deadline/transition rules unless DK deliberately folds PR-35 into PR-16. The separate PR-35 registry entry stands.

**Non-goals / dependencies:**
- **Non-goal:** deciding contested ownership (that is #37 bonds, not ordering) — the #37 bound is stated precisely so ordering is never read as an award mechanism.
- **Independent of #49** (DA windows are orthogonal to same-block apply order).
- **G4 recovery facets (multi-PR, not collapsible into PR-16):** transfer-vs-recovery precedence is **#50**; the cancel-at-finalizeHeight boundary (G4-01) and the recovery-finalization transition point / same-block-transfer authorizing key (G4-03) are **PR-35** + **PR-13**. PR-16 supplies only the common order — it does NOT subsume the PR-35 entry.
- **Overlaps** PR-13 (boundary convention) and PR-17 (head linkage); neither blocks PR-16's core tuple.

**Attack if rejected (what breaks without PR-16):**
- Two honest replayers derive **different owners** from the same block whenever two same-block events touch one name or outpoint — a consensus fork (G2-01, the P0 core).
- A miner gains ordering power to choose which competing anchor / transfer / bond applies (A9-01, G2-02, X7-01).
- Minimum-increment **grinding**: a bidder games same-block ordering to dodge the increment basis (G1-03).
- Undecodable-payload **borderline fork** (G3-01) and same-outpoint **double-consume** ambiguity (G3-02, S13-02).

---

*Format (ChatLunatique-approved 2026-06-14, event 041948bc): this advisory packet
doc stays separate from the neutral registry. Remaining PRs (PR-1..PR-4,
PR-6..PR-36) follow the same compact Options → Recommendation → Ripple shape,
EXCEPT the P0 / fork-surface packets — PR-1, PR-2, PR-3, PR-4, PR-16 — which get
an expanded packet adding Decision surface, Non-goals/dependencies, Minimal
amendment text, and Attack-if-rejected. PR-16 gets the fullest marker-fold-style
treatment (it bundles total order, intra-tx order, malformed cohabitation, and
same-outpoint contention).*
