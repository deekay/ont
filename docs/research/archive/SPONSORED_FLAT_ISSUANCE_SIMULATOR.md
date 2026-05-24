# Sponsored Flat Issuance Simulator

This simulator explores a possible scale path where mature bonded names earn
issuance credits that can sponsor flat names without creating one new UTXO per
name.

It is an order-of-magnitude model, not a protocol commitment.

## Model

Direct bonded names remain the strongest primitive. In year one there are no
mature sponsors yet, so every name that wants global flat ownership must use the
standard auction / bond path. After a bond matures, the holder can keep the bond
live to earn sponsor credits.

This creates a bootstrapping sequence:

1. year one: direct bonded auctions only
2. after the first maturity cliff: mature active bonds begin earning sponsor
   credits
3. later years: sponsors can issue long-tail flat names without one new UTXO per
   name, while contested names still escalate to auction / bond settlement

Sponsored flat issuance then works like:

1. sponsor proposes `name -> owner_key`
2. recipient accepts
3. sponsor spends issuance credits
4. name enters challenge window
5. uncontested names finalize without a new UTXO
6. contested names escalate to standard auction / bond settlement

Already-finalized sponsored names do not depend on the sponsor keeping its bond
live. Sponsor bond status affects future issuance power only.

## Parameters

| Parameter | Meaning |
| --- | --- |
| `directBondedNamesPerYear` | New standard bonded names per year. |
| `averageDirectBondBtc` | Average BTC locked by each direct bonded name. |
| `sponsorMaturityYears` | Cliff before a bond can earn sponsor credits. |
| `sponsorBondRetentionRate` | Share of mature sponsor BTC kept live each year. |
| `baseCreditsPerBtcYear` | Clean issuance-credit rate before age multiplier. |
| `ageMultiplierExponent` | Superlinear long-held-bond bonus. |
| `ageMultiplierCap` | Maximum long-held-bond multiplier. |
| `creditCarryoverRate` | How much unused credit survives to the next year. |
| `cleanClaimCreditCost` | Credit cost for an uncontested sponsored claim. |
| `contestedClaimCreditCost` | Credit cost for a contested sponsored claim. |
| `contestRate` | Share of sponsored claims where someone posts the required UTXO-backed contest / auction-opening bond. |
| `invalidChallengeRate` | Invalid or malformed challenge attempts per sponsored claim. This measures resolver/indexer workload; it does not route names to auction. |
| `unfairDiscoveryRiskRate` | Share of finalized sponsored names treated as weak-public-notice or no-challenge-confidence risk. |
| `transferableInventoryRate` | Share of finalized sponsored names that could become transferable inventory and should be tracked for market/concentration risk. |
| `topSponsorCreditShare` | Share of sponsor credit capacity controlled by the largest sponsor or sponsor cluster. |
| `maxContestedAuctionSettlementsPerYear` | Annual bonded-settlement cap for contested claims. |

The last four fields are adversarial risk hooks. They do not change issuance
counts by themselves; they expose how many names or events would sit inside a
given risk bucket under an assumed attack model.

## Run

```sh
npm run dev:cli -- simulate-sponsored-issuance fixtures/scaling/sponsored-flat-middle.json
```

Write JSON output:

```sh
npm run dev:cli -- simulate-sponsored-issuance fixtures/scaling/sponsored-flat-middle.json --write /tmp/ont-sponsored-middle.json
```

## Baseline Fixtures

| Fixture | 8B names | 80B names | Year 10 total | Year 30 total | Final contested backlog | Peak immature bonded names |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `sponsored-flat-conservative.json` | year `8` | year `16` | `25.4B` | `266B` | `2.62B` | `2.85M` |
| `sponsored-flat-middle.json` | year `4` | year `9` | `117B` | `513B` | `5.10B` | `3.10M` |
| `sponsored-flat-high-contest.json` | year `7` | year `18` | `25.4B` | `206B` | `22.8B` | `3.10M` |
| `sponsored-flat-strong.json` | year `3` | year `5` | `1.05T` | `5.01T` | `50.4B` | `6.00M` |
| `sponsored-flat-adversarial.json` | year `6` | year `13` | `49.1B` | `392B` | `20.6B` | `3.10M` |

The important read is not that any fixture is correct. It is that the model can
now show which knob is doing the work:

- clean credits drive long-tail scale
- contested penalties slow spammy issuance
- contested-auction caps expose Bitcoin-settlement bottlenecks
- age multipliers reward long-held active bonds
- retention controls whether sponsor power depends on ongoing capital commitment
- adversarial hooks show how much apparent scale is exposed to unfair-discovery,
  invalid-challenge, transfer-inventory, or concentration risk

## Next Cases To Add

- no age bonus
- credit expiration versus hoarding
- low challenge cost / malicious challenger
- high sponsor concentration
- low direct-root throughput
- different contested settlement caps
- per-sponsor caps or sublinear sponsor-score curves
