# G-A — light-client gate: make clients verify ownership against Bitcoin

> **Status: DESIGN-FIRST (plan, no implementation). Writer: ClaudeleLunatique. Reviewer: ChatLunatique
> (design-concur requested).** Opens on bootstrap-operator (#89) RC-1 (light-client = hard launch
> blocker) and its ratified G-A header-source mechanism: **bundled-checkpoint headers +
> proof-of-work-validate-forward as the default, own-node opt-in, mobile in scope; accepting a server's
> header word without PoW validation is rejected** (DK, event a1efe737). No new consensus law — the
> inclusion verifier (`verifyProofBundleAgainstBitcoin`) is already in the audited `@ont/consensus`;
> header validation is the `@ont/bitcoin` primitive + `@ont/adapter-header` seam. Branch: `ga-light-client-plan`.
>
> **⚠ Superseded in part by `signet-solution-gate` (#95, 2026-07-02).** Wherever this plan says
> "PoW-validated ⇒ operator can't forge," read **mainnet only**. On **signet**, BIP325 block validity turns
> on the signet challenge signature (carried in block/coinbase witness material, *not* the 80-byte header)
> and difficulty is trivial, so header-only + PoW gives **no** forge-resistance — the served signet header
> chain is **provider-trusted** for authenticity until `GA-SIGNET-SOLUTION` validates the challenge.
> Independence splits two layers: the **inclusion-proof layer** always fails closed on a forged/missing
> proof on every network; the **header-authenticity layer** is PoW-backed on mainnet, provider-trusted on
> signet. See [G_TRACK_BUILD_SPINE.md](./G_TRACK_BUILD_SPINE.md) §3(c) and DECISIONS #95.

## 1. The gap

The pieces exist; they are not wired into clients.

**Already built (audited / tested):**
- `verifyProofBundleAgainstBitcoin(input, { headerSource })` — `packages/consensus/src/proof-bundle.ts:248`.
  The audited verifier that re-derives a proof bundle's anchor against a Bitcoin header source.
- `validateHeaderChain(headersHex, startHeight, checkpoint, params)` — `packages/bitcoin/src/validate-header-chain.ts`.
  The pure PoW + linkage validator from a trusted checkpoint (#82).
- `buildCanonicalHeaderSourceFromHeaders` / `fetchCanonicalHeaderSource` —
  `packages/adapter-header/src/canonical-header-source.ts`. Fetches a header range from an **untrusted**
  provider and validates it against a **trusted checkpoint** → a `BitcoinHeaderSource`, or nothing
  (hostile provider ⇒ no source ⇒ fail closed). **This is exactly the ratified mechanism.**
- `bitcoin-inclusion.ts` + `proof-bundle-assembly.ts` — `packages/evidence/`. Build the `bitcoinInclusion`
  section and assemble proof bundles.

**Missing (the G-A work):**
1. **No bundled launch checkpoint exists.** A trusted `BitcoinDifficultyCheckpoint` + `BitcoinNetworkParams`
   per network (signet now, mainnet at freeze) exists only as test fixtures
   (`canonical-header-source.test.ts:74`). There is no shipped, reproducible launch-config checkpoint for
   clients to validate forward from.
2. **Producers don't emit `bitcoinInclusion` in served bundles.** The section can be built, but what the
   resolver serves to clients does not carry it end-to-end (STATUS Known-incomplete).
3. **No client proof path verifies.** No surface calls `verifyProofBundleAgainstBitcoin` /
   `fetchCanonicalHeaderSource` — the only reference is the indexer's *internal* recompute comment
   (`apps/indexer/src/enforce-batched-claims.ts:124`). web / cli / mobile today trust the resolver's word.
4. **Mobile** is untouched (and is in RC-1 scope).

Net: a client today trusts the resolver for ownership. G-A closes that — the operator becomes
*trusted-but-caught* (liveness only), which is the property the whole bootstrap-operator (#89) safety
claim rests on.

## 2. The ratified mechanism (restated, so the plan can't drift)

The client **independently validates** proof-of-work from a **bundled checkpoint** and rejects any bundle
it can't verify. On **mainnet**, because real PoW is validated, it does **not matter who serves the
post-checkpoint header bytes** — the operator may serve them; a forged higher-work chain is infeasible.
**On signet this does not hold** (`signet-solution-gate` (#95)): header-only + PoW is forgeable under
BIP325's trivial difficulty, so the signet header chain is provider-trusted for authenticity until
`GA-SIGNET-SOLUTION`. The **inclusion-proof layer** stays independent on both networks. Independence comes
from independent *validation*, not a trusted transport. Default = bundled-checkpoint + validate-forward;
own-node / 3rd-party header provider = opt-in hardening (against being fed a stale/partial *real* chain —
a liveness concern, not theft). "Trust a server's header word without validating" is rejected.

## 3. Seams → shells (what plugs into what)

| Built piece | Lives in | The G-A wiring that must consume it |
|---|---|---|
| `BitcoinDifficultyCheckpoint` + `BitcoinNetworkParams` types | `@ont/bitcoin` | a **NEW bundled launch-checkpoint config** (real signet values now; mainnet at freeze) shipped in clients |
| `fetchCanonicalHeaderSource` (untrusted range → trusted checkpoint → source) | `@ont/adapter-header` | each client: build a `BitcoinHeaderSource` from a header provider (resolver/Esplora) + the bundled checkpoint |
| `verifyProofBundleAgainstBitcoin(bundle, { headerSource })` | `@ont/consensus` | each client proof path: run it; **reject** on missing-inclusion / no-source / fail |
| `bitcoin-inclusion` + `proof-bundle-assembly` | `@ont/evidence` | producer (resolver/indexer): **emit** the `bitcoinInclusion` section in served bundles |

## 4. Slice sequence (tests-first, hermetic first)

1. **GA-CHECKPOINT — the bundled launch checkpoint.** A trusted checkpoint + params per network in a
   small config home (design call §6a), with a **reproducible derivation note** (how the value was
   obtained, so it is auditable, not magic). Tests: a known signet header range validates forward from the
   checkpoint; a forged child / short tail / wrong-network range fails closed (the adapter battery already
   exists — extend with the real checkpoint).
2. **GA-EMIT — producers emit `bitcoinInclusion`.** The resolver-served proof bundle carries the inclusion
   section bound to the anchored root. Test: served bundle has a well-formed inclusion section; a bundle
   without it is detectable by a client.
3. **GA-CLIENT-CLI — the CLI verify path** (`apps/cli/src/verify-commands.ts`). Require inclusion + run
   `verifyProofBundleAgainstBitcoin` against the bundled checkpoint via a header provider; reject
   unverified. Hermetic with a fixture provider. **(This overlaps the G-B re-derive verifier — see §6e.)**
4. **GA-CLIENT-WEB — the web read path.** Ownership is shown as *Bitcoin-verified* only after the client
   verifies; otherwise it is a resolver mirror, not authority (RC-5 copy). UX call in §6d.
5. **GA-CLIENT-MOBILE — mobile.** Ships the bundled checkpoint and runs the same verify before trusting
   ownership. (Mobile is a post-B5 consumer of `@ont/*`; this is its first hard gate.)
6. **GA-OPTION-NODE — opt-in own-node/Esplora header provider** config, for users who want to not rely on
   operator-served headers (PoW-backed on mainnet; **provider-trusted on signet** per #95 — so on signet
   this opt-in is the only path to non-operator header authenticity short of `GA-SIGNET-SOLUTION`).

Each slice lands with a default-suite (no-network) test first; live wiring is env-selected, same discipline
as go-live G1/G2 and live-enforcement.

## 5. Boundary + scope guards

- **No new consensus law.** `verifyProofBundleAgainstBitcoin` is already audited `@ont/consensus`; G-A
  only *calls* it from clients and *emits* what it consumes. The audited boundary is untouched.
- **The checkpoint is the one trusted input** — and it is trusted only up to its height; everything after
  is PoW-validated. It must be reproducible/auditable (provenance note), and baked into the client
  distribution, never fetched from the operator at runtime.
- **Fail closed everywhere:** missing inclusion, no header source, or a failed verify ⇒ the client does
  **not** present the answer as Bitcoin-verified. A resolver mirror may still be shown, clearly labelled
  non-authoritative (RC-5).

## 6. Open design calls (for CL)

- **(a) Checkpoint config home.** New `@ont/launch-config` package vs a per-app const vs a checked-in
  JSON in `@ont/bitcoin`. REC lean: a small dedicated config module so signet/mainnet values + provenance
  live in one auditable place, imported by every client.
- **(b) Checkpoint cadence.** One genesis-era checkpoint + validate-the-whole-chain-forward, vs a periodic
  checkpoint refreshed per client release (bounds the validate-forward work, esp. on mobile). REC lean:
  refreshed-per-release checkpoint (shorter forward range = mobile-friendly), with the provenance note.
- **(c) Default header provider. — RESOLVED by `signet-solution-gate` (#95).** Resolver-served headers as
  the default vs requiring Esplora/own-node. **Ruling:** resolver-served default, but the "safe because
  PoW-validated" rationale holds on **mainnet** only. On **signet** the served header chain is
  *provider-trusted* for authenticity (header-only + PoW ≠ forge-resistance under BIP325); the
  inclusion-proof layer still fails closed independently. Own-node opt-in (GA-OPTION-NODE) hardens the
  signet header path; `GA-SIGNET-SOLUTION` upgrades signet from provider-trusted to caught. See
  [G_TRACK_BUILD_SPINE.md](./G_TRACK_BUILD_SPINE.md) §3(c).
- **(d) Web "not-verified" UX.** Exact treatment when a bundle can't be verified (hide ownership? show
  with a loud non-authoritative banner?). Ties to G-E copy.
- **(e) G-A vs G-B overlap.** The CLI verify path (GA-CLIENT-CLI) and the G-B re-derive verifier both run
  the chain check; propose they share one verify core so G-B is the CLI/replay front-end over the same
  header-source + `verifyProofBundleAgainstBitcoin` path, not a parallel implementation.

## 7. Acceptance bar (G-A gate)

Every relevant client proof path (cli, web, mobile) **requires** `bitcoinInclusion` and **passes**
`verifyProofBundleAgainstBitcoin` against an independently-validated header source from the bundled
checkpoint before presenting ownership as Bitcoin-verified; a missing/forged inclusion or header range
fails closed; conformance tests pin each path. This is RC-1 satisfied end-to-end.
