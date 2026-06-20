// LE-RESOLVE LR-3 — the hermetic serve-after-restart e2e (HERMETIC; no bitcoind, no ONT_E2E_REGTEST gate). The
// LE-RESOLVE analog of the G2 restart-survival e2e: it proves the DEPLOYED resolver read surface serves enforced
// name-state durably over real HTTP through the REAL env selector after a restart.
//
// SLICE BOUNDARY (CL): LR-3 locks the resolver SERVE path; the enforcement WRITE path is locked separately by
// enforcement-e2e (which drives LE-INDEX end-to-end and asserts the durable per-name write + restart-survival).
// So here we seed the durable name-state directly via the REAL file store (createFileNameStateStore.putMany) —
// name-state.json under ONT_STORE_DIR is exactly the durable file the live indexer writes and the resolver reads.
//
//   - one accepted NameStateRecord is persisted to name-state.json under a temp ONT_STORE_DIR;
//   - the store is dropped; the resolver rebuilds a FRESH selectResolverNameStateView over the same dir (restart);
//   - the resolver is served over real HTTP (createResolverHttpServer) and GET /names/:name/state returns the
//     enforced facts + not-ownership-authority stamps;
//   - reject-don't-normalize at the REAL file selector: a case-variant request is an exact-key MISS in getByName
//     → 404 name-unknown (NOT 409 name-mismatch — the 409 path is the hostile/buggy injected-source case, CL nuance);
//   - selector absence: a memory/unset selector → no nameStateView → the route 404s not-served, even though
//     name-state.json exists on disk (selector-absence becomes route-unavailable, mirroring restart-survival P5).
// TESTS: ./name-state-serve-e2e.test.ts.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { sha256Hex, utf8ToBytes } from "@ont/protocol";
import { createFileNameStateStore, type NameStateRecord } from "@ont/name-state-store";
import { selectResolverNameStateView, createResolverHttpServer, createInMemoryResolverStore } from "@ont/resolver";

export interface NameStateServeE2eResult {
  readonly canonicalName: string;
  readonly ownerPubkeyHex: string;
  readonly anchoredRoot: string;
  readonly leafKeyHex: string;
  readonly servedStatus: number; // GET /names/alice/state after restart (real file selector + resolver HTTP)
  readonly servedBody: Record<string, unknown>;
  readonly caseVariantStatus: number; // GET /names/Alice/state — exact-key miss at the file selector
  readonly caseVariantReason: unknown;
  readonly memorySelectorStatus: number; // GET /names/alice/state with a memory/unset selector (no nameStateView)
  readonly memorySelectorReason: unknown;
}

const NAME = "alice";
const OWNER = "11".repeat(32);
const ANCHORED_ROOT = "7a".repeat(32);
const ANCHOR_TXID = "b".repeat(64);
const MINED_HEIGHT = 170;

/** Start an HTTP server on an ephemeral localhost port and resolve its base URL. */
function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

function acceptedRecord(): NameStateRecord {
  return {
    canonicalName: NAME,
    leafKeyHex: sha256Hex(utf8ToBytes(NAME)),
    owner: { kind: "owner-key", ownerPubkeyHex: OWNER },
    batchLocalIndex: 0,
    anchoredRoot: ANCHORED_ROOT,
    anchor: { txid: ANCHOR_TXID, minedHeight: MINED_HEIGHT, txIndex: 0, vout: 1 },
    firstServableHeight: MINED_HEIGHT,
    trace: [{ step: "verdict", ok: true, reason: "batched-claim-accepted" }],
  };
}

export async function runNameStateServeE2e(): Promise<NameStateServeE2eResult> {
  const dir = await mkdtemp(join(tmpdir(), "ont-name-state-serve-"));
  const servers: Server[] = [];
  try {
    const fileEnv = { ONT_STORE: "file", ONT_STORE_DIR: dir };

    // ── Phase 1: persist one accepted name-state via the REAL file store (the SERVE-path slice boundary) ──
    const rec = acceptedRecord();
    await createFileNameStateStore(join(dir, "name-state.json")).putMany([rec]);

    // ── Phase 2: restart — drop that store; the resolver rebuilds a fresh selector over the same dir ──

    // ── Phase 3: serve via the REAL env selector + resolver HTTP ──
    const nameStateView = selectResolverNameStateView(fileEnv);
    if (!nameStateView) throw new Error("e2e: file selector returned no nameStateView");
    const resolver = createResolverHttpServer({ store: createInMemoryResolverStore(), nameStateView });
    servers.push(resolver);
    const url = await listen(resolver);

    const served = await fetch(`${url}/names/${NAME}/state`);
    const servedBody = (await served.json()) as Record<string, unknown>;

    // Reject-don't-normalize at the REAL file selector: a case-variant is an exact-key miss → 404 name-unknown.
    const caseVariant = await fetch(`${url}/names/Alice/state`);
    const caseVariantBody = (await caseVariant.json()) as Record<string, unknown>;

    // ── Phase 4: absence — a memory/unset selector → no nameStateView → 404 not-served (file still on disk) ──
    const memView = selectResolverNameStateView({ ONT_STORE: "memory" }); // undefined
    const memResolver = createResolverHttpServer(
      memView ? { store: createInMemoryResolverStore(), nameStateView: memView } : { store: createInMemoryResolverStore() },
    );
    servers.push(memResolver);
    const memUrl = await listen(memResolver);
    const memServed = await fetch(`${memUrl}/names/${NAME}/state`);
    const memBody = (await memServed.json()) as Record<string, unknown>;

    return {
      canonicalName: NAME,
      ownerPubkeyHex: OWNER,
      anchoredRoot: ANCHORED_ROOT,
      leafKeyHex: rec.leafKeyHex,
      servedStatus: served.status,
      servedBody,
      caseVariantStatus: caseVariant.status,
      caseVariantReason: caseVariantBody.reason,
      memorySelectorStatus: memServed.status,
      memorySelectorReason: memBody.reason,
    };
  } finally {
    for (const s of servers) await new Promise<void>((resolve) => s.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
}
