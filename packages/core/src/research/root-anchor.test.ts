import { describe, expect, it } from "vitest";

import type { BitcoinBlock, BitcoinTransaction } from "@ont/bitcoin";
import { bytesToHex } from "@ont/protocol";

import {
  Accumulator,
  ROOT_ANCHOR_EVENT_TYPE,
  type RootAnchor,
  RootChain,
  accumulatorKeyForName,
  decodeRootAnchorPayload,
  emptyAccumulatorRoot,
  encodeRootAnchorPayload,
  extractRootAnchors,
  measureAnchorTxVsize,
  measureRootAnchorVsize
} from "../index.js";

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

const ROOT_A = "11".repeat(32);
const ROOT_B = "22".repeat(32);
const ROOT_C = "33".repeat(32);

function buildAccumulatorWith(count: number, offset = 0): Accumulator {
  const acc = new Accumulator();
  for (let i = offset; i < offset + count; i += 1) {
    acc.insert(accumulatorKeyForName(`name${i}`), accumulatorKeyForName(`val${i}`));
  }
  return acc;
}

describe("anchored root chain (signet prototype C2)", () => {
  it("encodes and decodes the anchor payload round-trip", () => {
    const anchor = { prevRoot: ROOT_A, newRoot: ROOT_B, batchSize: 10_000 };
    const payload = encodeRootAnchorPayload(anchor);

    // magic(3) + version(1) + type(1) + prev(32) + new(32) + batch(4) = 73 bytes, within the 80-byte OP_RETURN limit.
    expect(payload.length).toBe(73);
    expect(payload.length).toBeLessThanOrEqual(80);
    expect(payload[4]).toBe(ROOT_ANCHOR_EVENT_TYPE);
    expect(decodeRootAnchorPayload(payload)).toEqual({ prevRoot: ROOT_A, newRoot: ROOT_B, batchSize: 10_000 });
  });

  it("rejects malformed payloads", () => {
    expect(() => decodeRootAnchorPayload(new Uint8Array(72))).toThrow(/73 bytes/);
    const good = encodeRootAnchorPayload({ prevRoot: ROOT_A, newRoot: ROOT_B, batchSize: 1 });
    const wrongMagic = good.slice();
    wrongMagic[0] = 0x00;
    expect(() => decodeRootAnchorPayload(wrongMagic)).toThrow(/magic/);
    const wrongType = good.slice();
    wrongType[4] = 0x03; // a Transfer, not an anchor
    expect(() => decodeRootAnchorPayload(wrongType)).toThrow(/not a root anchor/);
  });

  it("advances the tip across a valid chain of anchors", () => {
    const chain = new RootChain(ROOT_A);
    expect(chain.currentTip()).toBe(ROOT_A);

    expect(chain.apply({ prevRoot: ROOT_A, newRoot: ROOT_B, batchSize: 5 }).status).toBe("applied");
    expect(chain.currentTip()).toBe(ROOT_B);
    expect(chain.apply({ prevRoot: ROOT_B, newRoot: ROOT_C, batchSize: 5 }).status).toBe("applied");
    expect(chain.currentTip()).toBe(ROOT_C);
    expect(chain.anchorCount()).toBe(2);
  });

  it("rejects an anchor built on a stale or forged parent, leaving the tip unchanged", () => {
    const chain = new RootChain(ROOT_A);
    chain.apply({ prevRoot: ROOT_A, newRoot: ROOT_B, batchSize: 5 });

    // An anchor that still references the old tip (ROOT_A) is rejected once the tip moved to ROOT_B.
    const stale = chain.apply({ prevRoot: ROOT_A, newRoot: ROOT_C, batchSize: 5 });
    expect(stale.status).toBe("rejected");
    expect(stale.reason).toBe("stale_or_wrong_prev_root");
    expect(chain.currentTip()).toBe(ROOT_B); // unchanged

    // No-op and malformed transitions are also rejected.
    expect(chain.apply({ prevRoot: ROOT_B, newRoot: ROOT_B, batchSize: 5 }).reason).toBe("no_op_transition");
    expect(chain.apply({ prevRoot: ROOT_B, newRoot: "zz", batchSize: 5 }).reason).toBe("malformed_root");
  });

  it("anchors real accumulator roots and rejects a fork off the genesis tip", () => {
    const genesis = emptyAccumulatorRoot();
    const acc = buildAccumulatorWith(100);
    const root1 = acc.root();
    for (let i = 100; i < 200; i += 1) {
      acc.insert(accumulatorKeyForName(`name${i}`), accumulatorKeyForName(`val${i}`));
    }
    const root2 = acc.root();
    expect(root1).not.toBe(root2);

    const chain = new RootChain(genesis);
    expect(chain.apply({ prevRoot: genesis, newRoot: root1, batchSize: 100 }).status).toBe("applied");
    expect(chain.apply({ prevRoot: root1, newRoot: root2, batchSize: 100 }).status).toBe("applied");

    // A forged anchor that ignores the advanced tip (rebuilds off genesis) is rejected.
    expect(chain.apply({ prevRoot: genesis, newRoot: ROOT_C, batchSize: 1 }).status).toBe("rejected");
    expect(chain.currentTip()).toBe(root2);
  });

  it("reads anchors back out of Bitcoin blocks and advances the tip (indexer path)", () => {
    const genesis = emptyAccumulatorRoot();
    const chain = new RootChain(genesis);

    // A block with assorted outputs: a payment-only tx, an anchor tx, and a non-anchor op_return.
    const noise: BitcoinTransaction = {
      txid: "de".repeat(32),
      inputs: [{ txid: null, vout: null, coinbase: true }],
      outputs: [
        { valueSats: 50_000n, scriptType: "payment" },
        { valueSats: 0n, scriptType: "op_return", dataHex: "00112233" } // not an ONT anchor
      ]
    };
    expect(extractRootAnchors(noise)).toHaveLength(0);

    const anchor1 = { prevRoot: genesis, newRoot: ROOT_A, batchSize: 100 };
    const applied = chain.applyBlock(block(101, "aa".repeat(32), [noise, anchorTx("a1".repeat(32), anchor1)]));
    expect(applied).toHaveLength(1);
    expect(applied[0]?.result.status).toBe("applied");
    expect(chain.currentTip()).toBe(ROOT_A);

    // Next block carries the following anchor; the tip advances again.
    chain.applyBlock(block(102, "bb".repeat(32), [anchorTx("a2".repeat(32), { prevRoot: ROOT_A, newRoot: ROOT_B, batchSize: 50 })]));
    expect(chain.currentTip()).toBe(ROOT_B);
  });

  it("rejects a stale anchor found in a block, leaving the tip unchanged", () => {
    const chain = new RootChain(ROOT_A);
    chain.applyBlock(block(200, "cc".repeat(32), [anchorTx("b1".repeat(32), { prevRoot: ROOT_A, newRoot: ROOT_B, batchSize: 1 })]));
    expect(chain.currentTip()).toBe(ROOT_B);

    // A later block re-anchors off the stale ROOT_A tip — rejected on read-back.
    const out = chain.applyBlock(block(201, "dd".repeat(32), [anchorTx("b2".repeat(32), { prevRoot: ROOT_A, newRoot: ROOT_C, batchSize: 1 })]));
    expect(out[0]?.result.status).toBe("rejected");
    expect(out[0]?.result.reason).toBe("stale_or_wrong_prev_root");
    expect(chain.currentTip()).toBe(ROOT_B);
  });

  it("measures the real anchor transaction vByte footprint (R11)", () => {
    // Explicit parent link (prev+new root, 73-byte payload).
    const withParentLink = measureRootAnchorVsize({ prevRoot: ROOT_A, newRoot: ROOT_B, batchSize: 10_000 });
    // Leaner variant: newRoot only (41-byte payload) — parent is implicit in the validator's tip.
    const newRootOnly = measureAnchorTxVsize(new Uint8Array(41));

    expect(withParentLink).toBeGreaterThan(90);
    expect(withParentLink).toBeLessThan(220);
    expect(newRootOnly).toBeLessThan(withParentLink);

    // eslint-disable-next-line no-console
    console.log(
      "\nAnchor tx footprint (R11) — 1 P2WPKH in, OP_RETURN anchor, P2WPKH change:" +
        `\n  explicit parent link (prev+new): ${withParentLink} vB  -> ${(withParentLink / 10_000).toFixed(5)} vB/name @ 10k` +
        `\n  newRoot only (implicit parent):  ${newRootOnly} vB  -> ${(newRootOnly / 10_000).toFixed(5)} vB/name @ 10k` +
        `\n  FINDING: both exceed the one-pager's 150 vB assumption (OP_RETURN root data is non-witness,` +
        `\n  counted at full weight). Per-name cost stays tiny, but the anchor estimate was optimistic.\n`
    );
  });
});
