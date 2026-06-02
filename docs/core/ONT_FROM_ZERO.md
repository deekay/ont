# ONT From Zero

This note is meant for someone who knows little or nothing about Open Name Tags
(ONT) and wants the shortest honest orientation before reading deeper design or
protocol notes.

It is not a specification. It is a framing and status document, and it defers to
the canonical [`../ONT.md`](../ONT.md) on anything that disagrees.

Related notes:

- [../ONT.md](../ONT.md) — the single source of truth for what ONT is and how it works
- [BITCOIN_EXPERT_ONE_PAGER.md](../launch/BITCOIN_EXPERT_ONE_PAGER.md)
- [BITCOIN_EXPERT_REVIEW_PACKET.md](../launch/BITCOIN_EXPERT_REVIEW_PACKET.md)
- [BITCOIN_REVIEW_CLOSURE_MATRIX.md](../launch/BITCOIN_REVIEW_CLOSURE_MATRIX.md)
- [ONT_LAUNCH_V1_BRIEF.md](../launch/ONT_LAUNCH_V1_BRIEF.md)
- [CONTESTED_AUCTION_REFERENCE.md](../launch/CONTESTED_AUCTION_REFERENCE.md)

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

## How You Get A Name — One Path

There is a single way in, and it only branches if a name is contested:

1. **Claim it.** Pay a small fixed amount of bitcoin — ₿1,000 (~$1) — as a fee
   to Bitcoin miners to claim the name. A few thousand obviously-scarce names
   (very short ones) start higher.
2. **A short notice window opens.** If no one else claims the same name, it is
   simply yours. This is the common case, it is cheap, and thousands of these
   uncontested claims are bundled into a single Bitcoin commitment so the system
   can scale to billions of names.
3. **If someone else wants it too, it is contested**, and only then does it
   escalate to a bonded auction.

Either way you end up with the same thing: a globally unique name controlled by
one owner key.

## Fees And Bonds, Not Rent

The common claim costs a small fixed **fee** — ₿1,000 (~$1) — paid to Bitcoin miners. It is not
rent paid to a registrar, treasury, or operator — there is no one to pay, and
nothing recurring. It keeps spam and squatting expensive while strengthening
Bitcoin rather than enriching the project. The amount is fixed in bitcoin, so its
dollar value drifts with the Bitcoin price; that drift is accepted deliberately
to keep the rule simple and trustless.

A **contested** name uses bonded capital instead. The owner locks bitcoin they
still own, rather than paying it away:

- bidders still pay normal Bitcoin transaction fees
- competitive names require larger bonds
- time matters because capital is locked during settlement

The intended moral intuition is:

- the cost should come from a one-time fee plus, when contested, capital
  commitment and time
- not from perpetual rent paid to a gatekeeper

## Allocation Is Neutral

ONT hands names out by a fixed mechanical rule, never by anyone's judgment:

- any valid name can be claimed, and contested names settle by open bonded bid
- there is no semantic reserved-name list
- there is no ordinary-vs-reserved split
- there is no pre-launch reservation system
- there is no founder name-grab

That neutrality is the point:

- avoid asking ONT to decide which brands, people, companies, and words are
  special
- let an open auction discover BTC amounts whenever more than one party cares
- keep uncontested claims cheap and simple even though scarce names can be
  competed for

## Lifecycle

At a high level:

1. someone claims a name with a small fixed fee
2. a short notice window decides the common case: uncontested claims finalize
   cheaply; a contested name escalates to a bonded auction whose bid locks the
   bond and names the owner key
3. the current owner can later transfer the name or publish signed records

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

Two honesty notes on maturity:

- The cheap uncontested ₿1,000 (~$1) claim path is prototyped and measured, but it is not
  wired into the hosted demo yet — claiming there currently runs the
  bonded/contested (auction) path end-to-end.
- An earlier two-lane idea (a separate direct-allocation lane sitting beside the
  auction) is retired. The current model is the single path above, where claiming
  is the front door and only contested names escalate to auction.

## Open Questions Worth Review

Some important questions are still intentionally open:

- final contested-auction settlement semantics and rule strictness
- final auction windows, soft-close response window, and increment schedule
- final claim fee and opening-bond floors
- pinning the data-availability and batching windows for the uncontested path
- how conservative the system should be about long-duration locks given quantum
  concerns

So the right way to read the repo today is:

> there is a real working prototype, and the consensus model is the single
> claim-then-escalate path; the cheap uncontested claim path is built and
> measured but is being hardened before it goes live.

## Suggested Reading Order

If someone wants to learn the project in a reasonable order, this is the best
sequence right now:

1. [../ONT.md](../ONT.md)
2. [BITCOIN_EXPERT_ONE_PAGER.md](../launch/BITCOIN_EXPERT_ONE_PAGER.md)
3. [BITCOIN_EXPERT_REVIEW_PACKET.md](../launch/BITCOIN_EXPERT_REVIEW_PACKET.md)
4. [ONT_IMPLEMENTATION_AND_VALIDATION.md](../launch/ONT_IMPLEMENTATION_AND_VALIDATION.md)
5. [CONTESTED_AUCTION_REFERENCE.md](../launch/CONTESTED_AUCTION_REFERENCE.md)
6. [BITCOIN_PROTOCOL_REVIEW_QUESTIONS.md](../launch/BITCOIN_PROTOCOL_REVIEW_QUESTIONS.md)
7. [BITCOIN_REVIEW_CLOSURE_MATRIX.md](../launch/BITCOIN_REVIEW_CLOSURE_MATRIX.md)

## The Right Takeaway

The project is best understood as:

- a serious Bitcoin-native naming project
- with a payment-handle first use case
- a real working prototype already on disk
- a single claim-then-escalate model: claim a name for a small fixed fee, and a
  bonded auction settles it only when it is contested
- and a deliberate effort to be thoughtful about allocation, validation, and
  reviewer trust before asking for broad buy-in
