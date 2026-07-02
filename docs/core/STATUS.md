# ONT — canonical status & numbers

**This is the single source of truth for "what's real today" and the key numbers.**
If the README, one-pager, design brief, or the website disagree with this file, **this file
wins** — fix the others. (It exists because those numbers drifted apart once; don't let them again.)

Last updated: 2026-06-29.

## Where the project is (2026-06-26)

ONT was rebuilt from canon under clean-build (#46) — a blank-page rewrite of all software, with the
old code quarantined. That rewrite is **feature-complete and green, but hermetic**: the full suite is
**1,415 passing / 12 skipped / 0 failing** (sweep 2026-06-26), all over in-memory ports and regtest.
**Nothing is on a live network** — the old signet stack was decommissioned 2026-06-11 (notice below)
and the new stack is deploy-ready (infra-as-code) but not yet stood up.

`main` is at `d884f959`. Phase ledger, all merged to `main`:

| Phase | What it delivered | State |
| --- | --- | --- |
| **B1–B5** | wire (`@ont/wire`) → audited kernel (`@ont/consensus`) → evidence (`@ont/evidence`) → pure adapters (`@ont/adapter-*`) → surfaces (`apps/*`) | feature-complete, hermetic |
| **go-live G1** | live bitcoind RPC behind the ports + a regtest end-to-end claim loop (assemble → sign → broadcast → mine → ingest → serve → render), chain-gated against mainnet | green on regtest |
| **go-live G2** | restart-safe persistence: durable confirmed-anchor read path survives a process restart (file store) | green, hermetic |
| **go-live G3** | clean deploy stack: Docker/compose + VPS runbook + signet bitcoind boot + non-signing publisher write service + a fail-closed write-smoke recipe | infra-as-code ready; not deployed |
| **live-enforcement** (LE-INDEX + LE-RESOLVE) | the audited enforcement runs over *ingested* anchors and writes per-name state, and the resolver serves that enforced state + the evidence trace — **proven in the hermetic e2e; the indexer daemon (`main.ts`) does not yet wire the live enforcement selectors** (A1b) | green in e2e; daemon not wired |

**Still ahead:** LE-DA-SERVE (the network DA transport), LE-INVOKE / LE-CONTESTED (recovery + contested→L1
live wiring), G4 (point the web + mobile surfaces at deployed endpoints and walk the story on a live
signet), and — once ratified — the bootstrap-operator launch gates (see the last section). A live
deployment is hard-gated behind an **external audit** before any mainnet (clean-build (#46) ruled call 6;
signet may proceed without it).

## DECOMMISSION NOTICE — 2026-06-11

**The live signet deployment is decommissioned.** Per clean-build (#46)
(Item 6, *nothing is precious*, and ruled call 5 — see
[SOFTWARE_CANON.md](./SOFTWARE_CANON.md)), every signet-live component —
claim site, explorer/read tooling, publisher, indexer/resolver — comes down
at B1 start and stays down until the new stack earns deployment through its
own phase gates. There is no parity obligation to the old stack and no
planned restart of the old code. The old code is quarantined
readable-not-running; mining it for vectors and documenting tests is the
only sanctioned use. This is the announced decommission event that ruled
call 5 requires; the DNS/hosting teardown is executed by DK with this entry
as the record.

## QUARANTINE NOTICE — 2026-06-17

DK ratified `wire-codec-consolidation` option C with quarantine-now timing.
The carried-over pre-W16 cluster is now outside the active npm workspace under
`legacy/`: `apps/publisher`, `apps/indexer`, `apps/resolver`,
`packages/core`, `packages/architect`, and the duplicate
`@ont/protocol` wire codec/tests. The active event codec is `@ont/wire`;
`@ont/consensus` decodes OP_RETURN events through that package. `@ont/protocol`
remains active for clean off-chain/signature helpers and auction bid packages;
its auction lot/bidder commitments now use W16 full-width 32-byte renderings.
(The clean-build `apps/publisher`, `apps/indexer`, `apps/resolver` are the
*rebuilt* B5 surfaces; the quarantined originals live under `legacy/`.)

## What the audited kernel decides (honest boundary)

The pure, audited ownership kernel is **`@ont/consensus`** (SOFTWARE_CANON layer 2). It owns **every
rule that can change who owns a name**: anchor acceptance, data-availability eligibility, gate-fee
validation, transcript completeness, batched-path lifecycle, **auction settlement (winner-becomes-owner)**,
bond continuity + maturity, transfer authority, recovery authority, value-record authority, and winner
selection. It is deterministic and replayable — ordered event bytes + prior kernel state + witnessed
chain facts + witnessed evidence in; name-state + verdicts out. No database, network, wall clock, UI,
adapter judgment, or evidence-layer override may enter a verdict (`packages/consensus/PURPOSE.md`).

- The B3 orchestrator **`@ont/claim-path`** (`enforceBatchedClaim` / `enforceContestedBatch` / recovery)
  only **sequences** the audited predicates and fails closed in a fixed precedence; it adds no new law
  and returns a **verdict + name-state delta, never a bare mutation**.
- The B4 **`@ont/adapter-*`** packages witness facts (recompute-don't-trust) and feed the kernel;
  live-enforcement wires them into the app shells.

**This supersedes the pre-rewrite statement that "auction settlement lives outside the audited core."**
In the clean-build, settlement-into-core (#42) is **born-in**: settlement is a kernel rule
(`packages/consensus/src/auction-resolution.ts`), tested as a pure predicate. What remains is *proving it
over a live adversarial chain*, not moving it inside.

## Status legend
- **Built (hermetic)** — implemented + unit/conformance-tested over in-memory ports / regtest; **not**
  on a live network.
- **Wired (hermetic)** — composed into the live app shells and proven by an end-to-end hermetic/regtest
  test; not deployed.
- **Designed** — specified, not yet built.
- **Decommissioned (2026-06-11)** — the OLD signet stack; taken down at clean-build B1 start, kept as
  mining reference only.

## Components (clean-build)

| Component | Status | Notes |
| --- | --- | --- |
| Audited ownership kernel (`@ont/consensus`) | **Built (hermetic)** | Decides all ownership-changing rules incl. auction settlement, DA eligibility, gate-fee, completeness, transfer/recovery/value authority, winner selection. Pure + replayable. |
| Wire codec (`@ont/wire`) | **Built (hermetic)** | Event registry + frame + Schnorr digests; size envelope pinned ≤184 B (max-name AuctionBid); conformance-locked across engine/web/mobile/claim-site. |
| Evidence layer (`@ont/evidence`) | **Built (hermetic)** | Builds inclusion / canonical-root / availability / completeness witnesses; non-deciding (a hostile data source cannot move a verdict). |
| Batched-claim enforcement (`@ont/claim-path`) | **Built (hermetic)** | `enforceBatchedClaim` + contested-auction / gate-fee / recovery enforcers; fail-closed precedence; verdict + delta out. |
| Pure adapters (`@ont/adapter-{header,indexer,da,publisher,resolver}`) | **Built (hermetic)** | Witness-minting seams the live shells consume; recompute-don't-trust. |
| Live enforcement loop (LE-INDEX + LE-RESOLVE) | **Proven in e2e; daemon not wired** | `enforceBatchedClaim` runs over ingested anchors → per-name `@ont/name-state-store` and the resolver serves the enforced state + trace (stamped not-ownership-authority) **in the hermetic e2e**. The indexer daemon (`apps/indexer/src/main.ts`) has **no live enforcement selector** — `EnforceBatchedClaimsDeps` (`batchMaterial`/`nameStateStore`/`policy`, `enforce-batched-claims.ts:39-44`) is unwired, so a live daemon writes no names yet (A1b; guard the null-`batchMaterial` silent-skip). Not on a live network. |
| Live Bitcoin wiring + regtest e2e (`@ont/node-live`, `@ont/regtest-e2e`) | **Wired (hermetic)** | bitcoind RPC behind the ports; full claim loop green on regtest; `ONT_CHAIN` gate refuses mainnet. |
| Durable read path (`@ont/anchor-store`) | **Wired (hermetic)** | Restart-safe confirmed-anchor read across indexer→resolver→web (file store; no resolver→indexer edge). Postgres deferred. |
| Clean deploy stack (Docker/compose + runbook + signet bitcoind + non-signing publisher) | **Designed → infra-as-code ready** | Boots; the write-smoke recipe fails closed. VPS stand-up + funded-signet smoke is an operator (DK) action. See [../operate/G3_CLEAN_SLATE_VPS.md](../operate/G3_CLEAN_SLATE_VPS.md). |
| Surfaces (`apps/{web,claim,wallet,cli,resolver,indexer,publisher}`) | **Built (hermetic)** | Rebuilt under the B5 import-boundary gate (consume published `@ont/*`, reimplement no rules; signing lives only in `apps/wallet`). Not yet pointed at a live deployment (G4). |
| Publisher payment / onboarding | **Designed** | Provider-neutral operator path (publisher-onboarding-neutrality (#88)); payment-intake / signing / broadcast adapters + setup recipes not built. Real Lightning still stubbed. See [../operate/PUBLISHER_ONBOARDING.md](../operate/PUBLISHER_ONBOARDING.md). |
| Discovery (resolver / publisher) | **Designed** | Config-seeded; registry-free on-chain scan designed, not built. |
| Light-client inclusion (Merkle + PoW verifier) | **Built (verifier); not wired end-to-end** | Verifier tested vs a real mainnet block, but producers don't emit `bitcoinInclusion` and clients don't yet require `verifyProofBundleAgainstBitcoin` against an independent header source — see Known-incomplete + da-trust-model (#82). |
| Mobile iOS app | **Prototype (signet demo)** | Feature-complete walkable demo; not rebuilt under clean-build; mainnet host placeholder. Not release-ready. |
| Web explainer (opennametags.org) | **Live (static)** | Marketing/docs static pages may stay up (DK hosting call); the explorer/read tooling is down with the old resolver. |
| Old signet stack (claim site / explorer / publisher / indexer / resolver) | **Decommissioned (2026-06-11)** | See notice above; quarantined under `legacy/`. |
| Unified wallet secret (12 words everywhere) | **Conformance-locked** | The same 12-word phrase derives identical keys across the engine, web tools, mobile app, and claim site — locked by shared conformance vectors. |

## Key numbers

| Number | Value | Status |
| --- | --- | --- |
| Claim gate (every name) | **₿1,000** (~$1), sunk, to miners | baseline |
| Publisher service fee | thin markup over the gate (**TBD**; ₿200 in the signet demo is a placeholder, likely too high) | placeholder |
| Contested-auction min bond | **₿50,000** (~$50), returnable | placeholder |
| Short-name opening bond (≤4 chars, **mandatory bond-first** — no cheap-claim path) | **₿100,000,000** (≈1 BTC) at 1 char, halving per char; 5+ chars use gate + contention | working baseline (`@ont/protocol` bond curve, clamped to ≤4 chars) |
| Bond maturity | ~52,560 blocks (~1 yr) | placeholder / test override |
| Notice window | **6 blocks (test); target = weeks** | placeholder · fairness lever, **not frozen** |
| OP_RETURN event size | **up to 184 bytes exactly** (max-name AuctionBid; RecoverOwner 171B; RootAnchor 73B) | test-pinned in `@ont/wire`. **RootAnchor** (only carrier live today) relays on the pinned Core v28.1 defaults (75B script ≤ the 83-byte `-datacarriersize` limit). The larger carriers (Transfer 138B, RecoverOwner 174B, AuctionBid 187B scripts) **exceed** v28.1 default data-carrier policy and relay only under a raised operator `-datacarriersize` or Core **v30+** defaults — this binds when LE-INVOKE ships, not now. See relay-target (#94). |
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

## Known-incomplete (disclosed, on the roadmap)

- **Light-client inclusion is the sharpest open item.** The Merkle + PoW verifier exists and is tested
  against a real mainnet block, but producers don't emit `bitcoinInclusion` end-to-end and launch
  clients don't yet enforce `verifyProofBundleAgainstBitcoin` against an independent canonical
  best-chain header source — so "verify against Bitcoin" is the verifier's *capability*, not yet the
  live app/resolver path. da-trust-model (#82) makes closing this a **hard launch gate** (RC-1 of the
  ratified bootstrap-operator launch mode (#89)). The header-source mechanism is decided:
  **bundled-checkpoint headers + proof-of-work-validate-forward** by default, own-node opt-in, mobile in
  scope. Until the gate is closed (mobile included), a client trusts the resolver it queries for
  liveness, though never for ownership once it lands.
- **DA fail-closed enforcement: built + wired hermetically, not yet proven on a live chain.** *(Was
  "design + simulation only.")* The window algebra is ratified — da-windows (#49) (one clock, inclusive
  boundaries, `K ≥ W + C`), availability-height (#84) (`firstServableHeight = h`), batch-completeness
  (#83) — and the predicate is built in the kernel and runs in the live loop (LE-INDEX) over a hermetic
  source: a withheld or absent batch fails closed and mutates no name-state; late material does not
  revive cheap-path priority. The separate `AvailabilityMarker` event (0x0d) is retired
  (marker-fold (#47)); all deadlines key off the anchor's mined height. **Remaining:** the network DA
  transport (LE-DA-SERVE — publisher serves `/da/{root}`, indexer fetches), and proving the
  withhold-then-reveal defense over a real adversarial chain. Window *values* stay launch-freeze
  placeholders.
- **Aggregate gate-fee enforcement: built + wired hermetically.** *(Was "designed, not implemented.")*
  The rule that a batch anchor counts only if its Bitcoin tx fee is **≥ Σ per-name gates** (what stops
  the ₿1,000 being batched away) is a kernel predicate (the F\* family) exercised by the live loop via
  the indexer's gate-fee seam. "Miners receive ₿1,000 × N" is now enforced in the rewrite, not just
  design intent — pending live-chain proof.
- **Auction-transcript set-completeness vs L1 still needs the light-client path.** The kernel enforces
  that the winner is the highest *listed* accepted bid and that the bid set is well-formed (distinct
  txids, no duplicate-stuffing). It does **not** prove the listed set is the *complete* set of L1 bids —
  a producer that omits a genuinely higher bid still passes structural verification. Closing it requires
  independently enumerating the auction's L1 bid transactions: the same `bitcoinInclusion` light-client
  work above.
- **Launch parameters above are placeholders** and must be frozen before launch — until then,
  user-facing copy must not call the rules "frozen."

## Launch mode — bootstrap-operator (#89, RATIFIED)

The launch posture is an **auditable single-operator launch mode with mandatory verification and a
written decentralization ladder** — bootstrap-operator (#89), **ratified** (DK, 2026-06-29; paper
[`../research/BOOTSTRAP_OPERATOR.md`](../research/BOOTSTRAP_OPERATOR.md)). It adds **no new consensus
law**; it rests on the already-ratified da-trust-model (#82), batch-completeness (#83), and
availability-height (#84). One honest operator runs indexer + resolver + publisher + archive; all
name-state derives deterministically from Bitcoin + a public, content-addressed archive; the worst a
bad operator can do is go down or censor — never forge or steal.

Its five must-ship gates are the go-live work-list:

- **G-A** — light-client gate enforced end-to-end (RC-1; the Known-incomplete item above). Header source:
  **bundled-checkpoint + PoW-validate-forward** default, own-node opt-in, mobile in scope (ratified).
- **G-B** — a re-derive-from-scratch verifier (CLI / replay + fixtures + documented mirror/archive format).
- **G-C** — portable, content-addressed archive export + portable receipts/material/proofs + deterministic
  mirror instructions + **≥1 operator-funded public archive** (RC-2). DK committed to hosting the archive
  + funding signet; portability (users not locked to that archive) stays a build obligation.
- **G-D** — the DA-deadline conformance battery (bare anchor / missing material / late material / valid
  in-window) green as tests.
- **G-E** — non-authoritative product copy: ONT secures the string; verification/discovery is not
  authoritative (RC-5).

Decentralization beyond the launch operator is a written ladder (verifiable → replicated →
permissionless availability → permissionless discovery), each rung removing one trust assumption against
a measurable trigger. Full detail in the decision paper
([`../research/BOOTSTRAP_OPERATOR.md`](../research/BOOTSTRAP_OPERATOR.md)).
