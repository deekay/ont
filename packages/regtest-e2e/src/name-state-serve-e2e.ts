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
import { createFileNameStateStore, type NameStateProofBundle, type NameStateRecord } from "@ont/name-state-store";
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
const OWNER = "22".repeat(32);
const ANCHORED_ROOT = "f93b90c055208630762382e331ef07f3be22df520a7ab7e4ff54707b599839b8";
const ANCHOR_TXID = "f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16";
const MINED_HEIGHT = 170;
const ANCHOR_TX_INDEX = 1;
const leafKeyOf = (name: string): string => sha256Hex(utf8ToBytes(name));

// This hermetic serve-path test is not a live-regtest miner. The bundle is an immutable, internally-verifiable
// block-170 Bitcoin inclusion fixture whose accumulator/name/owner fields are bound to the seeded record below.
const PROOF_BUNDLE: NameStateProofBundle = {
  format: "ont-proof-bundle",
  bundleVersion: 0,
  proofSource: "accumulator_batch_claim",
  assuranceTier: "accumulator-batched",
  verificationGoal: "regtest-e2e served proof-bundle fixture",
  name: NAME,
  normalizedName: NAME,
  ownershipProof: { currentOwnerPubkey: OWNER, ownershipRef: "accumulator-leaf:alice" },
  accumulatorProof: {
    root: ANCHORED_ROOT,
    leaf: leafKeyOf(NAME),
    value: OWNER,
    siblings: [
      { level: 1, hash: "7a4ab456e0112c950c4f443951f713667438075e48fb9ec2b6613d81385ab8ca" },
      { level: 2, hash: "5530fccbd45e1da9514e57a90a83f74aafbfb7820c005a69a9688f5a3ac2c485" },
    ],
  },
  batchAnchor: { anchorTxid: ANCHOR_TXID, anchorHeight: MINED_HEIGHT },
  bitcoinInclusion: {
    anchors: [
      {
        txid: ANCHOR_TXID,
        height: MINED_HEIGHT,
        blockHeaderHex:
          "0100000055bd840a78798ad0da853f68974f3d183e2bd1db6a842c1feecf222a00000000ff104ccb05421ab93e63f8c3ce5c2c2e9dbb37de2764b3a3175c8166562cac7d51b96a49ffff001d283e9e70",
        merkle: ["b1fea52486ce0c62bb442b530a3f0132b826c74e473d1f2c220bfa78111c5082"],
        pos: ANCHOR_TX_INDEX,
      },
    ],
  },
};

function proofBundle(): NameStateProofBundle {
  return JSON.parse(JSON.stringify(PROOF_BUNDLE)) as NameStateProofBundle;
}

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
    leafKeyHex: leafKeyOf(NAME),
    owner: { kind: "owner-key", ownerPubkeyHex: OWNER },
    batchLocalIndex: 0,
    anchoredRoot: ANCHORED_ROOT,
    anchor: { txid: ANCHOR_TXID, minedHeight: MINED_HEIGHT, txIndex: ANCHOR_TX_INDEX, vout: 0 },
    firstServableHeight: MINED_HEIGHT,
    trace: [{ step: "verdict", ok: true, reason: "batched-claim-accepted" }],
    proofBundle: proofBundle(),
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
