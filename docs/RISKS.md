# ONT — Risks

> On 2026-06-11, per doc-canon (#45) in [`core/DECISIONS.md`](./core/DECISIONS.md), this
> document absorbed the five risk/adversarial docs: the risk register
> (`design/ONT_RISK_REGISTER.md`), the plain-language companion
> (`design/ONT_RISKS_PLAIN_LANGUAGE.md`), the MEV/ordering analysis
> (`design/ONT_MEV_ORDERING_ANALYSIS.md`), the whole-system adversarial analysis
> (`research/ONT_ADVERSARIAL_ANALYSIS.md`), and the adversarial risk ranking
> (`research/ONT_ADVERSARIAL_RISK_RANKING.md`) — all archived with SUPERSEDED banners.
> The R-tags (R1, R2, …) are stable anchors and survive the merge unchanged.

One document, four layers, ordered shallow to deep:

1. **The short version** — what could actually sink the project.
2. **The register (R1–R16)** — the technical inventory; the R-tags everything else
   cross-references.
3. **In plain language** — the same items, no jargon, one concrete example each.
4. **The deep analyses** — ordering/MEV (R9), the whole-system threat model (four
   surfaces + launch fairness), and the ranked adversarial assessment.

Each layer keeps its own "last updated" stamp; where an older layer disagrees with the
register, **the register is current**. For what is actually built and wired today,
[`core/STATUS.md`](./core/STATUS.md) is the single source of truth.

---

## The short version

Most of the list is ordinary work — decisions to make and numbers to measure. The handful
that could **actually sink the project**:

1. **Everyone agreeing on who owns what** (R1) — the system only works if all participants
   compute the same answer. The mechanism now works in code (fail-closed data availability,
   tested over the production accumulator); the residual is parameter-pinning and the
   isolated 1-of-N archive assumption.
2. **How often people fight over the same name** (R3) — this single unknown swings capacity
   by ~100×. We can't know it until launch, though it's likely *self-limiting*: high early
   on a few prize names, low once most claims are long-tail handles nobody else wants — and
   the high-contest phase is also the low-volume phase that plain Bitcoin can absorb.
3. **The premium short-name auction** (R4) — *resolved by removal, 2026-05-24*: there is no
   off-chain auction. The batched claim path is uncontested-only; a contested name escalates
   to the proven L1 bonded auction. The residual auction risk is closure gaming and bid
   mechanics on L1 (see the ranked assessment below and
   [`OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md) §2.1).

How to read the shape of the risk (register view, 2026-06-04):

- **What could actually kill it:** R2 (chaining) was the *unsolved-mechanism* risk — now
  prototyped into the production batched claim path; R1 (data availability) and R3 (contest rate) are the *bets*
  the whole thesis rests on.
- **What's just work:** R11–R15 are knowable — prototype and decide.
- **What recent decisions newly exposed:** R5 (BTC-price drift, a direct cost of the
  no-oracle / denominate-in-bitcoin choice).

Deep dives on the hard problems live in [`OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md).

---

## The register (R1–R16)

*Absorbed from `design/ONT_RISK_REGISTER.md` (living register). Last updated: 2026-06-04.*

Tracks the open uncertainties and failure modes for the flat-namespace / accumulator
design. **Kind** tells you what to *do* about each:

- **Unsolved** — no known mechanism yet (needs a design breakthrough)
- **Bet** — hinges on an empirical/external unknown we can't settle on paper
- **Undecided** — we have options, just haven't chosen
- **Unvalidated** — assumed numbers, never measured

Severity: **fatal** (could kill the design), **high**, **medium**, **low**.

| ID | Risk | Kind | Severity | Status / next step |
| --- | --- | --- | --- | --- |
| R1 | **Data availability / convergence** — honest nodes must agree on one root from Bitcoin alone; withholding can't halt others (self-harm) but a timing disagreement on a *contested* leaf forks the chain | Bet → approach prototyped | Fatal (liveness) | **Decomposed + prototyped ([`spec/ONT_DATA_AVAILABILITY_AGREEMENT.md`](./spec/ONT_DATA_AVAILABILITY_AGREEMENT.md), `da-convergence-sim.ts`):** uncontested leaves self-heal (commutativity + K-block lag); contested leaves use a Bitcoin-timed, anchor-keyed deadline + fail-closed challenge (marker-fold (#47) retired the separate marker event), escalating to direct-L1. Convergence vs. a withholding adversary passes in code (naive rule forks, proposed converges) — **now over the production accumulator** (`batch-rail.ts`), with the resulting ownership provable via C1 proofs. Residual = isolated 1-of-N archive assumption. Open: pin windows, spec the served-bytes witness, decide on data-availability sampling |
| R2 | **Leaderless chaining / throughput** — many anchors/block need to chain with no privileged sequencer; naive racing collapses to ~1 batch/block or re-centralizes | Unsolved → mechanism prototyped | Fatal (scale) | **Candidate prototyped: per-block delta-merge** (`packages/core/src/delta-merge-sim.ts`) — commutativity, conflict determinism, data-availability exclusion, compact proofs all pass — **now wired into the production batched claim path** (`batch-rail.ts`): deltas merged into the real C1 accumulator with derived roots anchored in the C2 root chain. Remaining work is live scale numbers (→ R11), not mechanism. See [`OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md) |
| R3 | **Contest rate** — capacity swings ~100× on a number unknowable until launch. *Assumed time-varying:* high but low-volume early (everyone piles onto `bitcoin`/`google`/dictionary words), falling as the namespace matures and the marginal claim is a long-tail handle (`sallysmith2165`) nobody contests | Bet | High | Design must degrade safely toward L1 economics. Note the heavy-contest regime coincides with low volume (absorbable on L1); premium set is bounded and depletes. Monitor post-launch; expect a low contested floor (speculative racing), not zero |
| R4 | **Off-chain auction binding + ordering** — making escalating bids visible, binding, and cheap at once | Resolved by removal 2026-05-24 | (was High) | **Decided: no off-chain auction.** the batched claim path is *uncontested-only*; a contested long-tail name escalates to the proven **L1 bonded auction**. This deletes the visible+binding+cheap problem from the rail (`batch-rail.ts` now escalates contests). See [`OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md) |
| R5 | **BTC-price drift of gate/floors** — fixed-bitcoin amounts mean anti-spam/anti-squat strength floats with BTC price (no-oracle tradeoff) | Bet | Medium | Decide whether drift is acceptable or needs a neutral re-peg mechanism |
| R6 | **≤4-char cliff + junk-short over-tax** — 12,500× floor jump at 4→5; `x7q2` floored like `bank` | Undecided | Low–Med | Accepted for now; revisit if boundary gaming appears |
| R7 | **Cold-start (5–8 char premium)** — no length floor, relies on contention; a quiet launch lets an early whale sweep premium names cheaply before the market is liquid (you can't reliably get competing bidders on day 1) | Bet → options identified | Medium | Loud scheduled launch + watch tooling; secondary market reprices (a sweeper paid real money, can't rent, must resell). **Mitigation options (2026-05-26), all must stay mechanical/uniform (I3):** (a) **decaying launch gate** — claim cost starts high at genesis and decays on a fixed pre-announced schedule to the ₿1,000 floor; hits *cheap* capture directly, uniform, no selection rule, sybil-proof, freeze-friendly — **leading candidate**; (b) **slow-drip supply cap** — throttle names/period early to force contention; open issues: which claims clear when over-subscribed, must sunset, demand-gating is gameable / can starve, taxes the long tail; (c) **accept it** — a one-time land rush captured by an early mover. ≤4-char already protected by length floors. Ruled out: reserved lists (violate I3), per-person caps (sybil) |
| R8 | **Publisher / inclusion concentration** — economies of scale may centralize liveness/cost even if not safety | Bet | Medium | Direct-L1 caps pricing at L1 cost; monitor concentration |
| R9 | **MEV / ordering games** — publisher (or publisher+miner) sees pending claims & bids; subtle latency/selective-inclusion value | Analyzed | Medium | **Analyzed (see the MEV & ordering analysis below):** ordering **can't steal a name** — an auction is opened by a *bond*, not a claim alone, so a cheap collision can only *nullify* a name (deny), never award it; acquiring a contested name requires the winning bond (same cost for a miner as for anyone). Disjoint names commute; L1 fallback bounds censorship. Residual (reveal-contestation = R7; open-auction relay bid handling) bounded; the former below-threshold ordering grab is closed (see **R16**). Adds a vote for sealed second-price (R4) |
| R10 | **Patient accumulation at the gate** — slow hoarding of medium-value names at ₿1,000 (~$1) each | Bet | Low | Bounded by linear cost + low per-name value; accept |
| R11 | **Paper design — unvalidated numbers** — 150 vB anchor, 110 vB contested, 10k/batch, SMT proof sizes all estimated | Unvalidated → partly measured | High | **Measured (`accumulator.ts`, `root-anchor.ts`):** SMT proofs ~log₂(N), 339 B @ 100 → 577 B @ 10k (~1.1 KB @ 1e9); **anchor tx 162–194 vB — ABOVE the 150 vB estimate** (still ~0.016–0.019 vB/name @ 10k, tiny). Still pending: contested vB, real batch sizes, live broadcast |
| R12 | **Full-verifier state growth** — fresh full indexer is O(N) (hundreds of GB at billions) → leans on trusted snapshots | Uncertain | Medium | Bitcoin-anchored snapshots (assumeutxo-style); state pruning |
| R13 | **Gate form** — miner-fee (security-budget systemic-ness + publisher intermediation) vs PoW (verification/centralization) | Decided 2026-05-24 | Medium | **Decided: Bitcoin miner fee** (simplicity + security-budget contribution). Accepted: Bitcoin both prices and orders; PoW would have been cleaner for neutrality/censorship-fallback. R5 drift still applies |
| R14 | **Unpinned parameters** — K-confirm depth, commit→reveal delay, notice window, bond maturity | Undecided | Low | Pin during prototype with explicit latency/safety tradeoffs |
| R15 | **Destination/resolution freshness** — ownership is unique but the destination is an owner-signed off-chain record (stale-routing risk for payment handles) | Undecided | Medium | Bind records to monotonic version + recent Bitcoin-height freshness marker |
| R16 | **No-bond-fallback / ordering grab** — an earlier draft resolved an un-bonded contest by raw `(height, tx-index)` ordering, which let a block-winning miner self-claim and *take* a low-value contested name for ~₿1,000 paid to itself (fee-to-self), converting ordering power into acquisition | **Resolved by design** | Low | **Fix: a bond — not a claim alone — opens the auction.** A cheap collision with no bond *nullifies* the name (it reopens for claiming), never awards it; acquiring a contested name requires a qualifying bond (largest wins), bond-first allowed. So front-running a cheap claim buys nothing, and acquisition costs the same locked capital for a miner as for anyone. Residual: a spite-griefer can still *deny* (nullify) a targeted name for ₿1,000 with no payoff, defendable by bonding — unprofitable, accepted. See [`spec/ONT_ACQUISITION_STATE_MACHINE.md`](./spec/ONT_ACQUISITION_STATE_MACHINE.md) and the MEV & ordering analysis below (§D3) |

---

## In plain language

*Absorbed from `design/ONT_RISKS_PLAIN_LANGUAGE.md`. Last updated: 2026-05-23 — this layer
predates some register updates (notably R4's resolution-by-removal and R16); where they
disagree, the register above is current.*

Same items, no jargon, one concrete example each. The R-tags cross-reference the register
above. Each item is labelled by **what kind of problem it is**:

- 🔴 **Could kill it** — if this doesn't work, the approach fails.
- 🎲 **A bet** — depends on something we can't know for sure until launch.
- 🤔 **A decision** — we have options and just haven't chosen.
- 📏 **Unmeasured** — we assumed numbers we haven't tested yet.
- ✅ **Largely handled** — understood, with a fix in hand.

### 1. Will my name stay mine? (ownership safety)

#### Stale "where it points" record — 🤔 *a decision* (R15)

You permanently own the name, but the *destination* it points to (say, a payment address)
is a record you sign and update. An out-of-date copy can mislead someone.

> **Example:** You own `alice` and point it at a wallet. Later you move to a new wallet.
> Someone with a cached old record pays your *old* address. You still own `alice` — but the
> payment went to the wrong place.

**What would settle it:** stamp each record with a version number and a recent
Bitcoin-block marker, so anyone can tell whether they're looking at a fresh record or a
stale one.

### 2. Can someone steal a name while I'm registering it? (fairness at registration)

#### Queue-jumping / ordering games — 🟡 *analyzed, bounded* (R9)

The worry: whoever controls ordering (a miner, or the party that batches claims) sees a
valuable name coming and grabs it, or reorders an auction to help a friend.

> **Example:** You broadcast a claim for `coffee`. A bot watching the network tries to get
> its own `coffee` claim in just before yours — and win the name you found first.

**Where it stands (analyzed — see the MEV & ordering analysis below):**
**you can't steal a name by controlling ordering.** Three things stop it: names are
*hidden* until it's too late to copy them (you commit to a hidden claim first, reveal
later); *different* names don't compete (ordering only matters when two people want the
same name); and a contested name is won by **bidding the most, not by being first**. So a
miner who reorders gains nothing — they'd still have to outbid everyone. What's left is
bounded, not theft: once a name is revealed, someone can *contest* it into an auction
(that's really the cold-start issue below), and a relay could mishandle bids in an open
auction (fixed by using a sealed auction, and by the always-available direct-to-Bitcoin
fallback).

#### Conflicts that arrive minutes apart — 🔴 *could kill it / partly proven* (R2 gap)

Real claims trickle in over several blocks, not all at once. Two people can claim the same
name a few minutes apart, and *everyone has to agree* on who won.

> **Example:** You claim `coffee` at 2:00, someone else at 2:03. Both are floating around
> the network. Every participant must independently reach the *same* verdict about who was
> first — otherwise different people think different owners hold `coffee`.

**Where it stands:** the prototype proves the tie-break is deterministic for a single
snapshot (see [`OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md)); the realistic *rolling window*
where conflicts pile up over several blocks isn't modeled yet.

#### Land-grab at launch — 🎲 *a bet* (R7)

The first 5–8 character names have no minimum price and rely on competition to set value.
If launch is quiet, an early mover can sweep up the good ones cheaply.

> **Example:** Before anyone's paying attention, one person registers `pizza`, `hotel`,
> `coffee` and hundreds more for ₿1,000 (~$1) each, then resells them.

**Where it stands:** mitigated by a loud, scheduled launch and the fact that the resale
market reprices names anyway — but it's a bet on attention at launch.

#### Slow hoarding over time — ✅ *largely handled* (R10)

Someone patiently buying up medium-value names at the floor price.

> **Example:** A squatter quietly registers a few hundred plausible names a month for
> ₿1,000 (~$1) each.

**Where it stands:** accepted as bounded — the cost adds up in a straight line and each
name is low-value, so there's no cheap corner to exploit.

#### The short-name price cliff — 🤔 *a decision* (R6)

Names of 4 characters or fewer cost dramatically more than 5-character names, and junk
short names get charged like valuable ones.

> **Example:** `x7q2` (gibberish) is priced the same as `bank` (premium), just because
> both are 4 characters.

**Where it stands:** accepted for now; revisit if people start gaming the boundary.

### 3. Will the system stay up and honest? (liveness)

#### Everyone seeing the same data — 🔴 *could kill it (but milder than it looks)* (R1)

To agree on who owns what, all participants need to be able to *see* every batch of
registrations. The scary version: someone hides data and breaks the system.

**The reframe (important):** in this design, hiding your own batch only loses *your own*
names — it can't freeze or corrupt anyone else's, because the combined result is just a
union of independent claims. So withholding is **self-harm**, not an attack on others.

> **Example:** A publisher commits a batch but never reveals it. Result: *their* names
> simply don't register. Everyone else is unaffected.

That leaves two narrower real risks:

- **Disagreement / splits.** If my copy saw a batch and yours didn't, we'd compute
  different answers. *(Example: my server saw your `coffee` claim, yours didn't — now we
  disagree on the owner.)*
- **Catching a bad summary.** Phones trust a short summary; the full data must exist
  *somewhere* so a lie can be caught.

**Where it stands:** archival is well covered — the creator plus aligned institutions
(e.g. Block, Coinbase) can each run a server. Crucially that's **"any one is enough, and
none can lie"** (every answer checks against Bitcoin). The **agreement rule** now has a
worked-through design (see
[`spec/ONT_DATA_AVAILABILITY_AGREEMENT.md`](./spec/ONT_DATA_AVAILABILITY_AGREEMENT.md)).
The key realization: the dangerous disagreement only matters for **contested** names. For
the long tail nobody else wants, a late batch just registers later — no harm. So the hard
part shrinks to a small corner (contested names), which can fall back to putting full data
directly on Bitcoin. **This is now tested in code** (`da-convergence-sim.ts`): with someone
deliberately hiding data, the naive "trust what I happened to receive" rule splits the
network, while the proposed rule keeps every honest node in agreement — and a
hide-then-reveal attempt to steal a name fails. Still to do: pin the exact timing windows
and spell out the on-chain "it's available" marker transaction.

#### Who publishes the running tally — and what if they quit — 🤔 *a decision* (R2 gap)

Someone has to compute and publish the combined result each block so lightweight users get
a quick answer.

> **Example:** Everyone's busy and nobody bothers publishing this week's tally. Full
> computers can still recompute it themselves, but phones are left waiting.

**Where it stands:** open — it works technically (anyone can do it, and a wrong tally is
rejected), but there's no *incentive* yet that guarantees someone actually does it.

#### Letting a phone catch a lie — 🔴 *could kill it / not built* (R2 gap)

A phone can't redo all the math, so it trusts a summary — but it must be able to detect
and reject a *false* summary.

> **Example:** A bad actor publishes a tally claiming they own `coffee` when they don't. A
> phone needs a cheap way to be handed proof of the lie and reject it.

**Where it stands:** not built yet — there's no "here's proof the summary is wrong"
challenge mechanism prototyped.

### 4. Will it stay neutral, or creep toward central control? (neutrality — the top priority)

#### The convenience server becoming *the* server — 🤔 *a watch item*

Running archival servers is fine. The danger is everyone quietly depending on the
*creator's* server because it's easiest — that's de facto centralization even though the
protocol doesn't require it.

> **Example:** Every wallet hard-codes "ask ont.org's server," and the day it goes down,
> the whole ecosystem stalls — even though anyone *could* have run their own.

**What keeps it safe:** design so any one server suffices, switching is trivial, and every
answer is verifiable against Bitcoin — so no single server is ever *trusted*, only
*convenient*.

#### Batchers consolidating — 🎲 *a bet* (R8)

The parties who bundle registrations might merge into a few big players due to economies
of scale, concentrating *who gets included* (not *who owns* — ownership stays yours).

> **Example:** One big batcher handles 90% of registrations and quietly deprioritizes a
> competitor's customers.

**Where it stands:** mitigated because anyone can always go straight to Bitcoin
themselves, which caps how much a big batcher can overcharge — but concentration is still
possible.

### 5. Will it really handle billions of names cheaply? (scale & cost)

#### The throughput trick works — but the numbers aren't measured — 📏 *unmeasured* (R2 → R11)

The mechanism that lets huge numbers of registrations process in parallel is proven
*logically* in code. Its real-world speed and the size of the proofs at billions of names
are not yet measured.

> **Example:** It works for 8 names in a test. Does it still work — fast, with small
> proofs — at 8 billion? We don't have the measurement.

**What would settle it:** a benchmark on a test network at realistic scale.

#### A new full computer has to download everything — 🤔 *uncertain* (R12)

Someone setting up a fresh full node must replay the whole history, which could be
hundreds of gigabytes at billions of names — nudging people toward trusting a shortcut
snapshot.

> **Example:** You want to run your own independent node, but first you have to download
> 400 GB. Most people won't, so they trust someone's snapshot instead.

**Where it stands:** mitigations exist (Bitcoin-anchored snapshots you can verify, plus
pruning old data), but it's not fully worked out.

#### The assumed sizes are estimates — 📏 *unmeasured* (R11)

Transaction sizes, batch sizes, and proof sizes are all educated guesses right now.

**What would settle it:** measure them on a test network.

#### How often people fight over a name — 🎲 *the big bet, but self-limiting* (R3)

If lots of registrations are contested, the system processes far fewer per block; if few
are contested, it flies. This one number swings total capacity by about 100× — and it's
unknowable until real users arrive.

> **Example:** If 1 in 10 claims is a fight, capacity collapses. If 1 in 1,000, it scales
> massively. Same system, wildly different outcome.

**Explicit assumption — the contest rate falls as the namespace grows.** Early on,
contests will be *frequent but few in number*: everyone piles onto the obvious prizes —
`bitcoin`, `ont`, `google`, dictionary words, brands. As adoption grows, the typical new
claim becomes a long-tail handle like `sallysmith2165` that nobody else wants, so the
*share* of contested claims drops.

> **Example:** In year one, maybe half of all claims are fights over a few hundred premium
> words. By the time the system is registering millions of personal handles a day, almost
> none are contested — there's only one person who wants `sallysmith2165`.

The reassuring consequence: **the high-contest period is also the low-volume period.**
Heavy contests throttle throughput exactly when total volume is tiny — small enough to
settle directly on Bitcoin without the scaling machinery. By the time you need big
throughput, the marginal claim is uncontested.

**Caveats (why it's still a bet):**

- The premium set is bounded and *depletes* — once `google` is claimed, it's gone — so the
  early contest pool shrinks on its own.
- It won't hit zero: speculators may keep racing for *predictably* valuable patterns
  (short names, trending words), so expect a low contested floor, not none.
- Still unverified until launch — the design must degrade *safely* (fall back to plain
  Bitcoin economics) whenever contests spike.

### 6. Knobs we haven't set yet (open decisions)

#### The anti-spam "gate": fee vs. proof-of-work — 🤔 *a decision* (R13)

*(Register note: decided 2026-05-24 — Bitcoin miner fee. Kept for the reasoning.)*

To stop someone registering a billion junk names, registration must cost something. Two
options:

- **Charge a Bitcoin fee** — simple, but ties the system's health to Bitcoin's fee market
  and leans on the batchers.
- **Require proof-of-work** — make registrants burn some computation instead, which avoids
  fees but brings its own centralization and verification headaches.

> **Example:** Either you pay a small bitcoin amount per name, or your computer grinds for
> a few seconds per name. Both stop spam; both have side effects.

#### The premium short-name auction — 🔴 *could kill it / leaning* (R4)

*(Register note: resolved by removal 2026-05-24 — no off-chain auction; contested names
escalate to the L1 bonded auction. Kept for the reasoning; the remaining L1 bid-mechanics
choice is [`OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md) §2.1.)*

For rare short names there'd be an auction. The honest finding: you **can't** have all
three of "everyone watches bids live" + "bids are binding" + "it's cheap" on Bitcoin as it
exists today.

> **Example:** You want a live, public bidding war for `app` where every bid is real and
> unbackoutable — but making bids both *public-as-they-happen* and *impossible to renege*
> without a costly on-chain transaction each isn't possible yet.

**Where it stands:** leaning toward a compromise — exciting *non-binding* open bidding to
build drama, then a single *binding* sealed round to settle — with truly marquee names
done fully on-chain.

#### Prices drifting with Bitcoin's price — 🎲 *a bet* (R5)

Fees and floors are fixed *amounts of bitcoin*. As Bitcoin's price moves, the real-world
cost — and therefore how well it deters spam and squatters — drifts.

> **Example:** A ₿1,000 floor that feels like ~$1 today could effectively become $4 if
> Bitcoin quadruples, or 25¢ if it crashes — changing how much friction it provides.

**Where it stands:** decide whether that drift is acceptable, or whether to add a neutral
way to re-peg — without introducing a price oracle (which would add trust).

#### Timing knobs not yet pinned — 🤔 *a decision* (R14)

Various settings — how many confirmations to wait, delays between steps, how long windows
stay open, how long bonds are held — aren't fixed yet.

**Where it stands:** pin these during prototyping, weighing speed against safety.

### How to use this list

- Where to spend worry: the 🔴 items plus the load-bearing 🎲 bets — agreement (R1, now
  prototyped), the not-yet-built phone-catches-a-lie path, and the contest rate (R3,
  though it's likely self-limiting). Ordering/MEV (R9) has been analyzed and is bounded.
- The 🤔 items are decisions you can make deliberately, not emergencies.
- The 📏 items just need a test network and measurement.
- Through all of it, **neutrality is the line that can't be crossed** — anything that
  quietly makes one party (including the creator) load-bearing is the thing to design out.

---

## MEV & ordering analysis (R9)

*Absorbed from `design/ONT_MEV_ORDERING_ANALYSIS.md`. Design analysis, 2026-05-24; revised
2026-06-04 (bond opens the auction).*

The last unanalyzed adversary in the register: parties who profit from *ordering* —
Bitcoin miners (who order txs in a block), publishers/batchers (who order claims in a
batch and see pending ones), and the worst case, miner+publisher collusion.

### Plain-language summary

- **The fear:** whoever controls ordering sees a valuable name coming and grabs it first,
  or reorders an auction to help a friend.
- **The headline result:** in this design **you cannot steal a name by controlling
  ordering.** Three structural features already prevent it — names are hidden until it's
  too late to copy them (commit-reveal), different names don't compete (so ordering only
  matters for the rare contested name), and contested names are won by **bidding the most,
  not by being first**.
- **What's left is bounded, not theft:** the residual is "someone forces a name you wanted
  into an auction" and "a relay mishandles bids in the open auction." Both are contained
  by the auction economics and the always-available direct-to-Bitcoin fallback.
- **A useful by-product:** MEV resistance is another argument for the **sealed
  second-price** auction (Option B), because its outcome doesn't depend on bid arrival
  order at all.

### 1. Where ordering power lives, and what's worth extracting

| Who | Power | Sees |
| --- | --- | --- |
| **Miner** | Orders txs within a block; chooses inclusion | The Bitcoin mempool |
| **Publisher / batcher** | Orders claims within its batch; chooses what to include | Claims submitted to it |
| **Miner + publisher (collusion)** | Both of the above | Mempool + submitted claims |

Worth extracting: (1) **front-running** a valuable name, (2) **manipulating an auction**,
(3) **censoring** a competitor's claim/bid to win or extort.

### 2. The structural defenses already in the design

**D1 — Front-running a cheap claim wins nothing; acquisition is bond-gated.** *(Revised
2026-06-04.)* the batched claim path's claims may be **public** (not commit-reveal-hidden),
so a watcher can see `coffee` being claimed. Front-running it grants no steal: an auction
is opened only by a **bond**, not a claim alone, so a second cheap claim doesn't take the
name — a no-bond collision **nullifies** it (it reopens for claiming), and to *acquire*
the name the front-runner must post a real returnable bond and win the auction (*outbid*,
not out-order). So name front-running is defused by bond-gated acquisition, not by hiding
names. (This supersedes the earlier reliance on commit-reveal name hiding; sealed-bid
commitments still apply within the L1 auction itself, but the path needs no name-hiding.)

**Why ordering can't substitute for a bond (R16).** A cheap collision with no bond doesn't
award the name to anyone — it **nullifies** it (reopens for claiming). There is no
ordering-based award path, so a block-winning miner ordering its own cheap claim first
gains *nothing* (worst case it denies the name — ₿1,000, no payoff). Acquiring a contested
name requires a qualifying bond — identical cost for a miner and for anyone — which is
what makes ordering worthless for acquisition. See
[`spec/ONT_ACQUISITION_STATE_MACHINE.md`](./spec/ONT_ACQUISITION_STATE_MACHINE.md) and
R16.

**D2 — Disjoint names commute, so ordering is irrelevant for the long tail.** A million
people claiming a million *different* names don't compete; their insertions merge
order-independently (proven in `delta-merge-sim.ts`). Ordering only has value when two
parties want the *same* name — so the entire MEV surface collapses onto **contested
names**, a small set (the R3 long-tail bet).

**D3 — Contested names are won by bidding, not by ordering.** A name goes to **auction**
when a **bond** is posted (notice window → auction at/above the reserve), and the winner
is the highest bidder, *not* the first committer. So a miner/publisher who can reorder or
insert-first gains **nothing** — they'd still have to outbid everyone, i.e. pay the most.
Ordering power doesn't convert to name acquisition, because the acquisition gate is a
bond, not ordering.

*(Revised 2026-06-04 — bond opens the auction.)* This now holds with no exception. A cheap
collision with no bond doesn't award the name by ordering — it **nullifies** it (reopens
for claiming); only a bond opens an auction. So a miner ordering its own cheap claim first
converts to *nothing*: at most denial (₿1,000, no payoff), never acquisition (former R16,
resolved). See [`spec/ONT_ACQUISITION_STATE_MACHINE.md`](./spec/ONT_ACQUISITION_STATE_MACHINE.md)
and R16 in the register above.

**D4 — Direct-L1 fallback bounds censorship.** Any user can bypass publishers and anchor a
claim (or settle a bid) directly on Bitcoin. A censoring publisher or miner can impose a
*cost/delay* (push you to L1), never a *denial*. Combined with competitive, permissionless
publishers, selective inclusion is an efficiency attack, not a sovereignty attack.

**Together, D1–D4 mean the thing that would be catastrophic — stealing a name via
ordering — is not possible.** A name is acquired only by an uncontested cheap claim that
finalizes or by the winning bond in an auction, and an auction is opened by a **bond**,
never by a claim alone. The (height, tx-index) commit-priority tie-break in the merge is
only a determinism floor for delta ordering — it never awards a contested name, so gaming
tx-index by fee buys no name. A cheap collision can at most **nullify** a name (deny, no
payoff), never take it (former R16, resolved by making the bond the escalation trigger).

### 3. Residual MEV — real, but bounded (none of it theft)

| Residual | What it is | Why it's bounded |
| --- | --- | --- |
| **Reveal-contestation** | Once a name is revealed, a watcher can contest it within the notice window, forcing an auction on a name someone hoped to get cheaply | Not theft — the contester must *bid and win*, paying real value. Forces fair price discovery, the design's intent. This is really **R7 (cold start)** wearing an MEV hat; same mitigations (generous window, loud launch, watchers). |
| **Relay bid manipulation** | In the *open* auction, a relay/publisher selectively delays or drops bids to help a colluding bidder | Bounded by **direct-L1 fallback** (a censored bidder settles on L1) and **anti-snipe** (activity-extended close). Removed entirely by sealed second-price (§4). |
| **Tie-break gaming** | Pay a higher fee to win a same-block (height, tx-index) tie | **Low value.** A name is acquired only by an uncontested cheap claim or a winning bond; an auction is opened by a bond, never by a claim alone. So winning a same-block tie never wins a contested name — a cheap collision can at most *nullify* it (R16 resolved). The tie-break is only a delta-determinism floor for merge ordering. |
| **Selective inclusion** | Publisher refuses to batch your claim | Bounded by L1 fallback + competitive publishers; costs you latency, not the name. Overlaps R8. |

### 4. By-product: MEV resistance argues for sealed second-price (Option B)

The open ascending auction has *some* ordering-sensitivity near the close (last-look,
relay bid timing), mitigated but not eliminated by anti-snipe + L1 fallback. A **sealed
second-price** settlement is **ordering-insensitive by construction**: the outcome is a
pure function of the *set* of sealed bids, independent of their arrival order or the
settlement tx's position in a block. So the MEV analysis adds a vote to the R4 decision:
if ordering-resistance is weighted heavily, Option B (open non-binding signaling → sealed
second-price settlement) is the stronger choice; the fully open on-chain ascending auction
(Option C) is best reserved for rare marquee names where the visible drama is the product.

### 5. Verdict & what's open

**Verdict:** R9 moves from "analysis owed" to **"analyzed — structurally MEV-resistant for
what matters."** No ordering actor (including miner+publisher collusion) can *steal* a
name; residual MEV is bounded extraction/griefing that the auction economics and the L1
fallback contain. R9 is **not a dealbreaker.**

**Still open:**

1. **Open-auction relay-bid handling** — if the open ascending auction is kept, specify
   how relays gossip bids and how a censored bidder escalates to L1 within the anti-snipe
   window. (Sealed second-price sidesteps this — see §4 and the R4 decision.)
2. **Pin commit-reveal parameters** — the commit→reveal delay and notice window (R14),
   since D1's strength depends on the reveal not being forced early.
3. The reveal-contestation residual is tracked under **R7**, not separately.

See also: [`OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md) (auction options),
`delta-merge-sim.ts` (the commutativity that gives D2).

---

## Whole-system threat model

*Absorbed from `research/ONT_ADVERSARIAL_ANALYSIS.md`. Design note, not frozen. Parts of
this layer predate Decision #37 (bond opens the auction; bare collisions nullify) —
bracketed update notes mark where the contest rule changed.*

A working inventory of how ONT can be attacked, griefed, or degraded across all four
surfaces — the batched claim path, the publisher, the resolver, and the auction — plus a prominent
section on launch-fairness, which is the threat with the shortest fuse. Each entry names
the attack, what it costs the attacker, what defends against it today (with a code or doc
reference), and where the residual gap is. Items marked **GAP** have no current defense in
the code.

Companions:

- [`research/archive/ONT_CONTEST_WINDOW_PHILOSOPHY.md`](./research/archive/ONT_CONTEST_WINDOW_PHILOSOPHY.md)
  — the contest/notice window and bond forfeiture, in depth (archived). This note
  references it rather than repeating it.
- [`research/ONT_MULTI_PUBLISHER_CONVERGENCE.md`](./research/ONT_MULTI_PUBLISHER_CONVERGENCE.md)
  — convergence under more than one publisher; the source of several defenses cited below.
- [`research/ONT_DECENTRALIZATION_AND_DISCOVERY.md`](./research/ONT_DECENTRALIZATION_AND_DISCOVERY.md)
  — how publishers/resolvers decentralize and how clients find them; the home of the
  discovery and light-client gaps named here.

### What we trust, and what we do not

The point of writing this down is to keep the trust boundary honest. ONT inherits
Bitcoin's security for *ordering and timestamping* and nothing more.

Trusted:

- **Bitcoin consensus.** Block ordering, proof-of-work, the UTXO set, and the OP_RETURN
  bytes in confirmed transactions. If an attacker can reorg Bitcoin at will, ONT is the
  least of anyone's problems.
- **The hash functions and signature scheme** ONT commits to (sha256 leaves, the owner-key
  signatures verified in `@ont/protocol`).
- **The frozen consensus rules** in `@ont/consensus` — the same bytes produce the same
  name state for everyone who runs them.

NOT trusted:

- **Any publisher.** A publisher batches claims and anchors them; it is a convenience, not
  an authority. It can withhold, censor, equivocate, or vanish. The client re-verifies
  everything (see below).
- **Any resolver.** A resolver mirrors Bitcoin-derived state over HTTP; it can lag, lie,
  or be eclipsed. Nothing it says is authoritative on its own.
- **Network reachability.** DNS, the open ports a publisher/resolver listens on, and the
  path to them are all attacker-influenceable.
- **The set of eyes watching at launch.** This is the one trust assumption ONT *wants* to
  hold (an honest claimant will notice and contest a theft) but cannot enforce, and it is
  weakest exactly when capture is most valuable — the opening days. That is why
  launch-fairness gets its own section.

The recurring theme: **ONT name state is a deterministic function of Bitcoin.** Every
defense that works, works because a client can recompute the answer from Bitcoin itself
and refuse to trust an intermediary's claim. Every gap that remains is a place where a
client currently trusts an intermediary instead of recomputing.

### Surface 1 — the batched claim path (claiming)

#### 1.1 Launch capture — a whale claims the top N names before anyone is watching

The flagship threat. One actor with ₿-denominated patience pays the flat ₿1,000 gate on
the top 100,000 brands/handles in the opening days, betting that the real owners are not
watching and do not have coin out of cold storage to contest in time.

- **Cost to attacker:** ₿1,000 per name (to miners) × N. Cheap by design — the gate is
  anti-spam, not a price signal.
- **Defense today:** the notice/contest window. A cheap claim is *provisional*, not owned
  (`feb653a` made the wallet honest about this; `batch-rail.ts` classifies `provisional`
  vs `final`). A real owner who notices inside the window contests, which escalates the
  name to a bonded L1 auction — the whale does not get a free steal, they have to *win an
  auction* against the legitimate owner.
- **Residual gap:** the defense is only as good as the window length and the odds the real
  owner is watching. At launch both are adversarial — see
  [`research/archive/ONT_CONTEST_WINDOW_PHILOSOPHY.md`](./research/archive/ONT_CONTEST_WINDOW_PHILOSOPHY.md),
  which argues for a long launch window decaying to a steady-state floor, and the
  launch-fairness section below.
- **The trap to avoid:** keying "is the market ready" off any market-derived signal (total
  value bonded, distinct bidders), because at launch the whale *is* the market and
  controls that signal. The window schedule must be frozen, monotonic, and height-keyed.

#### 1.2 Sybil-contest griefing — force a victim's claim to auction with a throwaway claim

*(Update note, 2026-06-11: Decision #37 — bond opens the auction, 2026-06-04 — supersedes
the escalation rule this section describes. A second claim with no qualifying bond now
**nullifies** the name (no owner; it reopens for claiming) and can never force an auction;
only a bond escalates. The attack reshapes from forced escalation to denial — the current
treatment is the ranked assessment §2 below and
[`spec/ONT_ACQUISITION_STATE_MACHINE.md`](./spec/ONT_ACQUISITION_STATE_MACHINE.md). The
research sim cited below (`batch-rail.ts` and its documenting test) still implements the
pre-#37 escalate-on-collision rule. The original text follows unchanged.)*

Contesting is permissionless, and the "is this contested" check keys on *distinct delta
id*, not real-world identity (`batch-rail.ts`: a name with ≥2 distinct in-window claimants
escalates). So one actor can anchor a second claim for a victim's name under a throwaway
id and force the name out of the cheap path into the bonded auction.

- **Cost to attacker:** one extra ₿1,000 gate per griefed name, *plus* — and this is the
  saving grace — they then have to actually post a bond and win the auction to take the
  name. Forcing the auction is not a steal; it converts a ₿1,000 grief into "now we both
  bid." This is encoded as a documenting test in `batch-rail.test.ts` ("escalation keys on
  distinct delta ids, so a Sybil claimant can force a provisional name to L1").
- **Defense today:** the cost asymmetry (the griefer pays the gate and gains nothing
  unless they outbid) plus the bonded auction's own economics.
- **Residual gap:** the *harm* is not a lost name — it is friction. A sufficiently funded
  griefer can force every claim into an auction, taxing honest claimants' time and forcing
  them to keep bidding capital warm. At launch this compounds the capture problem: an
  attacker who cannot quietly capture names can at least make claiming them expensive and
  slow for everyone. Worth naming as a known cost, per
  [`research/ONT_MULTI_PUBLISHER_CONVERGENCE.md`](./research/ONT_MULTI_PUBLISHER_CONVERGENCE.md)'s
  "griefing bound" section.

#### 1.3 Claim front-running — see a pending claim and beat it

A publisher (or a miner, or anyone watching the mempool/quote traffic) sees a claim for a
desirable name and races their own in first.

- **Defense today:** under the one-path model this does not hand the front-runner the
  name. Two claims for the same name inside the window = contested = auction. *(Update
  note, 2026-06-11: per Decision #37 this now reads — two claims with no bond
  **nullify** the name (deny, reopen); only a qualifying bond opens the auction. Either
  way the front-runner gains nothing, which is this section's point; see the MEV &
  ordering analysis above, D1/D3.)* Front-running a cheap claim only *triggers the
  auction*, it does not win it.
  Commit-priority ordering (`(height, txIndex, txid)`) decides who is "first" only among
  uncontested claims, where it does not matter because there is no competition.
- **Residual gap:** a publisher uniquely positioned to see quote traffic before it is
  anchored has an information advantage for *deciding what to contest*. This is a
  publisher-trust issue, handled in surface 2. The MEV/ordering half lives in the MEV &
  ordering analysis above.

### Surface 2 — the publisher

The publisher is a thin batching service (`apps/publisher`). It quotes a price, takes a
Lightning payment for the gate, batches claims, anchors an OP_RETURN committing
`prevRoot -> newRoot`, and serves inclusion proofs. The client
(`apps/wallet/src/publisher-client.ts`) independently re-derives the leaf
(`sha256(name)`), checks `ownerCommitment === owner key`, and verifies the inclusion proof
against the accumulator. So the publisher cannot forge ownership. What it *can* do:

#### 2.1 Withholding / withhold-then-reveal name theft

Anchor a claim on-chain but withhold the batch bytes, then reveal them later to
retroactively "win" a name against a competitor who could not see the claim in time.

- **Defense today:** the data-availability filter, fail-closed. `da-convergence-sim.ts` requires the
  batch to be attested available by `anchorHeight + W` and the bytes surfacing by `+ W + C` (the
  sim's separate marker event plays the role the anchor itself plays under marker-fold (#47)); a
  delta that was not actually available is *excluded*, not treated as canonical.
  `runBatchRail` only counts data-availability-valid deltas. A documenting test ("a withheld competing
  claim cannot force a contest") confirms a withheld claim cannot even trigger an
  escalation. This is the defense the convergence note calls out as "what defeats
  withhold-then-reveal name theft."
- **Residual gap:** the data-availability windows (defined in the spec) are parameters; if set too short an
  attacker with marginal network control could still race the availability deadline. They
  must be chosen conservatively and decoupled from the notice window (see the philosophy
  note, "do not couple the contest window to the data-availability confirm-depth").

#### 2.2 Equivocation — anchor one thing, serve another

Commit `newRoot` on-chain but serve different batch bytes off-chain to different clients.

- **Defense today:** `newRoot = root(prevRoot ⊕ delta)` is a *data-availability binding*. An indexer that
  fetches the published batch leaves and recomputes `newRoot` rejects the anchor if it
  does not match
  ([`research/ONT_MULTI_PUBLISHER_CONVERGENCE.md`](./research/ONT_MULTI_PUBLISHER_CONVERGENCE.md),
  "what are prevRoot/newRoot for"). So a publisher cannot serve bytes that disagree with
  what it anchored without detection by anyone who checks.
- **Residual gap:** detection requires *someone* to fetch the bytes and recompute. A
  wallet that trusts a single publisher's inclusion proof without cross-checking against
  the canonical root (the honest correctness gap the convergence note flags) would not
  notice. The fix is the canonical-root re-check before recording a name as owned — built
  in the classifier, not yet wired end-to-end in the wallet.

#### 2.3 Censorship — refuse to batch a name

A publisher simply declines to quote or anchor a particular name (political target, a name
it wants for itself, a competitor's brand).

- **Defense today:** discovery is config-only (`ONT_PUBLISHER_URL`), so the intended
  answer is "use another publisher." Anyone can run one; the protocol privileges none.
- **Residual gap (GAP):** there is no second publisher to fall back to in practice yet,
  and **no discovery mechanism to find one** — see
  [`research/ONT_DECENTRALIZATION_AND_DISCOVERY.md`](./research/ONT_DECENTRALIZATION_AND_DISCOVERY.md).
  Censorship-resistance is a *claim* the architecture supports but the deployment does not
  yet deliver, because every test and smoke runs a single publisher
  ([`research/ONT_MULTI_PUBLISHER_CONVERGENCE.md`](./research/ONT_MULTI_PUBLISHER_CONVERGENCE.md),
  "why this is worth doing now"). Until multi-publisher coexistence is real, a censoring
  publisher is a single point of failure for the batched claim path.

#### 2.4 Denial of service — no rate-limiting

`apps/publisher` has no rate-limiting or anti-DoS. An attacker floods quote/submit
endpoints and takes the publisher offline.

- **Defense today:** none in code. The gate is paid in Lightning *before* a claim is
  anchored, which bounds the cost of actually *filling batches* with spam, but the quote
  and read endpoints are unmetered.
- **Residual gap (GAP):** standard service-hardening (rate limits, proof-of-work or paid
  quotes, connection limits) is unbuilt. This is operational, not protocol — but it
  interacts with censorship: knocking out the one reachable publisher *is* censorship of
  the whole batched claim path until discovery + multiple publishers exist.

#### 2.5 Quote/anchor race — name taken between quote and payment

A client pays the gate for a name that becomes final on a competing anchor before its own
claim lands.

- **Defense today:** the convergence note's per-leaf loss detection — `dropped_existing` →
  refund. The publisher is supposed to detect this at finalization and refund the gate.
- **Residual gap:** per-leaf loss detection + refund is *specified* in
  [`research/ONT_MULTI_PUBLISHER_CONVERGENCE.md`](./research/ONT_MULTI_PUBLISHER_CONVERGENCE.md)
  (publisher behavior item 3) but is part of the not-yet-wired Model-B consumption. Today
  a single publisher building on its own accumulator mostly avoids the race by
  construction, but that is an artifact of single-writer deployment, not a guarantee.

#### 2.6 Fee theft / non-delivery

Take the Lightning payment and never anchor, or anchor and never serve the proof.

- **Defense today:** the payment is for a *gate*, and the client verifies inclusion
  against Bitcoin. A publisher that takes payment and does not anchor produces no
  inclusion proof, so the client knows it did not get what it paid for and does not record
  ownership. The harm is a lost ₿1,000 gate, not a lost name.
- **Residual gap:** no automatic refund path for "paid but never anchored" beyond the
  per-leaf detection above; recourse is "stop using that publisher." Bounded-loss (the
  gate) by design, but a reputation/accountability layer is absent.

### Surface 3 — the resolver

A resolver (`apps/resolver`) is an independent `@ont/consensus` mirror over Bitcoin (RPC /
Esplora / fixture) that answers lookups over HTTP. It holds no authority — ownership is
verified against Bitcoin, not against it (`apps/wallet/src/resolver.ts` header). Discovery
is config-only (`ONT_RESOLVER_URL` / `ONT_RESOLVER_URLS`).

#### 3.1 Lag — a resolver serves a stale view

A resolver behind on blocks reports an old owner or misses a recent claim.

- **Defense today:** multi-resolver fanout. `apps/web/src/resolver-fanout.ts`
  (`fetchNameValueHistoryFromResolvers`) queries every configured resolver and classifies
  the set as `consistent | lagging | conflict | all_missing`, picking the longest history
  as canonical and flagging the rest as lagging. A lagging resolver is detected and
  down-ranked.
- **Residual gap:** "longest history wins" is a *liveness* heuristic, not a *correctness*
  proof — it assumes the most-advanced resolver is honest. A resolver that fabricates a
  longer history is treated as canonical until it contradicts another (see 3.2).

#### 3.2 Equivocation / conflict — resolvers disagree

Two resolvers return different owners, different value-record histories, or forked chains
for the same name.

- **Defense today:** the fanout *detects* this — `classifyValueHistoryCompatibility`
  returns `conflict` on mismatched `ownershipRef`, mismatched record hashes at the same
  sequence, or any history with gaps/forks, and the summary status becomes `conflict`. So
  a client is *warned*.
- **Residual gap (GAP — the big one):** detection is not adjudication. The fanout can tell
  you the resolvers disagree but **cannot tell you which one is right**, because it does
  no cryptographic light-client verification against Bitcoin. It picks canonical by
  history *length*, not by checking the OP_RETURN anchors and inclusion proofs against
  Bitcoin headers. A client facing a `conflict` has no trustless way to resolve it from
  resolver data alone — it must go to Bitcoin itself. This is the single most important
  gap in the system and the core of
  [`research/ONT_DECENTRALIZATION_AND_DISCOVERY.md`](./research/ONT_DECENTRALIZATION_AND_DISCOVERY.md):
  ONT state is a deterministic function of Bitcoin, so the *right* design is a
  light-client proof bundle a wallet can verify against block headers, reducing resolver
  choice to a liveness problem. That verification path is not built.

#### 3.3 Eclipse — feed a client only attacker-controlled resolvers

If an attacker controls a victim's configured resolver list (compromised config, malicious
default, DNS/network control), every "independent" resolver is the same adversary and the
fanout's disagreement detection sees false unanimity.

- **Defense today:** none specific. Fanout assumes the configured set is genuinely
  independent.
- **Residual gap (GAP):** without (a) a trustless discovery mechanism that is not itself
  attacker-controlled and (b) light-client verification against Bitcoin, an eclipsed
  client is fully deceived. The eclipse is defeated the moment the client verifies against
  Bitcoin headers it obtained independently — which loops back to 3.2's gap. Discovery and
  verification are the same problem wearing two hats.

### Surface 4 — the auction (escalation)

The auction is reached *only* by escalation from a contested cheap claim
([`ONT.md`](./ONT.md) one-path model). It is a bonded second-price L1 auction. Bonds are
an ONT-level designation over a plain `payment` output — **not** a Bitcoin script
construct (no HTLC/CLTV/CSV/covenant); enforced by `@ont/consensus`
(`invalidateBrokenBondContinuity`), not by Bitcoin script. See the philosophy note's "the
bond is ONT-enforced, not Bitcoin-script-enforced" subsection.

#### 4.1 The winner walks — pull the bond after winning

A contest winner takes the name, then spends the bond UTXO without creating a valid
successor bond.

- **Defense today:** documented fully in
  [`research/archive/ONT_CONTEST_WINDOW_PHILOSOPHY.md`](./research/archive/ONT_CONTEST_WINDOW_PHILOSOPHY.md)
  ("what happens when a contest winner walks"). Spending an immature/pre-release bond
  without a valid successor makes the name `status: "invalid"`
  (`collectSpentImmatureBonds` + `invalidateBrokenBondContinuity` in `engine.ts`). The
  name returns to *unclaimed* via the same one-path — no auto-contest, no runner-up
  preference. After maturity/release the bond is returnable (matches ONT.md's
  "returnable… not destroyed money").
- **Residual gap (open tension):** because the bond is ONT-enforced rather than
  script-enforced, ONT can *invalidate the name* on a broken bond but cannot *slash the
  coin* — there is no on-chain penalty output. True economic slashing would require a
  script-level construction (covenant or pre-signed penalty tx), which is a design change,
  not an ONT rule. So the deterrent against walking-after-winning is "you lose the name
  and the name reopens," not "you lose money." For a griefer who wins to deny rather than
  to own, the name reopening is exactly what they did *not* want, so the deterrent mostly
  holds — but it is worth stating that the bond is not a financial penalty bond.

#### 4.2 Shill / self-bidding to inflate the second price

The winner bids against themselves (via Sybils) to set the second price near their max and
extract more from a legitimate competitor, or to make a name look contested-and-expensive
to scare off honest bidders.

- **Defense today:** second-price mechanics limit *overpayment* (you pay the
  second-highest, so over-bidding against yourself risks paying your own shill's price).
  Bonds cost real capital to post.
- **Residual gap:** classic auction-theory shill risk is not specifically mitigated; with
  anonymous bidders a determined actor can manipulate the *appearance* of competition.
  This interacts with launch-fairness (below): early auctions with few real eyes are the
  easiest to shill.

#### 4.3 Bond griefing — lock up a competitor's capital

Force auctions (1.2 Sybil-contest) repeatedly so honest participants must keep bonded
capital warm and locked.

- **Defense today:** bonds are returnable after release; the griefer also bonds, so they
  tie up their own capital symmetrically.
- **Residual gap:** the *time-value* and opportunity cost of locked capital is a real tax
  even when the principal is returned. Settlement-lock parameters (`auction-policy.ts`:
  `defaultSettlementLockBlocks` 52,560 ≈ 1 year) are long; a griefer can impose a long
  capital lock on a victim who chooses to bid. The parameters trade off grief-resistance
  against capital efficiency and deserve modeling.

### The launch-fairness problem (the one with the shortest fuse)

This is the threat the user is most concerned about and the one least amenable to a purely
technical fix: **in the opening days, with few eyes watching, the early allocations must
end up looking fair in hindsight — not "it all went to the one billionaire who moved
first."** Six months out, a skeptic should be able to look at how the first names were
allocated and conclude the process was reasonable.

Why it is hard:

- Capture is most valuable and least observed at launch (1.1).
- Every market-derived "readiness" signal is adversary-controlled when the adversary is
  the only one with capital deployed (philosophy note, Principle 2).
- The cheap gate (₿1,000) is deliberately not a price signal, so it does not ration scarce
  premium names — it is anti-spam, not an allocator.

Levers that exist or are proposed (none individually sufficient):

1. **Long launch contest window, decaying to a floor.** The primary lever.
   [`research/archive/ONT_CONTEST_WINDOW_PHILOSOPHY.md`](./research/archive/ONT_CONTEST_WINDOW_PHILOSOPHY.md)
   argues a launch window on the order of a month, height-keyed and monotonically decaying
   over roughly a halving to a ~1–2 week steady-state floor. This buys real owners time to
   notice and contest. The schedule must be frozen and manipulation-proof (the adaptive
   part may only *extend*, never shrink).

2. **Provisional-not-owned semantics.** Already built (`feb653a`): a cheap claim shows as
   provisional until its window closes. A capture is visibly provisional and contestable,
   not a fait accompli — which matters for the *perception* of fairness as much as the
   mechanics.

3. **Escalation-to-auction on contest.** Already built (`runBatchRail`). A whale who
   claims a brand does not own it if the brand-holder shows up; they have to win a bonded
   auction. This is the structural reason early capture is not a free land-grab.

4. **One contested-auction policy.** `auction-policy.ts` now encodes one contested-auction
   path: opening floor, settlement lock, minimum increment, and soft-close settings. If
   premium handling is needed, it should be added deliberately rather than inherited from
   the retired launch-class model.

**Open fairness levers worth a human decision (NOT yet designed):**

- **Should the top-N premium names start in auction rather than cheap-claim?** If the most
  valuable, most-capturable names *always* allocate by open auction (no quiet cheap
  claim), then "it went to whoever paid the most in an open, observable process" is a
  defensible fairness story, and the whale cannot capture quietly — they must win
  publicly. The cost is that auction is less egalitarian than first-come cheap claim. This
  is the central launch-fairness trade.
- **A launch-period rate limit per payer / per key on cheap claims.** Caps how many names
  one identity can quietly claim before windows close. Hard to enforce against Sybils
  without an identity primitive ONT deliberately lacks — likely weak, but worth stating as
  considered-and-rejected if so.
- **Transparency as a fairness mechanism.** A public, append-only, queryable feed of
  "names claimed in the last window, and their contest status" makes capture *visible* in
  real time, which is itself a deterrent and a hindsight-fairness artifact. This is a
  resolver/indexer feature, cheap to build, and probably the highest-leverage *perception*
  lever. Cross-references the discovery note (a resolver could expose a "recent claims /
  open contests" endpoint).
- **A documented, frozen launch schedule published before launch.** If the window-decay
  schedule, class rules, and any premium-name policy are committed to *before* anyone can
  claim — height-keyed, no governance — then the fairness of the process does not depend
  on trusting the operators' later discretion. "The rules were fixed in advance and
  applied to everyone" is the strongest hindsight-fairness claim available.

The honest summary: the *mechanics* (provisional claims, contest→auction, class policy)
make capture contestable rather than final, which is necessary but not sufficient. The
*perception* of fairness additionally requires (a) a long, frozen, pre-announced launch
window, (b) seriously considering open auction for the top-N names, and (c) real-time
transparency of claims and contests. (a) is argued in the philosophy note; (b) and (c) are
open decisions flagged here.

### Cross-cutting gap summary

The gaps that are unbuilt today, ranked by how load-bearing they are for the core
"trustless, decentralized" claim:

1. **No light-client verification against Bitcoin (3.2).** The deepest gap. Resolver
   disagreement is detected but not adjudicable without trusting a resolver. Everything
   downstream (eclipse-resistance, multi-resolver correctness, "ONT state is a function of
   Bitcoin") depends on closing it.
2. **No discovery mechanism for publishers/resolvers (2.3, 3.3).** Config-only discovery
   means censorship/eclipse resistance is architecturally claimed but not deployed. The
   home of the "Bitcoin seed-IP analog?" question — see
   [`research/ONT_DECENTRALIZATION_AND_DISCOVERY.md`](./research/ONT_DECENTRALIZATION_AND_DISCOVERY.md).
3. **Multi-publisher coexistence not wired (2.1, 2.2, 2.5).** The convergence logic
   (`runBatchRail`, data-availability filter, merge) exists and is tested, but no live resolver consumes
   it and the publisher anchors off its own accumulator. One publisher = one point of
   failure for the batched claim path today.
4. **No publisher DoS hardening (2.4).** Operational, but interacts with censorship.
5. **Launch-fairness levers beyond the contest window (launch section).** Open auction for
   top-N, transparency feed, pre-announced frozen schedule — design decisions, not yet
   made.
6. **Bonds are not financial-penalty bonds (4.1).** ONT can invalidate a name on a broken
   bond but cannot slash coin without a script-level change.

### Open questions for a human decision

1. Do the top-N premium/launch names allocate by open auction from the start, or by cheap
   claim with a long window like everything else? (The central launch-fairness trade.)
2. Is a light-client proof-bundle verification path in scope before launch, or do we ship
   with "trust your resolver set, fan out to detect disagreement" and close the gap after?
   (Determines whether 3.2 is a launch blocker.)
3. What are the data-availability window parameters (defined in the spec) and the launch contest window, as
   concrete heights — and are they published before launch?
4. Should the protocol ever express slashing (a financial penalty for walking after
   winning), which requires a script-level bond construction, or is "lose the name, name
   reopens" a sufficient deterrent? (See 4.1.)
5. Is a public real-time claims/contests transparency feed a launch requirement for
   fairness perception?
6. What rate-limiting / anti-DoS posture do reference publishers ship with, and is any of
   it protocol-visible (e.g. paid quotes) versus purely operational?

---

## Ranked adversarial assessment

*Absorbed from `research/ONT_ADVERSARIAL_RISK_RANKING.md`. Context: a whole-system
adversarial assessment — wealthy-actor capture, griefing of small users, the simple name
path, auction dynamics and closure gaming, and the extra problems of a system with only
dozens-to-hundreds of early users. Overlaps the threat model above; this is the ranked
synthesis.*

### 1. Launch capture / legitimacy failure

The biggest risk is not a cryptographic break. It is a legitimacy break: one
well-capitalized actor claims a large share of the valuable namespace while the real
market is not yet watching.

Attack shape:

- Claim tens or hundreds of thousands of attractive names during the first days.
- Pay only the per-name gate for names that nobody contests.
- Rely on brands, public figures, and ordinary users not knowing ONT exists or not being
  ready to contest with self-custodied bitcoin.

Why it matters:

- The protocol may say "they had notice," but if broad consensus arrives later and sees
  early capture as unfair, ONT can lose legitimacy.
- This is amplified because ONT deliberately avoids trusted reserved lists, identity-based
  caps, and subjective premium classifications.

Mitigations:

- Long, frozen, pre-announced launch contest window.
- Height-keyed decay only; no market-derived readiness signal that a whale can spoof.
- Real-time public feed of recent claims, provisional status, and open contests.
- Watcher/alert tools before mainnet.
- Consider a high launch gate or decaying launch gate for all names, or at least objective
  scarce classes.
- Consider whether the most scarce objective class should start in auction rather than
  cheap claim. This is a neutrality tradeoff if the class is human-curated.

Two or more independent excited whales materially reduce quiet capture of the obvious
head, because a first whale's cheap claim on `bitcoin`, `satoshi`, short names, brands,
and celebrity handles is likely to be contested by the second whale and forced into
auction. That converts cheap capture into public price discovery.

This is a strong social mitigation but a weak protocol assumption. It only works if the
whales are independent, capital-ready, watching the same claim stream, willing to contest
rather than split the namespace, and not colluding. It protects high-salience names much
more than obscure owner-specific names that neither whale notices or cares about. It can
also worsen auction load and make launch look like a plutocratic duel if ordinary users
cannot participate.

Best use: recruit whales as public watchtowers / contest backstops / infrastructure
funders, not privileged allocators. Their existence should justify confidence in launch
monitoring, not shorter protocol windows.

### 2. Cheap collision griefing against small users (reshaped by Decision #37)

> Updated 2026-06-09. The primary mitigation listed in the original version of this
> section — "require a contest to become an auction-opening bonded bid, not merely a
> second cheap claim" — was **adopted as Decision #37** (2026-06-04). A bare collision can
> no longer force a user into an auction; with no qualifying bond the name **nullifies**
> and reopens. The attack reshapes from forced escalation to denial.

Attack shape:

- Monitor claims.
- Collide many names at the gate cost (`₿1,000` each) and never bond.
- The honest claim cannot finalize; at window close the name nullifies and reopens.
  Re-claiming restarts the clock, and the attacker can collide again.

Why it matters:

- The harm is not theft and no longer forced auctions; it is **denial**: a targeted user
  can be kept from cheap finalization indefinitely at `₿1,000`/round (money-symmetric per
  round, but only the victim needs a full uncollided window).
- The victim's escape is posting a `₿50,000` returnable bond the attacker won't outbid —
  which makes *defense affordability*, not name loss, the real exposure for small users.
- At scale this is an adoption/UX attack on the batched claim path; Bitcoin blockspace is
  untouched.

Mitigations:

- Adopted: bond opens the auction (Decision #37) — closes forced escalation and the old
  dust-cost blockspace grief.
- Open: model the nullification-attrition game; consider an objective escalating
  second-claim gate under high collision load, and/or a re-claim cooldown to slow the
  loop.
- Decided (Decision #43): sponsorship/proxy-bonding tooling is rejected outright — no
  protocol incentive, no escalation promise, and a winning sponsor bond is a loan in
  protocol clothes. The asymmetry is accepted and documented honestly; defense capital is
  arranged outside the protocol if at all. Third-party bonding stays permissionless; the
  bond floor remains a re-pickable placeholder (parameters are the one remaining lever).
- Make collision UX calm and informative: "your claim was collided; nobody can take the
  name without bonding; here are your options and their costs."
- Provide alternate-name suggestions and cheap re-claim flow so griefing one name does not
  end the user's session.

See
[`research/archive/ONT_CONTEST_GRIEF_COST_MODEL.md`](./research/archive/ONT_CONTEST_GRIEF_COST_MODEL.md)
(rewritten post-#37) for the cost model.

### 3. Auction closure gaming

Open ascending L1 auctions with soft close are useful but full of edge cases.

Attack shapes:

- Late-bid grief: keep extending a soft close with minimum increments to waste attention
  and lock capital.
- Mempool/relay censorship: near close, delay or censor a competing bid.
- Miner games: include own or allied bid at a favorable close edge.
- Shill/self-bidding: create apparent competition or force a higher second price / higher
  visible price.
- Reorg edge: a bid or close appears final, then disappears.

Current posture:

- The default policy uses about a 7-day base window and 24-hour soft close.
- Late increments are stronger than normal increments.
- No hard extension cap is currently favored because a hard cap creates a known final
  sniping edge.

Mitigations:

- Define close purely by confirmed block facts, not mempool events.
- Require enough confirmations before UI treats an auction as settled.
- Keep soft-close increments meaningfully expensive.
- Consider sealed second-price / commit-reveal settlement for normal contested names;
  reserve open ascending auctions for rare marquee names where visibility is worth the
  risk.
- If keeping open ascending, model "extension grief cost" under worst-case fee and
  bid-increment assumptions.
- Specify bidder fallback when a relay/publisher censors the bid path.

### 4. Bond deterrence is weaker than it sounds

ONT can invalidate a name if the designated bond UTXO is spent before maturity, but the
bond is not script-locked or slashable by Bitcoin.

Attack shape:

- Win a name to deny it.
- Hold it through the commitment window.
- Walk or re-open cycles if the economics favor denial over ownership.

Why it matters:

- The attacker does not lose principal unless the protocol uses a script-level penalty
  construction.
- The deterrent is fees, opportunity cost, and losing the name, not slashing.

Mitigations:

- Be explicit in docs and UI: current bonds are ONT-enforced, not Bitcoin-script-locked.
- Model denial loops under a one-year lock and shorter/longer locks.
- Decide whether "lose the name" is sufficient or whether true slashing is worth the
  custody/script complexity.

### 5. Data availability / multi-publisher integration gap

The data-availability and merge design is strong in notes/prototypes, but the live resolver/publisher
path is not fully wired.

Attack shapes:

- Withhold batch bytes.
- Serve different data to different users.
- Anchor from a private publisher accumulator rather than the canonical root.
- Exploit one-publisher deployment as a censorship bottleneck.

Current posture:

- Fail-closed, anchor-keyed data-availability design (marker-fold (#47)) is documented and prototyped.
- Multi-publisher convergence logic exists in research/prototype code.
- The live resolver still does not consume the full batched-path derivation end to end.

Mitigations:

- Treat live multi-publisher canonical derivation as a launch gate for the cheap path.
- Pin data-availability windows and marker transaction format.
- Require wallets to distinguish provisional / contested / final.
- Never let a wallet record ownership from a publisher receipt alone.

### 6. Resolver / light-client trust gap

Resolver fanout can detect disagreement but cannot yet adjudicate it trustlessly.

Attack shape:

- Eclipse a client into attacker-controlled resolvers.
- Serve a false but internally consistent history.
- Exploit "longest history wins" heuristics.

Why it matters:

- ONT's claim is "ownership is derived from Bitcoin," but current light clients still need
  a path to verify Bitcoin inclusion and headers.

Mitigations:

- Light-client proof bundles that verify OP_RETURN anchors against Bitcoin headers.
- Multiple independent resolver defaults.
- Discovery that does not create a single project-controlled trust root.
- UI should label resolver-verified versus Bitcoin-header-verified answers.

### 7. Early-user confidence asymmetry

When only dozens or hundreds of people use ONT, the adversary may be more confident than
honest users.

Attack shape:

- A sophisticated whale is comfortable locking and moving self-custodied BTC.
- Ordinary users, brands, and agents are not yet comfortable signing project-built
  transactions or locking bonds.
- The adversary wins not because the protocol is wrong, but because participation friction
  is asymmetric.

Why it matters:

- Auction price discovery is poor in an empty room.
- "Open auction" does not mean fair if the people who care are not present yet.

Mitigations:

- Long public signet/mainnet-candidate rehearsal.
- Independent audits and reproducible wallet builds before mainnet.
- Simple watch-only alerting for people who are not ready to bid yet.
- Clear "claim is provisional" language.
- Reputable launch publishers and a self-claim fallback.
- Claim/contest sponsorship or concierge tooling for early legitimate users, while keeping
  protocol rules neutral. (Decision #43 rejects building any such tooling; anything of
  this shape is a social-layer arrangement outside the protocol.)

### 8. Operational capture during launch

The reference wallet, publisher, resolver, website, or social channel can become de facto
authority.

Attack shape:

- Compromise or impersonate the official wallet/publisher.
- Phish users into signing bids or sending funds.
- DDoS the only practical publisher/resolver.
- Use default endpoints to censor or shape early allocation.

Mitigations:

- Reproducible builds and signed releases.
- Multiple independent publishers/resolvers from day one.
- Public status pages and mirrors.
- Clear endpoint switching.
- Hard-line messaging: the official client is reference software, not authority.

### Bottom line

The hardest adversarial problem is not "can a whale pay a lot?" ONT intentionally lets
anyone pay a lot. The hardest problem is whether early allocations are visibly contestable
enough that later users accept the outcome as legitimate.

For launch, the system needs burst containment: long windows, live transparency, watcher
tools, conservative auction-close rules, and multiple independent infrastructure
operators. For the long run, the system needs tail compression: most personal/agent/
business claims must remain cheap and off-L1 unless genuinely disputed.
