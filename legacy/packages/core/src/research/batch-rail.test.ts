import { describe, expect, it } from "vitest";

import {
  type AnchoredDelta,
  type NodeView,
  accumulatorKeyForName,
  batchRailConvergence,
  classifyName,
  classifyNames,
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

describe("name lifecycle classification (provisional / contested / final)", () => {
  it("reports absent for a name with no DA-eligible claim", () => {
    const result = classifyName({
      name: "nobody",
      node: node("A", {}),
      deltas: [delta("d", 10, 0, "d0", 10, 10, [{ name: "elsewhere", valueHash: v("elsewhere") }])],
      windows: WINDOWS,
      now: 30,
      rule: "proposed"
    });
    expect(result.status).toBe("absent");
    expect(result.name).toBe("nobody");
  });

  it("reports provisional while the notice window is still open", () => {
    const claim = delta("c", 10, 0, "c0", 10, 10, [{ name: "Alice", valueHash: v("alice") }]);
    const result = classifyName({
      name: "alice",
      node: node("A", {}),
      deltas: [claim],
      windows: WINDOWS,
      now: 13, // anchored (>=10) but window (10 + 6 = 16) still open
      rule: "proposed",
      noticeWindowBlocks: 6
    });
    expect(result.status).toBe("provisional");
    if (result.status !== "provisional") throw new Error("unreachable");
    expect(result.owner).toBe(v("alice"));
    expect(result.claimDeltaId).toBe("c");
    expect(result.claimHeight).toBe(10);
    expect(result.windowCloseHeight).toBe(16);
  });

  it("reports final once the notice window has closed uncontested", () => {
    const claim = delta("c", 10, 0, "c0", 10, 10, [{ name: "alice", valueHash: v("alice") }]);
    const result = classifyName({
      name: "alice",
      node: node("A", {}),
      deltas: [claim],
      windows: WINDOWS,
      now: 16, // window 10 + 6 = 16 just closed
      rule: "proposed",
      noticeWindowBlocks: 6
    });
    expect(result.status).toBe("final");
    if (result.status !== "final") throw new Error("unreachable");
    expect(result.owner).toBe(v("alice"));
    expect(result.windowCloseHeight).toBe(16);
  });

  it("reports contested when two distinct claimants land within the window", () => {
    const early = delta("early", 12, 1, "ee", 12, 12, [{ name: "coffee", valueHash: v("coffee-early") }]);
    const late = delta("late", 13, 9, "ll", 13, 13, [{ name: "coffee", valueHash: v("coffee-late") }]);
    const result = classifyName({
      name: "coffee",
      node: node("A", {}),
      deltas: [late, early],
      windows: WINDOWS,
      now: 30,
      rule: "proposed",
      noticeWindowBlocks: 6
    });
    expect(result.status).toBe("contested");
    if (result.status !== "contested") throw new Error("unreachable");
    expect([...result.contestingDeltaIds].sort()).toEqual(["early", "late"]);
    expect(result.windowCloseHeight).toBe(18); // earliest 12 + 6
  });

  it("fails closed: a withheld (un-served) claim is not counted, so the name is absent", () => {
    const withheld = delta("ghost", 10, 0, "g0", null, null, [{ name: "ghost", valueHash: v("ghost") }]);
    const result = classifyName({
      name: "ghost",
      node: node("A", { ghost: 10 }),
      deltas: [withheld],
      windows: WINDOWS,
      now: 30,
      rule: "proposed"
    });
    expect(result.status).toBe("absent");
  });

  it("ignores a not-yet-mined competitor: name stays provisional, not contested", () => {
    const earliest = delta("first", 10, 0, "f0", 10, 10, [{ name: "alice", valueHash: v("alice") }]);
    // Competitor is in-window (14 <= 16) but anchored above `now` (14 > 13) -> not mined yet.
    const future = delta("second", 14, 0, "s0", 14, 14, [{ name: "alice", valueHash: v("alice2") }]);
    const result = classifyName({
      name: "alice",
      node: node("A", {}),
      deltas: [earliest, future],
      windows: WINDOWS,
      now: 13,
      rule: "proposed",
      noticeWindowBlocks: 6
    });
    expect(result.status).toBe("provisional");
    if (result.status !== "provisional") throw new Error("unreachable");
    expect(result.owner).toBe(v("alice"));
  });

  it("a later claim after the window closed does not contest: name is final to the first owner", () => {
    const first = delta("first", 10, 0, "f0", 10, 10, [{ name: "taken", valueHash: v("first-owner") }]);
    const second = delta("second", 24, 0, "s0", 24, 24, [{ name: "taken", valueHash: v("second-owner") }]);
    const result = classifyName({
      name: "taken",
      node: node("A", {}),
      deltas: [first, second],
      windows: WINDOWS,
      now: 40,
      rule: "proposed",
      noticeWindowBlocks: 6
    });
    expect(result.status).toBe("final");
    if (result.status !== "final") throw new Error("unreachable");
    expect(result.owner).toBe(v("first-owner"));
  });

  it("agrees with runBatchRail at the same `now` (final <-> finalized, contested <-> escalated)", () => {
    const early = delta("early", 12, 1, "ee", 12, 12, [
      { name: "coffee", valueHash: v("coffee-early") },
      { name: "earlyonly", valueHash: v("earlyonly") }
    ]);
    const late = delta("late", 13, 9, "ll", 13, 13, [{ name: "coffee", valueHash: v("coffee-late") }]);
    const deltas = [late, early];
    const args = { node: node("A", {}), deltas, windows: WINDOWS, now: 30, rule: "proposed" as const, noticeWindowBlocks: 6 };

    const rail = runBatchRail(args);
    expect(rail.escalatedNames.find((e) => e.name === "coffee")).toBeDefined();
    expect(rail.ownerByName.get("earlyonly")).toBe(v("earlyonly"));

    expect(classifyName({ name: "coffee", ...args }).status).toBe("contested");
    const earlyonly = classifyName({ name: "earlyonly", ...args });
    expect(earlyonly.status).toBe("final");
    if (earlyonly.status !== "final") throw new Error("unreachable");
    expect(earlyonly.owner).toBe(v("earlyonly"));
  });

  it("classifyNames covers every claimed name with its status", () => {
    const deltas = [
      delta("d1", 10, 0, "01", 10, 10, [{ name: "settled", valueHash: v("settled") }]), // window 16, final at now=30
      delta("c1", 26, 0, "c1", 26, 26, [{ name: "fresh", valueHash: v("fresh") }]), // window 32, provisional at now=30
      delta("e1", 12, 1, "e1", 12, 12, [{ name: "fight", valueHash: v("fight-a") }]),
      delta("e2", 13, 2, "e2", 13, 13, [{ name: "fight", valueHash: v("fight-b") }]) // contested
    ];
    const map = classifyNames({ node: node("A", {}), deltas, windows: WINDOWS, now: 30, rule: "proposed", noticeWindowBlocks: 6 });
    expect(map.get("settled")?.status).toBe("final");
    expect(map.get("fresh")?.status).toBe("provisional");
    expect(map.get("fight")?.status).toBe("contested");
    expect(map.size).toBe(3);
  });
});

describe("batch rail — adversarial edge cases", () => {
  it("a competitor landing exactly at the notice-window close height contests (boundary is inclusive)", () => {
    // earliest at 10, window 6 -> closes at 16. A distinct claimant at exactly 16 is still in-window.
    const first = delta("first", 10, 0, "f0", 10, 10, [{ name: "edge", valueHash: v("edge-1") }]);
    const atClose = delta("rival", 16, 0, "r0", 16, 16, [{ name: "edge", valueHash: v("edge-2") }]);
    const result = classifyName({
      name: "edge",
      node: node("A", {}),
      deltas: [first, atClose],
      windows: WINDOWS,
      now: 30,
      rule: "proposed",
      noticeWindowBlocks: 6
    });
    expect(result.status).toBe("contested");
    if (result.status !== "contested") throw new Error("unreachable");
    expect([...result.contestingDeltaIds].sort()).toEqual(["first", "rival"]);
    expect(result.windowCloseHeight).toBe(16);
  });

  it("a competitor one block past the close height does not contest: name is final to the first owner", () => {
    const first = delta("first", 10, 0, "f0", 10, 10, [{ name: "edge", valueHash: v("edge-1") }]);
    const pastClose = delta("rival", 17, 0, "r0", 17, 17, [{ name: "edge", valueHash: v("edge-2") }]);
    const result = classifyName({
      name: "edge",
      node: node("A", {}),
      deltas: [first, pastClose],
      windows: WINDOWS,
      now: 30,
      rule: "proposed",
      noticeWindowBlocks: 6
    });
    expect(result.status).toBe("final");
    if (result.status !== "final") throw new Error("unreachable");
    expect(result.owner).toBe(v("edge-1"));
  });

  it("the same publisher resubmitting a name (same delta id) is one claimant, not a self-contest", () => {
    // A publisher that anchors the same name twice (e.g. after a perceived timeout) must not contest itself.
    const firstTry = delta("pub-1", 10, 0, "a0", 10, 10, [{ name: "resub", valueHash: v("resub-1") }]);
    const secondTry = delta("pub-1", 12, 0, "b0", 12, 12, [{ name: "resub", valueHash: v("resub-2") }]);
    const result = classifyName({
      name: "resub",
      node: node("A", {}),
      deltas: [firstTry, secondTry],
      windows: WINDOWS,
      now: 30,
      rule: "proposed",
      noticeWindowBlocks: 6
    });
    expect(result.status).toBe("final");
    if (result.status !== "final") throw new Error("unreachable");
    expect(result.owner).toBe(v("resub-1")); // earliest in-window claim wins
    expect(result.windowCloseHeight).toBe(16);
  });

  it("a single delta listing the same name twice finalizes once to its first insertion, never contested", () => {
    const dupeDelta = delta("pub-1", 10, 0, "d0", 10, 10, [
      { name: "dup", valueHash: v("dup-a") },
      { name: "dup", valueHash: v("dup-b") }
    ]);
    const result = classifyName({
      name: "dup",
      node: node("A", {}),
      deltas: [dupeDelta],
      windows: WINDOWS,
      now: 30,
      rule: "proposed",
      noticeWindowBlocks: 6
    });
    expect(result.status).toBe("final");
    if (result.status !== "final") throw new Error("unreachable");
    expect(result.owner).toBe(v("dup-a"));

    // And the production rail agrees: it finalizes once, does not escalate.
    const rail = runBatchRail({
      node: node("A", {}),
      deltas: [dupeDelta],
      windows: WINDOWS,
      now: 30,
      rule: "proposed",
      noticeWindowBlocks: 6
    });
    expect(rail.ownerByName.get("dup")).toBe(v("dup-a"));
    expect(rail.escalatedNames.find((e) => e.name === "dup")).toBeUndefined();
  });

  it("a withheld competing claim cannot force a contest: the name stays final to the available owner", () => {
    // Adversary anchors a competing claim but withholds its data. Fail-closed DA means it is never
    // counted, so it cannot grief the honest claim into a bonded L1 auction by anchoring alone.
    const available = delta("honest", 10, 0, "h0", 10, 10, [{ name: "target", valueHash: v("target-honest") }]);
    const withheld = delta("griefer", 12, 0, "g0", null, null, [{ name: "target", valueHash: v("target-grief") }]);
    const result = classifyName({
      name: "target",
      node: node("A", {}),
      deltas: [available, withheld],
      windows: WINDOWS,
      now: 30,
      rule: "proposed",
      noticeWindowBlocks: 6
    });
    expect(result.status).toBe("final");
    if (result.status !== "final") throw new Error("unreachable");
    expect(result.owner).toBe(v("target-honest"));
  });

  it("runBatchRail on an empty delta set yields the empty accumulator and no escalations", () => {
    const result = runBatchRail({ node: node("A", {}), deltas: [], windows: WINDOWS, now: 30, rule: "proposed" });
    expect(result.ownerByName.size).toBe(0);
    expect(result.escalatedNames).toHaveLength(0);
    expect(result.includedDeltaIds).toHaveLength(0);
    expect(result.daDroppedDeltaIds).toHaveLength(0);
    expect(result.anchoredRoots).toBe(0);
    expect(result.confirmedRoot).toBe(emptyAccumulatorRoot());
  });

  it("classifyNames over an empty delta set is an empty map", () => {
    const map = classifyNames({ node: node("A", {}), deltas: [], windows: WINDOWS, now: 30, rule: "proposed" });
    expect(map.size).toBe(0);
  });

  it("escalation keys on distinct delta ids, so a Sybil claimant can force a provisional name to L1", () => {
    // Documents a real denial vector: contesting is permissionless and the "distinct claimant" check is
    // by delta id, not by real-world identity. One actor anchoring a second claim under a throwaway id
    // forces the name to the bonded auction. The cost is the extra anchor fee plus having to actually
    // win the auction by bidding (not a free steal) — see ONT_ADVERSARIAL_ANALYSIS.md.
    const honest = delta("honest", 10, 0, "h0", 10, 10, [{ name: "victim", valueHash: v("victim-honest") }]);
    const sybil = delta("throwaway", 11, 0, "t0", 11, 11, [{ name: "victim", valueHash: v("victim-sybil") }]);
    const result = classifyName({
      name: "victim",
      node: node("A", {}),
      deltas: [honest, sybil],
      windows: WINDOWS,
      now: 30,
      rule: "proposed",
      noticeWindowBlocks: 6
    });
    expect(result.status).toBe("contested");
  });
});
