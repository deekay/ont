# Open Name Tags (ONT) — one-pager

**A short, human-readable name — like `alice` — that is genuinely yours.** No company,
registrar, token, or rent. Ownership is a key you hold; no one can move it, take it, or
make you pay to keep it, and anyone can verify the owner without trusting a server.

The value is in those properties, not the plumbing:

- **truly owned** — one-time cost, then yours: no rent, renewal, expiry, or revocation.
- **neutral** — names go by a fixed mechanical rule, never anyone's judgment; no reserved
  list, no founder grab.
- **verifiable without trust** — you can prove ownership, and anyone can check it.

Bitcoin is *how* we get those (it supplies ordering, settlement, and a scarce cost), but
the properties are the point. For technical reviewers; deeper level is
[`ONT_DESIGN_BRIEF.md`](./ONT_DESIGN_BRIEF.md), plain-language source is [`ONT.md`](./ONT.md).

## What it's for

- **payment handles** — resolve `alice` → *who gets paid*, before money moves.
- **identity handles** — a username for open-source / decentralized messengers and apps
  that no platform can reassign.
- **service / agent addressing** *(early)*.

The owner key signs *off-chain* destination records, so one name carries several
destinations and updates without touching the chain.

## How it works — one path, branches only if contested

1. **Claim** a name for a flat **₿1,000 (~$1)** miner fee (₿1 = 1 satoshi).
2. **A public notice window** opens. Uncontested → it's yours, finalized through a single
   batched Bitcoin commitment (thousands of claims per anchor — how it scales to billions).
3. **Contested** → escalates to an **auction backed by a returnable bond**: bitcoin the
   bidder keeps in self-custody, committed for a maturity period, then released. The name
   stays theirs. No rent, no burn, no payment to the project.

Either way: one globally-unique name your key controls (records, transfers, recovery).

## Proposed numbers & assumptions (several are placeholders — all open to challenge)

| | proposed | note |
|---|---|---|
| claim gate, every name | **₿1,000** (~$1), sunk, to miners | fixed in bitcoin; USD drifts (~$100k/BTC) |
| contested-auction min bond | **₿50,000** (~$50), returnable | placeholder |
| scarce short names (≤4 chars) | length-scaled opening bond: ~**₿100,000,000 (≈1 BTC, ~$100k)** for 1 char, halving per added char | only the very short set |
| 5+ char names | gate only; auctioned (≥ min bond) **only if contested** | no length floor |
| bond maturity | ~**52,560 blocks (~1 yr)** | placeholder |
| notice window | **weeks**, height-keyed | placeholder; the launch-fairness lever |
| on-chain footprint | ~**0.016 vB/name** batched (10k/batch); one ~150-vB anchor/batch; **anchor fee = Σ gates** | the gate reaches miners, not us |

**Assumptions we're least sure of:** the **contest rate** is unknown until launch — we
assume it's high early (everyone wants `bitcoin`, dictionary words) and low for the long
tail (`sallysmith2165`); and the notice window must be long enough that real owners can
contest a day-one land-rush.

## Why you can trust it

- Ownership is a **deterministic function of Bitcoin**, computed by replaying it through a
  **frozen ~7-file core**; a CI test fails if that core grows a dependency beyond
  Bitcoin/protocol primitives. Resolvers mirror data — they can't decide ownership.
- A portable proof bundle lets a fresh verifier re-derive ownership, now checking the cited
  anchor is **Merkle-committed by a real block header that meets its proof-of-work target**.

## Status (honest — maturity, not direction)

**Live on signet, end-to-end:** claim, owner-key transfer, owner-signed records, recovery,
and a **bonded auction bid the resolver accepts** (engine + signatures cross-checked
byte-for-byte against a second implementation). **Prototype / not yet wired:** the cheap
batched-claim rail into the canonical indexer (built + unit-tested, incl. convergence vs. a
withholding adversary); single-writer publisher; producers don't yet emit the light-client
proofs the verifier can already check. Not mainnet-ready.

## What we most want you to push on

DA + convergence soundness (fail-closed, height-keyed) · on-chain footprint (≤135-byte
OP_RETURN events, confirmed on signet) vs. a script/covenant carrier · light-client
verification — launch blocker or post-launch? · a long notice window vs. a decaying launch
gate against premium-name capture.

Repo: [github.com/deekay/ont](https://github.com/deekay/ont) · full risk register, prior-art
comparison, and parameters: [`ONT_DESIGN_BRIEF.md`](./ONT_DESIGN_BRIEF.md).
