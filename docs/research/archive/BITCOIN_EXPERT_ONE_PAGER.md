# ONT Bitcoin Expert One-Pager

This is the shortest review-oriented summary of ONT we should be comfortable
sharing with technically sophisticated Bitcoin reviewers.

Related notes:

- [BITCOIN_EXPERT_REVIEW_PACKET.md](./BITCOIN_EXPERT_REVIEW_PACKET.md)
- [BITCOIN_PROTOCOL_REVIEW_QUESTIONS.md](./BITCOIN_PROTOCOL_REVIEW_QUESTIONS.md)
- [ONT_IMPLEMENTATION_AND_VALIDATION.md](./ONT_IMPLEMENTATION_AND_VALIDATION.md)
- [ONT_LAUNCH_V1_BRIEF.md](./ONT_LAUNCH_V1_BRIEF.md)
- [CONTESTED_AUCTION_REFERENCE.md](../../spec/CONTESTED_AUCTION_REFERENCE.md)

## What ONT Is For

ONT is a Bitcoin-anchored payment-handle system.

The narrowest and most useful framing is:

> use a human-readable name to say who gets paid.

The project should be read as:

- payment handles first
- owner-signed payment records second
- broader destination records later if useful clients support them

## Core Design

ONT separates:

- on-chain ownership
- off-chain mutable records

Bitcoin is used as the ownership and transfer notary, not as the place where
all mutable data lives.

Names use bonded bitcoin rather than annual rent:

- the owner bonds bitcoin they still own
- scarcity comes from capital commitment, time, and auction competition
- the protocol is not trying to sell names directly

## Current Lead Launch Direction

The current lead launch direction is **one public claim path with auction
escalation when contested**.

The rule is:

> every valid name enters public notice; uncontested names finalize through the
> accumulator, and contested names escalate to bonded L1 auction.

Launch shape:

- every valid name uses the same public claim rule
- there is no semantic reserved-word list
- there is no pre-launch reservation system
- there is no private ordinary lane
- no list of brands, people, companies, or generic words receives special
  protocol treatment
- every contested name uses the same auction family

The motivation is neutrality. ONT should not decide which names are important.
If a name matters to multiple bidders, the auction discovers the bonded BTC
amount.

## What Is Implemented Today

This is already more than a whitepaper.

Implemented and validated today:

- resolver and website
- owner-signed destination records
- transfer prototype
- auction stack with real bid transactions, chain-derived state,
  winner materialization into owned names, regtest coverage, and hosted
  private-signet proof paths

Destination records are signed, sequence-numbered, and predecessor-linked. The
current prototype uses a Keybase-style predecessor hash chain scoped to the
current ownership interval, so resolvers can prove that an owner changed a
record in order without putting mutable destination updates on Bitcoin.

The current live demo environments are:

- `regtest` for exhaustive controlled-chain testing
- `private signet` for hosted live demos and smoke evidence

## Auction Dynamics: Current Read

The simulator and experimental auction stack now model the auction family we
expect to keep:

- open ascending auction
- bonded on-chain bids
- soft close
- meaningful minimum increments
- stronger increment for bids that extend the close
- a valid bonded opening bid starts the auction clock
- same-bidder replacement only counts when the later bid spends the prior bid
  bond

The one-path claim model drops the old question of which names belong in a
special reserved list. The important remaining questions are now objective
parameters:

- claim fee and public notice window
- auction window
- soft-close response window and late-bid increment
- opening-bond floors for contested names
- how aggressive short-name floors should be
- winner bond maturity duration
- long-lock/quantum posture
- local-first signer UX for high-value bids

## What We Want Bitcoin Experts To Push On

The best current questions are:

1. Is the current auction transaction / settlement shape coherent?
2. Are the bond and lock-duration assumptions disciplined enough for launch?
3. Are the length-based floors aggressive enough for very scarce short names
   without reintroducing subjective special cases?
4. Are there obvious Bitcoin-native concerns around policy, relay, footprint,
   or state-machine complexity that we are missing?

We are **not** asking Bitcoin protocol experts to decide which names deserve
special treatment. That question is intentionally removed from the lead launch
model.
