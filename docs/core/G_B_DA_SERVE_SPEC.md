# G-B / LE-DA-SERVE — DA network transport for two-operator independence (slice 7)

> **Status: BUILD SPEC. Writer: ClaudeleLunatique. Builder: ChatLunatique. Reviewer:
> ClaudeleLunatique (fresh-frame) → merge/push (standing authority, DK event 4c04419b).**
> Realises [G_TRACK_BUILD_SPINE.md](./G_TRACK_BUILD_SPINE.md) §2.1 slice 7 and
> [LIVE_ENFORCEMENT_PLAN.md](./LIVE_ENFORCEMENT_PLAN.md) §3.3 (LE-DA-SERVE). Post-gate hardening —
> **not** on the G-C-MINIMAL demo critical path (the spine §2 critical path needs G-A for the
> demo; "+ G-B for the full story"). No new consensus law: `consensus/src` **zero-diff**; this
> slice only adds a network transport + an env-selected enforcement mode over the **already-audited**
> `enforceBatchedClaim`.

## 0. Purpose

Prove the censorship-resistance property **live across two operators**: operator-A's publisher
serves the batch data-availability (DA) record over the network at `GET /da/{root}`; operator-B's
indexer, pointed only at that endpoint (no shared filesystem), independently **fetches,
reconstructs, firewall-mints, and reaches the same enforcement verdict** — the same per-name
name-state the first operator serves. If operator-A withholds or tampers with the DA record,
operator-B fails closed and mutates nothing. This is the "independence is provable across two
operators" property named in the spine slice-7 row.

## 1. The independence boundary (grounded finding — read before building)

`enforceBatchedClaim` consumes a `BatchDataSource` with four methods
(`packages/claim-path/src/enforce-batched-claim.ts:39-52`). The indexer driver
(`apps/indexer/src/enforce-batched-claims.ts:110-159`) builds all four, and **only one input is
producer data that must cross the network** — the rest are chain- or locally-derived and need no
transport:

| `BatchDataSource` method | Source in the driver | Crosses the network? |
|---|---|---|
| `feeTxForAnchor(txid)` | the **on-chain anchor tx + its prevouts** (`candidate.anchorTx`, `candidate.prevoutTxs`, line 158) | **No** — both operators see the same chain |
| `committedBatchForRoot(root)` | **recomputed locally** by `buildCommittedBatchForRoot(...)` (line 147-153) | **No** — but its *inputs* (names) do |
| `baseLeavesForPrevRoot(prev)` | `material.baseLeaves` (empty `[]` for a first batch: `prevRoot` = empty-accumulator root) | via the DA record |
| `servedLeavesForRoot(root)` | `material.servedLeaves` | via the DA record |

**The fee-critical fact (decides slice content).** `buildCommittedBatchForRoot`
(`packages/adapter-indexer/src/committed-batch.ts:52-88`) needs the **canonical name pre-images**,
not leaf hashes: it recomputes `leafKey = sha256Hex(utf8ToBytes(name))` and
`canonicalNameByteLength = utf8ToBytes(name).length` (lines 69-75), and `canonicalNameByteLength` is
the sole input to the gate-fee curve `g(name)` (`packages/consensus/src/gate-fee.ts:40-41`). The
existing minimal-binary served-transport codec
(`packages/adapter-da/src/served-transport.ts`) carries `key(32)‖value(32)` = `H(name)‖ownerPubkey`
— **leaf hashes only**. That is sufficient for the availability / accumulator-root reconstruction
sub-check, but **not** for a second operator to independently re-run gate-fee: `H(name)` cannot be
inverted to the byte length. Therefore the DA record operator-B needs is the **full per-root batch
material** (names + owners + base/served leaves), not the leaf-hash transport alone.

## 2. Decision — `da-record-content` (#98), flagged reopen

**`GET /da/{root}` serves the full per-root batch material record** — the same `EncodedBatchMaterial`
shape the A′ fixture file already carries and round-trip-proves
(`apps/indexer/src/live/select-enforcement.ts:18-24`: `{ anchoredRoot, prevRoot, committedEntries,
baseLeaves, servedLeaves }`), **canonical-JSON-encoded** for now (reuse the proven
`decodeEncodedMaterial` reader), keyed by `anchoredRoot`. Operator-B fetches it, decodes it, and
runs the **identical** `enforceBatchedClaim` (§3(e) of the spine — one shared verify core, never a
parallel impl) to the same verdict.

- **Why full-record, not leaf-hash transport:** the spine slice-7 property is "fetch, reconstruct,
  **firewall-mint**, and challenge." Firewall-minting runs gate-fee, which needs names (§1). A
  leaf-hash-only transport would under-deliver the named property (availability-only, no independent
  gate-fee), so it is rejected as the slice-7 content.
- **Why JSON now, not minimal-binary:** the JSON `EncodedBatchMaterial` is already coded, staged by
  the A′ generator (`--material-out`), and round-trip-tested. Reusing it is the lowest-risk path
  and keeps the slice tight. The `served-transport.ts` binary leaf codec stays as the availability
  sub-check primitive.
- **Flagged reopen (`da-served-transport`, parked, LIVE_ENFORCEMENT_PLAN §4).** Migrating the
  `/da/{root}` payload from canonical-JSON to a minimal-binary transport (and whether the record is
  the full material vs. a leaf-transport + separate committed-names section) is the parked
  `da-served-transport` reopen — **non-blocking**, rec: keep JSON full-record until a size/independence
  need forces binary. DK override welcome; CL design-concur requested before this becomes canon (the
  A4 pattern).

`consensus/src` **zero-diff**. This decision governs only the transport + selector + endpoint.

## 3. Slices (hermetic-first; each lands a no-network test before any live wiring)

### 7a — DA-STORE + PUBLISHER `GET /da/{root}` (code-only, hermetic, dispatchable now)

- **New per-root DA record store**, mirroring `@ont/header-store`'s file-store discipline
  (`packages/header-store/src/file-store-fs.ts`, atomic read, fail-closed `getRecord`): a
  file-backed store keyed by `anchoredRoot` (one canonical-JSON record per root, or a single
  `{ materials: [...] }` file the publisher indexes by root — reuse the A′ `--material-out` shape
  so no new producer is needed). Guard `anchoredRoot` against `HEX_64_LOWER` before any lookup;
  a malformed/absent root returns `null`, never throws.
- **Publisher route** in `handlePublisherRequest` (`apps/publisher/src/server.ts`, add after the
  existing routes at line ~67, before the 404): `GET /da/{root}` →
  - root not `HEX_64_LOWER` ⇒ **400**;
  - record absent ⇒ **404** (fail-closed — indistinguishable "withheld");
  - record present ⇒ **200** `application/json`, the canonical record bytes.
  The publisher gains a `daRecordSource` seam in `PublisherServiceOptions` (env-selected in
  `apps/publisher/src/index.ts` via a new `ONT_DA_DIR`), off by default — absent config ⇒ `/da`
  returns 404 for every root (the endpoint never fabricates data).
- **Tests** (beside `apps/publisher/src/server.test.ts` + `packages/adapter-da/`): staged record
  round-trips (`GET /da/{root}` bytes decode via `decodeEncodedMaterial` to the staged record);
  unknown root ⇒ 404; malformed root ⇒ 400; `ONT_DA_DIR` unset ⇒ 404 for a known root.

### 7b — `http-da` ENFORCEMENT MODE (code-only, hermetic)

- **HTTP DA record client** (new, in `@ont/adapter-da` beside `served-transport.ts`):
  `createHttpDaRecordSource({ endpoint })` → fetches `${endpoint}/da/${root}`, validates `root`
  against `HEX_64_LOWER` **before** the fetch, decodes the body via `decodeEncodedMaterial`, and is
  **total + fail-closed**: 404 / timeout / network error / malformed body ⇒ `null`, never throws or
  rejects (same contract discipline as `fetchServedLeaves`).
- **New `ONT_ENFORCEMENT=http-da` branch** in `selectIndexerEnforcement`
  (`apps/indexer/src/live/select-enforcement.ts:26-50`): requires `ONT_DA_ENDPOINT` — missing ⇒
  **fail closed at boot** (mirror the fixture-file guard at line 36). The seam
  `BatchMaterialSource = (anchoredRoot, prevRoot) => BatchMaterial | null` is **synchronous**
  (`apps/indexer/src/enforce-batched-claims.ts:37`, called at line 90), so http-da **pre-fetches
  declared roots at boot into a sync cache** (mirroring fixture-file's boot-load), keyed by
  `materialKey(anchoredRoot, prevRoot)`. The selector accepts only material fetched by the requested
  content-addressed root and re-verified to reconstruct that root. A cache miss for a **declared**
  root throws/pend-stalls the tick (cursor not advanced; `reserved-pending-material`), while an
  undeclared root still returns `null` as a bare RootAnchor/read-path-only candidate.
  - **Declared roots:** `ONT_DA_ROOTS` (comma-separated `anchoredRoot` list) — the first signet demo
    has exactly one root. **Recommended (7b-A):** keep the seam sync + pre-fetch declared roots.
    **Flagged follow-on (7b-B):** making `BatchMaterialSource` async for runtime root discovery is a
    broader refactor (touches the enforce loop + fixture impl + all call sites) and belongs to the
    LE-INVOKE / challenge slice, not here.
- **Tests** (beside `select-enforcement.test.ts`): a stub HTTP endpoint (or injected fetch) serves a
  known record; the selector pre-fetches + enforces to the **same verdict** as the fixture path for
  the same material; endpoint-down / 404 / malformed body / non-reconstructing material for a declared
  root ⇒ `batchMaterial` throws so `runIndexerTick` does **not** advance the cursor; undeclared roots
  still return `null` and mutate nothing; `ONT_ENFORCEMENT=http-da` without `ONT_DA_ENDPOINT` ⇒ boot throw.

### 7c — TWO-OPERATOR HERMETIC E2E (regtest-e2e)

- Extend the enforcement e2e (`packages/regtest-e2e/src/enforcement-e2e.ts` +
  `enforcement-e2e.test.ts`) with a two-operator variant: operator-A's publisher serves `/da/{root}`
  over a hermetic HTTP server; operator-B's indexer runs `ONT_ENFORCEMENT=http-da` pointed at it,
  fetches, enforces, and writes the **identical** per-name name-state. No bitcoind — reuse the
  faked confirm firewall + the real Bitcoin inclusion verify already in that e2e.
- **Red/green battery:** (a) record served ⇒ B accepts + mints name-state identical to A's;
  (b) operator-A withholds (404) or serves a non-reconstructing body for a declared root ⇒ B
  **does not advance past the root** and writes no name-state (`reserved-pending-material`, no
  timeout/free branch); (c) an objectively invalid reconstructed record (for example underpaid
  anchor fee / altered committed name) rejects with **no mutation** — proving the transport is
  firewalled, not trusted.

## 4. Watchpoints (my review gate — CL, hold these)

1. **`consensus/src` zero-diff** — verified by `git diff --stat` on `packages/consensus/src`.
2. **`HEX_64_LOWER` root guard on both ends** — publisher serve (400 on malformed) and http client
   (validate before fetch). No un-guarded root reaches a lookup or a URL.
3. **Fail closed at every seam** — malformed / absent / timeout / network error remains `null` at
   the low-level HTTP client. The `http-da` selector must then translate a **declared** unresolved
   root into a tick-aborting throw/pend (cursor not advanced), while undeclared roots stay `null`
   and write nothing. No fabricated record; no off-chain timeout/free branch.
4. **http-da boot guard** — `ONT_ENFORCEMENT=http-da` without `ONT_DA_ENDPOINT` fails closed at boot,
   same as the fixture-file guard.
5. **One shared enforce core** — operator-B runs the identical `enforceBatchedClaim`; no parallel
   verifier, no relaxed path (spine §3(e)).
6. **Sync seam preserved** — 7b-A keeps `BatchMaterialSource` synchronous (pre-fetch at boot); no
   async-seam refactor smuggled in (that's the flagged 7b-B follow-on).
7. **Standing gates green** — `scripts/check-doc-links.sh`, `npm run check:surfaces`,
   `npm run check:audit-map`, `git diff --check`, root 26-workspace build + suite.

## 5. Operator staging (queued for DK — copy-paste when 7c lands)

Ordering mirrors A′ §6.2 (LIVE_ENFORCEMENT_PLAN / G_C_MINIMAL_SPEC): the DA record must be in
operator-A's publisher volume **before** operator-B boots with `http-da`, because operator-B
pre-fetches declared roots at boot.

1. Operator-A stages the per-root DA record into `ONT_DA_DIR` (reuse the A′ generator's
   `--material-out` output — the same file that seeds the first name).
2. Operator-A's publisher boots with `ONT_DA_DIR` set → `GET /da/{root}` serves it.
3. Operator-B's indexer boots with `ONT_ENFORCEMENT=http-da`, `ONT_DA_ENDPOINT=http://<A-publisher>:4176`,
   `ONT_DA_ROOTS=<anchoredRoot>` → pre-fetches, enforces, serves the same name-state.

No new DK operator action beyond the existing signet stand-up; two-operator is provable hermetically
(7c) without a second live host — a second live host is optional demo dressing, not a gate.

## 6. Acceptance bar (slice-7 gate)

Operator-B, pointed only at operator-A's `GET /da/{root}` over the network (no shared filesystem),
fetches the DA record, runs the audited `enforceBatchedClaim`, and mints the **same per-name
name-state** operator-A serves; a withheld (404) or non-reconstructing declared root remains
pending and holds the cursor with **no mutation** and **no timeout/free branch**; objectively
invalid reconstructed records reject with no mutation; conformance tests pin each path;
`consensus/src` is zero-diff. That is
`da-served-transport` satisfied at the availability + full-material tier — independence provable
across two operators, the censorship-resistance property, claimed honestly.

## 7. Dispatch

- **Now:** 7a (publisher `/da/{root}` + DA store) — code-only, no operator gate, dispatchable
  immediately. Then 7b (`http-da` mode), then 7c (two-operator e2e), each hermetic-first.
- **Review loop:** CL builds each sub-slice in a worktree → hands back with the §4 gates → I
  fresh-frame review against this spec → merge/push (standing authority) → CL design-concurs on the
  `da-record-content` (#98) delta in parallel (flags before canon). DK looped only if the
  flagged-reopen recommendation is contested.
