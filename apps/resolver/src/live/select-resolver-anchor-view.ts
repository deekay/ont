// @ont/resolver live — G2 slice 6a: env-selected, READ-ONLY confirmed-anchor view source for the resolver main.
//
// The deployable resolver currently runs with no anchorTxView, so GET /tx/:txid 404s — it never reads the
// indexer's durable confirmed-anchors.json. This selects a read-only AnchorTxViewSource from the live env,
// mirroring selectIndexerStores exactly: ONT_STORE unset/"memory" -> undefined (no live read; /tx stays 404,
// the hermetic default); "file" requires a nonempty ONT_STORE_DIR and reads confirmed-anchors.json under it,
// mapping the persisted ConfirmedAnchorRecord -> { anchorTx, minedHeight, anchoredRoot, batchSize }; any other
// value (empty / case variant / unknown) fails closed. READ-ONLY: getByTxid only — no put/repair/ingest/mint.
//
// LAYERING (CL, event 718cea68): the @ont/indexer dependency (the durable store + its codec) is CONFINED to
// this live/ module so the codec is never duplicated; server.ts / request handling stays indexer-free and
// consumes only AnchorTxViewSource. TESTS: ./select-resolver-anchor-view.test.ts.
import type { AnchorTxViewSource } from "../server.js";

export function selectResolverAnchorTxView(env: Record<string, string | undefined>): AnchorTxViewSource | undefined {
  // RED stub — slice 6a green: unset/"memory" -> undefined; "file" + nonempty ONT_STORE_DIR -> a read-only
  // source over createFileConfirmedAnchorStore(join(dir,"confirmed-anchors.json")).getByTxid mapped to the view;
  // missing/empty dir or any other ONT_STORE value -> throw (fail closed).
  void env;
  throw new Error("selectResolverAnchorTxView: not implemented (G2 slice 6a RED)");
}
