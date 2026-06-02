# Contested Auction Reference

Status: Current reference for the contested-name auction path. The full
acquisition model is defined in
[`../ONT.md`](../ONT.md) and
[`../design/ONT_ACQUISITION_STATE_MACHINE.md`](../design/ONT_ACQUISITION_STATE_MACHINE.md).

Read this file only as the deeper reference for what happens after a claim is
contested.

## Role In The Current Design

ONT has one entry path:

1. claim a valid name
2. wait through public notice
3. finalize cheaply if uncontested
4. escalate to auction if contested

The auction is the escalation path. It exists so a name with visible competing
demand is priced by bonded bitcoin rather than by a reserved list, registrar, or
editorial judgment.

## Core Rule

If two or more DA-valid claims for the same name land inside the notice window,
the name is contested and does not finalize through the accumulator. It enters
the L1 bonded auction path.

The auction path should preserve these properties:

- no semantic reserved-name list
- no founder or insider allocation
- no ordinary-vs-premium editorial lane
- no token
- no rent
- no ONT fee recipient
- every bid backed by real bitcoin capital

## Auction Family

The current auction family is:

- open ascending
- visible L1 bid transactions
- returnable bid bonds
- meaningful minimum increments
- stronger late-bid increments
- soft close near the end of the window
- no hard extension cap in the current design

The no-hard-cap choice avoids creating a known final edge for sniping. Close
griefing is handled by requiring late extensions to be real higher bonded bids.

## Basic Flow

For a contested name:

1. the name enters auction from the claim notice window
2. bidders submit Bitcoin-backed bids for the name
3. each bid commits to an owner key
4. each later bid must clear the current minimum
5. bids near the end extend the soft close
6. the highest valid bonded bidder wins
7. the winning bond becomes the live name bond
8. the winner's owner key controls the name

## Timing Defaults

Working launch defaults, still subject to final parameter review:

| Parameter | Current lean |
| --- | --- |
| auction window | about 7 days |
| soft-close extension | about 24 hours |
| normal minimum increment | absolute floor plus percentage increment |
| late minimum increment | stronger than normal increment |
| hard extension cap | none currently favored |

These must be frozen before mainnet launch if they are part of consensus.

## Pricing And Bonds

The auction discovers price. Length should not be treated as a value oracle for
every name: a short random string may be worth less than a longer obvious brand,
handle, or word.

Length can still be used as an objective opening or bond floor for structurally
scarce names, but it should be kept separate from the ₿1,000 claim gate:

- claim gate: sunk fee paid to miners for a claim attempt
- auction bond: returnable bitcoin capital posted by bidders

This distinction matters. The old auction-first bond table should not silently
define the cheap uncontested claim path.

## Settlement

Winning an auction creates normal ONT ownership:

- the winning bid carries the owner key
- the winning bond becomes the name's live bond
- the owner key can sign value records and transfers
- before maturity, transfers must preserve bond continuity
- after maturity, owner-key authority can survive bond release

The exact maturity duration should be a simple fixed parameter before launch,
unless the project explicitly revives a more complex schedule.

## Why This Replaced Reserved Lists

The contested auction path exists because ONT should not decide:

- which brands are important
- which public figures deserve protection
- which generic words are valuable
- who gets early access
- which boundary cases count

If a name matters to more than one participant, the contest reveals that and the
auction prices it. If nobody else contests, the accumulator path handles it
cheaply.

## What Still Needs Work

The remaining auction questions are narrower than the old launch-design problem:

- exact auction window
- exact soft-close increment
- grief-cost modeling for uncapped soft close
- opening-bond floor curve, if any beyond the claim gate
- settlement/maturity duration
- proof bundle shape for auction settlement
- product language that clearly says auctions are for contested names

## One-Sentence Summary

In current ONT, auctions are not the ordinary entry path; they are the neutral,
Bitcoin-bonded escalation path for names that receive competing claims during
public notice.
