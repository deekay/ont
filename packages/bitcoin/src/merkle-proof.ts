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

/**
 * Recompute the Merkle root (INTERNAL byte order) from a display-hex txid + display-hex sibling path
 * and the tx's position in the block. Returns null on any malformed input — bad-hex / wrong-length
 * txid or sibling, AND a `pos` that is not a non-negative integer (an empty path must NOT silently
 * ignore a malformed `pos`, else a 1-tx block with `pos=-1` could falsely accept).
 *
 * STUB (B4-INDEX-ANCHOR, tests-first): returns null so the byte-order red battery fails until implemented.
 */
export function merkleRootFromProof(
  _txidDisplayHex: string,
  _siblingsDisplayHex: readonly string[],
  _pos: number,
): Uint8Array | null {
  return null;
}

/**
 * The block header's committed Merkle root as INTERNAL-order hex (bytes 36..68 of the 80-byte header),
 * for comparison against `bytesToHex(merkleRootFromProof(...))`. Null on a malformed header.
 *
 * STUB (B4-INDEX-ANCHOR, tests-first).
 */
export function merkleRootHexFromHeaderHex(_headerHex: string): string | null {
  return null;
}
