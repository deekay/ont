# ONT Auction Mechanism

> Consolidated 2026-06-11 per doc-canon (#45) from `launch/AUCTION_PLACEHOLDERS_AND_MECHANISM_CHOICES.md`, `launch/ONT_WINDOW_SCHEDULE.md`, and the normative parts of `launch/ONT_PARAMETER_REVIEW_PACKET.md` (now archived).

This is the normative mechanism document for the contested-name auction path:
the design choices an implementer must honor, the current parameter defaults
(all placeholders), and the recommended window schedule. The deeper rationale
reference is [`CONTESTED_AUCTION_REFERENCE.md`](./CONTESTED_AUCTION_REFERENCE.md)
(its own doc — read it for why the auction replaced reserved lists and the full
escalation rule). The acquisition model is defined in
[`ONT_ACQUISITION_STATE_MACHINE.md`](./ONT_ACQUISITION_STATE_MACHINE.md); the
launch narrative is [`../LAUNCH.md`](../LAUNCH.md). Current parameter values
and their placeholder status are tracked in
[`../core/STATUS.md`](../core/STATUS.md), the single source of truth.

Amounts use ₿ where **₿1 = 1 satoshi** (so ₿1,000 ≈ $1, and ₿100,000,000 =
1 BTC).

## Mechanism Choices vs Placeholder Numbers

Two things can easily get blurred together and must be kept separate:

- the **mechanism family** we are leaning toward — real design choices
- the **temporary numbers** we are using to test it — calibration placeholders

> The mechanism family is meaningful; the exact numbers are calibration
> placeholders.

If a reviewer says "this window should probably be shorter," "that opening
floor looks too low," or "this settlement duration seems too blunt," that is
useful calibration feedback, but it does not undermine the basic mechanism
choice itself. The auction *shape* is what should be reviewed now; the exact
numbers exist to make the shape concrete and testable, and are not the launch
constants.

## Real Mechanism Choices (normative shape)

These are the things we currently mean as real design choices, even if they are
still technically provisional:

- contested names should be allocated by auction
- ONT should not use a semantic reserved-word list
- ONT should not use a pre-launch reservation system
- very short names should use the same auction rule, with scarcity handled by
  objective floors and increments rather than a separate wave
- auctions should have soft close rather than hard-end sniping
- bids that extend an auction during soft close should face a stronger minimum
  increment than ordinary mid-auction bids
- the current user-started launch story should not describe unopened names as
  failed auctions; a valid bonded opening bid is what creates the auction
- same-bidder rebids should replace earlier bids by spending the earlier bond
  outpoint
- winning bids should carry the eventual owner key
- the current working path is that a settled winner materializes directly into
  a live owned name (settlement details and validation: see
  [`../LAUNCH.md`](../LAUNCH.md) "Auction Settlement Becomes Ownership")

These are the choices reviewers should spend more time on.

## Placeholder Numbers (not frozen)

These are still temporary and should not be treated as frozen:

- exact opening-bond floors
- exact winner settlement duration
- exact auction window length
- whether to remove the legacy scheduled-catalog compatibility path entirely or
  keep it only as compatibility coverage
- exact absolute increment floor
- exact percentage increment floor
- exact soft-close increment strength
- exact soft-close response window
- whether short-name floors should be steeper than the current placeholder
  curve

These numbers exist so we can simulate, test, compare shapes, and reason
concretely. They are not final launch constants.

## Current Parameter Defaults (all placeholders)

The values below reflect the current prototype defaults, not final
recommendations. Each carries an open review question; none is frozen.

### Core Name Rules

| Parameter | Current default | Review question |
| --- | ---: | --- |
| Allowed characters | `a-z`, `0-9` | Should names allow hyphens, underscores, Unicode, emoji, or only lowercase alphanumeric characters? |
| Minimum length | `1` character | Should every valid length be open from launch? |
| Maximum length | `32` characters | Is `32` long enough for useful names? |
| Case handling | Lowercase canonical | Should ownership be case-insensitive? |

### Opening Bond Floors

The opening bid must meet the higher of two floors:

- Length price: starts at ₿100,000,000 (≈1 BTC) for a 1-character name and
  halves for each additional character.
- Long-name minimum: ₿50,000. Once the length price falls below this, the
  minimum applies.

| Name length | Opening floor |
| ---: | ---: |
| 1 | ₿100,000,000 |
| 2 | ₿50,000,000 |
| 3 | ₿25,000,000 |
| 4 | ₿12,500,000 |
| 5 | ₿6,250,000 |
| 6 | ₿3,125,000 |
| 7 | ₿1,562,500 |
| 8 | ₿781,250 |
| 9 | ₿390,625 |
| 10 | ₿195,312 |
| 11 | ₿97,656 |
| 12-32 | ₿50,000 |

Open review questions: is ₿100,000,000 the right starting floor for
one-character names; is the halving curve the right shape; is ₿50,000 the
right long-name floor; should reopened auctions reset to the length floor or
should the prior winning bond matter?

### Auction Timing

| Parameter | Current default | Approximate time |
| --- | ---: | ---: |
| Base auction window | `1,008` blocks | ~7 days |
| Soft-close window | `144` blocks | ~1 day |
| Soft-close extension rule | Bid inside the final `144` blocks moves close to bid block + `144` | ~1 day from late bid |
| Hard cap on extensions | None | N/A |

Open review questions: is ~7 days long enough for ordinary names without making
testing and capital lockup feel slow; is a ~1 day soft-close response window
enough; should there be no hard cap, or should auctions eventually be forced to
end? (See the launch-era window schedule below for the recommended longer
launch values.)

Open ascending auctions should avoid a hard extension cap unless the cap is
paired with sealed settlement or another anti-sniping rule. If open ascending
auctions are retained, late increments should be materially stronger than
normal increments.

### Bid Escalation

| Parameter | Current default |
| --- | ---: |
| Normal minimum raise | max(₿1,000, `5%`) |
| Soft-close minimum raise | max(₿1,000, `10%`) |

Current philosophy: avoid a hard extension cap; discourage close-griefing by
requiring meaningful late raises.

Open review questions: is `5%` right during normal bidding; is `10%` enough
during soft close; should the absolute raise floor be higher; should late-bid
escalation increase over repeated extensions?

### Winner Bond And Maturity

| Parameter | Current default | Approximate time |
| --- | ---: | ---: |
| Winner bond maturity period | `52,560` blocks | ~1 year |
| Bond continuity before maturity | Required | Until maturity |
| Transfer before maturity | Must move old bond and create a successor bond | N/A |
| Transfer after maturity | No successor bond required | N/A |
| Maturity reset on transfer | No | Original clock continues |

Open review questions: is ~1 year the right maturity period; should short or
high-value names have longer maturity; should maturity depend on final winning
bond, name length, or both; should pre-maturity transfers require extra buyer
protection?

**Prototype constant to resolve:** the auction path currently uses a fixed
`52,560` block winner-bond maturity period, but older maturity-helper code
still supports an experimental epoch-halving schedule. Before launch, the
protocol must choose one maturity model and remove or clearly quarantine the
other.

### Bond Breaks And Reauction

What happens if the winner moves or spends the bond before the maturity period
ends:

| Parameter | Current default |
| --- | --- |
| Bond continuity before maturity | Required |
| If bond continuity breaks early | Name is released |
| Who can reopen the name | Anyone |
| Reauction identity | Anchored to the release block |
| Reauction opening floor | Current length-based floor |
| Reauction cooldown | None |

Open review questions: should early bond break immediately release the name;
should there be a cooldown before reauction; should the prior owner be allowed
to rebid immediately; should the reauction floor reset to the length floor or
inherit the prior winning bond?

(The reauction lot-identity rule — `opening-{name}` vs
`reopen-{name}-after-{release_height}`, with the indexer recognizing a reopened
auction only if its anchor equals the latest recorded bond-break release block —
is described in [`../LAUNCH.md`](../LAUNCH.md) "Released-Name Reauction Path.")

## Window Schedule

How to think about long windows — whether auctions should run 30+ days, and
whether windows should shorten over time by block height or by market
characteristics.

### Distinguish Two Windows

ONT has two different clocks:

1. **Notice / contest window:** after a cheap claim anchors, before it
   finalizes. Its job is social fairness: give the world enough time to notice
   and contest a claim.
2. **Auction bidding window:** after a claim is contested and escalates. Its
   job is price discovery among people who already know the name is disputed.

These should not automatically be the same length.

### Recommendation

Make the **launch notice window** long: start at `90 days`, not `30 days`, if
ONT wants the notice window to be an active recruiting period where specific
provisional claims can be surfaced to potentially interested owners.

Do not automatically make every **auction bidding window** `30+ days`. If the
notice window was already long, then a `7-14 day` auction with a robust soft
close may be sufficient later. During the launch era, a global `30-day` auction
window for any contested name is defensible because early participants may
still need time to get comfortable moving self-custodied bitcoin.

The launch threat is "nobody noticed the claim," so the notice window is the
primary defense. Once a contest exists, the relevant people have already
noticed; the auction window mainly needs enough time for funding, bid
preparation, and cold-storage movement.

Avoid manual curation. "Launch head" should be treated as a descriptive market
phenomenon, not a protocol category. If the protocol distinguishes names at
all, it should only use objective syntax such as character length, and even
that should be used cautiously because length is a crude scarcity proxy. The
cleanest protocol schedule is global by block height: any claim anchored in the
launch era gets the launch notice window, regardless of semantic value.

### Decay Rule

Use a frozen, monotonic, height-keyed schedule. Do not let market-derived
system characteristics shrink windows.

Unsafe shrink signals:

- total value bonded
- number of bidders
- number of distinct keys
- claim volume
- contest volume
- number of whales or "active market participants"

Reason: at launch, the adversary can create or distort these signals. A whale
can split keys, bond capital, create activity, and make the system appear
mature before it is broadly observed.

If adaptive behavior exists at all, it should be **extend-only**:

```text
window(claim) = max(height_keyed_floor(anchor_height), adaptive_extension(...))
```

An adversary can then only make windows longer, which is the safe direction.

### Concrete Schedule To Model

Candidate notice window:

| Phase | Blocks | Approx Time | Notice Window |
| --- | ---: | ---: | ---: |
| Phase 0 | `0-13,000` | first ~90 days | `90 days` |
| Phase 1 | `13,001-26,000` | ~3-6 months | `60 days` |
| Phase 2 | `26,001-52,500` | ~6-12 months | `30 days` |
| Phase 3 | `52,501-78,750` | ~12-18 months | `14 days` |
| Steady state | `78,751+` | after ~18 months | `7 days` |

This is still conservative at launch but reaches steady state quickly enough to
create product momentum. A slower alternative is to reach `7 days` at ~2 years
(`105,000` blocks), but the previous ~4-year path is likely too sluggish for
adoption.

Candidate auction window:

| Phase | Auction Window | Soft Close |
| --- | ---: | ---: |
| Any auction started in first ~6 months | `30 days` | `48-72 hours` |
| Any auction started in months ~6-18 | `14 days` | `24-48 hours` |
| Steady state | `7 days` | `24 hours` |

### Provisional Utility

A `90-day` notice window is only viable if the product gives users useful,
honest intermediate states. The user should not experience launch as "pay now,
nothing happens for three months."

Recommended state language:

| State | Meaning | Product posture |
| --- | --- | --- |
| `provisional` | claim anchored, DA-valid, notice window open | user has public priority unless contested; can configure records, share with clear pending label |
| `quiet` | no contest after an early sub-window, e.g. `7-14 days` | higher confidence, still not final; suitable for social/profile use with warning |
| `final` | notice window closed uncontested | owned outright |
| `contested` | qualifying bond posted against the claim (Decision #37) | leaves cheap path, enters bonded auction |
| `collided` | competing cheap claim landed, no bond | cannot finalize; nullifies at window close and reopens unless someone bonds |

This lets ONT balance legitimacy and momentum:

- Protocol finality can remain `90 days` during launch.
- Product confidence can improve continuously.
- Watchers and outreach have the full window to find interested parties.
- Users still get a visible claim, priority, and practical use quickly.

Payment / high-value flows should treat provisional and quiet names differently
from final names. For example, a wallet can show a warning before paying to a
provisional name, while allowing low-stakes profile, messaging, or test usage.

An optional "fast finality" path could let a claimant voluntarily force their
own name into auction or a higher-assurance path, but this should be an escape
hatch rather than the default. It should not create a privileged route that
defeats the public notice period for everyone else.

### Window Schedule Bottom Line

Choose long launch **notice** windows because they defend legitimacy and create
time for active outreach. Make the launch schedule global by block height
rather than manually curating scarce names. Decay to steady state in roughly
`18-24 months`, not `4-5 years`, because ONT still needs visible momentum and a
tolerable utility path. Be more careful about long **auction** windows because
they increase attention cost, grief surface, and capital lock uncertainty, but
a `30-day` early-launch auction window is reasonable.

Reduce windows by passage of block height only. Use system characteristics for
dashboards and human analysis, or for extend-only safety, not automatic
shortening.

The product answer to "90 days is frustrating" is progressive confidence, not
pretending the name is final. A launch user should feel "I have a public
pending claim with priority, and everyone can see it," not "I have nothing
until day 90."

## Related Documents

- [`CONTESTED_AUCTION_REFERENCE.md`](./CONTESTED_AUCTION_REFERENCE.md) — the
  escalation rule, auction family rationale, and why auctions replaced reserved
  lists
- [`ONT_ACQUISITION_STATE_MACHINE.md`](./ONT_ACQUISITION_STATE_MACHINE.md) —
  the full acquisition model
- [`../LAUNCH.md`](../LAUNCH.md) — launch narrative, settlement-to-ownership
  shape, implementation status
- [`../core/STATUS.md`](../core/STATUS.md) — canonical current parameter values
  and placeholder status
- [`../research/archive/ONT_CONTEST_WINDOW_PHILOSOPHY.md`](../research/archive/ONT_CONTEST_WINDOW_PHILOSOPHY.md)
  and [`../research/archive/ONT_ADVERSARIAL_RISK_RANKING.md`](../research/archive/ONT_ADVERSARIAL_RISK_RANKING.md)
  — window-schedule inputs (a contest-rate benchmark note is internal,
  available on request)
- [`../research/archive/BITCOIN_REVIEW_CLOSURE_MATRIX.md`](../research/archive/BITCOIN_REVIEW_CLOSURE_MATRIX.md)
  — review-closure history
