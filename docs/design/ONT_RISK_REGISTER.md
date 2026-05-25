# ONT Flat Namespace — Risk Register (living)

Tracks the open uncertainties and failure modes for the flat-namespace / accumulator
design. **Kind** tells you what to *do* about each:

- **Unsolved** — no known mechanism yet (needs a design breakthrough)
- **Bet** — hinges on an empirical/external unknown we can't settle on paper
- **Undecided** — we have options, just haven't chosen
- **Unvalidated** — assumed numbers, never measured

Severity: **fatal** (could kill the design), **high**, **medium**, **low**.

Last updated: 2026-05-23.

| ID | Risk | Kind | Severity | Status / next step |
| --- | --- | --- | --- | --- |
| R1 | **Data availability / convergence** — honest nodes must agree on one root from Bitcoin alone; withholding can't halt others (self-harm) but a timing disagreement on a *contested* leaf forks the chain | Bet → approach prototyped | Fatal (liveness) | **Decomposed + prototyped (`ONT_DATA_AVAILABILITY_AGREEMENT.md`, `da-convergence-sim.ts`):** uncontested leaves self-heal (commutativity + K-block lag); contested leaves use a Bitcoin-timed availability marker + fail-closed challenge, escalating to direct-L1. Convergence vs. a withholding adversary passes in code (naive rule forks, proposed converges) — **now over the production accumulator** (`batch-rail.ts`), with the resulting ownership provable via C1 proofs. Residual = isolated 1-of-N archive assumption. Open: pin windows, spec the marker tx, decide on DA sampling |
| R2 | **Leaderless chaining / throughput** — many anchors/block need to chain with no privileged sequencer; naive racing collapses to ~1 batch/block or re-centralizes | Unsolved → mechanism prototyped | Fatal (scale) | **Candidate prototyped: per-block delta-merge** (`packages/core/src/delta-merge-sim.ts`) — commutativity, conflict determinism, DA-exclusion, compact proofs all pass — **now wired into the production batch rail** (`batch-rail.ts`): deltas merged into the real C1 accumulator with derived roots anchored in the C2 root chain. Remaining work is live scale numbers (→ R11), not mechanism. See `ONT_HARD_PROBLEMS.md` |
| R3 | **Contest rate** — capacity swings ~100× on a number unknowable until launch. *Assumed time-varying:* high but low-volume early (everyone piles onto `bitcoin`/`google`/dictionary words), falling as the namespace matures and the marginal claim is a long-tail handle (`sallysmith2165`) nobody contests | Bet | High | Design must degrade safely toward L1 economics. Note the heavy-contest regime coincides with low volume (absorbable on L1); premium set is bounded and depletes. Monitor post-launch; expect a low contested floor (speculative racing), not zero |
| R4 | **Off-chain auction binding + ordering** — making escalating bids visible, binding, and cheap at once | Resolved by removal 2026-05-24 | (was High) | **Decided: no off-chain auction.** The accumulator rail is *uncontested-only*; a contested long-tail name escalates to the proven **L1 bonded auction**. This deletes the visible+binding+cheap problem from the rail (`batch-rail.ts` now escalates contests). See `ONT_HARD_PROBLEMS.md` |
| R5 | **BTC-price drift of gate/floors** — fixed-bitcoin amounts mean anti-spam/anti-squat strength floats with BTC price (no-oracle tradeoff) | Bet | Medium | Decide whether drift is acceptable or needs a neutral re-peg mechanism |
| R6 | **≤4-char cliff + junk-short over-tax** — 12,500× floor jump at 4→5; `x7q2` floored like `bank` | Undecided | Low–Med | Accepted for now; revisit if boundary gaming appears |
| R7 | **Cold-start (5–8 char premium)** — no floor, relies on contention; quiet launch lets early movers sweep for ₿1,000 (~$1) | Bet | Medium | Loud scheduled launch + watch tooling; secondary market reprices (squatter captures premium) |
| R8 | **Publisher / inclusion concentration** — economies of scale may centralize liveness/cost even if not safety | Bet | Medium | Direct-L1 caps pricing at L1 cost; monitor concentration |
| R9 | **MEV / ordering games** — publisher (or publisher+miner) sees pending claims & bids; subtle latency/selective-inclusion value | Uncertain → analyzed | Medium | **Analyzed (`ONT_MEV_ORDERING_ANALYSIS.md`):** can't *steal* a name via ordering — commit-reveal hides names, disjoint names commute, contested names won by bidding not ordering, L1 fallback bounds censorship. Residual (reveal-contestation = R7; open-auction relay bid handling) bounded. Adds a vote for sealed second-price (R4) |
| R10 | **Patient accumulation at the gate** — slow hoarding of medium-value names at ₿1,000 (~$1) each | Bet | Low | Bounded by linear cost + low per-name value; accept |
| R11 | **Paper design — unvalidated numbers** — 150 vB anchor, 110 vB contested, 10k/batch, SMT proof sizes all estimated | Unvalidated → partly measured | High | **Measured (`accumulator.ts`, `root-anchor.ts`):** SMT proofs ~log₂(N), 339 B @ 100 → 577 B @ 10k (~1.1 KB @ 1e9); **anchor tx 162–194 vB — ABOVE the 150 vB estimate** (still ~0.016–0.019 vB/name @ 10k, tiny). Still pending: contested vB, real batch sizes, live broadcast |
| R12 | **Full-verifier state growth** — fresh full indexer is O(N) (hundreds of GB at billions) → leans on trusted snapshots | Uncertain | Medium | Bitcoin-anchored snapshots (assumeutxo-style); state pruning |
| R13 | **Gate form** — miner-fee (security-budget systemic-ness + publisher intermediation) vs PoW (verification/centralization) | Decided 2026-05-24 | Medium | **Decided: Bitcoin miner fee** (simplicity + security-budget contribution). Accepted: Bitcoin both prices and orders; PoW would have been cleaner for neutrality/censorship-fallback. R5 drift still applies |
| R14 | **Unpinned parameters** — K-confirm depth, commit→reveal delay, notice window, bond maturity | Undecided | Low | Pin during prototype with explicit latency/safety tradeoffs |
| R15 | **Destination/resolution freshness** — ownership is unique but the destination is an owner-signed off-chain record (stale-routing risk for payment handles) | Undecided | Medium | Bind records to monotonic version + recent Bitcoin-height freshness marker |

## How to read the shape of the risk

- **What could actually kill it:** R2 (chaining) and R4 (auction internals) are the *unsolved-mechanism* risks; R1 (DA) and R3 (contest rate) are the *bets* the whole thesis rests on.
- **What's just work:** R11–R15 are knowable — prototype and decide.
- **What today's decisions newly exposed:** R4 (off-chain auction, freshly chosen and least scrutinized) and R5 (BTC-price drift, a direct cost of the no-oracle / denominate-in-bitcoin choice).

Deep dives on the two scariest (R2, R4) live in [ONT_HARD_PROBLEMS.md](./ONT_HARD_PROBLEMS.md).
