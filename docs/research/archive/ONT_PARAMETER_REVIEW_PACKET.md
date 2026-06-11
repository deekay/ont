# ONT Parameter Review Packet

> **SUPERSEDED (2026-06-11):** absorbed into the parameter table in [`docs/core/STATUS.md`](../../core/STATUS.md) and [`docs/spec/AUCTION.md`](../../spec/AUCTION.md)
> per doc-canon (#45). Kept for provenance; this copy is no longer updated.


This is a concise list of protocol and product parameters that should be reviewed before launch. The values below reflect the current prototype defaults, not final recommendations. Amounts use ₿ where **₿1 = 1 satoshi** (so ₿1,000 ≈ $1, and ₿100,000,000 = 1 BTC).

## Core Name Rules

| Parameter | Current default | Review question |
| --- | ---: | --- |
| Allowed characters | `a-z`, `0-9` | Should names allow hyphens, underscores, Unicode, emoji, or only lowercase alphanumeric characters? |
| Minimum length | `1` character | Should every valid length be open from launch? |
| Maximum length | `32` characters | Is `32` long enough for useful names? |
| Case handling | Lowercase canonical | Should ownership be case-insensitive? |

## Opening Bond Floors

The opening bid must meet the higher of two floors:

- Length price: starts at ₿100,000,000 (≈1 BTC) for a 1-character name and halves for each additional character.
- Long-name minimum: ₿50,000. Once the length price falls below this, the minimum applies.

The table below shows the current defaults.

| Name length | Opening floor |
| ---: | ---: |
| 1 | ₿100,000,000 |
| 2 | ₿50,000,000 |
| 3 | ₿25,000,000 |
| 4 | ₿12,500,000 |
| 5 | ₿6,250,000 |
| 6 | ₿3,125,000 |
| 7 | ₿1,562,500 |
| 8 | ₿781,250 |
| 9 | ₿390,625 |
| 10 | ₿195,312 |
| 11 | ₿97,656 |
| 12-32 | ₿50,000 |

Review questions:

- Is ₿100,000,000 (≈1 BTC) the right starting floor for one-character names?
- Is the halving curve the right shape?
- Is ₿50,000 the right long-name floor?
- Should reopened auctions reset to the length floor, or should the prior winning bond matter?

## Auction Timing

| Parameter | Current default | Approximate time |
| --- | ---: | ---: |
| Base auction window | `1,008` blocks | ~7 days |
| Soft-close window | `144` blocks | ~1 day |
| Soft-close extension rule | Bid inside the final `144` blocks moves close to bid block + `144` | ~1 day from late bid |
| Hard cap on extensions | None | N/A |

Review questions:

- Is a ~7 day auction long enough for ordinary names without making testing and
  capital lockup feel slow?
- Is a ~1 day soft-close response window enough?
- Should there be no hard cap, or should auctions eventually be forced to end?

## Bid Escalation

| Parameter | Current default |
| --- | ---: |
| Normal minimum raise | max(₿1,000, `5%`) |
| Soft-close minimum raise | max(₿1,000, `10%`) |

Current philosophy: avoid a hard extension cap; discourage close-griefing by requiring meaningful late raises.

Review questions:

- Is `5%` right during normal bidding?
- Is `10%` enough during soft close?
- Should the absolute raise floor be higher?
- Should late-bid escalation increase over repeated extensions?

## Winner Bond And Maturity

| Parameter | Current default | Approximate time |
| --- | ---: | ---: |
| Winner bond maturity period | `52,560` blocks | ~1 year |
| Bond continuity before maturity | Required | Until maturity |
| Transfer before maturity | Must move old bond and create a successor bond | N/A |
| Transfer after maturity | No successor bond required | N/A |
| Maturity reset on transfer | No | Original clock continues |

Review questions:

- Is ~1 year the right maturity period?
- Should short or high-value names have longer maturity?
- Should maturity depend on final winning bond, name length, or both?
- Should pre-maturity transfers require extra buyer protection?

## Bond Breaks And Reauction

This section covers what happens if the winner moves or spends the bond before the maturity period ends.

| Parameter | Current default |
| --- | --- |
| Bond continuity before maturity | Required |
| If bond continuity breaks early | Name is released |
| Who can reopen the name | Anyone |
| Reauction identity | Anchored to the release block |
| Reauction opening floor | Current length-based floor |
| Reauction cooldown | None |

Review questions:

- Should early bond break immediately release the name?
- Should there be a cooldown before reauction?
- Should the prior owner be allowed to rebid immediately?
- Should the reauction floor reset to the length floor or inherit the prior winning bond?

## Destination Records

| Parameter | Current default |
| --- | ---: |
| Destination record maximum payload | `65,535` bytes |
| Launch record types | Bitcoin payment target, HTTPS target, profile/destination bundle, raw/app-defined |
| Destination record ordering | Strict sequence per ownership interval |
| Destination storage | Off-chain, owner-signed |
| Ownership source of truth | Bitcoin-derived |
| Resolver retention expectation | Best-effort retention of the latest valid record plus enough history to validate sequence |
| Launch fanout requirement | Not required; client-side multi-resolver publish is preferred but optional |

Review questions:

- Is the payload limit too large?
- Should launch support only a small set of destination record types?
- Should resolver replication or retention have explicit launch rules?
- Should raw/app-defined records be enabled at launch, or reserved for later?
- Should clients warn when only one resolver has accepted the latest destination record?

## Prototype Constant To Resolve

The auction path currently uses a fixed `52,560` block winner-bond maturity period. Older maturity-helper code still supports an experimental epoch-halving schedule. Before launch, the protocol should choose one maturity model and remove or clearly quarantine the other.
