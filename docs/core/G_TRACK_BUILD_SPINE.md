# G-track build spine — from hermetic to live signet (lite client + mobile)

> **Status: BUILD SPEC. Writer: ClaudeleLunatique. Reviewer: ChatLunatique (concur requested).
> Merge authority: standing (DK, event 70fce3fe, 2026-07-02 — "push toward a good/deployed
> version… don't want to be a blocker").** This is the sequencing spec that carries the
> clean-build from *feature-complete + hermetic* (see [STATUS.md](./STATUS.md)) to a
> **testable deployment on signet** where independent clients — cli, web, and the mobile
> app — verify ownership against Bitcoin. No new consensus law; every verifier already lives
> in the audited `@ont/consensus`. Branch: `ga-build-spec`.

## 0. Purpose / scope / tests (nothing-is-precious, #46)

- **Purpose.** Stand the rebuilt stack up on **signet** and prove the whole story live: a real
  claim is anchored on signet, the indexer enforces it and the resolver serves the enforced
  state, and a client independently re-derives ownership against Bitcoin from a bundled
  checkpoint — the operator is *trusted-but-caught (liveness only)*, never the source of truth.
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
   **This is the first live-testable milestone.** *(DK operator action; I spec exact steps.)*
5. **GA-CLIENT-WEB** — web read path shows ownership as *Bitcoin-verified* only after the client
   verifies; a resolver mirror is labelled non-authoritative otherwise.
6. **GA-CLIENT-MOBILE** — the iOS app ships the bundled checkpoint and runs the same verify
   before trusting ownership. First hard gate for mobile; it becomes a real light client.
7. **G-B / LE-DA-SERVE** — DA network transport, so independence is provable across two operators
   (the censorship-resistance property). Hardens the "good" version.
8. **GA-OPTION-NODE** — opt-in own-node / Esplora header provider for users who won't rely on
   operator-served (but PoW-validated) headers.

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
- **(c) Default header provider → resolver-served, PoW-validated.** Because headers are validated
  from the bundled checkpoint, the operator *cannot forge* a higher-work chain, so serving them
  is safe and needs no third party. Own-node / Esplora is opt-in hardening (GA-OPTION-NODE)
  against a stale/partial *real* chain — a liveness concern, not theft.
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
  PoW-validated. It is baked into the client distribution with a reproducible provenance note,
  never fetched from the operator at runtime.
- **Fail closed everywhere.** Missing inclusion, no header source, or a failed verify ⇒ the client
  does not present the answer as Bitcoin-verified.
- **Signet ≠ mainnet gate.** Nothing here relaxes the mainnet external-audit gate; `ONT_CHAIN`
  stays fail-closed against mainnet until that gate is met.

## 5. First dispatch + review loop

- **Dispatch now:** GA-CHECKPOINT to codex — a `@ont/launch-config` module carrying the real
  signet `BitcoinDifficultyCheckpoint` + `BitcoinNetworkParams` with a reproducible derivation
  note; tests extend the existing `canonical-header-source` battery with the real checkpoint
  (known signet range validates forward; forged child / short tail / wrong-network fail closed).
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
**require** `bitcoinInclusion` and **pass** `verifyProofBundleAgainstBitcoin` against an
independently-validated header source from the bundled checkpoint before showing ownership as
Bitcoin-verified; a missing/forged inclusion or header range fails closed; conformance tests pin
each path. That is bootstrap-operator (#89) RC-1 satisfied end-to-end on a live network — the
"good/deployed version" DK asked for.
