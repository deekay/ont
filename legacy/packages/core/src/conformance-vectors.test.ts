// The ENGINE side of the shared conformance vectors. Every independent ONT
// crypto implementation (this engine, apps/web's browser verifier, the claim
// site, the mobile ports, the Rust crate) consumes the SAME fixture
// (packages/protocol/testdata/conformance-vectors.json), so a protocol tweak
// that lands in one implementation but not another fails a test somewhere
// instead of drifting silently.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { accumulatorKeyForName, verifyAccumulatorProof } from "./index.js";

interface VectorProof {
  readonly keyHex: string;
  readonly value: string | null;
  readonly siblings: readonly { readonly level: number; readonly hash: string }[];
}
interface Vectors {
  readonly accumulator: {
    readonly root: string;
    readonly membership: readonly { readonly name: string; readonly leafKey: string; readonly proof: VectorProof; readonly expectValid: boolean }[];
    readonly tampered: readonly { readonly name: string; readonly proof: VectorProof; readonly expectValid: boolean; readonly note?: string }[];
  };
}

async function loadVectors(): Promise<Vectors> {
  const path = join(__dirname, "..", "..", "protocol", "testdata", "conformance-vectors.json");
  return JSON.parse(await readFile(path, "utf8")) as Vectors;
}

describe("shared conformance vectors (engine)", () => {
  it("accepts every membership vector and binds each leaf key to its name", async () => {
    const { accumulator } = await loadVectors();
    for (const vector of accumulator.membership) {
      expect(accumulatorKeyForName(vector.name)).toBe(vector.leafKey);
      expect(verifyAccumulatorProof(accumulator.root, vector.proof)).toBe(vector.expectValid);
    }
  });

  it("rejects every tampered vector", async () => {
    const { accumulator } = await loadVectors();
    expect(accumulator.tampered.length).toBeGreaterThan(0);
    for (const vector of accumulator.tampered) {
      expect(verifyAccumulatorProof(accumulator.root, vector.proof), vector.note).toBe(false);
    }
  });
});
