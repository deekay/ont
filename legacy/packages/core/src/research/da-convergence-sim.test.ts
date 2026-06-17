import { describe, expect, it } from "vitest";

import {
  type AnchoredDelta,
  type NodeView,
  confirmedStateForNode,
  convergenceReport,
  createDefaultDaWindows,
  isCanonical,
  valueHashForRecord
} from "../index.js";

const WINDOWS = createDefaultDaWindows(); // K=6, W=2, C=3

function v(label: string): string {
  return valueHashForRecord(label);
}

function node(nodeId: string, receipts: Record<string, number>): NodeView {
  return { nodeId, localDataReceiptHeight: new Map(Object.entries(receipts)) };
}

describe("DA convergence (R1 agreement rule)", () => {
  it("the naive rule forks, the proposed rule converges — same batches, different outcome", () => {
    const clean: AnchoredDelta = {
      id: "clean",
      publisher: "c",
      anchorHeight: 8,
      anchorTxIndex: 0,
      anchorTxid: "c0",
      markerHeight: 8,
      networkServableFromHeight: 8,
      insertions: [{ name: "clean", valueHash: v("clean") }]
    };
    // Borderline batch: marker on-chain at 11 (within W=2 of anchor 10), data servable at 11.
    const borderline: AnchoredDelta = {
      id: "bord",
      publisher: "b",
      anchorHeight: 10,
      anchorTxIndex: 0,
      anchorTxid: "b0",
      markerHeight: 11,
      networkServableFromHeight: 11,
      insertions: [{ name: "bord", valueHash: v("bord") }]
    };
    const deltas = [clean, borderline];

    // Two honest nodes whose *local* receipt of the borderline batch straddles the naive deadline
    // (anchor 10 + W 2 = 12): A receives at 12 (includes), B at 13 (excludes).
    const nodes = [
      node("A", { clean: 8, bord: 12 }),
      node("B", { clean: 8, bord: 13 })
    ];
    const now = 20;

    const naive = convergenceReport({ nodes, deltas, windows: WINDOWS, now, rule: "naive" });
    expect(naive.converged).toBe(false);
    expect(naive.distinctRoots).toHaveLength(2);

    const proposed = convergenceReport({ nodes, deltas, windows: WINDOWS, now, rule: "proposed" });
    expect(proposed.converged).toBe(true);
    expect(proposed.distinctRoots).toHaveLength(1);
    expect(proposed.perNode.get("A")?.ownerByName.has("clean")).toBe(true);
    expect(proposed.perNode.get("A")?.ownerByName.has("bord")).toBe(true);
  });

  it("withholding is self-harm: the hidden batch is dropped, everyone else still registers", () => {
    const survivor: AnchoredDelta = {
      id: "survivor",
      publisher: "s",
      anchorHeight: 10,
      anchorTxIndex: 0,
      anchorTxid: "s0",
      markerHeight: 10,
      networkServableFromHeight: 10,
      insertions: [{ name: "survivor", valueHash: v("survivor") }]
    };
    const withheld: AnchoredDelta = {
      id: "ghost",
      publisher: "g",
      anchorHeight: 10,
      anchorTxIndex: 1,
      anchorTxid: "g0",
      markerHeight: null, // never posted a marker
      networkServableFromHeight: null, // bytes never served by anyone
      insertions: [{ name: "ghost", valueHash: v("ghost") }]
    };
    const deltas = [survivor, withheld];
    const nodes = [node("A", { survivor: 10, ghost: 10 }), node("B", { survivor: 10 })];

    const proposed = convergenceReport({ nodes, deltas, windows: WINDOWS, now: 20, rule: "proposed" });
    expect(proposed.converged).toBe(true);
    const owners = proposed.perNode.get("A")?.ownerByName;
    expect(owners?.has("survivor")).toBe(true);
    expect(owners?.has("ghost")).toBe(false); // the withholder loses only its own name
  });

  it("mark-but-don't-serve is excluded by all (a marker without bytes isn't enough)", () => {
    const real: AnchoredDelta = {
      id: "real",
      publisher: "r",
      anchorHeight: 10,
      anchorTxIndex: 0,
      anchorTxid: "r0",
      markerHeight: 10,
      networkServableFromHeight: 10,
      insertions: [{ name: "real", valueHash: v("real") }]
    };
    const phantom: AnchoredDelta = {
      id: "phantom",
      publisher: "p",
      anchorHeight: 10,
      anchorTxIndex: 1,
      anchorTxid: "p0",
      markerHeight: 11, // marker IS on-chain in time...
      networkServableFromHeight: null, // ...but the bytes are never servable
      insertions: [{ name: "phantom", valueHash: v("phantom") }]
    };

    // The marker-in-time half passes; the served-in-time half fails -> not canonical.
    expect(isCanonical(phantom, WINDOWS)).toBe(false);
    expect(isCanonical(real, WINDOWS)).toBe(true);

    const proposed = convergenceReport({
      nodes: [node("A", { real: 10, phantom: 10 }), node("B", { real: 10 })],
      deltas: [real, phantom],
      windows: WINDOWS,
      now: 20,
      rule: "proposed"
    });
    expect(proposed.converged).toBe(true);
    expect(proposed.perNode.get("A")?.ownerByName.has("phantom")).toBe(false);
    expect(proposed.perNode.get("A")?.ownerByName.has("real")).toBe(true);
  });

  it("defeats withhold-then-reveal name theft on a contested name", () => {
    // Attacker commits EARLIER (better priority) but withholds and only reveals far too late.
    const attacker: AnchoredDelta = {
      id: "atk",
      publisher: "atk",
      anchorHeight: 10,
      anchorTxIndex: 0,
      anchorTxid: "a0",
      markerHeight: null,
      networkServableFromHeight: 200, // reveals long after the deadline
      insertions: [{ name: "coffee", valueHash: v("coffee-atk") }]
    };
    // Honest claimant commits later but with the marker and data in time.
    const honest: AnchoredDelta = {
      id: "hon",
      publisher: "hon",
      anchorHeight: 12,
      anchorTxIndex: 0,
      anchorTxid: "h0",
      markerHeight: 12,
      networkServableFromHeight: 12,
      insertions: [{ name: "coffee", valueHash: v("coffee-hon") }]
    };
    const deltas = [attacker, honest];

    // Under the proposed rule the attacker is filtered out before it can use its earlier priority.
    const proposed = convergenceReport({
      nodes: [node("A", { coffee: 11 }), node("B", { hon: 13 })],
      deltas,
      windows: WINDOWS,
      now: 20,
      rule: "proposed"
    });
    expect(proposed.converged).toBe(true);
    expect(proposed.perNode.get("A")?.ownerByName.get("coffee")).toBe(v("coffee-hon"));

    // Under the naive rule the same selective-reveal both FORKS and lets the thief win on a node
    // that happened to receive the attacker's bytes in time — exactly what the proposed rule fixes.
    const nodeX = node("X", { atk: 11, hon: 13 }); // saw attacker in time -> thief wins here
    const nodeY = node("Y", { hon: 13 }); // never saw attacker -> honest wins here
    const naive = convergenceReport({ nodes: [nodeX, nodeY], deltas, windows: WINDOWS, now: 20, rule: "naive" });
    expect(naive.converged).toBe(false);
    expect(naive.perNode.get("X")?.ownerByName.get("coffee")).toBe(v("coffee-atk"));
    expect(naive.perNode.get("Y")?.ownerByName.get("coffee")).toBe(v("coffee-hon"));
  });

  it("an uncontested straggler that missed the window just re-anchors and registers later", () => {
    const missed: AnchoredDelta = {
      id: "first",
      publisher: "late",
      anchorHeight: 10,
      anchorTxIndex: 0,
      anchorTxid: "f0",
      markerHeight: null, // missed the window
      networkServableFromHeight: null,
      insertions: [{ name: "latebob", valueHash: v("latebob-1") }]
    };
    const reanchored: AnchoredDelta = {
      id: "second",
      publisher: "late",
      anchorHeight: 20,
      anchorTxIndex: 0,
      anchorTxid: "s0",
      markerHeight: 20,
      networkServableFromHeight: 20,
      insertions: [{ name: "latebob", valueHash: v("latebob-2") }]
    };

    const state = confirmedStateForNode({
      node: node("A", { first: 10, second: 20 }),
      deltas: [missed, reanchored],
      windows: WINDOWS,
      now: 30,
      rule: "proposed"
    });
    // The name still lands — just at the later, valid anchor. No permanent loss for the long tail.
    expect(state.ownerByName.get("latebob")).toBe(v("latebob-2"));
    expect(state.includedDeltaIds).toContain("second");
    expect(state.includedDeltaIds).not.toContain("first");
  });

  it("rejects windows where the finalization lag can't cover marker + challenge", () => {
    expect(() =>
      confirmedStateForNode({
        node: node("A", {}),
        deltas: [],
        windows: { confirmDepthK: 3, availabilityWindowW: 2, challengeWindowC: 3 }, // 3 < 5
        now: 10,
        rule: "proposed"
      })
    ).toThrow(/confirmDepthK/);
  });
});
