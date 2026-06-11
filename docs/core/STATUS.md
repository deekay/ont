# ONT — canonical status & numbers

**This is the single source of truth for "what's real today" and the key numbers.**
If the README, one-pager, design brief, or the website disagree with this file, **this file
wins** — fix the others. (It exists because those numbers drifted apart once; don't let them again.)

Last updated: 2026-06-10.

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
| Batched claim path (batch claims) | **Live (signet)** | **End-to-end since 2026-06-09**: claim → publisher anchors on-chain → indexer decodes the anchor → fetches the batch leaves from the publisher (`/da/{root}`) → re-verifies every membership proof against the Bitcoin-anchored root → name resolves and shows in the public explorer. A lying data source can't mint ownership (verify-don't-trust), and a loop integration test pins the publisher-bytes→indexer-decode boundary. **Still open:** availability-marker / fail-closed deadline enforcement is design+simulation only (see Known-incomplete); transport is publisher-served v1 (content-addressed mirroring is the design direction). |
| Publisher (batched-path batch anchor) | **Live (signet, single-writer)** | Pay-first; real signet anchor broadcast; data-availability bundles survive restart (rebuilt on snapshot replay). Lightning stubbed on signet (Lexe is mainnet-only); leaderless multi-publisher is simulated, not deployed. |
| Discovery (resolver/publisher) | **Designed** | Config-seeded today; registry-free on-chain scan designed, not built. |
| Mobile iOS app | **Prototype (signet demo)** | Feature-complete walkable demo; demo-mode default-on; mainnet host placeholder. Not release-ready. |
| Web explainer (opennametags.org) | **Live** | Marketing/docs + read tooling. |
| Claim site (claim.opennametags.org) | **Live (signet)** | 12-word phrase (one wallet, many names; gap-scan restore from the words alone) + verified quote + stub-payment claim; self-contained page runs offline for key generation. |
| Unified wallet secret (12 words everywhere) | **Live** | The same 12-word phrase (masterSeed = first 32 bytes of the BIP-39 seed, owner keys m/696969'/0'/i') derives identical keys on the claim site, the web tools, and the mobile app — locked by shared conformance vectors all four implementations test against (engine, web, mobile, and — since 2026-06-10 — the claim site via `apps/claim/src/keys.conformance.test.ts`). |

## Key numbers

| Number | Value | Status |
| --- | --- | --- |
| Claim gate (every name) | **₿1,000** (~$1), sunk, to miners | baseline |
| Publisher service fee | thin markup over the gate (**TBD**; ₿200 in the signet demo is a placeholder, likely too high) | placeholder |
| Contested-auction min bond | **₿50,000** (~$50), returnable | placeholder |
| Short-name opening bond (≤4 chars, **mandatory bond-first** — no cheap-claim path) | **₿100,000,000** (≈1 BTC) at 1 char, halving per char; 5+ chars use gate + contention | working baseline (`@ont/protocol` bond curve, clamped to ≤4 chars) |
| Bond maturity | ~52,560 blocks (~1 yr) | placeholder / test override |
| Notice window | **6 blocks (test); target = weeks** | placeholder · fairness lever, **not frozen** |
| OP_RETURN event size | **up to 171 bytes exactly** (recover-owner; most events smaller) | test-pinned (`packages/protocol/src/wire-size.test.ts`); above the 80-byte default policy; relies on modern node policy |
| On-chain footprint (issuance) | **~0.015–0.019 vB/name** amortized @ ~10k/batch | measured |

## Launch parameters (auction + notice mechanics)

Consolidated 2026-06-11 from the parameter review packet and window schedule (normative home
now [`../spec/AUCTION.md`](../spec/AUCTION.md)). These extend Key numbers above (claim gate,
min bond, short-name bond curve, bond maturity, notice window) — like them, **every value here
is a placeholder / working default, not a frozen launch constant**: the mechanism shape is the
design choice, the numbers are calibration.

| Parameter | Current default | Status |
| --- | --- | --- |
| Name grammar | `[a-z0-9]{1,32}`, case-insensitive input, lowercase canonical | working baseline |
| Opening-bid floor | higher of the length price (₿100,000,000 at 1 char, halving per char) and the ₿50,000 long-name minimum (lengths 12–32) | placeholder (curve per Key numbers) |
| Base auction window | **1,008 blocks (~7 days)** | placeholder; launch-era recommendation: 30 days, decaying to 7 days by height schedule |
| Soft-close window / extension | **144 blocks (~1 day)**; a bid inside the final 144 blocks moves close to bid block + 144 | placeholder |
| Hard cap on extensions | none | current lean (mechanism choice, not a number) |
| Minimum raise (normal) | max(₿1,000, **5%**) | placeholder |
| Minimum raise (soft close) | max(₿1,000, **10%**) | placeholder |
| Winner bond maturity model | fixed **52,560 blocks (~1 yr)**; epoch-halving helper is prototype residue to remove or quarantine | placeholder (value per Key numbers) |
| Notice-window decay schedule | height-keyed recommendation: **90d → 60d → 30d → 14d → 7d** over ~18 months; adaptivity extend-only, never market-shrunk | recommendation, **not frozen** (live test value per Key numbers) |
| Early bond break / reauction | name released; anyone can reopen; reauction anchored to release block; floor resets to length floor; no cooldown | placeholder |
| Destination record max payload | **65,535 bytes** | placeholder |
| Destination record types at launch | Bitcoin payment target, HTTPS target, profile/destination bundle, raw/app-defined | under review |

## What the audited core does and does NOT determine (honest boundary)

The CI-locked **three consensus files** (`@ont/consensus`) are the audited trust surface, and they
determine **owner-key authority and replay validation** (transfers, value records, recovery). But:

- **Auction settlement → ownership currently lives OUTSIDE the audited core** (experimental
  indexer code). `applyAuctionBid` only validates/records a bid; deciding the winner-becomes-owner
  is not yet inside the audited boundary.
- So we do **not** claim "the three frozen files alone determine all ownership" — yet. **Decided
  (Decision #42, resolves A3): settlement moves inside the frozen boundary**, gated on its
  correctness being demonstrated to the core's standard. Until that lands, this scoped statement
  stays and user-facing copy must not claim the frozen files decide auctions.

## Known-incomplete (disclosed, on the roadmap)
- **Aggregate gate-fee enforcement: designed, not implemented (found 2026-06-10).** The rule
  that a batch anchor counts only if its Bitcoin tx fee is **≥ Σ per-name gates** (what stops
  the ₿1,000 being batched away) exists in the design docs and in code comments only — there
  is **no validation** in the consensus/indexer replay path, and the live signet publisher
  broadcasts anchors with a flat configured fee independent of batch size. Until implemented,
  "miners receive ₿1,000 × N" is design intent, not enforced behavior. Queued for the audited
  boundary alongside the Decision #42 settlement move; the overclaiming comments in
  `apps/publisher` are corrected as of this date.
- **data-availability enforcement gap (the sharpest open item):** the batched claim path's *fail-closed availability
  deadline* is not live. The `AvailabilityMarker` event (0x0d) is wire-defined and tested but never
  emitted or checked in production, and the data-availability windows are enforced only in the research
  simulations. Today's live loop is: anchors verified on-chain, batch bytes fetched and re-verified
  against the anchored root, missing bytes simply retried (with backoff) — fine for an honest
  single publisher on signet, but the *withhold-then-reveal* defense for contested names depends on
  the deadline rule, which must be implemented (or the marker folded into the anchor — open design
  question) before the batched claim path's adversarial story is operational.
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
