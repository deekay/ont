// @ont/indexer live — G2 slice 1: a durable FILE-backed IndexerCursorStore.
//
// The in-memory cursor store (runner.ts) loses the ingest height on restart, so a restarted indexer would
// re-ingest from genesis. This persists the cursor to a JSON file so the daemon resumes from the last
// confirmed height. A MISSING file is the clean-start case (genesis cursor). Any present-but-corrupt or
// otherwise-unreadable file FAILS CLOSED: a silently-wrong resume height would re-ingest or skip confirmed
// anchors, so a malformed / non-integer / negative height — or any non-ENOENT read error — throws rather
// than guessing. No firewall logic — the cursor is just the height the runner advances (the audited core +
// B4 adapters are untouched).
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { IndexerCursor, IndexerCursorStore } from "../runner.js";

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
 *   state), then writes the canonical `{ height }` JSON (creating the parent directory if needed).
 */
export function createFileIndexerCursorStore(
  filePath: string,
  genesisHeight = 0,
): IndexerCursorStore {
  return {
    async load(): Promise<IndexerCursor> {
      let raw: string;
      try {
        raw = await readFile(filePath, "utf8");
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
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, JSON.stringify({ height: cursor.height }), "utf8");
    },
  };
}
