# G-C-MINIMAL — first live signet loop: resolver-served header range + CLI verify

> **Status: BUILD SPEC (slice 4 of [G_TRACK_BUILD_SPINE.md](./G_TRACK_BUILD_SPINE.md) §2.1) —
> ChatLunatique concurred + 4 seam patches folded (event `36bbf371`, §8).
> Writer: ClaudeleLunatique. Reviewer: ChatLunatique.
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
                                                            GET /bitcoin/header-range?startHeight=S&count=N
                                                                          │
                          @ont/light-client HTTP HeaderRangeProvider ◀────┘
                          (client derives (S,N) from anchorHeight via signetLaunchHeaderRange)
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
   only if absent. Idempotent; restart-safe. **Persist-before-advance invariant:** a header-store
   persist/backfill failure MUST abort **before** the ingest cursor advances (the runner already
   saves cursor last — keep that ordering), so a missing header can never be stranded behind an
   advanced cursor and reappear as a permanent gap in the served range. Hermetic test: inject a
   store persist failure and assert the cursor did **not** advance.
3. **Resolver serve endpoint.** `GET /bitcoin/header-range?startHeight=<int>&count=<int>` → returns
   exactly the requested contiguous range as `{ startHeight, headersHex: string[] }` (length
   `count`, `headersHex[i]` = header at `startHeight + i`), read from the store via a
   `selectResolver*View`-style selector (`ONT_STORE` unset/"memory" → 404/unavailable, exactly like
   the anchor-tx view). The resolver is a **dumb range server** — it does not derive the range from
   an anchor height; the light-client owns that derivation (`signetLaunchHeaderRange`, patch below),
   which keeps the endpoint a 1:1 match for the `fetchHeaderHex(startHeight, count)` port.
   **Fail closed:** any missing height in `[startHeight, startHeight+count)` → 4xx `unavailable`,
   never a truncated/partial body. No fork-selection / tip-currentness here — the client owns the
   freshness gate (§4).
4. **HTTP `HeaderRangeProvider` client.** In `@ont/light-client` (or a `/live` subpath), an
   implementation of the existing `HeaderRangeProvider` port —
   `fetchHeaderHex(startHeight: number, count: number): Promise<readonly string[] | null>`
   (`packages/adapter-header/src/canonical-header-source.ts:17-19`) — that
   `fetchSignetLaunchHeaderSource` already consumes via `fetchCanonicalHeaderSource`
   (`packages/light-client/src/index.ts:125-135`). It GETs
   `?startHeight=<startHeight>&count=<count>` with the **exact** `(startHeight, count)` the port was
   called with (no `anchorHeight` on the wire — the anchor→range derivation stays in
   `signetLaunchHeaderRange`), is **signet-bound** by construction, and validates the returned
   `{ startHeight, headersHex }` **exactly** against the requested `(startHeight, count)`
   (`startHeight` echoes, `headersHex.length === count`); any mismatch → `null` (mapped to
   `header-provider-unavailable` by `fetchCanonicalHeaderSource`). Hermetic test against a fake HTTP
   server; malformed/short/mismatched/500 responses surface as a fetch failure → `resolver-mirror`.
5. **CLI wiring + `ont verify <name>` wrapper.** `@ont/cli` today exports verify *cores*, not a
   parsed `ont verify <name>` executable. 4a **adds that executable command**: parse the name arg →
   fetch its proof bundle from the resolver → select the env-configured live provider
   (`ONT_BITCOIN_HEADER_SOURCE=resolver:<url>`) → run the shared verify core
   (`apps/cli/src/verify-commands.ts`) → print Bitcoin-verified only on `ok:true` **and** depth
   coverage. This is the command 4b's operator walk (§6) drives, so the wrapper is in-scope here,
   not assumed. Keep the existing missing-header-source / unverified / malformed exits (slice 3
   contract) intact; the block-170 unit fixtures stay for unit tests.
6. **Web wiring** (rides here since mobile+web ship with first signet, §5). The web header source is
   **async and per-request**: `selectBitcoinHeaderSource` returns a *synchronous* `BitcoinHeaderSource`
   from a static registry (`apps/web/src/live/select-bitcoin-header-source.ts:9`), which structurally
   **cannot** fetch/validate `/bitcoin/header-range` — the anchor height is only known once the live
   name path has `served.proofBundle`. So 4a adds an **async web seam in the live name path**: after
   `liveNameResponse` receives the served proof bundle, derive the anchor height from it, fetch +
   forward-validate the resolver range through the shared `@ont/light-client` provider (same
   `fetchSignetLaunchHeaderSource`), then render. A fetch/validation miss still renders
   **resolver-mirror** (ownership shown, not Bitcoin-verified); **only a broken name-state read stays
   a 502**. This replaces the empty `BUILT_IN_HEADER_SOURCES` / block-170 stub and satisfies the
   **coverage-source honesty** criterion (spine §4) *by construction* — a real validated range, not a
   170/176 fixture. (Env-selected via `ONT_WEB_BITCOIN_HEADER_SOURCE`; the web server seam is
   **not** unchanged — the live name path becomes async.)

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

- **Web live path** — done in 4a step 6 (same HTTP provider, via the async live-name seam).
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

**4a (code):** hermetic default suite green — the `ont verify <name>` executable (and the web
async live-name seam) verify a real proof bundle against the resolver-served header range; the HTTP
provider validates the returned range exactly against the requested `(startHeight, count)`; a
missing/forged inclusion, a short/partial/gapped/mismatched range, and an unreachable/malformed
resolver each fail closed to non-authoritative; a header-store persist/backfill failure aborts
before the ingest cursor advances (no stranded gap); the block-170 fixture is gone from the live
path (coverage-source honesty); `consensus/src` zero-diff; all standing gates green.
**4b (live):** on signet, one real anchored claim verifies end-to-end from the CLI against the
resolver-served range reaching ≥ anchor + depth, labelled provider-trusted per #95 — the first live
"good/deployed" checkpoint DK asked for, claimed honestly.

## 8. Dispatch + review loop

Dispatch **4a** to codex now (steps 1–6, hermetic-first). I review each handback fresh-frame →
merge/push (standing authority) → ChatLunatique concurs on the spec/design deltas in parallel
(non-blocking). DK is looped only for **4b** operator actions and the 6c demo-scope timing.

**Review deltas folded (ChatLunatique, 2026-07-03, event `36bbf371`).** CL concurred with the
architecture (indexer→`ONT_STORE`→resolver sourcing; checkpoint+1 contiguity/backfill load-bearing)
and patched four seam details, all folded above: (1) **web async seam** — step 6 now specs an async
live-name path seam, not a static-registry entry (a synchronous `BitcoinHeaderSource` can't fetch
the anchor-dependent range); miss → resolver-mirror, only a broken name-state read → 502. (2)
**endpoint/port contract pinned** — `?startHeight=&count=` matching `fetchHeaderHex(startHeight,
count)` 1:1, client validates the returned range exactly (steps 3–4). (3) **persist-before-advance
invariant** — step 2 + §7 now require a header-store persist/backfill failure to abort before the
cursor advances, with a hermetic test. (4) **CLI wrapper** — step 5 now explicitly adds the
`ont verify <name>` executable (4b's operator walk drives it), not assumed to exist.
