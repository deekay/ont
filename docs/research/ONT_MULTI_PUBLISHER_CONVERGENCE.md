# Multi-publisher convergence — design note

Status: design note, not frozen. Surfaces a real tension in the current
code and proposes a direction. The neutrality-sensitive choices at the end
need a human decision before any of this is wired.

Companion to `ONT_PUBLISHER_PROTOCOL_SPEC.md`, which deliberately scoped
multi-publisher coordination *out* ("each publisher runs independently;
conflicts resolve at the consensus layer"). This note is about what that
sentence actually requires, because the code does not yet deliver it — and
two parts of the code currently assume contradictory things.

## The problem in one paragraph

Two honest publishers, P and Q, both serve cheap-rail claims against the
same name accumulator. Each builds a batch on what it believes is the
current root, anchors an OP_RETURN committing `prevRoot -> newRoot`, and
pays the miner fee that covers its batch's gates. If both build on the same
tip and both land in nearby blocks, only one can be "the next root" under a
strict chain. The other's anchor — full of valid, mostly non-conflicting
claims — looks stale. What happens to it? Who decides the canonical root?
How does a wallet learn whether *its* name made it in, regardless of which
publisher's anchor won? None of that is wired today, and the piece that
*is* wired (`RootChain`) gives the wrong answer for more than one writer.

## Two models are fighting in the repo

There are two root-advancement designs in the tree right now, and they are
not compatible.

**Model A — single-writer chain (`packages/core/src/research/root-anchor.ts`).**
`RootChain.apply()` accepts an anchor only if `prevRoot === tip`, else
returns `stale_or_wrong_prev_root` and leaves the tip unchanged. It also
rejects `newRoot === prevRoot` as a no-op. This is a clean, light-client-
friendly model: you can follow the name root from OP_RETURN bytes alone,
because each anchor's `newRoot` *is* the canonical tip. But it only works
with a single writer (or writers that never collide). Give it two honest
publishers building on the same tip and it throws away one of them wholesale
— including every non-conflicting name in that batch. `apps/publisher`
follows Model A implicitly: `sealBatch()` computes `prevRoot` from the
publisher's *own* `Accumulator` (its private view of history, containing
only its own batches) and commits `prevRoot -> newRoot` as if it were the
sole writer.

**Model B — leaderless merge (`packages/core/src/research/delta-merge-sim.ts`
+ `da-convergence-sim.ts`).** Each publisher's anchor is a *delta*: a set of
`(leaf -> value)` insertions proven against the last confirmed canonical
root. The canonical next root is *derived* by `mergeBlock()`, which collects
every delta anchored in a block, resolves same-leaf conflicts by commit
priority (`(height, txIndex, txid)` ascending — earliest wins), and folds
the winners into one root. Distinct-leaf inserts commute, so the merged root
is independent of delta order; the simulator's tests assert exactly this
(commutativity, miner-reordering immunity, conflict determinism). Layered on
top, `da-convergence-sim.ts` decides *which* deltas count using only
Bitcoin-witnessed facts (an availability marker mined by `anchorHeight + W`,
plus the bytes surfacing to the network by `+ W + C`), fail-closed, so a
withheld or late-revealed delta is excluded rather than fatal — which is what
defeats withhold-then-reveal name theft.

Model B is the right answer for a permissionless, neutral system. **It is
also not wired into anything.** The resolver has no merge code (grep
`apps/resolver/src` for `mergeBlock`/`confirmedStateForNode` — nothing). The
publisher emits Model-A anchors. So today the project has a correct
multi-publisher design living only as a simulator, and a single-writer
validator living in the path that real software would actually call.

The first job of any convergence work is to **pick B and retire A from the
canonical path** (A can survive as a single-publisher / regtest fast path).
Everything below assumes that decision.

## What "canonical root" means under Model B

The cleanest formulation drops per-anchor chaining entirely. The canonical
name root at finalized height H is a pure function:

```
canonicalRoot(H) = fold( DA-valid deltas with anchorHeight <= H-K,
                         ordered by (height, txIndex, txid),
                         resolving same-leaf conflicts by first-writer-wins )
```

This is precisely `confirmedStateForNode()` in `da-convergence-sim.ts`.
Notice what it does *not* use: the per-anchor `prevRoot`/`newRoot`. Under a
pure fold, those fields are not load-bearing for canonical derivation at all.
Every honest indexer that sees the same DA-valid delta set computes the same
root, in any processing order. That is the convergence guarantee, and it is
already proven in `da-convergence-sim.test.ts`.

So what are `prevRoot`/`newRoot` in the 68-byte OP_RETURN *for*, then?

- `prevRoot` = the canonical root the publisher built against. Useful as a
  freshness hint and as the base for the next field. Not a chain link.
- `newRoot` = `root(prevRoot ⊕ this delta)` — the root *if this delta were
  the only one applied to that base*. Its real job is **DA binding**: given
  the published batch leaves (from `GET /batch/{batchId}`) and `prevRoot`, an
  indexer recomputes this value and rejects the anchor if it does not match.
  That stops a publisher from anchoring one delta on-chain and serving
  different bytes off-chain. It is *not* the canonical tip when more than one
  delta lands.

The consequence worth stating plainly: **under Model B you cannot follow the
name root from OP_RETURN bytes alone.** Per-anchor `newRoot`s do not compose
(each is computed against the same base, not chained), so deriving the
canonical root requires the deltas — i.e. the DA layer is mandatory for root
derivation, not just for inclusion proofs. That is a genuine loss versus
Model A's headers-only follow, and it motivates checkpoints (below).

## Checkpoints: giving light clients a chain back

Pure fold is correct but expensive to follow. Recover the cheap follow
without reintroducing a privileged writer using **checkpoint anchors**.

A checkpoint anchor commits `(windowStartRoot -> windowEndRoot, finalizedHeight)`
for a finalized window — the merged canonical root over that window, computed
by the public rule. `verifyCheckpoint()` already exists in
`delta-merge-sim.ts`: it recomputes the merge from the prior root and the
window's deltas and accepts the claimed root only if it matches. A wrong
checkpoint is rejected by recomputation; there is no trusted proposer.

This gives the reconciliation:

- **Deltas** are leaderless, commutative, conflict-resolved by commit
  priority. Anyone publishes them. (Model B.)
- **Checkpoints** are a chained, DA-verifiable root that light clients follow
  cheaply — and are *also* permissionless, because anyone can post the correct
  one and any wrong one is rejected by anyone who recomputes. (Recovers Model
  A's ergonomics without its single writer.)

Open question this raises: **who pays for checkpoints, and how often?** A
checkpoint is an L1 transaction someone has to fund. Options, roughly in
increasing centralization risk: piggyback the checkpoint commitment onto the
next claim anchor (free-ish, irregular); resolvers post them as a public
good (altruistic, fine as long as it stays permissionless); a small fee
market for checkpoint posting (most robust, most mechanism). None require a
licensed role, which is the line that must not be crossed.

## Publisher behavior under Model B

Concrete changes to `apps/publisher` once B is the target:

1. **Build against the canonical root, not a private accumulator.** Today
   `sealBatch()` reads `this.accumulator.root()`. In a multi-publisher world
   that is the publisher's own partial history and is wrong. The publisher
   needs a canonical-root source (a resolver client) to set `prevRoot`.

2. **Treat `newRoot` as a delta commitment, not a promise.** The publisher
   still computes it (it is the DA binding), but it must not assume its
   `newRoot` becomes the tip. Its job ends at "I anchored a DA-available,
   fee-sufficient delta on a fresh base."

3. **Detect loss and refund per-leaf, not per-batch.** After finalization,
   the publisher reads the canonical accumulator and checks each of its
   leaves. Three outcomes per leaf:
   - *applied* — the leaf is present with this claimant's value. Deliver the
     inclusion proof (against the canonical root) as today.
   - *dropped_existing* — the name was already taken on a prior canonical
     root. The publisher should have caught this at quote time, but a race
     between quote and anchor can still produce it. Refund.
   - *dropped_conflict* — another anchor inserted the same leaf with earlier
     commit priority. This is the contested case (below). Refund the service
     portion; the gate is already spent as miner fee.

4. **Rebatch is rarely needed.** Because distinct-leaf inserts commute and
   the merge re-applies winners against the *current* canonical root, a
   publisher whose base went slightly stale does not have to rebuild its
   whole batch — only the specific leaves that lost or already existed get
   dropped, and the rest still land. This is a real benefit of B over A's
   all-or-nothing rejection, and it bounds wasted work to the genuinely
   contested names.

## Wallet behavior under Model B

The wallet already re-verifies the publisher's promises locally (leaf ===
sha256(name), ownerCommitment === owner key, inclusion proof via
`verifyAccumulatorProof`). Multi-publisher adds one more check it must do
*against the canonical root*, not the publisher's claimed root:

- After finalization, fetch the canonical accumulator state (from a resolver)
  and confirm the leaf for the claimed name commits *this wallet's* owner
  key. If it commits someone else's key, the wallet lost a same-name conflict
  — it does not own the name, regardless of what the publisher's receipt said.

This is the case that matters: a wallet must never record a name as owned on
the strength of a publisher receipt alone, because the publisher cannot know
at submit time whether its anchor will win the leaf.

## The contested-claim collision with the one-path model

This is the part that needs a human decision, because it touches the core
"uncontested = cheap claim, contested = bonded auction" model directly.

The cheap rail's failure mode is a same-name conflict: two claimants pay the
₿1,000 gate for the same name in the same window; commit priority picks one;
the other loses the name and the gate (the service fee is refundable, but the
gate is already spent as the miner fee on the anchor that happened to lose).
For a ₿1,000 (~$1) gate that is a fine anti-spam outcome in the abstract. But
it sits awkwardly with the promise that contested names route to an auction
rather than a first-confirmed-wins race.

The unresolved question: **is a fresh cheap-rail claim final on first
confirmation, or provisional for a challenge window during which a competing
demand escalates it to the bonded L1 auction?**

- *First-confirmed-wins final.* Simplest. "Contested → auction" then only
  means "if you both try at once, the gate race decides it, and the loser
  re-tries elsewhere." But there is no elsewhere once the name is owned — so
  this quietly removes the auction's role for cold-start contention.
- *Provisional + challenge window.* A fresh claim is tentative for W blocks;
  a competing claimant who shows up in the window forces a second-price
  auction between them; absent a challenger it finalizes. This is what makes
  "contested → auction" real, but it adds a window where a name is not yet
  settled, complicates inclusion proofs (provisional vs final), and needs the
  auction and cheap rails to share state.

`docs/design/ONT_MEV_ORDERING_ANALYSIS.md` is the right neighbor for the
ordering/fairness half of this; the auction mechanics live with the L1
auction rail. I do not think this should be decided unilaterally — it is a
protocol-shape decision, not an implementation detail.

## Neutrality tradeoffs (the decisions that need you)

1. **Coordination vs leaderless.** Publishers *could* coordinate off-chain to
   partition the namespace (P serves a–m, Q serves n–z) and avoid collisions
   entirely. That removes wasted fees but creates a coordination layer that
   can become a cartel or a chokepoint — a neutrality red flag. Recommendation:
   keep the protocol purely leaderless (first-writer-wins by commit priority);
   allow voluntary coordination as an optimization that the protocol never
   requires or privileges.

2. **Who funds checkpoints.** Covered above. The constraint is permissionless
   + recomputable; the choice among piggyback / public-good / fee-market is
   open.

3. **Sunk-fee griefing bound.** A griefer can pay gates to lose name races on
   purpose, burning a victim publisher's L1 anchor fee. The bound is "griefer
   pays the gate too," which for ₿1,000 is real money per attempt and scales
   linearly with the griefing. Probably acceptable; worth naming as a known
   cost rather than discovering it later.

## Recommended path (phased, low-risk first)

1. **Decide A-vs-B explicitly and write it down.** Retire `RootChain` from the
   canonical path; keep it as a single-publisher/regtest fast path with a
   comment pointing here. (Doc + small code comment. No behavior change yet.)
2. **Lift `mergeBlock`/`confirmedStateForNode` out of research and into the
   resolver** as the canonical-root deriver, behind the DA windows from
   `da-convergence-sim.ts`. This is the load-bearing wiring and the most
   valuable single step. It is mostly promotion of already-tested code.
3. **Point the publisher's `prevRoot` at the canonical root** (resolver
   client) and add per-leaf loss detection + refund.
4. **Add the canonical-root re-check to the wallet** before it records a name
   as owned.
5. **Checkpoints** once 2–4 are real, to restore cheap light-client follow.
6. **Decide the contested-claim question** (final vs provisional+challenge)
   before the cheap rail is exposed to genuinely contested names; until then
   the cheap rail is honestly an uncontested-names-only path and should say so.

## Why this is worth doing now

The whole "anyone can run a publisher, a wallet can fall back to another"
claim — the thing that makes the publisher non-custodial in the strong sense
— is only true once two publishers can coexist without one silently voiding
the other. Right now they cannot, and the gap is invisible because every test
and smoke runs a single publisher. This is the unsolved problem that gates
running more than one.
