# Bitcoin Expert Review Packet

This note is the intended entry point for technically sophisticated Bitcoin
reviewers who do not already know ONT well.

The goal is not to make them reconstruct the project from scattered design
notes. The goal is to give them one compact packet that says:

- what ONT is trying to do
- what is implemented today
- what is still provisional
- which questions are actually worth their time

This is not a full specification. It is a review packet.

Related notes:

- [BITCOIN_EXPERT_ONE_PAGER.md](./BITCOIN_EXPERT_ONE_PAGER.md)
- [BITCOIN_PROTOCOL_REVIEW_QUESTIONS.md](./BITCOIN_PROTOCOL_REVIEW_QUESTIONS.md)
- [BITCOIN_REVIEW_PREP.md](./BITCOIN_REVIEW_PREP.md)
- [ONT_FROM_ZERO.md](./ONT_FROM_ZERO.md)
- [ONT_ACQUISITION_STATE_MACHINE.md](../../spec/ONT_ACQUISITION_STATE_MACHINE.md)
- [ONT_IMPLEMENTATION_AND_VALIDATION.md](./ONT_IMPLEMENTATION_AND_VALIDATION.md)
- [CONTESTED_AUCTION_REFERENCE.md](../../spec/CONTESTED_AUCTION_REFERENCE.md)
- [AUCTION_SETTLEMENT_AND_OWNERSHIP.md](./AUCTION_SETTLEMENT_AND_OWNERSHIP.md)
- [VALUE_RECORD_HISTORY_AND_KEYBASE_NOTES.md](./VALUE_RECORD_HISTORY_AND_KEYBASE_NOTES.md)
- [BITCOIN_REVIEW_CLOSURE_MATRIX.md](./BITCOIN_REVIEW_CLOSURE_MATRIX.md)

## Status Guide For This Packet

This packet uses the same status language as
[DECISIONS.md](../../core/DECISIONS.md):

- **resolved baseline**
  - implemented today or stable enough that we should speak and build as though
    it is the baseline unless new evidence forces a revisit
- **current working assumptions**
  - current lead launch direction and review posture, but not yet an immutable
    launch freeze
- **open questions**
  - still intentionally unresolved and worth challenge from reviewers

## 1. What ONT Is

ONT is a Bitcoin-anchored payment-handle system.

The narrowest useful framing is:

> use a human-readable name to say who gets paid.

The project is best understood as:

- payment handles first
- owner-signed payment records second
- broader destination records later if useful clients support them

## 2. Core System Shape

ONT separates:

- on-chain ownership
- off-chain mutable destination records

Bitcoin is used as the ownership and transfer notary, not as the data layer for
every routine update.

The current auction prototype uses:

1. auction bid package construction
2. observed bid indexing
3. settlement / continuity rules
4. later transfer and owner-signed destination updates

Auction acquisition uses bonded capital rather than protocol rent:

- the bidder locks bitcoin they still own
- the scarcity signal comes from capital commitment and time
- the protocol is not trying to sell names directly

## 3. Resolved Baseline

There is already a working prototype, not just a whitepaper direction.

Implemented today:

- resolver and website
- owner-signed destination records with history-aware chains and basic CLI
  multi-resolver publish/read
- transfer prototype
- experimental auction stack with real bid transactions, chain-derived
  auction state, settled-winner materialization into owned names, and live
  private-signet smoke coverage

Validated today:

- package tests across protocol, core, CLI, and web
- private-signet auction smoke for bid, settlement, destination, transfer, and release checks
- fixture browser E2E smoke for the website
- hosted private-signet auction smoke

The strongest honest claims we can make now are:

1. the one-path acquisition direction is concrete enough to inspect
2. auction bid, settlement, destination, transfer, and release checks run on
   private signet for contested names
3. the experimental claim, auction, and owner-record slices are far enough along
   to inspect, test, and critique as a real system rather than only prose

## 4. Current Working Assumptions

The main current working assumption is a one-path public claim model.

The launch rule is:

> every valid name enters the same public claim path; uncontested claims finalize
> through the accumulator rail, while contested claims escalate to L1 auction.

Current launch shape:

- every valid name length uses the same public claim rule
- no semantic reserved-word list
- no pre-launch reservation system
- no private ordinary lane
- no editorial distinction between brands, public figures, generic words, and
  ordinary names
- contested names use the same public auction family

The current lead recommendation is:

- build around the one-path claim state machine
- treat old direct-allocation batching and auction-only launch work as
  historical context
- make the claim proof bundle and data-availability rules reviewer-readable
- keep contested auction mechanics visible and testable, but do not overstate
  placeholder windows, floors, or settlement durations as final constants

## 5. Footprint: Claim Lifecycle First

The current scaling story has shifted to a public claim path with auction
escalation. The immediate question is how much footprint the claim, availability,
auction, transfer, and value-record lifecycle creates under realistic usage.

### Mainline implemented path

- claim notices and accumulator commitments
- auction bid packages and bid artifacts for contested names
- transfer packages and transfer artifacts
- owner-signed off-chain destination records
- resolver/indexer provenance for observed claim, auction, and owner-record data

### What is already proven

- auction fixtures and market simulations are deterministic
- bid packages bind bidder, name/state commitment, amount, owner key, and
  observed auction state
- chain-derived auction state can materialize a winner into an owned name
- later transfer and destination-record paths work against owned-name records

### Current limitation

The final auction settlement engine and launch parameters are not frozen yet.
That means footprint review should focus on the current auction transaction
shape, not on older allocation paths.

The current recommendation is to review the auction transaction shape directly
before optimizing for batching or alternate carriers.

## 6. Auctions: Implemented Slice Plus Open Launch Questions

Auctions are no longer only simulator prose.

Today we have:

- configurable policy defaults
- single-auction and market simulators
- fixture-backed expected outcomes
- website auction lab
- bid-package export
- signable experimental bid artifacts
- chain-derived auction feed from observed `AUCTION_BID` transactions
- stale-state rejection
- same-bidder replacement derivation
- legacy scheduled-catalog compatibility coverage kept out of the launch story
- settled winner materialization into a live owned name
- live private-signet smoke proving auction lifecycle behavior

What is still provisional:

- final launch semantics for every auction rule
- exact floors, windows, late-bid increments, and settlement durations
- claim-opening and auction-escalation tooling for the launch flow
- whether every current experimental derivation should become stricter
  chain-enforced behavior

So the right wording is:

> the auction path is now implemented enough to test and critique, but the
> claim, auction-escalation, and settlement parameters are not yet frozen
> protocol constants.

## 7. What We Are Actually Asking Bitcoin Experts To Review

We should be disciplined here. This audience is best used for Bitcoin-native
questions, not for every policy argument at once.

The best questions for this round are:

### A. Bitcoin protocol and blockspace sensibility

- does the auction bid transaction shape look disciplined?
- are the current auction and transfer payloads acceptable as a prototype
  baseline?
- are there relay, standardness, policy, or mempool concerns we are missing?

### B. Transaction and state-machine shape

- is the current auction / transfer / value split coherent?
- is the current experimental `AUCTION_BID` shape reasonable?
- does winning-bid materialization into an owned name look like a good idea, or
  should there be a separate settlement step?
- are any current rules obviously too complex or too fragile for a launch
  system?

### C. Operational posture

- are we being honest about what is implemented vs what is still experimental?
- are we making the right tradeoff between easy-to-audit explicit data and
  tighter on-chain footprint?

### D. Resolver and destination-record history

- is the implemented Keybase-style destination-record chain the right baseline
  for mutable off-chain destinations?
- should resolver transparency roots or append receipts be part of the first
  serious resolver profile, or deferred until after multi-resolver publish/read
  exists?
- would Bitcoin-anchored resolver transparency roots ever be worth the
  recurring blockspace cost, or should ONT avoid that path unless a concrete
  threat model demands it?

## 8. What We Are Not Primarily Asking Them To Decide

These are important, but they are not the highest-value first ask for Bitcoin
protocol experts:

- the exact final auction window
- the exact final opening-bond floors
- the exact final winner settlement duration
- broader product narrative questions

Those can remain provisional as long as we are explicit about that.

## 9. Current House View On The Biggest Open Questions

These are the current house recommendations for the next review revision.

### Keep as resolved baseline

- payment-handle framing
- auction bid package format
- explicit auction settlement / continuity modeling

### Treat as current working assumptions

- one-path public claim lead architecture
- current auction family: open ascending, soft close, meaningful minimum
  increments, stronger extension increments
- contest escalates a claim into the auction clock
- winner materialization from the winning bid

### Keep open or experimental

- transfer batching
- final auction windows, floors, late-bid increments, and bond maturity duration

## 10. What We Still Need Before Sharing Broadly

The project is much closer now, but a good first external round should still be
packaged deliberately.

Before broader outreach, we should keep tightening:

1. one canonical reading order
2. one canonical explanation of implemented vs experimental
3. one canonical list of the actual review questions
4. one canonical matrix of which launch questions are closed, provisional, or
   intentionally deferred

This packet and the closure matrix are meant to be that spine.

## 11. Suggested Reading Order For A Bitcoin Expert

If someone is willing to read a short packet, this is the order that should
give them the best signal with the least confusion:

1. [ONT_FROM_ZERO.md](./ONT_FROM_ZERO.md)
2. [ONT_IMPLEMENTATION_AND_VALIDATION.md](./ONT_IMPLEMENTATION_AND_VALIDATION.md)
3. [CONTESTED_AUCTION_REFERENCE.md](../../spec/CONTESTED_AUCTION_REFERENCE.md)
4. [ONT_LAUNCH_V1_BRIEF.md](./ONT_LAUNCH_V1_BRIEF.md)
5. [BITCOIN_REVIEW_CLOSURE_MATRIX.md](./BITCOIN_REVIEW_CLOSURE_MATRIX.md)

Optional deeper appendices after that:

- [AUCTION_SETTLEMENT_AND_OWNERSHIP.md](./AUCTION_SETTLEMENT_AND_OWNERSHIP.md)
- [VALUE_RECORD_HISTORY_AND_KEYBASE_NOTES.md](./VALUE_RECORD_HISTORY_AND_KEYBASE_NOTES.md)

## 12. Short Current Bottom Line

If we want one honest paragraph for technically serious reviewers, it is this:

> ONT is a Bitcoin-anchored payment-handle system aimed first at
> human-readable payment resolution. The current auction prototype is real,
> bid packages, resolver-derived auction state, and settlement/continuity checks
> are implemented enough to inspect as a real system rather than only a design
> sketch. The current lead launch model is one public claim path: every valid
> name gets the same notice and challenge process, uncontested names finalize
> through the accumulator rail, and contested names escalate to the same public
> L1 auction family. No semantic reserved list decides who gets special
> treatment.
