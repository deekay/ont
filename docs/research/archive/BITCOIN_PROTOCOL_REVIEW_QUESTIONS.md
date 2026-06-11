# Bitcoin Protocol Review Questions

This note is the focused companion to
[BITCOIN_EXPERT_ONE_PAGER.md](./BITCOIN_EXPERT_ONE_PAGER.md).

Its purpose is simple:

> if we get a limited amount of time from technically sophisticated Bitcoin
> reviewers, what should we actually ask them?

Related notes:

- [BITCOIN_EXPERT_REVIEW_PACKET.md](./BITCOIN_EXPERT_REVIEW_PACKET.md)
- [BITCOIN_REVIEW_CLOSURE_MATRIX.md](./BITCOIN_REVIEW_CLOSURE_MATRIX.md)
- [AUCTION_SETTLEMENT_AND_OWNERSHIP.md](../../launch/AUCTION_SETTLEMENT_AND_OWNERSHIP.md)
- [CONTESTED_AUCTION_REFERENCE.md](../../spec/CONTESTED_AUCTION_REFERENCE.md)
- [VALUE_RECORD_HISTORY_AND_KEYBASE_NOTES.md](./VALUE_RECORD_HISTORY_AND_KEYBASE_NOTES.md)

## Best Use Of Bitcoin-Expert Attention

The highest-value questions are Bitcoin-native and systems-native, not launch
governance questions.

## 1. Auction Prototype Baseline

Current position:

- auction bid packages are implemented
- resolver-derived auction state is implemented
- settled auction winners can materialize into owned names
- settlement and continuity rules still need final launch review

Questions:

- does the auction bid transaction shape look disciplined from a blockspace
  and Bitcoin-policy perspective?
- are there standardness, relay, mempool, or policy concerns we are missing?

Why this matters:

- it proves the project is thinking seriously about footprint
- it gives us a concrete baseline before exploring auction-escalation or bid
  batching later

## 2. Auction Transaction And Settlement Shape

Current position:

- `AUCTION_BID` exists as a real experimental transaction type
- chain-derived experimental auction state exists
- a settled winner can materialize directly into a live owned name
- public claims are now the lead launch direction; auctions are the contested
  escalation path

Questions:

- is the current `AUCTION_BID` shape coherent?
- is direct winner materialization into a name a good idea, or should there be
  a separate settlement step?
- are same-bidder replacement and stale-state commitment rules shaped
  sensibly?
- should winning auction bids enter the current maturity/continuity rules, or
  a distinct settlement rule?

Why this matters:

- this is where transaction semantics and state-machine complexity meet

## 3. System Simplicity And Protocol Boundaries

Current position:

- one public claim path is the lead launch architecture
- the old semantic reserved-list problem is intentionally removed
- auction bids, transfers, and off-chain value records are all visible in the
  prototype

Questions:

- does the split between auction ownership, transfer, and off-chain values feel
  coherent?
- are we drawing the protocol boundary in the right place?
- are any parts obviously too clever or too stateful for a launch system?

Why this matters:

- we want experts to push on complexity before we freeze it

## Secondary Questions

These are worth documenting, but they are not the best first use of Bitcoin
expert time:

- exact auction window
- exact opening-bond floors
- exact winner settlement duration
- whether the implemented Keybase-style predecessor chain is enough for the
  first serious resolver profile
- whether resolver transparency roots and receipts should come sooner
- whether low-frequency resolver transparency roots should ever be anchored to
  Bitcoin

Those are real questions, but they lean more toward launch-policy, resolver,
and system-design judgment than Bitcoin-native protocol review.

## Current Stance We Should Present Clearly

These are the positions we should present as our current working answers:

- one public claim path is the lead launch model
- no reserved-word list or pre-launch reservation system is part of the launch
  plan
- contested names are handled by the same auction rule, with parameter review
  focused on whether the bonded floors are strong enough
- auction numbers are still placeholders, but the mechanism family is the real
  design choice

That makes the review ask much cleaner.
