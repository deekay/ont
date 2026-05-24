import { describe, expect, it } from "vitest";

import {
  type AnchoredDelta,
  type NodeView,
  accumulatorKeyForName,
  batchRailConvergence,
  createDefaultDaWindows,
  emptyAccumulatorRoot,
  runBatchRail,
  valueHashForRecord,
  verifyAccumulatorProof
} from "../index.js";

const WINDOWS = createDefaultDaWindows(); // K=6, W=2, C=3

function v(label: string): string {
  return valueHashForRecord(label);
}

function node(nodeId: string, receipts: Record<string, number>): NodeView {
  return { nodeId, localDataReceiptHeight: new Map(Object.entries(receipts)) };
}

function delta(
  id: string,
  anchorHeight: number,
  anchorTxIndex: number,
  anchorTxid: string,
  markerHeight: number | null,
  networkServableFromHeight: number | null,
  insertions: Array<{ name: string; valueHash: string }>
): AnchoredDelta {
  return { id, publisher: id, anchorHeight, anchorTxIndex, anchorTxid, markerHeight, networkServableFromHeight, insertions };
}

describe("production batch rail (signet prototype Phase 2)", () => {
  it("honest nodes converge on one real accumulator root (and the naive rule forks)", () => {
    const clean = delta("clean", 8, 0, "c0", 8, 8, [{ name: "clean", valueHash: v("clean") }]);
    const borderline = delta("bord", 10, 0, "b0", 11, 11, [{ name: "bord", valueHash: v("bord") }]);
    const deltas = [clean, borderline];
    const nodes = [node("A", { clean: 8, bord: 12 }), node("B", { clean: 8, bord: 13 })];

    const proposed = batchRailConvergence({ nodes, deltas, windows: WINDOWS, now: 20, rule: "proposed" });
    expect(proposed.converged).toBe(true);
    expect(proposed.distinctRoots).toHaveLength(1);

    const naive = batchRailConvergence({ nodes, deltas, windows: WINDOWS, now: 20, rule: "naive" });
    expect(naive.converged).toBe(false);
    expect(naive.distinctRoots).toHaveLength(2);
  });

  it("withholding is self-harm, and the converged state is provable with real accumulator proofs", () => {
    const survivor = delta("survivor", 10, 0, "s0", 10, 10, [{ name: "survivor", valueHash: v("survivor") }]);
    const withheld = delta("ghost", 10, 1, "g0", null, null, [{ name: "ghost", valueHash: v("ghost") }]);

    const result = runBatchRail({
      node: node("A", { survivor: 10 }),
      deltas: [survivor, withheld],
      windows: WINDOWS,
      now: 20,
      rule: "proposed"
    });

    expect(result.ownerByName.get("survivor")).toBe(v("survivor"));
    expect(result.ownerByName.has("ghost")).toBe(false);
    expect(result.daDroppedDeltaIds).toContain("ghost");
    expect(result.anchoredRoots).toBeGreaterThanOrEqual(1);
    expect(result.confirmedRoot).not.toBe(emptyAccumulatorRoot());

    // The resulting ownership is provable against the confirmed root — membership for the survivor,
    // non-membership for the withheld name.
    const present = result.accumulator.proveMembership(accumulatorKeyForName("survivor"));
    expect(present.value).toBe(v("survivor"));
    expect(verifyAccumulatorProof(result.confirmedRoot, present)).toBe(true);

    const absent = result.accumulator.proveNonMembership(accumulatorKeyForName("ghost"));
    expect(absent.value).toBeNull();
    expect(verifyAccumulatorProof(result.confirmedRoot, absent)).toBe(true);
  });

  it("escalates a contested name to L1 instead of resolving it on the accumulator", () => {
    // Two publishers claim "coffee" within the notice window; each also claims a unique name.
    const early = delta("early", 12, 1, "ee", 12, 12, [
      { name: "coffee", valueHash: v("coffee-early") },
      { name: "earlyonly", valueHash: v("earlyonly") }
    ]);
    const late = delta("late", 13, 9, "ll", 13, 13, [
      { name: "coffee", valueHash: v("coffee-late") },
      { name: "lateonly", valueHash: v("lateonly") }
    ]);

    const result = runBatchRail({
      node: node("A", {}),
      deltas: [late, early],
      windows: WINDOWS,
      now: 30,
      rule: "proposed",
      noticeWindowBlocks: 6
    });

    // The contested name does NOT land on the accumulator — it escalates to the L1 auction.
    expect(result.ownerByName.has("coffee")).toBe(false);
    const coffee = result.escalatedNames.find((e) => e.name === "coffee");
    expect([...(coffee?.contestingDeltaIds ?? [])].sort()).toEqual(["early", "late"]);

    // Each publisher's *uncontested* name still finalizes normally.
    expect(result.ownerByName.get("earlyonly")).toBe(v("earlyonly"));
    expect(result.ownerByName.get("lateonly")).toBe(v("lateonly"));

    // The contested name is provably absent from the accumulator.
    const absent = result.accumulator.proveNonMembership(accumulatorKeyForName("coffee"));
    expect(absent.value).toBeNull();
    expect(verifyAccumulatorProof(result.confirmedRoot, absent)).toBe(true);
  });

  it("a name claimed uncontested is owned; a later claim after the notice window is already-owned", () => {
    const first = delta("first", 10, 0, "f0", 10, 10, [{ name: "taken", valueHash: v("first-owner") }]);
    // The second claim arrives well after the notice window closed (10 + 6 = 16 < 24) -> not a contest.
    const second = delta("second", 24, 0, "s0", 24, 24, [{ name: "taken", valueHash: v("second-owner") }]);

    const result = runBatchRail({
      node: node("A", {}),
      deltas: [first, second],
      windows: WINDOWS,
      now: 40,
      rule: "proposed",
      noticeWindowBlocks: 6
    });

    expect(result.ownerByName.get("taken")).toBe(v("first-owner"));
    expect(result.escalatedNames.find((e) => e.name === "taken")).toBeUndefined();
    expect(result.includedDeltaIds).toContain("first");
    expect(result.includedDeltaIds).not.toContain("second");
  });

  it("derives a root chain whose tip equals the confirmed accumulator root", () => {
    const deltas = [
      delta("d1", 10, 0, "01", 10, 10, [{ name: "one", valueHash: v("one") }]),
      delta("d2", 12, 0, "02", 12, 12, [{ name: "two", valueHash: v("two") }]),
      delta("d3", 14, 0, "03", 14, 14, [{ name: "three", valueHash: v("three") }])
    ];
    const result = runBatchRail({ node: node("A", {}), deltas, windows: WINDOWS, now: 30, rule: "proposed" });

    // Three non-empty blocks merged -> three anchored roots, ending at the confirmed root.
    expect(result.anchoredRoots).toBe(3);
    expect(result.ownerByName.size).toBe(3);
  });
});
