// @ont/indexer — the runnable batch-ingestion daemon (slice 3). A poll loop that, each tick, pulls the next
// confirmed-anchor candidates from an injected block-source (the esplora/Bitcoin I/O seam — mock in tests),
// drives the slice-1 ingestConfirmedAnchors firewall over them, persists accepted facts, and advances a durable
// cursor. The loop is resilient (a tick error is reported, never crashes the daemon) and total. No HTTP. All I/O
// (block-source, cursor store, anchor store) is behind mockable ports — the loop decides no firewall rule.
import {
  type ConfirmAnchor,
  type ConfirmedAnchorStore,
  type IngestAnchorsReport,
} from "./ingest-anchors.js";
import type { BuildConfirmedBatchAnchorInput } from "@ont/adapter-indexer";

/** Where ingestion has reached (a confirmed Bitcoin height); durable across restarts. */
export interface IndexerCursor {
  readonly height: number;
}

/** A pulled batch of confirmed-anchor candidates + the cursor reached after them. */
export interface ConfirmedAnchorBatch {
  readonly candidates: readonly BuildConfirmedBatchAnchorInput[];
  readonly cursor: IndexerCursor;
}

/** The block-source I/O seam (esplora/Bitcoin in production): assemble the next candidates after `cursor`. */
export interface IndexerBlockSource {
  nextConfirmedAnchors(cursor: IndexerCursor): Promise<ConfirmedAnchorBatch>;
}

/** Durable cursor persistence — Promise-shaped (a shell around future DB/filesystem state). */
export interface IndexerCursorStore {
  load(): Promise<IndexerCursor>;
  save(cursor: IndexerCursor): Promise<void>;
}

export interface IndexerRunnerDeps {
  readonly blockSource: IndexerBlockSource;
  readonly cursorStore: IndexerCursorStore;
  readonly anchorStore: ConfirmedAnchorStore;
  /** The slice-1 firewall seam, threaded to ingestConfirmedAnchors; omit ⇒ the real buildConfirmedBatchAnchor. */
  readonly confirm?: ConfirmAnchor;
}

export interface IndexerTickReport {
  readonly cursor: IndexerCursor; // the cursor after this tick
  readonly anchors: IngestAnchorsReport; // the slice-1 ingest result
}

/**
 * One ingest cycle: load the cursor → pull the next confirmed-anchor candidates → drive ingestConfirmedAnchors →
 * persist the advanced cursor → report. The firewall + persistence semantics live in slice 1 / the stores; the
 * tick is pure orchestration.
 */
export async function runIndexerTick(_deps: IndexerRunnerDeps): Promise<IndexerTickReport> {
  throw new Error("not-implemented");
}

export interface RunLoopOptions {
  /** Checked before each tick; the loop exits cleanly when it returns true. */
  shouldStop(): boolean;
  /** Reported after each successful tick. */
  onTick?(report: IndexerTickReport): void;
  /** A tick error is reported here; the loop CONTINUES (resilient — a bad tick never crashes the daemon). */
  onError?(error: unknown): void;
  /** Awaited after each tick (the poll interval in production; omitted in tests for an immediate loop). */
  waitForNext?(): Promise<void>;
}

/**
 * Run ingest ticks until `shouldStop()`. Resilient + total: a thrown tick is routed to `onError` and the loop
 * keeps going; it never throws out. `waitForNext` paces the poll in production.
 */
export async function runIndexerLoop(_deps: IndexerRunnerDeps, _options: RunLoopOptions): Promise<void> {
  throw new Error("not-implemented");
}

/** A block-source that yields no candidates and never advances — lets the daemon start cleanly without real I/O. */
export function createEmptyIndexerBlockSource(): IndexerBlockSource {
  return { nextConfirmedAnchors: (cursor) => Promise.resolve({ candidates: [], cursor }) };
}

/** An in-memory cursor store seeded at `height` (genesis 0 by default) — clean startup; real store injectable. */
export function createInMemoryIndexerCursorStore(height = 0): IndexerCursorStore {
  let current: IndexerCursor = { height };
  return {
    load: () => Promise.resolve(current),
    save: (cursor) => {
      current = cursor;
      return Promise.resolve();
    },
  };
}
