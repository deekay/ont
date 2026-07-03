# GA-CLIENT-WEB — slice spec (G-A slice 5)

> **Status: BUILD SPEC. Writer: ClaudeleLunatique. Reviewer: ChatLunatique (concur requested —
> flag the new-package call before canon). Merge authority: standing (DK, event 70fce3fe).
> Builder: codex.** Companion to [G_TRACK_BUILD_SPINE.md](./G_TRACK_BUILD_SPINE.md) §2.1 slice 5;
> derives entirely from that spine's already-ratified design calls §3(c)/(d)/(e) and boundary
> guards §4 — it adds **no new design law**, it pins the concrete file boundary for the web slice.
> Peers: [GA-CLIENT-CLI](./G_TRACK_BUILD_SPINE.md) (slice 3, landed `4f28d11e`) is the sibling
> surface this slice must not fork.

## 1. Where this slice sits

The resolver already **emits** per-name proof bundles carrying `bitcoinInclusion` and **serve-gates**
them against Bitcoin's inclusion layer (GA-EMIT, `33324961`). The CLI already **consumes** them:
`runVerifyProofBundleAgainstBitcoin` requires a header source and rejects anything the audited
`verifyProofBundleAgainstBitcoin` does not accept (GA-CLIENT-CLI, `4f28d11e`). This slice makes the
**web read path** the second consuming surface: it shows ownership as *Bitcoin-verified* only after
the web server independently re-derives it against Bitcoin from the bundled checkpoint, and renders a
loud *resolver-mirror — not yet Bitcoin-verified* banner otherwise. `packages/consensus/src` stays
**zero-diff**.

## 2. Trust-boundary honesty (read this first)

The web is **server-rendered pure HTML — no client bundle, no browser crypto** (`render-name-view.ts`
header). So "the client verifies" here means **the web server process verifies as a client of the
resolver** — it is a *distinct* process from the resolver and re-derives ownership itself rather than
trusting the resolver's word. The browser still trusts the web server; that is inherent to
server-rendered web and is **weaker** than CLI/mobile, where the end user's own device verifies.

The behavior contract therefore is: a "Bitcoin-verified" mark means **the web server independently ran
`verifyProofBundleAgainstBitcoin` over a real header source covering the anchor range** — it must
**not** be worded to imply the browser verified. Copy says "verified against Bitcoin by this resolver
explorer," never "you verified." Per `signet-solution-gate` (#95) the signet header chain is
**provider-trusted for authenticity**; the web must **not** claim signet header independence.

## 3. §A — Shared verify-core lift → new `@ont/light-client` package

**Decision `light-client-core-home`** (implements ratified spine §3(e) "one shared verify core, never
a parallel implementation"; ChatLunatique concur requested on the new-package call): the verify core
currently lives in `apps/cli/src/verify-commands.ts` — an **app**, which the web (`@ont/web`) cannot
import. Lift the proof-bundle light-client cores into a **new `@ont/light-client` package** so cli,
web, and (slice 6) mobile share one implementation.

- **Moves** (verbatim, no behavior change) from `apps/cli/src/verify-commands.ts` into
  `packages/light-client/src`:
  - `runVerifyProofBundleAgainstBitcoin` + `VerifyProofBundleAgainstBitcoinInput` /
    `VerifyProofBundleAgainstBitcoinResult`
  - `runInspectProofBundle` + `InspectProofBundleResult`
  - `isBitcoinHeaderSource`
- **Stays** in the CLI: the recovery-wallet-proof message/verify cores (`renderRecoveryWalletProofMessage`,
  `runVerifyRecoveryWalletProof`) — those are CLI-message surfaces, not the light-client gate. The CLI
  **imports** the moved cores from `@ont/light-client` (re-export from `verify-commands.ts` if existing
  CLI call sites/tests reference them by that path).
- **Zero-behavior-change proof:** the existing CLI verify tests (verify-commands 12/12, incl. the
  raw-verifier-accepts-but-CLI-rejects executable-proof case) stay green **unchanged** after the move.
  That is the acceptance for §A — the lift is a pure refactor.
- **Boundary:** `@ont/light-client` depends on `@ont/consensus` (for `verifyProofBundleAgainstBitcoin`,
  `verifyProofBundleStructure`, `BitcoinHeaderSource`, report types) — it is a **thin orchestrator over
  the audited boundary, outside the audited manifest.** `packages/consensus/src` **zero-diff**; the
  audit-map ratchet (#94 A3) stays green with `@ont/light-client` registered as a non-consensus surface.
  Register the package in the surfaces map so `npm run check:surfaces` passes. Package layout follows the
  `@ont/launch-config` template (single `src/index.ts` re-export is fine).
- The mandatory-header-source-at-the-boundary invariant travels **with the core** (the core itself
  returns the distinct `missing-header-source`, never `ok:true`, when the source is absent — consensus
  leaves it optional for Merkle/PoW-only). Keep the in-code comment that pins this. This is OPEN(a) core
  strength: the executable CLI verify is strictly stronger than the raw verifier, and that must survive
  the move.

## 4. §B — Web read-path wiring

### (b1) Surface the served proof bundle
The web renders from `WebReadPort` (`web-read-port.ts`), which today returns `valueHistory` /
`recoveryHistory` / `tx` — **no proof bundle**. Extend the port so the render path can obtain the
**served proof bundle (carrying `bitcoinInclusion`) for the name's current ownership**, mirroring how
GA-EMIT serves it. In the live path this is fetched alongside the served value state (the
`resolver-tx-source.ts` / `select-resolver-tx-source.ts` pattern — request-scoped, fail-closed on
malformed body, `null` when not served). Keep the existing "reads ONE resolver, no fan-out / no
canonical-by-longest-chain" boundary (MR1 carry-forward) intact.

### (b2) Header-source injection seam (hermetic first, live env-selected)
The verify core needs a `BitcoinHeaderSource`. There is **no real header-source builder wired yet** —
only the `BitcoinHeaderSource` interface in `@ont/consensus`. So:
- **Hermetic default (this slice):** inject a **fixture header provider** (same discipline as the CLI's
  hermetic fixture). No provider configured ⇒ the core returns `missing-header-source` ⇒ the web renders
  the non-authoritative banner, never "verified". This keeps the default suite network-free.
- **Live (env-selected, lands with G-C-MINIMAL):** the **real** provider is built from the
  `@ont/launch-config` checkpoint, resolver-served and **forward-validated** from that checkpoint
  (spine §3(c)). Web must expose the **same injection seam** the CLI will use so the real provider drops
  in without a web rewrite — do **not** hardcode the fixture. The seam is env-selected exactly like
  `selectResolverTxSource` (unset ⇒ no provider ⇒ non-authoritative; set-but-empty ⇒ throw, fail closed).

### (b3) Run the core, map the result
Call `runVerifyProofBundleAgainstBitcoin({ bundle: servedProofBundle, headerSource })` and map:
- `ok:true` → **Bitcoin-verified** state (only here).
- `missing-header-source` | `unverified` | `malformed` | no served bundle → **non-authoritative**
  banner. The render path stays **total — never throws** (the existing `renderNameView` try/catch →
  unavailable/error contract is preserved; a verify failure is a *state*, not an exception).

## 5. §C — UX / behavior contract (spine §3(d): show, don't hide)

Three visible states on the name view:

1. **Bitcoin-verified** — core returned `ok:true` over a header range covering the anchor (see §D).
   Copy: ownership "verified against Bitcoin at height `H` from checkpoint `<id>`, by this resolver
   explorer." On **signet**, add the #95 label: header authenticity is provider-trusted; the
   independent guarantee is the inclusion proof. Never assert signet header independence.
2. **Resolver mirror — not yet Bitcoin-verified** — any non-`ok:true` result. Ownership is **still
   shown** (do not hide it), under a **loud** banner that is a hardening of the existing
   `RESOLVER_MIRROR_NOTICE` into an explicit "not yet Bitcoin-verified" state. This is the honest
   trusted-but-caught surface; hiding ownership on a miss trains distrust of the wrong thing.
3. **Unavailable / error** — unchanged existing views (invalid name, absent, malformed served state).

Every dynamic field stays HTML-escaped (existing `htmlEscape` discipline; no new trust boundary).

## 6. §D — Freshness / range invariant (spine §4 — pin it)

A "Bitcoin-verified" mark **requires the validated header range to extend through at least the anchor
height + the launch confirmation depth**. `verifyProofBundleAgainstBitcoin` validates *exactly the
supplied range* and makes no tip-currentness / fork / depth judgment (by design). So a **stale, short,
or partial** provider range is **non-authoritative and fails closed** — it renders as state 2, not
state 1. Pin the launch confirmation depth as a `@ont/launch-config` constant (add it there if absent,
provenance-noted) so cli/web/mobile share one value; the web slice must assert this invariant in a test,
not assume the provider honors it.

## 7. §E — Boundary + scope guards (codex must hold all)

- `packages/consensus/src` **zero-diff**. The verify core is the thin orchestrator; the audited manifest
  is untouched; audit-map ratchet green.
- **No client-side crypto / no browser bundle.** Verification runs in the **web server** process; the
  web stays server-rendered pure HTML.
- **Fail closed everywhere:** missing bundle, `missing-header-source`, `unverified`, `malformed`, or a
  stale/short/partial range ⇒ **never** presented as Bitcoin-verified.
- **Honest labels:** "verified by this resolver explorer," not "you verified"; signet header authenticity
  is provider-trusted (#95); no signet-header-independence claim.
- **Standing gates green:** `scripts/check-doc-links.sh`, `npm run check:surfaces`,
  `npm run check:audit-map`, `git diff --check`.

## 8. §F — Tests (default-suite hermetic first, live env-selected)

Default suite (no network), each pinning fail-closed:
1. Fixture header provider + real served bundle whose validated range covers the anchor ⇒ **Bitcoin-verified**
   state rendered.
2. **No** header provider configured ⇒ `missing-header-source` ⇒ non-authoritative banner, ownership
   still shown.
3. **Forged / missing** `bitcoinInclusion` in the served bundle ⇒ `unverified`/malformed ⇒ non-authoritative.
4. **Stale / short / partial** header range (does not reach anchor height + confirmation depth) ⇒
   non-authoritative (the §D invariant, asserted directly).
5. **Zero-behavior-change:** CLI verify-commands tests green **unchanged** after the §A lift.
6. Render totality preserved: a throwing/malformed served bundle ⇒ existing unavailable/error view, never
   a thrown render.

Live wiring (real launch-config header provider) is **env-selected** and exercised at **G-C-MINIMAL** on
signet — not in the default suite.

## 9. §G — Acceptance + review loop

Slice is done when: `@ont/light-client` hosts the shared core (CLI green unchanged), the web renders the
three states over a fixture provider with every fail-closed test above green, the live header-source seam
is present and env-selected (fixture default), `packages/consensus/src` is zero-diff, and all standing
gates pass. Loop: **codex builds → I review against this spec (fresh frame) → I merge/push (standing
authority) → ChatLunatique concurs in parallel (non-blocking; must flag the `light-client-core-home`
new-package call before canon).** DK is looped only for the operator actions already queued at spine §6
(none new here).
