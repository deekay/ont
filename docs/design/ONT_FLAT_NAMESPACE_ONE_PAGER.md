# ONT Flat Namespace — One-Pager (Modeled)

A flat, global namespace where a name is **truly owned** (one-time cost, no rent,
no revocation), **neutral** (no registrar/editor/token), **Bitcoin-anchored**,
and able to **scale to billions**. This page puts specific numbers on it. Every
figure derives from the assumptions block; treat those as the knobs to challenge.

Status: modeled paper design, no known dealbreaker, **not yet prototyped**. Not a
v1 commitment.

---

## The mechanism in five lines

1. The whole namespace is one cryptographic **set** (a sparse Merkle tree keyed by
   the name). A name is owned the instant it is **inserted**; you can't insert one
   already present, so uniqueness is enforced at insertion — no challenge window to
   exploit.
2. Only the set's **root** touches Bitcoin, **once per batch** of ~10k names. 8B
   names then anchor in a sliver of blockspace.
3. It's a **Bitcoin-sequenced rollup**: Bitcoin *orders* the roots (no new
   consensus, no block reward needed); ONT clients *validate* by deterministic
   replay. The one thing Bitcoin's order doesn't supply is the data behind a root —
   that's the **data-availability** assumption.
4. **Two cost forms:** long-tail names pay a flat **1,000 sats (~$1) sunk gate**; premium /
   contested / short names lock a **returnable bond** (their own BTC, returned at
   maturity).
5. Claims are public for a **notice window** (~3–4 days). Sole claimant → theirs.
   Two+ → **auction** (open, visible; bids gossiped off-chain, only capital locks +
   settlement on-chain).

---

## Assumptions (the knobs)

| Parameter | Value | Note |
| --- | --- | ---: |
| Bitcoin blockspace | 1,000,000 vB/block; 144 blocks/day | = 52.56B vB/year |
| Block subsidy (2026, post-2024 halving) | 3.125 BTC/block | → 164,250 BTC/year |
| BTC price | **$100,000** | pure parameter; scales $ figures linearly |
| Anchor blockspace cost (150 vB root tx) | **~$1.50 normal / ~$15 congested** | *blockspace* cost only, independent of batch size. Under the miner-fee gate the anchor *also* carries the aggregate gate `Σg ≈ N×1,000 sats` as its fee — see [`ONT_ISSUANCE_FEE_MECHANICS.md`](./ONT_ISSUANCE_FEE_MECHANICS.md) |
| Anchor (root) on-chain size | **150 vB** *(measured 162–194 vB — see note)* | independent of names in the batch |
| Names per batch | **10,000** | → 0.015 vB/name *(measured 0.016–0.019 vB/name)* |
| ONT blockspace share | **1%** (526M vB/yr) | 5% and 0.1% shown for range |
| Long-tail gate | **1,000 sats/name** (~$1; = 0.00001 BTC) | fixed bitcoin amount, floats with BTC price; **paid to miners** as the anchor tx fee (R13 decided; mechanics in [`ONT_ISSUANCE_FEE_MECHANICS.md`](./ONT_ISSUANCE_FEE_MECHANICS.md)) |
| Contested name on-chain footprint | **~110 vB** | winner-only L1 hardening + bond UTXO; bids off-chain |
| Length-floor (bond) | **≤4-char names only**; `₿1/2^(len−1)`; 1,000 sats (~$1) gate is the floor below | bonds are per-name UTXOs → confined so the bonded set stays small |

> **Measured (signet prototype C2, 2026-05-24):** a real anchor tx (1 P2WPKH in, OP_RETURN, change)
> is **162 vB** (newRoot only) to **194 vB** (explicit `prev→new` link) — *above* the 150 vB estimate,
> because the root bytes sit in a non-witness OP_RETURN (full weight). Per-name cost is still ~0.016–0.019
> vB @ 10k batch, so blockspace remains a non-bottleneck for the long tail; the throughput rows below are
> ~8–30% optimistic on anchor size. SMT proofs measured ~1.1 KB @ 1e9 names. See `ONT_SIGNET_PROTOTYPE_SCOPE.md`.

---

## Throughput — names per block / day / year

The long-tail batch rail. Requires anchors to **chain** within a block (each builds
on the prior root); the unchained row shows what you get if publishers only race
off the last *confirmed* tip.

| Blockspace share | Anchors/block | Names/block | Names/day | Names/year | Time to 8B* |
| --- | ---: | ---: | ---: | ---: | ---: |
| 0.1% | ~7 | 67k | 9.6M | 3.5B | ~2.3 yr |
| **1% (chained)** | **~67** | **670k** | **96.5M** | **35.2B** | **~83 days** |
| 5% (chained) | ~333 | 3.33M | 480M | 175B | ~17 days |
| 1% (unchained, 1/block) | 1 | 10k | 1.44M | 526M | ~15.2 yr |

\* assuming contest rate ≈ 0 (pure batch insertions). The contested rail below is
the real binding constraint.

**Takeaway:** at 1% blockspace the on-chain footprint is **0.015 vB/name** — blockspace
is *not* the bottleneck for the long tail. The ~67× gap between chained and
unchained is the unsolved **permissionless-chaining coordination** problem.

---

## The binding constraint — contested names + contest rate

Contested/bonded names need a real **UTXO bond** (~110 vB each), so they are
L1-bound. Total capacity = contested-settlement capacity ÷ contest rate. Combined
constraint: `T × [(1−c)·0.015 + c·110] ≤ 526M vB/yr`.

| Contest rate `c` | Max total names/yr (1% blockspace) | Contested settlements/yr | Time to 8B |
| --- | ---: | ---: | ---: |
| 0.1% (mature) | **~4.2B** | ~4.2M | ~1.9 yr |
| 1% (conservative) | ~472M | ~4.7M | ~17 yr |
| 10% (launch stress) | ~48M | ~4.8M | ~167 yr |

**Takeaway:** the long-tail rail is effectively unlimited; **the contest rate is the
whole scaling story.** A mature, long-tail-dominated namespace (0.1% contested) does
billions/year; a 10%-contested world collapses toward L1 economics. This is why
"most names aren't worth a capital-backed challenge" is the load-bearing hypothesis.

---

## Cost per name — gate vs. real Bitcoin cost

| Cost component | Per anchor (10k names) | Per name |
| --- | ---: | ---: |
| Real Bitcoin tx fee (150 vB anchor, normal) | $1.50 | **$0.00015** |
| Real Bitcoin tx fee (150 vB anchor, congested) | $15 | $0.0015 |
| **Anti-spam gate (design choice)** | $10,000 | **$1.00** |

The gate is **~700–7,000× the marginal Bitcoin cost.** That confirms the gate is a
*deliberate sink*, not a pass-through of the tx fee. If the gate is routed as a
miner fee, the batch tx pays ~$10,000 on a ~150 vByte transaction — far above
market for its size, so it's always top-of-mempool,
guaranteed inclusion. The alternative is PoW (burns about 1,000 sats worth of energy, funds nothing,
cleaner on neutrality and for the censorship fallback). **Undecided.**

---

## Security-budget contribution (if the gate is a miner fee)

Bitcoin's 2026 annual subsidy ≈ **$16.4B** (164,250 BTC × $100k). A $1 miner-fee
gate contributes $1 × names issued:

| Names issued/year | $ to miners/year | Share of block subsidy |
| --- | ---: | ---: |
| 100M | $100M | 0.6% |
| 1B | $1B | 6.1% |
| 4B (≈ mature 0.1%-contest ceiling) | $4B | **24%** |
| 35B (batch-rail ceiling, contest≈0) | $35B | **214%** |

**Takeaway:** at realistic mature adoption a $1 miner-fee gate makes ONT a
**top-tier fee contributor to Bitcoin's security budget** (~quarter of the subsidy) —
a genuine "good citizen" story as the subsidy halves toward zero. Double-edged: at
the theoretical ceiling it would *exceed* the subsidy, making ONT load-bearing for
Bitcoin security — a property to choose deliberately, not stumble into.

---

## Bond capital & UTXO footprint

A length-floor (a returnable **bond**, forfeit only if misspent) sets a minimum
acquisition cost for the shortest, structurally-scarce names. **It applies only to
names ≤4 characters** — see the constraint below. At $100k/BTC:

| Name length | Floor bond | ≈ $ | ~Annual cost @ 5% yield |
| --- | ---: | ---: | ---: |
| 1 char | ₿1 | $100k | $5,000 |
| 2 char | ₿0.5 | $50k | $2,500 |
| 3 char | ₿0.25 | $25k | $1,250 |
| 4 char | ₿0.125 | $12.5k | $625 |
| **5+ char** | **none — 1,000 sats gate, priced by contention** | ~$1 | — |

**Why ≤4 chars — this is a scalability constraint, not a style choice:** a floor = a
bond = a **per-name UTXO**, and bonds can't batch (pooling needs a custodian, which
breaks neutrality). So bonded names are L1-blockspace-bound (~110 vB each, ~4.78M/yr
at 1% blockspace — the contested-rail ceiling above). The ≤4-char space is hard-capped
at **~1.7M names total** (36 + 1,296 + 46,656 + 1,679,616), so even full adoption over
years stays at ~4–7% of bond capacity. Extending the floor to 5+ chars would force
bonds onto popular, numerous lengths and **reintroduce the UTXO scaling wall**. Premium
5–8 char names (`alice`, `crypto`, `bitcoin`) instead ride the gate and are priced by
**contention auctions** — the intended pricing mechanism for them.

**UTXO set impact:** only the *winner's* bond persists (one UTXO per bonded name, until
maturity); losing bids are **churn, not bloat** (locked, then reclaimed). The bonded
set is bounded by the contested flow plus the hard ~1.7M ≤4-char cap — single-digit
millions, trivial against Bitcoin's ~150M+ UTXO set. The long-tail billions, and every
5+ char name, hold **no UTXO at all**.

---

## Open problems (honest)

1. **Data availability** — the single make-or-break assumption. Degrades *liveness*
   (can't make new claims), never *safety* (can't lose a name you hold). Handled by
   fail-closed clients + publisher incentives + honest-minority archives.
2. **Permissionless chaining** — the ~67×/block throughput needs anchors to chain on
   each other's *unconfirmed* roots without a privileged sequencer. Unsolved.
3. **Contest rate** — the entire scaling story rides on it staying low (0.1–1%). The
   design must degrade safely (toward L1 economics) if it's higher.
4. **Gate form** — miner fee (funds security) vs. PoW (cleaner neutrality). Undecided.
5. **Cold start** — early movers can grab good names on a quiet launch; mitigated by
   length-floors, visible claims, and a loud scheduled launch.

---

## Next step

Signet prototype: (1) SMT with membership + non-membership proofs; (2) anchored root
chain that rejects invalid transitions; (3) fail-closed DA check; (4) direct-L1
censorship fallback; (5) contested-name flow (visible claim → off-chain public bids →
timelocked capital → returnable-bond settlement).
