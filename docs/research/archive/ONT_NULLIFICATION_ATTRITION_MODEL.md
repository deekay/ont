# ONT Nullification-Attrition Model

> **SUPERSEDED (2026-06-11):** completed analysis — its conclusions are decisions
> in [`docs/core/DECISIONS.md`](../../core/DECISIONS.md) (nullification entries).
> Kept for provenance per doc-canon (#45).

Context: the top-ranked open area in `ONT_OPEN_ANALYSIS_AREAS_2026_06_09.md`.
Decision #37 closed the dust-cost blockspace attack but left a dust-cost
*denial* attack: collide a cheap claim (`₿1,000`, never bond) so it nullifies
at window close and the victim's notice window restarts.
`ONT_CONTEST_GRIEF_COST_MODEL.md` describes the attack; this note models the
game, prices it across the window schedule, evaluates the candidate
mitigations, and reports what the parameter levers do — per Decision #43,
parameters are the one lever left on the defense asymmetry.

Status: analysis with a recommendation; no protocol change adopted here.

## 1. The game

Players: a **claimant** who wants name `n` finalized through the cheap rail,
and a **denier** whose payoff is only that the claimant doesn't get it (spite,
extortion leverage, or incumbent sabotage — the denier never profits from the
name itself; an attacker who *wants* the name is a bidder, not a denier, and
belongs to the win-to-deny class).

Per round (length = notice window `W`):

1. Claimant claims: `₿1,000` sunk (gate to miners).
2. Denier collides any time before window close: `₿1,000` sunk. Rational
   deniers collide late — it costs nothing extra and skips rounds where the
   claimant has already given up.
3. Window closes: ≥2 claims, no bond → **nullified**, name reopens. Next round.

Either player can instead post a **qualifying bond** (`₿50,000` floor,
returnable) at any point, which opens the L1 auction: largest bond wins,
winner's bond becomes the live name bond, locked to maturity
(`~52,560` blocks ≈ 1 year).

Structural facts that shape everything below:

- **Money-symmetric per round, outcome-asymmetric.** Both sides sink `₿1,000`
  per round, but the denier needs *every* window collided; the claimant needs
  *one* clean window. One missed round and the claimant owns the name
  permanently.
- **Attention is cheap.** Claims are public during notice (that is the point
  of notice), so targeting is trivial, and collision can be automated. Assume
  both sides are bots; the game is purely economic.
- **The bond ends it.** A denier, by definition, will not post and escalate
  bonds (that is win-to-deny, priced separately and expensive). So the
  claimant's bond is checkmate: the auction opens, nobody outbids, the
  claimant wins at the floor.

## 2. Equilibrium

Compare the claimant's two strategies after the first collision:

**Persist** (re-claim every round): `₿1,000` sunk per `W`, unbounded rounds,
no name until the denier quits — and a rational denier facing a persisting
claimant has no reason to quit, since their cost is identical and their
objective (keep it nullified) is satisfied every round.

**Bond**: `₿50,000` returnable locked ~1 year, plus the auction's own tx fees,
plus the gates already sunk. At 5%/yr opportunity cost, the *economic* cost of
the lock is ~`₿2,500`/year — the principal comes back.

Annualized, in economic terms (sunk spend vs carry on returnable capital):

| Notice window `W` | Denier's sunk cost per name-year | Claimant's bond-exit carry per year |
| ---: | ---: | ---: |
| 90 days (launch) | `₿4,056` | `₿2,500` |
| 60 days | `₿6,088` | `₿2,500` |
| 30 days | `₿12,175` | `₿2,500` |
| 14 days | `₿26,089` | `₿2,500` |
| 7 days (steady state) | `₿52,179` | `₿2,500` |

**The exit is cheaper than the attack at every phase of the window schedule.**
Even at launch windows, denying a bonded-capable claimant for a year costs the
denier more in sunk gates than the claimant pays in carry. At steady state the
denier's annual sunk cost (`₿52k`) exceeds the bond *principal* — they burn
the price of the exit every year, forever, to deny one name.

So the rational equilibrium is short: **collide once → claimant bonds →
denier stops** (or never starts). Persisting through the cheap loop is only
rational for a claimant who *cannot access* `₿50,000` (~$50) of bondable
capital. The attrition game does not create a new economic asymmetry; it
isolates the existing one — **defense is a capital-access problem, not a cost
problem** — which is exactly the asymmetry Decision #43 accepts and
documents. The numbers here are the honest disclosure: the protocol's grief
defense costs ~$50 locked for a year and ~$2.50 in carry; whoever cannot
produce that can be denied (not robbed) for ~$4/year at launch windows,
~$52/year at steady state.

**Extortion is non-viable.** A denier demanding payment to stop colliding is
selling relief priced above `₿2,500`/yr carry + hassle (the victim's exit
cost) while paying `₿4k–52k`/yr to maintain the threat. The rational victim
bonds; the rational extortionist knows it and doesn't start.

**Mass denial is expensive and self-defeating.** Colliding `1M` claims at
launch windows costs ~`40.6 BTC`/year, sunk, forever. The visible response —
victims bonding — costs the ecosystem a one-time returnable aggregate lock
(`500 BTC` per `1M` at the current floor, `25 BTC`/yr carry) the attacker
cannot contest, while the collision pattern itself is loud, attributable-ish,
and an advertisement that names are worth defending. Bitcoin blockspace is
untouched either way (nullifications are cheap-rail events).

## 3. The reopen-snipe branch

After nullification the name reopens *to anyone* — including the denier. A
denier who claims first at reopen changes the game: now the original claimant
must collide (becoming the denier in form) or bond. If the original claimant
stops colliding, the attacker **finalizes and owns the name for ₿1,000** —
which is no longer denial but acquisition, and the original claimant's remedy
during the attacker's window is the same bond (or bond-first, since bonds
don't require a prior cheap claim).

This branch does not change the equilibrium — the bond still decides — but it
matters for two reasons:

- it makes "just wait the griefer out" worse advice than it looks, because a
  lapsed *victim* loses the name where a lapsed *denier* merely fails;
- it breaks the symmetry argument for any mitigation keyed to claim *order*
  (see escalating gate, below): the protocol cannot tell victim from attacker
  by who claimed first, and must not try (neutrality).

## 4. Candidate mitigations, evaluated

### Re-claim cooldown — REJECT

A cooldown `C` on re-claiming a nullified name stretches the round from `W`
to `W + C`. Both sides' per-round cost is unchanged, so the denier's
*annualized* cost falls by `W/(W+C)` while the claimant waits longer for the
name. A cooldown is a subsidy to the attacker and a tax on the victim's
calendar. It also adds a frozen-core rule for no equilibrium change.

### Escalating second-claim gate — DO NOT ADOPT for v1; raise in external review

The only variant that survives inspection is **per-name, history-keyed, with
decay**: any claim on a name with `k` recent nullifications pays
`gate × 2^k` (objective, mechanical, no curation). Variants that don't
survive:

- *keyed to claim order* (second claimant pays more): the reopen-snipe
  inverts it — the attacker claims first at reopen and the *victim* pays the
  escalated gate;
- *global load-keyed*: punishes organic claim rushes (launch day) and gives a
  mass attacker a lever over everyone else's costs.

What the surviving variant buys: both sides' round cost doubles each round,
so the cheap war is bounded at `log2(B/g) ≈ 5.6` rounds — cumulative spend
crosses the bond floor around round 6 and the game funnels to the auction,
where denial is expensive (win-to-deny). What it costs: the *persisting
victim* pays the same escalation (money-symmetry is preserved, which is also
why it's neutral); and self-colliding twice (`₿2,000` + escalated gates)
temporarily poisons a name's gate for everyone, so the decay parameter is
load-bearing and is one more number to freeze, justify, and audit.

Since the unmitigated equilibrium already collapses to the bond after one
round for any bonded-capable claimant, the gate only improves outcomes for
capital-excluded claimants *who can nonetheless afford geometrically
escalating gates* — a thin slice. Not worth a frozen-core rule on current
evidence; worth listing in the external-review asks alongside
marker-into-anchor, since reviewers may weigh the launch era differently.

### Do nothing in protocol; ship the exit well — ADOPT (v1 posture)

The defense that exists is the bond, and the numbers above show it dominates.
What v1 owes users is not a new mechanism but an honest, calm product
surface for it (already specified in `ONT_WINDOW_SCHEDULE.md`): the
`collided` state says *nobody can take your name without bonding*, shows the
bond path with real costs (`~$50 locked ~1 year, returnable; ~$2.50 carry`),
and offers the cheap re-claim and alternate-name flows. Wallet copy should
state plainly that a collision is an attack that costs the attacker more than
it costs you to end.

## 5. Parameter levers (per Decision #43)

- **Notice window `W`** is the denial-price dial: the height-keyed decay
  schedule raises the attacker's annual cost ~13× from launch (`₿4k`/name-yr)
  to steady state (`₿52k`/name-yr) with no rule change. Launch is the cheap
  era for deniers — which is also the era of maximum watchtower attention
  (whales-as-watchtowers posture) and the era when extend-only adaptive
  windows are available if collision load is real.
- **Bond floor `B`** is the defense-price dial, and this model sharpens its
  trade-off: `B`'s *targeted*-deterrence job was always nominal (a whale's
  cost is carry on ~$50 either way; real deterrence is being outbid), while
  `B` as *defense price* binds on exactly the capital-excluded users the
  denial attack works against. A lower floor (e.g. `₿10,000–25,000`) cuts the
  defense barrier 2–5× and weakens only the *mass*-grief aggregate lock
  (`500 BTC` → `100–250 BTC` per `1M` manufactured auctions) — a job the
  carry numbers say it does weakly anyway. When launch parameters are frozen,
  the floor should be picked primarily as a defense price, not a deterrent.
- **Gate `g`** moves both sides equally; not a lever on this game.

## 6. Bottom line

- The attrition game has a short rational equilibrium: one collision, one
  bond, over. The denier pays more per year than the defender at every window
  phase — sunk vs returnable-plus-carry.
- The residual exposure is precisely Decision #43's accepted asymmetry:
  people who cannot lock ~$50 can be denied (never robbed) for `₿4k`/yr at
  launch windows. No candidate mechanism fixes that for the affected
  population without new edges: the cooldown subsidizes the attacker, and
  the escalating gate helps only a thin slice while adding frozen-core
  complexity and a poisoning surface.
- Recommended v1 posture: **no new protocol mechanism**; ship the `collided`
  UX and the honest numbers; put the per-name escalating gate (with decay) on
  the external-review ask list; and when freezing launch parameters, price
  the bond floor as the *defense price* it actually is.

## Sources

- `../core/DECISIONS.md` #37, #42, #43
- `./ONT_CONTEST_GRIEF_COST_MODEL.md` (attack classes, carry tables)
- `./ONT_OPEN_ANALYSIS_AREAS_2026_06_09.md` (areas 1–2)
- `../design/ONT_ACQUISITION_STATE_MACHINE.md` (nullification, bond-first,
  largest-bond-wins, residual spite-griefer note)
- `../launch/ONT_WINDOW_SCHEDULE.md` (height-keyed schedule, `collided` state)
- `../../packages/protocol/src/constants.ts` (`CLAIM_GATE_SATS = 1,000`,
  `AUCTION_BOND_FLOOR_SATS = 50,000`, `BOND_MATURITY_BLOCKS ≈ 52,560`)
