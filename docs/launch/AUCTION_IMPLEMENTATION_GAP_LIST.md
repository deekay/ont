# Auction Implementation Gap List

This note keeps the auction work honest.

We now have enough auction implementation that it is easy to overstate where we
are:

- policy defaults exist
- simulators exist
- fixture coverage exists
- the website shows auction states
- CLI and website can export an experimental bid package from those states
- CLI can turn that package into a signable experimental bid transaction
- the protocol has an explicit experimental `AUCTION_BID` payload shape
- the resolver and website can derive an experimental live auction feed from
  observed `AUCTION_BID` transactions for prototype catalog entries
- settled winning bids can materialize into real owned names in registry state

That is real progress, but it is still not the same thing as a final universal
auction launch engine.

## Current Baseline

What exists today:

- configurable auction policy in `@ont/core`
- single-auction and market-level simulators
- fixture-backed expected outcomes
- website-facing auction lab at `/auctions`
- shared `ont-auction-bid-package` artifact in `@ont/protocol`
- CLI creation and inspection of those bid packages
- website download utility for those bid packages
- an experimental `AUCTION_BID` event payload in `@ont/protocol`
- an experimental unsigned/signed auction bid artifact flow in CLI + architect
- core/indexer support for recording structurally valid `AUCTION_BID`
  transactions and deriving experimental auction state from them
- experimental settled-winner materialization into a real owned name record,
  using the winning bid's owner key and bond outpoint
- resolver/web exposure of that chain-derived experimental auction state

That means we now have:

- state visualization
- operator handoff artifacts
- testable simulator behavior
- a real offline operator round-trip from simulator state to signed bid
  transaction
- a resolver-backed experimental auction feed that derives leader, next
  minimum bid, phase, stale-state rejection, same-bidder replacement, bond
  status, and settled-winner ownership

What we do **not** yet have:

- a final contested-auction protocol we are ready to freeze
- strict chain-enforced consequences for every currently experimental derived
  rule
- a full website/operator flow that carries bidders from live auction state all
  the way through broadcast and post-win management
- final parameter choices for short-name floors, windows, increments, and
  maturity duration

## Gap Categories

### 1. Signable Bid Artifact To Live Auction Logic

The first half of this gap is now closed.

We now have:

- a stable bid package
- a compact experimental `AUCTION_BID` payload
- a builder that turns the package into signable bid artifacts
- signer support for producing a real signed bid transaction offline

What is still missing is the second half:

- final chain rules that give that transaction meaning in the launch auction
  engine
- final rebid and replacement semantics against prior auction state
- final settlement consequences once those bid transactions land on chain

### 2. On-Chain Auction Event Model

We still need the final protocol shape for auction bids.

Missing:

- chain-verifiable state transitions for opening bid, higher bid, soft-close
  extension, and settlement
- treatment for rejected or stale late bids
- treatment for transactions that are Bitcoin-valid but auction-invalid at the
  observed state
- clear definition of how the bond output and payload identify the auctioned
  name and observed state

This is the point where the simulator becomes a real protocol.

### 3. Auction-Aware Indexer / Resolver State

Today the resolver knows an **experimental** auction slice for prototype catalog
entries:

- observed `AUCTION_BID` transactions
- current leading bidder commitment
- current minimum next bid
- close height
- stale observed-state rejection against the derived pre-bid state
- same-bidder replacement when the later bid spends the earlier bid bond
- accepted-bid bond / release summaries
- early-vs-allowed spend classification for observed bid bond outpoints
- settled / soft-close / eligible / legacy scheduled-catalog close phase
- settled-winner ownership materialization for names that do not already exist
  in the registry state

What it still does **not** know:

- final contested-auction settlement semantics
- whether every currently derived consequence should be promoted to stricter
  chain-enforced behavior
- a fully registry-backed auction market beyond the experimental prototype
  catalog

### 4. Settlement / Close / Transfer Rules

Some of the most important rules are now executable in the experimental path,
but not all of them are final protocol commitments.

Still open:

- whether the current loser-release / winner-lock timing is the right final
  rule set
- whether the legacy scheduled-catalog compatibility path should be removed
  entirely or kept only for compatibility tests
- whether transfers before maturity are allowed and under what constraints
- whether any explicit post-win settlement or acknowledgement step is still
  desirable despite the current winner-owned-name materialization path

### 5. Website Bidder Flow

The website can now:

- inspect simulator-backed auction states
- inspect a chain-derived experimental `AUCTION_BID` feed
- prepare browser-side bid packages and unsigned Sparrow PSBTs from live or
  opening auction state

The CLI remains the deeper protocol/debug surface.

It cannot yet:

- show a bidder's current standing bid
- show "you are leading" / "you were outbid"
- broadcast bids
- follow an auction through settlement from live resolver state

So the public website is now:

- a richer inspection surface
- a partial bidder-prep surface
- but still not a full live bidder surface

## Recommended Build Order

The next implementation order that still feels sane is:

1. keep the bid package as the stable operator boundary
2. keep the experimental bid artifact / transaction builder stable long enough
   to learn from it
3. deepen auction state transitions from those bid transactions
4. wire the website into a more active bidder
   flow
5. add bidder-standing, rebid, and settlement follow-through once the live
   state model is stable

That keeps the work staged and reviewable instead of jumping straight from
simulator states to a large implicit protocol.
