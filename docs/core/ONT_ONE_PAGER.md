# Open Name Tags One-Pager

Open Name Tags is a Bitcoin-anchored naming system for names you can actually own.

An ONT is a flat label like `alice`, `bob`, or a brand name. Ownership is public, auditable, and derived from Bitcoin. The owner can publish signed off-chain records that say where the name points: payment destinations, websites, profiles, messaging endpoints, or other application-specific records.

The goal is simple: make names useful and verifiable without asking a company, registry, resolver, or protocol operator to be the trusted source of truth.

## The Core Model

ONT separates ownership from records.

- Bitcoin anchors who owns the name.
- The records it points to stay off-chain.
- Off-chain records are signed by the current owner key.
- Resolvers can help distribute records, but they cannot invent ownership.

That split is the heart of ONT. Bitcoin is used for scarce ownership and state transitions, not as a general-purpose data store. Off-chain records stay lightweight, updateable, and portable across resolvers.

## Alice Example

The overview flow is:

```text
alice
  -> Bitcoin anchor
     name: alice
     owner key: 8f3c...12ab
     bond: self-custodied bitcoin

  -> signed off-chain bundle
     name: alice
     btc: bc1qxy...0wlh
     lightning: lno1q...9sa
     email: alice@example.com
     website: alice.example

  -> client
     lookup: alice
     verifies the owner signature
     uses the destination type it understands
```

Bitcoin answers: who owns `alice`? The signed off-chain bundle answers: where does `alice` point right now?

## Bonded Bitcoin

ONT uses bonded bitcoin to create real cost without paying a third party to allocate scarcity.

A winning bidder does not pay ONT, pay a registry, burn bitcoin, or rent the name annually. The bitcoin remains the owner’s bitcoin in self-custody, but it is committed during settlement. The cost is liquidity, time, and opportunity cost.

Bonds mature after a defined period, currently expected to be in the `1-3` year range. After maturity, the bitcoin can be released while the name remains owned.

Before maturity, a transfer should require the buyer to provide a replacement bond so the seller is not left locked to a name they no longer own.

That makes name allocation costly enough to discourage careless hoarding, while avoiding the usual model where a registry sells or rents names as a central issuer.

Example opening-bond floors, not final parameters. Approximate USD assumes `₿1 = $100k`.

| Name length | Opening bond (₿) | Approx. USD |
| --- | --- | --- |
| `1` | `1` | `$100k` |
| `2` | `0.5` | `$50k` |
| `3` | `0.25` | `$25k` |
| `4` | `0.125` | `$12.5k` |
| `5` | `0.0625` | `$6.25k` |
| `6` | `0.03125` | `$3.13k` |
| `...` | `...` | `...` |
| `12+` | `0.0005` | `$50` |

The floor starts the auction. The auction can clear higher when multiple bidders care about the same name.

## Auction Allocation

After launch, anyone can open a public auction for any valid name.

- Auctions settle with ordinary Bitcoin transactions.
- A participant opens a public auction for a name.
- If nobody else bids, the opener can win at the opening floor.
- If others bid, open bidding discovers the final bond.
- The winner controls the owner key after settlement.

The rule is simple:

> If a name matters to more than one participant, the auction discovers that.

For most long-tail names, the experience can still be simple. Start an auction. If nobody else bids during the public window, you win at your opening bid. If others care, the price is discovered in the open.

## What Ownership Lets You Do

The owner key controls the name after acquisition.

- Publish or update signed destination records.
- Map a name to payment destinations.
- Point to web, professional, messaging, or other records.
- Transfer the name to a new owner key.

Two key roles matter:

- The wallet key signs Bitcoin transactions.
- The owner key signs records and controls future updates or transfers.

In the current prototype model, losing the owner key means losing update and transfer authority for that name.

## Base-Layer Discipline

ONT is intentionally narrow at the base layer: Bitcoin anchors ownership, and owner-signed off-chain records make names useful.

- Ownership is public and auditable.
- Destination updates stay off-chain.
- Resolvers distribute signed records, but ownership comes from Bitcoin.

## Status

ONT is an active prototype, not a mainnet-ready production system.

Working pieces include private signet demos, auction state, bid packages, destination publishing, resolver tooling, and transfer prototypes. Remaining work includes finalizing auction parameters, settlement duration, wallet UX, and outside review.

The product surface is [opennametags.org](https://opennametags.org). The public repository is [github.com/deekay/ont](https://github.com/deekay/ont).

## One-Sentence Summary

ONTs use Bitcoin to anchor ownership of names, owner-signed off-chain records to keep destinations updateable, and bonded auctions to price scarce names without rent or third-party payments.
