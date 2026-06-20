// @ont/resolver live — LE-RESOLVE: env-selected, READ-ONLY enforced name-state view source for the resolver main.
//
// The deployable resolver runs with no nameStateView, so GET /names/:name/state 404s — it never reads the
// indexer's durable name-state.json. This selects a read-only NameStateViewSource from the live env, mirroring
// selectResolverAnchorTxView (and selectIndexerStores) EXACTLY: ONT_STORE unset/"memory" -> undefined (no live
// read; the route stays the hermetic 404); "file" requires a nonempty ONT_STORE_DIR and reads name-state.json
// under it, returning the persisted NameStateRecord (or null); any other value (empty / case variant / unknown)
// fails closed. READ-ONLY: getByName only — no put/repair/ingest/mint.
//
// LAYERING (same discipline as the anchor view, CL Path B): the durable name-state store is shared infrastructure
// in @ont/name-state-store (no resolver->@ont/indexer app->app edge, no codec duplication). This live/ module
// reads it; server.ts / request handling stays store-agnostic and consumes only NameStateViewSource. The read
// firewall that re-verifies the record before serving is the pure projectServedNameState in @ont/adapter-resolver.
// TESTS: ./select-resolver-name-state-view.test.ts.
import { join } from "node:path";
import { createFileNameStateStore } from "@ont/name-state-store";
import type { NameStateViewSource } from "../server.js";

export function selectResolverNameStateView(env: Record<string, string | undefined>): NameStateViewSource | undefined {
  const source = env.ONT_STORE ?? "memory"; // exact-match, mirroring selectResolverAnchorTxView / selectIndexerStores
  if (source === "memory") return undefined; // no live read; /names/:name/state stays the hermetic 404 (the default)
  if (source === "file") {
    const dir = env.ONT_STORE_DIR;
    if (!dir) throw new Error("ONT_STORE=file requires ONT_STORE_DIR"); // missing/empty → fail closed, no relative cwd files
    const path = join(dir, "name-state.json");
    // Freshness (b): a FRESH store per read, so one long-lived resolver source reflects name-state the indexer
    // persists after an earlier miss — no startup snapshot. Read-only: getByName only (no put/repair/mint).
    return (name) => createFileNameStateStore(path).getByName(name);
  }
  throw new Error(`ONT_STORE must be memory|file (got ${JSON.stringify(source)})`);
}
