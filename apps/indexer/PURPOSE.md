# Clean Indexer Service

## Purpose

`@ont/indexer` is the clean runnable indexer shell — **batch block-ingestion, NO HTTP** (per `B4_ADAPTERS_PLAN`:
`apps/indexer` is no-HTTP; the resolver serves over HTTP). It ingests confirmed Bitcoin anchors and drives the
`@ont/adapter-indexer` inclusion firewall to mint and persist chain-bound facts (`ConfirmedBatchAnchor`, and in
later slices `ConfirmedRecoverOwnerInvoke` and the `IndexedBatchRecord` availability records that feed
`createAvailabilitySource`).

## Scope

- The service is wiring + I/O orchestration only.
- It consumes `@ont/adapter-indexer` firewall + projection APIs. It re-derives no firewall, consensus, fee, or
  availability rule.
- It drives the firewall over candidates and **persists only accepted (`ok`) facts** through an injected store
  port; a rejected candidate mints nothing (fail-closed). Idempotent per `anchoredRoot`.
- Persistence is **Promise-shaped from the start** (`ConfirmedAnchorStore.has`/`put` return Promises) — the
  service is a shell around future DB / filesystem state.
- All I/O is behind mockable ports. No live network in tests.
- It does not import `legacy/`, `@ont/*/src|dist`, crypto/signing libraries, or live network clients in the
  tested core.

## Slice 1 — confirmed-anchor ingest driver

`ingestConfirmedAnchors(candidates, store, confirm = buildConfirmedBatchAnchor): Promise<IngestAnchorsReport>`

- `confirm` is a **narrow, pure** seam: `candidate -> ConfirmedBatchAnchorResult`, defaulting to the real
  `buildConfirmedBatchAnchor`. Any async block-source work belongs *before* candidate construction, never inside
  `confirm`. This lets the orchestration (drive-many / persist-ok-only / idempotency / fail-closed) be tested
  hermetically with a fake `confirm`, while production wiring consumes the pure adapter.
- For each candidate: `confirm(candidate)` → `ok` ⇒ if `!await store.has(anchoredRoot)` persist the **exact ok
  facts** (`confirmedAnchor` + `feeTxParts`, no service-added fields) and accept, else skip (idempotent);
  `reject` ⇒ tally the reason, persist nothing. Total; never throws (an unexpected throw → `ingest-error`, loop
  continues).
- Report: `{ accepted: anchoredRoot[]; skipped: anchoredRoot[]; rejected: { reason }[] }` — rejects are
  reason-only (no echo of malformed candidates).

## Tests (slice 1 red battery)

1. ok result → stored; report.accepted has the root.
2. reject result → not stored; report.rejected has the reason.
3. idempotency: root already present → skipped, not re-put.
4. mixed batch → independent; only ok stored; tallies correct.
5. total/fail-closed: a `confirm` that throws → caught (`ingest-error`), loop continues, nothing stored.
6. real-wiring smoke: DEFAULT `confirm` (real `buildConfirmedBatchAnchor`) over a malformed candidate →
   `anchor-malformed`, store untouched.
7. consume-not-rederive: the stored record carries exactly the adapter ok facts (`confirmedAnchor` unchanged).

## Later slices

2 — availability ingest (`verifyServedDelta`/`verifyBaseLeaves` → `IndexedBatchRecord` → `createAvailabilitySource`).
3 — block-source port + poll/ingest loop + entry (`index.ts`, start script).
4 — recover-owner-invoke ingest (`buildConfirmedRecoverOwnerInvoke`).
