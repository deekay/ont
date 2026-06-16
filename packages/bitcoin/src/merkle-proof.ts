import { sha256 } from "@noble/hashes/sha2";

// B4-INDEX-ANCHOR (B4_ADAPTERS_PLAN §9.4): the Merkle-inclusion recompute, promoted to a shared
// @ont/bitcoin primitive so the consensus-critical byte order has a SINGLE source. A candidate
// RootAnchor tx is bound to a block by recomputing the Merkle root from its txid + sibling path and
// comparing to the header's committed root (bytes 36..68). Display (big-endian) hex in; internal
// (little-endian) bytes out — the txid + each sibling are reversed display→internal, paired by the
// position bit, double-SHA256 per level. This mirrors the verifier in @ont/consensus proof-bundle.ts
// EXACTLY; at green that private helper repoints here (behavior-preserving, the @ont/consensus suite
// is the regression gate — the headerMeetsTarget / legacyTxidOf relocation precedent, I-SPV §7).
//
// Total + fail-closed: a malformed txid / sibling / header (bad hex, wrong length) returns null; the
// caller fails closed. Never throws.

const HEX = /^[0-9a-fA-F]*$/;

function hexToBytesOrNull(hex: unknown): Uint8Array | null {
  if (typeof hex !== "string" || hex.length % 2 !== 0 || !HEX.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function reversed(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) out[i] = bytes[bytes.length - 1 - i] as number;
  return out;
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

function doubleSha256(bytes: Uint8Array): Uint8Array {
  return sha256(sha256(bytes));
}

/**
 * Recompute the Merkle root (INTERNAL byte order) from a display-hex txid + display-hex sibling path
 * and the tx's position in the block. Returns null on any malformed input — bad-hex / wrong-length
 * txid or sibling, AND a `pos` that is not a non-negative integer (an empty path must NOT silently
 * ignore a malformed `pos`, else a 1-tx block with `pos=-1` could falsely accept).
 */
export function merkleRootFromProof(
  txidDisplayHex: string,
  siblingsDisplayHex: readonly string[],
  pos: number,
): Uint8Array | null {
  if (!Number.isInteger(pos) || pos < 0) return null;
  const txid = hexToBytesOrNull(txidDisplayHex);
  if (txid === null || txid.length !== 32) return null;
  let acc = reversed(txid); // display → internal order
  let index = pos;
  for (const siblingHex of siblingsDisplayHex) {
    const siblingBytes = hexToBytesOrNull(siblingHex);
    if (siblingBytes === null || siblingBytes.length !== 32) return null;
    const sibling = reversed(siblingBytes);
    acc = (index & 1) === 1 ? doubleSha256(concatBytes(sibling, acc)) : doubleSha256(concatBytes(acc, sibling));
    index >>= 1;
  }
  return acc;
}

/**
 * The block header's committed Merkle root as INTERNAL-order hex (bytes 36..68 of the 80-byte header),
 * for comparison against `bytesToHex(merkleRootFromProof(...))`. Null on a malformed header.
 */
export function merkleRootHexFromHeaderHex(headerHex: string): string | null {
  const header = hexToBytesOrNull(headerHex);
  if (header === null || header.length !== 80) return null;
  return bytesToHex(header.slice(36, 68));
}
