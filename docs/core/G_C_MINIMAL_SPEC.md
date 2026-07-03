# G-C-MINIMAL — first live signet loop: resolver-served header range + CLI verify

> **Status: BUILD SPEC (slice 4 of [G_TRACK_BUILD_SPINE.md](./G_TRACK_BUILD_SPINE.md) §2.1).
> Writer: ClaudeleLunatique. Reviewer: ChatLunatique (concur requested, non-blocking).
> Merge authority: standing (DK, event 70fce3fe, 2026-07-02).** Dispatched on DK's "go ahead"
> (event `e0ebf10b`, 2026-07-03). This is the bridge from *hermetic fixture verify* to a
> **live resolver-served header source**: the first milestone where a client re-derives
> ownership against Bitcoin over the network, not from an in-repo fixture.

## 0. Where this sits

GA-CLIENT-CLI/WEB/MOBILE + GA-CLIENT-PROVIDER (5b) built and audited the **verify core**
(`@ont/light-client`: `runVerifyProofBundleAgainstBitcoin` + `checkProofBundleHeaderDepthCoverage`,
fed a `BitcoinHeaderSource` validated forward from the bundled `@ont/launch-config` checkpoint).
Every surface can verify — but **no surface obtains a live header source yet**. Today:

- The resolver serves proof bundles but **no Bitcoin header data** (`apps/resolver/src/server.ts`
  routes: value-history / recovery-history / state / tx / submissions — no header endpoint).
- CLI/web/mobile only have the hermetic path: web's `BUILT_IN_HEADER_SOURCES = {}`
  (`apps/web/src/live/select-bitcoin-header-source.ts:9`) with a block-170/176 test stub;
  mobile takes an optional `headerSource` nobody injects; CLI re-exports the builder with no
  live provider wired.

Slice 5b explicitly deferred exactly this: *"Only the live resolver-served transport (a running
node serving the range over the network) waits on the G-C-MINIMAL stand-up."* This spec closes
that gap.

Per **`signet-solution-gate` (#95)** this milestone is a **trusted-bitcoind / resolver
active-chain smoke**: the inclusion-proof layer is fully independent (a forged/missing proof
fails closed), the signet header chain is **provider-trusted for authenticity** until
`GA-SIGNET-SOLUTION` (slice 9). Every surface labels it as such and asserts **no** signet header
independence.

## 1. Two halves

| Half | What | Gate | Owner |
|---|---|---|---|
| **4a HEADER-SERVE** | indexer persists the checkpoint-forward header range → resolver serves it → HTTP `HeaderRangeProvider` client → wired into CLI (+ web) | **code-only, no operator gate — dispatchable now**; all hermetic-tested first | codex |
| **4b STAND-UP** | boot the G3 signet stack, make one real signet claim, point the CLI at the live resolver, walk verify live | **DK operator action**; I spec exact G3-runbook commands when 4a lands | DK (I spec) |

4a does not wait on DK; its validation code + tests are hermetic. Only the *live* walk (4b) needs
a running node. Ship 4a first, hand DK 4b as copy-paste.

## 2. Design — where the served headers come from

The resolver is deliberately **store-fed** (`selectResolverAnchorTxView` reads `ONT_STORE`, not
bitcoind — preserves the enforce/serve split and G2 restart-safety). The **indexer** is the
bitcoind-connected authority: it already fetches each block's 80-byte header as it ingests
(`apps/indexer/src/live/node-block-source.ts:29,57` — `getBlockHeaderHex(hash)` =
`getblockheader(hash,false)`). So the header range flows the same way anchor-tx and name-state
already do — **indexer → store → resolver serve → client** — with no new bitcoind dependency on
the resolver:

```
signet bitcoind ──RPC──▶ indexer (node-block-source) ──persist──▶ header-range store (ONT_STORE)
                                                                          │
                                                                    resolver serves
                                                            GET /bitcoin/header-range?anchorHeight=H
                                                                          │
                          @ont/light-client HTTP HeaderRangeProvider ◀────┘
                                          │
              fetchSignetLaunchHeaderSource({ provider, anchorHeight })
                                          │
        validateHeaderChain forward from bundled checkpoint (h311445)  →  BitcoinHeaderSource
                                          │
   runVerifyProofBundleAgainstBitcoin + checkProofBundleHeaderDepthCoverage  →  Bitcoin-verified | resolver-mirror
```

**Contiguity requirement (pin this).** `validateHeaderChain` validates *exactly the supplied
range* and requires it contiguous from `checkpoint.height + 1` (311446) through
`anchorHeight + LAUNCH_CONFIRMATION_DEPTH` (`signetLaunchHeaderRange`,
`packages/light-client/src/index.ts:83-111`). The store MUST therefore be **contiguous from
checkpoint+1**: the indexer persists **every** ingested block header (not only anchor blocks),
and **backfills** checkpoint+1 → its start height once at boot (a bounded one-time walk via
`getblockhash` + `getBlockHeaderHex`). The range stays short by design — the checkpoint is
refreshed per release (spine §3(b)), so at stand-up it sits close to the signet tip.

## 3. 4a code contract (codex)

Build in this order; each step lands a hermetic (no-network) test first, live wiring
env-selected — same discipline as G1/G2 and live-enforcement (spine §0).

1. **Header-range store.** A new `ONT_STORE`-backed store (mirror `@ont/anchor-store` /
   name-state-store) holding `height → headerHex` from checkpoint+1 forward. Fail-closed reads:
   a gap in the requested range returns "unavailable," never a partial/sparse map.
2. **Indexer persist + backfill.** The indexer writes each ingested header to the store, and on
   boot backfills checkpoint+1 → current start height from bitcoind (`getblockhash` +
   `getBlockHeaderHex`). Reuse the existing node-block-source read port; add `getBlockHashAtHeight`
   only if absent. Idempotent; restart-safe.
3. **Resolver serve endpoint.** `GET /bitcoin/header-range?anchorHeight=<int>` → returns the
   contiguous range `[checkpoint.height+1 .. anchorHeight + LAUNCH_CONFIRMATION_DEPTH]` as
   `{ startHeight, headersHex: string[] }`, read from the store via a `selectResolver*View`-style
   selector (`ONT_STORE` unset/"memory" → 404/unavailable, exactly like the anchor-tx view).
   **Fail closed:** any missing height in the range → 4xx `unavailable`, never a truncated body.
   No fork-selection / tip-currentness here — the client owns the freshness gate (§4).
4. **HTTP `HeaderRangeProvider` client.** In `@ont/light-client` (or a `/live` subpath), an
   implementation of the existing `HeaderRangeProvider` port that `fetchSignetLaunchHeaderSource`
   already consumes (`packages/light-client/src/index.ts:125-135`). It GETs the resolver endpoint
   and returns headers by height. Hermetic test against a fake HTTP server; malformed/short/500
   responses surface as a fetch failure that the caller maps to `resolver-mirror`.
5. **CLI wiring.** `apps/cli/src/verify-commands.ts`: an env-selected live provider
   (`ONT_BITCOIN_HEADER_SOURCE=resolver:<url>`) so `ont verify <name>` fetches the range from the
   resolver, runs the full verify, and prints Bitcoin-verified only on `ok:true` **and** depth
   coverage. Keep the existing missing-header-source / unverified / malformed exits (slice 3
   contract) intact; the block-170 unit fixtures stay for unit tests.
6. **Web wiring** (rides here since mobile+web ship with first signet, §5). Replace web's empty
   `BUILT_IN_HEADER_SOURCES` / block-170 stub with a real registry entry for the resolver-served
   source, env-selected via `ONT_WEB_BITCOIN_HEADER_SOURCE`
   (`apps/web/src/live/select-bitcoin-header-source.ts`). This satisfies the **coverage-source
   honesty** criterion (spine §4) *by construction*: a real validated range replaces the
   170/176 stub. Web server seam unchanged (`apps/web/src/server.ts:182`).

**Boundary guards (unchanged, must hold):** `packages/consensus/src` **zero-diff**; no new
consensus law; audit-map ratchet green. The endpoint is a transport over already-audited
verification — it emits headers, it does not decide validity. The client re-validates every
served header forward from the bundled checkpoint, so a lying resolver on **mainnet** cannot
forge (real PoW); on **signet** it is provider-trusted (#95) and labelled so.

## 4. Invariants each surface pins

- **Freshness/range (spine §4).** Bitcoin-verified requires the validated range to reach **≥
  anchorHeight + `LAUNCH_CONFIRMATION_DEPTH`** (`checkProofBundleHeaderDepthCoverage` ok). A
  stale/short/partial served range → **non-authoritative**, rendered as
  "resolver mirror — not yet Bitcoin-verified" with ownership still shown (design call (d)).
- **Honest signet label (#95).** A verified signet result carries `provider-trusted` header
  authenticity; no surface claims signet header independence.
- **Fail closed everywhere.** Missing inclusion, no/short/partial header range, unreachable
  resolver, malformed body, or a failed verify ⇒ never presented as Bitcoin-verified.
- **Signet ≠ mainnet gate.** `ONT_CHAIN` stays fail-closed against mainnet; nothing here relaxes
  the mainnet external-audit gate.

## 5. Mobile + web ship with the first signet demo (DK, `mobile-first-signet` (#96))

DK ruled (event `e0ebf10b`, 2026-07-03) the first signet demo **ships the mobile surface**, not a
fast-follow. Consequences:

- **Web live path** — done in 4a step 6 (same HTTP provider).
- **Mobile live path** — `fetchMobileSignetLaunchHeaderSource` (`mobile/src/verification/bitcoin.ts`)
  points at the same resolver provider. Code-only; folds into 4a as a mobile-checks conformance
  addition (RN-safe graph already enforced by slice 6a/6b).
- **6c in-app UI wiring** — rendering the three states (`bitcoin-verified` /
  `resolver-mirror` / `unavailable`) in the app UI is now **in scope for the demo**. It rides the
  post-B5 mobile rewrite; sequenced against that rewrite's readiness. Separate mini-slice, spec to
  follow once the live provider (4a) lands and the rewrite state is known. It does **not** block
  4a or 4b.

## 6. 4b operator walk (DK) — outline; exact commands land when 4a is green

From the [G3 runbook](../operate/G3_CLEAN_SLATE_VPS.md): (1) boot bitcoind-signet + indexer +
resolver + non-signing publisher on the signet host; (2) signet-faucet the publisher wallet past
the ₿1,000-sats claim gate; (3) make one real claim → broadcast → mine/confirm → indexer enforces
→ resolver serves + the header range populates; (4) point the CLI (`ONT_BITCOIN_HEADER_SOURCE=
resolver:<url>`) at the live resolver and run `ont verify <name>` → Bitcoin-verified; (5) repeat
against web + mobile. Queued operator prerequisites already listed in spine §6 (signet host,
faucet top-up, resolver/web DNS). I convert this to copy-paste when 4a lands.

## 7. Acceptance bar

**4a (code):** hermetic default suite green — the CLI (and web) verify a real proof bundle against
the resolver-served header range; a missing/forged inclusion, a short/partial/gapped range, and an
unreachable/malformed resolver each fail closed to non-authoritative; the block-170 fixture is gone
from the live path (coverage-source honesty); `consensus/src` zero-diff; all standing gates green.
**4b (live):** on signet, one real anchored claim verifies end-to-end from the CLI against the
resolver-served range reaching ≥ anchor + depth, labelled provider-trusted per #95 — the first live
"good/deployed" checkpoint DK asked for, claimed honestly.

## 8. Dispatch + review loop

Dispatch **4a** to codex now (steps 1–6, hermetic-first). I review each handback fresh-frame →
merge/push (standing authority) → ChatLunatique concurs on the spec/design deltas in parallel
(non-blocking). DK is looped only for **4b** operator actions and the 6c demo-scope timing.
