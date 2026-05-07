# ONT From Zero

This note is meant for someone who knows little or nothing about Open Name Tags
(ONT) and wants the shortest honest orientation before reading deeper design or
protocol notes.

It is not a specification. It is a framing and status document.

Related notes:

- [BITCOIN_EXPERT_ONE_PAGER.md](../research/BITCOIN_EXPERT_ONE_PAGER.md)
- [BITCOIN_EXPERT_REVIEW_PACKET.md](../research/BITCOIN_EXPERT_REVIEW_PACKET.md)
- [BITCOIN_REVIEW_CLOSURE_MATRIX.md](../research/BITCOIN_REVIEW_CLOSURE_MATRIX.md)
- [UNIVERSAL_AUCTION_LAUNCH_MODEL.md](../research/UNIVERSAL_AUCTION_LAUNCH_MODEL.md)

## The Short Version

ONT is an attempt to give Bitcoin human-readable payment handles people can
actually own.

The first user problem is simple:

- who do I mean before money moves?
- how do I say that in words instead of a long address?
- how can software verify that the handle still resolves to the payment record
  signed by the current owner?

The project is best framed today as **payment handles first, broader
owner-signed destination records later**.

## What ONT Is Trying To Solve

Bitcoin addresses are not a human interface. People want readable payment
handles, but readable handles usually depend on a service, account, domain, or
operator between the payer and the recipient.

ONT explores a different approach:

- ownership is anchored to Bitcoin
- the human-readable string is flat, like `alice`
- no registrar or platform gets to revoke it
- what the name points to can change, while ownership remains public and
  auditable

## The Core Design Idea

ONT separates two things:

- **ownership**, which is derived from on-chain events
- **records**, which are signed off-chain by the current owner

That means Bitcoin is used as a notary for the namespace, not as a database for
every routine update.

Today, a name can conceptually point to:

- payment destinations
- web, professional, messaging, and other owner-signed records later, if
  clients support them

But the current story should start with:

> use a human-readable payment handle to say who gets paid.

## Why Bonds Instead Of Fees

ONT uses a **bonded-capital** model rather than annual rent.

The owner locks bitcoin they still own instead of paying protocol rent to a
registrar, treasury, or operator.

That still creates a real cost. Capital has time value and opportunity cost:
bitcoin locked in a bond cannot be sold, lent, invested, or used elsewhere
during settlement. The important difference is that this cost does not have to
be paid away to a third party. It comes from giving up liquidity and optionality
for a period of time, not from sending protocol rent to a gatekeeper.

That does not mean names are free:

- bidders still pay normal Bitcoin transaction fees
- competitive names require larger bonds
- time matters because capital is locked during settlement

The intended moral intuition is:

- the cost should come from capital commitment and time
- not from perpetual rent paid to a gatekeeper

## Launch Allocation

The current launch direction is **public bonded auctions for every valid
name**:

- any valid name can be opened by a bonded public bid
- there is no semantic reserved-name list
- there is no ordinary-vs-reserved split
- there is no direct-allocation lane
- there is no pre-launch reservation system
- there is no short-name wave

That direction is motivated by launch fairness and simplicity:

- avoid asking ONT to decide which brands, people, companies, and words are
  special
- let markets discover BTC amounts whenever more than one party cares
- make uncontested names feel simple even though the allocation rule is still an
  auction

## Lifecycle

At a high level, ONT now treats the auction bid as the acquisition event:

1. a bidder prepares an auction bid package for a name
2. the bid transaction locks the bond and names the owner key
3. settlement rules choose the winning bid
4. the current owner can later transfer the name or publish signed records

Transfers and destination updates are separate:

- Bitcoin transaction keys fund and sign the Bitcoin transaction flow
- owner keys control later ONT destination updates and transfers

## What Is Real Today

The repository already has a working prototype, not just a future design.

What is real today:

- resolver and website
- auction simulation and bid-package tooling
- transfer tooling
- off-chain signed destination-record flow
- private-signet demo paths for auction, transfer, and destination-record smoke tests

The old direct-claim path is retired from the product surface and tests. It
should not be treated as a parallel launch lane.

## Open Questions Worth Review

Some important questions are still intentionally open:

- final universal-auction settlement semantics and rule strictness
- final auction windows, soft-close response window, and increment schedule
- final opening-bond floors
- how conservative the system should be about long-duration locks given quantum
  concerns

So the right way to read the repo today is:

> there is a real working prototype, and there is also an evolving
> auction-first launch design sitting ahead of that prototype in some areas.

## Suggested Reading Order

If someone wants to learn the project in a reasonable order, this is the best
sequence right now:

1. [BITCOIN_EXPERT_ONE_PAGER.md](../research/BITCOIN_EXPERT_ONE_PAGER.md)
2. [BITCOIN_EXPERT_REVIEW_PACKET.md](../research/BITCOIN_EXPERT_REVIEW_PACKET.md)
3. [ONT_IMPLEMENTATION_AND_VALIDATION.md](../research/ONT_IMPLEMENTATION_AND_VALIDATION.md)
4. [UNIVERSAL_AUCTION_LAUNCH_MODEL.md](../research/UNIVERSAL_AUCTION_LAUNCH_MODEL.md)
5. [LAUNCH_SPEC_V0.md](../research/LAUNCH_SPEC_V0.md)
6. [BITCOIN_PROTOCOL_REVIEW_QUESTIONS.md](../research/BITCOIN_PROTOCOL_REVIEW_QUESTIONS.md)
7. [BITCOIN_REVIEW_CLOSURE_MATRIX.md](../research/BITCOIN_REVIEW_CLOSURE_MATRIX.md)

## The Right Takeaway

The project is best understood as:

- a serious Bitcoin-native naming project
- with a payment-handle first use case
- a real working prototype already on disk
- an increasingly coherent universal-auction launch design
- and a deliberate effort to be thoughtful about allocation, validation, and
  reviewer trust before asking for broad buy-in
