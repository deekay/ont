# ONT — Risks & Open Questions in Plain Language

A plain-English companion to [`ONT_RISK_REGISTER.md`](./ONT_RISK_REGISTER.md). Same items, no
jargon, one concrete example each. The R-tags (R1, R2, …) cross-reference the technical register.

Each item is labelled by **what kind of problem it is**:

- 🔴 **Could kill it** — if this doesn't work, the approach fails.
- 🎲 **A bet** — depends on something we can't know for sure until launch.
- 🤔 **A decision** — we have options and just haven't chosen.
- 📏 **Unmeasured** — we assumed numbers we haven't tested yet.
- ✅ **Largely handled** — understood, with a fix in hand.

Last updated: 2026-05-23.

---

## The short version

Most of the list is ordinary work — decisions to make and numbers to measure. The handful that
could **actually sink the project** are:

1. **Everyone agreeing on who owns what** (R1) — the system only works if all participants
   compute the same answer. The *mechanism* now works in code; the *agreement rule* still needs
   writing.
2. **How often people fight over the same name** (R3) — this single unknown swings capacity by
   ~100×. We can't know it until launch, though it's likely *self-limiting*: high early on a few
   prize names, low once most claims are long-tail handles nobody else wants — and the high-contest
   phase is also the low-volume phase that plain Bitcoin can absorb.
3. **The premium short-name auction** (R4) — we can't get everything we wanted on Bitcoin today;
   we have to pick a compromise.

Everything else below is "work," not "danger."

---

## 1. Will my name stay mine? (ownership safety)

### Stale "where it points" record — 🤔 *a decision* (R15)
You permanently own the name, but the *destination* it points to (say, a payment address) is a
record you sign and update. An out-of-date copy can mislead someone.

> **Example:** You own `alice` and point it at a wallet. Later you move to a new wallet. Someone
> with a cached old record pays your *old* address. You still own `alice` — but the payment went
> to the wrong place.

**What would settle it:** stamp each record with a version number and a recent Bitcoin-block
marker, so anyone can tell whether they're looking at a fresh record or a stale one.

---

## 2. Can someone steal a name while I'm registering it? (fairness at registration)

### Queue-jumping / ordering games — 🟡 *analyzed, bounded* (R9)
The worry: whoever controls ordering (a miner, or the party that batches claims) sees a valuable
name coming and grabs it, or reorders an auction to help a friend.

> **Example:** You broadcast a claim for `coffee`. A bot watching the network tries to get its own
> `coffee` claim in just before yours — and win the name you found first.

**Where it stands (analyzed — see [`ONT_MEV_ORDERING_ANALYSIS.md`](./ONT_MEV_ORDERING_ANALYSIS.md)):**
**you can't steal a name by controlling ordering.** Three things stop it: names are *hidden* until
it's too late to copy them (you commit to a hidden claim first, reveal later); *different* names
don't compete (ordering only matters when two people want the same name); and a contested name is
won by **bidding the most, not by being first**. So a miner who reorders gains nothing — they'd
still have to outbid everyone. What's left is bounded, not theft: once a name is revealed, someone
can *contest* it into an auction (that's really the cold-start issue below), and a relay could
mishandle bids in an open auction (fixed by using a sealed auction, and by the always-available
direct-to-Bitcoin fallback).

### Conflicts that arrive minutes apart — 🔴 *could kill it / partly proven* (R2 gap)
Real claims trickle in over several blocks, not all at once. Two people can claim the same name a
few minutes apart, and *everyone has to agree* on who won.

> **Example:** You claim `coffee` at 2:00, someone else at 2:03. Both are floating around the
> network. Every participant must independently reach the *same* verdict about who was first —
> otherwise different people think different owners hold `coffee`.

**Where it stands:** the prototype proves the tie-break is deterministic for a single snapshot
(see [`ONT_HARD_PROBLEMS.md`](./ONT_HARD_PROBLEMS.md)); the realistic *rolling window* where
conflicts pile up over several blocks isn't modeled yet.

### Land-grab at launch — 🎲 *a bet* (R7)
The first 5–8 character names have no minimum price and rely on competition to set value. If
launch is quiet, an early mover can sweep up the good ones cheaply.

> **Example:** Before anyone's paying attention, one person registers `pizza`, `hotel`, `coffee`
> and hundreds more for ₿1,000 (~$1) each, then resells them.

**Where it stands:** mitigated by a loud, scheduled launch and the fact that the resale market
reprices names anyway — but it's a bet on attention at launch.

### Slow hoarding over time — ✅ *largely handled* (R10)
Someone patiently buying up medium-value names at the floor price.

> **Example:** A squatter quietly registers a few hundred plausible names a month for ₿1,000 (~$1) each.

**Where it stands:** accepted as bounded — the cost adds up in a straight line and each name is
low-value, so there's no cheap corner to exploit.

### The short-name price cliff — 🤔 *a decision* (R6)
Names of 4 characters or fewer cost dramatically more than 5-character names, and junk short names
get charged like valuable ones.

> **Example:** `x7q2` (gibberish) is priced the same as `bank` (premium), just because both are
> 4 characters.

**Where it stands:** accepted for now; revisit if people start gaming the boundary.

---

## 3. Will the system stay up and honest? (liveness)

### Everyone seeing the same data — 🔴 *could kill it (but milder than it looks)* (R1)
To agree on who owns what, all participants need to be able to *see* every batch of registrations.
The scary version: someone hides data and breaks the system.

**The reframe (important):** in this design, hiding your own batch only loses *your own* names —
it can't freeze or corrupt anyone else's, because the combined result is just a union of
independent claims. So withholding is **self-harm**, not an attack on others.

> **Example:** A publisher commits a batch but never reveals it. Result: *their* names simply
> don't register. Everyone else is unaffected.

That leaves two narrower real risks:
- **Disagreement / splits.** If my copy saw a batch and yours didn't, we'd compute different
  answers. *(Example: my server saw your `coffee` claim, yours didn't — now we disagree on the
  owner.)*
- **Catching a bad summary.** Phones trust a short summary; the full data must exist *somewhere*
  so a lie can be caught.

**Where it stands:** archival is well covered — the creator plus aligned institutions (e.g. Block,
Coinbase) can each run a server. Crucially that's **"any one is enough, and none can lie"** (every
answer checks against Bitcoin). The **agreement rule** now has a worked-through design (see
[`ONT_DATA_AVAILABILITY_AGREEMENT.md`](../spec/ONT_DATA_AVAILABILITY_AGREEMENT.md)). The key realization:
the dangerous disagreement only matters for **contested** names. For the long tail nobody else
wants, a late batch just registers later — no harm. So the hard part shrinks to a small corner
(contested names), which can fall back to putting full data directly on Bitcoin. **This is now
tested in code** (`da-convergence-sim.ts`): with someone deliberately hiding data, the naive
"trust what I happened to receive" rule splits the network, while the proposed rule keeps every
honest node in agreement — and a hide-then-reveal attempt to steal a name fails. Still to do: pin
the exact timing windows and spell out the on-chain "it's available" marker transaction.

### Who publishes the running tally — and what if they quit — 🤔 *a decision* (R2 gap)
Someone has to compute and publish the combined result each block so lightweight users get a quick
answer.

> **Example:** Everyone's busy and nobody bothers publishing this week's tally. Full computers can
> still recompute it themselves, but phones are left waiting.

**Where it stands:** open — it works technically (anyone can do it, and a wrong tally is rejected),
but there's no *incentive* yet that guarantees someone actually does it.

### Letting a phone catch a lie — 🔴 *could kill it / not built* (R2 gap)
A phone can't redo all the math, so it trusts a summary — but it must be able to detect and reject
a *false* summary.

> **Example:** A bad actor publishes a tally claiming they own `coffee` when they don't. A phone
> needs a cheap way to be handed proof of the lie and reject it.

**Where it stands:** not built yet — there's no "here's proof the summary is wrong" challenge
mechanism prototyped.

---

## 4. Will it stay neutral, or creep toward central control? (neutrality — the top priority)

### The convenience server becoming *the* server — 🤔 *a watch item*
Running archival servers is fine. The danger is everyone quietly depending on the *creator's*
server because it's easiest — that's de facto centralization even though the protocol doesn't
require it.

> **Example:** Every wallet hard-codes "ask ont.org's server," and the day it goes down, the whole
> ecosystem stalls — even though anyone *could* have run their own.

**What keeps it safe:** design so any one server suffices, switching is trivial, and every answer
is verifiable against Bitcoin — so no single server is ever *trusted*, only *convenient*.

### Batchers consolidating — 🎲 *a bet* (R8)
The parties who bundle registrations might merge into a few big players due to economies of scale,
concentrating *who gets included* (not *who owns* — ownership stays yours).

> **Example:** One big batcher handles 90% of registrations and quietly deprioritizes a
> competitor's customers.

**Where it stands:** mitigated because anyone can always go straight to Bitcoin themselves, which
caps how much a big batcher can overcharge — but concentration is still possible.

---

## 5. Will it really handle billions of names cheaply? (scale & cost)

### The throughput trick works — but the numbers aren't measured — 📏 *unmeasured* (R2 → R11)
The mechanism that lets huge numbers of registrations process in parallel is proven *logically* in
code. Its real-world speed and the size of the proofs at billions of names are not yet measured.

> **Example:** It works for 8 names in a test. Does it still work — fast, with small proofs — at
> 8 billion? We don't have the measurement.

**What would settle it:** a benchmark on a test network at realistic scale.

### A new full computer has to download everything — 🤔 *uncertain* (R12)
Someone setting up a fresh full node must replay the whole history, which could be hundreds of
gigabytes at billions of names — nudging people toward trusting a shortcut snapshot.

> **Example:** You want to run your own independent node, but first you have to download 400 GB.
> Most people won't, so they trust someone's snapshot instead.

**Where it stands:** mitigations exist (Bitcoin-anchored snapshots you can verify, plus pruning
old data), but it's not fully worked out.

### The assumed sizes are estimates — 📏 *unmeasured* (R11)
Transaction sizes, batch sizes, and proof sizes are all educated guesses right now.

**What would settle it:** measure them on a test network.

### How often people fight over a name — 🎲 *the big bet, but self-limiting* (R3)
If lots of registrations are contested, the system processes far fewer per block; if few are
contested, it flies. This one number swings total capacity by about 100× — and it's unknowable
until real users arrive.

> **Example:** If 1 in 10 claims is a fight, capacity collapses. If 1 in 1,000, it scales
> massively. Same system, wildly different outcome.

**Explicit assumption — the contest rate falls as the namespace grows.** Early on, contests will be
*frequent but few in number*: everyone piles onto the obvious prizes — `bitcoin`, `ont`, `google`,
dictionary words, brands. As adoption grows, the typical new claim becomes a long-tail handle like
`sallysmith2165` that nobody else wants, so the *share* of contested claims drops.

> **Example:** In year one, maybe half of all claims are fights over a few hundred premium words.
> By the time the system is registering millions of personal handles a day, almost none are
> contested — there's only one person who wants `sallysmith2165`.

The reassuring consequence: **the high-contest period is also the low-volume period.** Heavy
contests throttle throughput exactly when total volume is tiny — small enough to settle directly on
Bitcoin without the scaling machinery. By the time you need big throughput, the marginal claim is
uncontested.

**Caveats (why it's still a bet):**
- The premium set is bounded and *depletes* — once `google` is claimed, it's gone — so the early
  contest pool shrinks on its own.
- It won't hit zero: speculators may keep racing for *predictably* valuable patterns (short names,
  trending words), so expect a low contested floor, not none.
- Still unverified until launch — the design must degrade *safely* (fall back to plain Bitcoin
  economics) whenever contests spike.

---

## 6. Knobs we haven't set yet (open decisions)

### The anti-spam "gate": fee vs. proof-of-work — 🤔 *a decision* (R13)
To stop someone registering a billion junk names, registration must cost something. Two options:

- **Charge a Bitcoin fee** — simple, but ties the system's health to Bitcoin's fee market and
  leans on the batchers.
- **Require proof-of-work** — make registrants burn some computation instead, which avoids fees
  but brings its own centralization and verification headaches.

> **Example:** Either you pay a small bitcoin amount per name, or your computer grinds for a few
> seconds per name. Both stop spam; both have side effects.

**Where it stands:** genuinely undecided.

### The premium short-name auction — 🔴 *could kill it / leaning* (R4)
For rare short names there'd be an auction. The honest finding: you **can't** have all three of
"everyone watches bids live" + "bids are binding" + "it's cheap" on Bitcoin as it exists today.

> **Example:** You want a live, public bidding war for `app` where every bid is real and
> unbackoutable — but making bids both *public-as-they-happen* and *impossible to renege* without
> a costly on-chain transaction each isn't possible yet.

**Where it stands:** leaning toward a compromise — exciting *non-binding* open bidding to build
drama, then a single *binding* sealed round to settle — with truly marquee names done fully
on-chain. Recommended, not yet decided or spelled out. (Full analysis in
[`ONT_HARD_PROBLEMS.md`](./ONT_HARD_PROBLEMS.md).)

### Prices drifting with Bitcoin's price — 🎲 *a bet* (R5)
Fees and floors are fixed *amounts of bitcoin*. As Bitcoin's price moves, the real-world cost — and
therefore how well it deters spam and squatters — drifts.

> **Example:** A ₿1,000 floor that feels like ~$1 today could effectively become $4 if Bitcoin
> quadruples, or 25¢ if it crashes — changing how much friction it provides.

**Where it stands:** decide whether that drift is acceptable, or whether to add a neutral way to
re-peg — without introducing a price oracle (which would add trust).

### Timing knobs not yet pinned — 🤔 *a decision* (R14)
Various settings — how many confirmations to wait, delays between steps, how long windows stay
open, how long bonds are held — aren't fixed yet.

**Where it stands:** pin these during prototyping, weighing speed against safety.

---

## How to use this list

- Where to spend worry: the 🔴 items plus the load-bearing 🎲 bets — agreement (R1, now prototyped),
  the auction (R4), the not-yet-built phone-catches-a-lie path, and the contest rate (R3, though
  it's likely self-limiting). Ordering/MEV (R9) has been analyzed and is bounded.
- The 🤔 items are decisions you can make deliberately, not emergencies.
- The 📏 items just need a test network and measurement.
- Through all of it, **neutrality is the line that can't be crossed** — anything that quietly makes
  one party (including the creator) load-bearing is the thing to design out.
