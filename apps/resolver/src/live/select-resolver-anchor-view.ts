// @ont/resolver live — G2 slice 6a: env-selected, READ-ONLY confirmed-anchor view source for the resolver main.
//
// The deployable resolver currently runs with no anchorTxView, so GET /tx/:txid 404s — it never reads the
// indexer's durable confirmed-anchors.json. This selects a read-only AnchorTxViewSource from the live env,
// mirroring selectIndexerStores exactly: ONT_STORE unset/"memory" -> undefined (no live read; /tx stays 404,
// the hermetic default); "file" requires a nonempty ONT_STORE_DIR and reads confirmed-anchors.json under it,
// mapping the persisted ConfirmedAnchorRecord -> { anchorTx, minedHeight, anchoredRoot, batchSize }; any other
// value (empty / case variant / unknown) fails closed. READ-ONLY: getByTxid only — no put/repair/ingest/mint.
//
// LAYERING (CL, Path B — events 821572ca/3547223e): the durable confirmed-anchor store is shared infrastructure
// in @ont/anchor-store (no resolver->@ont/indexer app->app edge, no codec duplication). This live/ module reads
// it; server.ts / request handling stays store-agnostic and consumes only AnchorTxViewSource. The record->view
// map is the pure confirmedAnchorRecordToTxView in @ont/adapter-resolver. TESTS: ./select-resolver-anchor-view.test.ts.
import { join } from "node:path";
import { createFileConfirmedAnchorStore } from "@ont/anchor-store";
import { confirmedAnchorRecordToTxView } from "@ont/adapter-resolver";
import type { AnchorTxViewSource } from "../server.js";

export function selectResolverAnchorTxView(env: Record<string, string | undefined>): AnchorTxViewSource | undefined {
  const source = env.ONT_STORE ?? "memory"; // exact-match, mirroring the indexer's selectIndexerStores
  if (source === "memory") return undefined; // no live read; /tx stays the hermetic 404 (current default)
  if (source === "file") {
    const dir = env.ONT_STORE_DIR;
    if (!dir) throw new Error("ONT_STORE=file requires ONT_STORE_DIR"); // missing/empty → fail closed, no relative cwd files
    const path = join(dir, "confirmed-anchors.json");
    // Freshness (b): a FRESH store per read, so one long-lived resolver source reflects anchors the indexer
    // persists after an earlier miss — no startup snapshot. Read-only: getByTxid only (no put/repair/mint).
    return async (txid) => {
      const record = await createFileConfirmedAnchorStore(path).getByTxid(txid);
      return record === null ? null : confirmedAnchorRecordToTxView(record);
    };
  }
  throw new Error(`ONT_STORE must be memory|file (got ${JSON.stringify(source)})`);
}
