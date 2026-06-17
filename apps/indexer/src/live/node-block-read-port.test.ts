// G1 sub-slice 3b-4c red battery — requireSingleBlockAtHeight (go-live phase).
// The pure guard the live port leans on: getBlock must yield exactly one block at the
// requested height or fail closed (no Merkle ordering is sound otherwise). Pins all three
// bad cases (empty, multiple, height-mismatch) plus the happy path. Negatives assert the
// specific reason so the not-implemented stub cannot spuriously pass. RED until green.
import { describe, expect, it } from "vitest";
import type { BitcoinBlock } from "@ont/bitcoin";
import { requireSingleBlockAtHeight } from "./node-block-read-port.js";

const blockAt = (height: number): BitcoinBlock => ({ hash: `h${height}`, height, transactions: [] });

describe("requireSingleBlockAtHeight (G1 3b-4c)", () => {
  it("returns the single block when exactly one matches the height", () => {
    const b = blockAt(808);
    expect(requireSingleBlockAtHeight([b], 808)).toBe(b);
  });

  it("rejects an empty result", () => {
    expect(() => requireSingleBlockAtHeight([], 808)).toThrow(/one block|exactly one|got 0/);
  });

  it("rejects multiple blocks", () => {
    expect(() => requireSingleBlockAtHeight([blockAt(808), blockAt(809)], 808)).toThrow(/one block|exactly one|got 2/);
  });

  it("rejects a single block whose height does not match", () => {
    expect(() => requireSingleBlockAtHeight([blockAt(807)], 808)).toThrow(/height|mismatch/);
  });
});
