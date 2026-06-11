# ONT Contest Grief Cost Model

> **SUPERSEDED (2026-06-11):** completed analysis — its conclusions are decisions
> in [`docs/core/DECISIONS.md`](../../core/DECISIONS.md) (contested-auction entries).
> Kept for provenance per doc-canon (#45).

Context: Mat asked what it would cost an adversary to keep ONT from scaling by pushing the namespace above the critical contested-claim rate.

> **Status (updated 2026-06-09).** The original version of this model analyzed the
> pre-`#37` rule, where a second cheap claim escalated a name into a direct-L1
> auction, and concluded ONT was brittle to dust-cost mass contesting. That
> analysis directly motivated **Decision #37 (bond opens the auction)** and is
> preserved below as the historical case. This revision models the post-#37
> world: the blockspace attack is closed, and the residual cheap attack is
> **mass nullification** — a denial attack, not a scaling attack.

## Short Answer (post-#37)

Under Decision #37, a bare cheap collision can never open an L1 auction. Two or
more in-window claims with **no qualifying bond** nullify the name (it reopens
for claiming); an auction exists only if someone posts a bond at the
`AUCTION_BOND_FLOOR_SATS = 50,000` floor.

That changes the two damage modes:

1. **Blockspace grief is no longer dust-cost.** L1 auction traffic now scales
   with *bonded* contests, not contests. Forcing one auction costs the attacker
   at least a `₿50,000` returnable bond plus fees — a ~50× capital increase
   over the old `₿1,000` trigger, with the deterrent shifting from sunk spend
   to BTC-time (carry on locked capital).
2. **The dust-cost attack that remains is denial, not escalation.** For
   `₿1,000` per claim, an attacker can still *collide* an honest claim so it
   nullifies instead of finalizing. The victim never loses the name to the
   attacker, but they don't get it cheaply either.

The pre-#37 conclusion — "a few BTC of gate spend can blow the blockspace
budget" — **no longer holds**. The residual nullification-attrition game
(below) damages adoption and UX rather than Bitcoin; it is now modeled in
`ONT_NULLIFICATION_ATTRITION_MODEL.md` (equilibrium: one collision → bond →
over; the exit is cheaper than the attack at every window phase).

## Attack Classes (post-#37)

### 1. Mass-Nullification Denial (the residual dust-cost attack)

The attacker submits a colliding cheap claim during the notice window of many
honest claims, and never bonds.

Outcome per name: nullified at window close, reopens for claiming. No auction,
no L1 bid traffic, no transfer of ownership.

Cost: `₿1,000` per collision (sunk to miners, same as any claim).

The attrition loop:

```text
victim claims (₿1,000) → attacker collides (₿1,000) → nullified, reopens
→ victim re-claims (₿1,000) → attacker re-collides (₿1,000) → ...
```

Properties worth modeling explicitly:

- **Money-symmetric, outcome-asymmetric.** Each round costs both sides
  `₿1,000`, but the attacker only needs the name to *stay nullified*, while
  the victim needs one full uncollided notice window. Every collision restarts
  the victim's clock; during the launch era that clock is 90 days.
- **The exit is the bond.** A victim can end the game by posting a `₿50,000`
  returnable bond (the attacker, who wants nothing, will not outbid). So the
  practical cost of being targeted is bond capital locked for the bond period
  plus auction UX — see "defense affordability" below.
- **At scale it is an adoption attack.** A hostile incumbent colliding claims
  broadly (`10 BTC` per million collisions per round) makes the cheap rail
  feel unreliable for everyone unwilling to bond. Bitcoin is untouched; the
  damage is entirely product/perception.

Candidate mitigations to evaluate (none adopted):

- escalating second-claim gate under high collision load (objective,
  mechanical — not name curation);
- a cooldown on re-claiming a nullified name, to slow the loop without
  changing who can win;
- wallet UX that makes "you were collided; here is the bond path and what it
  actually costs" a calm, first-class flow rather than an emergency;
- sponsorship/proxy-bonding so a targeted small claimant can borrow defense
  capital — **rejected (Decision #43)**: no protocol incentive exists for
  sponsors, no one can promise to out-escalate a genuine bidder, and a
  winning sponsor bond is a year-locked loan backing someone else's name.
  Defense capital is a credit relationship arranged *outside* the protocol;
  third-party bonding stays permissionless but unassisted. The protocol's
  own grief defense: one qualifying bond ends the denial loop.

### 2. Bonded Blockspace Grief (the old attack, repriced)

To create L1 auction traffic the attacker must now post a qualifying bond per
name. The capital model that the original version of this doc proposed as a
*fix* is now the *current rule*, so its cost table applies directly:

| Challenge bond | BTC locked per `1M` forced auctions | 5% annual carry |
| ---: | ---: | ---: |
| `50k sats` (current floor) | `500 BTC` | `25 BTC/year` |
| `100k sats` | `1,000 BTC` | `50 BTC/year` |
| `500k sats` | `5,000 BTC` | `250 BTC/year` |

Because bonds are returnable, a very large adversary's true cost is carry plus
fees, not principal. Two standing caveats from the original analysis remain
true and important:

- ONT bonds are plain owner-controlled payment UTXOs enforced by ONT validity
  rules, **not** Bitcoin-script-locked or slashable coins. True slashing would
  require a different script/custody design.
- A whale's cost to contest any single name is carry on ~`$50` — the floor
  deters *mass* griefing via aggregate capital lock, not *targeted* contests.
  Targeted deterrence comes from auction dynamics (being outbid), not the floor.

### 3. Win-To-Deny (unchanged)

The attacker wins auctions, holds names through the bond period, then walks or
reopens/re-wins. Expensive for broad namespace griefing (bids + fees + locked
capital), relevant for targeted high-value names. Unchanged by #37.

## Blockspace Budget Tables (reinterpreted)

The critical-rate tables below were computed for the pre-#37 model but remain
valid with one substitution: read **contest rate** as **bonded-contest rate**
(the fraction of claims that proceed to an actual bonded L1 auction). The
difference is who pays to reach the threshold: previously `₿1,000` sunk per
contest; now ≥ `₿50,000` bonded per contest plus the auction's own bid fees.

Bitcoin capacity assumption:

```text
20_year_bitcoin_vbytes = 1,000,000 vB/block * 144 blocks/day * 365.25 days/year * 20
                       = 1.05192T vB
direct_auction_vbytes ~= 500 + 300 * bid_count
```

Maximum bonded-contest rate compatible with a `1%` twenty-year blockspace
budget:

| Claims over 20y | `20` bids | `50` bids | `100` bids |
| ---: | ---: | ---: | ---: |
| `100M` | `1.62%` | `0.68%` | `0.34%` |
| `1B` | `0.162%` | `0.068%` | `0.034%` |
| `8B` | `0.020%` | `0.0085%` | `0.0043%` |

Absolute bonded-auction counts inside the `1%` budget: about `1.62M` (20-bid),
`679k` (50-bid), `345k` (100-bid). Attacker capital to *manufacture* that many
auctions at the current floor: roughly `810 BTC`, `340 BTC`, `172 BTC` locked
respectively — versus `16 BTC`, `7 BTC`, `3.5 BTC` *sunk* under the pre-#37
rule. That repricing, not the tables themselves, is what closed Mat's
brittleness concern.

Two consequences for the 20-year blockspace forecast:

- the point estimate falls (only bonded contests generate auction traffic), and
- the variance falls more (the heavy tail of "adversarially manufactured
  contests" now requires heavy capital).

The forecast exchange in the dev channel (2026-06-01) predates this and should
be read with the bonded-contest substitution.

## Design Implications — status after #37

| Original implication | Status |
| --- | --- |
| A second `₿1,000` claim must not force durable L1 escalation | **Adopted** — Decision #37 |
| Valid contest requires real economic weight (bond/opening bid) | **Adopted** — Decision #37, incl. bond-first |
| Bond objective and mechanical, no name curation | **Adopted** — single floor, length-keyed floors only |
| Model BTC-time as the deterrent for returnable bonds | Holds; carry table above |
| Consider non-refundable fees or script-level slashing if carry is insufficient | **Open** — revisit with external review |
| Escalating challenge floor under high load | **Open** — now applies to the *second-claim gate* (nullification load), not the challenge bond |
| Distinguish "cheap objection observed" from "economically valid contest" | **Adopted** — collision nullifies; bond contests |

## Bottom Line

Mat's brittleness concern was correct for the rule that existed when he asked,
and it is the analysis that produced Decision #37. Post-#37:

- dust-cost spend can no longer buy blockspace damage — the scaling attack is
  closed;
- dust-cost spend can still buy **denial**: `₿1,000`/round to keep any
  specific cheap claim from finalizing, escaped only by bonding `₿50,000`;
- the attrition game is modeled (`ONT_NULLIFICATION_ATTRITION_MODEL.md`):
  cooldown rejected, escalating gate deferred to external review, tooling
  rejected by Decision #43, v1 posture = bond exit + `collided` UX. Still
  open: the slashing question for very large bonded adversaries.

## Sources

- `../core/DECISIONS.md` #37 (bond opens the auction; bare collision nullifies)
- `../design/ONT_RISK_REGISTER.md` R9, R16
- `../design/ONT_ACQUISITION_STATE_MACHINE.md` (contested auction + nullification)
- `../design/ONT_MEV_ORDERING_ANALYSIS.md` §D1, §D3
- `./ONT_ADVERSARIAL_RISK_RANKING.md`
- `./ONT_ADVERSARIAL_ANALYSIS.md`
- `./ONT_CONTEST_WINDOW_PHILOSOPHY.md`
- `../../packages/protocol/src/constants.ts` (`CLAIM_GATE_SATS`, `AUCTION_BOND_FLOOR_SATS`)
- Historical: `./archive/OPEN_COLLIDER_FLAT_NAMESPACE_EXPLORATION.md`, `./archive/ONT_SCALING_EXPLORATIONS.md`
