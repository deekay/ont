// G1 sub-slice 3b-2 red battery — parseLegacyTransaction (go-live phase).
// The parser is the exact inverse of the trusted serializeLegacyTransaction, so it is
// tested by round-trip (parse∘serialize === id) across diverse txs, by real-block
// known-answers via serialize/legacyTxidOf (BLOCK 170), and by fail-closed negatives:
// trailing bytes, truncation, segwit marker, bad hex. RED until implemented.
import { describe, expect, it } from "vitest";
import {
  legacyTxidOf,
  parseLegacyTransaction,
  serializeLegacyTransaction,
  type LegacyTransaction,
} from "./legacy-tx.js";

const hexOf = (tx: LegacyTransaction): string => Buffer.from(serializeLegacyTransaction(tx)!).toString("hex");

// Mainnet block 170 payment tx — real consensus bytes + txid (known-answer).
const BLOCK_170_RAW =
  "0100000001c997a5e56e104102fa209c6a852dd90660a20b2d9c352423edce25857fcd3704000000004847304402204e45e16932b8af514961a1d3a1a25fdf3f4f7732e9d624c6c61548ab5fb8cd410220181522ec8eca07de4860a4acdd12909d831cc56cbbac4622082221a8768d1d0901ffffffff0200ca9a3b00000000434104ae1a62fe09c5f51b13905f07f06b99a2f7159b2225f374cd378d71302fa28414e7aab37397f554a7df5f142c21c1b7303b8a0626f1baded5c72a704f7e6cd84cac00286bee0000000043410411db93e1dcdb8a016b49840f8c53bc1eb68a382e97b1482ecad7b148a6909a5cb2e0eaddfb84ccf9744464f82e160bfa9b8b64f9d4c03f999b8643f656b412a3ac00000000";
const BLOCK_170_TXID = "f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16";

const input = (over: Partial<LegacyTransaction["inputs"][number]> = {}) => ({
  prevoutTxid: "ab".repeat(32),
  prevoutVout: 0,
  scriptSigHex: "76a914",
  sequence: 0xffffffff,
  ...over,
});
const output = (over: Partial<LegacyTransaction["outputs"][number]> = {}) => ({
  valueSats: 1000n,
  scriptPubKeyHex: "6a04deadbeef",
  ...over,
});

const FIXTURES: Record<string, LegacyTransaction> = {
  oneInOneOut: { version: 2, inputs: [input()], outputs: [output()], locktime: 0 },
  multi: {
    version: 1,
    inputs: [input({ prevoutTxid: "11".repeat(32), prevoutVout: 3 }), input({ prevoutTxid: "22".repeat(32) })],
    outputs: [output({ valueSats: 0n, scriptPubKeyHex: "" }), output({ valueSats: 5n })],
    locktime: 500000,
  },
  emptyScripts: { version: 2, inputs: [input({ scriptSigHex: "" })], outputs: [output({ scriptPubKeyHex: "" })], locktime: 0 },
  maxValues: {
    version: 0xffffffff,
    inputs: [input({ sequence: 0xffffffff })],
    outputs: [output({ valueSats: 0xffff_ffff_ffff_ffffn })],
    locktime: 0xffffffff,
  },
  // 253-byte scriptPubKey exercises the 0xfd CompactSize boundary.
  compactSizeFd: { version: 2, inputs: [input()], outputs: [output({ scriptPubKeyHex: "ab".repeat(253) })], locktime: 0 },
};

describe("parseLegacyTransaction (G1 3b-2)", () => {
  it("round-trips parse∘serialize === identity across diverse txs", () => {
    for (const [name, tx] of Object.entries(FIXTURES)) {
      expect(parseLegacyTransaction(hexOf(tx)), name).toEqual(tx);
    }
  });

  it("parses real block-170 bytes (serialize/​txid known-answers)", () => {
    const parsed = parseLegacyTransaction(BLOCK_170_RAW);
    expect(parsed).not.toBeNull();
    expect(Buffer.from(serializeLegacyTransaction(parsed!)!).toString("hex")).toBe(BLOCK_170_RAW);
    expect(legacyTxidOf(parsed!)).toBe(BLOCK_170_TXID);
  });

  it("returns prevoutTxid in DISPLAY order (round-trips to the original display hex)", () => {
    const parsed = parseLegacyTransaction(hexOf(FIXTURES.multi!));
    expect(parsed!.inputs[0]!.prevoutTxid).toBe("11".repeat(32));
  });

  it("fails closed on trailing bytes (whole buffer must be consumed)", () => {
    expect(parseLegacyTransaction(BLOCK_170_RAW + "ab")).toBeNull();
  });

  it("fails closed on truncated input", () => {
    expect(parseLegacyTransaction(BLOCK_170_RAW.slice(0, -2))).toBeNull();
    expect(parseLegacyTransaction("0100000001")).toBeNull();
  });

  it("fails closed on a segwit marker (legacy-only parser)", () => {
    // version(4) then 0x00 marker where the input count belongs.
    expect(parseLegacyTransaction("01000000" + "0001" + "01" + "ab".repeat(40))).toBeNull();
  });

  it("fails closed on malformed hex (odd length / non-hex)", () => {
    expect(parseLegacyTransaction("0100000")).toBeNull();
    expect(parseLegacyTransaction("zz000000")).toBeNull();
  });
});
