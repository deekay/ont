# ONT Implementation And Validation

Status: Implementation status. This file has been updated to describe the
current one-path model at a high level, but detailed current design authority
lives in [`../ONT.md`](../ONT.md) and
[`../design/ONT_ACQUISITION_STATE_MACHINE.md`](../design/ONT_ACQUISITION_STATE_MACHINE.md).

This note answers a practical question:

> what is actually implemented today, what is still experimental, and what has
> been validated enough that we can speak about it confidently?

This is not a roadmap and not a protocol appendix. It is a current-status packet
for onboarding and review.

Related notes:

- [ONT_FROM_ZERO.md](../core/ONT_FROM_ZERO.md)
- [BITCOIN_EXPERT_REVIEW_PACKET.md](./BITCOIN_EXPERT_REVIEW_PACKET.md)
- [BITCOIN_REVIEW_CLOSURE_MATRIX.md](./BITCOIN_REVIEW_CLOSURE_MATRIX.md)
- [VALUE_RECORD_HISTORY_AND_KEYBASE_NOTES.md](../research/VALUE_RECORD_HISTORY_AND_KEYBASE_NOTES.md)
- [TESTING.md](../core/TESTING.md)
- [AUCTION_TESTING_AND_LIVE_SURFACES.md](./AUCTION_TESTING_AND_LIVE_SURFACES.md)
- [AUCTION_SETTLEMENT_AND_OWNERSHIP.md](./AUCTION_SETTLEMENT_AND_OWNERSHIP.md)
- [CONTESTED_AUCTION_REFERENCE.md](./CONTESTED_AUCTION_REFERENCE.md)

## Snapshot

The shortest honest summary is:

- the resolver and website are real
- auction simulation, bid packages, bid artifacts, and auction-state rendering
  exist
- transfer and value-record flows exist as prototypes
- value-record history plus CLI multi-resolver publish/read are implemented
  enough to inspect
- the website can compare/fan out across a configured resolver set when a
  deployment opts into that allowlist
- the current launch design is one public claim path: uncontested accumulator
  finality, contested-name escalation to L1 auction

For external technically sophisticated review, the best current entry point is:

- [BITCOIN_EXPERT_REVIEW_PACKET.md](./BITCOIN_EXPERT_REVIEW_PACKET.md)

## Status Table

| Area | Status | Confidence | Notes |
| --- | --- | --- | --- |
| Auction flow | Implemented prototype | Moderate | Configurable policy, CLI simulation, fixture coverage, website state rendering, bid packages, signable bid artifacts, chain-derived `AUCTION_BID` state, and settled-winner-to-owned-name materialization exist; final launch parameters are still open |
| Off-chain signed value records | Implemented history-aware prototype | Moderate to high | Current records prove owner authorization, exact sequence, predecessor linkage, ownership-interval binding, CLI multi-resolver publish/read comparison, website-side fanout/compare against a configured resolver set, and browser-level local proof of consistent-versus-lagging resolver views; resolver transparency remains future work |
| Transfers | Implemented prototype | Moderate to high | Gift and cooperative sale flows exist; browser UX is not the full end-user story yet |
| One-path acquisition policy | Working launch direction | Moderate | Public claim for every valid name; uncontested claims finalize through the accumulator; contested names escalate to bonded L1 auction |

## What Is Implemented Today

### 1. Auction Prototype

The auction direction is no longer only prose.

Today the repo has:

- configurable auction policy defaults
- single-auction simulator logic
- market-level simulator logic with bidder budget constraints
- fixture-backed auction scenarios
- CLI commands for policy printing, scenario execution, and bid-package
  creation / inspection
- bid transaction builder and signer paths built on top of those bid packages
- a website-facing `/auctions` page that renders eligibility, opening-bid prep,
  live bidding, soft-close, and settled states
- a resolver-backed chain-derived auction feed for prototype catalog entries, derived from
  observed `AUCTION_BID` transactions
- same-bidder rebid classification when the later bid spends the prior bid bond
  outpoint
- settled-winner materialization into a real owned name record, using the
  winning bid's `ownerPubkey` and bond outpoint as the live post-auction name
  state

### 2. Owner-Signed Value Records

The repo supports an off-chain value-record model:

- values are signed by the current owner key
- resolver can ingest and serve them
- clients can verify authenticity without trusting the resolver
- the CLI can fan one signed record out to several resolvers and compare
  value-history visibility across them
- the website can surface that same pattern when the deployment configures an
  explicit resolver allowlist

This is important because it shows the intended separation between:

- on-chain ownership truth
- off-chain mutable destination data

### 3. Transfer Flows

There is a working transfer prototype, including:

- gift transfers with bond continuity rules
- cooperative sale-style transfers
- recipient key generation helpers for browser and CLI flows

This matters because ONT is not just an allocation toy anymore. The state
machine has been exercised through later lifecycle transitions.

## What Has Been Validated

### Unit And Package Tests

We have passing test coverage across:

- `@ont/protocol`
- `@ont/core`
- `@ont/cli`
- `@ont/web`

For auctions specifically, this includes:

- policy and increment behavior
- fixture-backed single-auction outcomes
- market-level bidder budget behavior
- state-at-block phase derivation
- bid package commitment validation
- bid artifact building and signing
- auction-state derivation from observed `AUCTION_BID` transactions
- stale-state rejection and settlement-summary derivation
- same-bidder replacement derivation when the later bid spends the prior bid
  bond output
- early-vs-allowed bond-spend derivation from observed outpoint spends
- settled-winner materialization into a real owned name record once the auction
  reaches settlement
- website fixture loading and page rendering for the auction surface

### Private Signet

Private signet is the live-chain environment that matters for hosted demos and
smoke validation.

The auction side has a dedicated private signet smoke path that runs real
`AUCTION_BID` activity and proves the chain-derived feed is not only rendering
fixtures.

## What We Can Say Confidently

The strongest implementation claims we can make today are:

1. The resolver, website, CLI, transfer, and value-record surfaces are coherent
   enough to review and demo.
2. The auction stack is implemented enough to inspect policy, generate bid
   packages, build signer artifacts, derive chain state, and materialize winners
   into owned names.
3. The lead launch direction is now the one-path claim model: every valid name
   enters through public claim, uncontested names finalize cheaply, and contested
   names escalate to bonded L1 auction with no semantic reserved list.

## What Is Still Experimental

The current acquisition and contested-auction details still need final review:

- auction window
- soft-close response window and late-bid increment strength
- opening-bond floors
- winner bond duration
- quantum/long-lock posture
- exact production rollout sequence

## What Is Intentionally Out Of Scope

These are not done yet and should not be implied by the current docs:

- final accumulator-rail launch engine
- batched transfers
- batched value-record updates
- a fully polished browser signing flow
- a final mainnet launch package

## Best Current Review Story

If we want a reviewer-friendly summary right now, the strongest version is:

> ONT has a real resolver, website, transfer prototype, value-record prototype,
> and increasingly concrete auction stack. The current launch direction is one
> public claim path: uncontested names finalize through a batched accumulator,
> while contested names escalate to bonded L1 auction. The next big questions are
> accumulator-rail integration, final notice/DA windows, auction parameters, and
> proof bundles.

## Suggested Next Review Order

For someone trying to evaluate the project without getting lost:

1. [ONT_FROM_ZERO.md](../core/ONT_FROM_ZERO.md)
2. [ONT_EXPLAINER.md](../research/archive/ONT_EXPLAINER.md)
3. [TESTING.md](../core/TESTING.md)
4. [ONT_ACQUISITION_STATE_MACHINE.md](../design/ONT_ACQUISITION_STATE_MACHINE.md)
5. [CONTESTED_AUCTION_REFERENCE.md](./CONTESTED_AUCTION_REFERENCE.md)
