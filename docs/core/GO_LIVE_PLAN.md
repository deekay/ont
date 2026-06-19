# Go-live plan — from hermetic clean-build to a live signet deployment

**Status:** go-live phase active. **G1 shipped green** on regtest (`deacc94`,
branch `go-live-g1`, local/unpushed) — writer+reviewer verified (CL independent
green-OK). **G2 shipped green** (branch `go-live-g2`, local/unpushed; slices
6a/6b/6c `d0c085b` → `707fae3` → `ac95063`, hermetic restart-survival e2e green,
CL green-OK per slice) — see the G2 outcome banner below.
Phase name: **go-live**.

DK approved this direction and a clean-slate VPS rebuild on 2026-06-17
(events d90aa476 → 982d87b2): "keep all layers/software carefully separate and
operationally clean … we can kill anything else on the VPS including the previous
signet … blow it all away and rebuild from scratch."

## Premise

Clean-build B1–B5 is **feature-complete but hermetic**: 1107 unit/conformance
tests, all over in-memory/empty ports. No app talks to a real Bitcoin node, a
database, or the network; the old VPS / `docker-compose.yml` / e2e scripts target
the now-quarantined legacy stack. This phase fills the deliberately-deferred
**live-I/O layer** and stands up a real deployment so the website and mobile app
can claim names, manage values, and do transfers/sales on **signet**.

The external-audit gate (B0 ruled call 6) remains a hard gate before anything
**mainnet**. Signet may proceed now.

## Principles (DK's two constraints, binding for every G-phase)

1. **Layers carefully separate.** The audited core and pure adapters (L1 wire /
   L2 consensus / L3 evidence / B4 pure adapters) are **not touched** by go-live.
   Live I/O is new code in its **own package(s)**, implementing the *existing*
   port interfaces. No network, DB, clock, or node call ever leaks into a pure
   layer. The recompute-don't-trust boundary is preserved: live adapters feed
   *witnessed inputs* to the audited predicates, never verdicts.
2. **Operationally clean.** One process = one job. Each new component ships with a
   written purpose/scope/tests statement (B0 amendment). Live wiring is
   **env-selected** (`memory` for tests, `node` for live) so the hermetic suite
   stays the default and untouched. The VPS is rebuilt **clean-slate**: old
   signet + old stack wiped, nothing carried over, infra-as-runbook.

## The four phases

| Phase | Goal | Gate |
|------|------|------|
| **G1** | Live Bitcoin adapter + **regtest** end-to-end harness (local/CI). | The live test we don't have today; de-risks everything before any VPS. |
| **G2** | Persistence + live wiring: `@ont/db` stores + env-selected live ports into the app shells. | Stateful, restart-safe services. |
| **G3** | Clean-stack deploy: new Docker/compose + VPS runbook + **signet** bitcoind; wipe old box. | Services running on the DO VPS against signet. |
| **G4** | Surfaces live: point website + mobile at deployed endpoints; walk claim → manage-value → transfer/sale on signet. | The end-to-end user story DK asked for. |

Each phase is tests-first and ChatLunatique-reviewed, same discipline as B1–B5.
No live writes to signet until G1's loop is green on regtest.

---

## G1 — live Bitcoin wiring + regtest e2e harness (detailed brief)

*Revised 2026-06-17 after ChatLunatique review (event 0c5af897) — 5 findings folded in.*

### Scope — **RootAnchor claim path only**
G1 wires the live node behind the existing ports and proves exactly one end-to-end
loop on **regtest**: a name **claim** anchored by a RootAnchor tx, ingested,
served, and rendered. Served-availability, recover-invoke, and transfer/sale are
**explicitly out of G1** (each is a later G-slice with its own candidate builder +
store + read path — see Non-goals).

```
wallet assembles (B4) → wallet SIGNS (B5) → publisher broadcasts SIGNED raw tx →
regtest node mines → indexer ingests confirmed RootAnchor → resolver serves →
web renders
```

### Reuse, don't rebuild: live RPC already exists in `@ont/bitcoin`
Correcting the first draft: `@ont/bitcoin` is **not** interfaces-only. It already
ships the live RPC I/O edge — `BitcoinRpcBlockPoller` (`src/index.ts:249`),
`loadBitcoinBlocksFromRpc` (`:451`), `sendBitcoinRpcRawTransaction` (`:627`),
`assertBitcoinRpcChain` (`:715`), all tested. These are the package's designated
**I/O edge**, distinct from its pure crypto submodules (block-header / merkle /
validate-header-chain). G1 therefore does **not** build a new RPC client. It adds
a **thin port-binding layer** that adapts those existing helpers to the app ports
— no standalone `@ont/node-rpc` package unless the binding grows enough to warrant
one (decide at implementation; default = small per-app `live/` wiring modules).
The audited core (`@ont/consensus`) and the pure B4 adapter transforms stay
untouched.

### Ports to fill (G1 RootAnchor scope)
- **Indexer `IndexerBlockSource.nextConfirmedAnchors`** — today
  `createEmptyIndexerBlockSource`. Live: feed confirmed RootAnchor candidates from
  the node via `BitcoinRpcBlockPoller` / `loadBitcoinBlocksFromRpc`. (This port
  feeds *only* confirmed anchors; the served-availability `IndexedBatchStore` and
  recover-invoke `RecoverInvokeStore` are separate drivers, out of G1.)
- **Publisher `PublisherBroadcastPort`** — today
  `createInMemoryPublisherBroadcastPort`. Live: submit an **already-signed** raw
  tx via `sendBitcoinRpcRawTransaction`.
- **Resolver `ResolverStore` / Web `WebReadPort`** — resolver serves what the
  indexer produced; durable persistence is G2; web reads resolver over HTTP.

### Signed-tx handoff (finding #1 — make the seam explicit; **resolved by the G3 publisher slice**)
The B4 assemblers produce **unsigned** txs by design (`assemble-root-anchor.ts`
header: "signing / PSBT / broadcast are the I/O edge"). The publisher HTTP API
*used to* assemble-then-broadcast in a single route, which a naive broadcast-port
swap would have turned into submitting **unsigned** txs. The G3 publisher slice
**split that seam structurally**: `POST /assemble/*` return the unsigned tx only
(the assemble handlers do not receive the broadcast port) and `POST /broadcast` is
the only route that owns the port (it relays an already-signed legacy raw, failing
closed on any non-legacy raw). G1's boundary holds: **assemble (B4) → sign (wallet,
B5) → broadcast (publisher port receives a signed raw tx).** The **publisher never
signs.** In the regtest harness the test wallet signs the assembled tx between
assemble and broadcast; the publisher's broadcast port takes signed bytes only.

### Live wiring + chain gate (finding #5)
- **Env-selected wiring** in indexer/publisher/resolver/web `main`:
  `ONT_SOURCE=memory|node` (default `memory` → the hermetic suite is byte-for-byte
  unchanged).
- **Mandatory expected-chain assertion.** `ONT_CHAIN=regtest|signet` (no default
  that could reach mainnet); before any poll or broadcast the live wiring calls
  `assertBitcoinRpcChain(rpc, expectedChain)` and refuses to start on mismatch.
  This stops a mispointed RPC URL from becoming an accidental mainnet write path.
  `mainnet` is not a permitted value until the audit gate clears.

### Regtest e2e harness
Spin up local `bitcoind -regtest` (mine-on-demand → deterministic, no network
flake), wire the services to the live ports, drive the RootAnchor claim loop with
a test wallet (assemble → sign → broadcast → mine → ingest → serve → render),
assert end state. Runnable locally; CI-gateable. Test infra (separate from
production code). The stale legacy `e2e-fixture-web.mjs` is **replaced**, not
patched. Resolver/indexer boundary (finding #4): in the **harness only**, indexer
and resolver may share an injected store object; **production wiring keeps the
processes distinct, and the resolver never constructs confirmed-inclusion /
committed-batch facts as a request side effect** (B4 §"Indexer distinct").

### Deliverables
1. Thin live port-bindings over `@ont/bitcoin`'s RPC helpers (indexer block-source
   + publisher broadcast) — **tests-first** (mocked-RPC unit tests +
   port-conformance), with a purpose/scope/tests statement; publisher stays
   non-signing.
2. Env-selected live wiring + the `ONT_CHAIN` assert in the four app shells
   (in-memory default preserved).
3. Regtest e2e harness for the RootAnchor claim path (deterministic; documented
   run command).
4. STATUS.md updated only when something actually runs against a node.

### Non-goals for G1
- No VPS, no signet, no Postgres (G2), no mainnet.
- **Only the RootAnchor claim path.** Served-availability, recover-invoke,
  transfer/sale are later G-slices (each adds its candidate builder + store + read
  path).
- No publisher-side signing.
- No UI changes beyond wiring web read → resolver. Mobile untouched (G4).
- Pure core (`@ont/consensus`) / B4 adapter transforms untouched.

### Resolved (was open question)
**Live source = bitcoind JSON-RPC**, RPC-first — CL concurs. Direct, mine-on-demand
on regtest, deterministic, no extra Esplora service. Esplora (HTTP) is a later
read-scaling source for signet/mainnet; `@ont/bitcoin` already carries both
interface types.

---

## G2 — persistence + live wiring (detailed brief)

***SHIPPED green 2026-06-17*** (branch `go-live-g2`, local/unpushed). Outcome: the durable
confirmed-anchor read path is restart-safe across indexer→resolver→web. Slices 6a `d0c085b` (extract
the shared durable store), 6b `707fae3` (resolver durable read wired), 6c `ac95063` (hermetic
restart-survival e2e). **Implementation diverged from the design-fork RECs below per ChatLunatique's
ruling:** the shared store is a **new clean `@ont/anchor-store`**, NOT a reuse of `@ont/db` (REC #3 A) —
`@ont/db` carries old-stack snapshot/Postgres gravity + the dropped-field CAUTION; and **Postgres is
deferred** out of G2 (REC #2's second half) — file store only meets the restart-safe gate on a single box.
The brief below is the design record; see [DECISIONS.md](./DECISIONS.md) #87 `g2-durable-anchor-read` and
[STATUS.md](./STATUS.md) for the shipped state. The forks are kept for provenance.*

### Goal
Make the live services **restart-safe**. Today the indexer holds confirmed anchors
and its ingest cursor in memory (`apps/indexer/src/main.ts` hardcodes
`createInMemoryIndexerCursorStore(0)` + `createInMemoryConfirmedAnchorStore()`), and
the web renders a confirmed tx only from a **harness-injected snapshot**
(`createSnapshotWebReadPort`). Kill any process and the confirmed-anchor read path
is gone. G2 gives the indexer durable cursor + confirmed-anchor stores and wires a
durable read path the web serves from — so a restarted stack re-serves
already-confirmed RootAnchor txs and the indexer resumes from its durable height
without re-ingesting.

### Scope — **RootAnchor confirmed-anchor read path only** (G1's scope, made durable)
Same boundary as G1. Per-name value/recovery history (the resolver's `ResolverStore`
value/recovery path) stays **B3-deferred** — deriving name→owner from a batch root is
batched-claim-path work, not built. G2 persists exactly what G1 mints: the
`ConfirmedAnchorRecord` set (`{confirmedAnchor, feeTxParts}`) + the `IndexerCursor`.
No new consensus, no new firewall; the audited core and B4 adapters stay untouched
(Principle 1).

### The two halves
**(a) Durable indexer stores (persistence).** Implement `IndexerCursorStore` and
`ConfirmedAnchorStore` (the existing ports in `runner.ts` / `ingest-anchors.ts`) over
durable backends, env-selected alongside the existing `ONT_SOURCE`. On restart: the
cursor reloads, `has` / `getByTxid` answer from durable state.

**(b) Read wiring (live ports into the shells).** The web's `tx(txid)` read comes from
the durable confirmed-anchor store instead of a harness snapshot. Production topology
(Principle 2, one-process-one-job): the **resolver** exposes a **read-only**
confirmed-anchor endpoint over the durable store, and the **web reads the resolver over
HTTP** — the shape the G1 brief already anticipated ("web reads resolver over HTTP").
The resolver only **reads** indexer-produced facts; it never mints
confirmed-inclusion / committed-batch facts on the request path (the standing G1
boundary).

### Hazard to respect (why a clean codec, not the legacy snapshot)
`@ont/db` already ships pg + file JSONB plumbing, **but** its `PersistedIndexerSnapshot`
schema is old-stack-shaped (names / transactionProvenance / accumulatorNames) and
carries a loud CAUTION (`packages/db/src/index.ts:157`): its whitelist parser once
**silently erased** persisted fields on restart and "lost the root chain + accumulator
names once." G2 therefore persists the **clean** `ConfirmedAnchorRecord` shape through a
**new, strict, round-trip-identity-tested codec** — not the legacy snapshot path.
`ConfirmedAnchorRecord` contains `LegacyTransaction` bodies with `bigint` output values,
so the codec must be bigint-safe (string-encode, like the web projection's `valueSats`)
and **round-trip byte-identical** (a dropped field is a consensus-relevant data-loss bug,
exactly the failure the CAUTION describes).

### Design forks for review (option → rec → ripple)
1. **Read topology.** (A) web reads the durable store directly; (B) resolver read-API +
   web reads it over HTTP. **REC: B** — matches DK's one-process-one-job principle and
   the G1 brief's stated end shape; keeps DB access out of the web tier. *Ripple:* a new
   read-only resolver endpoint + a web HTTP read port (replaces the harness snapshot port).
2. **Backends in G2.** (A) file store only (defer Postgres to G3); (B) file **and**
   Postgres, env-selected. **REC: file first** (smallest change that meets the
   restart-safe gate on a single box), **Postgres second in the same phase** since the
   VPS (G3) needs it and `@ont/db` already carries the pg plumbing — but pg can slip to
   early-G3 if scope tightens. *Ripple:* an `ONT_STORE=memory|file|postgres` selector
   beside `ONT_SOURCE`.
3. **Reuse `@ont/db` vs new store package.** (A) reuse `@ont/db`'s pg connection +
   generic `ont_documents` table (extend `DatabaseDocumentKind` with clean kinds
   `confirmed_anchor` / `indexer_cursor`) and the file-write helpers, persisting the
   clean record via the new codec; (B) a brand-new clean `@ont/store` package. **REC: A**
   — reuse the plumbing, add the clean kinds + codec, leave the legacy
   `PersistedIndexerSnapshot` path untouched/unused. *Ripple:* `@ont/db` gains 2 kinds;
   the durable store impls live in a small `live/` module (per-app or a thin shared
   package, decided at implementation as in G1).
4. **Projection home.** The `ConfirmedAnchorRecord → ServedTx` projection
   (`confirmedAnchorTxToServedTx`) lives in **web** today (placed there for the G1
   harness). With the resolver as the read API, either (A) the resolver serves the **raw**
   confirmed-anchor record JSON and web keeps projecting to `ServedTx`, or (B) promote the
   pure projection to a neutral B4 home (e.g. `@ont/adapter-resolver`) so the resolver
   serves `ServedTx` directly and web is a thin HTML renderer. **REC: B** (the resolver is
   the read API; web shouldn't own the projection the resolver serves), with (A)
   acceptable if we want to keep the resolver payload minimal. *Ripple:* either move a
   pure function across packages, or pin the resolver's confirmed-anchor JSON contract.

### Ports to make durable / wire
- `IndexerCursorStore` (load/save) — durable.
- `ConfirmedAnchorStore` (has/put/getByTxid) — durable; `getByTxid` is the read accessor
  the resolver serves.
- Resolver: new **read-only** confirmed-anchor endpoint (e.g. `GET /tx/:txid`) over the
  durable store.
- Web: `WebReadPort.tx` backed by an HTTP read of the resolver (replaces
  `createSnapshotWebReadPort`).

### Slice plan (tests-first, CL-reviewed per slice — same loop as G1)
1. **Durable cursor store** (file) — load/save + round-trip + restart test.
2. **Durable confirmed-anchor store** (file) — `has` / `put` / `getByTxid` + the strict
   round-trip codec (bigint-safe, identity-tested).
3. **Env-selected store wiring** into the indexer entrypoint (`ONT_STORE`; memory default
   preserved, hermetic suite unchanged).
4. **Resolver read-only confirmed-anchor endpoint** over the durable store (reads only;
   mints nothing — boundary-tested).
5. **Web HTTP read port** → resolver `/tx/:txid`; wire into the web shell.
6. **Postgres backend** for cursor + confirmed-anchor stores (same ports, `@ont/db`
   plumbing) — if kept in G2 per fork 2.
7. **Regtest e2e: restart-survival** — extend the harness: run the loop, **stop the
   processes**, restart over the same durable store, assert the confirmed RootAnchor tx
   still renders and the indexer resumes from the durable cursor without re-ingesting.

### Acceptance bar (G2 gate = "stateful, restart-safe")
The regtest e2e proves: ingest a confirmed RootAnchor → **restart the indexer + read
path** → `/tx/:txid` still renders the confirmed facts from durable state, and a fresh
ingest tick resumes from the durable cursor (no duplicate ingest, no re-derivation).
Default `npm test` stays hermetic (memory store default); the durable / e2e paths are
env-gated as in G1.

### Non-goals for G2
- No per-name value/recovery durability (B3-deferred; the resolver value/recovery path
  stays the in-memory null-ownership path).
- No VPS, no signet, no mainnet (G3/G4).
- No new consensus / firewall; audited core + B4 adapters untouched.
- No mobile / UI changes (G4).

---

## G3 note — clean-slate VPS (DK-authorized)

DK authorized wiping the VPS, including the previous signet install. G3 will ship
a teardown + clean rebuild runbook (clean-stack Docker/compose + a fresh signet
bitcoind). The destructive VPS operations are **DK's to run** (or run with the
runbook I draft); this repo carries the infra-as-code + runbook, not VPS access.
The old signet was already decommissioned in software (STATUS.md, 2026-06-11);
this stands up a **new** signet for the clean stack.
