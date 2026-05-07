# ONT Launch Direction Status

This note captures the current launch direction in one place.

It is not a final protocol freeze. It is the current working posture after
moving away from the older two-lane / reserved-list design.

Related notes:

- [UNIVERSAL_AUCTION_LAUNCH_MODEL.md](./UNIVERSAL_AUCTION_LAUNCH_MODEL.md)
- [LAUNCH_SPEC_V0.md](./LAUNCH_SPEC_V0.md)
- [AUCTION_IMPLEMENTATION_GAP_LIST.md](./AUCTION_IMPLEMENTATION_GAP_LIST.md)
- [POST_QUANTUM_AND_SIGNATURE_AGILITY.md](./POST_QUANTUM_AND_SIGNATURE_AGILITY.md)
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

## Current Best Summary

ONT should use one market rule for names.

Every valid name can be opened by public bonded auction. No semantic reserved
list decides who deserves special treatment.
