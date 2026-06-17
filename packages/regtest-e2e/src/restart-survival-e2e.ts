// G2 slice 6c — restart-survival e2e (HERMETIC; no bitcoind, no ONT_E2E_REGTEST gate).
//
// Proves the deployable durable read path survives a process restart over the REAL 6b path:
//   - the indexer persists a confirmed RootAnchor to file stores (cursor.json + confirmed-anchors.json) under
//     one temp ONT_STORE_DIR — runIndexerTick with FAKE block-source + confirm ports and the REAL file stores
//     (selectIndexerStores({ ONT_STORE: "file", ONT_STORE_DIR }));
//   - all store objects are dropped and rebuilt over the same dir (the restart);
//   - the resolver is created through the REAL selectResolverAnchorTxView({ ONT_STORE: "file", ONT_STORE_DIR })
//     (NOT a harness recordToView bridge) and served over real HTTP;
//   - the web reads through resolver HTTP via createResolverTxSource(resolverUrl) (NOT createSnapshotWebReadPort);
//   - direct /tx/:txid, /?q=<txid>, and /search?q=<txid> render the persisted confirmed facts AFTER restart;
//   - a resumed indexer tick starts after the durable cursor and the re-presented anchor is skipped (idempotent);
//   - a memory/unset resolver selector does NOT serve the durable anchors (absence), through the same HTTP path.
//
// HERMETIC by design (CL, event 0285bca3): fake block/confirm ports + real file stores; no node, no gate, so it
// is part of the default acceptance suite. The firewall (slice 1) is faked because 6c locks durable + read
// survival, not the firewall. TESTS: ./restart-survival-e2e.test.ts.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { legacyTxidOf } from "@ont/bitcoin";
import { assembleRootAnchorTx } from "@ont/adapter-publisher";
import {
  runIndexerTick,
  selectIndexerStores,
  type ConfirmAnchor,
  type IndexerBlockSource,
  type BuildConfirmedBatchAnchorInput,
} from "@ont/indexer";
import { selectResolverAnchorTxView, createResolverHttpServer, createInMemoryResolverStore } from "@ont/resolver";
import { handleWebRequest, createResolverTxSource, createEmptyWebReadPort, type WebReadPort, type ResolverTxSource } from "@ont/web";

export interface RestartSurvivalResult {
  readonly anchorTxid: string;
  readonly minedHeight: number;
  readonly anchoredRoot: string;
  readonly batchSize: number;
  readonly directTxHtml: string; // GET /tx/:txid
  readonly queryTxHtml: string; // GET /?q=<txid>
  readonly searchTxHtml: string; // GET /search?q=<txid>
  readonly persistedCursorHeight: number;
  readonly resumedCursorHeight: number;
  readonly resumeAccepted: readonly string[];
  readonly resumeSkipped: readonly string[];
  readonly memorySelectorTxHtml: string;
}

const PREV_ROOT = "bb".repeat(32);
const NEW_ROOT = "7a".repeat(32);
const BATCH_SIZE = 5;
const MINED_HEIGHT = 800_123;

/** Start an HTTP server on an ephemeral localhost port and resolve its base URL. */
function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

export async function runRestartSurvivalE2e(): Promise<RestartSurvivalResult> {
  const dir = await mkdtemp(join(tmpdir(), "ont-restart-survival-"));
  const servers: Server[] = [];
  const port: WebReadPort = createEmptyWebReadPort(); // the web's sync port is never used on these txid routes
  const webHtml = async (path: string, txSource: ResolverTxSource): Promise<string> => {
    const res = await handleWebRequest(new Request(`http://web.test${path}`, { method: "GET" }), { port, txSource });
    return res.text();
  };

  try {
    // A real RootAnchor anchor tx so its OP_RETURN carrier decodes to a RootAnchor matching the confirmed fact
    // (the resolver's confirmedAnchorTxToServedTx cross-checks newRoot/batchSize before serving).
    const anchorTx = assembleRootAnchorTx({
      prevRoot: PREV_ROOT,
      newRoot: NEW_ROOT,
      batchSize: BATCH_SIZE,
      fundingInputs: [{ prevoutTxid: "ab".repeat(32), prevoutVout: 0 }],
    });
    if (anchorTx === null) throw new Error("e2e: assembleRootAnchorTx returned null");
    const anchorTxid = legacyTxidOf(anchorTx);
    if (anchorTxid === null) throw new Error("e2e: anchor tx not serializable");

    // The firewall is FAKED: confirm returns the ok record for the (opaque) candidate. anchoredRoot/batchSize
    // match the carrier so the resolver projection accepts it; the candidate value is irrelevant to confirm.
    const confirm: ConfirmAnchor = () => ({
      ok: true,
      confirmedAnchor: { anchorTxid, minedHeight: MINED_HEIGHT, anchoredRoot: NEW_ROOT, batchSize: BATCH_SIZE },
      feeTxParts: { anchorTx, prevoutTxs: [] },
    });
    const candidate = { anchorTx } as unknown as BuildConfirmedBatchAnchorInput; // opaque — confirm ignores it

    const fileEnv = { ONT_STORE: "file", ONT_STORE_DIR: dir };

    // ── Phase 1: persist via the REAL env-selected file stores ──
    const stores1 = selectIndexerStores(fileEnv);
    let persistYielded = false;
    const persistSource: IndexerBlockSource = {
      nextConfirmedAnchors: (cursor) => {
        if (persistYielded) return Promise.resolve({ candidates: [], cursor });
        persistYielded = true;
        return Promise.resolve({ candidates: [candidate], cursor: { height: cursor.height + 1 } });
      },
    };
    const report1 = await runIndexerTick({ blockSource: persistSource, cursorStore: stores1.cursorStore, anchorStore: stores1.anchorStore, confirm });
    if (!report1.anchors.accepted.includes(NEW_ROOT)) throw new Error("e2e: anchor was not accepted on first ingest");
    const persistedCursorHeight = report1.cursor.height;

    // ── Phase 2: restart — drop stores1; phases 3+ rebuild fresh instances over the same dir ──

    // ── Phase 3: serve via the REAL resolver selector + resolver HTTP + web txSource ──
    const anchorTxView = selectResolverAnchorTxView(fileEnv);
    if (anchorTxView === undefined) throw new Error("e2e: file selector returned no anchorTxView");
    const resolver = createResolverHttpServer({ store: createInMemoryResolverStore(), anchorTxView });
    servers.push(resolver);
    const resolverUrl = await listen(resolver);
    const txSource = createResolverTxSource(resolverUrl);
    const directTxHtml = await webHtml(`/tx/${anchorTxid}`, txSource);
    const queryTxHtml = await webHtml(`/?q=${anchorTxid}`, txSource);
    const searchTxHtml = await webHtml(`/search?q=${anchorTxid}`, txSource);

    // ── Phase 4: resume — fresh stores over the same dir; durable cursor + idempotent re-present (separate) ──
    const stores2 = selectIndexerStores(fileEnv);
    const resumedCursorHeight = (await stores2.cursorStore.load()).height;
    // EXPLICIT stale re-presentation: present the already-persisted candidate AGAIN with the cursor UNCHANGED, so
    // the dedupe (store.has → skipped) is exercised independently of cursor monotonicity.
    let restalePresented = false;
    const resumeSource: IndexerBlockSource = {
      nextConfirmedAnchors: (cursor) => {
        if (restalePresented) return Promise.resolve({ candidates: [], cursor });
        restalePresented = true;
        return Promise.resolve({ candidates: [candidate], cursor }); // cursor unchanged — no new blocks
      },
    };
    const report2 = await runIndexerTick({ blockSource: resumeSource, cursorStore: stores2.cursorStore, anchorStore: stores2.anchorStore, confirm });

    // ── Phase 5: absence — a memory/unset selector through the SAME web txSource → resolver HTTP path ──
    const memAnchorView = selectResolverAnchorTxView({ ONT_STORE: "memory" }); // undefined
    const memResolver = createResolverHttpServer(
      memAnchorView ? { store: createInMemoryResolverStore(), anchorTxView: memAnchorView } : { store: createInMemoryResolverStore() },
    );
    servers.push(memResolver);
    const memUrl = await listen(memResolver);
    const memorySelectorTxHtml = await webHtml(`/tx/${anchorTxid}`, createResolverTxSource(memUrl));

    return {
      anchorTxid,
      minedHeight: MINED_HEIGHT,
      anchoredRoot: NEW_ROOT,
      batchSize: BATCH_SIZE,
      directTxHtml,
      queryTxHtml,
      searchTxHtml,
      persistedCursorHeight,
      resumedCursorHeight,
      resumeAccepted: report2.anchors.accepted,
      resumeSkipped: report2.anchors.skipped,
      memorySelectorTxHtml,
    };
  } finally {
    for (const s of servers) await new Promise<void>((resolve) => s.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
}
