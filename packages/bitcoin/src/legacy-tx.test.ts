// Legacy tx serialization / txid recompute — golden + fail-closed battery. The golden vector is
// Bitcoin mainnet block 170's payment tx (the first BTC payment, Satoshi → Hal Finney): a real
// transaction with a known, immutable txid. The round-trip (serialize === the known raw bytes) plus
// the txid recompute validate the serializer end-to-end.
import { describe, expect, it } from "vitest";

import {
  legacyTxidOf,
  serializeLegacyTransaction,
  type LegacyTransaction,
} from "./legacy-tx.js";

const bytesToHex = (bytes: Uint8Array): string => {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
};
const reverseHex = (h: string): string => (h.match(/../g) ?? []).reverse().join("");

// Mainnet block 170 payment tx — the canonical raw bytes and its txid.
const BLOCK_170_RAW =
  "0100000001c997a5e56e104102fa209c6a852dd90660a20b2d9c352423edce25857fcd3704000000004847304402204e45e16932b8af514961a1d3a1a25fdf3f4f7732e9d624c6c61548ab5fb8cd410220181522ec8eca07de4860a4acdd12909d831cc56cbbac4622082221a8768d1d0901ffffffff0200ca9a3b00000000434104ae1a62fe09c5f51b13905f07f06b99a2f7159b2225f374cd378d71302fa28414e7aab37397f554a7df5f142c21c1b7303b8a0626f1baded5c72a704f7e6cd84cac00286bee0000000043410411db93e1dcdb8a016b49840f8c53bc1eb68a382e97b1482ecad7b148a6909a5cb2e0eaddfb84ccf9744464f82e160bfa9b8b64f9d4c03f999b8643f656b412a3ac00000000";
const BLOCK_170_TXID = "f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16";

const BLOCK_170_TX: LegacyTransaction = {
  version: 1,
  inputs: [
    {
      // prevoutTxid is DISPLAY hex; the serializer reverses it into wire order.
      prevoutTxid: reverseHex("c997a5e56e104102fa209c6a852dd90660a20b2d9c352423edce25857fcd3704"),
      prevoutVout: 0,
      scriptSigHex:
        "47304402204e45e16932b8af514961a1d3a1a25fdf3f4f7732e9d624c6c61548ab5fb8cd410220181522ec8eca07de4860a4acdd12909d831cc56cbbac4622082221a8768d1d0901",
      sequence: 0xffffffff,
    },
  ],
  outputs: [
    {
      valueSats: 1_000_000_000n, // 10 BTC
      scriptPubKeyHex:
        "4104ae1a62fe09c5f51b13905f07f06b99a2f7159b2225f374cd378d71302fa28414e7aab37397f554a7df5f142c21c1b7303b8a0626f1baded5c72a704f7e6cd84cac",
    },
    {
      valueSats: 4_000_000_000n, // 40 BTC
      scriptPubKeyHex:
        "410411db93e1dcdb8a016b49840f8c53bc1eb68a382e97b1482ecad7b148a6909a5cb2e0eaddfb84ccf9744464f82e160bfa9b8b64f9d4c03f999b8643f656b412a3ac",
    },
  ],
  locktime: 0,
};

describe("legacy tx serialization + txid (golden block-170)", () => {
  it("serializes to the exact consensus byte form", () => {
    expect(bytesToHex(serializeLegacyTransaction(BLOCK_170_TX)!)).toBe(BLOCK_170_RAW);
  });

  it("recomputes the displayed txid = reverse(dsha256(serialize))", () => {
    expect(legacyTxidOf(BLOCK_170_TX)).toBe(BLOCK_170_TXID);
  });

  it("fails closed (null, never throws) on malformed fields", () => {
    const bad = (over: Partial<LegacyTransaction>): LegacyTransaction => ({ ...BLOCK_170_TX, ...over });
    // out-of-range version / locktime
    expect(legacyTxidOf(bad({ version: -1 }))).toBeNull();
    expect(legacyTxidOf(bad({ version: 0x1_0000_0000 }))).toBeNull();
    expect(legacyTxidOf(bad({ locktime: 1.5 }))).toBeNull();
    // malformed input fields
    expect(legacyTxidOf(bad({ inputs: [{ ...BLOCK_170_TX.inputs[0]!, prevoutTxid: "zz".repeat(32) }] }))).toBeNull();
    expect(legacyTxidOf(bad({ inputs: [{ ...BLOCK_170_TX.inputs[0]!, prevoutVout: -1 }] }))).toBeNull();
    expect(legacyTxidOf(bad({ inputs: [{ ...BLOCK_170_TX.inputs[0]!, scriptSigHex: "abc" }] }))).toBeNull(); // odd length
    // malformed output value (> 2^64-1 / negative)
    expect(legacyTxidOf(bad({ outputs: [{ valueSats: -1n, scriptPubKeyHex: "" }] }))).toBeNull();
    expect(legacyTxidOf(bad({ outputs: [{ valueSats: 1n << 64n, scriptPubKeyHex: "" }] }))).toBeNull();
  });
});
