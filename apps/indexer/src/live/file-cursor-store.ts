// @ont/indexer live — G2 slice 1: a durable FILE-backed IndexerCursorStore.
//
// The in-memory cursor store (runner.ts) loses the ingest height on restart, so a restarted indexer would
// re-ingest from genesis. This persists the cursor to a JSON file so the daemon resumes from the last
// confirmed height. A MISSING file is the clean-start case (genesis cursor). A present-but-corrupt file
// FAILS CLOSED: a silently-wrong resume height would re-ingest or skip confirmed anchors, so a malformed /
// non-integer / negative height throws rather than guessing. No firewall logic — the cursor is just the
// height the runner advances (the audited core + B4 adapters are untouched).
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { IndexerCursor, IndexerCursorStore } from "../runner.js";

/**
 * A durable cursor store backed by a JSON file at `filePath`.
 * - `load()` — missing file ⇒ genesis cursor `{ height: genesisHeight }`; present ⇒ parsed + validated,
 *   failing closed on malformed JSON / a non-object / a non-integer or negative height.
 * - `save(cursor)` — writes the canonical `{ height }` JSON (creating the parent directory if needed).
 *
 * NOTE: stub bodies — slice 1 is the RED battery. The reason strings here are deliberately generic so the
 * fail-closed tests (which assert specific `/invalid cursor file/` and `/non-negative integer/` reasons)
 * stay red against the stub.
 */
export function createFileIndexerCursorStore(
  filePath: string,
  genesisHeight = 0,
): IndexerCursorStore {
  // Reference the (validated-in-green) inputs so the stub is self-describing; replaced wholesale in green.
  void readFile;
  void writeFile;
  void mkdir;
  void dirname;
  return {
    load: (): Promise<IndexerCursor> =>
      Promise.reject(
        new Error(`file cursor store load not implemented (path=${filePath}, genesis=${genesisHeight})`),
      ),
    save: (): Promise<void> =>
      Promise.reject(new Error(`file cursor store save not implemented (path=${filePath})`)),
  };
}
