# Open Name Tags One-Pager

Open Name Tags (ONT) is a Bitcoin-anchored naming system for names you can actually own — like
`alice` — with no company, registrar, token, or rent.

> The full, canonical description lives in [`../ONT.md`](../ONT.md). This page is the short version
> and defers to it on anything that disagrees.

## The Core Model

ONT separates ownership from records.

- Bitcoin anchors who owns the name.
- The records it points to stay off-chain, signed by the current owner key.
- Resolvers help distribute records, but they cannot invent ownership.

Bitcoin is used for scarce ownership and state transitions, not as a general-purpose data store.
Off-chain records stay lightweight, updateable, and portable across resolvers.

## Claiming A Name — One Path

There is a single way in, and it only branches if a name is contested:

1. **Claim it.** Pay a small fixed amount of bitcoin — **1,000 sats (~$1)** — as a fee to Bitcoin miners
   to claim the name you want. A few thousand obviously-scarce names (very short ones) start higher.
2. **A short notice window opens.** If no one else claims the same name, it is simply yours — the
   common case, and it is cheap. Thousands of uncontested claims are bundled into a single Bitcoin
   commitment, which is how the system scales to billions of names.
3. **If someone else wants it too, it is contested** — and *only then* does it escalate to a bonded
   auction.

Either way — uncontested, or won at auction — you end up with the same thing: a globally unique name
controlled by your key.

## Alice Example

```text
alice
  -> Bitcoin anchor
     name: alice
     owner key: 8f3c...12ab
     claimed: uncontested (1,000 sats ~$1, to miners)

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

Bitcoin answers: who owns `alice`? The signed off-chain bundle answers: where does `alice` point
right now?

## When A Name Is Contested

A contested name is settled by a bonded auction — real skin in the game, not a payment to any third
party.

- A winning bidder does not pay ONT, pay a registry, burn bitcoin, or rent the name. The bitcoin
  stays the owner's, in self-custody, but is committed during settlement. The cost is liquidity,
  time, and opportunity cost.
- Bonds mature after a defined period, currently expected in the `1-3` year range. After maturity the
  bitcoin can be released while the name stays owned.
- Before maturity, a transfer requires the buyer to provide a replacement bond, so the seller is not
  left locked to a name they no longer own.

The opening-bond floor scales with scarcity. The scarcest short names carry the highest floors and
effectively start at auction. Example floors, not final parameters; approximate USD assumes
`₿1 = $100k`:

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

> If a name matters to more than one participant, the auction discovers that. Because genuinely
> contested names are rare, auctions are the exception, not the rule.

## Why It Costs A Little

The small claim cost keeps spam and squatting expensive without charging rent. It is paid to Bitcoin
miners, so it strengthens Bitcoin rather than enriching the project. The amount is **fixed in
bitcoin** — not pegged to a dollar, which would need a trusted price feed — so its dollar value
drifts as Bitcoin's price moves. Wallets or communities can sponsor the fee for users without
changing the rule.

## What Ownership Lets You Do

The owner key controls the name.

- Publish or update signed destination records.
- Map a name to payment destinations.
- Point to web, professional, messaging, or other records.
- Transfer the name to a new owner key.

Two key roles matter:

- The wallet key signs Bitcoin transactions.
- The owner key signs records and controls future updates or transfers.

If you lose your owner key, you can arm a backup recovery arrangement ahead of time — and only your
pre-arranged keys can use it, so recovery can never be turned into a way for someone else to take
your name.

## Status

ONT is an active prototype, not a mainnet-ready production system.

The core lifecycle — claim, own, transfer, update, recover, and settle a contested name by auction —
runs end-to-end on a private Bitcoin test network. The batched commitment that lets cheap uncontested
claims scale to billions is prototyped and measured, and is being hardened before it goes live. In
the current hosted demo, claiming a name runs the bonded/contested (auction) path; the cheap
uncontested-claim path is not live there yet. This is a matter of *maturity, not direction*.

The product surface is [opennametags.org](https://opennametags.org). The public repository is
[github.com/deekay/ont](https://github.com/deekay/ont).

## One-Sentence Summary

ONT uses Bitcoin to anchor ownership of names you claim for a small fixed fee, owner-signed off-chain
records to keep destinations updateable, and a bonded auction only when a name is contested — with no
rent, no registrar, and no token.
