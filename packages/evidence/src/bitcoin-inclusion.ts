// D-BI — Bitcoin inclusion-proof construction (B3, FREE; conforms to the cited
// Merkle + PoW inclusion rule). Builds the `bitcoinInclusion` anchor section the
// kernel's `verifyProofBundleAgainstBitcoin` checks: given a block's ordered
// txids + header, compute the Merkle sibling path (display/big-endian hex, as
// esplora `/merkle-proof` returns) and the target's position. The VERIFIER lives
// in @ont/consensus; B3 owns only the BUILDER (non-deciding).
//
// Status: STUB — tests-first (B3_EVIDENCE_HARDENING.md §9 / E-BI1, E-BI2). The
// conformance battery in bitcoin-inclusion.test.ts is RED until this is built.

/** The `bitcoinInclusion.anchors[]` element shape the kernel verifier consumes. */
export interface BuiltBitcoinInclusion {
  readonly txid: string;
  readonly height: number;
  readonly blockHeaderHex: string;
  /** Merkle siblings, display/big-endian hex (the verifier reverses each). */
  readonly merkle: readonly string[];
  /** Transaction index within the block (Merkle path direction). */
  readonly pos: number;
}

export interface BitcoinInclusionInput {
  /** Target anchor txid, display/big-endian hex. */
  readonly txid: string;
  readonly height: number;
  /** The 80-byte block header, hex. */
  readonly blockHeaderHex: string;
  /** Every txid in the block, in block order, display/big-endian hex. */
  readonly orderedBlockTxids: readonly string[];
}

/**
 * Build the inclusion proof for `txid` within its block. The result must verify
 * against the header's Merkle root via the kernel's against-Bitcoin verifier.
 * Throws on misuse: malformed header, or a target absent from the block.
 */
export function buildBitcoinInclusion(_input: BitcoinInclusionInput): BuiltBitcoinInclusion {
  throw new Error("@ont/evidence.buildBitcoinInclusion: not implemented (B3 D-BI)");
}
