# Go-live plan — from hermetic clean-build to a live signet deployment

**Status:** proposed (awaiting ChatLunatique review + DK ratification of the phase
name and the G1 brief). Phase name proposed: **go-live**.

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

### Signed-tx handoff (finding #1 — make the seam explicit)
The B4 assemblers produce **unsigned** txs by design (`assemble-root-anchor.ts`
header: "signing / PSBT / broadcast are the I/O edge"), and the current publisher
HTTP path assembles-then-broadcasts immediately (`apps/publisher/src/server.ts:65`)
— so a naive broadcast-port swap would submit **unsigned** txs or smuggle signing
into the publisher. G1 names the seam: **assemble (B4) → sign (wallet, B5) →
broadcast (publisher port receives a signed raw tx).** The **publisher never
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

## G3 note — clean-slate VPS (DK-authorized)

DK authorized wiping the VPS, including the previous signet install. G3 will ship
a teardown + clean rebuild runbook (clean-stack Docker/compose + a fresh signet
bitcoind). The destructive VPS operations are **DK's to run** (or run with the
runbook I draft); this repo carries the infra-as-code + runbook, not VPS access.
The old signet was already decommissioned in software (STATUS.md, 2026-06-11);
this stands up a **new** signet for the clean stack.
