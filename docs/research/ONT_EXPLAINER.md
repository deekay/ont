# Open Name Tags (ONT)

Status note:

- for the cleanest current intro, start with
  [ONT_FROM_ZERO.md](../core/ONT_FROM_ZERO.md)
- for what is implemented and validated, use
  [ONT_IMPLEMENTATION_AND_VALIDATION.md](./ONT_IMPLEMENTATION_AND_VALIDATION.md)
- for the current launch direction, use
  [UNIVERSAL_AUCTION_LAUNCH_MODEL.md](./UNIVERSAL_AUCTION_LAUNCH_MODEL.md)

## The Problem With Payment Handles Today

Bitcoin addresses are not a human interface.

If you want to pay the right person or merchant, raw addresses and opaque
account strings are a poor final interface. A good payment handle should let a
wallet answer a simple question before money moves:

> who gets paid?

Readable payment handles exist, but they usually depend on a service, account,
domain, or operator between the payer and the recipient. ONT is a different
approach: a name like `alice` is something controlled by a key, with ownership
anchored to Bitcoin and verifiable by anyone.

## Why Bonds Instead Of Fees

Naming is never free. The real question is where the cost goes and what kind of
cost it is.

Most naming systems charge by routing payment to a gatekeeper:

- a registrar
- a platform
- a DAO treasury
- or some other operator with the power to change terms later

ONT uses pricing too, but a different kind. It uses a **bond**. A bond still
has a real financial cost because capital has time value and opportunity cost.
But the cost does not have to be paid to a third party. You lock bitcoin you
still own instead of spending it forever to a provider.

Normal Bitcoin transaction fees still apply. The point is not that naming
becomes free. The point is that the protocol's own scarcity mechanism is
self-sovereign rather than gatekeeper-controlled.

## What ONT Names Are For

An ONT name is best understood first as a human-readable payment handle.

The first question ONT is trying to solve is:

- who do I mean before money moves?

From there, the same structure can support other records too:

- **Payment endpoints**: a Lightning address, an on-chain address, or a payment
  URI
- **Owner-signed records**: web, professional, messaging, and other destinations
  if clients support them later

The name is the stable layer. What it points to can change. The ownership cannot
be taken from you by a protocol operator.

## How Ownership Works

ONT separates two concerns:

- Bitcoin anchors who owns the name
- the records it points to are kept off-chain and signed by the owner

The current launch direction is public bonded auctions for every valid name:

- every valid name can be opened by auction
- there is no semantic reserved-name list
- there is no pre-launch reservation system
- there is no direct-allocation lane
- there is no short-name wave

This keeps allocation neutral. ONT does not have to decide which brands, people,
companies, or generic words are important. If a name matters to multiple
bidders, the auction discovers the bonded BTC amount.

## No Suffixes, No Hierarchy

ONT uses a flat namespace. A name is just `alice`, not `alice.ont` or
`alice.btc`. There is no root authority, no TLD, and no hierarchy to
maintain.

## Fairness

The fairness goal is:

- no founder allocation
- no discounted allocations
- no whitelist or identity-based quotas
- no hand-built reserved list

Fairness should come from public rules and public on-chain outcomes, not private
approvals.

## Comparison To Rented Handles

| Feature | ONT | Typical service-controlled handle |
| :--- | :--- | :--- |
| **Cost model** | Bonded capital the owner still owns | Fees, rent, or account dependence |
| **Control** | Current owner key signs updates | Provider account or operator controls availability |
| **Revocability** | No protocol operator can revoke ownership | Provider policy or infrastructure can remove access |
| **Value storage** | Off-chain, owner-signed | Provider-hosted records |

## Data Availability: An Honest Assessment

Ownership state is recorded on Bitcoin-compatible chain data. The canonical
registry is recoverable from that record alone.

Off-chain destination records are a separate matter. These are stored and served by
resolvers. They are signed by the name's current owner key, so authenticity is
verifiable without trusting the resolver, but availability depends on at least
one resolver having a copy.

This is a deliberate trade-off. Storing destination updates on-chain would
turn Bitcoin into a database rather than an ownership notary.
