import { describe, expect, it } from "vitest";
import * as secp256k1 from "tiny-secp256k1";

import {
  signTransferAuthorization,
  verifyTransferAuthorization
} from "@ont/protocol";

import {
  type AnchoredDelta,
  type NodeView,
  accumulatorKeyForName,
  classifyName,
  createDefaultDaWindows,
  runBatchRail,
  verifyAccumulatorProof
} from "./index.js";

const WINDOWS = createDefaultDaWindows();
const NOTICE_WINDOW_BLOCKS = 6;

function node(nodeId = "A"): NodeView {
  return { nodeId, localDataReceiptHeight: new Map() };
}

function delta(
  id: string,
  anchorHeight: number,
  anchorTxIndex: number,
  insertions: Array<{ readonly name: string; readonly owner: string }>
): AnchoredDelta {
  return {
    id,
    publisher: id,
    anchorHeight,
    anchorTxIndex,
    anchorTxid: id.padEnd(64, "0").slice(0, 64),
    markerHeight: anchorHeight,
    networkServableFromHeight: anchorHeight,
    insertions: insertions.map((insertion) => ({
      name: insertion.name,
      valueHash: insertion.owner
    }))
  };
}

function ownerPubkey(privateKeyHex: string): string {
  const pubkey = secp256k1.xOnlyPointFromScalar(Buffer.from(privateKeyHex, "hex"));
  if (pubkey === null) {
    throw new Error("test private key did not produce a public key");
  }
  return Buffer.from(pubkey).toString("hex");
}

describe("current acquisition state machine", () => {
  it("keeps a public claim provisional during the notice window", () => {
    const claim = delta("a", 10, 0, [{ name: "Alice", owner: "11".repeat(32) }]);

    const result = classifyName({
      name: "alice",
      node: node(),
      deltas: [claim],
      windows: WINDOWS,
      now: 15,
      rule: "proposed",
      noticeWindowBlocks: NOTICE_WINDOW_BLOCKS
    });

    expect(result).toMatchObject({
      status: "provisional",
      name: "alice",
      owner: "11".repeat(32),
      claimDeltaId: "a",
      claimHeight: 10,
      windowCloseHeight: 16
    });
  });

  it("finalizes an uncontested claim into the accumulator with a membership proof", () => {
    const claim = delta("a", 10, 0, [{ name: "alice", owner: "11".repeat(32) }]);

    const result = runBatchRail({
      node: node(),
      deltas: [claim],
      windows: WINDOWS,
      now: 30,
      rule: "proposed",
      noticeWindowBlocks: NOTICE_WINDOW_BLOCKS
    });

    expect(result.ownerByName.get("alice")).toBe("11".repeat(32));
    expect(result.escalatedNames).toHaveLength(0);

    const proof = result.accumulator.proveMembership(accumulatorKeyForName("alice"));
    expect(proof.value).toBe("11".repeat(32));
    expect(verifyAccumulatorProof(result.confirmedRoot, proof)).toBe(true);
  });

  it("escalates an in-window contest to auction and keeps the name out of the accumulator", () => {
    const first = delta("a", 10, 0, [{ name: "alice", owner: "11".repeat(32) }]);
    const second = delta("b", 12, 0, [{ name: "alice", owner: "22".repeat(32) }]);

    const result = runBatchRail({
      node: node(),
      deltas: [first, second],
      windows: WINDOWS,
      now: 30,
      rule: "proposed",
      noticeWindowBlocks: NOTICE_WINDOW_BLOCKS
    });

    expect(result.ownerByName.has("alice")).toBe(false);
    expect(result.escalatedNames).toEqual([
      { name: "alice", contestingDeltaIds: ["a", "b"] }
    ]);

    const proof = result.accumulator.proveNonMembership(accumulatorKeyForName("alice"));
    expect(proof.value).toBeNull();
    expect(verifyAccumulatorProof(result.confirmedRoot, proof)).toBe(true);
  });

  it("treats a post-window claim as already-owned instead of reopening contest", () => {
    const first = delta("a", 10, 0, [{ name: "alice", owner: "11".repeat(32) }]);
    const late = delta("b", 24, 0, [{ name: "alice", owner: "22".repeat(32) }]);

    const result = runBatchRail({
      node: node(),
      deltas: [first, late],
      windows: WINDOWS,
      now: 40,
      rule: "proposed",
      noticeWindowBlocks: NOTICE_WINDOW_BLOCKS
    });

    expect(result.ownerByName.get("alice")).toBe("11".repeat(32));
    expect(result.includedDeltaIds).toEqual(["a"]);
    expect(result.escalatedNames).toHaveLength(0);
  });

  it("leaves final names controlled by owner-key authorization", () => {
    const ownerPrivateKeyHex = "07".repeat(32);
    const currentOwnerPubkey = ownerPubkey(ownerPrivateKeyHex);
    const nextOwnerPubkey = "55".repeat(32);
    const fields = {
      prevStateTxid: "44".repeat(32),
      newOwnerPubkey: nextOwnerPubkey,
      flags: 0,
      successorBondVout: 0
    };

    const signature = signTransferAuthorization({ ...fields, ownerPrivateKeyHex });

    expect(verifyTransferAuthorization({
      ...fields,
      ownerPubkey: currentOwnerPubkey,
      signature
    })).toBe(true);
    expect(verifyTransferAuthorization({
      ...fields,
      ownerPubkey: "66".repeat(32),
      signature
    })).toBe(false);
  });
});
