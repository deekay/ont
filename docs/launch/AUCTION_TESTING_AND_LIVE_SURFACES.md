# Auction Testing And Live Surfaces

This note answers one practical question:

> how much of the auction system is actually tested, and which auction states
> are visible on the live website versus only in fixture-backed examples?

This matters because it is easy to blur together three different things:

- simulator-backed examples
- controlled-chain validation
- live private-signet observations

Related notes:

- [TESTING.md](../core/TESTING.md)
- [ONT_IMPLEMENTATION_AND_VALIDATION.md](./ONT_IMPLEMENTATION_AND_VALIDATION.md)
- [AUCTION_IMPLEMENTATION_GAP_LIST.md](./AUCTION_IMPLEMENTATION_GAP_LIST.md)
- [AUCTION_IMPLEMENTATION_GAP_LIST.md](./AUCTION_IMPLEMENTATION_GAP_LIST.md)

## Short Answer

The auction work is well-tested for its current experimental scope.

We can say with confidence that:

- policy and simulator behavior are tested
- chain-derived experimental auction state is tested
- controlled-chain regtest auction lifecycle coverage is strong
- hosted private-signet auction smoke proves real bid, settlement, winner, and
  release-valve behavior

We should **not** say that the live private chain-derived feed always shows
every auction phase simultaneously.

The correct distinction is:

- the **public website auction lab** shows all major phases through curated
  fixture examples
- the **private signet live feed** proves real observed behavior, but only the
  phases currently present on the live chain at that moment

## What Is Tested

### 1. Core and web package tests

Current local coverage includes:

- auction policy and increment behavior
- fixture-backed single-auction outcomes
- bidder-budget and market-pressure behavior
- state-at-block phase derivation
- chain-derived experimental auction-state derivation from observed
  `AUCTION_BID` transactions
- stale-state rejection
- same-bidder replacement derivation
- derived bond status and spend / release summaries
- settled-winner materialization into a real owned name record
- website loading and rendering of auction fixtures and chain-derived auction
  state

As of this audit, both still pass locally:

- `npm test -w @ont/core`
- `npm test -w @ont/web`

### 2. Controlled-chain regtest

The SSH-backed regtest suite gives the strongest deterministic validation for
auction lifecycle semantics.

It covers:

- opening bid acceptance
- soft-close extension
- settlement into winner / loser bond states
- winner materialization into a live owned name
- winner destination publication after settlement
- mature transfer from an auction-owned name
- new-owner destination publication after that transfer
- loser bond release and allowed spend
- winner bond maturity and post-maturity spend

That means we are not relying only on simulator logic for the important auction
state-machine transitions.

### 3. Hosted private-signet smoke

The hosted private-signet auction smoke is the live-chain proof path.

It currently proves:

- one opening `AUCTION_BID`
- one higher `AUCTION_BID`
- one intentionally early losing-bond spend
- settlement into a real owned name
- winner destination publication
- post-maturity transfer
- recipient destination publication
- legacy scheduled-catalog compatibility is still covered in the
  smoke data, but should not be presented as a current launch outcome

This is the strongest live demo evidence we currently have.

## What The Public Website Shows

The public auction lab at:

- [https://opennametags.org/auctions](https://opennametags.org/auctions)

uses curated fixture cases from `/api/auctions`.

That surface is designed to guarantee visible examples of the current
user-facing auction states in one place.

At the time of this audit, the public lab API includes explicit cases for:

- `not_eligible_yet` (internal phase id: `pending_unlock`)
- `eligible_to_open` (internal phase id: `awaiting_opening_bid`)
- `live_bidding`
- `soft_close`
- `settled`

This is the right place to say:

> the website visibly demonstrates eligibility, opening-bid prep, live bidding,
> soft close, and settlement

because that claim is stable and fixture-backed.

## What The Private Signet Live Feed Shows

The private chain-derived experimental auction feed at:

- [https://opennametags.org/ont-private/api/experimental-auctions](https://opennametags.org/ont-private/api/experimental-auctions)

is different.

It is not a curated full-state gallery. It is a real observed-state feed.

That means the set of visible phases depends on:

- current private chain height
- current dedicated smoke entries
- whether an entry has already been used or settled

The private feed is now maintained in two ways:

- the private auction smoke leaves behind real `settled` outcomes
- a dedicated private phase-gallery refresh script parks real prototype entries in
  `not_eligible_yet` (internal phase id: `pending_unlock`),
  `eligible_to_open` (internal phase id: `awaiting_opening_bid`),
  `live_bidding`, and `soft_close`

That means the private live feed can now show all major phases at once, but it
is still worth being honest about how that happens:

- it is a real chain-derived feed
- some states are maintained by dedicated parked entries rather than arising
  spontaneously from one smoke run
- those parked entries drift over time as the private chain keeps advancing, so
  they need periodic refresh

So the right statement is:

> the private live feed now shows all major auction phases with real
> chain-derived entries, but part of that presentation depends on periodically
> refreshing dedicated parked phase entries.

## What The Private Auction Smoke Summary Adds

The live private smoke summary at:

- [https://opennametags.org/api/private-auction-smoke-status](https://opennametags.org/api/private-auction-smoke-status)

fills much of that gap.

It gives a real observed end-to-end lifecycle record with:

- opening bid txid
- higher bid txid
- early losing-bond spend
- settled state
- winner-owned name
- winner destination record
- post-maturity transfer
- post-transfer destination record
- legacy scheduled-catalog compatibility remains in the smoke JSON but is not part
  of the current public auction story

So even if the parked entries drift and need refreshing, the smoke summary still
proves the key live transitions.

## The Honest Public Claim

The clearest accurate wording today is:

> ONT auctions are tested across simulator, package, regtest, and hosted
> private-signet layers. The public auction lab shows eligibility, opening-bid
> prep, live bidding, soft close, and settlement through curated fixtures,
> while the private signet live feed and smoke summary show real chain-derived
> examples across the active auction lifecycle on the hosted demo chain.

## Remaining Gap

This is no longer a pure gap, but it is still an operational maintenance item.
Keeping the private live feed phase-complete requires:

- dedicated parked entries
- the refresh script `npm run test:private-signet-auction-phase-gallery`
- or a full canonical private-signet reseed

That is not a protocol blocker, but it remains a presentation/ops concern.
