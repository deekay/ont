# Live enforcement — wiring the audited B3/B4 enforcement into the deployed services

> **Status: DESIGN-FIRST (sequencing note, no implementation). Writer: ClaudeleLunatique.
> Reviewer: ChatLunatique — design-concur GRANTED (event c90a23a5); 2 refinements folded (§2a name-state
> payload + §2 proof-bundle seam are the net-new design for a re-glance).** Opens after the go-live G3 write path
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
| `buildConfirmedBatchAnchor` (inclusion firewall → `ConfirmedBatchAnchor`) | `@ont/adapter-indexer` | indexer: firewall-mint the confirmed anchor facts from a `RootAnchor` anchor |
| live **proof-bundle** source (`buildAccumulatorBatchClaimBundle` or equiv.) | `@ont/evidence` + indexer | the `proofBundle` `enforceBatchedClaim` binds — inclusion `anchors[0]` + `accumulatorProof.root` (`enforce-batched-claim.ts:76-80,166-186`); **built from firewalled batch material, never trusted from the wire** |
| `createAvailabilitySource` (`baseLeavesForPrevRoot` / served delta) | `@ont/adapter-indexer` | indexer: the availability seam (needs `da-served-transport`) |
| `buildCommittedBatchForRoot` (gate-fee projection) | `@ont/adapter-indexer` | indexer: the gate-fee seam |
| `buildConfirmedRecoverOwnerInvoke` | `@ont/adapter-indexer` | indexer: recover-owner firewall |
| `enforceBatchedClaim` / `enforceRecoveryInvoke` / … | `@ont/claim-path` | indexer: run the enforcement, emit name-state delta |
| read firewalls + store-guards | `@ont/adapter-resolver` | resolver: serve the enforced name-state, append-only submission guards |
| RootAnchor + `/da/{root}` serving | `@ont/adapter-publisher` | publisher: serve the batch bytes the availability seam reads |

## 2a. The `@ont/name-state-store` payload (LE-RESOLVE must answer *names*) — CL refinement 2(b)

`enforceBatchedClaim`'s `NameStateDelta` is **root-level only** (`anchoredRoot`, `firstServableHeight` —
`packages/claim-path/src/enforce-batched-claim.ts:108-120,263-270`) — not enough for a resolver to answer
"who owns name X". On `accept`, the loop already holds the batch's per-leaf projections (the completeness
input it built). So the store records, **per accepted name**, a `NameStateRecord`:

- `normalizedName` (the store key) + `name`
- `owner` — `DcvOwnerIdentity` (`owner-key` xonly hex, or `owner-commitment` hex)
- `anchoredRoot` + anchor coordinates (`txid`, `minedHeight`, `txIndex`, `vout`)
- `firstServableHeight`

Keyed by `normalizedName`; mirrors `@ont/anchor-store` (node-targeted, `file|memory`, codec, **no
resolver→indexer edge**). The per-name records are **derived by the loop** from the accepted batch's
projections — `enforceBatchedClaim`'s return type is unchanged (the loop owns the projection→record
mapping). A reject writes **no** records. LE-RESOLVE reads this store to answer per-name queries with the
accepted evidence.

## 3. Slice sequence (dependency-ordered, tests-first, hermetic first)

1. **LE-INDEX — the live enforcement loop (FIRST).** Extend the indexer runner so every confirmed anchor
   **first** runs the existing RootAnchor inclusion firewall and lands in the anchor-store read path
   (G1/G2/G3 unchanged — additive). **Then**, only when verified **batch-claim material is present** — a
   proof bundle + committed batch + served bytes / DA record that reconstruct and firewall-mint — it builds
   the `enforceBatchedClaim` inputs (proof bundle, header source, availability, committed batch), runs the
   enforcement, and on `accept` writes the **per-name records** (§2a) to a new `@ont/name-state-store`.
   **There is NO distinct "batch" event type** (CL refinement 1): `@ont/wire` decodes both a bare and a
   batch anchor as `RootAnchor` (`packages/wire/src/index.ts:111-146`); batch-ness is decided by the
   **presence + firewall-verification of batch material**, not the event class. Missing/unverifiable batch
   material ⇒ **no** name-state mutation (the anchor still lands in the read path). Hermetic first: a
   fixture/regtest block source (like the G2 restart e2e), **no network**. The loop mutates name-state ONLY
   by applying an `accept`'s per-name records; a reject records the trace and mutates nothing.
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
- `enforceBatchedClaim` decides; the loop applies only an `accept`'s per-name records (§2a); reject → no
  mutation, trace records which stage rejected.
- Hermetic-first: every slice lands with a default-suite (no-network) test before any live wiring.
- New name-state store mirrors `@ont/anchor-store` (node-targeted, file|memory, no codec duplication).
- Additive to the live RootAnchor read/write path — does not regress G1/G2/G3.

## 6. Design calls — RESOLVED (CL design-concur, event c90a23a5; 2 refinements folded)

1. **Name-state store — CONCURRED.** New `@ont/name-state-store` (not extending anchor-store), same shared-
   infra pattern as G2, with an explicit accepted-batch / per-name projection contract (§2a) and no
   resolver→indexer edge.
2. **Firewall split point — CORRECTED (CL refinement 1):** NOT by event type — `@ont/wire` decodes both a
   bare and a batch anchor as `RootAnchor` (`packages/wire/src/index.ts:111-146`). Run the existing
   RootAnchor inclusion firewall + read path first (additive), then enforce only when batch-claim material
   is present + firewall-verified; missing material ⇒ no name-state mutation. Folded into §3 LE-INDEX.
3. **Slice-1 acceptance — CONCURRED + battery (CL):** hermetic enforce-loop e2e, no network, mirroring the
   G2 restart e2e. Red/green battery: (a) accepted batch writes per-name name-state; (b) withheld/absent
   served bytes → reject at availability, NO mutation; (c) absent/mismatched proof bundle → reject at
   inclusion; (d) a bare RootAnchor still lands in anchor-store / read path and causes NO name-state mutation.
4. **Naming — CONCURRED:** `live-enforcement`; LE-INDEX / LE-RESOLVE / LE-DA-SERVE / LE-INVOKE. Split
   LE-CONTESTED from LE-INVOKE if contested grows large.

**Net-new design from this round (for CL re-glance):** §2a `NameStateRecord` payload (the per-name
projection the store holds) + the §2 proof-bundle seam row. The split-point + battery folds apply CL's
verbatim rulings.
