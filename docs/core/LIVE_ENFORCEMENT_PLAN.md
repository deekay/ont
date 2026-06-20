# Live enforcement — wiring the audited B3/B4 enforcement into the deployed services

> **Status: DESIGN-FIRST (sequencing note, no implementation). Writer: ClaudeleLunatique.
> Reviewer: ChatLunatique (design-concur pending).** Opens after the go-live G3 write path
> merged to `origin/main` @ `9a482008`. Proposed stable name: **`live-enforcement`** (DK assigns the
> DECISIONS.md number on ratification). Per SOFTWARE_CANON phase-sequencing, this design note may merge;
> no implementation lands until the design is concurred. Branch: `live-enforcement-plan`.

## 1. The gap

The audited batched-claim / value / recovery / DA **enforcement is built and unit-tested** —
`@ont/claim-path` (`enforceBatchedClaim` + the contested / gate-fee / recovery enforcers, fixture-seam
tested) and the B4 adapters (`@ont/adapter-{header,indexer,da,publisher,resolver}`, all green). But the
**deployed services do not run it**: the live indexer daemon
([`apps/indexer/src/main.ts`](../../apps/indexer/src/main.ts) → `runner.ts`) ingests **RootAnchor
confirmed-anchors only** (blockSource → anchorStore), and the deployment is "RootAnchor read path ONLY"
([STATUS.md](./STATUS.md) §boundary). So the sharpest open item — the withhold-then-reveal DA defense —
is enforced over fixtures, never over the live chain.

**This front = consume the already-built adapters from the live app shells**, so `enforceBatchedClaim`
runs on real ingested data and the resolver serves the resulting name-state. No new consensus law; no
reopening a kernel call (B3/B4 boundary, #46/B0): the shells do I/O + select env; the adapters mint
validated witnesses (recompute-don't-trust); `claim-path` decides; the output is a trace + verdict +
name-state delta, **never a bare mutation**.

## 2. Seams → shells (what plugs into what)

| Built piece (green) | Lives in | The live shell that must consume it |
|---|---|---|
| `validateHeaderChain` → `BitcoinHeaderSource` | `@ont/adapter-header` | indexer: a canonical best-chain header source for inclusion (#82) |
| `buildConfirmedBatchAnchor` (inclusion firewall → `ConfirmedBatchAnchor`) | `@ont/adapter-indexer` | indexer: detect + firewall a batched-claim anchor |
| `createAvailabilitySource` (`baseLeavesForPrevRoot` / served delta) | `@ont/adapter-indexer` | indexer: the availability seam (needs `da-served-transport`) |
| `buildCommittedBatchForRoot` (gate-fee projection) | `@ont/adapter-indexer` | indexer: the gate-fee seam |
| `buildConfirmedRecoverOwnerInvoke` | `@ont/adapter-indexer` | indexer: recover-owner firewall |
| `enforceBatchedClaim` / `enforceRecoveryInvoke` / … | `@ont/claim-path` | indexer: run the enforcement, emit name-state delta |
| read firewalls + store-guards | `@ont/adapter-resolver` | resolver: serve the enforced name-state, append-only submission guards |
| RootAnchor + `/da/{root}` serving | `@ont/adapter-publisher` | publisher: serve the batch bytes the availability seam reads |

## 3. Slice sequence (dependency-ordered, tests-first, hermetic first)

1. **LE-INDEX — the live enforcement loop (FIRST).** Extend the indexer runner so that, on a confirmed
   **batched-claim** anchor (vs. a bare RootAnchor), it mints the firewall facts (`@ont/adapter-indexer`)
   + a canonical header source (`@ont/adapter-header`), runs `enforceBatchedClaim`, and writes the
   resulting **name-state delta** to a durable name-state store (new, mirrors the G2 anchor-store shape).
   Hermetic first: a fixture/regtest block source (like the G2 restart e2e), **no network**. The bare
   RootAnchor read path is unchanged (additive). Output is trace + verdict + delta; the loop never mutates
   name-state except by applying an `accept` delta.
2. **LE-RESOLVE — serve the enforced name-state.** Resolver reads the name-state store via
   `@ont/adapter-resolver` read firewalls; `/name/:name` (or the agreed route) returns the enforced
   ownership + the evidence trace. Read-only; no resolver→indexer edge (same discipline as G2).
3. **LE-DA-SERVE — publisher `/da/{root}` + the availability transport.** The publisher serves the batch
   bytes; the indexer availability seam fetches them. Gated on `da-served-transport` (parked) — proceeds on
   the recommended minimal-binary transport with a flagged reopen.
4. **LE-INVOKE / LE-CONTESTED — recover-owner + contested→L1 live paths**, once LE-INDEX's seams exist.
5. **Live signet smoke** (operator) — the deployed walk; needs a funded signet (DK), folds into G4.

## 4. Parked-decision assumptions (proceed + flagged reopen — the B4 pattern)

Per [B4_PARKED_DECISIONS.md](./B4_PARKED_DECISIONS.md) "recommend-and-proceed; none blocks":
- **`event-carrier`** → OP_RETURN-PUSHDATA1 (rec A; already what the adapters emit/read). Reopen if DK rules otherwise.
- **`da-served-transport`** → minimal-binary `/da/{root}` (rec A). LE-DA-SERVE carries a flagged reopen.
- **`refund-accounting`** → off-chain operator accounting (rec A); out of the enforcement path (surface concern).

DK's rulings firm these reopens; none blocks LE-INDEX (it composes the kernel + adapter calls that already
exist over a hermetic source).

## 5. Boundary + scope guards

- Shells/adapters do I/O + env-selection + witness-minting only; **never reopen a consensus call.**
- `enforceBatchedClaim` decides; the loop applies only an `accept` name-state delta; reject → no mutation,
  trace records which stage rejected.
- Hermetic-first: every slice lands with a default-suite (no-network) test before any live wiring.
- New name-state store mirrors `@ont/anchor-store` (node-targeted, file|memory, no codec duplication).
- Additive to the live RootAnchor read/write path — does not regress G1/G2/G3.

## 6. Open design calls for CL design-concur

1. **LE-INDEX boundary:** is the new **name-state store** the right home for the enforced delta (vs.
   extending the anchor-store)? Proposed: a separate `@ont/name-state-store` mirroring anchor-store.
2. **Detect batched-claim vs RootAnchor** in the loop: by event-type at ingest (the adapter already
   decodes OP_RETURN) — confirm the firewall split point.
3. **Slice-1 acceptance:** hermetic enforce-loop e2e (fixture block → enforce → name-state → assert delta +
   withhold→fail-closed), no network — mirrors the G2 restart e2e. Confirm that's the right first-slice bar.
4. **Naming:** `live-enforcement` as the front; LE-INDEX / LE-RESOLVE / LE-DA-SERVE / LE-INVOKE slices.
