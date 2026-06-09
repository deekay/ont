# ONT Contest Grief Cost Model

Context: Mat asked what it would cost an adversary to keep ONT from scaling by pushing the namespace above the critical contested-claim rate.

## Short Answer

If a valid contest can be created by submitting a second cheap claim, the system is brittle to mass griefing. The attacker does not need to win names. They only need to force many honest claims out of the cheap path and into the contested path.

Under the current cheap-gate assumption:

```text
force_contest_cost = 1,000 sats * number_of_griefed_claims
```

That is small relative to the harm:

- `1M` griefed claims costs `10 BTC` in gate spend.
- `10M` griefed claims costs `100 BTC`.
- `80M` griefed claims costs `800 BTC`.

For a large DNS incumbent, hostile protocol sponsor, or state-level actor, those are not prohibitive numbers. The current cheap gate is an anti-spam fee, not enough economic weight to prove good-faith contesting.

This is distinct from the cost to actually win names. Winning auctions can be expensive. But Mat's scalability concern is broader: an attacker can degrade usability and force L1 auction load without intending to own the names.

## Assumptions

Bitcoin capacity:

```text
20_year_bitcoin_vbytes = 1,000,000 vB/block * 144 blocks/day * 365.25 days/year * 20
                       = 1.05192T vB
```

Direct L1 auction approximation from the current forecast notes:

```text
direct_auction_vbytes ~= 500 + 300 * bid_count
```

Contest-rate model:

```text
L1_vbytes = total_claims * contest_rate * direct_auction_vbytes
```

Cheap force-contest model:

```text
attacker_gate_cost = total_claims * contest_rate * 1,000 sats
```

Caveat: this vbyte model assumes a forced contest actually proceeds into direct-L1 auction traffic with meaningful bid count. If honest users abandon the name instead of bidding, blockspace use is lower but the product harm remains: cheap claims become uncertain, slow, and intimidating.

## Critical Contest Rates

Maximum contest rate compatible with a `1%` twenty-year Bitcoin blockspace budget:

| Claims over 20y | `20` bids | Gate cost at threshold | `50` bids | Gate cost at threshold | `100` bids | Gate cost at threshold |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `100M` | `1.62%` | `16.18 BTC` | `0.68%` | `6.79 BTC` | `0.34%` | `3.45 BTC` |
| `1B` | `0.162%` | `16.18 BTC` | `0.068%` | `6.79 BTC` | `0.034%` | `3.45 BTC` |
| `8B` | `0.020%` | `16.18 BTC` | `0.0085%` | `6.79 BTC` | `0.0043%` | `3.45 BTC` |

The absolute number of contested auctions that fit in the `1%` blockspace budget is fixed by bid count:

- `20` bids: about `1.62M` contested auctions.
- `50` bids: about `679k` contested auctions.
- `100` bids: about `345k` contested auctions.

At a `1,000 sats` trigger cost, the spend required to push ONT past the `1%` direct-L1-auction budget is only single-digit to low-double-digit BTC. That is the brittle part.

## Stress Examples

| Claims over 20y | Contest rate | Contested names | Gate cost | Blockspace at `20` bids | Blockspace at `50` bids | Blockspace at `100` bids |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `100M` | `0.1%` | `100k` | `1 BTC` | `0.06%` | `0.15%` | `0.29%` |
| `100M` | `1%` | `1M` | `10 BTC` | `0.62%` | `1.47%` | `2.90%` |
| `1B` | `0.1%` | `1M` | `10 BTC` | `0.62%` | `1.47%` | `2.90%` |
| `1B` | `1%` | `10M` | `100 BTC` | `6.18%` | `14.73%` | `28.99%` |
| `8B` | `0.01%` | `800k` | `8 BTC` | `0.49%` | `1.18%` | `2.32%` |
| `8B` | `0.1%` | `8M` | `80 BTC` | `4.94%` | `11.79%` | `23.20%` |

For billion-scale ONT, an adversarial contest rate near `0.1%` is already too high if every contest runs direct L1 bids. For `8B` names, even `0.01%` adversarial contests can consume around the whole `1%` blockspace budget at 50-bid auctions.

## Cost If Contesting Requires Real Capital

The model changes if a contest must auto-seat as an auction-opening bid or challenge bond.

If the bond is returnable, the attacker's true economic cost is not the full principal unless there is slashing. It is:

```text
capital_required = contested_names * challenge_bond
carry_cost ~= capital_required * annual_cost_of_capital * lock_years
fees_paid ~= contest_tx_fees + bid_tx_fees
```

Illustrative capital lock for `1M` simultaneous contests:

| Challenge bond | BTC locked | 5% annual carry |
| ---: | ---: | ---: |
| `50k sats` | `500 BTC` | `25 BTC/year` |
| `100k sats` | `1,000 BTC` | `50 BTC/year` |
| `500k sats` | `5,000 BTC` | `250 BTC/year` |
| `1M sats` | `10,000 BTC` | `500 BTC/year` |
| `1 BTC` | `1,000,000 BTC` | `50,000 BTC/year` |

Returnable bonds make the attack much more capital-intensive but not necessarily permanently expensive for very large adversaries. Non-refundable or slashable challenge deposits would make the cost linear in spend, but current ONT bonds are plain owner-controlled payment UTXOs enforced by ONT validity rules, not Bitcoin-script-locked slashable coins. True slashing would require a different script/custody design.

## Attack Classes

### 1. Cheap Escalation Grief

The attacker submits a second cheap claim during the notice window for many honest claims.

Goal:

- Make the cheap path unreliable.
- Force honest users into auction UX, capital readiness, and delay.
- Create a perception that ONT is hostile to normal users.

Cost:

- `1,000 sats` per griefed claim if no challenge bond is required.

This is the highest-risk brittleness.

### 2. Blockspace Grief

The attacker forces many claims into contested state and then either submits bids directly or induces honest users to defend.

Goal:

- Make ONT appear unable to scale because direct-L1 auctions consume too much Bitcoin blockspace.
- Create fee pressure and bad UX during launch.

Cost:

- Cheap contest gate plus L1 bid transaction fees if the attacker creates the bid traffic.
- Potentially externalized to honest users if they defend their names.

The critical-rate table above measures this damage mode.

### 3. Win-To-Deny

The attacker wins auctions, holds names through the bond period, then walks or reopens/re-wins.

Goal:

- Deny high-value names to legitimate users.
- Keep specific names in limbo.

Cost:

- Auction bids, fee spend, and locked-capital opportunity cost.
- Not principal loss unless the protocol introduces a real slashing path.

This is expensive for broad namespace griefing but relevant for targeted names.

## Design Implications

1. A mere second `1,000 sats` cheap claim should not be enough to force durable L1 escalation at scale.
2. A valid contest should probably require real economic weight: a challenge bond or auction-opening bid credited into the auction.
3. The challenge bond should be objective and mechanical, not manually curated by name importance.
4. The bond must be high enough that mass griefing requires meaningful BTC-time, but low enough that legitimate challengers can still contest.
5. If the bond is returnable, model BTC-time and UTXO management as the deterrent. If that is not enough, the team needs to explicitly consider non-refundable fees or script-level slashing.
6. During high-load periods, an objective escalating challenge floor may be safer than letting dust challenges route the long tail to L1.
7. The protocol should distinguish "cheap objection observed" from "economically valid contest." The former can be a warning; the latter should be what escalates consensus state.

## Bottom Line

Mat's brittleness concern is correct under the cheap-contest trigger model. The cost to push ONT above its direct-L1 contested-auction budget can be only a few to tens of BTC in gate spend, depending on bid-count assumptions, if every cheap contest counts.

The fix is not only longer notice windows. Longer notice improves legitimacy and detection, but it also gives attackers more time to grief claims. The economic fix is to make forced escalation require capital: a bonded challenge, auction-opening bid, non-refundable challenge fee, or a batched/off-chain contested transcript where losing bids do not all hit L1.

## Sources

- `(blockspace forecast note — internal, available on request)`
- `(contest-rate benchmark note — internal, available on request)`
- `./ONT_ADVERSARIAL_RISK_RANKING.md`
- `/Users/davidking/dev/ont/docs/research/ONT_ADVERSARIAL_ANALYSIS.md`
- `/Users/davidking/dev/ont/docs/research/ONT_CONTEST_WINDOW_PHILOSOPHY.md`
- `/Users/davidking/dev/ont/docs/research/archive/OPEN_COLLIDER_FLAT_NAMESPACE_EXPLORATION.md`
- `/Users/davidking/dev/ont/docs/research/archive/ONT_SCALING_EXPLORATIONS.md`
- `/Users/davidking/dev/ont/packages/core/src/research/batch-rail.ts`
- `/Users/davidking/dev/ont/packages/protocol/src/constants.ts`
