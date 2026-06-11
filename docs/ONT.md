# ONT — Own your name on Bitcoin

ONT (Open Name Tags) lets anyone own a short, human-readable name — like `alice` — that is truly
theirs: secured by Bitcoin, with no company, registrar, token, or rent. The first thing a name is
for is payments: say who gets paid in a word instead of a long address, and let software check that
the answer really comes from the name's owner.

This page is the front door — the single source of truth for what ONT *is* and how it works.
For what is *running today* and the exact numbers, [`core/STATUS.md`](./core/STATUS.md) is the
source of truth and this page defers to it.

---

## What owning a name means

A name is a flat string like `alice` (lowercase letters and digits, up to 32 characters). Owning it
means holding a key — the **owner key** — and nothing else:

- With the key you can **transfer** the name or **update** what it points to (a payment
  destination today; other owner-signed records later). A signature from that key is the only
  thing that can move a name.
- Without the key, nobody can touch it. There is no renewal, no expiry, no revocation, and no
  admin. Once a name is yours, no one — including the people who built ONT — can take it or
  charge you to keep it.
- Anyone can look the name up and **check the answer** instead of trusting whoever served it.
  ONT is designed so that check runs against Bitcoin itself; today the last serverless leg of
  that check is still being built (see "What's real today" below).

## What ONT commits to

Six commitments shape every design choice; the rest of this page is how they are kept.

1. **A name is property.** One-time cost, then nobody — including us — can take it.
2. **Nobody decides.** Names are handed out by a fixed mechanical rule; ownership is computed by
   replaying Bitcoin, not by anyone's judgment.
3. **Everything is checkable.** Verify-don't-trust: if a claim about ownership can't be checked,
   it doesn't count.
4. **Bitcoin settles.** Bitcoin supplies ordering and final settlement. ONT adds no new
   blockchain and no token.
5. **The common case is ~$1, and it scales.** Room for billions of names; only genuine
   contention costs more.
6. **Say what's real.** Designed, built, and live are three different things, and our documents
   say which is which.

## How you get a name — one path

There is a single way in, and it only branches if a name is contested:

1. **Claim it.** Pay a small fixed amount of bitcoin — **₿1,000 (~$1)**, as a fee to Bitcoin
   miners — to claim the name you want. (Very short names, 4 characters or fewer, are obviously
   scarce and skip this cheap path: they are **bond-first**, meaning they start directly at the
   auction step below with a large opening bond.)
2. **A short notice window opens.** This is a waiting period whose only job is fairness: it gives
   anyone else who wants the same name time to show up. If nobody does, the name is simply yours.
   This is the common case, and it is cheap — behind the scenes, thousands of uncontested claims
   are bundled into a single Bitcoin commitment (the **batched claim path**), which is how ONT
   scales to billions of names without bloating Bitcoin.
3. **If someone else wants it too, it is contested.** Posting a returnable **bond** — bitcoin you
   lock up but still own — opens an **auction**: open bidding where every bid is backed by a
   bond and the highest bid wins. Posting a bond — not just claiming second — is what escalates
   a name to auction. Two claims with no bond simply cancel out: the name is **nullified** —
   left with no owner and reopened for claiming — so nobody can take a name just by racing you.

Either way — uncontested, or won at auction — you end up with the same thing: a globally unique
name controlled by your owner key. The winner's bond stays locked for a maturity period as a
commitment, then comes back; it is skin in the game, not destroyed money. (The auction's exact
form is a working assumption under active review — see the
[design brief](./DESIGN.md) — and the specific fees, windows, and bond floors are
placeholders until launch; [`core/STATUS.md`](./core/STATUS.md) lists current values.)

## Nobody decides — allocation is neutral

ONT never judges which names are special:

- There is no reserved-name list, no brand protection, no pre-launch reservations, and no
  founder name-grab.
- Any valid name can be claimed by anyone; when more than one party cares, an open auction
  discovers the price.
- Ownership is not recorded in anyone's database. Every participant computes who owns what by
  replaying Bitcoin in order, and two honest observers always get the same answer. That is what
  lets a name mean one thing, everywhere.

## Ownership on Bitcoin, records off it

ONT separates two layers, which is why it stays cheap:

- **Ownership** — who controls a name — is derived from on-chain events. Bitcoin acts as the
  notary for the namespace.
- **Records** — what a name points to — are signed off-chain by the current owner key and can
  change any time without touching Bitcoin. A name can point to a payment destination today, or
  to nothing at all; richer owner-signed records can come later without changing the ownership
  rules.

You can prove you own a name with a portable proof anyone can check against the protocol rules
today; checking it against Bitcoin directly, with no server in the loop, is the design target and
its last leg is still being built (see "What's real today"). Apps, wallets, and resolvers mirror
and verify this data — they never get to decide it. A lying server gets caught, not obeyed.

## Fees and bonds, not rent

The economics are deliberately one-shot:

- The **₿1,000 claim fee** is paid to Bitcoin miners — not to a registrar, treasury, or operator.
  There is no one to pay rent to and nothing recurring. It exists to make spam and squatting
  expensive while strengthening Bitcoin rather than enriching the project.
- A **contested** name costs locked capital and time instead: bonds are returnable, so the price
  of a fought-over name is commitment, not money burned.
- The fee is **fixed in bitcoin** — ₿1,000 means 1,000 base units (0.00001 BTC), about $1 today.
  The ₿ amount is the protocol truth; the dollar figure is a casual helper that drifts with
  Bitcoin's price. Pegging to a dollar would require a trusted price feed, so we accept the
  drift; if claiming ever feels expensive, wallets or communities can sponsor fees without
  changing the rule.

## If you lose your key

You can arm an opt-in recovery arrangement ahead of time, so a lost key is not the end of your
name. Only you can set it up, and only your pre-arranged backup keys can use it — recovery can
never be turned into a way for someone else to take a name.

## Why you can keep trusting it

ONT is built to end up **frozen, like Bitcoin** — not a service that quietly changes under you:

- At launch, every rule that decides ownership is intended to live in a deliberately small,
  audited core that a careful reader can confirm in a handful of files. Today that core covers
  owner-key authority and replay validation; auction settlement still runs outside it and is
  being moved in (see "What's real today"). **At launch the boundary freezes**, and what is
  inside it is exactly what is audited.
- The project operates no privileged role, and any future rule change is **opt-in** — no one can
  force a new version on you.

## What's real today — designed, built, live

Honesty about maturity is commitment six, so here is the current state plainly
(per [`core/STATUS.md`](./core/STATUS.md), which wins if this summary drifts):

- **Live on a private Bitcoin test network:** the full core lifecycle — claim, own, transfer,
  update, recover, and settle a contested name by auction — runs end-to-end. The batched claim
  path also runs end-to-end (since 2026-06-09): a claim is anchored on Bitcoin, independently
  re-verified against the anchored commitment, and resolves publicly. The same 12-word phrase
  derives identical keys on every surface (engine, web tools, mobile app, claim site), locked by
  shared conformance tests.
- **Designed but not yet enforced in the live path:** the fail-closed data-availability deadline
  that defends contested names against withheld batch data; the rule that a batch's Bitcoin fee
  must cover the full ₿1,000 × N of the names inside it; and the light-client proof path that
  lets an app verify inclusion against Bitcoin without a server. Auction settlement runs today in
  code that sits *outside* the audited core; moving it inside is decided and in progress.
- **Placeholders:** launch parameters (fees, windows, bond floors, lock durations) are not
  frozen, and nothing should be read as final until they are.

None of this changes the design above — it is a matter of maturity, not direction.

## Going deeper

- **[One-pager](./ONT_ONE_PAGER.md)** — the short, review-oriented summary.
- **[Design](./DESIGN.md)** — one level below this page, for technical reviewers:
  the model, trust surface, scaling and data availability, economics, prior art, and the open
  questions (including the auction form).
- **[Status](./core/STATUS.md)** — the single source of truth for what is real today and the key
  numbers.
- **[Decision log](./core/DECISIONS.md)** — every decision, in order, with its current status.
- **[Architecture](./core/ARCHITECTURE.md)** — the builder's map:
  active design, active code entrypoints, retired paths, and next work.
- **Earlier explorations** (in `docs/research/`, marked historical) — paths considered and not
  pursued, kept for honesty. They are not the design; don't read them as the plan.
