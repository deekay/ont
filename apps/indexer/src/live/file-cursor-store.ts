// @ont/indexer live — G2 slice 1: a durable FILE-backed IndexerCursorStore.
//
// The in-memory cursor store (runner.ts) loses the ingest height on restart, so a restarted indexer would
// re-ingest from genesis. This persists the cursor to a JSON file so the daemon resumes from the last
// confirmed height. A MISSING file is the clean-start case (genesis cursor). Any present-but-corrupt or
// otherwise-unreadable file FAILS CLOSED: a silently-wrong resume height would re-ingest or skip confirmed
// anchors, so a malformed / non-integer / negative height — or any non-ENOENT read error — throws rather
// than guessing. No firewall logic — the cursor is just the height the runner advances (the audited core +
// B4 adapters are untouched).
import { dirname } from "node:path";
import type { IndexerCursor, IndexerCursorStore } from "../runner.js";
import { type FileStoreFs, nodeFileStoreFs } from "@ont/anchor-store";

/** A confirmed Bitcoin height that is a safe cursor value: a non-negative integer (no NaN/float/coercion). */
function isValidHeight(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** True only for a Node ENOENT (missing file) error — the single "clean start, use genesis" case. */
function isFileNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

/**
 * A durable cursor store backed by a JSON file at `filePath`.
 * - `load()` — missing file (ENOENT) ⇒ genesis cursor `{ height: genesisHeight }`; any other read error
 *   fails closed; a present file is parsed + validated, failing closed on malformed JSON / a non-object /
 *   a non-integer or negative height.
 * - `save(cursor)` — validates the height with the SAME rule (a bad runtime cursor must never persist poison
 *   state), then writes the canonical `{ height }` JSON atomically (same-dir temp file + rename) so a failed
 *   write never replaces the last durable cursor.
 */
export function createFileIndexerCursorStore(
  filePath: string,
  genesisHeight = 0,
  fs: FileStoreFs = nodeFileStoreFs,
): IndexerCursorStore {
  return {
    async load(): Promise<IndexerCursor> {
      let raw: string;
      try {
        raw = await fs.readFile(filePath);
      } catch (error) {
        if (isFileNotFound(error)) return { height: genesisHeight }; // clean start
        throw error; // any other read error fails closed — never silently reset the cursor
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error(`invalid cursor file (${filePath}): not valid JSON`);
      }
      if (typeof parsed !== "object" || parsed === null) {
        throw new Error(`invalid cursor file (${filePath}): expected an object with an integer height`);
      }
      const height = (parsed as { height?: unknown }).height;
      if (!isValidHeight(height)) {
        throw new Error(`invalid cursor file (${filePath}): height must be a non-negative integer`);
      }
      return { height };
    },
    async save(cursor: IndexerCursor): Promise<void> {
      if (!isValidHeight(cursor.height)) {
        // Defend against a poison runtime cursor even though the type says number.
        throw new Error(`invalid cursor: height must be a non-negative integer (got ${String(cursor.height)})`);
      }
      // Atomic write: stage a same-dir temp file then rename over the final file, so a failed write never
      // replaces the last durable cursor (durability-before-visibility, matching the confirmed-anchor store).
      // A failed rename may leave the temp behind, but load() reads only `filePath`, so the last durable cursor
      // stays authoritative.
      const tempPath = `${filePath}.tmp`;
      await fs.mkdir(dirname(filePath));
      await fs.writeFile(tempPath, JSON.stringify({ height: cursor.height }));
      await fs.rename(tempPath, filePath);
    },
  };
}
