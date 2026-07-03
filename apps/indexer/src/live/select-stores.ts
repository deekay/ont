// @ont/indexer live — G2 slice 3: env-selected durable store wiring.
//
// Mirrors selectIndexerBlockSource: main.ts picks its cursor + confirmed-anchor stores from the live env.
// ONT_STORE=memory (default/unset) stays the hermetic in-memory pair and NEVER consults ONT_STORE_DIR — a stale
// file-mode env can't perturb a memory-mode run. ONT_STORE=file requires ONT_STORE_DIR and persists both stores
// under it. Any other value (incl. empty string / case variants) fails closed. The selector only chooses
// construction; the ingest loop + firewall are unchanged.
import { join } from "node:path";
import {
  createInMemoryIndexerCursorStore,
  createInMemoryConfirmedAnchorStore,
  type IndexerCursorStore,
} from "../runner.js";
import { createFileConfirmedAnchorStore, type ConfirmedAnchorStore } from "@ont/anchor-store";
import {
  createFileHeaderRangeStore,
  createInMemoryHeaderRangeStore,
  type HeaderRangeStore,
} from "@ont/header-store";
import { createFileIndexerCursorStore } from "./file-cursor-store.js";

export interface IndexerStores {
  readonly cursorStore: IndexerCursorStore;
  readonly anchorStore: ConfirmedAnchorStore;
  readonly headerStore: HeaderRangeStore;
}

export function selectIndexerStores(env: Record<string, string | undefined>): IndexerStores {
  // Exact match only: undefined defaults to memory; "" / case variants / anything else fail closed.
  const source = env.ONT_STORE ?? "memory";
  if (source === "memory") {
    // Memory mode NEVER consults ONT_STORE_DIR — a stale file-mode env can't perturb a hermetic run.
    return {
      cursorStore: createInMemoryIndexerCursorStore(0),
      anchorStore: createInMemoryConfirmedAnchorStore(),
      headerStore: createInMemoryHeaderRangeStore(),
    };
  }
  if (source === "file") {
    const dir = env.ONT_STORE_DIR;
    // Missing OR empty dir fails closed — never let join("", ...) create relative files under the process cwd.
    if (!dir) throw new Error("ONT_STORE=file requires ONT_STORE_DIR");
    return {
      cursorStore: createFileIndexerCursorStore(join(dir, "cursor.json")),
      anchorStore: createFileConfirmedAnchorStore(join(dir, "confirmed-anchors.json")),
      headerStore: createFileHeaderRangeStore(join(dir, "headers.json")),
    };
  }
  throw new Error(`ONT_STORE must be memory|file (got ${JSON.stringify(source)})`);
}
