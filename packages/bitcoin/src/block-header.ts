import { sha256 } from "@noble/hashes/sha2";

// Bitcoin block-header primitives. Pure + deterministic — no host I/O. These are the
// shared home for the proof-of-work check the audited @ont/consensus proof verifier
// (proof-bundle.ts) and the B3 light-client header-chain validator both depend on; the
// single source keeps the difficulty-1 / compact-target byte order from drifting between
// callers. A 80-byte Bitcoin header lays out: version[0..4) prevBlock[4..36) (internal LE)
// merkleRoot[36..68) time[68..72) nBits[72..76) (LE) nonce[76..80).

const dsha256 = (bytes: Uint8Array): Uint8Array => sha256(sha256(bytes));
const reversed = (bytes: Uint8Array): Uint8Array => Uint8Array.from(bytes).reverse();

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/** Compact nBits → 256-bit target. */
export function bitsToTarget(bits: number): bigint {
  const exponent = bits >>> 24;
  const mantissa = BigInt(bits & 0x007fffff);
  if (exponent <= 3) {
    return mantissa >> (8n * BigInt(3 - exponent));
  }
  return mantissa << (8n * BigInt(exponent - 3));
}

/** True if doubleSHA256(header) ≤ the target encoded in the header's nBits. */
export function headerMeetsTarget(header: Uint8Array): boolean {
  if (header.length !== 80) {
    return false;
  }
  const bits =
    (header[72] as number) |
    ((header[73] as number) << 8) |
    ((header[74] as number) << 16) |
    ((header[75] as number) << 24);
  const target = bitsToTarget(bits >>> 0);
  // Block hash is little-endian internally; its numeric value is the big-endian
  // reading, i.e. the reversed bytes.
  const hashValue = BigInt("0x" + bytesToHex(reversed(dsha256(header))));
  return target > 0n && hashValue <= target;
}
