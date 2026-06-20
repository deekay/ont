# @ont/name-state-store — PURPOSE

## Purpose

The durable store for the **enforced name-state** an accepted batched claim produces — the live-enforcement
LE-INDEX record contract (`docs/core/LIVE_ENFORCEMENT_PLAN.md` §2a). The live indexer writes one
`NameStateRecord` per accepted name; the resolver reads it back by `canonicalName`. It exists so the
indexer (writer) and the resolver (reader) share ONE durable surface with **no app→app edge** — the same
shared-infra pattern as `@ont/anchor-store`.

## Scope

- **Owns:** the `NameStateRecord` / `NameStateStore` types (§2a), the strict fail-closed codec
  (`encode`/`decode`), and the durable file store (`createFileNameStateStore`, atomic temp+rename, hydrate-once,
  fail-closed corruption). Keyed by `canonicalName`.
- **Does NOT:** decide anything. No consensus / firewall / DA logic. The audited core
  (`@ont/claim-path` `enforceBatchedClaim`) decides **before** the loop writes a record; this package only
  persists what it is given and re-validates the shape on the untrusted-disk boundary. The read accessor mints
  and mutates nothing.
- **Source of record fields:** the loop sources every field from the VERIFIED committed-entry seam
  (`@ont/adapter-indexer` `buildCommittedBatchForRoot` input) joined to the accepted served/root facts — NOT
  claim-path's synthetic completeness projection. `canonicalName` is reject-don't-normalize (W3); anchor `vout`
  is preserved from the inclusion candidate / firewall side.
- **Deps:** none at runtime (the generic fs seam is kept local). Dev: vitest.

## Tests

- `name-state-codec.test.ts` — round-trip identity for a valid record (incl. the optional trace `evidence`);
  fail-closed on every corruption class (missing/extra keys, bad hex/u32, bad owner kind, malformed anchor,
  malformed trace step, non-JSON-safe evidence).
- `file-name-state-store.test.ts` — put/get/has; replace-by-canonicalName; missing-file → empty; durable across
  a fresh store over the same dir; fail-closed on a corrupt / duplicate-name file; atomic write (temp then
  rename); a write failure leaves the last durable state.
