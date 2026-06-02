# Auction Placeholders And Mechanism Choices

This note separates two things that can easily get blurred together:

- the **mechanism family** we are leaning toward
- the **temporary numbers** we are using to test it

Related notes:

- [ONT_LAUNCH_V1_BRIEF.md](./ONT_LAUNCH_V1_BRIEF.md)
- [CONTESTED_AUCTION_REFERENCE.md](./CONTESTED_AUCTION_REFERENCE.md)
- [BITCOIN_REVIEW_CLOSURE_MATRIX.md](../research/archive/BITCOIN_REVIEW_CLOSURE_MATRIX.md)

## Real Mechanism Choices

These are the things we currently mean as real design choices, even if they are
still technically provisional:

- contested names should be allocated by auction
- ONT should not use a semantic reserved-word list
- ONT should not use a pre-launch reservation system
- very short names should use the same auction rule, with scarcity handled by
  objective floors and increments rather than a separate wave
- auctions should have soft close rather than hard-end sniping
- bids that extend an auction during soft close should face a stronger minimum
  increment than ordinary mid-auction bids
- the current user-started launch story should not describe unopened names as
  failed auctions; a valid bonded opening bid is what creates the auction
- same-bidder rebids should replace earlier bids by spending the earlier bond
  outpoint
- winning bids should carry the eventual owner key
- the current working path is that a settled winner materializes directly into
  a live owned name

These are the choices reviewers should spend more time on.

## Placeholder Numbers

These are still temporary and should not be treated as frozen:

- exact opening-bond floors
- exact winner settlement duration
- exact auction window length
- whether to remove the legacy scheduled-catalog compatibility path entirely or
  keep it only as compatibility coverage
- exact absolute increment floor
- exact percentage increment floor
- exact soft-close increment strength
- exact soft-close response window
- whether short-name floors should be steeper than the current placeholder
  curve

These numbers are currently there so we can:

- simulate
- test
- compare shapes
- reason concretely

They are not final launch constants.

## How To Read The Current Defaults

The cleanest way to frame the current defaults is:

> the mechanism family is meaningful; the exact numbers are calibration
> placeholders.

So if a reviewer says:

- “this window should probably be shorter”
- “that opening floor looks too low”
- “this settlement duration seems too blunt”

that is useful calibration feedback, but it does not undermine the basic
mechanism choice itself.

## What We Should Present Clearly

For the next review round, we should be explicit:

- the auction *shape* is what we want reviewed now
- the exact numbers are there to make the shape concrete and testable
- we are not pretending those numbers are already the launch constants

That reduces confusion a lot.
