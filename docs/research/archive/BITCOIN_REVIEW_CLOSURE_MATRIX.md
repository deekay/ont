# Bitcoin Review Closure Matrix

This note is for internal use.

Its job is to make one thing explicit before external review:

> which questions do we already have a working recommendation for, which ones
> are still provisional but shareable, and which ones should be tightened
> before we put this in front of Bitcoin experts?

Related notes:

- [BITCOIN_EXPERT_REVIEW_PACKET.md](./BITCOIN_EXPERT_REVIEW_PACKET.md)
- [ONT_LAUNCH_V1_BRIEF.md](./ONT_LAUNCH_V1_BRIEF.md)
- [CONTESTED_AUCTION_REFERENCE.md](./CONTESTED_AUCTION_REFERENCE.md)
- [ONT_IMPLEMENTATION_AND_VALIDATION.md](./ONT_IMPLEMENTATION_AND_VALIDATION.md)
- [VALUE_RECORD_HISTORY_AND_KEYBASE_NOTES.md](../research/VALUE_RECORD_HISTORY_AND_KEYBASE_NOTES.md)

Status labels:

- `closed for this review rev`
- `provisional but shareable`
- `tighten before broader outreach`
- `defer from this review round`

## Closure Table

| Topic | Current recommendation | Status | Should Bitcoin experts review this now? | Next action |
| --- | --- | --- | --- | --- |
| Core framing | Payment handles first, owner-signed payment records second, broader destination records later | closed for this review rev | yes, as context | keep intro docs aligned |
| Public vs private signet | Private signet is the live demo path; public signet is retired | closed for this review rev | no, only mention for clarity | keep docs and site consistent |
| Retired claim prototype | The old two-step claim prototype was validated historically, but is not the launch allocation UX | closed for this review rev | no, only as context | keep status language explicit |
| Universal auction launch | Public auction rule for every valid name | provisional but shareable | yes, at mechanism level | keep launch spec aligned |
| Short-name treatment | Very short names use the same auction rule; floors and increments carry the scarcity burden | provisional but shareable | maybe, mostly parameter policy | document objective floor rationale |
| Reserved-word lists | Drop them from the launch model | closed for this review rev | not as a Bitcoin-native ask | remove from current docs and tools |
| Pre-launch reservations | Drop them from the launch model | closed for this review rev | no | keep out of implementation and docs |
| Auction family | Open ascending, soft close, meaningful increments, stronger late-extension increments | provisional but shareable | yes | present current rule family and why |
| Legacy scheduled-catalog close | Retire from the launch story; keep only as compatibility coverage unless the mechanism changes again | cleanup required | no | do not present unopened names as failed auctions |
| Same-bidder rebid shape | Later bid should spend the earlier bid bond outpoint | provisional but shareable | yes | include in auction semantics section |
| Winning-bid settlement shape | Winning bid carries eventual owner key and materializes directly into a name | provisional but shareable | yes | ask whether a separate settlement step would be cleaner |
| Exact auction windows and floors | Keep temporary numbers for testing; do not present them as final | tighten before broader outreach | not as a core review ask | document which numbers are placeholders |
| Transfer batching | Defer | defer from this review round | no | leave out unless directly asked |
| Auction implementation status | Present as experimental but real: simulator + bid artifacts + chain-derived state + private-signet smoke | closed for this review rev | yes | keep status language honest |
| Destination-record history | Use Keybase-style signed predecessor chains scoped to ownership intervals | closed for this review rev | maybe, as a systems question rather than a Bitcoin-native blocker | keep implementation, website history view, and CLI multi-resolver comparison exercised |
| Resolver transparency roots | Defer until destination chains and multi-resolver publish/read are clearer | defer from this review round | maybe only if reviewers raise anti-rollback / forked-view concerns | keep mutable destination updates off Bitcoin by default |
| Website / tooling story | Website is good enough for inspection and demo; not yet a full end-user bidder flow | closed for this review rev | no, only as context | keep expectations explicit |

## What Should Be Closed Before A Broader Technical Outreach

The highest-value tightening work before a broader round is:

1. one short note that clearly marks which auction numbers are placeholders and
   which mechanics are the real design choice
2. one canonical review packet rather than many parallel entry points
3. one tighter explanation of which questions are Bitcoin-native versus launch
   policy questions
4. one hosted-demo refresh so destination-record history is visible against current
   private-signet names

## What Is Good Enough To Share Now

These items are already in a reviewable state:

- payment-handle framing
- retired claim prototype as historical context
- one-path public claim lead architecture
- auction mechanics as an experimental but real system slice for contested names
- legacy scheduled-catalog compatibility only as compatibility context
- winner materialization into owned names

## Recommended First-Round Ask

The best first-round ask to technically sophisticated Bitcoin reviewers is:

1. Are the auction transaction and settlement shapes coherent?
2. Is the footprint acceptable for a public claim path with auction escalation?
3. Are there obvious Bitcoin-native concerns we are missing around policy,
   relay, footprint, or state-machine complexity?
4. If they care about resolver trust, does the destination-record history direction
   look sufficient before we consider heavier transparency machinery?

That is a much better first ask than trying to get them to decide every launch
policy and product question immediately.
