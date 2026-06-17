import { describe, expect, it } from "vitest";

import type { BitcoinBlock, BitcoinTransaction } from "@ont/bitcoin";
import { bytesToHex } from "@ont/protocol";

import { emptyAccumulatorRoot, encodeRootAnchorPayload, type RootAnchor } from "./index.js";
import { InMemoryOntIndexer } from "./indexer.js";

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
const ROOT_A = "11".repeat(32);
const ROOT_B = "22".repeat(32);
const ROOT_C = "33".repeat(32);

function freshIndexer(): InMemoryOntIndexer {
  return new InMemoryOntIndexer({ launchHeight: 100 });
}

describe("InMemoryOntIndexer root-anchor observation (cheap-rail phase 1)", () => {
  it("starts at the empty-accumulator genesis root with no anchors", () => {
    const indexer = freshIndexer();
    expect(indexer.getConfirmedAccumulatorRoot()).toBe(GENESIS);
    expect(indexer.getAppliedRootAnchorCount()).toBe(0);
    expect(indexer.listRootAnchorObservations()).toHaveLength(0);
  });

  it("extends the confirmed root as valid anchors land in Bitcoin order", () => {
    const indexer = freshIndexer();
    indexer.ingestBlock(block(100, "aa".repeat(32), [anchorTx("a1".repeat(32), { prevRoot: GENESIS, newRoot: ROOT_A, batchSize: 3 })]));
    expect(indexer.getConfirmedAccumulatorRoot()).toBe(ROOT_A);

    indexer.ingestBlock(block(101, "bb".repeat(32), [anchorTx("a2".repeat(32), { prevRoot: ROOT_A, newRoot: ROOT_B, batchSize: 5 })]));
    expect(indexer.getConfirmedAccumulatorRoot()).toBe(ROOT_B);
    expect(indexer.getAppliedRootAnchorCount()).toBe(2);

    const observations = indexer.listRootAnchorObservations();
    expect(observations).toHaveLength(2);
    expect(observations[0]).toMatchObject({ blockHeight: 100, newRoot: ROOT_A, batchSize: 3, status: "applied" });
    expect(observations[1]).toMatchObject({ blockHeight: 101, newRoot: ROOT_B, batchSize: 5, status: "applied" });
  });

  it("rejects an anchor built on a stale tip and leaves the confirmed root unchanged", () => {
    const indexer = freshIndexer();
    indexer.ingestBlock(block(100, "aa".repeat(32), [anchorTx("a1".repeat(32), { prevRoot: GENESIS, newRoot: ROOT_A, batchSize: 1 })]));

    // prevRoot points at GENESIS again — but the confirmed tip is already ROOT_A.
    indexer.ingestBlock(block(101, "bb".repeat(32), [anchorTx("dd".repeat(32), { prevRoot: GENESIS, newRoot: ROOT_C, batchSize: 9 })]));

    expect(indexer.getConfirmedAccumulatorRoot()).toBe(ROOT_A); // unchanged
    expect(indexer.getAppliedRootAnchorCount()).toBe(1);
    const observations = indexer.listRootAnchorObservations();
    expect(observations).toHaveLength(2);
    expect(observations[1]).toMatchObject({ status: "rejected", reason: "stale_or_wrong_prev_root", newRoot: ROOT_C });
  });

  it("ignores non-anchor op_returns and payments", () => {
    const indexer = freshIndexer();
    const noise: BitcoinTransaction = {
      txid: "cc".repeat(32),
      inputs: [{ txid: null, vout: null, coinbase: false }],
      outputs: [
        { valueSats: 50_000n, scriptType: "payment" },
        { valueSats: 0n, scriptType: "op_return", dataHex: "00112233" } // not an ONT anchor
      ]
    };
    indexer.ingestBlock(block(100, "aa".repeat(32), [noise, anchorTx("a1".repeat(32), { prevRoot: GENESIS, newRoot: ROOT_A, batchSize: 2 })]));

    expect(indexer.getConfirmedAccumulatorRoot()).toBe(ROOT_A);
    expect(indexer.listRootAnchorObservations()).toHaveLength(1);
  });

  it("round-trips the confirmed root and observation log through snapshot/restore", () => {
    const original = freshIndexer();
    original.ingestBlock(block(100, "aa".repeat(32), [anchorTx("a1".repeat(32), { prevRoot: GENESIS, newRoot: ROOT_A, batchSize: 4 })]));
    original.ingestBlock(block(101, "bb".repeat(32), [anchorTx("a2".repeat(32), { prevRoot: ROOT_A, newRoot: ROOT_B, batchSize: 6 })]));
    // A rejected anchor too, so we prove rejections survive the round-trip.
    original.ingestBlock(block(102, "cc".repeat(32), [anchorTx("a3".repeat(32), { prevRoot: GENESIS, newRoot: ROOT_C, batchSize: 7 })]));

    const restored = InMemoryOntIndexer.fromSnapshot(original.exportSnapshot());

    expect(restored.getConfirmedAccumulatorRoot()).toBe(original.getConfirmedAccumulatorRoot());
    expect(restored.getConfirmedAccumulatorRoot()).toBe(ROOT_B);
    expect(restored.getAppliedRootAnchorCount()).toBe(2);
    expect(restored.listRootAnchorObservations()).toEqual(original.listRootAnchorObservations());
  });
});
