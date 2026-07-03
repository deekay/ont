# @ont/header-store — PURPOSE

## Purpose
The shared durable Bitcoin header range store. Persists the indexer's checkpoint-forward
block headers (`height -> headerHex`) to JSON and serves exact contiguous ranges to the
resolver, so the indexer (writer) and resolver (reader) share one durable surface with no
app-to-app dependency.

## Scope
- Owns: strict `HeaderRecord` / `HeaderRangeStore` types, record JSON codec, and atomic file
  store (temp+rename, durability-before-visibility, fail-closed hydrate).
- Does NOT: validate header chains, choose forks, enforce freshness, or decide ownership.
  Clients validate served ranges through `@ont/adapter-header` / `@ont/light-client`.

## Tests
- `header-record-codec.test.ts` — strict encode/decode validation.
- `file-header-range-store.test.ts` — ENOENT→empty, corrupt→fail-closed, idempotent writes,
  contiguous range reads, gap→null, and durability-before-visibility.
