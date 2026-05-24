import { describe, expect, it } from "vitest";

import {
  ACCUMULATOR_DEPTH,
  Accumulator,
  accumulatorKeyForName,
  accumulatorProofSizeBytes,
  createEmptyTree,
  deserializeAccumulatorProof,
  insert as smtInsert,
  serializeAccumulatorProof,
  treeRoot,
  verifyAccumulatorProof
} from "./index.js";

function leafKey(i: number): string {
  return accumulatorKeyForName(`leaf${i}`);
}
function leafValue(i: number): string {
  return accumulatorKeyForName(`val${i}`);
}

function buildAccumulator(n: number): Accumulator {
  const acc = new Accumulator();
  for (let i = 0; i < n; i += 1) {
    acc.insert(leafKey(i), leafValue(i));
  }
  return acc;
}

describe("production name accumulator (signet prototype C1)", () => {
  it("matches the reference sparse-Merkle tree root for the same leaf set", () => {
    // Correctness keystone: the compact build must produce the SAME root as the naive reference tree.
    const acc = new Accumulator();
    let tree = createEmptyTree();
    for (let i = 0; i < 64; i += 1) {
      acc.insert(leafKey(i), leafValue(i));
      tree = smtInsert(tree, leafKey(i), leafValue(i));
    }
    expect(acc.root()).toBe(treeRoot(tree));
  });

  it("the empty accumulator has the canonical empty root, stable across instances", () => {
    expect(new Accumulator().root()).toBe(new Accumulator().root());
    expect(new Accumulator().root()).toBe(treeRoot(createEmptyTree()));
  });

  it("produces verifiable membership and non-membership proofs", () => {
    const acc = buildAccumulator(200);
    const root = acc.root();

    const member = acc.proveMembership(leafKey(42));
    expect(member.value).toBe(leafValue(42));
    expect(verifyAccumulatorProof(root, member)).toBe(true);

    const absent = acc.proveNonMembership(accumulatorKeyForName("neverclaimed"));
    expect(absent.value).toBeNull();
    expect(verifyAccumulatorProof(root, absent)).toBe(true);
  });

  it("rejects tampered proofs", () => {
    const acc = buildAccumulator(200);
    const root = acc.root();
    const proof = acc.proveMembership(leafKey(7));

    // Wrong value.
    expect(verifyAccumulatorProof(root, { ...proof, value: leafValue(8) })).toBe(false);
    // Wrong root.
    expect(verifyAccumulatorProof("00".repeat(32), proof)).toBe(false);
    // Flipped sibling (if any).
    if (proof.siblings.length > 0) {
      const flipped = proof.siblings.map((s, i) => (i === 0 ? { ...s, hash: leafValue(999) } : s));
      expect(verifyAccumulatorProof(root, { ...proof, siblings: flipped })).toBe(false);
    }
  });

  it("guards proof preconditions", () => {
    const acc = buildAccumulator(10);
    expect(() => acc.proveMembership(accumulatorKeyForName("absent"))).toThrow(/not present/);
    expect(() => acc.proveNonMembership(leafKey(3))).toThrow(/present/);
  });

  it("serializes and deserializes proofs round-trip, and the bytes still verify", () => {
    const acc = buildAccumulator(500);
    const root = acc.root();

    for (const proof of [acc.proveMembership(leafKey(123)), acc.proveNonMembership(accumulatorKeyForName("ghost"))]) {
      const bytes = serializeAccumulatorProof(proof);
      const restored = deserializeAccumulatorProof(bytes);
      expect(restored).toEqual(proof);
      expect(verifyAccumulatorProof(root, restored)).toBe(true);
      expect(bytes.length).toBe(accumulatorProofSizeBytes(proof));
    }
  });

  it(
    "measures proof size: compact, ~log2(N) siblings, far below the 256-level depth",
    () => {
      const populations = [100, 1000, 5000, 10000];
      const rows: Record<string, number>[] = [];

      for (const n of populations) {
        const acc = buildAccumulator(n);
        const root = acc.root();
        const sampleIndices = [0, Math.floor(n / 2), n - 1];
        const memberProofs = sampleIndices.map((i) => acc.proveMembership(leafKey(i)));
        const absentProofs = [0, 1, 2].map((i) => acc.proveNonMembership(accumulatorKeyForName(`absent${i}`)));

        for (const p of [...memberProofs, ...absentProofs]) {
          expect(verifyAccumulatorProof(root, p)).toBe(true);
        }

        const sibCounts = [...memberProofs, ...absentProofs].map((p) => p.siblings.length);
        const maxSiblings = Math.max(...sibCounts);
        const memberBytes = Math.max(...memberProofs.map(accumulatorProofSizeBytes));
        const absentBytes = Math.max(...absentProofs.map(accumulatorProofSizeBytes));

        // Compactness: far below the naive 256 siblings, scaling ~log2(N).
        expect(maxSiblings).toBeLessThan(64);
        expect(maxSiblings).toBeLessThan(ACCUMULATOR_DEPTH);

        rows.push({
          names: n,
          log2N: Math.round(Math.log2(n)),
          maxSiblings,
          memberProofBytes: memberBytes,
          nonMemberProofBytes: absentBytes
        });
      }

      // Proof size grows with log2(N), not with N — the property T3 needs.
      const first = rows[0]?.maxSiblings ?? 0;
      const last = rows[rows.length - 1]?.maxSiblings ?? 0;
      expect(last).toBeGreaterThanOrEqual(first);

      // Projection to billions: ~log2(10^9) ≈ 30 siblings -> ~30*34 + ~67 ≈ 1.1 KB.
      const projectedSiblings = 30;
      const projectedBytes = projectedSiblings * 34 + 67;

      // eslint-disable-next-line no-console
      console.log(
        "\nAccumulator proof-size measurement (R11 / T3):\n" +
          rows
            .map(
              (r) =>
                `  N=${String(r.names).padStart(6)}  ~log2=${r.log2N}  maxSiblings=${r.maxSiblings}` +
                `  member=${r.memberProofBytes}B  nonMember=${r.nonMemberProofBytes}B`
            )
            .join("\n") +
          `\n  projection @ 1e9 names: ~${projectedSiblings} siblings -> ~${projectedBytes}B (~1.1 KB)\n`
      );
    },
    60_000
  );
});
