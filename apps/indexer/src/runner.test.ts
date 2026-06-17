import { describe, expect, it } from "vitest";
import type { LegacyTransaction } from "@ont/bitcoin";
import type { BuildConfirmedBatchAnchorInput, ConfirmedBatchAnchorResult } from "@ont/adapter-indexer";
import type { ConfirmAnchor, ConfirmedAnchorRecord, ConfirmedAnchorStore } from "./ingest-anchors.js";
import {
  runIndexerTick,
  runIndexerLoop,
  createEmptyIndexerBlockSource,
  createInMemoryIndexerCursorStore,
  type IndexerBlockSource,
  type IndexerCursor,
  type IndexerRunnerDeps,
  type IndexerTickReport,
} from "./runner.js";

// @ont/indexer slice-3 red battery — the runnable batch-ingestion daemon. runIndexerTick is one ingest cycle
// (pull → drive slice-1 ingest → advance cursor); runIndexerLoop repeats until shouldStop, resilient + paced.
// Hermetic: mock block-source/cursor/anchor stores + an injected fake confirm. RED until the runner lands.

const minimalTx: LegacyTransaction = { version: 2, inputs: [], outputs: [], locktime: 0 };
const ROOT = "11".repeat(32);

const okResult: ConfirmedBatchAnchorResult = {
  ok: true,
  confirmedAnchor: { anchorTxid: "ab".repeat(32), minedHeight: 100, anchoredRoot: ROOT, batchSize: 1 },
  feeTxParts: { anchorTx: minimalTx, prevoutTxs: [] },
};
const okConfirm: ConfirmAnchor = () => okResult;
const candidate = {} as unknown as BuildConfirmedBatchAnchorInput;

function memAnchorStore() {
  const records = new Map<string, ConfirmedAnchorRecord>();
  const store: ConfirmedAnchorStore = {
    has: (root) => Promise.resolve(records.has(root)),
    put: (record) => {
      records.set(record.confirmedAnchor.anchoredRoot, record);
      return Promise.resolve();
    },
  };
  return { store, records };
}

/** A block-source that yields `candidates` once and advances the cursor to `toHeight`. */
function oneShotBlockSource(candidates: readonly BuildConfirmedBatchAnchorInput[], toHeight: number): IndexerBlockSource {
  return { nextConfirmedAnchors: () => Promise.resolve({ candidates, cursor: { height: toHeight } }) };
}

describe("runIndexerTick", () => {
  it("pulls candidates, drives ingest, persists accepted facts, and advances + saves the cursor", async () => {
    const { store, records } = memAnchorStore();
    const cursorStore = createInMemoryIndexerCursorStore(0);
    const deps: IndexerRunnerDeps = {
      blockSource: oneShotBlockSource([candidate], 7),
      cursorStore,
      anchorStore: store,
      confirm: okConfirm,
    };
    const report = await runIndexerTick(deps);
    expect(report.anchors.accepted).toEqual([ROOT]);
    expect(records.has(ROOT)).toBe(true);
    expect(report.cursor).toEqual({ height: 7 });
    expect(await cursorStore.load()).toEqual({ height: 7 }); // persisted
  });

  it("is a clean no-op against an empty block-source (no candidates, cursor unchanged)", async () => {
    const { store, records } = memAnchorStore();
    const cursorStore = createInMemoryIndexerCursorStore(3);
    const report = await runIndexerTick({
      blockSource: createEmptyIndexerBlockSource(),
      cursorStore,
      anchorStore: store,
      confirm: okConfirm,
    });
    expect(report.anchors.accepted).toEqual([]);
    expect(records.size).toBe(0);
    expect(report.cursor).toEqual({ height: 3 });
  });
});

describe("runIndexerLoop", () => {
  function loopDeps(): IndexerRunnerDeps {
    const { store } = memAnchorStore();
    return {
      blockSource: createEmptyIndexerBlockSource(),
      cursorStore: createInMemoryIndexerCursorStore(0),
      anchorStore: store,
      confirm: okConfirm,
    };
  }

  it("runs ticks until shouldStop and reports each tick", async () => {
    const ticks: IndexerTickReport[] = [];
    let n = 0;
    await runIndexerLoop(loopDeps(), {
      shouldStop: () => n >= 3,
      onTick: (r) => {
        n++;
        ticks.push(r);
      },
    });
    expect(ticks.length).toBe(3);
  });

  it("is resilient — a throwing tick is routed to onError and the loop continues, never throwing out", async () => {
    const errors: unknown[] = [];
    let calls = 0;
    const throwingSource: IndexerBlockSource = {
      nextConfirmedAnchors: () => {
        calls++;
        throw new Error("source boom");
      },
    };
    let stop = 0;
    await expect(
      runIndexerLoop(
        { ...loopDeps(), blockSource: throwingSource },
        {
          shouldStop: () => stop++ >= 3, // allow a few iterations
          onError: (e) => errors.push(e),
        }
      )
    ).resolves.toBeUndefined();
    expect(errors.length).toBeGreaterThan(0);
    expect(calls).toBeGreaterThan(0);
  });

  it("awaits waitForNext only BETWEEN ticks — no final poll wait (fast shutdown)", async () => {
    let ticks = 0;
    let waits = 0;
    await runIndexerLoop(loopDeps(), {
      shouldStop: () => ticks >= 2,
      onTick: () => {
        ticks++;
      },
      waitForNext: () => {
        waits++;
        return Promise.resolve();
      },
    });
    // 2 ticks ⇒ exactly 1 wait: stop becomes true after tick 2, so the loop exits without a final poll sleep.
    expect(ticks).toBe(2);
    expect(waits).toBe(1);
  });
});
