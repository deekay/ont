import { describe, expect, it } from "vitest";

import {
  type PublisherDelta,
  SMT_DEPTH,
  compactProofSize,
  createEmptyTree,
  insert,
  leafForName,
  mergeBlock,
  proveInclusion,
  treeRoot,
  valueHashForRecord,
  verifyCheckpoint,
  verifyProof
} from "./index.js";

function valueHashFor(label: string): string {
  // Stand-in for an owner-record hash; any 32-byte hex works for the accumulator.
  return valueHashForRecord(`value:${label}`);
}

function buildTreeInOrder(
  pairs: readonly { readonly name: string; readonly value: string }[],
  order: readonly number[]
): string {
  let tree = createEmptyTree();
  for (const index of order) {
    const pair = pairs[index];
    if (pair === undefined) {
      continue;
    }
    tree = insert(tree, leafForName(pair.name), pair.value);
  }
  return treeRoot(tree);
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) {
    return [[...items]];
  }
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += 1) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const sub of permutations(rest)) {
      const head = items[i];
      if (head !== undefined) {
        result.push([head, ...sub]);
      }
    }
  }
  return result;
}

describe("delta-merge accumulator (R2 leaderless chaining)", () => {
  it("inserts disjoint leaves commutatively — root depends on the set, not the order", () => {
    const pairs = [
      { name: "alice", value: valueHashFor("alice") },
      { name: "bob", value: valueHashFor("bob") },
      { name: "carol", value: valueHashFor("carol") },
      { name: "dave", value: valueHashFor("dave") }
    ];
    const indices = pairs.map((_, index) => index);
    const roots = permutations(indices).map((order) => buildTreeInOrder(pairs, order));

    // All 24 orderings of 4 disjoint insertions converge on one root.
    expect(new Set(roots).size).toBe(1);
  });

  it("a name maps to a fixed 256-bit leaf and the empty tree has a stable root", () => {
    expect(leafForName("alice")).toHaveLength(64);
    expect(leafForName("alice")).toBe(leafForName("ALICE")); // normalized
    expect(treeRoot(createEmptyTree())).toBe(treeRoot(createEmptyTree()));
    expect(SMT_DEPTH).toBe(256);
  });

  it("merges independent publishers into one root regardless of publisher order", () => {
    const deltaA: PublisherDelta = {
      publisher: "A",
      commitHeight: 100,
      commitTxIndex: 3,
      commitTxid: "aa",
      insertions: [
        { name: "apple", valueHash: valueHashFor("apple") },
        { name: "apricot", valueHash: valueHashFor("apricot") }
      ]
    };
    const deltaB: PublisherDelta = {
      publisher: "B",
      commitHeight: 100,
      commitTxIndex: 7,
      commitTxid: "bb",
      insertions: [{ name: "banana", valueHash: valueHashFor("banana") }]
    };
    const deltaC: PublisherDelta = {
      publisher: "C",
      commitHeight: 101,
      commitTxIndex: 0,
      commitTxid: "cc",
      insertions: [{ name: "cherry", valueHash: valueHashFor("cherry") }]
    };

    const prior = createEmptyTree();
    const forward = mergeBlock(prior, [deltaA, deltaB, deltaC]).result;
    const shuffled = mergeBlock(prior, [deltaC, deltaA, deltaB]).result;

    expect(forward.appliedCount).toBe(4);
    expect(forward.droppedCount).toBe(0);
    expect(forward.insertionsConsidered).toBe(4);
    // Publisher (and therefore miner) ordering does not change the derived tip.
    expect(shuffled.mergedRoot).toBe(forward.mergedRoot);
  });

  it("resolves same-name conflicts by commit priority; the loser's other insertions still apply", () => {
    const earlier: PublisherDelta = {
      publisher: "early",
      commitHeight: 200,
      commitTxIndex: 1,
      commitTxid: "ee",
      insertions: [
        { name: "alice", valueHash: valueHashFor("alice-by-early") },
        { name: "earlyonly", valueHash: valueHashFor("earlyonly") }
      ]
    };
    const later: PublisherDelta = {
      publisher: "late",
      commitHeight: 200,
      commitTxIndex: 9, // same block, later tx index -> loses the contested name
      commitTxid: "ll",
      insertions: [
        { name: "alice", valueHash: valueHashFor("alice-by-late") },
        { name: "lateonly", valueHash: valueHashFor("lateonly") }
      ]
    };

    const { tree, result } = mergeBlock(createEmptyTree(), [later, earlier]);

    const aliceOps = result.ops.filter((op) => op.name === "alice");
    const winner = aliceOps.find((op) => op.status === "applied");
    const loser = aliceOps.find((op) => op.status === "dropped_conflict");
    expect(winner?.publisher).toBe("early");
    expect(loser?.publisher).toBe("late");
    expect(loser?.winningPublisher).toBe("early");

    // The loser still gets its uncontested name; both publishers' disjoint names land.
    const applied = new Set(result.ops.filter((op) => op.status === "applied").map((op) => op.name));
    expect(applied).toEqual(new Set(["alice", "earlyonly", "lateonly"]));

    // The merged tree holds the *winner's* value for the contested leaf.
    const aliceProof = proveInclusion(tree, leafForName("alice"));
    expect(aliceProof.value).toBe(valueHashFor("alice-by-early"));
    expect(verifyProof(result.mergedRoot, aliceProof)).toBe(true);
  });

  it("is immune to miner reordering within the block (the reordering attack evaporates)", () => {
    const deltas: PublisherDelta[] = [
      {
        publisher: "P1",
        commitHeight: 300,
        commitTxIndex: 0,
        commitTxid: "01",
        insertions: [{ name: "one", valueHash: valueHashFor("one") }]
      },
      {
        publisher: "P2",
        commitHeight: 300,
        commitTxIndex: 1,
        commitTxid: "02",
        insertions: [{ name: "two", valueHash: valueHashFor("two") }]
      },
      {
        publisher: "P3",
        commitHeight: 300,
        commitTxIndex: 2,
        commitTxid: "03",
        insertions: [{ name: "three", valueHash: valueHashFor("three") }]
      }
    ];
    const prior = createEmptyTree();
    const roots = permutations(deltas).map((order) => mergeBlock(prior, order).result.mergedRoot);
    expect(new Set(roots).size).toBe(1);
  });

  it("excludes a withheld delta instead of halting — the tip still advances (DA benefit)", () => {
    const live: PublisherDelta = {
      publisher: "live",
      commitHeight: 400,
      commitTxIndex: 0,
      commitTxid: "0a",
      insertions: [{ name: "livename", valueHash: valueHashFor("livename") }]
    };
    const withheld: PublisherDelta = {
      publisher: "withheld",
      commitHeight: 400,
      commitTxIndex: 1,
      commitTxid: "0b",
      insertions: [{ name: "withheldname", valueHash: valueHashFor("withheldname") }]
    };

    const prior = createEmptyTree();
    const full = mergeBlock(prior, [live, withheld]);
    const withWithheldDropped = mergeBlock(prior, [live]);

    // The merge with the unavailable delta excluded still succeeds and advances the tip.
    expect(withWithheldDropped.result.appliedCount).toBe(1);
    expect(withWithheldDropped.result.mergedRoot).not.toBe(treeRoot(prior));

    // The honest publisher's name is present; the withheld one is simply absent — not fatal.
    expect(proveInclusion(withWithheldDropped.tree, leafForName("livename")).value).toBe(
      valueHashFor("livename")
    );
    expect(proveInclusion(withWithheldDropped.tree, leafForName("withheldname")).value).toBeNull();

    // Excluding the delta changes the tip (different set merged) but both roots are valid.
    expect(full.result.mergedRoot).not.toBe(withWithheldDropped.result.mergedRoot);
  });

  it("rejects re-insertion of an already-confirmed name (proven against the prior root)", () => {
    const prior = insert(createEmptyTree(), leafForName("taken"), valueHashFor("original-owner"));
    const grab: PublisherDelta = {
      publisher: "grabber",
      commitHeight: 500,
      commitTxIndex: 0,
      commitTxid: "ff",
      insertions: [{ name: "taken", valueHash: valueHashFor("grabber-owner") }]
    };

    const { tree, result } = mergeBlock(prior, [grab]);
    const takenOp = result.ops.find((op) => op.name === "taken");
    expect(takenOp?.status).toBe("dropped_existing");
    expect(result.appliedCount).toBe(0);
    expect(result.mergedRoot).toBe(treeRoot(prior));
    // The original owner survives the grab attempt.
    expect(proveInclusion(tree, leafForName("taken")).value).toBe(valueHashFor("original-owner"));
  });

  it("verifies a derived checkpoint by recomputation and rejects a wrong one", () => {
    const deltas: PublisherDelta[] = [
      {
        publisher: "X",
        commitHeight: 600,
        commitTxIndex: 0,
        commitTxid: "10",
        insertions: [{ name: "xname", valueHash: valueHashFor("xname") }]
      }
    ];
    const prior = createEmptyTree();
    const { result } = mergeBlock(prior, deltas);

    expect(verifyCheckpoint(prior, deltas, result.mergedRoot)).toBe(true);
    expect(verifyCheckpoint(prior, deltas, treeRoot(prior))).toBe(false);
    expect(verifyCheckpoint(prior, deltas, "00".repeat(32))).toBe(false);
  });

  it("produces compact inclusion and non-membership proofs far smaller than the tree depth", () => {
    let tree = createEmptyTree();
    for (const name of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
      tree = insert(tree, leafForName(name), valueHashFor(name));
    }
    const root = treeRoot(tree);

    const present = proveInclusion(tree, leafForName("d"));
    expect(present.value).toBe(valueHashFor("d"));
    expect(verifyProof(root, present)).toBe(true);
    // Compact proof carries only non-default siblings — far below the 256-level depth.
    expect(compactProofSize(present)).toBeLessThan(32);

    const absent = proveInclusion(tree, leafForName("notclaimed"));
    expect(absent.value).toBeNull();
    expect(verifyProof(root, absent)).toBe(true);

    // Tampering with the claimed value breaks verification.
    const tampered = { ...present, value: valueHashFor("e") };
    expect(verifyProof(root, tampered)).toBe(false);
  });
});
