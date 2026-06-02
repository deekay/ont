# Candidate: Bitcoin-Anchored Insertion-Unique Name Accumulator

Status: candidate design + feasibility analysis. Judged against
[ONT_DESIGN_REQUIREMENTS.md](../design/ONT_DESIGN_REQUIREMENTS.md). Not a v1 commitment.

> Note: the **allocation model** was refined after this doc was written. Names are
> now **publicly visible** at claim, and contention triggers the contested L1
> auction path rather than pure earliest-commit first-come. The current design is
> in [ONT_ACQUISITION_STATE_MACHINE.md](../design/ONT_ACQUISITION_STATE_MACHINE.md);
> the accumulator mechanics, DA rules, sequencer, and red-team below remain useful
> background but this file is not the launch spec.

## What this is

A flat, global namespace held as a single authenticated set whose root is
committed to Bitcoin. A name becomes owned the moment it is **inserted** into
the set; uniqueness is enforced *at insertion* (you cannot insert a name already
present), so there is no challenge window to exploit and no "prove no challenge
happened over time" obligation. Bitcoin orders the root updates and is the
un-censorable fallback. Off-chain work compresses everything except ordering and
uniqueness, which stay anchored to Bitcoin — but anchored **once per batch**, not
once per name.

It is, honestly named, a **Bitcoin-sequenced sovereign rollup of names**.
Bitcoin does not *execute* it; ONT clients validate it by replay. The design's
job is to make that safe under the requirements.

## Verdict up front

Feasible with existing primitives — sparse Merkle trees, commit-reveal, Bitcoin
anchoring, content-addressed data — and **no soft fork**. Its *safety*
(uniqueness, sovereignty, no-forgery) is strong and Bitcoin-anchored. Its
*liveness* rests on one irreducible assumption — data availability — which
degrades **gracefully**: under DA failure you cannot make new claims, but you
cannot lose names you already hold. That asymmetry is what makes it defensible.
(Caveat surfaced by red-teaming: this holds for live operation and for existing
owners who retain their own proofs; a *late-joining* full verifier still depends
on historical data availability or anchored snapshots — see Red-team findings.)

## Why this shape (the five jobs of an L1 bond)

An L1 bond bundles: (1) ordering, (2) uniqueness, (3) Sybil/squat cost,
(4) sovereign finality, (5) censorship resistance. Off-chain work can absorb
3–5; it cannot manufacture 1–2 cheaply (Byzantine agreement has an irreducible
per-binding cost). So we keep 1–2 on Bitcoin but anchor them **compactly**: one
root commitment covers a whole batch of names.

Scaling: a root commitment is ~150 vB. A batch of `N` insertions costs ~`150/N`
vB per name. At `N = 10,000` that is ~`0.015 vB/name` → on the order of tens of
billions of names/year at 1% of Bitcoin blockspace. Blockspace stops being the
binding constraint; data availability becomes it.

## Data structures

- **Names set.** A Sparse Merkle Tree keyed by `H(name)`. Every key has a leaf,
  empty or filled. Supports compact **membership** proofs (`H(name)` → leaf) and
  **non-membership** proofs (leaf at `H(name)` is empty). No trusted setup.
  - Leaf (filled): `{ owner_key, destination_head_hash, claim_height }`.
- **Accumulator chain.** A sequence of roots `R₀ → R₁ → …`. Each `R_{n+1}` is
  published in a Bitcoin transaction that commits to the new root and references
  the off-chain **batch data** that justifies the transition `R_n → R_{n+1}`.
- **Batch data** (content-addressed, mirrored): the ordered operations
  (commits, reveals, transfers), their signatures, and the pre/post Merkle paths
  needed to replay the transition.
- **Destination records** stay off-chain and owner-signed, as today. The leaf
  commits only to the *head hash*; routine destination updates do **not** need a
  batch op (preserves cheap, frequent updates).

## Lifecycle

### Claim (commit–reveal, to defeat front-running)

1. **Commit.** Claimer computes `commit = H(name ‖ owner_key ‖ nonce)` and
   submits it (in a batch, or directly to L1 for censorship resistance) with the
   issuance-gate proof attached. Priority for the name is fixed by the Bitcoin
   height at which the commit anchors. The name is hidden, so no publisher or
   observer can jump ahead of it.
2. **Reveal** (after the commit anchors + a minimum delay). The reveal op, when
   processed:
   - confirms this is the earliest unrevealed commit for the name, by Bitcoin
     order (deterministic hash tiebreak within a height);
   - verifies **non-membership** of `name` at the current root;
   - inserts the leaf; emits `R_{n+1}`, anchored to Bitcoin.
3. **Conflict & expiry.** Multiple commits for one name → earliest (Bitcoin
   order) wins; later reveals fail non-membership. A commit not revealed within
   `W` blocks **expires** so it cannot block others, and the issuance gate is
   charged at **commit** time so commit-spam is not free. Fully deterministic, so
   two honest replayers always agree (I1).

### Resolve

1. Read the current canonical root from the latest `K`-confirmed accumulator-chain
   Bitcoin tx.
2. Get a membership proof for `H(name)` from any indexer; verify against the root.
3. Fetch the owner-signed destination record at `destination_head_hash`; verify
   the `owner_key` signature.
4. One root, one leaf per name → one destination. Unambiguous.

### Prove (portable)

Owner carries: their leaf, a membership proof against an anchored root `R_k`, the
Bitcoin tx anchoring `R_k`, and either a fresh proof against the tip (from any
indexer) or the validated chain `R_k → tip`. A fresh verifier checks the anchor
in Bitcoin, the proof, and that no valid owner-signed transfer occurred after
`R_k`.

### Transfer / update

- **Transfer:** owner signs `transfer(name, new_owner_key)`; batch op updates the
  leaf; new root anchors. Provable like a claim. Assurance tier travels with the
  name; transfer does not reopen anything.
- **Update destination:** owner signs a new record; resolved via `owner_key`. No
  accumulator op required.

### Censorship fallback (I5)

If publishers refuse to include your claim, post the commit/reveal **directly to
Bitcoin**. The replay rule processes direct-L1 claims *and* batch ops together,
ordered by Bitcoin height, with direct-L1 claims un-censorable. You pay L1 cost
once; thereafter the name lives in the accumulator like any other. Cheap normal
path, expensive guaranteed path.

## Who builds batches

- **Bootstrap (allowed under the §9 sunset test):** a single operator orders ops
  and anchors roots. Its power is limited to **ordering and censoring** — it
  cannot forge ownership (claims are owner-signed) and cannot fabricate a taken
  name (a root that double-inserts is an invalid transition, detectable by anyone
  who replays the batch data). Censorship is escaped via the direct-L1 path.
- **Target (I3-clean):** permissionless, **Bitcoin-sequenced** batch production.
  Anyone may publish the next batch by anchoring a valid `R_{n+1}` that extends
  the canonical tip; Bitcoin tx order is the sequencer. Conflicting extensions
  are resolved by Bitcoin order; the loser rebases its ops. Open work: batch
  contention and publisher fee dynamics (see risks).

The trust delta vs. a normal L1 name is therefore narrow: a publisher can delay
or reorder *uncontested* claims (mitigated by commit-reveal + L1 fallback) but
cannot decide ownership.

## Data availability rules

- A root is **valid to clients only if its batch data is available.** Clients
  **fail closed**: a root whose leaves cannot be retrieved is treated as invalid,
  so the chain cannot advance past hidden data.
- **Owner-aligned DA:** each owner retains their own leaf + path + inserting
  batch. The union of what owners keep approximates the full set; archival
  mirrors add redundancy and serve non-membership neighborhoods to new claimants.
- **Damage is liveness, not safety.** Withholding data blocks *new* claims
  (can't build non-membership proofs) but cannot alter or steal *existing* names:
  changing a name needs a valid owner signature (unforgeable) and a non-withheld,
  valid transition (or it's rejected). Existing ownership remains provable from
  the owner's own retained data against a Bitcoin-anchored root.

## Adversary analysis

| Adversary | Defense | Residual |
| --- | --- | --- |
| Squatter | Issuance gate (PoW/fee, pluggable) makes mass-claiming cost scale linearly | Accumulator alone does not deter; depends on the gate |
| Griefer | Commit-reveal + non-membership + direct-L1 fallback; can't cheaply block claims | Data withholding (below) |
| Censor (publisher) | Direct-L1 claim path is un-censorable (I5) | Pays L1 cost in the censored case |
| Equivocator | Can't forge sigs; double-insert is a detectable invalid transition; conflicting roots resolved by Bitcoin order | None on safety |
| Sybil | Issuance gate; publisher Sybil can't forge or double-insert | None on safety |
| Publisher-griefer (submits a batch, never pays) | Publisher fronts the miner fee only for claims with a committed/locked payment; a non-payer is simply excluded — no money loss (see [`../design/ONT_ISSUANCE_FEE_MECHANICS.md`](../design/ONT_ISSUANCE_FEE_MECHANICS.md) §6) | Ordinary service-DoS (work/slots) → publisher admission cost (entry fee / payment-lock / PoW); L1 fallback means no one is denied a name |
| Data-withholder | Fail-closed clients; owner-aligned DA; liveness-only damage | **The one real open problem** |

## Scoring against the invariants

| Invariant | Result | Notes |
| --- | --- | --- |
| I1 Uniqueness | **Pass** | Enforced at insertion; double-insert detectable; commit-reveal fixes ordering fairness; deterministic replay |
| I2 Sovereignty | **Pass** | One-time cost, no rent, no revocation, owner-key control. Caveat: a *current* proof must be refreshed against current state (control preserved; refresh depends on DA) |
| I3 Neutrality | **Pass at target** | Mechanical rules, no editor; permissionless Bitcoin-sequenced batches; bootstrap operator allowed only under the §9 sunset test |
| I4 Verifiability | **Pass, conditional** | Light clients: compact proofs + honest-watcher fraud detection. Full indexers: replay. Rests on DA + ≥1 honest full verifier (optimistic assumption — stated, not hidden) |
| I5 Bitcoin settlement | **Pass** | Roots ordered by Bitcoin; direct-L1 claim is the un-censorable fallback; reorgs handled by `K`-confirm finality + deterministic replay |

## Honest residual risks / open problems

1. **Data availability** is the single irreducible assumption. It degrades
   liveness, not safety — but the bootstrap operator's DA, the fail-closed rule,
   and owner-aligned retention all need to be shown to actually hold under an
   adversary. This is the make-or-break.
2. **Full-verifier state growth.** Light, per-name verification is `O(log N)` and
   does **not** grow with the namespace (satisfies T3 for users). But a fresh
   *full* indexer reconstructing everything is `O(N)` (≈ hundreds of GB at
   billions of names). Mitigation: Bitcoin-anchored state snapshots + pruning of
   superseded ops (analogous to assumeutxo). Tension with a strict reading of T3;
   call it out.
3. **Permissionless batch production** needs a concrete contention/fee design so
   it doesn't quietly collapse back to one privileged publisher.
4. **Proof refresh.** Membership paths go stale as the tree mutates; producing a
   current proof needs current-tree access (an indexer). Ownership (control) is
   sovereign regardless; resolution liveness depends on DA.
5. **Reorg depth `K`** and the minimum commit→reveal delay are parameters that
   trade latency against safety; pick explicitly.

## Red-team findings

The design was attacked as the data-withholder and the permissionless-sequencer,
targeting safety (uniqueness, no-forgery) and I3.

**Survived.** No way was found to make two honest contemporaneous verifiers
disagree on ownership, to insert a name already owned (double-insert is a
detectable invalid transition; withheld → fail-closed reject), to front-run a
reveal (commits hide the name; a censoring publisher can only delay, never take —
the victim reveals via direct-L1), or to steal/alter a name without the owner key.

**Patches the attack forced (now required rules):**

1. **Commit TTL.** Unrevealed commits expire after `W` blocks, else a squatter
   blocks names by committing and never revealing.
2. **Gate at commit time.** The issuance cost attaches to the commit, not the
   reveal, so commit-spam is not free.
3. **Genesis rule.** Claiming opens at an announced Bitcoin height; commits
   anchored before it are invalid. Prevents a bootstrap operator pre-claiming
   (satisfies §9 #5, no retroactive capture).
4. **Replay protection.** Owner signatures are domain-separated and carry a
   monotonic per-name op counter, so a transfer/update cannot be replayed.
5. **Destination freshness.** The accumulator makes *ownership* unique, but the
   *destination* a name points to inherits v1's owner-signed off-chain record
   model. For a payment handle, bind records to a monotonic version + a recent
   Bitcoin-height freshness marker, so a resolver cannot route to a stale address.
   (Not introduced by the accumulator, but it is where payment ambiguity could
   re-enter.)

**Claims downgraded for honesty:**

- "DA failure is liveness-only, *never* safety" was too strong. It holds for live
  operation and for existing owners who retain their own proofs (the canonical
  tip cannot advance past withheld data, so their last-valid proof stays current).
  But a *late-joining full verifier* reconstructing from genesis depends on
  historical DA, or on **anchored state snapshots** it must partly trust — the
  same situation as Bitcoin's assumeutxo. Bounded, not eliminated.
- I3 is clean on **ownership** (mechanical rules, no editor) but **bounded** on
  **inclusion/ordering**. Permissionless batch production can concentrate toward
  whoever has the most capital/infrastructure, creating a service-fee dynamic.
  This is defanged, not eliminated: the direct-L1 fallback caps a dominant
  publisher's pricing at ~L1 cost (users defect to L1 above it) and ownership
  decisions stay mechanical. A persistent censor can impose a one-time L1 cost on
  victims — real but bounded griefing, not registrar power.

## Permissionless sequencer design ("based" sequencing)

The target avoids any privileged sequencer and needs no covenant or soft fork.

**Canonical chain.** Genesis is the empty-tree root `R₀` at the announced height.
The canonical chain is the sequence of **valid, data-available** root transitions,
ordered by Bitcoin `(block height, tx index)`.

**Publication is open to anyone.** To advance the tip, a publisher broadcasts a
normal Bitcoin transaction (funded by any UTXO they control) carrying an anchor
commitment `(prev_root, new_root, batch_pointer)` in an `OP_RETURN` or Taproot
leaf. No special key, no special UTXO, no on-chain validation of the transition —
Bitcoin only orders the anchor txs.

**Acceptance rule (run by every client):**

1. Process Bitcoin in `(height, tx-index)` order from genesis.
2. An anchor tx is *eligible* if `prev_root` equals the current canonical tip.
3. It is *accepted* iff its batch data is retrievable within the DA window **and**
   the transition is valid (well-formed ops, valid signatures, commit TTL and
   priority respected, insertions satisfy non-membership, no double-insert).
   Direct-L1 claims embedded in Bitcoin txs are folded in at their own height.
4. Otherwise skip it (stale tip, invalid, or withheld).
5. Same-block ties: lower tx index wins; the other rebases.
6. Finality after `K` confirmations; reorgs re-run the rule from the reorg point,
   deterministically.

**Publisher economics (why anyone bothers, and why it stays cheap).** The per-name
**gate is the anchor tx's miner fee**, not publisher revenue: the anchor is valid
only if it pays `≥ Σ gᵢ` to miners, so a publisher can never pocket or compete away
the gate (see [`ONT_ISSUANCE_FEE_MECHANICS.md`](../design/ONT_ISSUANCE_FEE_MECHANICS.md)).
A publisher fronts that fee, aggregates `N` users, and keeps only a thin **service**
margin on top of the gate + blockspace cost. Competition drives that service margin
toward zero. A user who can find no publisher (or is censored) posts their own anchor
tx — a batch of one paying its own `g` as fee — which is the universal fallback and
the ceiling on what any publisher can charge.

**Incentive-aligned data availability.** A publisher who withholds batch data gets
its root rejected (fail-closed): its fee is wasted and its users' ops do not land.
So an honest profit-seeking publisher publishes data; only a griefer withholds,
and griefing costs a Bitcoin tx fee per ignored junk root. Honest indexers archive
and re-serve every batch they accept, so historical availability rests on the
archive set, not the original publisher (an honest-minority storage assumption).

**Pending-op transport.** Commits, reveals, and transfers gossip over a best-effort
public mempool (Nostr-like relays or a P2P pool); publishers select from it.
Censorship there is escaped by the direct-L1 path, so the transport is never
trusted.

## What to prototype to de-risk

1. **SMT with membership + non-membership proofs** over `H(name)`; measure proof
   sizes and insertion cost.
2. **Accumulator chain anchored to a Bitcoin signet:** publish roots, replay
   `R_n → R_{n+1}`, reject invalid transitions.
3. **Fail-closed DA check:** a client that refuses a root whose batch leaves are
   unavailable; demonstrate liveness-degradation-only under withholding.
4. **Direct-L1 fallback:** a censored claim that forces itself into canonical
   state via a Bitcoin tx.
5. **Commit-reveal front-running test:** show a publisher cannot steal a name it
   sees revealed.

If 1–5 hold under the adversary table, this is a real path from v1 L1 sovereignty
to a flat, global, sovereign namespace whose only soft spot is data availability —
and whose data-availability failure costs new claims and late-joiner
trust-minimization, never a name an existing owner still holds and can prove.
