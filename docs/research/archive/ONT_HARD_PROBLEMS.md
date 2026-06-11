# ONT — Two Hard Problems: Leaderless Chaining & The Off-Chain Auction

> **SUPERSEDED (2026-06-11):** absorbed into [`docs/OPEN_QUESTIONS.md`](../../OPEN_QUESTIONS.md)
> per doc-canon (#45). Kept for provenance; this copy is no longer updated.


Deep dives on the two **unsolved-mechanism** risks from the
[risk register](./ONT_RISK_REGISTER.md) (R2, R4). One has a candidate solution I'm
fairly confident in; the other has an honest negative result that walks back earlier
optimism.

Status: design analysis, 2026-05-23. Not a commitment.

---

## Problem 1 (R2): Leaderless chaining / throughput

### The problem

To anchor billions of names/year, the tip must advance many times per block (~67
anchors/block at 1% blockspace). In the **root-chaining** model, each anchor commits a
`(prev_root → new_root)` transition, so to stack many per block, publisher B must build
on publisher A's *unconfirmed* root sitting in the mempool. That's fragile:

- The mempool is **not** a total order — miners choose final order. If a miner orders
  anchors differently than the chain expects, every downstream anchor has a stale
  `prev_root` and is skipped → the block advances the tip far less than the anchors it
  contains. Wasted blockspace, throughput doesn't materialize.
- RBF / dropped parents break chains.
- An adversary broadcasting conflicting `R5→R6'` variants can shatter everyone's chains.

Naive independent racing off the *confirmed* tip is worse: only one anchor wins per
round; the rest collide and rebase → collapse to ~1 batch/block (~525M/yr at 1%), or
re-centralize around one publisher who coordinates the chain (kills neutrality).

### The candidate fix: don't chain roots — merge per-block *deltas*

Change the unit of batching from "per-anchor chained roots" to "per-block merged
deltas." The key fact that makes this work:

> **Sparse-Merkle-tree insertions into distinct leaves are commutative.** A name maps to
> a fixed leaf `H(name)`. The resulting tree depends only on the *set* of inserted
> `(leaf → value)` pairs, not the order they're applied. So a set of disjoint insertions
> yields one deterministic post-root regardless of ordering.

So:

1. **Publishers broadcast *deltas*, not chained roots.** A delta = a set of insertions,
   each proven against the **last confirmed root `R_k`** (K blocks back). Publishers do
   **not** see or build on each other — every delta is independent.
2. **The block is the aggregation boundary.** Clients collect every delta anchored in a
   block, validate each against `R_k`, and apply the union to derive the next root
   `R_{k+1}`. The tip advances **once per block**, incorporating *all* valid deltas from
   *every* publisher in it.
3. **Conflicts resolve deterministically.** Two deltas inserting `alice` → resolved by
   commit priority (Bitcoin `(height, tx-index)` of the commits, hash tiebreak). Loser's
   `alice` op is dropped; the rest of its delta still applies. Disjoint insertions never
   invalidate each other's non-membership proofs against `R_k`.
4. **The merged root is *derived*, not committed by any single tx.** Any party can
   compute `R_{k+1}` and publish it as a checkpoint; others verify by recomputation
   (permissionless, not a trusted leader — a wrong checkpoint is rejected). Light clients
   read a verified checkpoint; full clients recompute.

### Why this is better than chaining

- **No inter-publisher coordination at all.** Everyone proves against the same confirmed
  root; the block merges them. Miner ordering within the block is irrelevant
  (commutativity), so reordering attacks evaporate.
- **Strictly better for DA (R1).** A withheld delta is simply *excluded* from the merge —
  it doesn't halt the chain the way a withheld root in a strict chain would. One bad
  publisher can't stall everyone.
- **Same blockspace math, now actually realized:** ~67 delta-commitments/block at 1%, but
  the throughput is no longer coordination-limited.

### Residual gaps (honest)

- **Verification cost:** deriving `R_{k+1}` is O(insertions in block). Fine for full
  nodes; light clients trust a recomputable, challengeable checkpoint.
- **Collision-window latency:** deltas prove against `R_k` (K blocks old), so collisions
  accumulate over that window and are resolved at merge. Adds latency, not unsafety.
- **Checkpoint liveness:** someone must publish each derived root for light clients.
  Permissionless and verifiable, but needs an incentive so it actually happens.

### Prototype (2026-05-23)

`packages/core/src/delta-merge-sim.ts` (+ `delta-merge-sim.test.ts`) is the runnable form of
this mechanism: a binary sparse Merkle tree keyed by `H(name)`, an incremental insert, and a
block-merge with commit-priority conflict resolution. The tests assert, in code, the properties
the design rests on:

- **Commutativity** — all 24 orderings of 4 disjoint insertions produce one identical root, and
  a multi-publisher block merges to the same tip regardless of publisher (i.e. miner) order.
- **Conflict determinism** — same-name claims resolve by ascending `(height, tx-index, txid)`;
  the loser's *other* insertions still land; the merged tree holds the winner's value.
- **DA benefit (R1)** — a withheld delta is simply excluded; the remaining deltas still advance
  the tip rather than halting.
- **Permissionless checkpoints** — a derived root verifies by recomputation; a wrong one is
  rejected. Inclusion / non-membership proofs are compact (non-default siblings only — <32, not
  256).

**Verdict:** R2 is **downgraded from "unsolved" to "candidate, mechanism prototyped."** The
commutativity of disjoint SMT insertions is the unlock, and it holds in code. What remains is
*unvalidated numbers*, not an unsolved mechanism: absolute proof sizes and merge throughput at
billions of leaves still need a signet-scale benchmark (folds into R11).

---

## Problem 2 (R4): The off-chain auction — binding & ordering

### The problem

We chose an **open, visible ascending auction** with **bids gossiped off-chain** (for
the "drama" at sealed-auction blockspace). That bundles three demands that fight:

1. **Visible** — bids public in real time (the spectacle).
2. **Binding** — a bid you can't walk away from.
3. **Cheap** — not one Bitcoin tx per bid increment.

### Honest negative result

Making escalating bids **visible + binding + cheap** at once is **not cleanly achievable
on today's Bitcoin.** The obstacle is binding without per-bid on-chain txs:

- An off-chain bid is only credible if backed by **forfeitable collateral**. But Bitcoin
  can't conditionally enforce "spend this collateral *only* as settlement, else forfeit"
  **without a covenant** (no general covenants without a soft fork).
- The covenant-free workarounds each reintroduce trust:
  - **Pre-signed forfeiture tx** → needs a counterparty to hold/publish it.
  - **DLC / adaptor signatures** → conditional payout on the auction outcome needs an
    **oracle** to declare the winner = trust.
- So a fully off-chain *binding* ascending auction needs **either a soft-fork covenant or
  a trusted auction oracle.** Neither is free.

This walks back the earlier "off-chain bids at sealed-auction cost" claim — that gets you
*visible + cheap* but **not binding**. A non-binding "drama" lets a winner renege.

### What *is* achievable — three realistic options

| Option | Visible drama | Binding | Blockspace | Trust added |
| --- | --- | --- | --- | --- |
| **A. Sealed second-price + on-chain collateral** | ✗ (sealed) | ✓ | Cheap | None |
| **B. Open non-binding signaling → sealed binding settlement** | ✓ (as "talk") | ✓ (at settle) | Cheap | None |
| **C. Open binding *on-chain* ascending** | ✓ (real) | ✓ | Expensive/bid | None |
| D. Open binding *off-chain* ascending | ✓ | ✓ | Cheap | **Covenant or oracle** |

- **A** is the robust default — what the design originally specced. Loses the spectacle.
- **B** separates *drama* from *binding*: bidders openly signal interest/price (off-chain,
  non-binding, exciting) during the notice window, then a **single sealed second-price
  round with on-chain collateral** settles it. You get the show *and* the robustness; the
  catch is the visible part is "just talk" until the sealed round.
- **C** is viable precisely because **contested ≤4-char names are few.** If real drama is
  a must-have, paying full on-chain blockspace for a handful of high-value auctions is
  affordable — the blockspace concern only bit when we imagined *many* auctions.
- **D** is the thing we glibly chose; park it unless a covenant soft fork (e.g.
  `OP_CTV`/`CSFS`-style) lands, at which point it becomes clean.

### Ordering — this part *is* solvable

Independent of binding: anchor the **auction close to a Bitcoin height** (deterministic)
and treat the **on-chain settlement as authoritative**. Off-chain bids are then *advisory*
— they decide *who settles*, but the binding fact is the on-chain settlement at the
deadline. Partition/relay-censorship can't corrupt the outcome: if two parties both think
they won, only one settlement is valid under the rules. Anti-snipe = extend the
Bitcoin-height deadline if a higher settlement-eligible bid lands near close.

**Verdict:** R4's *ordering* is solvable; its *binding* half forces a real choice.
**Recommendation: Option B** (open non-binding drama → sealed settlement) as the default —
it preserves the spectacle and adds no trust — with **Option C** reserved for the rare
marquee name if "the drama must be the real bids." Drop Option D unless covenants arrive.

> **Superseded (decided 2026-05-24): there is no off-chain auction on the accumulator rail.**
> The rail is *uncontested-only*; a contested long-tail name escalates to the existing **L1 bonded
> auction**. This removes the whole "visible + binding + cheap" tension from the rail (you only ever
> auction on L1, the proven path), and it means commit-reveal name-hiding isn't needed on the rail —
> front-running a claim just triggers an auction you'd have to win by bidding. The Option A/B/C analysis
> above is retained only for the L1 auction's own bid mechanics, not for the rail.

---

## What changed in the risk register

- **R2:** Unsolved → **candidate (delta-merge), mechanism prototyped** (`delta-merge-sim.ts`);
  remaining work is scale benchmarking (R11), not mechanism design.
- **R4:** Unsolved → **resolved-with-a-choice**: ordering solved; binding needs Option
  A/B/C (recommend B). The "off-chain binding ascending" ideal needs a soft fork.
