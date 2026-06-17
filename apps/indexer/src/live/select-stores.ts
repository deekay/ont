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
import type { ConfirmedAnchorStore } from "../ingest-anchors.js";
import { createFileIndexerCursorStore } from "./file-cursor-store.js";
import { createFileConfirmedAnchorStore } from "./file-confirmed-anchor-store.js";

export interface IndexerStores {
  readonly cursorStore: IndexerCursorStore;
  readonly anchorStore: ConfirmedAnchorStore;
}

export function selectIndexerStores(env: Record<string, string | undefined>): IndexerStores {
  void env;
  void join;
  void createInMemoryIndexerCursorStore;
  void createInMemoryConfirmedAnchorStore;
  void createFileIndexerCursorStore;
  void createFileConfirmedAnchorStore;
  throw new Error("selectIndexerStores not implemented");
}
