# ONT Launch Direction Status

This note captures the current launch direction in one place.

It is not a final protocol freeze. It is the current working posture after
moving away from the older two-lane / reserved-list design.

> Framing note: where this doc says "universal auction" / "every valid name can be opened by a bonded
> bid," read that as the **contested path** of the unified claim→escalate model in
> [`../ONT.md`](../ONT.md): a name is claimed for a small fixed fee (₿1,000, ~$1), and a *contested*
> name escalates to the bonded auction described here. The auction mechanics are unchanged; what
> changed is that the common, uncontested case is a cheap claim rather than an auction.

Related notes:

- [UNIVERSAL_AUCTION_LAUNCH_MODEL.md](./UNIVERSAL_AUCTION_LAUNCH_MODEL.md)
- [LAUNCH_SPEC_V0.md](./LAUNCH_SPEC_V0.md)
- [AUCTION_IMPLEMENTATION_GAP_LIST.md](./AUCTION_IMPLEMENTATION_GAP_LIST.md)
- [POST_QUANTUM_AND_SIGNATURE_AGILITY.md](../research/POST_QUANTUM_AND_SIGNATURE_AGILITY.md)
- [REVIEW_FEEDBACK_BACKLOG.md](./REVIEW_FEEDBACK_BACKLOG.md)

## Current Lead Direction

The current lead launch direction is:

- public bonded auctions for every valid name
- no ordinary direct-allocation lane
- no reserved lane
- no semantic reserved-name list
- no pre-launch reservation system
- no short-name wave

The core rule is:

> every valid name can be opened by public bonded auction.

This is now cleaner than trying to generate an exhaustive list of brands,
companies, people, generics, and boundary cases.

## Why The Direction Changed

The earlier two-lane model was trying to solve a real launch problem:

- obvious names should not be cheaply captured before natural buyers notice ONT

But the solution created a larger governance problem:

- which names are reserved?
- which names are not?
- who decides the boundary?
- how do we defend omissions?
- how do we avoid insider-looking whitelist dynamics?

The reserved-list project was becoming the hard part of ONT.

Universal auctions make the allocation rule neutral:

- if nobody else cares, the opener likely wins cheaply
- if others care, the market discovers that price
- speculators concentrate on visibly valuable auctions instead of forcing ONT
  to pre-rank the world

## What Feels Stable Now

### 1. No Semantic Reserved List

ONT should not launch with a protocol-critical list of reserved brands, public
figures, companies, generic words, or public identities.

The previous list-generation work may remain useful for research and demand
modeling, but not as the launch allocation artifact.

### 2. Universal Auctions Are The Allocation Rule

The clean launch story is:

> names are scarce, so names are auctioned.

That is much easier to explain than:

> some names are ordinary, some names are reserved, and ONT decides which is
> which.

### 3. Short Names Use The Same Auction Rule

Short names are structurally scarce, but the current lean is that auctions
should handle that scarcity directly.

Current lean:

- no separate short-name wave
- no length-based launch gate
- objective opening-bond floors may still vary by length

### 4. Griefing Looks Less Central Than Before

Small-name griefing is still possible, but it is probably not the main design
constraint.

If ONT works, rational speculators have better opportunities:

- obvious brands
- obvious generics
- short names
- names with visible demand

That makes the old ordinary-lane protection less important than the neutrality
and trust gained from using markets everywhere.

## Current Working Architecture

| Surface | Current lean |
| --- | --- |
| valid names | public bonded auction |
| allocation | anyone can open with a valid bonded bid |
| opening experience | user opens with bonded bid; uncontested names should feel like simple auctions |
| pricing | auction-discovered BTC amount |
| minimum floor | objective opening-bond floor, still to finalize |
| auction window | about `7 days` by default |
| soft close | about `24 hours` extension |
| hard extension cap | not in the current design; stronger late increments are the close-griefing control |
| settlement | winning bid becomes name ownership after settlement requirements |

## What This Retires

The following are no longer the current lead launch direction:

- ordinary lane plus reserved lane
- a source-generated reserved list
- source-generated auction list as protocol-critical launch input
- reserved classes for brands, public identities, and generics
- unopened-name fallback into an ordinary direct-allocation lane
- pre-launch reservations by domain, handle, or social proof

Older docs may still mention those ideas. Treat them as historical research
unless they are explicitly updated to this model.

## What Still Needs Work

The new model leaves a better set of open questions:

- exact auction window
- exact increment rules
- grief-cost modeling for uncapped soft close
- opening-bond floor curve
- settlement duration for auction winners
- how to replace retired direct-claim tooling with auction-opening tooling
- how auction openings and bids should be batched for blockspace efficiency
- how to present uncontested auctions so normal users understand the low-drama
  path without implying a separate direct-allocation lane

## Test → Launch, And Who Runs The Bootstrap Infra

This separates what is running as a **test** today from what is **planned for launch**, and sketches
who runs the supporting infrastructure. It is a plan, not a schedule or a freeze.

### Now (test)

ONT runs on **signet**, a Bitcoin test network. This is a prototype to settle the design and measure
the numbers, not a live system. What the signet prototype exercises and measures is in
[`../design/ONT_SIGNET_PROTOTYPE_SCOPE.md`](../design/ONT_SIGNET_PROTOTYPE_SCOPE.md). Treat anything on
signet as "what works today," not as a mainnet commitment.

### Launch (mainnet cutover)

The intent is to cut over to **Bitcoin mainnet** eventually. This is **not soon**, and it is gated on
the open items rather than a date:

- the at-scale numbers confirmed — proof sizes, merge throughput, anchor costs at 10^8–10^9 names (the
  R11 / signet measurement work)
- the data-availability windows pinned and the availability-marker transaction specced
- a live end-to-end broadcast on signet
- outside review (Bitcoin / Lightning experts)

Until those clear, signet stays the live environment and mainnet is the destination, not the current
state.

### The bootstrap-infra map (who runs what)

Three supporting roles, **none of which hold authority over names** — ownership is decided by Bitcoin
plus the rules, so these are infrastructure, not control:

| Role | What it does | Who runs it |
| --- | --- | --- |
| **Resolver / archive** | stores batch data, serves lookups (1-of-N: any honest copy works) | project to start; over time professional orgs and institutions that already run Bitcoin infra, plus a long tail of independents |
| **Publisher** | batches claims, writes the commitment to Bitcoin | project to start (seeds liveness); permissionless, so wallets/apps and others over time |
| **Reference app / wallet** | the ONT-aware client (holds the owner key, builds claims, verifies) | project to start, ideally on a Lexe-style node — see below |

Resource needs are modest: store plus some compute, closer to running an Electrum server or a
block-explorer backend than a hyperscale operation (rough order: a small VPS at launch scale,
low-single-digit TB at a billion names). The low bar is deliberate — it keeps the resolver set a broad
1-of-N rather than a few large operators.

The bootstrap posture: the project stands up the first resolver, publisher, and reference app to get
the network going, but every piece is **replaceable and permissionless from day one**, and the goal is
for others to run their own (a bootstrap operator that sunsets as the ecosystem fills in). ONT never
depends on the project's infra — correctness always checks against Bitcoin, and any user can self-claim
directly on L1 if no publisher will take them. Big orgs running resolvers is healthy (more honest
archives strengthens the 1-of-N data-availability assumption) precisely because they get no power over
ownership.

### Reference app / Lexe

The reference client is needed regardless, since it ships the ONT-aware logic. The architecture and
key-custody plan live in
[`../research/ONT_WALLET_AND_ONBOARDING_DIRECTION.md`](../research/ONT_WALLET_AND_ONBOARDING_DIRECTION.md).
Preferred path: **Lexe integrates ONT** (e.g. an "ONT" entry in its app), with us building the
integration and submitting it to merge. Fallback: an independent reference app, likely still on Lexe's
open-source node. Depends on Lexe's appetite, which is still open.

## Current Best Summary

ONT should use one market rule for names.

Every valid name can be opened by public bonded auction. No semantic reserved
list decides who deserves special treatment.
