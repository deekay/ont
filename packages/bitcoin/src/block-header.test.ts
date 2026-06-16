import { describe, expect, it } from "vitest";
import { sha256 } from "@noble/hashes/sha2";
import { bitsToTarget, headerMeetsTarget } from "./block-header.js";

// Byte-order pin for the proof-of-work primitives relocated out of the audited
// @ont/consensus proof verifier (I-SPV §7, B3_INTEGRATION_PLAN.md). Bitcoin mainnet
// block 170 (the first BTC payment) is the known-good vector: a difficulty-1 header whose
// hash, target, and PoW verdict are public constants, so any drift in nBits-LE decode,
// compact-target expansion, or hash byte order trips here.

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

const BLOCK_170_HEADER_HEX =
  "0100000055bd840a78798ad0da853f68974f3d183e2bd1db6a842c1feecf222a00000000ff104ccb05421ab93e63f8c3ce5c2c2e9dbb37de2764b3a3175c8166562cac7d51b96a49ffff001d283e9e70";
const BLOCK_170_HASH_DISPLAY =
  "00000000d1145790a8694403d4063f323d499e655c83426834d4ce2f8dd4a2ee";
// Difficulty-1 compact bits 0x1d00ffff → 0xffff << (8 * (0x1d - 3)) = 0xffff << 208.
const DIFF_1_BITS = 0x1d00ffff;
const DIFF_1_TARGET = 0xffffn << 208n;

describe("block-header primitives — block-170 byte-order pin", () => {
  const header = hexToBytes(BLOCK_170_HEADER_HEX);

  it("bitsToTarget expands difficulty-1 compact bits to the canonical target", () => {
    expect(bitsToTarget(DIFF_1_BITS)).toBe(DIFF_1_TARGET);
  });

  it("decodes the header's nBits (bytes 72-75 LE) as difficulty-1", () => {
    const bits =
      header[72]! |
      (header[73]! << 8) |
      (header[74]! << 16) |
      (header[75]! << 24);
    expect(bits >>> 0).toBe(DIFF_1_BITS);
  });

  it("the block hash is reverse(dsha256(header)) = the public block-170 hash", () => {
    const internal = sha256(sha256(header));
    const display = bytesToHex(Uint8Array.from(internal).reverse());
    expect(display).toBe(BLOCK_170_HASH_DISPLAY);
  });

  it("headerMeetsTarget accepts the real block-170 header", () => {
    expect(headerMeetsTarget(header)).toBe(true);
  });

  it("headerMeetsTarget rejects a non-80-byte input (fail-closed)", () => {
    expect(headerMeetsTarget(header.subarray(0, 79))).toBe(false);
    expect(headerMeetsTarget(new Uint8Array(0))).toBe(false);
  });

  it("headerMeetsTarget rejects a header whose hash exceeds its target", () => {
    // Bump the nonce (bytes 76-80) away from the mined value: the hash no longer
    // meets the difficulty-1 target.
    const forged = Uint8Array.from(header);
    forged[76] = forged[76]! ^ 0xff;
    forged[77] = forged[77]! ^  0xff;
    expect(headerMeetsTarget(forged)).toBe(false);
  });
});
