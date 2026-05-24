# Universal Auction Launch Model

This is the current lead launch direction for ONT.

It replaces the earlier two-lane model of:

- ordinary names
- reserved names

with one allocation rule:

> every valid ONT name can be opened by public bonded auction.

This is a working launch model, not a final protocol freeze. It is now the
source-of-truth framing for launch docs and website copy.

## Core Decision

ONT should not maintain a semantic reserved-name list.

The launch model should be:

- public bonded auctions for every valid name
- no ordinary direct-allocation lane
- no reserved-name lane
- no pre-launch reservation system
- no editorial list of brands, public figures, companies, or generic words
- no short-name wave

The ordinary-long-tail problem is handled by the fact that most names will not
attract serious competing bids.

## Why This Is Cleaner

The earlier reserved-list path solved a real problem, but it created a bigger
one:

- which names are important enough to reserve?
- who decides?
- how do we defend boundary cases?
- how do we avoid insider or editorial favoritism?
- how do we keep the list current without governance creep?

Universal auctions avoid that entire category of judgment.

The rule becomes:

> if a name matters to more than one participant, the auction discovers that.

That is simpler, more neutral, and easier to explain than asking ONT to
pre-compute global salience.

## Basic Flow

For valid names:

1. a participant opens an auction with a bonded bid
2. the auction remains open for the public window
3. later valid bids must clear the minimum increment
4. bids near the end extend the soft close
5. the highest valid bidder wins
6. the winner owns the name and enters settlement

If nobody submits a valid bonded opening bid, no auction has opened and no
ownership changes.

The user-facing version can still feel simple:

> Start an auction. If nobody else bids during the window, you win at your opening
> bid. If others care, the auction discovers the price.

## Short Names

Short names use the same auction model as every other valid name.

That is the cleaner rule:

- no special short-name launch phase
- no discretionary release calendar
- no separate access window for insiders or early users
- opening-bond floors may still vary by objective length curve

The important scarcity work should happen through public auction competition
and bonded bitcoin, not through manual gates.

## Auction Timing Defaults

The current preferred timing shape is:

- default auction window: about `7 days`
- soft-close extension: about `24 hours`
- no hard extension cap in the current design; late bids can keep extending only
  by clearing stronger bonded increments

The prototype default should stay aligned with this single timing model unless
review feedback gives us a strong reason to change it.

## Pricing And Bonds

Auctions discover the price.

Length should not be used to decide the final value of a name. A short random
string may be less valuable than a longer obvious brand or handle.

Length can still remain useful as an objective opening-bond / anti-spam floor,
especially for very short names.

The current direction:

- winning bids are bonded bitcoin, not payments to ONT
- the winner still owns the bitcoin in self-custody during settlement
- the real cost is liquidity, time, and opportunity cost
- normal Bitcoin transaction fees still apply
- the protocol does not sell names and does not collect rent

## What Happens To Old Reserved-List Work

The previous auction-list and reserved-list work is now obsolete as launch
machinery.

It may still be useful as research:

- to understand salience
- to pressure-test expected auction demand
- to generate examples for reviewers
- to model speculative behavior

But it should not be used as a protocol-critical launch list.

## What Still Needs Work

The remaining launch-design questions are now narrower:

- exact auction window
- exact soft-close increment
- grief-cost modeling for the uncapped soft-close path
- opening-bond floor curve
- settlement duration after winning an auction
- how auction-opening and bid packages replace the retired direct-claim tooling
- how batching should work for auction openings and bids

This is a much better open-question set than:

> which people, brands, companies, and words deserve special treatment?

## Canonical One-Sentence Summary

ONT uses one market rule for names: every valid name can be opened by public
bonded auction, and no semantic reserved list decides who deserves special
treatment.
