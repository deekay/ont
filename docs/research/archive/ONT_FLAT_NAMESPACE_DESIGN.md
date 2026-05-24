# ONT Flat Namespace — Design Summary

A plain-language summary of the design we converged on. Deep references:
[ONT_DESIGN_REQUIREMENTS.md](../../design/ONT_DESIGN_REQUIREMENTS.md) (the criteria) and
[BITCOIN_ANCHORED_NAME_ACCUMULATOR.md](../BITCOIN_ANCHORED_NAME_ACCUMULATOR.md)
(the accumulator mechanics + red-team).

Status: credible paper design, no known dealbreaker. Not yet prototyped.

## What we're building

One **flat** namespace (`alice`, never `alice@thing`) where a name is **truly
owned** (no rent, no renewal, no forced sale), **neutral** (nobody is the
registrar/editor), **verifiable** without trusting any single party, **anchored
to Bitcoin**, and able to **scale to billions** of people, agents, and devices.

## The five rules we never break

1. **Uniqueness** — a name resolves to exactly one owner/destination, globally.
2. **Sovereignty** — one-time cost; after that it's permanently yours.
3. **Neutrality** — mechanical allocation only; no editor, no token, no registrar.
4. **Verifiability** — anyone can check ownership without trusting one service.
5. **Bitcoin settlement** — ordering and disputes resolve on Bitcoin.

Flat is a strong aim; scale is the thing that flexes if forced.

## The one idea that makes it work

The old approach was "publish a claim, wait, and see if anyone objects." Proving
"nobody objected" always required trusting a server or a committee. That was the
wall.

The fix: **make a name unique the instant it's added to the set.** The whole
namespace is one cryptographic set (a Merkle tree keyed by the name). To claim
`alice` you prove `alice` isn't in the set, then it's added. You can't add a name
twice — uniqueness is enforced at insertion.

Note on windows: the *uniqueness invariant* is insertion-time, but the
*allocation front-end* (getting from "unclaimed" to "inserted") has a short
public window so contenders can show up — issuance auctions need one. This is
**not** the old title-notice window. There, finality meant proving *no objection
appeared across murky off-chain logs* — an unprovable negative needing trusted
witnesses, wide open to quiet capture. Here, every claim is anchored in Bitcoin's
public, ordered batch stream, so "was this name contested in blocks N→N+W?" is a
**deterministic public fact** anyone can replay. The set's fingerprint (a "root")
is written to Bitcoin.

## How it scales

A Bitcoin UTXO per name can't reach 8 billion — that's centuries of blockspace.
The accumulator puts names in a Bitcoin-anchored **set**: only the root touches
Bitcoin, **once per batch** of ~10,000 names. All 8 billion names then anchor in
roughly **one day's worth of 1% of Bitcoin blockspace**. The names themselves
live off-chain; Bitcoin only ever sees compact roots.

## Getting a name — the normal case (the billions)

1. You claim a name. The claim is **publicly visible**. You pay a tiny, **one-time
   sunk cost** (proof-of-work or a small fee — paid to no registrar).
2. A short window passes. If nobody else wants it, **it's yours** — permanently,
   no rent, no renewal, no UTXO, no third party.

That's the mass path. Fast, cheap, sovereign.

## Contested names — price discovery without an editor

The cheap claim above carries **no binding capital** — just the sunk cost. What
starts an auction is **contention during the pending window**: anyone watching
who also wants the name submits their own (cheap) competing claim. At window
close:

- **One claimant → they get it** at the sunk cost (plus a length-based floor; see
  below). No capital locked, no auction.
- **Two or more → escalate to a sealed-bid second-price auction.** The contenders
  now post **binding, timelocked** bids; the highest bidder wins and pays the
  second-highest, which becomes their returnable bond. You bid your true value;
  it's the same clearing price as a live rising auction, in one round, with
  fake-bid manipulation designed out (bid *amounts* are sealed; names are not).

Binding capital is locked **only on escalation**, so the billions of uncontested
claims never lock a UTXO — only the few contested names do.

Key properties:

- **Nobody classifies names as "premium."** Contention *reveals* which names are
  scarce. Tiers are emergent, never assigned — so no editorializing.
- **The winner locks a returnable bond** (their own Bitcoin, paid to nobody, no
  burn). Contested names are few, so a per-name UTXO here is affordable.
- **A mechanical length-floor** (`max(₿0.0005, ₿1/2^(length-1))`, from v1) sets
  the cost for short, premium-shaped names even uncontested — so they can't be
  grabbed for pennies on day one.

### Two cost forms — and nobody sinks meaningful Bitcoin

The form of the cost depends on the tier, and it's the crux of the economics:

- **Premium / short-shaped / contested names → a returnable BOND.** Locked in a
  UTXO, returned after maturity (the v1 model). Size set by the auction (if
  contested) or the length-floor (if uncontested but short). The real cost is
  *opportunity cost on locked capital*, not destroyed money. These are few, so
  per-name UTXOs are affordable — and this is the path early adopters take.
- **Cheap long-tail names → a flat SUNK fee (~$1)**, set in sats and paid to
  miners as part of the batch transaction. No UTXO, so it scales to billions. It
  is small *per name* but charged *per name* — a bulk-grab still pays it for every
  name (1M names ≈ $1M sunk). Anything substantial *per name* is locked-and-returned.

This is why bonding ₿1–2 against an unproven system is reasonable (you risk
yield, keep principal) while *sinking* a whole bitcoin would not be — and the
design never asks anyone to sink more than ~$1 per name. Early dynamics skew
heavily to the bond path (premium/contested names); the ~$1 sunk-fee tail is
later mass-adoption behavior. (The ~$1 is set in sats at launch and floats with
BTC price; pegging it to a fixed dollar value would need a price oracle, which we
avoid for neutrality.)

## Pricing: flat fee + auctions (not a rate throttle)

Issuance cost does **not** rise with how many names are being claimed. Aggregate
claim *rate* is not a scarcity signal: a million people claiming a million
*different* names aren't competing for anything — distinct names don't collide,
they batch in parallel, and the namespace is effectively unbounded. (This is
unlike Bitcoin fees, where every transaction competes for the same scarce
blockspace.) An earlier draft used a Bitcoin-difficulty-style demand throttle; it
was dropped because it can't tell a whale (Sybil'd across a million keys) from a
million real users, so it would tax genuine adoption surges.

What gets priced is **genuine scarcity**, of which there are two kinds:

- **A specific contested name** → auction (returnable bond), priced by real
  competing demand.
- **A short, premium-shaped name** → length-floor (returnable bond), priced by
  shape.

Everything else — the uncontested long tail — pays the **flat ~$1 sunk fee**,
no matter how busy the network is:

| Scenario | What happens |
| --- | --- |
| 1 person claims 1 name | ~$1 (or a bond if short/contested) |
| 1M people, 1M *different* names, at once | each pays ~$1 — no surge, just batched throughput |
| 1 whale grabs 1M names | 1M × ~$1 ≈ $1M sunk — deterred linearly, not by a rate penalty |
| 2 people want the *same* name | auction → returnable bond |

Bulk-grabbing is deterred by the **linear** sunk cost (small per name, real in
bulk), never by punishing volume — so a popularity wave stays cheap for everyone,
which is what you want from a namespace you hope billions adopt.

**Residual:** a *patient* actor can still accumulate medium-value, uncontested
names at the flat fee over time. Bounded by the linear sunk cost (real money,
gone), by those names being individually low-value, and by any name someone wants
triggering an auction. Not zeroed — the irreducible "names can't be both ~free
and perfectly hoard-proof" limit.

**Possible future exception:** if the data-availability / batch-publishing layer
ever hit a real capacity ceiling, a congestion fee for batch *inclusion* could
emerge (like a mempool). But that's a genuine infrastructure constraint solved by
adding capacity — not an artificial scarcity — and a surge of real users is when
you'd scale up, not price them out.

## Where the money lives (the locks)

- **Always real Bitcoin, in your own UTXO.** Never an ONT balance, never
  custodied by ONT or an indexer.
- **Bid capital is Bitcoin-timelocked** during the auction, so it can't be yanked
  mid-auction to manipulate the clearing price.
- **A won name's bond is a watched UTXO**: spend it and you forfeit the name (the
  v1 rule). It's returnable.

ONT's only role here is the *rulebook* — "this UTXO is name X's bond; spending it
forfeits X." Bitcoin holds the coins and enforces the timelocks.

## Who runs it (no registrar)

- **Anyone can publish a batch** by broadcasting a normal Bitcoin transaction
  whose output commits the new root. Bitcoin orders these; ONT clients accept the
  first valid, data-available one. No special key, no permission, no covenant, no
  soft fork.
- **"Sponsors" are just these publishers.** They pay the Bitcoin anchoring cost
  for many users at once and charge a small, market-priced service fee. They
  **cannot** forge ownership or censor unbreakably, and competition plus the
  direct-Bitcoin fallback caps their fee.
- **If you're censored, you claim directly on Bitcoin.** That fallback is both the
  censorship escape and the ceiling on what any publisher can charge.

## What Bitcoin does vs. what ONT does

- **Bitcoin:** holds the value, orders the events, is the un-censorable backstop.
- **ONT clients:** enforce the rules by replaying Bitcoin.

Said honestly: this is a **Bitcoin-sequenced rollup of names**. Bitcoin does not
validate each name; ONT software does. That trade is what buys the scale, and the
design's job is to make it safe (it does, under the assumptions below).

## What it achieves

| Requirement | Result |
| --- | --- |
| Uniqueness | Pass (enforced at insertion) |
| Sovereignty | Pass (one-time cost, no rent/revocation) |
| Neutrality | Pass (mechanical; tiers emergent; sponsors can't be registrars) |
| Verifiability | Pass, conditional on data availability + ≥1 honest watcher |
| Bitcoin settlement | Pass (Bitcoin orders; direct-L1 fallback) |
| Flat namespace | Pass (one keyspace, no hierarchy) |
| Scale | Billions/year |

No new token. No registrar. No reliance on any other chain.

## What's still genuinely open (honest)

1. **Data availability.** Late-joining full verifiers lean on archives or
   Bitcoin-anchored snapshots. This degrades *liveness* (can't make new claims),
   never *safety* (you can't lose a name you hold). It's an honest-minority
   storage assumption (≥1 archive keeps public history — cheap, replicable).
2. **Inclusion concentration.** Batch publishing may concentrate, but the
   direct-Bitcoin fallback caps a dominant publisher at ~L1 cost. Worst case
   degrades to v1 economics — it never captures ownership.
3. **Cold-start / early-mover advantage.** On a quiet launch, an early mover can
   grab good names (paying the length-floor bond). This cannot be zeroed without
   making names perpetually contestable (which breaks sovereignty). Mitigated by
   the length floor, visible claims, and — crucially — a **loud, scheduled
   launch** so bidders actually show up. Partly a launch-strategy fact, not a
   protocol bug.
4. **Shill-bidding / griefing auctions.** Bounded by binding (timelocked) capital
   and the sunk commit cost; not eliminated.
5. **It's a paper design.** Needs a prototype to become proven.

## Next step

Prototype to turn paper into proof:

1. Sparse Merkle tree with membership + non-membership proofs over `H(name)`.
2. A signet-anchored chain of roots that rejects invalid transitions.
3. A fail-closed data-availability check.
4. The direct-Bitcoin censorship fallback.
5. A contested-name flow: visible claim → sealed second-price bids → timelocked
   binding capital → returnable-bond settlement.
