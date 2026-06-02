# Auction Edge Case Matrix

This is a human-readable checklist for auction behavior, boundary conditions,
and test ideas. It is intentionally not executable test code.

The goal is to make the auction state machine easy to reason about before we
try to automate every case.

## Current Model Assumptions

- Every valid ONT name can be opened by public bonded auction.
- There is no reserved-name list, direct-allocation lane, pre-launch
  reservation system, or short-name wave.
- No auction exists until a valid bonded opening bid confirms on chain.
- The auction bid payload includes the name, owner pubkey, bid amount, bond
  output location, auction lot commitment, auction state commitment, bidder
  commitment, eligibility block, and bond maturity duration.
- The winning bid can materialize directly into an owned name after the auction
  settles.
- The winner bond is the live name bond through settlement / maturity.
- Resolver/indexer state should be reconstructable from chain-derived events,
  plus off-chain destination records for destination data.

## Status Legend

| Status | Meaning |
| --- | --- |
| Covered | We have at least one current automated test or fixture for this behavior. |
| Partial | Some nearby behavior is covered, but important boundaries remain untested. |
| Needs coverage | We should add an automated test, fixture, or manual QA script. |
| Open design | The expected behavior is not final enough to test as a requirement. |

## 1. Name Validity And Opening Floors

| Case | Expected behavior | Status | Notes |
| --- | --- | --- | --- |
| Lowercase alphanumeric name | Accepted after normalization. | Covered | `normalizeName("Alice123") -> "alice123"` is covered. |
| Uppercase input | Canonicalized to lowercase before auction construction. | Covered | Important for UI and CLI consistency. |
| Hyphen, underscore, space, emoji, Unicode | Rejected as invalid v1 names. | Covered | Current alphabet is `[a-z0-9]`. |
| Empty name | Rejected before any package or transaction is built. | Needs coverage | UI should not let this reach artifact generation. |
| Minimum-length name | Valid and receives the highest opening floor. | Partial | Bond helper covers length `1`; end-to-end auction opening for a 1-character name should be explicit. |
| Maximum-length name | Valid at the configured maximum length. | Partial | Current max is `32`; if we ever move to `63` or `64`, this must update everywhere. |
| One character over max length | Rejected consistently in protocol, web, CLI, resolver, and docs. | Needs coverage | This is exactly the kind of cross-layer drift we want to catch. |
| Length-based floor before floor cap | Opening floor halves per additional character. | Covered | The bond helper covers lengths `1..3`. |
| Length-based floor at long-name floor | Opening floor never falls below the floor. | Covered | `12+` currently hits the floor. |
| Name already owned and valid | New opening auction should not replace the live owner. | Needs coverage | UI should route to ownership/value/transfer path, not opening bid. |
| Name invalidated / released | Reopening requires the release-height auction generation anchor. | Covered | Reauction with correct release anchor is covered. |
| Reopening with wrong release anchor | Ignored / rejected; old invalid state remains. | Covered | Wrong-anchor reauction is covered. |

## 2. Opening An Auction

| Case | Expected behavior | Status | Notes |
| --- | --- | --- | --- |
| No bid exists | No auction exists; no owner exists. | Covered | Simulator and UI empty states cover the shape. |
| Underfloor opening attempt | Does not open the auction. | Covered | Underfloor bids remain rejected and name is still awaiting opening. |
| Exact-floor opening bid | Opens the auction and becomes leader. | Covered | Core simulator covers exact floor paired with one-sat-below rejection. |
| Above-floor opening bid | Opens the auction and becomes leader at the higher amount. | Covered | Existing opening/auction discovery tests cover this. |
| Opening before unlock / before release anchor | Rejected as too early. | Covered | Legacy/simulator unlock path covers `before_unlock`. |
| Opening after current unlock / release anchor | Accepted if otherwise valid. | Partial | Covered for ordinary opening and correct reauction; exact boundary should be explicit. |
| Opening bid with stale state commitment | Rejected. | Covered | Stale commitment rejection is covered. |
| Opening bid with wrong auction lot commitment | Ignored / rejected for the intended name. | Needs coverage | Especially important now that name is visible on chain. |
| Opening bid with payload name different from lot commitment name | Rejected. | Needs coverage | Prevents malformed or confused name claims. |
| Opening bid with missing name context | Rejected by payload decoder. | Needs coverage | Current wire format requires name context. |
| Opening bid with wrong protocol magic / version / event type | Ignored or rejected by decoder/indexer. | Needs coverage | Important for noisy chain data. |
| Bond output index points outside outputs | Rejected; no auction state changes. | Covered | Indexer rejects missing bond output and records ignored provenance. |
| Bond output amount differs from bid amount | Rejected; no auction state changes. | Covered | Indexer rejects value mismatch before auction state changes. |
| Bond output is zero-value or non-payment output | Rejected; no auction state changes. | Covered | Indexer rejects non-payment bond outputs such as OP_RETURN. |
| Multiple opening bids for same name in one block | Deterministic order by block / transaction / output order. | Needs coverage | We should define and test tie ordering. |
| Two equal valid opening bids in same block | First deterministic order wins until outbid by a valid increment. | Needs coverage | Important for launch contention. |
| Opening bid confirms but resolver has not indexed it yet | Website says pending / not observed, not “lost.” | Needs coverage | Mostly layer-3 UX and resolver freshness. |

## 3. Normal Bidding

| Case | Expected behavior | Status | Notes |
| --- | --- | --- | --- |
| One accepted bid only | Auction is live until close; opener leads. | Covered | Opening bid materialization and live states are covered. |
| Second bid below required increment | Rejected; leader unchanged. | Covered | Simulator covers below-minimum increment. |
| Second bid exactly at next valid bid | Accepted; second bidder leads. | Covered | Core simulator pairs exact-minimum acceptance with one-sat-below rejection. |
| Second bid above next valid bid | Accepted; second bidder leads. | Covered | Existing multi-bid tests cover this. |
| Third bid below next valid bid | Rejected; leader unchanged. | Covered | Covered in simulator / stale state variants. |
| Third bid exactly at next valid bid | Accepted; third bidder leads. | Covered | Core simulator covers chained exact-minimum rebids. |
| Normal increment uses absolute floor when percentage is smaller | Next valid bid is current bid plus absolute minimum. | Partial | Increment helper covers max behavior but should include current launch values. |
| Normal increment uses percentage when percentage is larger | Next valid bid is percentage-rounded-up amount. | Covered | Existing policy tests cover percentage path. |
| Percentage increment rounding | Rounds up so fractional base-unit requirements cannot be bypassed. | Covered | Core policy test checks rounded-up normal and soft-close increments. |
| Bid amount is one base unit below required minimum | Rejected. | Covered | Underfloor and increment failures exist; exact one-unit boundary should be explicit. |
| Bid amount equals required minimum | Accepted. | Covered | Paired with the one-sat-below boundary in core simulator tests. |
| Bid uses old package after another bid confirmed | Rejected as stale state commitment. | Covered | This is covered and should remain front-and-center in UI copy. |
| Bid references current state but wrong current leader commitment | Rejected as stale or inconsistent state commitment. | Needs coverage | Good adversarial package case. |
| Bid with wrong bond maturity duration | Rejected. | Covered | Maturity-duration mismatch is covered. |
| Bid with malformed bidder commitment | Rejected / not counted. | Needs coverage | Bidder commitment should match bidder id in package construction. |
| Bidder id collision | Same bidder commitment is treated as same bidder identity. | Needs coverage | We should decide whether this is just label-level demo state or protocol-relevant. |

## 4. Same-Bidder Replacement / Self-Rebid

| Case | Expected behavior | Status | Notes |
| --- | --- | --- | --- |
| Same bidder rebids higher and spends prior bond | Accepted as replacement; old bond is replaced by self-rebid. | Covered | Current tests cover replacement spend. |
| Same bidder rebids higher without spending prior bond | Rejected as prior bid not replaced. | Covered | Current tests cover this. |
| Same bidder rebids below required increment while spending prior bond | Rejected; old valid bid should remain authoritative unless replacement semantics say otherwise. | Needs coverage | Important to avoid accidental self-cancel. |
| Same bidder replacement spends wrong prior outpoint | Rejected or not treated as replacement. | Needs coverage | Should not allow ambiguous self-replacement. |
| Same bidder replacement spends prior bond after it was already spent elsewhere | Rejected by Bitcoin consensus before ONT logic, or not observed as valid. | Needs coverage | Mostly chain/PSBT-level. |
| Different bidder spends prior leader bond | Should not count as legitimate replacement; likely invalidates/spends the old bond depending on chain reality. | Needs coverage | Adversarial if someone can spend it, but only key-holder can normally do this. |

## 5. Soft Close

| Case | Expected behavior | Status | Notes |
| --- | --- | --- | --- |
| Bid before soft-close window | Accepted if increment clears; close is not extended. | Partial | Covered indirectly by live bidding; exact no-extension boundary should be explicit. |
| Bid at first block of soft-close window | Accepted if increment clears; close extends. | Covered | Core simulator covers the inclusive first-soft-close block. |
| Bid in soft-close window below soft-close increment | Rejected; close not extended. | Covered | Core simulator covers one-sat-below soft-close rejection. |
| Bid in soft-close window exactly at soft-close increment | Accepted; close extends. | Covered | Core simulator covers exact soft-close minimum acceptance. |
| Bid in soft-close window above soft-close increment | Accepted; close extends. | Covered | Soft-close extension tests cover this generally. |
| Bid at previous close block | Accepted or rejected according to explicit inclusive/exclusive rule. | Covered | Core simulator covers a bid at the close boundary as accepted, with the following block rejected. |
| Bid one block after close | Rejected as auction closed. | Covered | Simulator covers closed late bid. |
| Repeated late bids extend close repeatedly | Accepted if each clears stronger increment; no hard cap currently. | Covered | Core simulator covers repeated soft-close extensions. |
| Long griefing soft-close loop | Possible only by bonding increasingly higher amounts. | Open design | Needs economic review more than unit testing. |
| Stale package during soft close | Rejected; UI should explain old auction state. | Covered | State-commitment tests and UI strings cover conceptually. |
| Current time / block display during soft close | UI should show next valid bid and that it extends close. | Partial | Client-script strings exist; needs browser QA. |

## 6. Ordering, Ties, And Chain Reality

| Case | Expected behavior | Status | Notes |
| --- | --- | --- | --- |
| Bids sorted by block height | Earlier block is processed first. | Covered | Existing tests use ordered heights. |
| Bids in same block sorted by transaction index | Deterministic tie order. | Covered | Experimental auction derivation now asserts tx-index ordering before next-bid evaluation. |
| Multiple ONT outputs in one transaction | Deterministic processing order by output index. | Needs coverage | Could matter for batching later. |
| Same transaction opens multiple names | Allowed only if each name has a distinct valid bond output. | Needs coverage | Prevents one output backing many names. |
| Same bond output referenced by multiple auction bids | Only one name/bid can treat that UTXO as a valid live bond. | Needs coverage | This is a core anti-reuse invariant. |
| One transaction has two bids for the same name | Deterministic; probably only first valid state transition should count. | Needs coverage | Needs explicit intended behavior. |
| Reorg removes accepted bid | Resolver should roll back / rebuild state from canonical chain. | Needs coverage | Important for real deployment, less urgent in private signet. |
| Reorg replaces winner | Resolver should reflect new canonical winner. | Needs coverage | Same as above, but higher stakes. |
| Mempool bid not confirmed | Should not count as auction state. | Needs coverage | UI can optionally show pending someday, but protocol state is confirmed-only. |
| Duplicate block ingestion / resolver restart | Idempotent; no duplicate bids or double materialization. | Partial | Snapshot/persistence has tests, but auction-specific idempotence needs coverage. |

## 7. Settlement And Ownership Materialization

| Case | Expected behavior | Status | Notes |
| --- | --- | --- | --- |
| Auction closes with one accepted bid | Bidder wins; owner pubkey materializes into name record. | Covered | Indexer materialization test covers this. |
| Auction closes with multiple accepted bids | Highest accepted bid wins. | Covered | Settlement and leader tests cover this. |
| Auction closes with no accepted bids | No owner; no name record. | Covered | Simulator covers unopened. |
| Winning bid has owner pubkey | Owner pubkey becomes live name owner key. | Covered | Indexer settlement test covers this. |
| Winning bid missing owner pubkey | Should not materialize ownership. | Needs coverage | Payload parser may reject earlier, but state-level coverage is useful. |
| Settlement height exactly at close boundary | Settled or live according to explicit rule. | Needs coverage | Avoid off-by-one confusion. |
| Settlement height one block before close | Still live / soft close. | Needs coverage | Paired boundary. |
| Loser bonds before settlement | Held until settlement, unless replacement rules apply. | Covered | Superseded-until-settlement status is covered. |
| Loser bonds after settlement | No longer protocol-relevant. | Covered | Settlement/maturity tests cover loser-bond spend behavior. |
| Winner bond before maturity | Protocol-relevant. | Covered | Winner maturing/mature states are covered. |
| Winner bond after maturity | Spendable without losing the name. | Covered | Mature bond spend is covered. |

## 8. Bond Continuity And Failure Modes

| Case | Expected behavior | Status | Notes |
| --- | --- | --- | --- |
| Winning bond spent before auction settlement | Auction can settle, but no live owned name materializes. | Covered | Indexer covers spent-before-settlement. |
| Winning bond spent after settlement but before maturity | Name becomes invalid / released. | Covered | Indexer covers release before maturity. |
| Winning bond spent exactly at maturity height | Allowed; name remains mature. | Covered | Existing test spends at maturity height. |
| Winning bond spent one block before maturity | Invalidates / releases name. | Covered | Indexer coverage now pairs one-before-maturity invalidation with at-maturity safe release. |
| Losing bond spent before settlement | Marked as spent before its allowed post-settlement exit; should not affect leader except if it was current leader. | Covered | Bid outcome spend status tests cover accepted spends. |
| Losing bond spent after settlement | Allowed. | Covered | Existing test covers losing release block. |
| Rejected bid bond spent any time | Not tracked as protocol bond. | Partial | Rejected status exists; explicit spend behavior would help. |
| Bond output value is less than declared bid | Rejected; cannot become leader. | Needs coverage | Core invariant. |
| Bond output value is greater than declared bid | Should either be rejected or counted only if policy explicitly allows overbonding. | Open design | We need decide if overbonding is safe/useful. |
| Bond output address is not controlled by bidder | Protocol cannot know; wallet UX should make this hard to misunderstand. | Open design | This is a user/key custody issue. |
| Bond UTXO reused across names | Must not satisfy multiple live names at once. | Needs coverage | One of the highest-priority invariants. |
| Bond UTXO split or merged before maturity without transfer event | Should break continuity and release/invalidates if before maturity. | Needs coverage | Should be derived from spent outpoint. |
| Bond continuity across valid transfer | Successor bond becomes live bond. | Covered | Immature transfer with successor bond is covered. |
| Successor bond below required amount | Transfer rejected or name invalidated depending on transaction shape. | Needs coverage | Critical transfer/bond test. |

## 9. Reopening After Release

| Case | Expected behavior | Status | Notes |
| --- | --- | --- | --- |
| Name released because bond continuity broke | Name becomes invalid/released and can be reopened later. | Covered | Indexer release test covers invalidation. |
| New auction uses release-height anchor | Reauction can settle into new ownership. | Covered | Correct reauction anchor is covered. |
| New auction uses wrong anchor | Ignored; does not overwrite invalid state. | Covered | Wrong-anchor test exists. |
| Old stale bid from previous generation confirms later | Should remain tied to old generation and not reopen name. | Needs coverage | Important if old PSBTs are broadcast late. |
| Multiple release events for same name | Latest valid release height should be the only valid reauction anchor. | Needs coverage | Could matter after repeated invalidations. |
| Reopened auction winner uses same old owner key | Allowed if valid auction wins. | Needs coverage | Should be neutral; ownership follows auction. |

## 10. Transfers After Auction

| Case | Expected behavior | Status | Notes |
| --- | --- | --- | --- |
| Mature transfer after auction ownership | Transfer applies; new owner can publish destinations. | Covered | Smoke/indexer paths cover mature transfer after bond maturity. |
| Immature transfer with full successor bond | Transfer applies and maturity clock does not reset. | Covered | Indexer covers immature successor bond transfer. |
| Immature transfer without successor bond | Should not leave buyer depending on hidden seller bond risk; current engine likely invalidates / rejects. | Needs coverage | This is central to the pre-release transfer UX. |
| Immature transfer with successor bond below required amount | Rejected / not applied. | Needs coverage | Important for sale flows. |
| Immature sale with seller payout and successor bond | Buyer ownership and seller payment happen atomically. | Needs coverage | Current UI says this is a next-step/coordinated flow. |
| Pre-maturity seller exit | Intended successor-bond shape is not fully implemented. | Open design | Documented as current direction, not final engine behavior. |
| Transfer signed by wrong owner key | Rejected. | Covered | Transfer auth tests exist. |
| Transfer references old state txid | Rejected or ignored as stale. | Needs coverage | Important after multiple transfers. |
| Transfer after name was invalidated | Rejected; invalid name should require reauction. | Needs coverage | Prevents zombie transfers. |

## 11. Destination Records After Auction

| Case | Expected behavior | Status | Notes |
| --- | --- | --- | --- |
| Winner publishes destination record after settlement | Accepted if signed by current owner key. | Covered | Controlled-chain validation covers winner publish after settlement. |
| Bidder tries to publish before settlement | Rejected because name is not yet owned. | Needs coverage | Important user confusion case. |
| Loser tries to publish after settlement | Rejected because not current owner. | Needs coverage | Straightforward negative case. |
| Old owner publishes after transfer | Rejected once transfer applied. | Needs coverage | Resolver value-store can distinguish owner refs, but auction-owned path should be explicit. |
| Current owner publishes sequence update | Accepted; latest record becomes active. | Covered | Destination-chain tests cover generic behavior. |
| Resolver unavailable for destination publishing | Chain ownership remains; off-chain record distribution is temporarily unavailable. | Needs coverage | Mostly operational/UX. |

## 12. Resolver, Indexer, And System Availability

| Case | Expected behavior | Status | Notes |
| --- | --- | --- | --- |
| Resolver starts from empty database and reindexes chain | Reconstructs auctions, ownership, releases, and transfers. | Needs coverage | Important for “system disappears” confidence. |
| Resolver server is down | Protocol state remains on chain; website cannot show helper state until resolver returns. | Needs coverage | UX should say resolver unavailable, not imply names are gone. |
| Resolver lags current chain tip | Website should show synced height and avoid claiming stale finality. | Partial | Health/current block exists; user-facing stale warnings could improve. |
| Resolver sees bid, website cache stale | Refresh should show new auction state; stale package should be rebuilt. | Needs coverage | This was a real UX pain point. |
| Two resolvers disagree | Client should surface source/height and ideally compare. | Open design | We have resolver fanout concepts, but not full auction comparison UX. |
| Chain reset on private signet | Website should make reset obvious and not imply protocol failure. | Needs coverage | Demo-specific but important. |
| Indexer restart with persisted snapshot | No duplicate auction state or destination records. | Partial | DB snapshot tests exist; auction restart should be explicit. |
| Invalid OP_RETURN noise on chain | Ignored safely. | Needs coverage | Keeps indexer robust on public chains. |

## 13. Layer-3 Helper Website UX

| Case | Expected behavior | Status | Notes |
| --- | --- | --- | --- |
| User checks unopened valid name | Site explains opening bid and next step. | Partial | Page shell and client strings exist; browser QA should validate flow. |
| User checks active auction | Site shows active state, highest bid, next valid bid, and bid CTA. | Partial | Recently improved; should be browser-tested. |
| User inspects auction bid history | Site shows ONT-interpreted bid outcomes, counted/not-counted totals, and highest-bid ladder. | Covered | Client rendering tests cover interpreted bid-history copy; private signet gallery now parks live and soft-close examples. |
| User checks settled name in Explore | Explore shows ownership after settlement. | Partial | Needs end-to-end confidence on private signet. |
| User tries to bid with stale prefilled UTXO | Site should force a fresh unspent coin before PSBT download. | Partial | UTXO validation was added; needs UX coverage. |
| User copies only `txid:vout` from Sparrow | Site should fill amount/address from resolver when possible. | Partial | Implemented; should test missing/unknown UTXO cases. |
| User copies wrong-network address / output | Site should reject before PSBT or explain network mismatch. | Needs coverage | This is a common first-time failure. |
| User uses spent UTXO | Site should block PSBT generation before Sparrow broadcast failure. | Partial | Validation exists; browser coverage needed. |
| User skips recovery kit confirmation | PSBT button disabled or blocked. | Covered | Client script asserts recovery-kit gating strings. |
| User downloads recovery kit but does not confirm | Site should ask for upload/paste confirmation. | Covered | Client-script expectations cover confirmation controls. |
| User uses hosted demo owner key | Clearly marked demo convenience, not production custody. | Partial | Copy exists; needs user-readability check. |
| User imports PSBT into Sparrow | File should be `.psbt` binary/base64 in a Sparrow-recognized form. | Partial | Fixed recently; should stay in manual QA. |
| Sparrow broadcast succeeds | Website should show where to look and eventually show auction state. | Needs coverage | This is the “I did it, where is it?” moment. |
| Sparrow broadcast fails because UTXO is gone | Website should have prevented it; if not, troubleshooting should explain. | Partial | Need end-to-end validation. |

## 14. Economic / Adversarial Cases

| Case | Expected behavior | Status | Notes |
| --- | --- | --- | --- |
| Speculator opens many low-floor long names | Possible but capital-limited by floor and fees. | Open design | Economic modeling, not unit testing. |
| Whale bids aggressively on many names | Auctions price scarce names; no special protocol defense. | Open design | This is inherent to market allocation. |
| Late-bid griefing extends auction repeatedly | Requires stronger increments and locked capital. | Open design | Need model no-hard-cap tradeoff. |
| Many rejected malformed bids spam chain | Indexer ignores; blockspace cost is paid by spammer. | Needs coverage | Robustness test, not economics. |
| Competitor reveals demand by opening auction | Public auction model accepts demand revelation. | Open design | No commit/reveal in current direction. |
| Bidder accidentally overbonds | Depends whether overbonding is accepted or rejected. | Open design | Needs policy decision. |
| Bidder loses owner key before settlement | They may win but be unable to update/transfer. | Needs coverage | UX/recovery-kit test and docs issue. |
| Bidder loses wallet key but has owner key | Name authority may remain, but bond control may be lost. | Open design | We should explain wallet key vs owner key. |

## Highest-Priority Missing Tests

These are the cases most likely to catch real bugs or confusing user failures:

1. Single-bond reuse: one UTXO referenced by multiple names or multiple bids.
2. Stale package UX: user builds a package, another bid confirms, then the old
   PSBT is blocked or clearly rejected before broadcast when possible.
3. Settlement boundaries: one block before close, exact close block, one block
   after close; one block before maturity, exact maturity, one block after.
4. Resolver recovery: rebuild auction and ownership state from chain after
   database wipe / service restart.
5. Reorg behavior: accepted bid disappears, winner changes, and settled name
   rolls back to the canonical chain state.
6. Post-auction transfer boundaries: immature transfer with missing or
   insufficient successor bond.
7. End-to-end private signet user journey: open auction, bid again, settle,
    see name in Explore, publish value, transfer, and verify updated owner.

## Existing Reference Coverage

Useful starting points:

- `packages/core/src/auction.test.ts`
- `packages/core/src/auction-state.test.ts`
- `packages/core/src/experimental-auction.test.ts`
- `packages/core/src/indexer.test.ts`
- `packages/protocol/src/protocol.test.ts`
- `apps/web/test/client-script.test.ts`
- `apps/web/test/page-shell.test.ts`
- `docs/core/TESTING.md`
- `docs/launch/CONTESTED_AUCTION_REFERENCE.md`
- `docs/launch/AUCTION_SETTLEMENT_AND_OWNERSHIP.md`

## How To Use This Document

This matrix should become the shared review list before we add more tests.

Recommended next pass:

1. Decide which `Open design` rows are actually design decisions versus things
   we can safely defer.
2. Convert the highest-priority `Needs coverage` rows into small tests.
3. Keep user-facing helper tests separate from protocol/indexer tests so layer 3
   does not silently become layer 4.
4. Re-run this matrix after every auction-policy change.
