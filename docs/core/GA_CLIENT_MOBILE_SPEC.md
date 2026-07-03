# GA-CLIENT-MOBILE — slice spec (G-A slice 6)

> **Status: BUILD SPEC. Writer + reviewer: ClaudeleLunatique (fresh-frame review + merge, standing
> authority DK event 70fce3fe). Builder: ChatLunatique** — reassigned from codex by DK (event
> `e2ad4ab7`, 2026-07-03; codex out). 6a `bitcoin-rn-safe-entry` is DONE/canon (`4752e83c`); the
> remaining build is **6b** (RN gate + `mobile/checks/` conformance battery). With codex out there is
> no parallel second-frame, so my fresh-frame review is the **sole** independent gate — the two
> load-bearing tripwires (§A1 resolver-based reachable Metro graph walk; §C honest header-depth coverage)
> plus the full §D boundary guards are hard acceptance, not advice. Companion to
> [G_TRACK_BUILD_SPINE.md](./G_TRACK_BUILD_SPINE.md) §2.1 slice 6; derives from that spine's ratified
> design calls §3(c)/(d)/(e) and boundary guards §4, and from the sibling
> [GA-CLIENT-WEB spec](./GA_CLIENT_WEB_SPEC.md) (slice 5). It adds **no new design law** and pins the
> concrete file/bundle boundary for the mobile surface — plus the one genuinely new thing this surface
> forces: an **RN-safe verify-core import path**, because mobile is the first consumer that runs the core
> off Node.
> Peers this slice must not fork: [GA-CLIENT-CLI](./G_TRACK_BUILD_SPINE.md) (slice 3, `4f28d11e`) and
> [GA-CLIENT-WEB](./GA_CLIENT_WEB_SPEC.md) (slice 5, `28abf3c8` + provider `64518fda`).

## 1. Where this slice sits

The resolver **emits** per-name proof bundles carrying `bitcoinInclusion` and **serve-gates** them
against Bitcoin's inclusion layer (GA-EMIT, `33324961`); the CLI (`4f28d11e`) and web (`28abf3c8`,
real provider `64518fda`) both **consume** them through the shared `@ont/light-client` core. This slice
makes the **iOS app the third consuming surface** and the **first hard gate for mobile** (spine §2.1
slice 6): the app shows ownership as *Bitcoin-verified* only after **the user's own device**
independently re-derives it against Bitcoin from the bundled `@ont/launch-config` checkpoint, and shows
a loud *resolver mirror — not yet Bitcoin-verified* state otherwise. `packages/consensus/src` stays
**zero-diff**.

## 2. Trust-boundary honesty (read this first)

Mobile is the **strongest** surface in the trust model, and the spec must not undersell or oversell it:

- **Stronger than web.** On web the *server* verifies as a resolver client and the browser trusts the
  server (GA-CLIENT-WEB §2). On mobile the **end user's own device** runs `verifyProofBundleAgainstBitcoin`
  over the bundled checkpoint — there is no server in the trust path for the verify itself. Copy may say
  "verified against Bitcoin on this device."
- **Still bounded by #95 on signet.** Per `signet-solution-gate` (#95) the signet header chain is
  **provider-trusted for authenticity** (header-only validation cannot give "operator can't forge" on
  signet). The independent guarantee on every network is the **inclusion-proof layer**. Mobile must
  **not** claim signet header independence — same label discipline as CLI/web. On mainnet (post-freeze
  checkpoint) the header-authenticity property comes free from PoW.

The behavior contract: a "Bitcoin-verified" mark on mobile means **this device ran the audited core over
a real header source covering the anchor range + launch confirmation depth** — never "the resolver says
so."

## 3. §A — The mobile-location wrinkle, resolved (the crux of this slice)

The mobile app is **`mobile/`** — a **top-level Expo / React Native iOS app (~9.5k lines), out of the
npm workspace** (SOFTWARE_INVENTORY.md:58; SOFTWARE_CANON.md:223 "the out-of-workspace `mobile/` app"),
a prototype signet demo slated for a post-B5 rewrite consuming `@ont/*` (ruled call 4). Two consequences
drive this slice, and both are pinned below.

### (A1) `bitcoin-rn-safe-entry` — the verify core is not RN-importable as packaged (**hard blocker**)

**Finding (grounded, 2026-07-03):** the verify math is already RN-safe — every hash in the verify path
is `@noble/hashes/sha2` (pure JS: `packages/bitcoin/src/{block-header,merkle-proof,validate-header-chain,legacy-tx}.ts`),
and `@ont/light-client` / `packages/consensus/src` contain **no** Node built-ins. **But** the transitive
graph is `@ont/light-client → @ont/adapter-header` (`canonical-header-source.ts:7`) **and**
`→ @ont/consensus` (`proof-bundle.ts:10`, `engine.ts:6`, `gate-fee.ts:22`) **→ `@ont/bitcoin`**, and
`@ont/bitcoin/src/index.ts:1` has a **top-level `import { readFileSync } from "node:fs"`** in the **same
barrel** that re-exports the pure validators (`readFileSync` used at `:346` for a header-file loader;
`Buffer.from` at `:770` for bitcoind-RPC basic-auth). Metro/Hermes cannot resolve `node:fs`, so importing
**any** symbol from `@ont/bitcoin` — which the core does transitively — **fails the mobile bundle at
resolution time**. This is exactly ChatLunatique's flagged "import boundary" risk, and it is a real
blocker, not a packaging nicety.

**Decision `bitcoin-rn-safe-entry`** (needs CL flag before canon): split `@ont/bitcoin`'s Node-only code
out of its default entry so the default entry is **pure-JS, RN-safe**, and the verify core's transitive
graph carries **zero `node:` built-ins**.

- **Move** the Node-only members into a new **`@ont/bitcoin/node`** subpath (new `packages/bitcoin/src/node.ts`,
  wired via `package.json` `exports`): the `readFileSync`-based header/tx **file loader** (`:346` region)
  and the **bitcoind-RPC client** (the `Buffer.from` basic-auth path, `:770` region). The top-level
  `import { readFileSync } from "node:fs"` moves **with them** and leaves `index.ts` entirely.
- **Keep** in the default `@ont/bitcoin` entry, and define "pure default" **tightly** (CL 2nd-frame): the
  pure `@noble`-only validators + only the parsers/types the verify graph actually consumes —
  `serializeLegacyTransaction`/`parseLegacyTransaction`/`legacyTxidOf`, `bitsToTarget`/`headerMeetsTarget`,
  `merkleRootFromProof`, `validateHeaderChain`, transaction/header types (grounded: `packages/consensus/src`
  imports exactly `headerMeetsTarget`, `merkleRootFromProof`, `legacyTxidOf`, and tx/header types — none
  Node-only) — **byte-identical**, no logic change. **Nothing else earns the default entry:** any broad
  block-source client or poller not on a real mobile/web verify path moves to `/node` too. `Buffer` already
  existing in mobile for wallet deps is **not** a licence to leave a bitcoind-RPC client reachable from the
  verify bundle.
- **Subpath wiring is three edits, not one** (CL 2nd-frame, grounded 2026-07-03 — all sites confirmed to
  exist): (i) add `@ont/bitcoin/node` to `packages/bitcoin/package.json` `exports` (today it exposes only
  `"."` → `dist/index.js`); (ii) add the matching `tsconfig.base.json` path mapping; (iii) move the current
  Node-only consumers onto the subpath — the grounded set is `apps/indexer/src/live/node-block-read-port.ts`,
  `apps/publisher/src/live/select-broadcast.ts`, and `packages/node-live/src/{chain-gate,resolve-node-runtime}.ts`.
  Treat that as the **starting** set, not the closed one: the true consumer set is whatever `tsc` + the
  suites surface once the loader + RPC leave the default entry. Mechanical, test-covered move.
- **Zero-behavior-change proof (acceptance for A1):** the pure validators are byte-identical; the full
  `@ont/bitcoin`, `@ont/consensus`, `@ont/adapter-header`, `@ont/light-client`, `@ont/cli`, `@ont/web`
  test suites stay **green unchanged**; **`packages/consensus/src` is zero-diff** (consensus imports the
  pure validators, which do not move).
- **Bundle-graph smoke (the load-bearing new assertion — acceptance, not advice, per CL 2nd-frame):** a
  **resolver-based, reachable-only** static graph walk rooted at the **actual mobile verify entry**, using
  the **same Metro config / `extraNodeModules` mapping mobile will ship** and **honoring package `exports`**,
  asserting the reachable graph contains **no `node:*` specifier** and **no `@ont/bitcoin/node` edge**. A
  source-tree or `dist/` **grep is explicitly the wrong proof** — TS path builds leave nested copied package
  files under `dist/` and tests legitimately contain `node:` imports, so a grep both false-positives and
  false-negatives. The static reachability walk is the load-bearing guard; a Metro bundle of the verify
  entry succeeding is the integration-level confirmation on top, not a substitute. Runs in CI **without an
  Xcode build**.
- **Rejected alternative — Metro `node:fs`/`Buffer` shims:** leaving `@ont/bitcoin` as-is and shimming
  `node:fs` to empty + polyfilling `Buffer` is **rejected as the design** — it ships a dead file loader
  and a live **bitcoind-RPC client** into the phone bundle and hides the boundary violation. It stays only
  as a break-glass fallback if the split is somehow infeasible; the split is strongly preferred.

### (A2) Consuming `@ont/*` across the out-of-workspace boundary

`mobile/` is **not** in the npm workspace, so it cannot resolve `@ont/light-client` by workspace symlink
the way `apps/*` do. Wire it the **standard RN-monorepo way, no reimplementation**:

- **Metro resolver** (`mobile/metro.config.js`): add the repo root to `watchFolders` and map the
  verify-graph packages via `resolver.extraNodeModules` — **map package roots and honor each package's
  `exports`**, not raw `dist/` paths (CL 2nd-frame: exports resolve to nested paths like
  `dist/light-client/src/index.js`, so a raw-`dist/` mapping is ambiguous and can diverge from what the
  CLI/web resolver sees). The packages: **`@ont/light-client`, `@ont/consensus`, `@ont/adapter-header`,
  `@ont/bitcoin`, `@ont/launch-config`**. No `@ont/bitcoin/node`, no `@ont/adapter-*` server pieces. The A1
  graph smoke must walk **this same mapping** so the guard proves the graph mobile actually ships.
- **The audited core is imported, never copied.** SOFTWARE_CANON L5: surfaces consume L1–L4, they never
  reimplement rules. Mobile calls the **same** `runVerifyProofBundleAgainstBitcoin` +
  `checkProofBundleHeaderDepthCoverage` symbols as CLI/web. Any hand-rolled verify in the current
  prototype is deleted, not paralleled.
- **No new package for mobile glue.** The RN-side glue (fetch the served bundle, build/inject the header
  source, call the core, map to view state) lives **inside `mobile/`**; it is app code, not a package.

## 4. §B — The mobile gate (parity with CLI/web, spine §3(d))

Mobile runs the identical two-check gate and renders three states:

1. **Fetch the served proof bundle** for the name's current ownership from the resolver it queries
   (same served shape GA-EMIT produces; RN global `fetch`; fail-closed / `null` on malformed body).
2. **Build + inject the header source.** Hermetic-fixture-first, exactly like web §(b2): no provider ⇒
   the core returns `missing-header-source` ⇒ non-authoritative. The **live** provider is built from the
   `@ont/launch-config` checkpoint via `fetchSignetLaunchHeaderSource` (RN-safe — global `fetch`),
   **forward-validated** from the checkpoint (spine §3(c)); env/config-selected so it drops in at
   G-C-MINIMAL without an app rewrite.
3. **Run the core, map the result:**
   - `runVerifyProofBundleAgainstBitcoin({ bundle, headerSource })` → `ok:true`, **and**
   - `checkProofBundleHeaderDepthCoverage(...)` confirms the validated range reaches **anchor height +
     launch confirmation depth (K = 6)** → **Bitcoin-verified** (only when *both* pass).
   - `missing-header-source` | `unverified` | `malformed` | no bundle | short/stale/partial range →
     **resolver mirror — not yet Bitcoin-verified**: ownership is **still shown** under a loud banner
     (spine §3(d): show, don't hide). Never a thrown render — a verify miss is a *state*.
   - Invalid name / absent / transport error → existing unavailable/error views.

On **signet**, the verified state carries the #95 label (header authenticity provider-trusted; the
independent guarantee is the inclusion proof). Never assert signet header independence.

## 5. §C — Freshness / coverage-source honesty (spine §4 — carry the WEB CL criterion forward)

The GA-CLIENT-WEB CL pass tracked a **coverage-source-honesty** criterion (spine §4): the depth check
tests header **presence** at anchor + depth, so a dishonest provider that returns the same header bytes at
two heights could pass a presence-only gate. Mobile must honor it: the header source feeding
`checkProofBundleHeaderDepthCoverage` must be a **semantically honest coverage source** (distinct, real
headers at anchor and at anchor+K), **not** a fake-repeat stub. Assert in a test that a **stale / short /
partial** range is non-authoritative **even when the anchor header itself validates** — identical to the
web §D assertion. K = 6 comes from the shared `@ont/launch-config` constant (added in the web slice); do
not fork a mobile-local depth value.

## 6. §D — Boundary + scope guards (codex must hold all)

- `packages/consensus/src` **zero-diff**; the `@ont/bitcoin` split moves **only** Node-only code, pure
  validators byte-identical; audit-map ratchet green.
- **Verification runs on-device**, over the bundled `@ont/launch-config` checkpoint — no trust in the
  resolver's word for the verify.
- **Fail closed everywhere:** missing bundle, `missing-header-source`, `unverified`, `malformed`, or a
  stale/short/partial range ⇒ **never** presented as Bitcoin-verified.
- **Honest labels:** "verified against Bitcoin on this device"; signet header authenticity is
  provider-trusted (#95); no signet-header-independence claim.
- **No `node:` built-in in the mobile verify bundle** (the A1 smoke). No reimplemented verifier anywhere
  in `mobile/`.
- **Standing gates green:** `scripts/check-doc-links.sh`, `npm run check:surfaces`,
  `npm run check:audit-map`, `git diff --check`. (`check:surfaces` scans the `apps/*` allowlist; `mobile/`
  is out-of-workspace and not on it — do not add it. `@ont/bitcoin/node` is a package subpath, not a
  surface/manifest entry: normal `exports` wiring only.)

## 7. §E — Fixture strategy + tests (default-suite hermetic; no Xcode in CI)

Parity means the **same fail-closed battery** as CLI/web, runnable **node-side without an Xcode build**,
plus a thin in-app smoke:

- **Conformance battery in `mobile/checks/`** (same home + discipline as the existing 12-word
  cross-surface conformance): node-executable tests over the shared signet fixture (checkpoint **311445**,
  bundle anchored at **311446**, depth **K = 6**) asserting, against the **real `@ont/light-client`
  symbols**:
  1. good bundle + honest coverage source through anchor+K ⇒ **Bitcoin-verified**;
  2. no header provider ⇒ `missing-header-source` ⇒ non-authoritative, ownership still shown;
  3. forged / missing `bitcoinInclusion` ⇒ `unverified`/`malformed` ⇒ non-authoritative;
  4. stale / short / partial range (does not reach anchor+K) ⇒ non-authoritative **even though the anchor
     header validates** (§C);
  5. **parity assertion:** the mobile gate maps the SAME core results to the SAME three states the
     CLI/web slices do (no forked verdict logic).
- **RN bundle smoke:** the A1 graph assertion (no `node:` built-in in the mobile verify graph); a Metro
  bundle of the verify entry succeeds.
- **In-app gate smoke** (RN test runner): the view-model maps `ok:true`+coverage → verified badge, and
  every miss → the loud non-authoritative state without throwing.
- **Live wiring** (real `@ont/launch-config` provider over signet) is **env/config-selected** and
  exercised at **G-C-MINIMAL**, not in the default suite.

## 8. §F — Scope split + the one DK call

This slice is scoped to the **gate + conformance core**, not an app rewrite:

- **6a `bitcoin-rn-safe-entry`** (§A1) and **6b RN gate + `mobile/checks/` conformance battery** (§B/§C/§E)
  are **code-only, not DK-gated** — they proceed now under standing merge authority, same as 5b. 6a is a
  clean prerequisite that also benefits CLI/web (a genuinely pure `@ont/bitcoin` default entry).
- **6c in-app UI wiring** — rendering the verified / non-authoritative states in the live `mobile/`
  screens — is **entangled with the post-B5 mobile rewrite** (ruled call 4). It can ride that rewrite or a
  minimal prototype patch. **The one call for DK** (already noted at ASSESSMENT_EXECUTION_PLAN.md:113):
  *does the first signet demo ship the mobile surface, or defer it to a fast-follow?* The gate is ratified;
  only the demo-scope **timing** is DK's. 6a+6b make mobile **ready** either way; 6c's depth follows DK's
  timing answer. This does not block G-C-MINIMAL.

## 9. §G — Acceptance + review loop

Slice done when: `@ont/bitcoin` exposes an RN-safe pure default entry with the Node-only code behind
`@ont/bitcoin/node` (all suites green unchanged, `packages/consensus/src` zero-diff — if this slice touches
`packages/consensus/src`, treat it as suspect and stop); the subpath is wired in **all three places**
(`package.json` `exports`, `tsconfig.base.json` path, every Node-only consumer moved); `mobile/` consumes
`@ont/light-client` via Metro with **no reimplemented verifier and no `node:` built-in in the verify
bundle**, the latter **proven by a resolver-based, reachable-only graph walk over the shipping Metro
mapping — not a source/`dist` grep** (CL 2nd-frame acceptance requirement); the `mobile/checks/` battery +
in-app smoke are green with every fail-closed case above; the live header-source seam is present and
env-selected (fixture default); and all standing gates pass. Loop (6b, post-reassignment):
**ChatLunatique builds → I review against this spec (fresh frame) → I merge/push (standing authority).**
codex is out, so there is no parallel second-frame; my fresh-frame review is the sole independent gate and
holds the §A1/§C tripwires + §D guards hard. DK is looped only for the §F demo-scope timing call (6c) —
no new operator action for 6a/6b.
