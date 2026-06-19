# @ont/anchor-store — PURPOSE

## Purpose
The shared durable confirmed-anchor store. Persists the indexer's accepted RootAnchor facts
(`ConfirmedAnchorRecord`) to a JSON file and serves them back by anchored-root (`has`) and anchor-txid
(`getByTxid`), so the indexer (writer) and the resolver (reader) share ONE durable surface — no app→app
dependency and no codec duplication. Extracted from `@ont/indexer` in G2 slice 6a.

## Scope
- Owns: the persisted `ConfirmedAnchorRecord` / `ConfirmedAnchorStore` types, the bigint-safe slice-2a codec
  (record ↔ JSON via consensus raw-tx hex), and the slice-2b atomic file store (temp+rename,
  durability-before-visibility, fail-closed hydrate). node-targeted (`node:fs/promises` via an injectable seam).
- Does NOT: decide any consensus/firewall/fee rule, ingest, mint, or repair. The store is dumb persistence; the
  audited core re-derives downstream. The indexer's cursor store stays indexer-owned (it is not part of the
  resolver read path).
- Deps: `@ont/bitcoin` (codec serialize/parse/txid) at runtime; `@ont/claim-path` is a TYPE-only import for the
  record's `ConfirmedBatchAnchor` / `GateFeeTxWitnessParts` shape (no runtime dependency).

## Tests
- `confirmed-anchor-codec.test.ts` — strict, bigint-safe, fail-closed encode/decode round-trip (moved from the
  indexer; behavior preserved).
- `file-confirmed-anchor-store.test.ts` — ENOENT→empty, corrupt→fail-closed, rehydrate has/getByTxid,
  replace-by-root, txid-collision guard, atomic durability-before-visibility (moved; behavior preserved).
