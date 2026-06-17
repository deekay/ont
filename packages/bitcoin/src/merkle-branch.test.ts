// G1 sub-slice 3b red battery — Merkle sibling-path builder (go-live phase).
// The builder is the inverse of the trusted merkleRootFromProof: for every leaf, the
// path it produces must reconstruct ONE consistent root via merkleRootFromProof
// (catches sibling-selection + odd-duplication bugs), with structural pins on the
// 2-leaf case (no hashing needed) and path length. RED until implemented.
import { describe, expect, it } from "vitest";
import { merkleBranchForIndex, merkleRootFromProof } from "./merkle-proof.js";

// Deterministic display-hex txids (content irrelevant to tree structure).
const txid = (n: number): string => n.toString(16).padStart(2, "0").repeat(32);
const txids = (count: number): string[] => Array.from({ length: count }, (_, i) => txid(i + 1));

const rootHex = (leaf: string, branch: readonly string[], pos: number): string | null => {
  const root = merkleRootFromProof(leaf, branch, pos);
  return root === null ? null : Buffer.from(root).toString("hex");
};

describe("merkleBranchForIndex (G1 3b)", () => {
  it("2-leaf tree: each leaf's only sibling is the other leaf (structural)", () => {
    const all = txids(2);
    const a = all[0]!;
    const b = all[1]!;
    expect(merkleBranchForIndex([a, b], 0)).toEqual([b]);
    expect(merkleBranchForIndex([a, b], 1)).toEqual([a]);
  });

  it("single-tx block: empty path that reconstructs to the txid itself", () => {
    const only = txids(1)[0]!;
    const branch = merkleBranchForIndex([only], 0);
    expect(branch).toEqual([]);
    // merkleRootFromProof with an empty path returns the leaf in internal order.
    expect(rootHex(only, branch!, 0)).toBe(Buffer.from(only, "hex").reverse().toString("hex"));
  });

  it("path length is ceil(log2(n)) across sizes (incl. odd)", () => {
    expect(merkleBranchForIndex(txids(2), 0)).toHaveLength(1);
    expect(merkleBranchForIndex(txids(3), 0)).toHaveLength(2);
    expect(merkleBranchForIndex(txids(4), 0)).toHaveLength(2);
    expect(merkleBranchForIndex(txids(5), 0)).toHaveLength(3);
    expect(merkleBranchForIndex(txids(7), 0)).toHaveLength(3);
  });

  it("every leaf's path reconstructs ONE consistent root (round-trip vs merkleRootFromProof)", () => {
    for (const n of [1, 2, 3, 4, 5, 7, 9]) {
      const all = txids(n);
      const roots = all.map((leaf, i) => rootHex(leaf, merkleBranchForIndex(all, i)!, i));
      expect(roots.every((r) => r !== null && r === roots[0])).toBe(true);
    }
  });

  it("fails closed on malformed input (bad hex, wrong length, out-of-range/negative index, empty list)", () => {
    const ok = txids(3);
    expect(merkleBranchForIndex([], 0)).toBeNull();
    expect(merkleBranchForIndex(ok, 3)).toBeNull(); // index === length
    expect(merkleBranchForIndex(ok, -1)).toBeNull();
    expect(merkleBranchForIndex(ok, 1.5)).toBeNull();
    expect(merkleBranchForIndex([txid(1), "zz".repeat(32), txid(3)], 0)).toBeNull(); // bad hex
    expect(merkleBranchForIndex([txid(1), "ab", txid(3)], 0)).toBeNull(); // wrong length
  });
});
