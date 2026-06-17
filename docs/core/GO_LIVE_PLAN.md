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

## G1 — live Bitcoin adapter + regtest e2e harness (detailed brief)

### Scope
Implement the real Bitcoin node client behind the existing pure ports, and build
a deterministic regtest harness that exercises the whole loop locally:

```
wallet builds+signs tx → publisher broadcasts → regtest node mines →
indexer ingests confirmed block → resolver serves state → web renders
```

### Ports to fill (these already exist as interfaces; G1 supplies live impls)
- **Indexer `IndexerBlockSource`** — today `createEmptyIndexerBlockSource`. Live:
  read confirmed blocks/anchors from the node (the indexer's confirmed-anchor +
  served-availability ingest drivers already exist and are tested).
- **Publisher `PublisherBroadcastPort`** — today `createInMemoryPublisherBroadcastPort`.
  Live: submit the raw tx to the node (`sendrawtransaction`).
- **Resolver `ResolverStore` / Web `WebReadPort`** — for G1, resolver serves what
  the indexer produced (shared in-process store or resolver reads indexer output);
  durable persistence is G2. Web reads the resolver over HTTP.

### New code (isolated, per principle 1)
- A new package — proposed **`@ont/node-rpc`** (or `@ont/adapter-bitcoin-node`) —
  the live Bitcoin **JSON-RPC** client implementing the block-source + broadcast
  ports. `@ont/bitcoin` already defines the `BitcoinRpcConfig` / Esplora interface
  *types*; this package implements them. Pure adapters/core unchanged.
- **Env-selected wiring** in the indexer/publisher/resolver/web `main`:
  `ONT_SOURCE=memory|node` (default `memory`). In-memory path stays byte-for-byte
  what the hermetic suite runs today.

### Regtest e2e harness
- Spin up a local `bitcoind -regtest` (mine-on-demand → deterministic, no network
  flake), wire the four services to the live ports, drive the loop with a test
  wallet, assert end state. Runnable locally; CI-gateable. Lives in test infra
  (`scripts/` or a dedicated test package), separate from production code. The
  stale legacy `e2e-fixture-web.mjs` is replaced, not patched.

### Deliverables
1. `@ont/node-rpc` live RPC client — **tests-first** (mocked-RPC unit tests +
   port-conformance), with a purpose/scope/tests statement.
2. Env-selected live wiring in the four app shells (in-memory default preserved).
3. Regtest e2e harness (deterministic; documented run command).
4. STATUS.md updated only when something actually runs against a node.

### Non-goals for G1
- No VPS, no signet, no Postgres (G2), no mainnet.
- No UI changes beyond wiring web read → resolver.
- Mobile untouched (G4).
- Pure core / B4 adapters untouched.

### Open question for DK/CL (recommendation included)
**Live source = bitcoind JSON-RPC vs Esplora HTTP?** Recommendation: **RPC first**
for G1 — direct, mine-on-demand on regtest, deterministic, no extra Esplora
service to run. Esplora (HTTP) can be added later as a read-scaling source for
signet/mainnet. The `@ont/bitcoin` types already cover both; G1 implements RPC.

---

## G3 note — clean-slate VPS (DK-authorized)

DK authorized wiping the VPS, including the previous signet install. G3 will ship
a teardown + clean rebuild runbook (clean-stack Docker/compose + a fresh signet
bitcoind). The destructive VPS operations are **DK's to run** (or run with the
runbook I draft); this repo carries the infra-as-code + runbook, not VPS access.
The old signet was already decommissioned in software (STATUS.md, 2026-06-11);
this stands up a **new** signet for the clean stack.
