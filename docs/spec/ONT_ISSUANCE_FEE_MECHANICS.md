# ONT — Issuance Fee Mechanics (how the claim gate reaches miners)

How does the per-name claim fee (₿1,000 — ~$1, fixed in bitcoin) actually work in the **batched** path,
such that it is simultaneously a real anti-spam gate, neutral, blockspace-minimal, *and* genuine
miner revenue? This note works that through, because two of the project's headline claims are in
tension and the current docs are inconsistent about it.

Status: design analysis, 2026-05-25. Resolves a live inconsistency; recommends a mechanism. Not yet
a frozen spec.

---

## 1. The inconsistency this resolves

Three places say different things:

- **ONT.md:** the claim fee is "paid to Bitcoin miners."
- **R13 (risk register):** decided **Bitcoin miner fee** (for the security-budget contribution).
- **`ONT_FLAT_NAMESPACE_ONE_PAGER.md`:** anchor fee "~$1.50 normal … **total on-chain fee,
  independent of batch size**" for a 10,000-name batch.

The third can't coexist with the first two. If a batch of 10,000 names pays one ordinary ~150 vB
transaction fee (~$1.50), then **miners receive ~$1.50 for 10,000 names — about $0.00015/name, not
₿1,000 (~$1)/name.** The ₿1,000 gate would be going somewhere *other* than miners (publisher margin,
a burn, or nothing). That guts the "feeds Bitcoin's security budget" claim and the "₿1,000 to miners"
claim at once.

So we have to decide, precisely, **where the per-name gate goes** — and it turns out the anti-spam
requirement alone removes most of the options.

## 2. Two hard constraints (these do the elimination)

**C1 — The gate is per-name and batch-invariant.** Claiming `k` names must cost `~k · g`, whether
done as `k` solo claims or one batch of `k`. Batching may amortize the *blockspace/tx overhead* to
near zero, but it must **not** discount the gate itself. Otherwise a squatter batches a million names
under one tx fee and mass-squatting is free — the gate stops gating.

**C2 — The gate must not be publisher revenue.** Publishers compete, and competition drives whatever
*they* keep toward the floor (`tx_fee / N`). So if the gate were the publisher's to keep, competition
would erode the *effective* gate toward zero — again defeating anti-spam. The gate has to be a
protocol-mandated cost the publisher **cannot pocket or compete away**; the publisher may add only a
small *service* margin on top.

C1 + C2 mean the gate must flow to a sink **outside the publisher's control and invariant to
batching**. That leaves exactly three sinks.

## 3. Where can the gate go? (design space)

| Sink | Anti-spam (C1/C2) | Neutral | Security budget | Trustless / no oracle | Verdict |
| --- | --- | --- | --- | --- | --- |
| **Miners** (gate = mandated tx fee) | ✓ (protocol floor, not publisher's) | ✓ (miners are permissionless/competitive) | **✓✓ full per-name fee to miners** | ✓ (fee is computable from Bitcoin) | **Recommended** |
| **Burn** (provably-unspendable output) | ✓ | ✓ (no one collects) | ✗ (no fee revenue; only indirect via scarcity) | ✓ | Clean but kills the security-budget pitch |
| **Publisher** ("keeps the spread") | ✗ (competed to ~0 → no gate) | — | ✗ | — | **Broken** — violates C2 |
| **PoW** (work, not bitcoin) | ✓ | ✓ | ✗ (claimer work ≠ miner revenue) | ✓ | The R13 runner-up; abandons the budget benefit |

The publisher-revenue model (what the accumulator note's "collects gate fees … keeps the spread"
line implies) is the one that's actually *broken*: it can't hold a gate up against competition. Of
the survivors, **miner-fee** is the only one that also delivers the security-budget contribution —
which is why R13 chose it. This note makes that choice mechanically concrete.

## 4. Recommended mechanics — the gate *is* the anchor's miner fee

**Validity rule (checkable from Bitcoin alone).** A batch anchor committing to `N` names with gate
amounts `g₁…g_N` counts toward the canonical root **only if its Bitcoin transaction paid a fee
`F ≥ Σ gᵢ`.** A full verifier already replays Bitcoin and holds the UTXO set, so it can compute the
anchor tx's exact fee (`Σ inputs − Σ outputs`) and check it. No oracle, no off-chain trust, no new
consensus — the gate is bound to *real, witnessed miner revenue* by a rule anyone can verify. The fee
is intrinsic to that one transaction, so it can't be reused across anchors.

**Who funds it, and why users aren't exposed.** The publisher funds the anchor (pays `Σ gᵢ` + the
small blockspace cost to miners from its own UTXOs), then collects each `gᵢ` + a thin service margin
from users **against a verifiable inclusion proof** (a Merkle path to the anchored root), settled
over Lightning or a conditional payment. This aligns risk correctly:

- A user pays only once they can verify their name landed — so a flaky/withholding publisher costs
  the user nothing (they retry elsewhere or fall back to L1).
- **DA-failure risk sits with the publisher**, the party that controls data availability: if it
  withholds and its anchor is rejected, it has already paid `Σ gᵢ` to miners and can produce no valid
  inclusion proofs to collect — a self-harming loss, exactly the incentive we want.
- The publisher's margin (competed toward ~0, hard-capped by the L1 self-claim fallback) compensates
  for fronting capital and bearing DA risk. It is *service* margin, never the gate (satisfies C2).

**The self-sovereign case is the same rule with `N = 1`.** If you can't find a publisher or are
censored, you post your own anchor — a batch of one — whose fee is `≥ g`. You pay the gate directly
to miners as your own transaction's fee. This *is* the censorship-resistant floor (invariant I5): a
publisher is just `N` users sharing one anchor whose fee is the sum of their gates.

## 5. Why this satisfies every invariant

- **Anti-spam (C1):** the fee floor is per-name and batch-invariant; a squatter pays `Σ g` to miners
  regardless of batching.
- **Neutral (I3):** the project collects nothing; the sink is miners, a permissionless competitive
  set. (Burn would also be neutral; publisher-collect would not.)
- **Minimal Bitcoin footprint:** one ~150–194 vB anchor per batch, *independent of `N`* — ~0.015–0.019
  vB/name. Blockspace cost stays negligible; the *fee* is large but vbytes are tiny.
- **Security budget (✓✓):** miners receive the full `Σ g`. This is the strong version of the pitch.
- **Trustless / no oracle (I4, R5):** `g` is fixed in bitcoin (drifts with price — accepted, R5);
  the fee is checked from Bitcoin, not asserted by anyone.
- **Self-sovereign (I5):** `N = 1` is the un-censorable fallback and the price ceiling on publishers.

## 6. Griefing the publisher (economic safety vs. DoS)

A natural attack: submit a large batch (say 10k names) to a publisher and never pay, so the publisher
eats the fronted miner fee `Σ g`. The defense is one sequencing invariant:

> **A claim enters the fronted batch only with a committed payment. The publisher fronts the miner fee
> for nothing it hasn't already captured.**

By tier:

- **Pay-first / pay-upfront** (the launch path with reputable publishers): the non-payer is simply
  **not included** — the publisher builds the anchor from paid claims only. Attacker gets nothing;
  publisher loses nothing.
- **Locked-payment swap** (a *longer-term* research direction, **not v1**): a claim enters the broadcast
  batch only with a *live payment lock*, and **the act of broadcasting captures that lock.** There is no
  "have a live lock and then not pay" — the lock *is* the payment, claimed by the broadcast. (This is why
  the swap protects the publisher as much as the user.) The publisher's exposure is only ever `Σ g`
  against claims with committed payment, captured atomically by the single anchor broadcast. This needs a
  construction that binds an off-chain payment to a specific on-chain anchor; the clean primitives for it
  (e.g. adaptor-conditional / PTLC payments) are long-roadmap, so v1 does **not** depend on this — it
  ships on the pay-first tier above.

So **economic safety is structural**: the "10k names, don't pay" attacker cannot make a publisher lose
money — they just don't get included.

**What remains is ordinary service-DoS**, and it's a different kind of thing: an attacker can send many
*requests* (not payments) to force a publisher to do work / hold slots. That is **not a money loss and
not a protocol-safety issue** — it's a publisher *admission-policy* concern, with the standard tools any
service uses: a small non-refundable entry fee, a required payment-lock, or a cheap PoW token to occupy
a batch slot. The publisher runs its own door. And the **L1 self-claim fallback caps the blast radius**:
even against aggressive publisher defenses, a user posts their own anchor, so griefing a publisher can
never *deny anyone a name* — worst case it pushes that user to L1. (This DoS-admission design folds into
the still-open "concrete publisher fee/contention design" item; see R2 / the accumulator note.)

## 7. The numbers, corrected

The leverage is that **fee revenue is decoupled from blockspace.** One small anchor carries a fee of
`N × ₿1,000`.

| | Old one-pager line | Under this model |
| --- | --- | --- |
| Anchor tx size | 150 vB (meas. 162–194) | unchanged |
| Anchor tx **fee** | "~$1.50, total, independent of batch size" | **`Σ g` ≈ `N × ₿1,000`** (e.g. ₿10,000,000 ≈ $10,000 for a 10k batch); blockspace cost is rounding error on top |
| To miners, per name | ~$0.00015 | **₿1,000 (~$1)** |
| Blockspace per name | 0.015 vB | unchanged |

At the one-pager's own **1% blockspace** scenario (~526M names/year): 526M × ₿1,000 ≈ **₿526 billion
— ~5,260 BTC/year (~$526M) in fees to miners**, from **1% of blockspace.** That is
comparable to — often exceeding — Bitcoin's recent *total* annual fee revenue, produced from a sliver
of blockspace. The headline for the security-budget
argument is precisely this decoupling: **ONT is a source of fee demand that barely consumes
blockspace** — arguably the ideal shape of post-subsidy fee pressure.

## 8. Known properties and residuals (honest)

- **Miner self-issuance.** A miner can include its *own* anchor in a block it mines and recapture the
  fee — issuing names cheaply in proportion to its hashrate. This is the same property Bitcoin already
  has (miners include their own txs at no net fee) and is bounded by hashrate share; it's a known,
  bounded effect, not a break.
- **Fee-market interaction.** These anchors are astronomically high fee-per-vbyte, so they sit
  top-of-block and slightly raise the effective floor feerate for everyone else at scale. That's the
  fee market working (ONT outbids low-value uses for ~1% of space) — arguably good for the budget,
  but worth stating.
- **Pay-on-proof plumbing.** The Lightning/conditional-payment flow that releases a user's `gᵢ`
  against an inclusion proof needs a concrete spec (HODL invoice keyed to the proof; publisher
  includes only paid users so it isn't out-of-pocket).
- **`g(name)` encoding.** The per-name schedule (long tail ₿1,000 / ~$1; scarce short names higher) must be
  encoded so the `F ≥ Σ gᵢ` check is mechanical from the batch contents.
- **Reorg / fee finality.** The fee is spent when the anchor is mined; standard `K`-confirm finality
  and deterministic replay handle reorgs, same as the rest of the rail.

## 9. Doc corrections this implies

- `ONT_FLAT_NAMESPACE_ONE_PAGER.md`: the "anchor fee ~$1.50, independent of batch size" line conflates
  blockspace cost with the gate. The anchor fee under the chosen (miner-fee) gate is `Σ g ≈ N × ₿1,000`;
  only the *blockspace* cost is batch-size-independent.
- `BITCOIN_ANCHORED_NAME_ACCUMULATOR.md`: the publisher "keeps the spread" framing must be narrowed to
  a *service* margin on top of the mandated gate, not the gate itself (per C2).
- ONT.md ("paid to Bitcoin miners") and R13 ("miner fee") are correct and are made concrete here.

See also: [`ONT_RISK_REGISTER.md`](../design/ONT_RISK_REGISTER.md) (R13 gate form, R5 drift),
[`ONT_FLAT_NAMESPACE_ONE_PAGER.md`](../research/archive/ONT_FLAT_NAMESPACE_ONE_PAGER.md),
[`ONT_DATA_AVAILABILITY_AGREEMENT.md`](./ONT_DATA_AVAILABILITY_AGREEMENT.md) (DA-failure handling the
publisher-fronting model relies on).
