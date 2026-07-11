# Reducer → Sole-Sink Cutover Spec (reducer-sole-sink, #101)

**Author:** ClaudeleLunatique · **Builder:** ChatLunatique · **Status:** DK-ratified
(event "do it", 2026-07-11) — spec-of-record, slice C0 dispatchable.

**Governs:** retiring the direct name-state writer so `reduceBlock` (`@ont/consensus`)
is the single authority that awards durable name ownership. Origin mandate:
`docs/research/SENIOR_ARCHITECT_REVIEW_2026-07-09.md` §1.4 / §3.2 — *"No API handler
or ingestion path should be able to award ownership by bypassing this reducer."*
STATUS.md commits this as "the sharpest architecture gap" (Known-incomplete §, lines 184-198).

---

## §0 The decision (reducer-sole-sink, #101)

The reducer `reduceBlock` becomes the **sole authority** over which names receive
durable name-state and what the consensus fields of that state are. The live direct
writer `apps/indexer/src/enforce-batched-claims.ts` — which today verifies a batch and
persists hand-built `NameStateRecord`s straight to `@ont/name-state-store` via
`putMany` — is retired as a **decider**. `@ont/claim-path`'s `enforceBatchedClaim`
survives, repurposed as the **evidence resolver** that feeds the reducer; the durable
`NameStateStore` becomes a **projection** of reducer output, never an independent writer.

**This is not a trust-model change** (`signet-solution-gate` #95 holds; header chain
stays provider-trusted; predicates unchanged). It is a **name-state-authority** change:
who is allowed to `.names.set(...)` / `nameStateStore.put*`.

**Explicitly out of scope** (separate owed work, NOT cutover blockers):
- Bonded / auction acquisition **lifecycle** minting through the reducer (greenfield for
  *both* sinks today — the live authority also mints only `accumulator-batched`; STATUS
  lines 96-99). The B0/B1/B2 delta series already landed the reducer's bonded/auction
  *composition* (`main@17dd2083`); this cutover concerns only the **live durable sink**,
  which mints `accumulator-batched` on both sides. Parity is scoped to what is live.
- LE-INVOKE (recovery/transfer live wiring), LE-CONTESTED (`enforce-contested-batch.ts`
  has no live caller today), runtime DA discovery/retry.
- Postgres / durable-store redesign beyond what C1 minimally requires.

---

## §1 Current state (grounded, HEAD `17dd2083`)

Two name-state sinks run **by design**, enumerated + guarded by
`packages/consensus/src/reduceblock-authority.test.ts:58-61` (fails if a third appears):

1. **Reducer (dormant vs durable):** `packages/consensus/src/engine.ts:281` `reduceBlock`
   consumes `(prior, block, ResolvedBlockEvidence, LaunchParams)`, mutates `prior` in
   place (`engine.ts:302-303`), writes the in-memory `OntState.names` Map
   (`.names.set(...)` at `engine.ts:762`), returns `{ state, provenance }`. **Every
   `reduceBlock` caller is a `.test.ts`** — it produces no durable state.
2. **Live direct writer (durable authority):**
   `apps/indexer/src/enforce-batched-claims.ts:64` `enforceBatchedClaims(candidates, deps)`
   — per candidate: decode RootAnchor → build inclusion bundle + `batchDataSource` →
   `enforceBatchedClaim(...)` (`:165`, inclusion→gate-fee→availability→completeness→
   verdict) → on accept collect one `NameStateRecord` per write-eligible committed entry →
   **`await deps.nameStateStore.putMany(recordsToWrite)` (`:213`)** — the durable mutation.
   Wired live via `runner.ts:75` inside `runIndexerTick`, selected at boot by
   `apps/indexer/src/live/select-enforcement.ts:34` (`ONT_ENFORCEMENT` = `off` default /
   `fixture-file` / `http-da`).

**Verification lives in `enforceBatchedClaim`, not the reducer.** The reducer trusts a
pre-resolved `ResolvedBlockEvidence` seam (kernel boundary — no network/store I/O;
`packages/consensus/PURPOSE.md`). Gate-fee (`enforce-gate-fee.ts`) and completeness
(`evaluateBatchCompleteness`) are run **only** by the direct driver today. **Retiring the
driver's verification without re-homing it into the evidence resolver would silently drop
the gate-fee gate** — the load-bearing hazard of this cutover.

---

## §2 Target architecture

```
confirmed block + candidates
        │
        ▼
[evidence resolver]  apps/indexer  (imperative shell, NON-deciding)
  reuse enforceBatchedClaim per anchor  ─►  accept? + committed-entry delta + firstServableHeight
  package accepted deltas               ─►  ResolvedBlockEvidence { batchMaterialByAnchor, availabilityByAnchor }
  keep the per-name serving payload      (trace, proofBundle, batchLocalIndex, anchor.vout) keyed by name
        │
        ▼
[reducer]  reduceBlock(prior, block, evidence, params)   ── SOLE AUTHORITY over the name set + consensus fields
        │      → ReduceResult.state.names : Map<name, NameRecord>
        ▼
[projection adapter]  apps/indexer  (NON-deciding JOIN)
  for each name in reduceResult.state.names minted/updated this block:
     NameStateRecord = reducer consensus fields  ⋈  serving payload[name]
  ASSERT keys(projected) === keys(reduceResult minted-this-block)   ← name-set-equality guard
        │
        ▼
[durable store]  nameStateStore.putMany(projected)   ← the ONLY putMany; store = projection of OntState
```

**Invariant hierarchy:**
- **A (authority):** the set of names written to the store on any block equals the set of
  names `reduceBlock` minted on that block. The projection adapter may **decorate** a
  reducer-approved name with serving payload; it may **never** add a name the reducer did
  not mint, nor drop one it did. Enforced by test guard.
  - **How the per-block minted set is derived:** `ReduceResult` exposes **no** "minted this
    block" signal — `refreshDerivedState` re-`.set`s every record each block
    (`engine.ts:379,409,413`) so object identity is useless, and the batch mint returns
    `affectedName: null` (`engine.ts:769`). The adapter therefore computes the delta by
    **snapshotting `prior.names` keys immediately before the `reduceBlock` call and diffing
    against `result.state.names` keys after** (new keys = minted this block). This is sound
    **because the accumulator-batched mint is add-only**: `engine.ts:751-757` ignores the
    whole batch if any committed name is already in `state.names`, so a mint never overwrites
    an existing name. (This add-only property is C0-specific; C1's reorg path adds *and
    removes* names, so C1 needs a delta abstraction that carries deletes — do not let C0's
    add-only key-diff leak into C1 unexamined.) Deriving the delta in the adapter keeps
    **`consensus/src` zero-diff in C0**; any reducer-emitted delta signal is deferred to C1.
- **B (verification-preserved):** the evidence resolver runs the **same**
  `enforceBatchedClaim` stages (inclusion, gate-fee, availability, completeness) the direct
  driver runs today. Gate-fee is not lost. Proven by feeding the resolver the same corpus
  and asserting the accepted-anchor set is unchanged.
- **C (serving-preserved):** the projected `NameStateRecord` the resolver reads is
  byte-identical to what the direct writer produced for the same accepted batch — same
  `owner`, `anchor{txid,minedHeight,txIndex,vout}`, `firstServableHeight`, `leafKeyHex`,
  `batchLocalIndex`, `trace`, `proofBundle`. Proven by differential deep-equality (C0).

---

## §3 The projection contract (record-field mapping)

Consensus `AccumulatorBatchedNameRecord` (`engine.ts:73-79`) → store `NameStateRecord`
(`packages/name-state-store/src/record.ts:46-61`):

| `NameStateRecord` field | Source | Notes |
| --- | --- | --- |
| `canonicalName` | reducer `NameRecord.name` | authority |
| `leafKeyHex` | reducer `NameRecord.leafKeyHex` | both carry; MUST match `sha256Hex(name)` |
| `owner.ownerPubkeyHex` | reducer `NameRecord.currentOwnerPubkey` | authority |
| `anchoredRoot` | reducer `NameRecord.anchoredRoot` | authority |
| `firstServableHeight` | reducer `NameRecord.firstServableHeight` | authority |
| `anchor.txid` | **serving payload only** | reducer `lastStateTxid` is a **synthetic head hash** (`sha256("${anchorTxid}:${leaf}")`, `engine.ts:773-775`), NOT the anchor txid — **no consensus counterpart; do not assert against it** |
| `anchor.minedHeight` | serving payload | cross-check: == reducer `lastStateHeight` == `winningCommitBlockHeight` (both `= event.blockHeight`, `engine.ts:735-736`) |
| `anchor.txIndex` | serving payload | cross-check: == reducer `winningCommitTxIndex` (`= event.txIndex`, `engine.ts:737`) |
| `anchor.vout` | **serving payload only** | consensus record carries no vout — decoration |
| `batchLocalIndex` | **serving payload only** | consensus record carries none — decoration; **pre-filter index** (see below) |
| `trace` | **serving payload only** | enforcement verdict path — decoration |
| `proofBundle` | **serving payload only** | client-verify bundle — decoration |

**Where the serving payload comes from (NOT reducer-consumed evidence).** `trace`,
`proofBundle`, `anchor.txid`, `anchor.vout`, `batchLocalIndex` are **not** carried by
anything `reduceBlock` consumes — `ResolvedBlockEvidence`/`ResolvedBatchMaterial`
(`engine.ts:157-165, 214-221`) carry none of them. They are produced by the **evidence
resolver** (the driver's `bundleForEntry` → `proofBundle`, `verdict.trace` → `trace`,
`fields.vout` → `vout`, and the pre-filter enumeration → `batchLocalIndex`;
`enforce-batched-claims.ts:130-141,181-199`) as a **per-name side channel `servingByName`,
parallel to `ResolvedBlockEvidence`**, keyed by canonical name, JOINed *after* the reduce.
Do **not** thread these through `ResolvedBlockEvidence` — that would make the reducer carry
serving data it must not decide over.

**`batchLocalIndex` is the pre-filter index.** The direct writer enumerates over the
**full** committed-entry array **before** the short-name filter
(`.map((entry, batchLocalIndex) => …).filter(len > 4)`, `enforce-batched-claims.ts:187-189`),
so surviving records can have **non-contiguous** indices (a dropped short name leaves a gap).
`servingByName[name].batchLocalIndex` MUST reproduce that exact pre-filter index over the
canonical committed-entry order — enumerating post-filter or over a reordered set breaks
byte-parity on any batch with a short-name drop.

**Cross-check, not re-derive.** For the two fields that genuinely exist on both sides
(`minedHeight`, `txIndex`), the projection **asserts equality** and fails closed on mismatch
(divergence ⇒ the evidence fed to the reducer ≠ the evidence used for serving — a bug that
must never persist state). The short-name (≤4 byte) filter is the reducer's
(`canWriteAccumulatorBatchedName` → `len > 4`, verified equivalent to the writer's
`utf8ToBytes(name).length > 4`); the projection MUST NOT re-filter (that would be deciding) —
it inherits whatever set the reducer minted.

---

## §4 Slice plan

### C0 — Differential parity (shadow, NO production write change)

**Goal:** prove the reducer-projection path produces byte-identical records to the live
direct writer over the existing corpus, before any wiring flips. Purely additive: no
`putMany` site changes, `select-enforcement.ts` untouched, prod behavior unchanged.

**Build:**
1. `resolveBlockEvidence(candidates, deps)` in `apps/indexer` — runs the existing per-anchor
   verification (reusing `enforceBatchedClaim` exactly as `enforce-batched-claims.ts` does)
   and returns `{ evidence: ResolvedBlockEvidence, servingByName: Map<name, ServingPayload>,
   acceptedRoots, rejected, skipped }`. Must reproduce the driver's accept/reject/skip
   verdicts identically (Invariant B).
2. `projectReducerOutput(reduceResult, servingByName)` in `apps/indexer` — the §3 JOIN,
   including the name-set-equality assertion (Invariant A) and the both-sides equality
   asserts.
3. A **differential test** `apps/indexer/src/enforce-batched-claims.parity.test.ts`:
   over the enforcement-e2e corpus + the A′ fixture batch, assert
   `projectReducerOutput(reduceBlock(prior, block, resolveBlockEvidence(...).evidence, params),
   servingByName)` **deep-equals** the direct writer's `recordsToWrite` (order-normalized by
   `canonicalName`). Required cases:
   - single name; multi-name (contiguous indices);
   - **short-name drop producing a non-contiguous `batchLocalIndex`** (e.g. entry[1] is
     ≤4 bytes → surviving indices `[0,2,…]`; catches any post-filter re-enumeration bug);
   - bare RootAnchor (both write nothing); batch rejected at a gate-fee/completeness stage
     (both write nothing — proves Invariant B, the gate did not silently vanish);
   - `batchSize ≠ committedEntries.length` (the reducer ignores the whole batch,
     `engine.ts:600-606`; confirm/record the direct writer's behavior);
   - **already-claimed name in `prior` OntState** and **duplicate committed name** — the
     divergence cases below.

**Note (impedance):** `reduceBlock` is block-oriented (extracts RootAnchor events from
`block.txs` itself), the driver is candidate-oriented. C0's adapter must supply the
`ConfirmedBlock` alongside the evidence map keyed by `anchoredRoot`; the corpus already has
the block.

**Guardrails C0:** `reduceblock-authority.test.ts` still passes **unchanged** (two sinks —
this is additive). `consensus/src` **zero-diff** (C0 adds no reducer change; if the parity
test surfaces a reducer gap, that gap is recorded and moved to C1, not patched silently).
Standing gates green.

**Exit:** parity test green across all cases ⇒ Invariants A/B/C proven at steady state.

### C1 — Reorg-symmetric replay (N1) + boot/hydration model

**Goal:** prove the reducer path matches the direct path across a reorg (disconnect +
reconnect + undo), and pin how durable served state is reconstructed on restart.

**The one open design fork (resolve at C1 entry, see §8):** the reducer holds `OntState`
in memory; on restart it must reconstruct it. The store's `NameStateRecord` lacks consensus
fields (`status`, `winningCommit*`, `assuranceProvenance`) so a store→OntState inverse is
lossy. Options: **(H2)** persist the reducer's `OntState` as the durable authority and
project `NameStateStore` for serving, or **(H3)** replay confirmed blocks from
`launchHeight` on boot. Recommendation below (§8). C1 pins this; **C0 does not need it.**

**Build:** reorg checkpoint/undo in the reducer path (or replay), extend the differential
test to a disconnect/reconnect sequence, assert served state equals a from-scratch
`reduceBlock` replay (**replay-equivalence**). This slice **may touch `consensus/src`**
(reorg undo) — flagged for extra scrutiny; not zero-diff.

**Exit:** reorg differential green + replay-equivalence proven.

### C2 — Sink flip + retire the direct writer (the cutover proper)

**Goal:** make the projection the ONLY writer.

**Build:**
1. `enforce-batched-claims.ts` (or its successor) stops calling `nameStateStore.putMany`
   with hand-built records; the **projection adapter** performs the sole `putMany`, atomic
   per block, cursor-not-advanced-on-throw preserved (the current fail-closed persistence
   discipline at `enforce-batched-claims.ts:208-215` carries over verbatim).
2. Retire the hand-built-`NameStateRecord` construction path (`:187-200`).
3. **Update `reduceblock-authority.test.ts`** from the two-sink assertion to a **one-sink**
   assertion. Keep the guard's strong mechanical form (the existing string-scan for
   `nameStateStore.put*` across prod files, `:40-61`): assert **exactly one** `put*` site and
   that it is the projection adapter file. Do **not** add a brittle "imports `ReduceResult`"
   regex — a scan can't robustly verify data-flow; the differential parity tests (C0/C1) are
   what prove the writer is downstream of the reducer.
4. Full green through the single sink: enforcement-e2e (hermetic), A′ fixture,
   `http-da` two-operator e2e — all must serve identical state to pre-cutover.

**Guardrails C2:** the flip is the DK-gated moment; land only after C0+C1 parity is proven.
`enforceBatchedClaim` predicate stays intact (evidence resolver). No trust-label change.

**Exit:** one sink; resolver serves identical state; all e2e green. STATUS + DECISIONS
updated; `reducer-sole-sink (#101)` closed for the accumulator-batched scope that is live.

---

## §5 Invariants (all slices)

- **Fail-closed persistence preserved:** a source/persistence failure throws out of the tick
  (cursor not advanced → retry); a bad verdict is a skip, never a partial write. The
  current discipline (`enforce-batched-claims.ts:54-62, 208-215`) is non-negotiable and
  carries into the projection writer.
- **No gate-fee loss:** Invariant B is a hard gate. Any slice that changes the accepted set
  vs the direct driver over the corpus is a regression, not progress.
- **Predicate layer untouched:** `@ont/consensus` predicates and `@ont/claim-path`
  `enforceBatchedClaim` verdict logic are not rewritten — `enforceBatchedClaim` is *reused*
  as the resolver. Only the *authority wiring* changes.
- **Provider-trusted label unchanged** (#95).

## §5a Known behavioral divergence at cutover (flag to DK)

The reducer applies **cross-name batch gates the direct writer does not**, so the cutover is
not purely a wiring move — it *changes* accept semantics in these cases:

- **Any already-claimed committed name ⇒ the whole RootAnchor is ignored**
  (`engine.ts:751-757`, `reason: root_anchor_name_already_claimed`). The direct writer has no
  cross-name gate — it would `putMany` the other (non-colliding) entries and the store's
  keyed `put` would overwrite the collider.
- **Any duplicate committed name ⇒ whole batch ignored** (`engine.ts:740-749`).
- **`batchSize ≠ committedEntries.length` ⇒ whole batch ignored** (`engine.ts:600-606`).

For the **private-signet demo scope that is live** (first names, no collisions,
well-formed batches) these paths are unreachable, so C0 parity holds today. But the cutover
**adopts the reducer's stricter whole-batch-reject** as the new live behavior. I read this as
*more* correct (a batch that double-claims or miscounts is wholly suspect), not a regression —
but it is a deliberate behavior change, so it is called out here rather than buried. The C0
differential encodes it as an **intended divergence** (asserts the reducer writes nothing and
records the direct writer's differing output), not a parity failure. **DK: if you want the
direct writer's permissive per-entry semantics preserved instead, say so and I respec** —
otherwise the reducer's stricter semantics stand as of C2.

## §6 Acceptance (whole cutover)

1. C0 differential parity green (steady state).
2. C1 reorg-symmetric + replay-equivalence green.
3. C2: single sink; `reduceblock-authority.test.ts` asserts one writer; enforcement-e2e +
   A′ fixture + `http-da` two-operator all serve state byte-identical to pre-cutover.
4. STATUS.md "sharpest architecture gap" entry retired to done-for-live-scope; DECISIONS
   `#101` closed; the direct hand-built-record writer is gone from the tree.

## §7 Guard-test evolution

`reduceblock-authority.test.ts` is the cutover's tripwire. It changes **exactly once, in
C2**: from "exactly two sinks, direct writer cutover-gated" to "exactly one sink, the
projection adapter downstream of `reduceBlock`." Until C2 it must remain **unchanged and
green** — any earlier change means the authority moved before parity was proven.

## §8 Boot / hydration / reorg model (C1 design note — recommendation, not yet ratified)

**Recommendation: (H2) persist the reducer's `OntState` as the durable authority; derive
`NameStateStore` as a serving projection.** Rationale: (a) lossless — no store→OntState
inverse needed; (b) matches "reducer is the authority" literally (the authoritative bytes
are the reducer's state); (c) reorg undo operates on the authoritative structure, not a
lossy mirror. Cost: a new durable `OntState` store + the serving projection runs on read or
on write. Given signet stand-up already **re-indexes from scratch** (no migration burden,
per the on-disk format break already accepted), this is affordable pre-launch.

**(H3) replay-from-`launchHeight` on boot** is the fallback if a durable `OntState` store is
too heavy for C1: deterministic, no new store, but O(chain) boot and requires durable block
+ evidence availability. Acceptable at private-signet history sizes; weaker long-term.

I will pin H2-vs-H3 in a C1 spec addendum **after C0 lands and parity is proven** — C0 is
fully specified and dispatchable without it. If CL's build surfaces a reason to prefer H3
(or a hybrid) during C0, raise it and I fold it into the C1 addendum.
