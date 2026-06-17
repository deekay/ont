// G1 sub-slice 3b-3 (reopened) red battery — blockToAnchorCandidates (node-txids shape).
// Live blocks contain segwit txs (incl. regtest coinbase) the legacy parser can't read,
// so the helper takes the node's orderedTxids (UNTRUSTED, firewall-verified) + pre-
// identified anchors rather than re-deriving all bodies. Pins: field map; segwit/non-
// anchor txids in the list don't poison a valid legacy candidate; txid mismatch drops
// BEFORE prevout fetch; out-of-range pos drops; a bad ordered-txid list drops; missing
// prevout drops; prevout input order; write→read acceptance through the audited firewall.
import { describe, expect, it } from "vitest";
import {
  legacyTxidOf,
  merkleBranchForIndex,
  merkleRootFromProof,
  type BitcoinHeaderSource,
  type LegacyTransaction,
} from "@ont/bitcoin";
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
  return len <= 0x4b ? "6a" + len.toString(16).padStart(2, "0") + hex : "6a4c" + len.toString(16).padStart(2, "0") + hex;
};
const rootAnchorScript = (newRoot = h32(0xaa), batchSize = 3): string =>
  opReturnScript(encodeEvent({ type: EventType.RootAnchor, prevRoot: h32(0xbb), newRoot, batchSize }));

const anchorTxWith = (prevoutTxids: readonly string[] = [h32(0x11)], newRoot = h32(0xaa), batchSize = 3): LegacyTransaction => ({
  version: 2,
  inputs: prevoutTxids.map((prevoutTxid) => ({ prevoutTxid, prevoutVout: 0, scriptSigHex: "", sequence: 0xffffffff })),
  outputs: [{ valueSats: 0n, scriptPubKeyHex: rootAnchorScript(newRoot, batchSize) }],
  locktime: 0,
});
const prevoutTx = (tag: number): LegacyTransaction => ({
  version: 2,
  inputs: [{ prevoutTxid: h32(0xfe), prevoutVout: 0, scriptSigHex: "", sequence: 0xffffffff }],
  outputs: [{ valueSats: 1000n, scriptPubKeyHex: "6a01" + tag.toString(16).padStart(2, "0") }],
  locktime: 0,
});

const deps = (over: Partial<BlockToAnchorCandidatesDeps> = {}): BlockToAnchorCandidatesDeps => ({
  headerSource: { headerHexAtHeight: () => null },
  legacyTxByTxid: async () => prevoutTx(0xee),
  ...over,
});

describe("blockToAnchorCandidates (G1 3b-3, node-txids)", () => {
  it("maps fields correctly from node orderedTxids + a pre-identified anchor", async () => {
    const anchorTx = anchorTxWith();
    const txid = legacyTxidOf(anchorTx)!;
    const headerSource: BitcoinHeaderSource = { headerHexAtHeight: () => "header" };
    const orderedTxids = [h32(0x01), txid, h32(0x02)];
    const out = await blockToAnchorCandidates(
      { blockHeaderHex: "ab".repeat(80), minedHeight: 42, orderedTxids, anchors: [{ anchorTx, pos: 1 }] },
      deps({ headerSource }),
    );
    const c = out[0]!;
    expect(c.anchorTx).toBe(anchorTx);
    expect(c.pos).toBe(1);
    expect(c.merkle).toEqual(merkleBranchForIndex(orderedTxids, 1));
    expect(c.blockHeaderHex).toBe("ab".repeat(80));
    expect(c.minedHeight).toBe(42);
    expect(c.headerSource).toBe(headerSource);
    expect(c.anchorVout).toBeUndefined();
  });

  it("segwit / non-anchor txids in the list (never parsed) don't poison a valid candidate", async () => {
    const anchorTx = anchorTxWith();
    const txid = legacyTxidOf(anchorTx)!;
    // Other entries stand in for segwit txs we never parse — just valid txid strings.
    const orderedTxids = [h32(0xc0), h32(0xc1), txid, h32(0xc2), h32(0xc3)];
    const out = await blockToAnchorCandidates(
      { blockHeaderHex: "00".repeat(80), minedHeight: 7, orderedTxids, anchors: [{ anchorTx, pos: 2 }] },
      deps(),
    );
    expect(out).toHaveLength(1);
  });

  it("drops (before any prevout fetch) when legacyTxidOf(anchorTx) != orderedTxids[pos]", async () => {
    const anchorTx = anchorTxWith();
    let fetched = false;
    const legacyTxByTxid: LegacyTxByTxid = async () => {
      fetched = true;
      return prevoutTx(0x01);
    };
    const out = await blockToAnchorCandidates(
      { blockHeaderHex: "00".repeat(80), minedHeight: 1, orderedTxids: [h32(0xde)], anchors: [{ anchorTx, pos: 0 }] },
      deps({ legacyTxByTxid }),
    );
    expect(out).toEqual([]);
    expect(fetched).toBe(false);
  });

  it("drops on out-of-range or non-integer pos", async () => {
    const anchorTx = anchorTxWith();
    const txid = legacyTxidOf(anchorTx)!;
    const base = { blockHeaderHex: "00".repeat(80), minedHeight: 1, orderedTxids: [txid] };
    expect(await blockToAnchorCandidates({ ...base, anchors: [{ anchorTx, pos: 1 }] }, deps())).toEqual([]);
    expect(await blockToAnchorCandidates({ ...base, anchors: [{ anchorTx, pos: -1 }] }, deps())).toEqual([]);
    expect(await blockToAnchorCandidates({ ...base, anchors: [{ anchorTx, pos: 0.5 }] }, deps())).toEqual([]);
  });

  it("drops a malformed ordered txid list (non-64-hex entry) BEFORE any prevout fetch", async () => {
    const anchorTx = anchorTxWith();
    const txid = legacyTxidOf(anchorTx)!;
    let fetched = false;
    const legacyTxByTxid: LegacyTxByTxid = async () => {
      fetched = true;
      return prevoutTx(0x01);
    };
    const out = await blockToAnchorCandidates(
      { blockHeaderHex: "00".repeat(80), minedHeight: 1, orderedTxids: ["zz", txid], anchors: [{ anchorTx, pos: 1 }] },
      deps({ legacyTxByTxid }),
    );
    expect(out).toEqual([]);
    expect(fetched).toBe(false);
  });

  it("fetches prevouts in input order and drops on any missing prevout", async () => {
    const anchorTx = anchorTxWith([h32(0xa1), h32(0xb2)]);
    const txid = legacyTxidOf(anchorTx)!;
    const seen: string[] = [];
    const ok: LegacyTxByTxid = async (t) => {
      seen.push(t);
      return prevoutTx(0x01);
    };
    const out = await blockToAnchorCandidates(
      { blockHeaderHex: "00".repeat(80), minedHeight: 1, orderedTxids: [txid], anchors: [{ anchorTx, pos: 0 }] },
      deps({ legacyTxByTxid: ok }),
    );
    expect(seen).toEqual([h32(0xa1), h32(0xb2)]);
    expect(out[0]!.prevoutTxs).toHaveLength(2);

    const miss: LegacyTxByTxid = async (t) => (t === h32(0xb2) ? null : prevoutTx(0x01));
    const dropped = await blockToAnchorCandidates(
      { blockHeaderHex: "00".repeat(80), minedHeight: 1, orderedTxids: [txid], anchors: [{ anchorTx, pos: 0 }] },
      deps({ legacyTxByTxid: miss }),
    );
    expect(dropped).toEqual([]);
  });

  it("write→read round-trip (multi-tx, non-empty branch): candidate ACCEPTED by buildConfirmedBatchAnchor", async () => {
    const anchorTx = anchorTxWith([h32(0x11)], h32(0x7a), 5);
    const txid = legacyTxidOf(anchorTx)!;
    const siblingTxid = h32(0x99); // a non-anchor (e.g. segwit) tx we never parse — just its txid
    const orderedTxids = [txid, siblingTxid];
    const minedHeight = 808;
    // 2-tx block ⇒ committed root = merkleRootFromProof(anchorTxid, [siblingTxid], 0).
    const root = merkleRootFromProof(txid, [siblingTxid], 0)!;
    const header = "00".repeat(36) + Buffer.from(root).toString("hex") + "00".repeat(12);
    const headerSource: BitcoinHeaderSource = { headerHexAtHeight: (hgt) => (hgt === minedHeight ? header : null) };

    const out = await blockToAnchorCandidates(
      { blockHeaderHex: header, minedHeight, orderedTxids, anchors: [{ anchorTx, pos: 0 }] },
      deps({ headerSource }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.merkle).toEqual([siblingTxid]); // non-empty branch
    const verdict = buildConfirmedBatchAnchor(out[0]!);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.confirmedAnchor.anchoredRoot).toBe(h32(0x7a));
      expect(verdict.confirmedAnchor.batchSize).toBe(5);
    }
  });
});
