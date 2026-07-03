import { describe, expect, it } from "vitest";
import { decodeHeaderRecord, encodeHeaderRecord } from "./header-record-codec.js";

const HEADER_A = "00".repeat(80);

describe("header record codec", () => {
  it("round-trips a strict header record", () => {
    const record = { height: 311_446, headerHex: HEADER_A };
    expect(decodeHeaderRecord(encodeHeaderRecord(record))).toEqual(record);
  });

  it("rejects malformed height and non-80-byte/non-lowercase headers", () => {
    expect(() => encodeHeaderRecord({ height: -1, headerHex: HEADER_A })).toThrow(/height/i);
    expect(() => encodeHeaderRecord({ height: 1, headerHex: "aa" })).toThrow(/headerHex/i);
    expect(() => encodeHeaderRecord({ height: 1, headerHex: "AA".repeat(80) })).toThrow(/headerHex/i);
  });

  it("rejects missing or extra fields on decode", () => {
    expect(() => decodeHeaderRecord({ height: 1 })).toThrow(/expected exactly/i);
    expect(() => decodeHeaderRecord({ height: 1, headerHex: HEADER_A, extra: true })).toThrow(/expected exactly/i);
  });
});
