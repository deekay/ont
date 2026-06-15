# settlement-bond-continuity (#56) — the denial-loop residual

> **Normativity: `analysis`** — the cost model + residual analysis behind
> **settlement-bond-continuity (#56)** (DK ruled no-owner, event 9b0c380a,
> 2026-06-14). The *rule* lives in [`../core/DECISIONS.md`](../core/DECISIONS.md)
> #56; this paper names the residual so it is not buried. Drafted by ChatLunatique
> (adversarial guardrail lane), formalized by ClaudeleLunatique.

## The ruling, encoded

If the winning bond is spent before settlement, do **not** promote the runner-up;
the consequence is **no owner** and reopen. Reasons:

- The runner-up may no longer have a valid bond or expect to be bound after losing.
- Runner-up-wins creates stale-bid / collusion surfaces.
- No-owner is simpler and avoids assigning ownership to a bidder whose current bond
  continuity is unknown.

This is still not a full grief solution. It converts the failure into **paid
denial**: win, break the winning bond before settlement, force no-owner/reopen,
repeat.

## Proposed PR-23 rule text

> **Settlement-bond continuity.** A winning bid materializes ownership only if its
> winning bond remains unspent from the bid's confirmation through the settlement
> evaluation point. If that bond is spent before settlement, the auction
> materializes no owner; no runner-up is promoted. The name reopens under a
> release-height rule keyed to the canonical-chain height of the breaking spend. A
> losing bid whose bond is spent before settlement is removed from future
> auction-state effects after the spend is observed; it cannot continue to set
> increment bases or soft-close effects. A successor bond is valid only if it
> satisfies the named value, script, vout, and same-transaction binding rules.
> Same-height breaking observations are ordered by same-block-order (#55). Post-cancel
> recovery bond custody must restore a valid owner-controlled live bond or the kernel
> treats bond continuity as broken.

Open wording to coordinate at formalization:

- Whole-auction no-owner applies even if another still-valid losing bid exists
  (DK's ruling implies yes).
- Loser-side spends remove prior increment/soft-close effects **prospectively** after
  the spend is witnessed; accepted-bid effects before the spend remain part of the
  transcript unless the bid was invalid when it affected state.

## The denial loop

1. Attacker bids enough to win a name.
2. Before settlement, attacker spends the winning bond.
3. B2 refuses to materialize ownership; no runner-up is promoted.
4. Name reopens.
5. Attacker repeats.

This does not steal the name and does not hand it to a colluding runner-up. It can
still **delay** ownership if the attacker's per-loop cost is low enough.

## Cost per loop

Let `B` = locked bond, `F_bid`/`F_break`/`F_reopen` = miner fees, `T_lock` =
blocks bid→break, `r` = capital opportunity rate, `Δ` = margin over next-best:

```text
cost_loop ~= F_bid + F_break + F_reopen + opportunity_cost(B, T_lock, r) + Δ_risk
```

The bond *principal* is recovered when the attacker spends it, so the real cost is
fees + temporary capital lock + the risk of being outbid or unable to exit.

- Short `T_lock` + low fees → denial may be cheap for wealthy attackers.
- Long settlement/finality depth + substantial required bids → denial becomes
  capital-expensive even though principal is not burned.
- The attack is **observable**: every loop leaves the winning bid + breaking spend
  on-chain.

## Why runner-up-wins is still worse

- The runner-up may have spent its bond after losing or no longer be economically bound.
- Winner + runner-up can collude: winner overbids to suppress the market, then breaks,
  handing the name to the runner-up at stale/below-market terms.
- The kernel must walk the bid list for a still-valid runner-up, then handle a stale
  runner-up — cascading complexity.

No-owner keeps the failure local: if winning-bond continuity breaks, nobody gets the
name from that auction generation.

## Mitigation options

| Mitigation | Benefit | Cost / concern | Recommendation |
| --- | --- | --- | --- |
| Accept residual, no extra mechanism | Simplest; preserves no-owner; all loops observable + costly. | Does not stop a wealthy denial attacker. | **Baseline for B2** unless modeling shows a cheap loop. |
| Cooldown before reopen | Raises time cost of repeated denial. | Punishes honest users; can subsidize the attacker by freezing the name. Prior attrition analysis was skeptical of cooldowns. | Not default. Launch/external-review option. |
| Higher reopen floor after pre-settlement break | Raises capital for repeated attack. | Parameter complexity; may price out honest users after an attack. | Only if cost model shows low loop cost. |
| Failed-winner exclusion next generation | Targets repeat attacker. | Weak identity — evade with new keys/funding. Complexity for little value. | Not recommended as consensus rule. |
| Burn/slash broken winning bond | Strong deterrent. | Not covenant-enforceable on current Bitcoin once the bond is a normal spendable UTXO. | Not available for v1. |
| Runner-up-wins | Avoids no-owner denial in some cases. | Stale-bond/collusion/cascade risk. | **Rejected by DK.** |

## Recommended ratification language (folded into #56)

> This rule prevents stale runner-up ownership and collusive runner-up handoff. It
> does not make pre-settlement bond-break denial impossible: a bidder can still pay
> fees and temporarily lock capital to win, break continuity, and force a reopen.
> That denial loop is observable and bounded by the auction's bid/finality
> economics. B2 accepts the residual unless launch-parameter modeling or external
> review shows the loop is too cheap, in which case a later named decision may add a
> reopen cooldown or higher reopen floor.

## Minimum vectors

- Winner bond unspent through settlement → owner materializes.
- Winner bond spent before settlement → no owner; no runner-up promotion.
- Runner-up remains bonded but winner broke → still no owner.
- Runner-up bond spent after losing → no owner, no stale runner-up assignment.
- Loser bond spent before settlement → bid has no future increment/extension effects after the spend.
- Same-height multiple bond-break observations → same-block-order (#55) chooses the canonical release fact.
- Reopen auction id matches release height from the canonical breaking spend.
- Reorg removes the breaking spend → release/reopen fact re-derives (PR-9 / PR-24).
- Recovery cancel bond custody → valid cancel restores/maintains owner-controlled live bond; invalid custody = continuity break.
