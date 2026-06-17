# B5-WEB / explorer — classification (classify-first)

**Status:** classify-first (CL concur event eab52ab3). The old `apps/web` (`@ont/web`) is quarantined to
`legacy/apps/web`; the clean `apps/web` is a **read/display-only** explorer rebuilt over the B4 adapters. It is
added to the surface-boundary allowlist when the rewrite lands.

## What the old `apps/web` was

A Node HTTP server (`index.ts`, `node:http`/`fs`/`child_process`) that renders HTML pages **and** ships
browser bundles that do **client-side crypto**: key derivation, value-record signing, claim, value-publish, and
auction tooling. Deps include `@noble/*`, `@scure/*`, `buffer`, `esbuild`, and the carried-over **pre-W16
cluster** (`@ont/architect`, `@ont/core`). That is the opposite of the clean-build web bar (CL): read/display
only, no keys, no signing libs, no wallet internals, consume the clean adapters.

## Classification (20 src modules)

**KEEP — the clean read/display surface (first slice):**
- `index.ts` (read-serving skeleton only — the HTTP/render entry; the publish/key/auction serving is dropped)
- `resolver-fanout.ts` (the **read** path — fetch served value/recovery history; the publish half is dropped)
- `page-shell.ts`, `styles.ts` (presentation)
- value/recovery **display** rendering (rebuilt server-side from the adapter projections)

**EDGE:**
- multi-resolver fetch (`resolver-fanout` read). **MR1 carry-forward** (adversarial finding,
  `legacy/apps/web/src/resolver-fanout.ts`): the old client picked canonical by **longest chain with zero
  verification** — a forged-longer chain could misdirect. The clean read must NOT decide canonicality by
  longest-chain; it renders **served state** under not-authority copy and relies on the adapter projections
  (which validate ownership/sequence/predecessor). Resolver selection = delivery, never judge.
- broadcast/publish (write path) — belongs to `apps/wallet` (sign) + a submit port, not the read surface.

**DROP — moved to `apps/wallet` + `apps/claim`, or pure client-crypto the web must not do:**
- `browser-crypto.ts`, `browser-key-tools.ts`, `browser-keys.ts` (+ `.test`), `browser-value-record.ts`,
  `browser-claim.ts`, `browser-accumulator.ts`, `browser-polyfills.ts`
- `key-tools-bundle.ts`, `value-publish-bundle.ts`, `value-publish-client.ts`, `value-bundle.ts`,
  `client-script.ts` (browser action bundles — signing/publish; the explorer is read-only)
- deps dropped: `@noble/*`, `@scure/*`, `buffer` (no crypto in the web), and the pre-W16 cluster
  `@ont/architect` / `@ont/core` (and `@ont/protocol/wire`)

**PARKED — behind `wire-codec-consolidation` (DK):**
- `auction-tools-bundle.ts`, `auction-tools-client.ts`, `auction-lab.ts` — any auction view that reads the
  16-vs-32-byte commitment cluster is GATED; no compatibility bridge in the web surface.

## Clean `apps/web` shape (proposed)

A read/display surface that consumes the published clean adapters (`@ont/adapter-resolver`,
`@ont/adapter-indexer`, `@ont/wire`/`@ont/consensus` where needed) through a **mockable read-port** and renders
their outputs (mirrors the B5-CLI read-port + render split, HTML instead of text). No keys, no signing libs, no
wallet internals, no `legacy/`, no `@ont/*/src|dist`, no old-cluster reaches. Hermetic — no live network; the
read-port is mocked in tests.

## First read/display slice (proposed)

**Name resolution view:** given a name, fetch served value-history + recovery-history via the read-port and
render them (value records, ownership interval, recovery descriptors) to HTML, consuming
`projectServedValueHistory` / `projectServedRecoveryHistory` from `@ont/adapter-resolver` — reimplementing no
resolver/indexer/consensus rules. Copy obeys `resolver-indexed-mirror` / `not-ownership-authority` everywhere
served state is shown. Hermetic test: mocked read-port → assert rendered output + not-authority copy + no
canonical-by-longest-chain decision. Tx display + the explorer landing follow as subsequent slices; auction
views stay PARKED.
