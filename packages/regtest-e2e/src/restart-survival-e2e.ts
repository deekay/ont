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
//   - a memory/unset resolver selector does NOT serve the durable anchors (absence).
//
// HERMETIC by design (CL, event 0285bca3): fake block/confirm ports + real file stores; no node, no gate, so it
// is part of the default acceptance suite. RED until runRestartSurvivalE2e is implemented (stub throws).
// TESTS: ./restart-survival-e2e.test.ts.

export interface RestartSurvivalResult {
  readonly anchorTxid: string;
  readonly minedHeight: number;
  readonly anchoredRoot: string;
  readonly batchSize: number;
  /** Rendered HTML AFTER restart, read through the web → resolver-HTTP path (not the snapshot port). */
  readonly directTxHtml: string; // GET /tx/:txid
  readonly queryTxHtml: string; // GET /?q=<txid>
  readonly searchTxHtml: string; // GET /search?q=<txid>
  /** The cursor height committed by the first ingest tick (the durable height the restart must resume at). */
  readonly persistedCursorHeight: number;
  /** The cursor height loaded from the durable store after restart — must equal persistedCursorHeight (not genesis). */
  readonly resumedCursorHeight: number;
  /** A resumed tick that DELIBERATELY re-presents the already-persisted anchor (stale candidate despite the
   *  cursor): accepted must be empty, skipped must include it. Idempotence is asserted SEPARATELY from the cursor
   *  resume so monotonicity and dedupe do not blur (CL pin). */
  readonly resumeAccepted: readonly string[];
  readonly resumeSkipped: readonly string[];
  /** /tx rendered through a memory/unset resolver selector — must NOT carry the durable confirmed facts. */
  readonly memorySelectorTxHtml: string;
}

export async function runRestartSurvivalE2e(): Promise<RestartSurvivalResult> {
  throw new Error("runRestartSurvivalE2e: not implemented (G2 slice 6c RED)");
}
