# Tokenless BTC-Bonded DA Incentive Layer — exploration memo

> **Status: EXPLORATION / design-of-record. NOT ratified, NOT on the build path,
> makes no decision and changes no code.** Provoked by DK's 2026-07-12 line of
> questions (Namecoin → Braidpool "Shares" → "could a non-speculative,
> BTC-redeemable markers model form a new consensus for our DA problem?"). Steve
> Lee pointed DK at Braidpool. Recorded so we can revisit deliberately or close
> it on the record. Author: ClaudeleLunatique.

## §0 The question

Is there a kind of ledger/consensus that has **no speculative money token** — instead
**shares/markers redeemable for Bitcoin at a known rate** — that could give ONT a stronger,
still-Bitcoin-aligned answer to its data-availability (DA) problem than "one honest publisher
+ voluntary mirrors + a fail-closed deadline"?

Short version: **the tokenless shape is real and worth borrowing from; but the specific thing
that bounds it is a theorem, not an engineering gap** — data-unavailability is not a uniquely
attributable fault (the *fisherman's dilemma*), so no marker scheme can be "slash whoever
withholds." What you *can* build is an insurance/incentive layer (pay for provable
availability, slash provable mis-encoding), denominated in BTC, minting no coin.

## §1 ONT's DA problem, restated — and the framing that matters most

We batch ~10k names into one tiny Bitcoin anchor (`prevRoot → newRoot`, ~73 bytes). Bitcoin
secures the **ordering and the commitment**; the batch **bytes** (the leaves that reconstruct
the anchored root) live off-chain. Ratified rule (`da-windows` #49 / `batch-completeness` #83
/ `availability-height` #84): bytes that reconstruct the commitment mint
`firstServableHeight = h`; **absent, malformed, tampered, or withheld bytes fail closed and
mutate no name-state** (`docs/core/STATUS.md`, DA known-incomplete entry).

**The single most important property — DA failure is LIVENESS, not SAFETY.** A withholder can
**deny/grief** a name (it's skipped, excluded, never awarded), but **cannot forge, steal, or
move** one (`signet-solution-gate` #95: "availability failure can skip a batch's names, cannot
forge"). This is not a small point: it means ONT does **not** need safety-critical,
Celestia-grade DA. The worst outcome of a total DA failure is *a name doesn't resolve*, never
*the wrong person owns a name*. The bar is censorship-insurance, not theft-prevention.

**What recent work actually established (LE-DA-SERVE / slice 7).** We built the transport +
re-verification mechanism: publisher `GET /da/{root}` serves full per-root material; an
`http-da` indexer mode fetches, recomputes, and re-runs the identical `enforceBatchedClaim`;
a two-operator hermetic e2e (no shared filesystem) proves good → accept, **tampered → reject
at availability/completeness (0 names, no mutation)**, **withheld → skip-and-advance (0 names,
no durable state)**. That is a genuine confidence gain **on the safety half**: bytes you can't
reconstruct against the anchored root can't move name-state.

**What is explicitly still open** (`STATUS.md` DA "Remaining"): prove withhold-then-reveal and
clean-node behavior **over an adversarial chain**; decide if #84's "present-at-verification
mints h" is mainnet-acceptable or should reopen toward an L1-authoritative / witnessed
two-phase model; and add **runtime discovery, durable retries, multiple origins, archive
reconciliation, restart-safe progress** — i.e. the *persistence* story. The open half is
**liveness + persistence**, and that is exactly what a markers/bond layer would target.

## §2 The wall: the fisherman's dilemma (why "slash the withholder" is impossible)

If a node ("fisherman") raises "the data is missing!" and the publisher then posts it, anyone
who wasn't watching that exact piece can no longer tell **who was at fault** — the publisher
who withheld-then-revealed, or a fisherman who cried wolf. Unavailability is a **non-uniquely-
attributable fault**, so a protocol **cannot punish either party** for it. (Dankrad Feist, "Data
availability checks", 2019; Al-Bassam, Sonnino, Buterin, "Fraud and Data Availability Proofs",
arXiv:1809.09044.)

Consequence for any marker/bond scheme: it **cannot** be "post a bond, lose it if you withhold."
The DA field routed around this the same way every time:

1. **Erasure-code** the payload so any *k-of-n* shards reconstruct the whole → withholding
   requires suppressing *many* shards, not one, and no single mirror is load-bearing.
2. Slash only the **attributable** fault: publishing an **invalidly-encoded** erasure code
   (that is provable and punishable). Availability itself is established by **sampling** — many
   light clients each pull random shards; enough successes ⇒ available with high probability —
   not by a punishment game.
3. **Reward positive proofs.** A **proof-of-retrievability (PoR)** receipt ("I served shard S
   at height H", signed) is *attributable* — so you pay for *provable availability* rather than
   trying to punish *unprovable withholding*. This is the clean way to keep the fisherman's
   dilemma from biting.

## §3 Prior art surveyed

| System | The idea | Token? | What to take / avoid |
| --- | --- | --- | --- |
| **Namecoin** | first-come key/value names on a merge-mined chain | NMC | **Anti-pattern.** ~cent registration + near-free renewal every ~36k blocks, **flat price, no contention pricing** → mass squatting. The lesson ONT's sunk-gate + bonds already answer. |
| **Braidpool** | decentralized mining pool; "beads/shares" are sub-difficulty PoW, valued at difficulty, **settled to BTC each 2016-block window via a FROST multisig**, no pool coin | none (BTC) | **The pattern to borrow.** Proof-backed, non-speculative shares; committee custody; BTC settlement; deliberately no float. Shares *are* transferable (for hashrate hedging) but pinned to work + BTC, "never an exchange coin." |
| **Celestia / Avail / EigenDA** | DA-as-a-service via **erasure coding + data-availability sampling** | TIA / AVAIL / EIGEN + PoS chain | **Take the technique** (erasure coding, sampling, slash-only-misencoding); **reject** the token and separate PoS chain. |
| **Filecoin / Arweave** | pay providers to store; **proof-of-spacetime / PoR**; Arweave's pay-once **endowment** streams to persisters | FIL / AR | **Closest to our real gap** (persistence incentive). Take PoR + the endowment idea (pay-once, persist-long); reject the token. |
| **Bitcoin primitives** | DLCs / adaptor signatures (conditional BTC payout on an oracle/proof); **BitVM2** (emulates covenant-style **bonded slashing on Bitcoin, no soft fork**); PoR-on-Bitcoin; covenant proposals (CTV/CSFS) | none (BTC) | The toolbox that makes "markers = BTC bonds, redeemable at a known rate" actually enforceable on Bitcoin today. |

## §4 The tokenless shape that IS achievable for ONT

DK's "markers redeemable for BTC at a known rate, no speculative float" maps cleanly:

- **Markers = BTC storage bonds + BTC service payments.** A provider posts a BTC bond to take
  custody of a batch's (erasure-coded) shards for a window, earns BTC (Lightning stream / L1
  settle) for producing **PoR receipts**, and the bond returns on honest service. Redeemable-
  for-BTC-at-a-known-rate = the bond itself. No token; value pinned to BTC. Enforcement:
  DLC / adaptor signatures for conditional payout; **BitVM2** for bonded slashing without a soft
  fork.
- **The "new consensus" = a permissionless PoR provider pool, not a PoS chain.** Direct
  Braidpool lift: **FROST-multisig committee custody** of a BTC pot, paid out each window in
  proportion to *proven retrievability*, over **erasure-coded** shards so k-of-n suffices. The
  "shares" are PoR receipts (positive, attributable) instead of PoW beads — but the
  accounting / custody / BTC-settlement pattern is Braidpool's, and it mints no coin.
- **Slashing is bounded by §2:** you can slash *provable mis-encoding* and *withhold payment for
  unproven service*; you cannot slash *withholding itself*. Design around it — reward
  availability, don't try to punish its absence.

## §5 The ONT-scale reality check (the part to weigh hardest)

Celestia-grade DA *sampling* exists because their blocks are **megabytes** — nobody can
download them all. **Our batches are tiny** (~10k name→32-byte-key records, sub-MB). At that
size **full replication is cheap** — anyone can just hold the whole batch. So ONT probably does
**not** need heavyweight availability *sampling*; the actual open sub-problem is narrower:
**who is incentivized to persist the long-tail batch — the one nobody queries — for years, so
an honest copy always exists?** That is a **Filecoin/Arweave persistence-incentive** shape, not
a Celestia one. The markers/bond idea is the right shape for *exactly that gap*, and it is far
lighter than "a new consensus."

## §6 Recommendation + open questions to revisit

**Low-regret first step (if/when we invest here):** **erasure-code the batch material + a
BTC persistence bounty/bond for mirrors**, keeping the existing fail-closed deadline underneath.
This captures ~80% of the idea's value — no single mirror is load-bearing (k-of-n reconstruct),
and there's a BTC-denominated reason for ≥1 party to persist each batch — **without** building
any new consensus/chain. Defer a provider *consensus* until scale actually demands it.

**Do NOT build yet.** This is a frontier, gated on: (a) mainnet timeline (irrelevant on the
current private-signet demo, where the operator is trusted anyway per #95); (b) whether the
`#84` "present-at-verification mints h" rule survives the mainnet-acceptability decision that is
already open; (c) real appetite to add an incentive layer to a system whose whole pitch is
minimalism.

**Open questions for a future decision:**
1. Is erasure-coded voluntary mirroring + a persistence bounty *enough*, or do we need bonded
   providers + PoR at all, given DA-failure is liveness-not-safety and batches are tiny?
2. Can BTC-native PoR + DLC/BitVM2 slashing be made simple enough to not blow the "small audited
   surface" budget?
3. Does any of this interact with the `#84` reopen (L1-authoritative acquisition / witnessed
   two-phase activation)? If we move toward L1-authoritative acquisition, the DA incentive layer
   may matter less.
4. Sybil on the provider side (bond-splitting) — does the FROST-committee / PoR design need a
   Sybil story, or does "pay per proven byte served" make Sybil irrelevant (you only pay for
   real service)?

## Sources

- Fisherman's dilemma / DA checks — Dankrad Feist, <https://dankradfeist.de/ethereum/2019/12/20/data-availability-checks.html>
- Fraud & Data Availability Proofs — Al-Bassam, Sonnino, Buterin, <https://arxiv.org/pdf/1809.09044>
- DAS open problems — Paradigm, <https://www.paradigm.xyz/2022/08/das>
- Braidpool overview — <https://github.com/braidpool/braidpool/blob/main/docs/overview.md>
- BitVM2 (bonded slashing on Bitcoin) — <https://www.goat.network/bitvm2-whitepaper>
- Proof-of-retrievability on Bitcoin — <https://coingeek.com/pay-for-storage-using-proof-of-retrievability-on-bitcoin/>
- ONT internal: `docs/core/STATUS.md` (DA known-incomplete), `docs/ONT_ONE_PAGER.md` (§attack tour: withholding), decisions `#49` / `#83` / `#84` / `#95`.
