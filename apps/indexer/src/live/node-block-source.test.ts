// G1 sub-slice 3b-4 red battery — node-backed block source binding (go-live phase).
// Pins CL's watches over an injected fake node-read port: orderedTxids come from
// tx.txid; RootAnchor prefilter from per-output OP_RETURN dataHex BEFORE any raw-body
// fetch; raw body fetched only for matched anchors; a witness-serialized body parses
// null → anchor dropped; one-height headerSource (null elsewhere); getTipHeight passes
// through; and a full port→binding→authority round-trip. RED until implemented.
import { describe, expect, it } from "vitest";
import {
  legacyTxidOf,
  merkleRootFromProof,
  serializeLegacyTransaction,
  type BitcoinBlock,
  type BitcoinTransaction,
  type LegacyTransaction,
} from "@ont/bitcoin";
import { encodeEvent, EventType } from "@ont/wire";
import { buildConfirmedBatchAnchor } from "@ont/adapter-indexer";
import { createNodeBlockSourceDeps, type NodeBlockReadPort } from "./node-block-source.js";

const h32 = (n: number): string => n.toString(16).padStart(2, "0").repeat(32);
const serHex = (tx: LegacyTransaction): string => Buffer.from(serializeLegacyTransaction(tx)!).toString("hex");

const rootAnchorPayload = (newRoot = h32(0x7a), batchSize = 5): Uint8Array =>
  encodeEvent({ type: EventType.RootAnchor, prevRoot: h32(0xbb), newRoot, batchSize });
const transferPayload = (): Uint8Array =>
  encodeEvent({ type: EventType.Transfer, prevStateTxid: h32(0x11), newOwnerPubkey: h32(0x22), flags: 0, successorBondVout: 0, signature: "cd".repeat(64) });
const payloadHex = (p: Uint8Array): string => Buffer.from(p).toString("hex");
const opReturnScriptFor = (p: Uint8Array): string => "6a" + p.length.toString(16).padStart(2, "0") + payloadHex(p);

const anchorTx = (newRoot = h32(0x7a), batchSize = 5, prevoutTxid = h32(0xa1)): LegacyTransaction => ({
  version: 2,
  inputs: [{ prevoutTxid, prevoutVout: 0, scriptSigHex: "", sequence: 0xffffffff }],
  outputs: [{ valueSats: 0n, scriptPubKeyHex: opReturnScriptFor(rootAnchorPayload(newRoot, batchSize)) }],
  locktime: 0,
});
const prevoutTx: LegacyTransaction = {
  version: 2,
  inputs: [{ prevoutTxid: h32(0xfe), prevoutVout: 0, scriptSigHex: "", sequence: 0xffffffff }],
  outputs: [{ valueSats: 1000n, scriptPubKeyHex: "6a0100" }],
  locktime: 0,
};

const summaryTx = (txid: string, dataHex?: string): BitcoinTransaction => ({
  txid,
  inputs: [{ txid: h32(0xfe), vout: 0, coinbase: false }],
  outputs: dataHex
    ? [{ valueSats: 0n, scriptType: "op_return", dataHex }]
    : [{ valueSats: 1000n, scriptType: "payment", address: "addr" }],
});

const port = (over: Partial<NodeBlockReadPort> = {}): NodeBlockReadPort => ({
  getTipHeight: async () => 100,
  getBlock: async (h) => ({ hash: "bh", height: h, transactions: [] }) as BitcoinBlock,
  getBlockHeaderHex: async () => "00".repeat(80),
  getRawTxHex: async () => serHex(prevoutTx),
  ...over,
});

describe("createNodeBlockSourceDeps (G1 3b-4)", () => {
  it("getTipHeight passes through to the port", async () => {
    const deps = createNodeBlockSourceDeps(port({ getTipHeight: async () => 7 }));
    expect(await deps.getTipHeight()).toBe(7);
  });

  it("prefilters RootAnchor from dataHex and fetches a raw body ONLY for matched anchors", async () => {
    const a = anchorTx();
    const aTxid = legacyTxidOf(a)!;
    const fetched: string[] = [];
    const deps = createNodeBlockSourceDeps(
      port({
        getBlock: async (h) => ({
          hash: "bh",
          height: h,
          transactions: [
            summaryTx(h32(0x01)), // payment — ignored
            summaryTx(h32(0x02), payloadHex(transferPayload())), // Transfer event — ignored
            summaryTx(aTxid, payloadHex(rootAnchorPayload())), // RootAnchor — fetched
          ],
        }) as BitcoinBlock,
        getRawTxHex: async (txid) => {
          fetched.push(txid);
          return txid === aTxid ? serHex(a) : serHex(prevoutTx);
        },
      }),
    );
    const out = await deps.anchorsAtHeight(5);
    expect(out).toHaveLength(1);
    // Anchor body fetched + its one prevout — never the payment/transfer txs.
    expect(fetched).toContain(aTxid);
    expect(fetched).not.toContain(h32(0x01));
    expect(fetched).not.toContain(h32(0x02));
  });

  it("drops an anchor whose raw body is unparseable (e.g. witness serialization)", async () => {
    const a = anchorTx();
    const aTxid = legacyTxidOf(a)!;
    const deps = createNodeBlockSourceDeps(
      port({
        getBlock: async (h) => ({ hash: "bh", height: h, transactions: [summaryTx(aTxid, payloadHex(rootAnchorPayload()))] }) as BitcoinBlock,
        getRawTxHex: async () => "00" + serHex(a), // corrupt/witness-ish → parse null
      }),
    );
    expect(await deps.anchorsAtHeight(5)).toEqual([]);
  });

  it("threads a one-height headerSource (null for every other height)", async () => {
    const a = anchorTx();
    const aTxid = legacyTxidOf(a)!;
    const header = "ab".repeat(80);
    const deps = createNodeBlockSourceDeps(
      port({
        getBlock: async (h) => ({ hash: "bh", height: h, transactions: [summaryTx(aTxid, payloadHex(rootAnchorPayload()))] }) as BitcoinBlock,
        getBlockHeaderHex: async () => header,
        getRawTxHex: async (txid) => (txid === aTxid ? serHex(a) : serHex(prevoutTx)),
      }),
    );
    const c = (await deps.anchorsAtHeight(42))[0]!;
    expect(c.headerSource.headerHexAtHeight(42)).toBe(header);
    expect(c.headerSource.headerHexAtHeight(43)).toBeNull();
    expect(c.headerSource.headerHexAtHeight(41)).toBeNull();
  });

  it("port→binding→authority round-trip: the candidate is ACCEPTED by buildConfirmedBatchAnchor", async () => {
    const a = anchorTx(h32(0x7a), 5);
    const aTxid = legacyTxidOf(a)!;
    const siblingTxid = h32(0x01);
    const minedHeight = 808;
    // anchor at pos 1 ⇒ committed root = merkleRootFromProof(aTxid, [siblingTxid], 1).
    const root = merkleRootFromProof(aTxid, [siblingTxid], 1)!;
    const header = "00".repeat(36) + Buffer.from(root).toString("hex") + "00".repeat(12);
    const deps = createNodeBlockSourceDeps(
      port({
        getBlock: async (h) => ({ hash: "bh", height: h, transactions: [summaryTx(siblingTxid), summaryTx(aTxid, payloadHex(rootAnchorPayload(h32(0x7a), 5)))] }) as BitcoinBlock,
        getBlockHeaderHex: async () => header,
        getRawTxHex: async (txid) => (txid === aTxid ? serHex(a) : serHex(prevoutTx)),
      }),
    );
    const out = await deps.anchorsAtHeight(minedHeight);
    expect(out).toHaveLength(1);
    const verdict = buildConfirmedBatchAnchor(out[0]!);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.confirmedAnchor.minedHeight).toBe(minedHeight);
      expect(verdict.confirmedAnchor.anchoredRoot).toBe(h32(0x7a));
      expect(verdict.confirmedAnchor.batchSize).toBe(5);
    }
  });
});
