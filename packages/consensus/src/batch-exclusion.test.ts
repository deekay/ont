import { describe, expect, it } from "vitest";

import { deriveBatchedInsertions, type BatchExclusionInput } from "./batch-exclusion.js";

const batch = (batchId: string, names: string[]) => ({ batchId, leaves: names.map((name) => ({ name })) });

// A (alice, shared), X (bob, shared); carol already final.
const base: BatchExclusionInput = {
  batches: [batch("A", ["alice", "shared"]), batch("X", ["bob", "shared"])],
  excludedBatchIds: [],
  priorFinalNames: ["carol"],
};
const withExcluded = (excludedBatchIds: string[]): BatchExclusionInput => ({ ...base, excludedBatchIds });
const onlyA: BatchExclusionInput = { ...base, batches: [batch("A", ["alice", "shared"])] };

describe("deriveBatchedInsertions — exclusion locality / state-equivalence (B10/D7)", () => {
  it("derives per-name insertion provenance from non-excluded batches (sorted, deterministic)", () => {
    expect(deriveBatchedInsertions(base)).toEqual({
      derived: true,
      insertions: [
        { name: "alice", contributingBatchIds: ["A"] },
        { name: "bob", contributingBatchIds: ["X"] },
        { name: "shared", contributingBatchIds: ["A", "X"] },
      ],
      preservedFinalNames: ["carol"],
      reason: "batch-exclusion-derived",
    });
  });

  it("D7: excluding X yields exactly the as-if-X-never-anchored state (state-equivalence)", () => {
    expect(deriveBatchedInsertions(withExcluded(["X"]))).toEqual(deriveBatchedInsertions(onlyA));
  });

  it("B10: excluding X removes only X's leaves; every name not in X is byte-identical", () => {
    const all = deriveBatchedInsertions(withExcluded([]));
    const exX = deriveBatchedInsertions(withExcluded(["X"]));
    const byName = (r: typeof all, n: string) => r.insertions.find((x) => x.name === n);
    // alice (not in X) is byte-identical across the two derivations
    expect(byName(exX, "alice")).toEqual(byName(all, "alice"));
    // shared (in both) loses only X's contribution
    expect(byName(all, "shared")).toEqual({ name: "shared", contributingBatchIds: ["A", "X"] });
    expect(byName(exX, "shared")).toEqual({ name: "shared", contributingBatchIds: ["A"] });
    // bob (only in X) vanishes entirely
    expect(byName(exX, "bob")).toBeUndefined();
  });

  it("preserves an already-final name and never re-inserts it (no unseat; insert-only no-op)", () => {
    // a batch leaf targeting the already-final 'carol' is an insert-only no-op, not a takeover.
    const claimsFinal: BatchExclusionInput = {
      batches: [batch("A", ["alice", "carol"]), batch("X", ["carol"])],
      excludedBatchIds: [],
      priorFinalNames: ["carol"],
    };
    const r = deriveBatchedInsertions(claimsFinal);
    expect(r.insertions.find((x) => x.name === "carol")).toBeUndefined(); // never a fresh insertion
    expect(r.preservedFinalNames).toEqual(["carol"]);
    // and excluding X does not change carol's preserved status (locality holds for final names too)
    expect(deriveBatchedInsertions({ ...claimsFinal, excludedBatchIds: ["X"] }).preservedFinalNames).toEqual(["carol"]);
  });
});

describe("deriveBatchedInsertions — determinism guardrails / fail closed", () => {
  it("fails closed on a duplicate batch id (would otherwise be order-dependent)", () => {
    expect(
      deriveBatchedInsertions({ batches: [batch("A", ["x"]), batch("A", ["y"])], excludedBatchIds: [], priorFinalNames: [] })
    ).toMatchObject({ derived: false, reason: "batch-exclusion-duplicate-batch-id" });
  });

  it("fails closed on a duplicate or unknown excluded id", () => {
    expect(deriveBatchedInsertions(withExcluded(["A", "A"]))).toMatchObject({
      derived: false,
      reason: "batch-exclusion-duplicate-excluded-id",
    });
    expect(deriveBatchedInsertions(withExcluded(["Z"]))).toMatchObject({
      derived: false,
      reason: "batch-exclusion-unknown-excluded-id",
    });
  });

  it("fails closed on malformed / extra-field input without throwing", () => {
    expect(deriveBatchedInsertions(null as never).derived).toBe(false);
    expect(deriveBatchedInsertions({ ...base, source: "catalog" } as never).reason).toBe("batch-exclusion-input-malformed");
    expect(
      deriveBatchedInsertions({ batches: [{ batchId: "A", leaves: [{ name: "x", extra: 1 }] } as never], excludedBatchIds: [], priorFinalNames: [] }).reason
    ).toBe("batch-exclusion-leaf-malformed");
    expect(
      deriveBatchedInsertions({ batches: [{ batchId: "", leaves: [] }], excludedBatchIds: [], priorFinalNames: [] }).reason
    ).toBe("batch-exclusion-batch-malformed");
  });

  it("is deterministic on identical inputs", () => {
    expect(deriveBatchedInsertions(base)).toEqual(deriveBatchedInsertions(base));
  });
});
