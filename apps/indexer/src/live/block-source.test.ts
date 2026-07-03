// G1 slice 3 red battery — live indexer block source (go-live phase).
// Pins the cursor semantics CL flagged: poll starts at cursor.height + 1, runs to
// the node tip in order; an empty/regressed tip leaves the durable cursor untouched
// and does not extract; the durable cursor (the arg) drives every call, so stale
// internal state can never override it. RED until createLiveIndexerBlockSource is
// implemented. See docs/core/GO_LIVE_PLAN.md (G1).
import { describe, expect, it, vi } from "vitest";
import type { BuildConfirmedBatchAnchorInput } from "@ont/adapter-indexer";
import { createLiveIndexerBlockSource, type LiveBlockSourceDeps } from "./block-source.js";

// Minimal candidate tagged by minedHeight so tests can assert range + order.
const candidateAt = (height: number): BuildConfirmedBatchAnchorInput => ({
  anchorTx: { version: 2, inputs: [], outputs: [], locktime: 0 },
  prevoutTxs: [],
  blockHeaderHex: "00".repeat(80),
  minedHeight: height,
  merkle: [],
  pos: 0,
});

const heights = (cands: readonly BuildConfirmedBatchAnchorInput[]): number[] =>
  cands.map((c) => c.minedHeight);

describe("live indexer block source (G1)", () => {
  it("polls from cursor.height + 1 up to the node tip, in order, and advances the cursor to tip", async () => {
    const anchorsAtHeight = vi.fn<LiveBlockSourceDeps["anchorsAtHeight"]>(async (h) => [candidateAt(h)]);
    const deps: LiveBlockSourceDeps = { getTipHeight: async () => 8, anchorsAtHeight };
    const source = createLiveIndexerBlockSource(deps);

    const batch = await source.nextConfirmedAnchors({ height: 5 });

    expect(anchorsAtHeight.mock.calls.map((c) => c[0])).toEqual([6, 7, 8]);
    expect(heights(batch.candidates)).toEqual([6, 7, 8]);
    expect(batch.cursor).toEqual({ height: 8 });
  });

  it("collects one header record per advanced height when the header seam is configured", async () => {
    const anchorsAtHeight = vi.fn<LiveBlockSourceDeps["anchorsAtHeight"]>(async () => []);
    const headerAtHeight = vi.fn<NonNullable<LiveBlockSourceDeps["headerAtHeight"]>>(async (h) =>
      h.toString(16).padStart(2, "0").repeat(80),
    );
    const source = createLiveIndexerBlockSource({ getTipHeight: async () => 7, headerAtHeight, anchorsAtHeight });

    const batch = await source.nextConfirmedAnchors({ height: 5 });

    expect(headerAtHeight.mock.calls.map((c) => c[0])).toEqual([6, 7]);
    expect(batch.headers).toEqual([
      { height: 6, headerHex: "06".repeat(80) },
      { height: 7, headerHex: "07".repeat(80) },
    ]);
  });

  it("returns the cursor unchanged and does not extract when the tip is not ahead (empty poll)", async () => {
    const anchorsAtHeight = vi.fn<LiveBlockSourceDeps["anchorsAtHeight"]>(async (h) => [candidateAt(h)]);
    const source = createLiveIndexerBlockSource({ getTipHeight: async () => 8, anchorsAtHeight });

    const batch = await source.nextConfirmedAnchors({ height: 8 });

    expect(batch).toEqual({ candidates: [], cursor: { height: 8 }, headers: [] });
    expect(anchorsAtHeight).not.toHaveBeenCalled();
  });

  it("never polls backwards — a regressed tip leaves the durable cursor untouched", async () => {
    const anchorsAtHeight = vi.fn<LiveBlockSourceDeps["anchorsAtHeight"]>(async (h) => [candidateAt(h)]);
    const source = createLiveIndexerBlockSource({ getTipHeight: async () => 6, anchorsAtHeight });

    const batch = await source.nextConfirmedAnchors({ height: 8 });

    expect(batch).toEqual({ candidates: [], cursor: { height: 8 }, headers: [] });
    expect(anchorsAtHeight).not.toHaveBeenCalled();
  });

  it("is durable-cursor-driven — the same cursor re-polls the same range (no internal advance)", async () => {
    const anchorsAtHeight = vi.fn<LiveBlockSourceDeps["anchorsAtHeight"]>(async (h) => [candidateAt(h)]);
    const source = createLiveIndexerBlockSource({ getTipHeight: async () => 6, anchorsAtHeight });

    const first = await source.nextConfirmedAnchors({ height: 5 });
    const second = await source.nextConfirmedAnchors({ height: 5 });

    expect(heights(first.candidates)).toEqual([6]);
    expect(heights(second.candidates)).toEqual([6]);
    expect(anchorsAtHeight.mock.calls.map((c) => c[0])).toEqual([6, 6]);
  });

  it("includes every anchor at a height, in order, across the polled range", async () => {
    const anchorsAtHeight = vi.fn<LiveBlockSourceDeps["anchorsAtHeight"]>(async (h) =>
      h === 7 ? [candidateAt(7), candidateAt(7)] : [candidateAt(h)],
    );
    const source = createLiveIndexerBlockSource({ getTipHeight: async () => 7, anchorsAtHeight });

    const batch = await source.nextConfirmedAnchors({ height: 5 });

    expect(heights(batch.candidates)).toEqual([6, 7, 7]);
    expect(batch.cursor).toEqual({ height: 7 });
  });
});
