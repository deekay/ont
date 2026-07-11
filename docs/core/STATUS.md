# ONT — canonical status & numbers

**This is the single source of truth for "what's real today" and the key numbers.**
If the README, one-pager, design brief, or the website disagree with this file, **this file
wins** — fix the others. (It exists because those numbers drifted apart once; don't let them again.)

Last updated: 2026-07-11.

## Where the project is (2026-07-11)

ONT was rebuilt from canon under clean-build (#46) — a blank-page rewrite of all software, with the
old code quarantined. The rebuild has strong local predicate coverage and several live-stack slices
now wired, but it is **not** a composed product state machine and is **not** mainnet-ready.

Current `main` is at `ccb390d3` (`Land reduceBlock §6 modeAt deltas — http-da declared-root
stall-only (Δ1-3) + #52/#11 short-name leaf-drop (Δ4)`). A full `npm test` on that snapshot
(2026-07-11, fresh checkout) reported **1,591 passing / 5 skipped / 0 failing**, exit 0. Since
`d3d34d35`, the reduceBlock §6 availability-mode fork was closed to the terminal set
`{mint, stall}` (the unsound off-chain `excluded → free` terminal was dropped, §7.5), and the
#52/#11 short-name leaf-drop landed (short names ride full-batch enforcement and are filtered only
from the write-set, never poisoning the batch).

The old public signet stack remains decommissioned (notice below). The current public
`opennametags.org` root is a static web surface; as of 2026-07-09, `/api/health`,
`/ont-private/api/health`, and `/ont-private/` returned 404. The clean stack is wired for controlled
private-signet integration, not a public durable deployment.

Phase ledger, all merged to `main`:

| Phase | What it delivered | State |
| --- | --- | --- |
| **B1–B5** | wire (`@ont/wire`) → consensus predicates (`@ont/consensus`) → evidence (`@ont/evidence`) → pure adapters (`@ont/adapter-*`) → surfaces (`apps/*`) | strong hermetic predicate/surface coverage; no composed product reducer yet |
| **go-live G1** | live bitcoind RPC behind the ports + a regtest end-to-end claim loop (assemble → sign → broadcast → mine → ingest → serve → render), chain-gated against mainnet | green on regtest |
| **go-live G2** | restart-safe persistence: durable confirmed-anchor read path survives a process restart (file store) | green, hermetic |
| **go-live G3 + private-signet 4b** | clean deploy stack plus private signet re-point: custom signet challenge, miner sidecar, self-mined mature funds, non-signing publisher, resolver/web health checks, and private-signet checkpoint override | wired for controlled private-signet demo; not public or independently operated |
| **G-A / G-C client verification** | resolver-served header ranges, resolver/esplora header providers, CLI/web/mobile verification cores, provider-trusted private-signet labels | wired enough for the private-signet demo; signet header authenticity remains provider-trusted |
| **G-B / LE-DA-SERVE** | publisher `/da/{root}` full-material record, `http-da` indexer mode, and two-operator hermetic e2e for fetch/recompute/fail-closed behavior | green hermetically; runtime root discovery and durable retry are follow-up |
| **live-enforcement** (LE-INDEX + LE-RESOLVE) | daemon-selected enforcement (`off` / `fixture-file` / `http-da`) runs over ingested anchors, writes accepted committed entries to `@ont/name-state-store`, and resolver serves enforced state + trace | wired; still a vertical slice, not the full acquisition lifecycle |

**Still ahead:** the reducer→sole-sink cutover (making the additive `reduceBlock` the single
authoritative name-state sink); LE-INVOKE / LE-CONTESTED
live wiring; runtime DA discovery/retry/durability; production claimant/publisher payment and
receipt paths; a clean two-node/private-signet exit demo with contention and reorg; and all
bootstrap-operator launch gates. A live deployment remains hard-gated behind an **external audit**
before any mainnet (clean-build (#46) ruled call 6; signet may proceed without it when honestly
labeled).

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

The pure, audited predicate layer is **`@ont/consensus`** (SOFTWARE_CANON layer 2). It contains the
rules and verdict functions that must decide ownership-affecting facts: data-availability
eligibility, gate-fee validation, batch completeness, auction bid/winner predicates, bond
continuity + maturity, transfer authority, recovery authority, value-record authority, and related
parameter checks. These predicates are pure and covered by the boundary manifest; no database,
network, wall clock, UI, adapter judgment, or evidence-layer override may enter a verdict
(`packages/consensus/PURPOSE.md`).

The missing piece is now **cutover, not existence.** A `reduceBlock` reducer exists and runs
**additively** (`packages/consensus/src/engine.ts`): it consumes verified block facts + verified
external evidence (the RootAnchor availability seam) + frozen parameters and emits authoritative
`OntState.names`. It is **not yet the sole authoritative sink** and does not yet cover the whole
acquisition lifecycle. Two name-state authorities run in parallel by design, and a guard
(`reduceblock-authority.test.ts`) fails loudly if any third sink appears — the two sanctioned sinks
are `engine.ts` (`OntState`) and the live `apps/indexer/src/enforce-batched-claims.ts` (`NameStateStore`).

- `packages/consensus/src/engine.ts` now applies `RootAnchor` through `reduceBlock` and mints
  **`accumulator-batched`** name-state, alongside its existing transfer / auction-bid provenance /
  recovery-owner / bond-continuity handling. **`bonded` and `auction` acquisition minting are
  deliberately deferred to the cutover** (locked by the N1 test), so the reducer cannot yet subsume
  the live authority.
- `packages/consensus/src/auction-resolution.ts` contains pure auction acceptance and winner-selection
  predicates, but those predicates are **still not composed by `engine.ts`** into auction lot settlement
  and name ownership.
- `@ont/claim-path` (`enforceBatchedClaim`) sequences verified batched-claim predicates and returns a
  verdict plus `{ anchoredRoot, firstServableHeight }`. The **live** indexer
  (`apps/indexer/src/enforce-batched-claims.ts`) is the second, currently-authoritative sink: it
  persists committed entries directly to `@ont/name-state-store` and serves the private-signet demo.
  Making the reducer the sole sink — retiring this direct writer — is a **DK-gated cutover**, not an
  additive slice.
- The B4 **`@ont/adapter-*`** packages witness facts (recompute-don't-trust) and feed the predicates;
  they must remain non-deciding.

## Status legend
- **Built (hermetic)** — implemented + unit/conformance-tested over in-memory ports / regtest; **not**
  on a live network.
- **Wired (hermetic)** — composed into the live app shells and proven by an end-to-end hermetic/regtest
  test; not deployed.
- **Wired (private-signet demo)** — wired into the clean deploy stack or client surfaces for the
  controlled private-signet environment; provider-trusted unless otherwise stated.
- **Designed** — specified, not yet built.
- **Decommissioned (2026-06-11)** — the OLD signet stack; taken down at clean-build B1 start, kept as
  mining reference only.

## Components (clean-build)

| Component | Status | Notes |
| --- | --- | --- |
| Audited predicate layer (`@ont/consensus`) | **Built (hermetic)** | Pure predicates for DA eligibility, gate-fee, batch completeness, auction bid/winner selection, transfer/recovery/value authority, bond continuity, and related verdicts. `engine.ts` now runs a `reduceBlock` reducer that applies `RootAnchor` and mints `accumulator-batched` name-state **additively**; `bonded`/`auction` minting and auction-settlement composition are cutover-deferred, and the reducer is **not yet the sole name-state sink** (see composition note above). |
| Wire codec (`@ont/wire`) | **Built (hermetic)** | Event registry + frame + Schnorr digests; size envelope pinned ≤184 B (max-name AuctionBid); conformance-locked across engine/web/mobile/claim-site. |
| Evidence layer (`@ont/evidence`) | **Built (hermetic)** | Builds inclusion / canonical-root / availability / completeness witnesses; non-deciding (a hostile data source cannot move a verdict). |
| Batched-claim enforcement (`@ont/claim-path`) | **Built (hermetic)** | `enforceBatchedClaim` sequences inclusion, gate-fee, availability, and completeness; fail-closed precedence; verdict + `{ anchoredRoot, firstServableHeight }` delta out. Contested distinct-owner / full acquisition lifecycle remains follow-up composition. |
| Pure adapters (`@ont/adapter-{header,indexer,da,publisher,resolver}`) | **Built (hermetic)** | Witness-minting seams the live shells consume; recompute-don't-trust. |
| Live enforcement loop (LE-INDEX + LE-RESOLVE) | **Wired (hermetic + private-signet demo)** | `selectIndexerRunnerDeps` now selects enforcement at daemon startup. Modes: `off` (default RootAnchor read path), `fixture-file`, and `http-da`. On accept, `apps/indexer/src/enforce-batched-claims.ts` writes all committed entries directly to `@ont/name-state-store`; resolver serves `/names/:name/state` with the trace. This direct write is a known second name-state authority in additive mode, cutover-gated until DK approves making the reducer the sole sink. |
| DA network transport (G-B / LE-DA-SERVE) | **Wired (hermetic)** | Publisher can serve full material at `GET /da/{root}`; indexer `ONT_ENFORCEMENT=http-da` prefetches declared `ONT_DA_ROOTS` at boot and runs the same `enforceBatchedClaim`; two-operator e2e proves good/tampered/withheld behavior. Runtime root discovery, retry queues, and archive reconciliation remain follow-up. |
| Live Bitcoin wiring + regtest/private-signet e2e (`@ont/node-live`, `@ont/regtest-e2e`) | **Wired (hermetic + private-signet demo)** | bitcoind RPC behind ports; `ONT_CHAIN` gate refuses mainnet. Compose now targets a private signet challenge with a miner sidecar and self-mined funding for the controlled demo. |
| Durable read path (`@ont/anchor-store`, `@ont/header-store`, `@ont/name-state-store`) | **Wired (hermetic + private-signet demo)** | Restart-safe confirmed-anchor, header-range, and enforced-name read paths over file stores; resolver reads fresh per request. Postgres deferred. |
| Clean deploy stack (Docker/compose + runbook + private signet + non-signing publisher) | **Wired (private-signet demo)** | Compose boots bitcoind with a custom signet challenge, miner sidecar, indexer/resolver/web/publisher, and provider-trusted private-signet checkpoint overrides. Not a public deployment; production image hardening remains open. See [../operate/G3_CLEAN_SLATE_VPS.md](../operate/G3_CLEAN_SLATE_VPS.md). |
| Surfaces (`apps/{web,claim,wallet,cli,resolver,indexer,publisher}`) | **Built / partially wired** | Rebuilt under the B5 import-boundary gate (consume published `@ont/*`, reimplement no rules; signing lives only in `apps/wallet`). CLI/web/mobile can run proof-bundle + header-range verification for the private-signet demo. Product assurance vocabulary is still binary-ish (`bitcoin-verified` / `resolver-mirror`) and needs the typed ladder. |
| Publisher payment / onboarding | **Designed** | Provider-neutral operator path (publisher-onboarding-neutrality (#88)); payment-intake / signing / broadcast adapters + setup recipes not built. Real Lightning still stubbed. See [../operate/PUBLISHER_ONBOARDING.md](../operate/PUBLISHER_ONBOARDING.md). |
| Discovery (resolver / publisher) | **Designed** | Config-seeded; registry-free on-chain scan designed, not built. |
| Light-client inclusion (Merkle + PoW verifier) | **Built and wired for private-signet demo** | Verifier tested vs a real mainnet block; resolver/header-provider paths now feed CLI/web/mobile. Private-signet header authenticity is provider-trusted (#95/#36); mainnet-grade independent best-chain verification and current-tip proofs remain launch gates. |
| Mobile iOS app | **Prototype / private-signet demo path** | Verification core and provider selection exist; mainnet host placeholder, `PUBLISHER_BASE = null`, and `DEMO_MODE_DEFAULT = true`. Not release-ready. |
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

- **Reducer→sole-sink cutover is the sharpest architecture gap.** A `reduceBlock` reducer now exists
  and applies `RootAnchor` additively, minting `accumulator-batched` name-state — but it is not yet the
  single authoritative sink and does not yet cover the whole lifecycle. Still owed for cutover:
  `bonded` + `auction` acquisition minting through the reducer (deferred by the N1 test); auction-lot
  settlement composed from `auction-resolution.ts`; reorg-symmetric replay across all paths; and
  retiring the live direct writer (`apps/indexer/src/enforce-batched-claims.ts` → `@ont/name-state-store`)
  so the reducer is the only name-state sink. That last step is DK-gated. This is the main reason the
  project is ready for controlled integration but not a finished ownership-state product.
- **Assurance semantics are too coarse.** CLI/web/mobile now distinguish `bitcoin-verified` from
  `resolver-mirror` for the private-signet demo, but that is still not the full ladder a product needs:
  anchor included, batch member, provisional claim, finalized ownership at block X, and current through
  tip Y. Until typed assurance states exist in the API and clients, copy must not imply complete
  current ownership from proof-bundle/header checks alone.
- **Light-client inclusion is wired for the demo, not closed for launch.** The Merkle + PoW verifier
  exists and is tested against a real mainnet block, and resolver/header-range providers now feed
  CLI/web/mobile paths. But private signet remains provider-trusted, and mainnet launch still needs
  enforced `verifyProofBundleAgainstBitcoin` against an independent canonical best-chain header source
  on every relevant path. da-trust-model (#82) makes closing this a **hard launch gate** (RC-1 of the
  ratified bootstrap-operator launch mode (#89)). The header-source mechanism is decided:
  **bundled-checkpoint headers + proof-of-work-validate-forward** by default, own-node opt-in, mobile in
  scope.
- **DA fail-closed enforcement and transport are built, but historical DA semantics remain a review
  fork.** The ratified rule is da-windows (#49) + batch-completeness (#83) + availability-height (#84):
  presenting bytes that reconstruct the anchored commitment mints `firstServableHeight = h`; absent,
  malformed, tampered, or withheld bytes fail closed and mutate no name-state. LE-DA-SERVE now exists
  (`GET /da/{root}` full material + `http-da` selector + two-operator e2e). **Remaining:** decide
  whether #84's "present content at verification time mints h" is acceptable for mainnet, or whether to
  reopen toward L1-authoritative acquisition or a witnessed/two-phase activation model; prove the
  withhold-then-reveal and clean-node behavior over an adversarial chain; add runtime discovery,
  durable retries, multiple origins, archive reconciliation, and restart-safe progress. Window *values*
  stay launch-freeze placeholders.
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
- **Private signet is an integration environment, not mainnet-grade security.** The custom private
  signet challenge and miner sidecar remove public-signet IBD/faucet friction and make the demo
  deterministic, but the operator controls the chain. Client labels must keep saying provider-trusted
  for signet header authenticity.
- **Production operations are still rough.** The Docker image is still a broad build/runtime image
  without a non-root runtime stage; mobile defaults remain demo-oriented (`PUBLISHER_BASE = null`,
  demo mode on); browser smoke is allowed to skip when Chromium install fails; and public
  `opennametags.org` exposes the static site but not the tested live API/private paths.
- **Launch parameters above are placeholders** and must be frozen before launch — until then,
  user-facing copy must not call the rules "frozen."

## Launch mode — bootstrap-operator (#89, RATIFIED)

The launch posture is an **auditable single-operator launch mode with mandatory verification and a
written decentralization ladder** — bootstrap-operator (#89), **ratified** (DK, 2026-06-29; paper
[`../research/BOOTSTRAP_OPERATOR.md`](../research/BOOTSTRAP_OPERATOR.md)). It adds **no new consensus
law**; it rests on the already-ratified da-trust-model (#82), batch-completeness (#83), and
availability-height (#84). The intended launch mode is one honest operator running indexer, resolver,
publisher, and archive, with name-state re-derived deterministically from Bitcoin + a public,
content-addressed archive. That promise depends on the open gates above: composed reducer /
re-derive-from-scratch verifier, enforced light-client verification, portable material, DA deadline
tests, and honest copy. Until those gates close, the current private-signet stack is a controlled
integration demo, not the finished bootstrap-operator launch.

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
