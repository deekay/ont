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

**Flags (13):** A9-01, F12-02, T10-01, Z7-02, S13-02, X5-01, X7-01, G1-03, G2-01, G2-02, G3-01, G3-02, G4-01. **Registry priority:** P0 (broad fork surface — without a pinned total order two honest replayers derive different owners). **Blocking dependency:** new named evaluation-order spec decision (ONT_ACQUISITION_STATE_MACHINE merge section or a new B2 kernel spec); independent of #49, with one #50-parameterized facet (G4 recovery-finalization).

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
- Locks the priority/ordering halves of A9, T10, X5, X7, S13, Z7, G1, G2 (all three flags), G3 (both flags), and the same-block touchpoints of G4 once ratified.
- Retires the publisher-spec txid-tiebreak sentence and supersedes any "txid" ordering language repo-wide.
- **Pairs with PR-17** (state-head linkage / replay-immunity — X5's head-advance rests on this apply order) and **overlaps PR-13** (any height-boundary in the eval-point rule uses PR-13's convention).
- The **G4 recovery-finalization same-block facet is #50-parameterized**: transfer-vs-recovery precedence inside a challenge window is recovery-auth territory (cf. X13). PR-16 fixes the *ordering*; #50 fixes the *precedence rule* the ordering applies.

**Non-goals / dependencies:**
- **Non-goal:** deciding contested ownership (that is #37 bonds, not ordering) — the #37 bound is stated precisely so ordering is never read as an award mechanism.
- **Independent of #49** (DA windows are orthogonal to same-block apply order).
- **One #50 facet:** the G4 transfer-vs-recovery same-block precedence (see Ripple).
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
