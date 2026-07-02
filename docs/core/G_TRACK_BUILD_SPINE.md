# G-track build spine — from hermetic to live signet (lite client + mobile)

> **Status: BUILD SPEC. Writer: ClaudeleLunatique. Reviewer: ChatLunatique (concur requested).
> Merge authority: standing (DK, event 70fce3fe, 2026-07-02 — "push toward a good/deployed
> version… don't want to be a blocker").** This is the sequencing spec that carries the
> clean-build from *feature-complete + hermetic* (see [STATUS.md](./STATUS.md)) to a
> **testable deployment on signet** where independent clients — cli, web, and the mobile
> app — verify ownership against Bitcoin. No new consensus law; the consensus **inclusion** verifier
> (`verifyProofBundleAgainstBitcoin`) is resident in the audited `@ont/consensus`, and header validation is
> the pinned `@ont/bitcoin` primitive + `@ont/adapter-header` seam. Branch: `ga-build-spec`.

## 0. Purpose / scope / tests (nothing-is-precious, #46)

- **Purpose.** Stand the rebuilt stack up on **signet** and prove the whole story live: a real
  claim is anchored on signet, the indexer enforces it and the resolver serves the enforced
  state, and a client independently re-derives ownership against Bitcoin from a bundled
  checkpoint. The client independently verifies the **inclusion proof** on every network (a
  forged/missing proof fails closed); for **header-chain authenticity** the operator is
  *trusted-but-caught* on **mainnet** (real PoW), and **provider-trusted on signet** until the
  BIP325 challenge is validated (`signet-solution-gate` (#95), §3(c)). On signet, "operator can't
  forge state" is therefore an *inclusion-layer* claim, not a header-chain claim — labelled as
  such at every surface so the demo never overclaims.
- **Scope.** Signet only. **Mainnet stays hard-gated behind the external audit** (clean-build
  (#46) ruled call 6); signet may proceed without it. No change to the audited boundary
  (`@ont/consensus`) — G-track only *emits* what the verifier consumes and *calls* it from the
  surfaces.
- **Tests.** Every slice lands a default-suite (no-network) test first; live wiring is
  env-selected, same discipline as go-live G1/G2 and live-enforcement. The G-track gate is met
  when a client rejects a missing/forged inclusion and passes a real one end-to-end on signet.

## 1. Where we start (grounded in STATUS)

Feature-complete and green but **hermetic** — 1,415 pass / 12 skip / 0 fail, all over in-memory
ports and regtest; nothing on a live network. The old signet stack was decommissioned 2026-06-11.
The deploy-relevant pieces already in hand:

- **G1** live bitcoind RPC + a regtest end-to-end claim loop (assemble → sign → broadcast → mine
  → ingest → serve → render), chain-gated against mainnet.
- **G2** restart-safe durable confirmed-anchor read (file store).
- **G3** clean deploy stack: Docker/compose + VPS runbook ([G3_CLEAN_SLATE_VPS.md](../operate/G3_CLEAN_SLATE_VPS.md))
  + signet bitcoind boot + non-signing publisher write service + fail-closed write-smoke —
  **infra-as-code ready, not stood up.**
- **live-enforcement** LE-INDEX + LE-RESOLVE proven in the hermetic e2e; the indexer daemon now
  wires the live-enforcement selectors (A1b merged, `main` @ `6856f5e8`).
- **light-client verifier** built and audited (`verifyProofBundleAgainstBitcoin` in
  `packages/consensus/src/proof-bundle.ts`) but **not wired into any client** — see
  [G_A_LIGHT_CLIENT_PLAN.md](./G_A_LIGHT_CLIENT_PLAN.md).

The gap between here and what DK asked for is exactly STATUS's "Still ahead": the light-client
gate (G-A), the DA network transport (G-B / LE-DA-SERVE), and the signet stand-up + story-walk
(G-C / G4) — with mobile as the first hard consumer of the light-client gate.

## 2. Critical path

Three build phases feeding one deploy. **Fast-testable-first ordering:** get a single-operator
signet loop verifiable on the CLI as early as possible, then widen to the surfaces, then harden
the DA/censorship story.

| Phase | Delivers | Depends on | Owner |
|---|---|---|---|
| **G-A** light-client gate | clients require + independently verify `bitcoinInclusion` against a bundled checkpoint | verifier (done), evidence emit | build → codex |
| **G-B** DA-serve (LE-DA-SERVE) | indexer/resolver serve DA evidence bytes over the network so a *second* independent party can fetch, reconstruct, and challenge | G-A emit path | build → codex |
| **G-C** signet stand-up + G4 | boot the G3 stack on signet; point web + mobile at it; walk claim → anchor → serve → verify live | G-A (+ G-B for the full story) | operator → DK, wiring → codex |

### 2.1 Slice order (the actual work queue)

1. **GA-CHECKPOINT** — the bundled signet launch checkpoint + params, with a reproducible
   provenance note. *(First dispatch — see §5.)*
2. **GA-EMIT** — producers (resolver/indexer) emit the `bitcoinInclusion` section in served
   bundles.
3. **GA-CLIENT-CLI** — `apps/cli/src/verify-commands.ts` requires inclusion and runs
   `verifyProofBundleAgainstBitcoin`; rejects unverified. Hermetic fixture provider first.
4. **G-C-MINIMAL** — stand up bitcoind-signet + publisher + indexer + resolver from the G3
   runbook; make one real signet claim; verify it from the CLI against the bundled checkpoint.
   **This is the first live-testable milestone.** Explicitly a **trusted-bitcoind / resolver
   active-chain smoke**: the inclusion proof is verified independently, the signet *header chain*
   is provider-trusted (`signet-solution-gate` (#95)); it is **not** a fully independent signet
   consensus light client. *(DK operator action; I spec exact steps.)*
5. **GA-CLIENT-WEB** — web read path shows ownership as *Bitcoin-verified* only after the client
   verifies; a resolver mirror is labelled non-authoritative otherwise.
6. **GA-CLIENT-MOBILE** — the iOS app ships the bundled checkpoint and runs the same verify
   before trusting ownership. First hard gate for mobile; it becomes a real light client.
7. **G-B / LE-DA-SERVE** — DA network transport, so independence is provable across two operators
   (the censorship-resistance property). Hardens the "good" version.
8. **GA-OPTION-NODE** — opt-in own-node / Esplora header provider for users who won't rely on
   the operator-served header range — hardening against a stale/partial *real* chain (liveness).
9. **GA-SIGNET-SOLUTION** — validate the BIP325 signet challenge signature against the challenge
   carried in `@ont/launch-config`, so the signet header chain stops being provider-trusted and
   the operator-can't-forge property holds on signet too (`signet-solution-gate` (#95)). Needs
   block/coinbase witness material, not headers alone; sequenced after the first live loop so it
   never blocks G-C-MINIMAL. Reorderable ahead of slice 4 only if DK rules signet must be fully
   independent before the first testable milestone.

## 3. G-A open design calls — resolved

Resolving the six open calls in [G_A_LIGHT_CLIENT_PLAN.md](./G_A_LIGHT_CLIENT_PLAN.md) §6 so the
build can move. ChatLunatique concur requested (flag before canon, same as the A4 pattern); DK
override welcome on any.

- **(a) Checkpoint config home → NEW `@ont/launch-config` package.** One auditable home for
  signet-now / mainnet-at-freeze checkpoint + params + provenance, imported by every client.
  Beats per-app consts (drift) and burying it in `@ont/bitcoin` (mixes trusted launch data with
  pure validators).
- **(b) Cadence → refreshed-per-release checkpoint.** Shorter validate-forward range = mobile
  affordable; the provenance note makes each refresh auditable. Genesis-era single checkpoint is
  rejected — the forward-validation cost is a mobile battery/latency tax with no safety gain.
- **(c) Default header provider → resolver-served, validated from the bundled checkpoint —
  with an honest per-network trust label (`signet-solution-gate` (#95)).** The independence
  property is **two layers**, and only one is network-agnostic:
  - **Inclusion-proof layer (always independent).** `verifyProofBundleAgainstBitcoin` re-derives
    ownership from the served bundle against a header source; a forged/missing inclusion proof
    fails closed on every network. This layer catches the operator regardless of chain.
  - **Header-authenticity layer (network-dependent).** *On mainnet* the operator **cannot forge**
    a competing header chain: `validateHeaderChain` enforces expected nBits per height, so a
    forged chain must meet real difficulty → real cumulative work → economically infeasible.
    *On signet PoW is not a security anchor* — BIP325 block validity turns on the **signet
    challenge signature** (carried in block/coinbase data, **not** the 80-byte header the
    validator sees), and signet's retarget schedule targets trivial difficulty, so an operator
    *can* grind a header chain that passes linkage + expected-bits + PoW. Header-only validation
    therefore does **not** give the "operator can't forge" property on signet.
  - **Resolution.** For the signet bootstrap the served header chain is **provider-trusted for
    authenticity** (a trusted-bitcoind smoke); the inclusion-proof layer stays fully independent.
    The milestone is labelled accordingly (§0/§7) and must **not** claim signet header
    independence. `@ont/launch-config` **carries the signet challenge** (provenance-noted) so the
    gate can be opened later. `GA-SIGNET-SOLUTION` (§2.1 slice 9) validates that challenge and
    upgrades signet from *provider-trusted* to *caught*; mainnet gets the property free from PoW.
  - Own-node / Esplora (GA-OPTION-NODE) remains opt-in hardening against a stale/partial *real*
    chain — a liveness concern, orthogonal to the forge question.
- **(d) Web "not-verified" UX → show with a loud non-authoritative banner, do not hide.** Hiding
  ownership on a verify miss trains users to distrust the wrong thing; a clear "resolver mirror —
  not yet Bitcoin-verified" state is honest and matches the trusted-but-caught model. Final copy
  ties to G-E; this is the behavior contract.
- **(e) G-A vs G-B overlap → one shared verify core.** GA-CLIENT-CLI and the G-B re-derive
  verifier run the same header-source + `verifyProofBundleAgainstBitcoin` path; G-B is the
  replay/CLI front-end over that core, never a parallel implementation.

## 4. Boundary + scope guards

- **No new consensus law.** `verifyProofBundleAgainstBitcoin` is already audited. G-track calls it
  and emits what it consumes; the audited manifest (`packages/consensus`) is untouched. The
  audit-map ratchet (#94 A3) stays green.
- **The checkpoint is the one trusted input**, trusted only up to its height — everything after is
  header-chain-validated (PoW-backed on mainnet; provider-trusted on signet per
  `signet-solution-gate` (#95)). It is baked into the client distribution with a reproducible
  provenance note plus the signet challenge, never fetched from the operator at runtime.
- **Freshness/range invariant.** `verifyProofBundleAgainstBitcoin` validates *exactly the supplied
  range*; the adapter decides no tip-currentness, fork-selection, or confirmation depth
  (`canonical-header-source.ts`, by design). So a "Bitcoin-verified" mark **requires** the
  validated range to extend through **at least the anchor height + the launch confirmation depth**;
  a stale, short, or partial provider range is non-authoritative and fails closed — it does not
  render as verified. This is an implementation invariant each client slice must pin, not a
  provider promise.
- **Fail closed everywhere.** Missing inclusion, no header source, a stale/partial range, or a
  failed verify ⇒ the client does not present the answer as Bitcoin-verified.
- **Signet ≠ mainnet gate.** Nothing here relaxes the mainnet external-audit gate; `ONT_CHAIN`
  stays fail-closed against mainnet until that gate is met.

## 5. First dispatch + review loop

- **Dispatch now:** GA-CHECKPOINT to codex — a `@ont/launch-config` module carrying the real
  signet `BitcoinDifficultyCheckpoint` + `BitcoinNetworkParams` **plus the signet challenge
  script** (all with reproducible derivation notes; the challenge is carried now so
  `GA-SIGNET-SOLUTION` can consume it later, even though header-only validation does not yet);
  tests extend the existing `canonical-header-source` battery with the real checkpoint (known
  signet range validates forward; forged child / short tail / wrong-network fail closed). Tests
  must **not** assert "operator can't forge" for signet — that property is provider-trusted here
  (`signet-solution-gate` (#95)); the passing case is a well-formed real signet range, the
  fail-closed cases are inclusion/range malformations.
- **Review loop:** codex builds each slice → I review against this spec → I merge/push (standing
  authority) → ChatLunatique concurs on design/spec deltas in parallel (non-blocking, flags
  before canon). DK is looped only for **operator actions** and product-intent forks.

## 6. Operator actions queued for DK (so he is never the blocker)

Nothing here needs DK until **G-C-MINIMAL** (slice 4). I will spec each with exact commands from
the [G3 runbook](../operate/G3_CLEAN_SLATE_VPS.md) when the slice is ready, so they arrive as
copy-paste, not discovery:

1. **A signet host** — a small VPS (or reuse the box in the G3 runbook) to run bitcoind-signet +
   indexer + resolver + non-signing publisher.
2. **Signet BTC funding** — a signet faucet top-up for the publisher wallet to broadcast the claim
   carrier (gate is ₿1,000 sats-equiv on signet; trivial).
3. **DNS / host for resolver + web** — when G-C lands, a hostname to point the web + mobile
   surfaces at the live resolver.

Mainnet DNS, real funding, and the external audit are explicitly **out of scope** here.

## 7. Acceptance bar (G-track gate)

On signet: a real claim anchored → indexer enforces + resolver serves → cli, web, and mobile each
**require** `bitcoinInclusion` and **pass** `verifyProofBundleAgainstBitcoin` against a header
source validated from the bundled checkpoint, over a range reaching **at least anchor height +
launch confirmation depth**, before showing ownership as Bitcoin-verified; a missing/forged
inclusion or a stale/short/partial header range fails closed; conformance tests pin each path.
Per `signet-solution-gate` (#95) the signet header chain is **provider-trusted for authenticity**
(the inclusion layer is fully independent) until `GA-SIGNET-SOLUTION` validates the BIP325
challenge — surfaces label the signet demo as such and do not assert signet header independence.
That is bootstrap-operator (#89) RC-1 satisfied end-to-end on a live network — the
"good/deployed version" DK asked for, claimed honestly.
