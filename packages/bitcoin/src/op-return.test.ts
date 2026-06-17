// G1 sub-slice 3b-2.5 red battery — opReturnData (promoted to @ont/bitcoin).
// Pins CL's exact contract: accept only OP_RETURN <direct push 0x01..0x4b> or
// OP_RETURN OP_PUSHDATA1 <len> with the script consumed exactly; return raw payload
// bytes; reject malformed hex, non-OP_RETURN, OP_0, OP_PUSHDATA2/4, opcode forms,
// trailing bytes, and multi-push. RED until implemented; the adapter-indexer suite
// is the green regression gate for the inclusion.ts repoint.
import { describe, expect, it } from "vitest";
import { opReturnData } from "./op-return.js";

const payloadHex = (script: string): string | null => {
  const out = opReturnData(script);
  return out === null ? null : Buffer.from(out).toString("hex");
};

describe("opReturnData (G1 3b-2.5)", () => {
  it("accepts OP_RETURN + direct push, returning the exact payload bytes", () => {
    expect(payloadHex("6a03aabbcc")).toBe("aabbcc");
    expect(payloadHex("6a" + "4b" + "ab".repeat(75))).toBe("ab".repeat(75)); // 0x4b boundary
    expect(payloadHex("6a0100")).toBe("00"); // 1-byte push of 0x00
  });

  it("accepts OP_RETURN + OP_PUSHDATA1 (0x4c), incl. the 255-byte boundary", () => {
    expect(payloadHex("6a4c05aabbccddee")).toBe("aabbccddee");
    expect(payloadHex("6a4cff" + "cd".repeat(255))).toBe("cd".repeat(255));
  });

  it("accepts case-insensitive hex", () => {
    expect(payloadHex("6A03AABBCC")).toBe("aabbcc");
  });

  it("rejects trailing bytes / wrong declared length (must consume the script exactly)", () => {
    expect(payloadHex("6a03aabb")).toBeNull(); // len 3 but only 2 data bytes
    expect(payloadHex("6a02aabbcc")).toBeNull(); // len 2 but 3 data bytes (trailing)
  });

  it("rejects multi-push scripts (not first-push-wins)", () => {
    expect(payloadHex("6a01aa01bb")).toBeNull();
  });

  it("rejects non-OP_RETURN scripts", () => {
    expect(payloadHex("76a91400000000000000000000000000000000000000000088ac")).toBeNull();
  });

  it("rejects OP_0, OP_PUSHDATA2/4, and opcode push forms", () => {
    expect(payloadHex("6a00")).toBeNull(); // OP_0
    expect(payloadHex("6a4d0200aabb")).toBeNull(); // OP_PUSHDATA2
    expect(payloadHex("6a4e04000000aabbccdd")).toBeNull(); // OP_PUSHDATA4
    expect(payloadHex("6a51")).toBeNull(); // OP_1 opcode form
  });

  it("fails closed on too-short scripts and a PUSHDATA1 missing its length byte", () => {
    expect(payloadHex("")).toBeNull();
    expect(payloadHex("6a")).toBeNull();
    expect(payloadHex("6a4c")).toBeNull(); // OP_PUSHDATA1 with no length byte
  });

  it("fails closed on malformed hex (odd length / non-hex)", () => {
    expect(payloadHex("6a03aabbc")).toBeNull(); // odd length
    expect(payloadHex("6a03zzzzzz")).toBeNull(); // non-hex
  });
});
