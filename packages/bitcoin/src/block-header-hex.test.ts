// G1 sub-slice 3b-4b red battery — assertBlockHeaderHex (go-live phase).
// The live binding feeds a block header hex to the audited buildConfirmedBatchAnchor, which reads
// bytes 36..68 as the committed Merkle root — a wrong-length/garbage header must fail closed at the
// RPC edge, not silently produce a bad root. Pins: exactly 80 bytes = 160 lowercase hex; reject wrong
// length, non-hex, uppercase, and non-strings. Negatives assert the specific reason so the
// not-implemented stub cannot spuriously satisfy them. RED until implemented.
import { describe, expect, it } from "vitest";
import { assertBlockHeaderHex } from "./index.js";

const valid = "00".repeat(36) + "ab".repeat(32) + "00".repeat(12); // 80 bytes, lowercase

describe("assertBlockHeaderHex (G1 3b-4b)", () => {
  it("accepts and returns an 80-byte (160-hex) lowercase header unchanged", () => {
    expect(assertBlockHeaderHex(valid)).toBe(valid);
  });

  it("rejects wrong-length hex with a header reason", () => {
    for (const bad of ["", "ab", "00".repeat(79), "00".repeat(81), valid + "00"]) {
      expect(() => assertBlockHeaderHex(bad)).toThrow(/header|160|80/);
    }
  });

  it("rejects non-hex and uppercase hex", () => {
    expect(() => assertBlockHeaderHex("zz".repeat(80))).toThrow(/header|hex/);
    expect(() => assertBlockHeaderHex("AB".repeat(80))).toThrow(/header|hex|lowercase/); // 160 chars but uppercase
  });

  it("rejects non-string inputs", () => {
    for (const bad of [undefined, null, 80, {}, []]) {
      expect(() => assertBlockHeaderHex(bad)).toThrow(/header|hex|string/);
    }
  });
});
