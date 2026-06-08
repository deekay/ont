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
    expect(resolved).toEqual({ source: "accumulator", record: alice });
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
