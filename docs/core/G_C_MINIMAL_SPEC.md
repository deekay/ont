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
| **4a HEADER-SERVE** | indexer persists the checkpoint-forward header range → resolver serves it → HTTP `HeaderRangeProvider` client → wired into CLI (+ web) | **code-only, no operator gate — dispatchable now**; all hermetic-tested first | ChatLunatique |
| **A′ ENFORCE-FIXTURE** | generator for fixture batch material + compose/runbook enforcement-env wiring, so a real anchor drives real name-state → a servable proof bundle | **code + deploy plumbing, hermetic-tested; opt-in env** | ChatLunatique — **§9** |
| **4b STAND-UP** | boot the G3 signet stack, make one real signet claim, point the CLI at the live resolver, walk verify live | **DK operator action**; I spec exact G3-runbook commands when 4a + A′ land | DK (I spec) |

4a does not wait on DK; its validation code + tests are hermetic. **A′ (§9, `first-signet-a-prime`
#97)** is the slice that makes 4b's acceptance bar runnable at all — the bare G3 write-smoke
(§4c) broadcasts placeholder roots with no name leaves, so `ont verify` would return
`name-not-served`. A′ is code + deploy plumbing, also hermetic-tested; only the *live* walk (4b)
needs a running node. Ship 4a (done) → A′ → hand DK 4b as copy-paste.

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

## 3. 4a code contract (ChatLunatique)

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

## 6. 4b operator walk (DK) — copy-paste, A′-aware

**Preconditions.** 4a is merged (resolver serves the checkpoint-forward header range; `ont verify
<name>` exists) and A′ is merged (the `scripts/generate-fixture-batch-material.mjs` generator + the
indexer's opt-in `ONT_ENFORCEMENT=fixture-file`, off by default). Boot the G3 clean stack per
[G3 runbook §3](../operate/G3_CLEAN_SLATE_VPS.md); ports as there — publisher `:4176`, indexer
`:4174`, resolver `:4175`. This walk supersedes the G3 §4c write-smoke's **placeholder** roots with
A′'s **real** `(prevRoot, anchoredRoot)` so a name actually gets served. Honesty: DA is
`fixture-file` = provider-trusted (#95); the anchor tx + Merkle inclusion + checkpoint-forward
headers are the real light-client-checked part.

**The one ordering constraint that governs the whole walk.** The indexer reads the material file
**once, at boot**, when it wires enforcement (`selectIndexerEnforcement` → `loadBatchMaterialFile`,
[`select-enforcement.ts:38`](../../apps/indexer/src/live/select-enforcement.ts)) — **not** per-anchor.
So the file must be in the `ont_data` volume **before the indexer starts with
`ONT_ENFORCEMENT=fixture-file`**; with the env on and no file present the indexer **fails closed at
boot** (correct — never enforce against absent material). Order is therefore: **generate → place in
volume → (re)start indexer with enforcement on → broadcast the matching anchor → mine/confirm.**

### 6.1 Generate the fixture material + anchor input (off-box, before boot)

Run the A′ generator for the one real name to serve — it emits the material JSON in the exact
`decodeEncodedMaterial` shape **and** the matching publisher RootAnchor input `(prevRoot, newRoot =
anchoredRoot, batchSize)`:

```bash
# exact flag surface pinned on A′ handback; artifact shapes per §9
node scripts/generate-fixture-batch-material.mjs \
  --name <name> --owner-pubkey <64-hex> \
  --material-out batch-material.json --anchor-out root-anchor-input.json
```

`batch-material.json` → the indexer's fixture; `root-anchor-input.json` carries the real
`prevRoot`/`newRoot`/`batchSize` to broadcast (this **replaces** the §4c placeholder heredoc), minus
the `fundingInputs` filled from the live hop in §6.3.

### 6.2 Opt the indexer into enforcement + place the material (before it boots)

```bash
# from the repo dir (where .env / compose live); indexer is up on the default read-path from G3 §3.
docker compose cp batch-material.json indexer:/app/.data/batch-material.json   # land it in the ont_data volume
# opt IN for the stand-up (off by default per §9): set the two env on the indexer service, then recreate
#   so boot re-runs selectIndexerEnforcement and loads the file (exact opt-in mechanism — .env vs compose
#   override — pinned on A′ handback):
#     ONT_ENFORCEMENT=fixture-file
#     ONT_BATCH_MATERIAL_FILE=/app/.data/batch-material.json
docker compose up -d --force-recreate indexer
docker compose logs --tail=30 indexer   # MUST boot clean — any "batch material" / file error = stop, fix, before broadcasting
```

### 6.3 Fund → legacy-hop → assemble → sign → broadcast

Identical to [G3 §4c](../operate/G3_CLEAN_SLATE_VPS.md) steps 0–7, with **one substitution**: skip
§4c step 4's placeholder heredoc — use `root-anchor-input.json` from §6.1, filling its
`fundingInputs` with the `$HOP_TXID`/`$UTXO_VOUT` captured in §4c steps 1–3. Everything else — legacy
funding hop, `add_inputs:false`, legacy change, sign-then-`/broadcast` — is unchanged; the
⚠ legacy-serializable constraint still governs (the indexer drops witness bodies).

### 6.4 Confirm enforcement → verify from each surface

```bash
# after the anchor mines + confirms, the indexer enforces the batch and writes name-state:
curl -fsS "http://127.0.0.1:4174/tx/$ANCHOR_TXID"       # ingested
curl -fsS "http://127.0.0.1:4175/names/<name>/state"    # resolver now serves the proof bundle (404 = not enforced yet)

# CLI verify against the LIVE resolver-served header range:
ONT_BITCOIN_HEADER_SOURCE=resolver:http://127.0.0.1:4175 ont verify <name>   # → Bitcoin-verified (provider-trusted, #95)
```

Then repeat against **web** (the async live-name seam, 4a step 6) and — after the 6c wiring slice —
**mobile**. A `name-not-served`/404 means the material↔anchor `(prevRoot, anchoredRoot)` didn't match
`materialKey` (`` `${prevRoot}:${anchoredRoot}` ``) or the file wasn't in the volume at indexer boot
(§6.2) — those are the fail-closed paths, not a verify bug. **Acceptance = §7 4b**, now reached via a
real served name rather than a placeholder anchor.

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

Dispatch **4a** to ChatLunatique now (steps 1–6, hermetic-first) — DK removed codex from the
channel (context-leak with another project) and named ChatLunatique sole builder (event
`ba1464b4`, 2026-07-03). I review each handback fresh-frame → merge/push (standing authority). DK
is looped only for **4b** operator actions and the 6c demo-scope timing.

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

## 9. A′ ENFORCE-FIXTURE — fixture batch material so a real name gets served (`first-signet-a-prime` #97)

> **Added 2026-07-03** after an end-to-end trace of `ont verify <name>` against the deployed stack.
> DK ruled **A′** (decision `first-signet-a-prime` #97, event `90d23e5f`): the first signet
> checkpoint is a full ✓ Bitcoin-verified moment, sequencing free (cli/web-verified as an interim
> step is fine), driven through to mobile-green. Builder: ChatLunatique. Reviewer/writer:
> ClaudeleLunatique. Scoped by CL (event `748fc644`) + verified against the tree.

**Why this slice exists.** 4a serves headers and `ont verify <name>` fetches a **per-name proof
bundle** from the resolver (`GET /names/:name/state`). The resolver only serves that bundle after
the indexer **enforces a real batched claim** — which needs the **batch material** (committed
entries + base/served leaves), not just an on-chain anchor. The documented G3 write-smoke (G3
runbook §4c) broadcasts a `RootAnchor` with **placeholder roots and no name leaves** → no
name-state → `ont verify` returns `name-not-served`. A′ closes that with the **already-wired**
enforcement seam: supply fixture batch material for one real name, broadcast an anchor committing
that material's real `(prevRoot, anchoredRoot)`, and the indexer enforces → writes name-state →
resolver serves the proof bundle → every 4a surface goes Bitcoin-verified.

**Honesty boundary (#95).** Real, cryptographically checked by the light client: the anchor tx, its
Merkle inclusion, and checkpoint-forward header authenticity. Operator-asserted: the batch's
**data-availability** — the mode is literally `fixture-file`. That is exactly what signet is until
`GA-SIGNET-SOLUTION` (slice 9); **G-B** replaces it with real DA. Every surface keeps its
`provider-trusted` label; nothing here claims signet DA independence.

**Build contract (ChatLunatique) — hermetic-first, same discipline as 4a.**

1. **Generator script — `scripts/generate-fixture-batch-material.mjs`.** Input: one or more
   `{ name, ownerPubkey }` (accept an owner pubkey directly, or a dev secret to derive it via the
   existing `deriveOwnerPubkey`). Output **two** artifacts: (a) the batch-material JSON file in the
   **exact** shape the indexer's reader accepts (`{ materials: [{ anchoredRoot, prevRoot,
   committedEntries: [{ name, ownerPubkey }], baseLeaves: [{ keyHex, valueHex }], servedLeaves:
   [{ keyHex, valueHex }] }] }`), and (b) the matching **publisher RootAnchor input** —
   `(prevRoot, newRoot = anchoredRoot, batchSize)` — for the operator to broadcast. **Lift, do not
   re-implement:** the construction already exists in `packages/regtest-e2e/src/enforcement-e2e.ts:97-201`
   (name→leaf `sha256Hex(utf8ToBytes(normalizeName(name)))`, `accumulatorRootOf(base/full)`,
   `encodeMaterialFileEntry`); import the existing `@ont/*` package APIs. **Script-only:** export **no**
   new app/indexer surface; `packages/consensus/src` **zero-diff**.

   - **Correctness seam (pin with a test).** The generator's material must round-trip through the
     indexer's own reader `decodeEncodedMaterial` (`apps/indexer/src/live/select-enforcement.ts:135-153`),
     and the `(prevRoot, anchoredRoot)` it emits for the anchor MUST equal the key the indexer looks up
     (`materialKey(anchoredRoot, prevRoot)` = `` `${prevRoot}:${anchoredRoot}` ``) — otherwise enforcement
     fails closed with `batch material missing`. Add a test: generate material for a name → assert the
     loader accepts it and `batchMaterial(anchoredRoot, prevRoot)` resolves.

2. **Deploy plumbing.** The compose `indexer` service sets **no** enforcement env today
   (`ONT_SOURCE=node`, `ONT_STORE=file`, `ONT_STORE_DIR=/app/.data`, `ont_data` volume — verified).
   Add `ONT_ENFORCEMENT=fixture-file` + `ONT_BATCH_MATERIAL_FILE=/app/.data/batch-material.json`
   **opt-in / env-gated, defaulting OFF** so the plain RootAnchor read-path stays the compose default
   and A′ is explicitly opted into for the stand-up. `select-enforcement.ts` + `main.ts` already
   select it — **no daemon-logic change.** Grow `scripts/check-deploy-clean-stack.mjs` with a static
   requirement **iff** we make fixture-file the stand-up default, so the contract is documented +
   checked.

   - **Ordering (goes into §6).** The generated material file MUST be placed into the shared
     `ont_data` volume **before** the indexer ingests the anchor block, or enforcement throws
     `batch material missing` and fails closed (correct, but strands the demo). Operator step order:
     generate → place material in volume → broadcast anchor → mine/confirm.

3. **Tests + gates.** Generator round-trip test (above) + a hermetic enforce test proving generated
   material + a matching anchor drives the indexer to write name-state (reuse/extend the
   `enforcement-e2e.ts` harness). Standing gates green (`check:surfaces`, `check:audit-map`,
   `check-doc-links.sh`, `git diff --check`); `consensus/src` zero-diff.

**Mobile-green = the 6c wiring slice (now firmly in scope for "done").** A′ delivers ✓ on
**CLI/web immediately**. Mobile still shows no ✓: `mobile/src/screens/NameDetailScreen.tsx` loads
only `resolver.name()` → `/name/...` and the `mobile/src/api/resolver.ts` client has **no**
`/names/:name/state` method and never imports the present `mobile/src/verification/bitcoin.ts` core
(all verified). Under #97 the 6c slice (wire the name screen/api to the proof-bundle + header-range
+ on-device verify core, render the three states) is **committed, sequenced after A′**, not
timing-gated. Spec follows once A′ lands + the post-B5 mobile-rewrite state is confirmed (CL to
report that state as part of the A′ work-up).

**A′ acceptance bar.** The generator emits material the indexer's own reader accepts and enforces; a
real anchor committing that material's `(prevRoot, anchoredRoot)` drives a name-state write →
resolver serves the proof bundle → `ont verify <name>` and the web live path go **Bitcoin-verified**
against the 4a resolver-served header range (reaching ≥ anchor + depth), labelled `provider-trusted`
(#95); the enforcement env is opt-in/off-by-default; `consensus/src` zero-diff; standing gates green.
