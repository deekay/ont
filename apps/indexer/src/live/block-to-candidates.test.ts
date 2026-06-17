// G1 sub-slice 3b-3 red battery — blockToAnchorCandidates (go-live phase).
// Pins: only RootAnchor txs become candidates (no-OP_RETURN + non-RootAnchor events
// ignored); fields (pos/merkle/header/minedHeight/headerSource, anchorVout omitted)
// correct; prevouts fetched in input order; candidate dropped if any prevout is
// missing; whole block dropped if any tx is unserializable; and a WRITE→READ
// round-trip: a real RootAnchor-bearing block yields a candidate that the audited
// buildConfirmedBatchAnchor ACCEPTS. RED until implemented.
import { describe, expect, it } from "vitest";
import { legacyTxidOf, merkleBranchForIndex, type BitcoinHeaderSource, type LegacyTransaction } from "@ont/bitcoin";
import { encodeEvent, EventType } from "@ont/wire";
import { buildConfirmedBatchAnchor } from "@ont/adapter-indexer";
import {
  blockToAnchorCandidates,
  type BlockToAnchorCandidatesDeps,
  type LegacyTxByTxid,
} from "./block-to-candidates.js";

const h32 = (n: number): string => n.toString(16).padStart(2, "0").repeat(32);

const opReturnScript = (payload: Uint8Array): string => {
  const hex = Buffer.from(payload).toString("hex");
  const len = payload.length;
  return len <= 0x4b
    ? "6a" + len.toString(16).padStart(2, "0") + hex
    : "6a4c" + len.toString(16).padStart(2, "0") + hex;
};

const rootAnchorScript = (newRoot = h32(0xaa), batchSize = 3): string =>
  opReturnScript(encodeEvent({ type: EventType.RootAnchor, prevRoot: h32(0xbb), newRoot, batchSize }));

const transferScript = (): string =>
  opReturnScript(
    encodeEvent({
      type: EventType.Transfer,
      prevStateTxid: h32(0x11),
      newOwnerPubkey: h32(0x22),
      flags: 0,
      successorBondVout: 0,
      signature: "cd".repeat(64),
    }),
  );

const txWith = (scriptPubKeyHex: string, prevoutTxids: readonly string[] = [h32(0x11)]): LegacyTransaction => ({
  version: 2,
  inputs: prevoutTxids.map((prevoutTxid) => ({ prevoutTxid, prevoutVout: 0, scriptSigHex: "", sequence: 0xffffffff })),
  outputs: [{ valueSats: 0n, scriptPubKeyHex }],
  locktime: 0,
});

const plainTx = (): LegacyTransaction => txWith("76a914" + "00".repeat(20) + "88ac");
const prevoutTx = (tag: number): LegacyTransaction => txWith("6a01" + tag.toString(16).padStart(2, "0"));

const deps = (over: Partial<BlockToAnchorCandidatesDeps> = {}): BlockToAnchorCandidatesDeps => ({
  headerSource: { headerHexAtHeight: () => null },
  legacyTxByTxid: async () => prevoutTx(0xee),
  ...over,
});

describe("blockToAnchorCandidates (G1 3b-3)", () => {
  it("keeps only RootAnchor txs (no-OP_RETURN and non-RootAnchor events ignored)", async () => {
    const block = {
      blockHeaderHex: "00".repeat(80),
      minedHeight: 100,
      orderedLegacyTxs: [plainTx(), txWith(transferScript()), txWith(rootAnchorScript())],
    };
    const out = await blockToAnchorCandidates(block, deps());
    expect(out).toHaveLength(1);
    expect(out[0]!.anchorTx).toBe(block.orderedLegacyTxs[2]);
  });

  it("maps fields correctly (pos, merkle, header, minedHeight, headerSource; anchorVout omitted)", async () => {
    const headerSource: BitcoinHeaderSource = { headerHexAtHeight: () => "header" };
    const block = {
      blockHeaderHex: "ab".repeat(80),
      minedHeight: 42,
      orderedLegacyTxs: [plainTx(), txWith(rootAnchorScript())],
    };
    const out = await blockToAnchorCandidates(block, deps({ headerSource }));
    const txids = block.orderedLegacyTxs.map((t) => legacyTxidOf(t)!);
    const c = out[0]!;
    expect(c.pos).toBe(1);
    expect(c.merkle).toEqual(merkleBranchForIndex(txids, 1));
    expect(c.blockHeaderHex).toBe("ab".repeat(80));
    expect(c.minedHeight).toBe(42);
    expect(c.headerSource).toBe(headerSource);
    expect(c.anchorVout).toBeUndefined();
  });

  it("fetches prevouts in input order", async () => {
    const seen: string[] = [];
    const legacyTxByTxid: LegacyTxByTxid = async (txid) => {
      seen.push(txid);
      return prevoutTx(0x01);
    };
    const block = {
      blockHeaderHex: "00".repeat(80),
      minedHeight: 1,
      orderedLegacyTxs: [txWith(rootAnchorScript(), [h32(0xa1), h32(0xb2)])],
    };
    const out = await blockToAnchorCandidates(block, deps({ legacyTxByTxid }));
    expect(seen).toEqual([h32(0xa1), h32(0xb2)]);
    expect(out[0]!.prevoutTxs).toHaveLength(2);
  });

  it("drops a candidate when any prevout is missing/unparseable", async () => {
    const legacyTxByTxid: LegacyTxByTxid = async (txid) => (txid === h32(0xb2) ? null : prevoutTx(0x01));
    const block = {
      blockHeaderHex: "00".repeat(80),
      minedHeight: 1,
      orderedLegacyTxs: [txWith(rootAnchorScript(), [h32(0xa1), h32(0xb2)])],
    };
    expect(await blockToAnchorCandidates(block, deps({ legacyTxByTxid }))).toEqual([]);
  });

  it("drops the whole block when any tx is unserializable (txid null)", async () => {
    const block = {
      blockHeaderHex: "00".repeat(80),
      minedHeight: 1,
      orderedLegacyTxs: [{ ...txWith(rootAnchorScript()), version: -1 }, txWith(rootAnchorScript())],
    };
    expect(await blockToAnchorCandidates(block, deps())).toEqual([]);
  });

  it("write→read round-trip: a real RootAnchor block yields a candidate buildConfirmedBatchAnchor ACCEPTS", async () => {
    const anchorTx = txWith(rootAnchorScript(h32(0x7a), 5));
    const minedHeight = 808;
    // 1-tx block ⇒ Merkle root (internal) = reversed(displayTxid); commit it at bytes 36..68.
    const internalRoot = Buffer.from(legacyTxidOf(anchorTx)!, "hex").reverse().toString("hex");
    const header = "00".repeat(36) + internalRoot + "00".repeat(12);
    const headerSource: BitcoinHeaderSource = { headerHexAtHeight: (hgt) => (hgt === minedHeight ? header : null) };

    const out = await blockToAnchorCandidates(
      { blockHeaderHex: header, minedHeight, orderedLegacyTxs: [anchorTx] },
      deps({ headerSource }),
    );
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
