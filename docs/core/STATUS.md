# ONT — canonical status & numbers

**This is the single source of truth for "what's real today" and the key numbers.**
If the README, one-pager, design brief, or the website disagree with this file, **this file
wins** — fix the others. (It exists because those numbers drifted apart once; don't let them again.)

Last updated: 2026-06-06.

## Status legend
- **Live (signet)** — runs end-to-end on the private signet today.
- **Prototype** — built + unit-tested, but **not wired into the canonical live path**.
- **Designed** — specified, not yet built.

## Components

| Component | Status | Notes |
| --- | --- | --- |
| Owner-key model (transfer / value record / recovery) | **Live (signet)** | Enforced at replay; byte-identical across the engine + mobile crypto. |
| Contested-auction bonded bid | **Live (signet)** | Bid → resolver-accepted on signet. Proof bundle now enforces **highest-bid-wins** + **distinct-bid** well-formedness (was a gap). Set-*completeness* vs L1 still needs the light-client path — see Known-incomplete. |
| Bitcoin-inclusion verifier (Merkle + PoW) | **Prototype** | The verifier exists and is tested vs a real mainnet block, but **producers don't emit the `bitcoinInclusion` section**, so the light-client path is **not closed end-to-end**. |
| Accumulator cheap-rail (batch claims + fail-closed DA) | **Prototype** | Built + tested (incl. convergence vs a withholding adversary); **not wired into the live indexer/resolver** — so the one-path cheap claim is not yet the canonical path. |
| Publisher (cheap-rail batch anchor) | **Prototype** | Single-writer; pay-first; Lightning stubbed on signet (Lexe is mainnet-only). |
| Discovery (resolver/publisher) | **Designed** | Config-seeded today; registry-free on-chain scan designed, not built. |
| Mobile iOS app | **Prototype (signet demo)** | Feature-complete walkable demo; demo-mode default-on; mainnet host placeholder. Not release-ready. |
| Web explainer (opennametags.org) | **Live** | Marketing/docs + read tooling. |
| Bare-claim site (claim.opennametags.org) | **Live (signet)** | 12-word phrase + verified quote + stub-payment claim. |

## Key numbers

| Number | Value | Status |
| --- | --- | --- |
| Claim gate (every name) | **₿1,000** (~$1), sunk, to miners | baseline |
| Publisher service fee | thin markup over the gate (**TBD**; ₿200 in the signet demo is a placeholder, likely too high) | placeholder |
| Contested-auction min bond | **₿50,000** (~$50), returnable | placeholder |
| Bond maturity | ~52,560 blocks (~1 yr) | placeholder / test override |
| Notice window | **6 blocks (test); target = weeks** | placeholder · fairness lever, **not frozen** |
| OP_RETURN event size | **up to ~171 bytes** (recover-owner; most events smaller) | measured (above the 80-byte default policy; relies on modern node policy) |
| On-chain footprint (issuance) | **~0.015–0.019 vB/name** amortized @ ~10k/batch | measured |

## What the "frozen core" does and does NOT determine (honest boundary)

The CI-locked **three consensus files** (`@ont/consensus`) are the audited trust surface, and they
determine **owner-key authority and replay validation** (transfers, value records, recovery). But:

- **Auction settlement → ownership currently lives OUTSIDE the frozen core** (experimental
  indexer code). `applyAuctionBid` only validates/records a bid; deciding the winner-becomes-owner
  is not yet inside the audited boundary.
- So we do **not** claim "the three frozen files alone determine all ownership." Open decision:
  move settlement into the frozen boundary, or keep this scoped statement. (Tracked as A3.)

## Known-incomplete (disclosed, on the roadmap)
- Cheap-rail not wired into the live indexer → the one-path claim is architecture, not yet canonical.
- Light-client inclusion proofs not emitted end-to-end → "verify against Bitcoin" is the verifier's
  capability, not yet the live app/resolver path.
- **Auction-transcript completeness is not self-certified by the proof bundle.** The bundle now
  enforces that the winner is the highest *listed* accepted bid and that the bid set is well-formed
  (distinct txids, no duplicate-stuffing). It does **not** prove the listed set is the *complete* set of
  L1 bids — a producer that omits a genuinely higher bid still passes structural verification.
  Set-completeness vs. Bitcoin can only be closed by independently enumerating the auction's L1 bid
  transactions, which is the same `bitcoinInclusion` light-client work above.
- Launch parameters above are **placeholders** and must be frozen before launch — until then,
  user-facing copy should not call the rules "frozen."
