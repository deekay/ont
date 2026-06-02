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

Model B is the right answer for a permissionless, neutral system, and more of
it is built than I first credited. `packages/core/src/research/batch-rail.ts`
(`runBatchRail`) already composes the pieces into a runnable rail: it
DA-filters deltas (`isCanonical`), groups claims by name, **escalates a name
with ≥2 distinct in-window claimants to the L1 bonded auction instead of
first-writer-wins**, finalizes uncontested names on a real `Accumulator`, and
its convergence + escalation + already-owned cases are covered by
`batch-rail.test.ts`. So the notice-window/contested logic this note worried
was missing is, in fact, implemented and tested.

What is *not* wired is the consumption. The resolver has no rail code (grep
`apps/resolver/src` for `runBatchRail`/`mergeBlock` — nothing), so no live
component derives canonical name state from the cheap rail. And the publisher
emits Model-A anchors off its *own* private accumulator (`sealBatch()`), which
is the wrong base in a multi-publisher world. So the real gap is narrower than
"Model B is unbuilt": it is **(1) consume `runBatchRail` in the resolver,
(2) point the publisher's `prevRoot` at the canonical root, and (3) teach the
wallet the provisional/contested/final lifecycle** — not re-deriving the merge
logic, which exists.

The first job of any convergence work is still to **pick B and retire A from
the canonical path** (A — `RootChain`'s strict single-writer chaining — can
survive as a single-publisher / regtest fast path; note `runBatchRail` itself
uses `RootChain` internally, but only to chain a *single node's already-merged*
per-height roots, which is a sound use, not the multi-writer hazard).
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
   - *dropped_existing* — the name was already final on a prior canonical
     root. The publisher should have caught this at quote time, but a race
     between quote and anchor can still produce it. Refund.
   - *contested* — another claim for the same leaf landed inside the shared
     notice window. Per `ONT.md`'s one-path model this does *not* silently
     resolve by first-writer-wins; it escalates the name to a bonded auction
     (see "Contested claims" below). The publisher's job is to surface the
     contention to the claimant, not to declare a loser.

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

- After the notice window closes, fetch the canonical accumulator state (from
  a resolver) and confirm the leaf for the claimed name commits *this wallet's*
  owner key. Three outcomes: the leaf commits this wallet's key (owned); a
  competing claim landed in the window (contested — the name is in auction, and
  the wallet must decide whether to bid); or the name was already final on a
  prior root (taken — the publisher should have caught this at quote time).

This is the case that matters: a wallet must never record a name as owned on
the strength of a publisher receipt alone, because the receipt is issued
before the notice window closes and the publisher cannot know at submit time
whether the name will be contested.

## Contested claims: the notice window

This is settled canonically and I had wrongly flagged it as open. `ONT.md`
("Claiming a name — one path", lines 37–54) already defines it: a cheap claim
is **not** final on confirmation. Anchoring opens a **notice window**; if no
competing claim for the same name lands during it, the claim finalizes (the
common, cheap, batched case). If a competing claim *does* land in the window,
the name is **contested** and escalates to a bonded L1 auction —
which is the *only* way an auction ever starts. The cheap claim is the sole
entry path; the auction is an escalation of it, not a parallel rail.
`docs/launch/CONTESTED_AUCTION_REFERENCE.md` is the in-depth design of that
escalated path (≈7-day window, soft close, returnable bonds).

The mechanical consequence for the convergence layer is mostly already built.
`runBatchRail` in `batch-rail.ts` implements the notice-window escalation
correctly today and is covered by `batch-rail.test.ts`: it DA-filters the
deltas, groups same-name claims, and for each name checks whether two or more
distinct claimants land within `noticeWindowBlocks` of the earliest claim. If
so the name is pushed to `escalatedNames` (→ auction); if not the earliest
claim finalizes. So the escalation logic is real, not aspirational. The
remaining work is narrower than I first stated:

- **`mergeBlock` is the low-level primitive, not the contested-claims policy.**
  `commitPriority` in `delta-merge-sim.ts` resolves a same-leaf conflict by
  picking the earliest commit and marking the rest `dropped_conflict`. That is
  the raw first-writer-wins merge step; it is *correct as a primitive*.
  `runBatchRail` is the layer that applies the one-path policy on top — it does
  not blindly drop the loser inside an open window, it escalates the name. The
  resolver should therefore consume `runBatchRail`, not `mergeBlock` /
  `confirmedStateForNode` directly.
- **Commit priority still governs the settled cases.** A claim whose leaf is
  already final on a prior canonical root is reported as already-owned (the name
  is taken; no auction). And commit priority is still the deterministic order in
  which uncontested winners fold in (commutativity makes that order moot for
  distinct leaves, but it keeps checkpoints reproducible).
- **The one true gap is provisional status.** `runBatchRail` only processes
  finalized-deep deltas, so it can report a name as *final* or *escalated* but
  not as *provisional* — claimed-and-anchored, notice window still open relative
  to `now`. A leaf inside its window is not yet ownable, and the canonical
  accumulator should not hand out a final inclusion proof for it until the
  window closes uncontested (or the auction settles). The missing capability is
  a per-name lifecycle classifier (absent / provisional / contested / final)
  that the resolver and wallet can both read; that is the next concrete build
  step, not a rewrite of the merge.

Remaining sub-questions (implementation shape, not protocol shape):

- **Window relationship.** The notice window (detect contention) and the
  auction window (≈7 days, once contested) are distinct. Notice-window length
  is a parameter; it must be long enough that an honest competitor can observe
  a claim and respond, and is bounded above by the DA finalization depth `K`.
- **How the escalation seats bidders.** Does the original claimant's claim
  auto-seat as the opening bid, or must they re-enter by posting a bond like
  any challenger? Is the auction open to anyone, or only to the claimants who
  appeared in the notice window? The neutral default is "open to anyone; the
  in-window claimants are simply the first bidders," but this is worth a call.
- **Gate disposition on escalation.** The ₿1,000 gates were already paid to
  miners on the claim anchors. On escalation they are sunk for both sides
  (they are neither bond nor refundable), which is fine as anti-spam but
  should be stated so the auction's bond accounting does not double-count them.

`docs/design/ONT_MEV_ORDERING_ANALYSIS.md` is the right neighbor for the
ordering/fairness half of the notice window.

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

3. **Griefing bound under escalation.** Because contested claims go to auction
   rather than a silent race, a griefer cannot cheaply void a victim's claim —
   they can only *force an auction* by claiming the same name in the notice
   window, which costs them their own ₿1,000 gate and then a returnable bond to
   actually compete. For ₿1,000 plus bonded capital per attempt that is real
   skin in the game and scales linearly with the griefing; the residual harm is
   the victim's time and auction friction, not a lost name. Worth naming as a
   known cost rather than discovering it later.

## Recommended path (phased, low-risk first)

1. **Decide A-vs-B explicitly and write it down.** Retire `RootChain` from the
   canonical path; keep it as a single-publisher/regtest fast path with a
   comment pointing here. (Doc + small code comment. No behavior change yet.)
2. **Consume `runBatchRail` in the resolver** as the canonical-root deriver,
   behind the DA windows from `da-convergence-sim.ts`. `runBatchRail` already
   composes the merge (`mergeBlock`), the DA filter (`confirmedStateForNode`),
   and the notice-window escalation; the resolver should call it rather than
   re-implementing those pieces. This is the load-bearing wiring and the most
   valuable single step. It is mostly promotion of already-tested code, plus the
   provisional/lifecycle classifier from the contested-claims section above.
3. **Point the publisher's `prevRoot` at the canonical root** (resolver
   client) and add per-leaf loss detection + refund.
4. **Add the canonical-root re-check to the wallet** before it records a name
   as owned.
5. **Checkpoints** once 2–4 are real, to restore cheap light-client follow.
6. **Finish the notice window + auction escalation** per `ONT.md`. The
   escalation itself is already implemented and tested in `runBatchRail`
   (same-name, ≥2 distinct claimants in window → `escalatedNames`); what remains
   is the provisional leaf state — a per-name lifecycle classifier
   (absent / provisional / contested / final) with per-leaf window deadlines —
   so the resolver and wallet can distinguish "anchored but window still open"
   from "final." Until that exists the wallet records claims as owned on the
   publisher receipt alone, which is the honest correctness gap to close first.

## Why this is worth doing now

The whole "anyone can run a publisher, a wallet can fall back to another"
claim — the thing that makes the publisher non-custodial in the strong sense
— is only true once two publishers can coexist without one silently voiding
the other. Right now they cannot, and the gap is invisible because every test
and smoke runs a single publisher. This is the unsolved problem that gates
running more than one.
