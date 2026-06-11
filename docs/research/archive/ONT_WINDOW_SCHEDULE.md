# ONT Window Schedule Recommendation

> **SUPERSEDED (2026-06-11):** absorbed into [`docs/spec/AUCTION.md`](../../spec/AUCTION.md) and the parameter table in [`docs/core/STATUS.md`](../../core/STATUS.md)
> per doc-canon (#45). Kept for provenance; this copy is no longer updated.


Context: how to think about long windows — whether auctions should run 30+ days, and whether windows should shorten over time by block height or by market characteristics.

## Distinguish Two Windows

ONT has two different clocks:

1. **Notice / contest window:** after a cheap claim anchors, before it finalizes. Its job is social fairness: give the world enough time to notice and contest a claim.
2. **Auction bidding window:** after a claim is contested and escalates. Its job is price discovery among people who already know the name is disputed.

These should not automatically be the same length.

## Recommendation

Make the **launch notice window** long. The revised recommendation is: start at `90 days`, not `30 days`, if ONT wants the notice window to be an active recruiting period where specific provisional claims can be surfaced to potentially interested owners.

Do not automatically make every **auction bidding window** `30+ days`. If the notice window was already long, then a `7-14 day` auction with a robust soft close may be sufficient later. During the launch era, a global `30-day` auction window for any contested name is defensible because early participants may still need time to get comfortable moving self-custodied bitcoin.

The launch threat is "nobody noticed the claim," so the notice window is the primary defense. Once a contest exists, the relevant people have already noticed; the auction window mainly needs enough time for funding, bid preparation, and cold-storage movement.

Avoid manual curation. "Launch head" should be treated as a descriptive market phenomenon, not a protocol category. If the protocol distinguishes names at all, it should only use objective syntax such as character length, and even that should be used cautiously because length is a crude scarcity proxy. The cleanest protocol schedule is global by block height: any claim anchored in the launch era gets the launch notice window, regardless of semantic value.

## Decay Rule

Use a frozen, monotonic, height-keyed schedule. Do not let market-derived system characteristics shrink windows.

Unsafe shrink signals:

- total value bonded
- number of bidders
- number of distinct keys
- claim volume
- contest volume
- number of whales or "active market participants"

Reason: at launch, the adversary can create or distort these signals. A whale can split keys, bond capital, create activity, and make the system appear mature before it is broadly observed.

If adaptive behavior exists at all, it should be **extend-only**:

```text
window(claim) = max(height_keyed_floor(anchor_height), adaptive_extension(...))
```

An adversary can then only make windows longer, which is the safe direction.

## Concrete Schedule To Model

Candidate notice window:

| Phase | Blocks | Approx Time | Notice Window |
| --- | ---: | ---: | ---: |
| Phase 0 | `0-13,000` | first ~90 days | `90 days` |
| Phase 1 | `13,001-26,000` | ~3-6 months | `60 days` |
| Phase 2 | `26,001-52,500` | ~6-12 months | `30 days` |
| Phase 3 | `52,501-78,750` | ~12-18 months | `14 days` |
| Steady state | `78,751+` | after ~18 months | `7 days` |

This is still conservative at launch but reaches steady state quickly enough to create product momentum. A slower alternative is to reach `7 days` at ~2 years (`105,000` blocks), but the previous ~4-year path is likely too sluggish for adoption.

## Provisional Utility

A `90-day` notice window is only viable if the product gives users useful, honest intermediate states. The user should not experience launch as "pay now, nothing happens for three months."

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

Payment / high-value flows should treat provisional and quiet names differently from final names. For example, a wallet can show a warning before paying to a provisional name, while allowing low-stakes profile, messaging, or test usage.

An optional "fast finality" path could let a claimant voluntarily force their own name into auction or a higher-assurance path, but this should be an escape hatch rather than the default. It should not create a privileged route that defeats the public notice period for everyone else.

Candidate auction window:

| Phase | Auction Window | Soft Close |
| --- | ---: | ---: |
| Any auction started in first ~6 months | `30 days` | `48-72 hours` |
| Any auction started in months ~6-18 | `14 days` | `24-48 hours` |
| Steady state | `7 days` | `24 hours` |

Open ascending auctions should avoid a hard extension cap unless the cap is paired with sealed settlement or another anti-sniping rule. If open ascending auctions are retained, late increments should be materially stronger than normal increments.

## Bottom Line

Choose long launch **notice** windows because they defend legitimacy and create time for active outreach. Make the launch schedule global by block height rather than manually curating scarce names. Decay to steady state in roughly `18-24 months`, not `4-5 years`, because ONT still needs visible momentum and a tolerable utility path. Be more careful about long **auction** windows because they increase attention cost, grief surface, and capital lock uncertainty, but a `30-day` early-launch auction window is reasonable.

Reduce windows by passage of block height only. Use system characteristics for dashboards and human analysis, or for extend-only safety, not automatic shortening.

The product answer to `90 days is frustrating` is progressive confidence, not pretending the name is final. A launch user should feel "I have a public pending claim with priority, and everyone can see it," not "I have nothing until day 90."

## Sources

- `/Users/davidking/dev/ont/docs/research/ONT_CONTEST_WINDOW_PHILOSOPHY.md`
- `/Users/davidking/dev/ont/docs/launch/CONTESTED_AUCTION_REFERENCE.md`
- `/Users/davidking/dev/ont/docs/design/ONT_ACQUISITION_STATE_MACHINE.md`
- `./ONT_ADVERSARIAL_RISK_RANKING.md`
- `(contest-rate benchmark note — internal, available on request)`
