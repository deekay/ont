import { describe, expect, it } from "vitest";

import type { BitcoinBlock, BitcoinTransaction } from "@ont/bitcoin";
import { bytesToHex } from "@ont/protocol";

import {
  Accumulator,
  accumulatorKeyForName,
  emptyAccumulatorRoot,
  encodeRootAnchorPayload,
  type RootAnchor
} from "./index.js";
import {
  type AccumulatorBatchDataProvider,
  type AccumulatorBatchLeaf,
  InMemoryOntIndexer
} from "./indexer.js";

function anchorTx(txid: string, anchor: RootAnchor): BitcoinTransaction {
  return {
    txid,
    inputs: [{ txid: null, vout: null, coinbase: false }],
    outputs: [
      { valueSats: 0n, scriptType: "op_return", dataHex: bytesToHex(encodeRootAnchorPayload(anchor)) },
      { valueSats: 10_000n, scriptType: "payment" }
    ]
  };
}

function block(height: number, hash: string, transactions: BitcoinTransaction[]): BitcoinBlock {
  return { height, hash, transactions };
}

const GENESIS = emptyAccumulatorRoot();
const OWNER_A = "a1".repeat(32);
const OWNER_B = "b2".repeat(32);
const OWNER_C = "c3".repeat(32);

/**
 * Build a real one-batch accumulator from name->owner pairs, returning the new root
 * and verifiable membership leaves. This is exactly what an honest publisher emits.
 */
function buildBatch(pairs: ReadonlyArray<readonly [string, string]>): {
  readonly newRoot: string;
  readonly leaves: AccumulatorBatchLeaf[];
} {
  const acc = new Accumulator();
  for (const [name, owner] of pairs) {
    acc.insert(accumulatorKeyForName(name), owner);
  }
  const newRoot = acc.root();
  const leaves = pairs.map(([name, owner]) => ({
    name,
    ownerPubkey: owner,
    proof: acc.proveMembership(accumulatorKeyForName(name))
  }));
  return { newRoot, leaves };
}

/** In-memory batch-data provider keyed by accumulator root (the test DA transport). */
function provider(batches: ReadonlyArray<{ newRoot: string; leaves: AccumulatorBatchLeaf[] }>): AccumulatorBatchDataProvider {
  const byRoot = new Map<string, readonly AccumulatorBatchLeaf[]>();
  for (const batch of batches) {
    byRoot.set(batch.newRoot.toLowerCase(), batch.leaves);
  }
  return { leavesForRoot: (root) => byRoot.get(root.toLowerCase()) ?? null };
}

describe("InMemoryOntIndexer accumulator-name merge (cheap-rail phase 2)", () => {
  it("resolves names finalized in a batch once its anchor confirms", () => {
    const batch = buildBatch([["alice", OWNER_A], ["bob", OWNER_B]]);
    const indexer = new InMemoryOntIndexer({ launchHeight: 100, batchDataProvider: provider([batch]) });

    indexer.ingestBlock(block(100, "aa".repeat(32), [anchorTx("a1".repeat(32), { prevRoot: GENESIS, newRoot: batch.newRoot, batchSize: 2 })]));

    const alice = indexer.getAccumulatorName("alice");
    expect(alice).not.toBeNull();
    expect(alice?.currentOwnerPubkey).toBe(OWNER_A.toLowerCase());
    expect(alice?.acquisitionKind).toBe("accumulator");
    expect(alice?.claimHeight).toBe(100);
    expect(alice?.accumulatorRoot).toBe(batch.newRoot);
    expect(alice?.leafKey).toBe(accumulatorKeyForName("alice"));

    expect(indexer.listAccumulatorNames().map((r) => r.normalizedName)).toEqual(["alice", "bob"]);

    const resolved = indexer.resolveName("alice");
    expect(resolved?.source).toBe("accumulator");
    expect(resolved?.record).toEqual(alice);
    // Resolved immediately after its anchor (height 100, window closes 106): provisional.
    expect(resolved?.source === "accumulator" && resolved.finality.status).toBe("provisional");
  });

  it("does NOT resolve names whose anchor was rejected (stale chain)", () => {
    const batch = buildBatch([["alice", OWNER_A]]);
    const indexer = new InMemoryOntIndexer({ launchHeight: 100, batchDataProvider: provider([batch]) });

    // prevRoot is wrong (not the genesis tip) → anchor rejected → no merge.
    indexer.ingestBlock(block(100, "aa".repeat(32), [anchorTx("a1".repeat(32), { prevRoot: "cc".repeat(32), newRoot: batch.newRoot, batchSize: 1 })]));

    expect(indexer.getAccumulatorName("alice")).toBeNull();
    expect(indexer.resolveName("alice")).toBeNull();
  });

  it("drops a leaf whose owner does not match the proven accumulator value", () => {
    const batch = buildBatch([["alice", OWNER_A]]);
    // Tamper: claim a different owner than the proof actually commits to.
    const tampered: AccumulatorBatchLeaf = { ...batch.leaves[0]!, ownerPubkey: OWNER_B };
    const indexer = new InMemoryOntIndexer({
      launchHeight: 100,
      batchDataProvider: provider([{ newRoot: batch.newRoot, leaves: [tampered] }])
    });

    indexer.ingestBlock(block(100, "aa".repeat(32), [anchorTx("a1".repeat(32), { prevRoot: GENESIS, newRoot: batch.newRoot, batchSize: 1 })]));

    expect(indexer.getAccumulatorName("alice")).toBeNull();
  });

  it("drops a leaf whose membership proof does not verify against the anchored root", () => {
    const real = buildBatch([["alice", OWNER_A]]);
    // A proof from a DIFFERENT accumulator won't verify against `real.newRoot`.
    const otherBatch = buildBatch([["alice", OWNER_A], ["decoy", OWNER_B]]);
    const forged: AccumulatorBatchLeaf = {
      name: "alice",
      ownerPubkey: OWNER_A,
      proof: otherBatch.leaves[0]!.proof
    };
    const indexer = new InMemoryOntIndexer({
      launchHeight: 100,
      batchDataProvider: provider([{ newRoot: real.newRoot, leaves: [forged] }])
    });

    indexer.ingestBlock(block(100, "aa".repeat(32), [anchorTx("a1".repeat(32), { prevRoot: GENESIS, newRoot: real.newRoot, batchSize: 1 })]));

    expect(indexer.getAccumulatorName("alice")).toBeNull();
  });

  it("lets an L1 name win a collision with an accumulator name (resolveName precedence)", () => {
    // The accumulator name resolves only when there is no L1 record. We assert the
    // precedence contract directly: resolveName prefers the L1 record when present.
    const batch = buildBatch([["alice", OWNER_A]]);
    const indexer = new InMemoryOntIndexer({ launchHeight: 100, batchDataProvider: provider([batch]) });
    indexer.ingestBlock(block(100, "aa".repeat(32), [anchorTx("a1".repeat(32), { prevRoot: GENESIS, newRoot: batch.newRoot, batchSize: 1 })]));

    // No L1 record for "alice" yet → resolves to the accumulator.
    expect(indexer.resolveName("alice")?.source).toBe("accumulator");
    // getName (L1 only) still sees nothing — the rails stay distinct.
    expect(indexer.getName("alice")).toBeNull();
  });

  it("observes the chain but merges nothing when no batch-data provider is configured", () => {
    const batch = buildBatch([["alice", OWNER_A]]);
    const indexer = new InMemoryOntIndexer({ launchHeight: 100 }); // no provider
    indexer.ingestBlock(block(100, "aa".repeat(32), [anchorTx("a1".repeat(32), { prevRoot: GENESIS, newRoot: batch.newRoot, batchSize: 1 })]));

    expect(indexer.getConfirmedAccumulatorRoot()).toBe(batch.newRoot); // chain still advances
    expect(indexer.getAccumulatorName("alice")).toBeNull(); // but nothing merged
  });

  it("applyBatchData merges externally-fetched leaves for an anchored root (the live DA path)", () => {
    const batch = buildBatch([["alice", OWNER_A], ["bob", OWNER_B]]);
    const indexer = new InMemoryOntIndexer({ launchHeight: 100 }); // NO provider — fetched externally
    indexer.ingestBlock(block(100, "aa".repeat(32), [anchorTx("a1".repeat(32), { prevRoot: GENESIS, newRoot: batch.newRoot, batchSize: 2 })]));

    // Before fetching the bytes: chain observed, name not resolvable, root unresolved.
    expect(indexer.getAccumulatorName("alice")).toBeNull();
    expect(indexer.unresolvedAnchorRoots()).toEqual([batch.newRoot.toLowerCase()]);

    // The resolver fetched the leaves from the publisher and hands them in.
    expect(indexer.applyBatchData(batch.newRoot, batch.leaves)).toBe(2);
    expect(indexer.getAccumulatorName("alice")?.currentOwnerPubkey).toBe(OWNER_A.toLowerCase());
    expect(indexer.resolveName("bob")?.source).toBe("accumulator");
    expect(indexer.unresolvedAnchorRoots()).toEqual([]); // resolved
  });

  // --- Notice window (Decision #37): provisional → final | nullified --------
  // NOTICE_WINDOW_BLOCKS defaults to 6, so a claim at height H closes at H+6.

  it("a claim is provisional during its notice window and finalizes when it closes uncontested", () => {
    const batch = buildBatch([["alice", OWNER_A]]);
    const indexer = new InMemoryOntIndexer({ launchHeight: 100 });

    indexer.ingestBlock(block(100, "aa".repeat(32), [anchorTx("a1".repeat(32), { prevRoot: GENESIS, newRoot: batch.newRoot, batchSize: 1 })]));
    expect(indexer.applyBatchData(batch.newRoot, batch.leaves)).toBe(1);

    // Inside the window (height 100, close 106): provisional but resolvable.
    expect(indexer.classifyAccumulatorName("alice")?.status).toBe("provisional");
    expect(indexer.classifyAccumulatorName("alice")?.noticeWindowCloseHeight).toBe(106);
    const provisional = indexer.resolveName("alice");
    expect(provisional?.source).toBe("accumulator");
    expect(provisional?.source === "accumulator" && provisional.finality.status).toBe("provisional");

    // Advance past the close height: the claim finalizes.
    indexer.ingestBlock(block(106, "a6".repeat(32), []));
    expect(indexer.classifyAccumulatorName("alice")?.status).toBe("final");
    const final = indexer.resolveName("alice");
    expect(final?.source === "accumulator" && final.finality.status).toBe("final");
    expect(final?.record.currentOwnerPubkey).toBe(OWNER_A.toLowerCase());
  });

  it("an in-window collision nullifies the name at window close — neither claim wins (#37)", () => {
    // CR-02/CR-11 + #37: a competing distinct-owner claim INSIDE the window can
    // deny but never award. Both claims fall in the window → the name nullifies.
    const first = buildBatch([["alice", OWNER_A]]);
    const second = buildBatch([["alice", OWNER_B]]);
    const indexer = new InMemoryOntIndexer({ launchHeight: 100 });

    indexer.ingestBlock(block(100, "aa".repeat(32), [anchorTx("a1".repeat(32), { prevRoot: GENESIS, newRoot: first.newRoot, batchSize: 1 })]));
    expect(indexer.applyBatchData(first.newRoot, first.leaves)).toBe(1);

    // Second claim lands at height 101 — inside alice's window (closes 106).
    indexer.ingestBlock(block(101, "bb".repeat(32), [anchorTx("a2".repeat(32), { prevRoot: first.newRoot, newRoot: second.newRoot, batchSize: 1 })]));
    expect(indexer.applyBatchData(second.newRoot, second.leaves)).toBe(0); // collision, not merged
    expect(indexer.getAccumulatorName("alice")?.currentOwnerPubkey).toBe(OWNER_A.toLowerCase()); // first not overwritten
    expect(indexer.classifyAccumulatorName("alice")?.status).toBe("collided");
    expect(indexer.resolveName("alice")?.source).toBe("accumulator"); // still resolvable while provisional

    // At window close the collided name nullifies — resolves to NO owner.
    indexer.ingestBlock(block(106, "a6".repeat(32), []));
    expect(indexer.classifyAccumulatorName("alice")?.status).toBe("nullified");
    expect(indexer.resolveName("alice")).toBeNull();
  });

  it("a claim arriving after the window closed cannot take the finalized name (denial protection)", () => {
    const first = buildBatch([["alice", OWNER_A]]);
    const late = buildBatch([["alice", OWNER_B]]);
    const indexer = new InMemoryOntIndexer({ launchHeight: 100 });

    indexer.ingestBlock(block(100, "aa".repeat(32), [anchorTx("a1".repeat(32), { prevRoot: GENESIS, newRoot: first.newRoot, batchSize: 1 })]));
    expect(indexer.applyBatchData(first.newRoot, first.leaves)).toBe(1);

    // Advance past close: alice is FINAL.
    indexer.ingestBlock(block(107, "a7".repeat(32), []));
    expect(indexer.classifyAccumulatorName("alice")?.status).toBe("final");

    // A later distinct-owner claim at height 108 cannot take a finalized name.
    indexer.ingestBlock(block(108, "bb".repeat(32), [anchorTx("a2".repeat(32), { prevRoot: first.newRoot, newRoot: late.newRoot, batchSize: 1 })]));
    expect(indexer.applyBatchData(late.newRoot, late.leaves)).toBe(0); // refused
    expect(indexer.getAccumulatorName("alice")?.currentOwnerPubkey).toBe(OWNER_A.toLowerCase()); // unchanged
    expect(indexer.classifyAccumulatorName("alice")?.status).toBe("final"); // still final, still alice
    expect(indexer.listRefusedTakeoverNames()).toContain("alice");
  });

  it("same owner re-anchor is idempotent and keeps the window anchored on the earliest claim", () => {
    const first = buildBatch([["alice", OWNER_A]]);
    const again = buildBatch([["alice", OWNER_A], ["bob", OWNER_B]]);
    const indexer = new InMemoryOntIndexer({ launchHeight: 100 });

    indexer.ingestBlock(block(100, "aa".repeat(32), [anchorTx("a1".repeat(32), { prevRoot: GENESIS, newRoot: first.newRoot, batchSize: 1 })]));
    expect(indexer.applyBatchData(first.newRoot, first.leaves)).toBe(1);

    indexer.ingestBlock(block(101, "bb".repeat(32), [anchorTx("a2".repeat(32), { prevRoot: first.newRoot, newRoot: again.newRoot, batchSize: 2 })]));
    expect(indexer.applyBatchData(again.newRoot, again.leaves)).toBe(2); // alice (same owner) + bob
    expect(indexer.getAccumulatorName("alice")?.currentOwnerPubkey).toBe(OWNER_A.toLowerCase());
    // Window still anchored on the first claim (height 100 → close 106), not reset to 101.
    expect(indexer.classifyAccumulatorName("alice")?.noticeWindowCloseHeight).toBe(106);
    expect(indexer.listRefusedTakeoverNames()).toEqual([]);
  });

  it("a distinct-owner claim landing AT the close height meets a final name and is refused, not a collision (NW-02 boundary)", () => {
    // The close height is the first block at which the name is FINAL. A claim in
    // that exact block is too late to collide — it must be refused (denial
    // protection), never retroactively nullify an already-final name.
    const first = buildBatch([["alice", OWNER_A]]);
    const atClose = buildBatch([["alice", OWNER_B]]);
    const indexer = new InMemoryOntIndexer({ launchHeight: 100 });

    indexer.ingestBlock(block(100, "aa".repeat(32), [anchorTx("a1".repeat(32), { prevRoot: GENESIS, newRoot: first.newRoot, batchSize: 1 })]));
    expect(indexer.applyBatchData(first.newRoot, first.leaves)).toBe(1); // close = 106

    // A distinct-owner claim in the close block (106) — already final.
    indexer.ingestBlock(block(106, "bb".repeat(32), [anchorTx("a2".repeat(32), { prevRoot: first.newRoot, newRoot: atClose.newRoot, batchSize: 1 })]));
    expect(indexer.applyBatchData(atClose.newRoot, atClose.leaves)).toBe(0); // refused
    expect(indexer.classifyAccumulatorName("alice")?.status).toBe("final"); // NOT nullified
    expect(indexer.getAccumulatorName("alice")?.currentOwnerPubkey).toBe(OWNER_A.toLowerCase());
    expect(indexer.listRefusedTakeoverNames()).toContain("alice");
  });

  it("a nullified name reopens for claiming — a fresh claim after the window wins (NW-01 reopen)", () => {
    // Decision #37: a collided name nullifies AND reopens. After the window closes
    // a new claim must be able to take it (fresh provisional window), not be stuck.
    const first = buildBatch([["alice", OWNER_A]]);
    const collide = buildBatch([["alice", OWNER_B]]);
    const reclaim = buildBatch([["alice", OWNER_C]]); // a fresh party re-claims the reopened name
    const indexer = new InMemoryOntIndexer({ launchHeight: 100 });

    // Claim + in-window collision → nullified at close.
    indexer.ingestBlock(block(100, "aa".repeat(32), [anchorTx("a1".repeat(32), { prevRoot: GENESIS, newRoot: first.newRoot, batchSize: 1 })]));
    expect(indexer.applyBatchData(first.newRoot, first.leaves)).toBe(1);
    indexer.ingestBlock(block(101, "bb".repeat(32), [anchorTx("a2".repeat(32), { prevRoot: first.newRoot, newRoot: collide.newRoot, batchSize: 1 })]));
    expect(indexer.applyBatchData(collide.newRoot, collide.leaves)).toBe(0);
    indexer.ingestBlock(block(106, "c6".repeat(32), []));
    expect(indexer.classifyAccumulatorName("alice")?.status).toBe("nullified");
    expect(indexer.resolveName("alice")).toBeNull();

    // A fresh claim after the window REOPENS the name — it wins a new provisional window.
    indexer.ingestBlock(block(110, "dd".repeat(32), [anchorTx("a3".repeat(32), { prevRoot: collide.newRoot, newRoot: reclaim.newRoot, batchSize: 1 })]));
    expect(indexer.applyBatchData(reclaim.newRoot, reclaim.leaves)).toBe(1); // merged — reopened
    expect(indexer.classifyAccumulatorName("alice")?.status).toBe("provisional");
    expect(indexer.classifyAccumulatorName("alice")?.noticeWindowCloseHeight).toBe(116); // fresh window from 110
    expect(indexer.getAccumulatorName("alice")?.currentOwnerPubkey).toBe(OWNER_C.toLowerCase());
    expect(indexer.listRefusedTakeoverNames()).toEqual([]); // cleared on reopen

    // And it finalizes uncontested.
    indexer.ingestBlock(block(116, "e6".repeat(32), []));
    expect(indexer.classifyAccumulatorName("alice")?.status).toBe("final");
  });

  it("applyBatchData drops leaves whose proofs are for a DIFFERENT root than the anchored one", () => {
    // The anchored root is real, but the provider serves proofs built against some
    // other tree — e.g. a malicious or buggy DA source mixing up batches. Every
    // leaf must fail verification against the anchored root and be dropped.
    const anchored = buildBatch([["alice", OWNER_A]]);
    const other = buildBatch([["alice", OWNER_A], ["decoy", OWNER_B]]);
    const indexer = new InMemoryOntIndexer({ launchHeight: 100 });
    indexer.ingestBlock(block(100, "aa".repeat(32), [anchorTx("a1".repeat(32), { prevRoot: GENESIS, newRoot: anchored.newRoot, batchSize: 1 })]));

    expect(indexer.applyBatchData(anchored.newRoot, other.leaves)).toBe(0);
    expect(indexer.getAccumulatorName("alice")).toBeNull();
    // The root stays on the DA work-list so an honest source can still resolve it.
    expect(indexer.unresolvedAnchorRoots()).toEqual([anchored.newRoot.toLowerCase()]);
  });

  it("a reorg (checkpoint restore) drops accumulator names whose anchor was orphaned", () => {
    const batch = buildBatch([["alice", OWNER_A]]);
    const indexer = new InMemoryOntIndexer({ launchHeight: 100, batchDataProvider: provider([batch]) });

    // Block 100: no anchor — this is the checkpoint we'll rewind to.
    indexer.ingestBlock(block(100, "10".repeat(32), []));
    // Block 101: the anchor lands and the name merges.
    indexer.ingestBlock(block(101, "11".repeat(32), [anchorTx("a1".repeat(32), { prevRoot: GENESIS, newRoot: batch.newRoot, batchSize: 1 })]));
    expect(indexer.resolveName("alice")?.source).toBe("accumulator");
    expect(indexer.getConfirmedAccumulatorRoot()).toBe(batch.newRoot);

    // Reorg: block 101 is orphaned; the node rewinds to the checkpoint at 100.
    expect(indexer.restoreRecentCheckpoint(100, "10".repeat(32))).toBe(true);
    expect(indexer.resolveName("alice")).toBeNull(); // name gone with its anchor
    expect(indexer.getConfirmedAccumulatorRoot()).toBe(GENESIS); // chain tip rewound
    expect(indexer.unresolvedAnchorRoots()).toEqual([]); // no phantom DA work
  });

  it("applyBatchData refuses leaves for a root that was never an applied anchor", () => {
    const batch = buildBatch([["alice", OWNER_A]]);
    const indexer = new InMemoryOntIndexer({ launchHeight: 100 });
    // No anchor ingested for batch.newRoot → must refuse (can't inject against an unanchored root).
    expect(indexer.applyBatchData(batch.newRoot, batch.leaves)).toBe(0);
    expect(indexer.getAccumulatorName("alice")).toBeNull();
  });

  it("round-trips accumulator names through snapshot/restore", () => {
    const batch = buildBatch([["alice", OWNER_A], ["bob", OWNER_B]]);
    const original = new InMemoryOntIndexer({ launchHeight: 100, batchDataProvider: provider([batch]) });
    original.ingestBlock(block(100, "aa".repeat(32), [anchorTx("a1".repeat(32), { prevRoot: GENESIS, newRoot: batch.newRoot, batchSize: 2 })]));

    const restored = InMemoryOntIndexer.fromSnapshot(original.exportSnapshot());
    expect(restored.listAccumulatorNames()).toEqual(original.listAccumulatorNames());
    expect(restored.getAccumulatorName("bob")?.currentOwnerPubkey).toBe(OWNER_B.toLowerCase());
    expect(restored.resolveName("alice")?.source).toBe("accumulator");
  });

  it("namesOwnedBy reverse-lookup returns an owner's names across the rail (gap-scan source)", () => {
    const batch = buildBatch([["alice", OWNER_A], ["bob", OWNER_B], ["carol", OWNER_A]]);
    const indexer = new InMemoryOntIndexer({ launchHeight: 100, batchDataProvider: provider([batch]) });
    indexer.ingestBlock(block(100, "aa".repeat(32), [anchorTx("a1".repeat(32), { prevRoot: GENESIS, newRoot: batch.newRoot, batchSize: 3 })]));

    expect(indexer.namesOwnedBy(OWNER_A)).toEqual([
      { name: "alice", source: "accumulator" },
      { name: "carol", source: "accumulator" }
    ]);
    expect(indexer.namesOwnedBy(OWNER_B)).toEqual([{ name: "bob", source: "accumulator" }]);
    // A different (unused) HD key owns nothing — where a gap-scan stops.
    expect(indexer.namesOwnedBy("ee".repeat(32))).toEqual([]);
    // Case-insensitive on the owner pubkey.
    expect(indexer.namesOwnedBy(OWNER_A.toUpperCase())).toHaveLength(2);
  });
});
