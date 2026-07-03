# GA-OPTION-NODE — opt-in independent header provider (slice 8)

> **Status: BUILD SPEC. Writer: ClaudeleLunatique. Builder: ChatLunatique. Reviewer:
> ClaudeleLunatique (fresh-frame) → merge/push (standing authority, DK event 4c04419b).**
> Realises [G_TRACK_BUILD_SPINE.md](./G_TRACK_BUILD_SPINE.md) §2.1 slice 8 and design call
> §3(c) (own-node / Esplora "remains opt-in hardening against a stale/partial *real* chain — a
> liveness concern, orthogonal to the forge question"). Post-gate hardening — **not** on the
> G-C-MINIMAL demo critical path. No new consensus law and no new trust: `consensus/src`,
> `@ont/bitcoin`, and `@ont/adapter-header` are all **zero-diff**; this slice only adds new
> `HeaderRangeProvider` transports behind the *existing* untrusted-provider firewall, plus an
> env-selected provider branch on the client surfaces.

## 0. Purpose

Give a verifier the option to stop depending on the **operator's** resolver for the Bitcoin
header range, without changing what "Bitcoin-verified" means or what it trusts. Today every client
feeds its header range from `createResolverHeaderRangeProvider` (the operator's
`GET /bitcoin/header-range`). This slice adds two sibling `HeaderRangeProvider` transports — an
**Esplora** HTTP provider (any public/self-hosted Esplora, e.g. `https://mempool.space/signet/api`)
and, follow-on, an **own-node bitcoind-RPC** provider — selectable by env, so a verifier can source
headers from infrastructure it trusts for **liveness** instead of the operator's. The firewall that
makes a forged/short/withheld range fail closed is unchanged and untouched; the provider stays
**untrusted by contract** on every path.

## 1. The trust boundary (grounded finding — read before building)

**The firewall is downstream of the provider and already audited.**
`fetchCanonicalHeaderSource` (`packages/adapter-header/src/canonical-header-source.ts:96-115`)
treats its `HeaderRangeProvider` as an **UNTRUSTED** input by construction (module contract, line
10-14): it forwards the exact `(startHeight, count)`, then runs the response through
`buildCanonicalHeaderSourceFromHeaders` → `validateHeaderChain` (#82) against the **trusted**
launch-config checkpoint + params. A hostile provider — forged child, withheld tail, short/overlong
range, wrong network — yields **no source**, so the inclusion verifier cannot falsely accept. A new
provider inherits this firewall for free; it adds **zero trust**. This is why the slice is a pure
transport swap with `consensus/src`, `@ont/bitcoin`, and `@ont/adapter-header` **zero-diff**.

**The `HeaderRangeProvider` seam is a single async method**
(`packages/adapter-header/src/canonical-header-source.ts:17-20`):
`fetchHeaderHex(startHeight, count) => Promise<readonly string[] | null>` — "fetch exactly `count`
consecutive header hexes from `startHeight`, or `null` if unavailable/withheld." Both the existing
`createResolverHeaderRangeProvider` (`packages/light-client/src/index.ts:147-166`) and every new
provider implement exactly this. The core's exact-count firewall
(`canonical-header-source.ts:67-69`) already rejects a short/overlong response *before* validation,
so a provider that returns the wrong length simply fails closed.

**The one property this slice does NOT deliver on signet — and must not claim
(`signet-solution-gate` (#95)).** Sourcing headers from your own node or Esplora does **not** make
signet trustless. Per #95, signet PoW is not a security anchor: an operator can grind a header chain
that passes linkage + expected-bits + PoW, because BIP325 validity turns on the signet **challenge
signature** carried in block/coinbase data the 80-byte header validator never sees. So on signet an
own-node/Esplora header chain is **still provider-trusted for authenticity** — the win is purely
**liveness**: the verifier no longer depends on the *operator's* resolver being up and serving a
current range. The forge property on signet still waits on `GA-SIGNET-SOLUTION` (slice 9). On
**mainnet** an own node *would* buy forge-resistance (real PoW → real cumulative work), but mainnet
is hard-gated out of scope (spine §4). **Consequence:** the surface trust label is unchanged —
`signetHeaderAuthenticity: "provider-trusted"` regardless of which provider served the range
(`apps/cli/src/live-verify.ts:29`). No surface may imply that choosing own-node/Esplora upgrades
signet independence.

## 2. Decision — `header-provider-liveness` (#99), flagged concur

**Slice 8's signet deliverable is the Esplora fetch-provider (8a/8b); the own-node bitcoind-RPC
provider (8c) is spec'd but sequenced as a mainnet-facing follow-on, buildable on demand.** The
reasoning is the §1 finding: on signet both providers buy only **liveness**, and the Esplora
provider delivers that liveness **RN-safe, cross-surface (CLI/web/mobile), with no new RPC-credential
surface and no new node-only package**. The own-node provider's *distinct* payoff — forge-resistance
from real PoW — only materialises on mainnet, which is gated; on signet it is strictly equivalent to
Esplora for security while costing a Node-only graph + bitcoind creds. So the tight slice-8 scope is
Esplora; own-node is documented and ready but not built into the signet demo unless DK pulls it
forward.

- **Provider selection env — `ONT_HEADER_PROVIDER`.** New optional env var read at client
  verify-setup: `resolver` (default — **unset ⇒ identical to today**, zero behavior change),
  `esplora`, or `node`. An unknown value **fails closed at selection** (throws at config parse,
  mirroring the existing `${ONT_RESOLVER_URL_ENV} is set but empty` guard,
  `apps/cli/src/live-verify.ts:54`). `esplora` requires `ONT_ESPLORA_URL`; `node` requires the
  existing G1 bitcoind-RPC env — each missing ⇒ boot/selection throw.
- **Trust label unchanged (§1).** `signetHeaderAuthenticity` stays `provider-trusted` on all three;
  the provider choice is a liveness/source decision, not a trust upgrade.
- **`consensus/src`, `@ont/bitcoin`, `@ont/adapter-header` zero-diff.** This decision governs only
  the new transports + the selection branch.

*Status: engineering/scope call by ClaudeleLunatique within spine §3(c) (already-resolved design);
flagged concur — CL design-concur requested before canon (A4 pattern). Not a consensus-law or
trust-model change. DK override welcome, esp. on pulling own-node (8c) into the signet demo.*

## 3. Slices (hermetic-first; each lands a no-network test before any live wiring)

### 8a — ESPLORA-PROVIDER (code-only, RN-safe, hermetic, dispatchable after slice 7)

- **New `createEsploraHeaderRangeProvider({ esploraBaseUrl, fetchImpl? })` in `@ont/light-client`**
  (`packages/light-client/src/index.ts`, beside `createResolverHeaderRangeProvider`). Pure `fetch`,
  **no `node:` imports** — stays in the RN-safe graph so mobile can use it. Returns a
  `HeaderRangeProvider` whose `fetchHeaderHex(startHeight, count)`:
  - guards `startHeight`/`count` are well-formed and returns `null` on a malformed request without a
    fetch (defense-in-depth; the core already guards, but the provider must not throw);
  - for each height `h` in `[startHeight, startHeight + count)` in **ascending order**, resolves the
    header via Esplora's stable primitive: `GET {base}/block-height/{h}` → block hash (text),
    `GET {base}/block/{hash}/header` → 80-byte header hex (text, 160 lowercase hex chars);
  - returns the assembled array **only if** every height resolved to a well-formed 160-hex-char
    header and the array length is exactly `count`; **any** per-request non-200 / network error /
    timeout / malformed body ⇒ the whole call returns `null` (total + fail-closed, same contract as
    `createResolverHeaderRangeProvider` and `fetchServedLeaves` — never throws, never rejects, never
    a silently-shortened source).
  - **Cost note (documented, not a gate):** the range is small for the demo (checkpoint+1 through
    `anchorHeight + LAUNCH_CONFIRMATION_DEPTH`); the 2-requests-per-height cost is acceptable for an
    opt-in provider. A batched Esplora endpoint is a later optimisation, not this slice.
- **Tests** (`packages/light-client/src/index.test.ts`, beside the resolver-provider tests): injected
  `fetchImpl` serving a known height→hash→header map returns exactly the ordered range; a per-height
  404 / non-200 / network throw ⇒ `null`; a malformed header hex (wrong length / non-hex) ⇒ `null`;
  an out-of-order or short assembly can never occur (asserted by feeding a map missing one interior
  height ⇒ `null`). **Firewall-inheritance test:** feed the Esplora provider a *forged-child* header
  range through `fetchSignetLaunchHeaderSource` and assert it fails closed with the **same**
  `validateHeaderChain` reject as the resolver provider would — proving zero added trust.

### 8b — ESPLORA SELECTION WIRE (code-only, hermetic) — CLI + web + mobile

- **`ONT_HEADER_PROVIDER` branch** folded into the existing selection seams:
  - **CLI:** `selectCliVerifyHeaderProvider` (`apps/cli/src/live-verify.ts:61-67`) — when
    `ONT_HEADER_PROVIDER=esplora`, read `ONT_ESPLORA_URL` (empty/missing ⇒ throw, same shape as the
    resolver-url guard) and return `createEsploraHeaderRangeProvider(...)`; `resolver`/unset ⇒
    unchanged resolver path; unknown value ⇒ throw. **Default path byte-identical to today.**
  - **Web:** the analogous server-side provider selection (the `async web live-name seam` wired at
    `28abf3c8` / 6c) gains the same branch.
  - **Mobile:** `mobile/src/verification/…` (the 6c wire that builds
    `createResolverHeaderRangeProvider(API_BASE)`) gains an optional Esplora source behind the same
    env/config key, RN-safe (the Esplora provider is pure-fetch). Mobile exposes only
    `resolver | esplora` — `node` is not offered on mobile.
- **Tests** (beside `live-verify.test.ts` + web/mobile selection tests): `ONT_HEADER_PROVIDER=esplora`
  + `ONT_ESPLORA_URL` ⇒ an Esplora provider is selected; `=esplora` without `ONT_ESPLORA_URL` ⇒
  throw; unset ⇒ resolver provider (regression guard: default unchanged); unknown value ⇒ throw. A
  surface-level conformance test asserting the trust label stays `provider-trusted` under the Esplora
  provider (§1 / §2 — no over-claim).

### 8c — OWN-NODE bitcoind-RPC PROVIDER (code-only, node-only) — **deferred / mainnet-facing, build on demand**

*Spec'd complete and ready; **not** required for the signet demo (§2 — adds no signet security beyond
8a's liveness). Buildable in isolation the moment DK asks, or when mainnet enters scope where it earns
real forge-resistance.*

- **New node-only home to avoid a package cycle.** The provider needs both the bitcoind RPC client
  (`packages/bitcoin/src/node.ts`, `@ont/bitcoin/node` subpath — `getblockhash` / `getblockheader`)
  **and** the `HeaderRangeProvider` type (`@ont/adapter-header`, which itself imports `@ont/bitcoin`).
  Putting the provider *inside* `@ont/bitcoin/node` would create `bitcoin → adapter-header → bitcoin`
  — a package cycle. **Recommended:** a small **new node-only package `@ont/header-provider-node`**
  depending on `@ont/bitcoin/node` + `@ont/adapter-header`, exporting
  `createBitcoindHeaderRangeProvider(rpc)`. It is node-only and **never imported by mobile**, so
  `check:mobile-verify-graph` stays green by construction. *Flagged alternative:* inline the ~30-line
  provider separately in `apps/cli` + `apps/web` server code (no new package, minor duplication) — CL
  design-concur picks; recommend the package for the single home.
- **`fetchHeaderHex(startHeight, count)`:** for each `h` in `[startHeight, startHeight+count)`,
  `getblockhash h` → `getblockheader hash false` → 80-byte header hex; same total + fail-closed
  contract as 8a (any RPC error / malformed ⇒ `null`, exact-count-or-`null`). Reuses the G1 RPC
  client + its existing env (`apps/indexer/src/live/node-block-source.ts` is the wiring precedent);
  no new RPC surface invented.
- **`ONT_HEADER_PROVIDER=node`** branch in the CLI + web selection seams (not mobile), reading the
  existing bitcoind-RPC env; missing ⇒ selection throw.
- **Tests:** injected RPC stub returns a known range → provider assembles it; RPC error / wrong-length
  ⇒ `null`; the same forged-child firewall-inheritance assertion as 8a.
- **Trust-label reminder in code + doc:** on signet this is provider-trusted (§1); its forge-resistance
  value is a **mainnet** property, called out where it's wired so no one reads "own node = trustless
  signet."

## 4. Watchpoints (my review gate — CL, hold these)

1. **`consensus/src`, `@ont/bitcoin`, `@ont/adapter-header` all zero-diff** — verified by
   `git diff --stat`. The firewall is not touched; this slice only *adds* providers + a selection
   branch. (If 8c lands, `@ont/bitcoin/node` may gain nothing — the provider lives in the new package.)
2. **RN-safe graph preserved** — `npm run check:mobile-verify-graph` green. The Esplora provider (8a)
   is pure-`fetch`, **no `node:` imports**; the own-node provider (8c) must **not** be reachable from
   `@ont/light-client` or any mobile-imported module (it lives in a node-only package/app path).
3. **Provider stays untrusted → firewall unchanged.** Every new provider feeds
   `fetchSignetLaunchHeaderSource` → `validateHeaderChain`. The forged-child firewall-inheritance test
   (8a + 8c) must show the **same** `validateHeaderChain` reject as the resolver provider — no relaxed
   path, no bypass, no second verifier (spine §3(e), one shared verify core).
4. **Exact-count + ascending-order + fail-closed at the transport.** `fetchHeaderHex(startHeight,
   count)` returns exactly `count` consecutive ascending headers or `null`. A partial / overlong /
   out-of-order / malformed-hex response ⇒ `null`. Any per-request non-200 / network error / timeout ⇒
   `null` — never a throw that escapes the seam, never a silently-shortened source.
5. **Default unchanged (no regression).** `ONT_HEADER_PROVIDER` unset ⇒ resolver provider selected ⇒
   the 4a/4b/6c live verify path is byte-identical to today. Unknown value / missing required sub-env
   ⇒ fail closed at selection (throw), mirroring the existing empty-resolver-url guard.
6. **No over-claim on signet (`signet-solution-gate` (#95)).** `signetHeaderAuthenticity` stays
   `provider-trusted` under every provider; no surface copy, label, or test implies own-node/Esplora
   upgrades signet independence. The win is liveness only (§1).
7. **No liveness/currentness creep.** Slice 8 adds **no** tip-selection, fork-choice, or reorg /
   confirmation-currentness decision (spine §4 freshness invariant — the adapter decides no
   currentness). Each provider serves the same fixed `[checkpoint+1, anchor+depth]` range; it is a
   transport swap, not a new consensus decision.
8. **Standing gates green** — `scripts/check-doc-links.sh`, `npm run check:surfaces`,
   `npm run check:audit-map`, `git diff --check`, root 26-workspace build + suite.

## 5. Operator / user staging (opt-in — no DK gate)

Unlike A′ / 7, slice 8 needs **no DK operator action**: it is verifier-side opt-in config, provable
hermetically, and the default path is unchanged.

- **Esplora (8a/8b):** the verifier sets `ONT_HEADER_PROVIDER=esplora` +
  `ONT_ESPLORA_URL=https://mempool.space/signet/api` (or any signet Esplora). Documented in
  `.env.example` with the §1 liveness-not-trust caveat.
- **Own node (8c, if built):** `ONT_HEADER_PROVIDER=node` + the existing G1 bitcoind-RPC env pointed
  at the verifier's own signet node.

## 6. Acceptance bar (slice-8 gate)

A verifier sets `ONT_HEADER_PROVIDER=esplora` (+ `ONT_ESPLORA_URL`), the client sources its header
range from Esplora instead of the operator's resolver, and the **same** `verifyProofBundleAgainst
Bitcoin` gate reaches the **same** verdict — Bitcoin-verified on a good range, **fail-closed** on a
forged / short / withheld / wrong-network range — with the trust label unchanged at
`provider-trusted` (signet); `ONT_HEADER_PROVIDER` unset is byte-identical to today; conformance
tests pin the provider, the selection branch, and firewall-inheritance; `consensus/src`,
`@ont/bitcoin`, `@ont/adapter-header` are zero-diff and `check:mobile-verify-graph` is green. That is
spine §3(c)'s opt-in liveness hardening delivered honestly — a verifier can stop depending on the
operator for headers without changing what is trusted or claimed. (8c own-node extends the same
property to a self-run node and unlocks real forge-resistance **at mainnet**, out of scope here.)

## 7. Dispatch

- **After slice 7 lands:** 8a (Esplora provider in `@ont/light-client`) — code-only, RN-safe, no
  operator gate. Then 8b (selection wire across CLI/web/mobile), each hermetic-first. 8c (own-node)
  is deferred per §2 — dispatch only if DK pulls it forward or mainnet enters scope.
- **Review loop:** CL builds each sub-slice in a worktree → hands back with the §4 gates → I
  fresh-frame review against this spec → merge/push (standing authority) → CL design-concurs on the
  `header-provider-liveness` (#99) delta in parallel (flags before canon). DK looped only if the #99
  scope call (Esplora-first, own-node-deferred) is contested or he wants own-node in the signet demo.
