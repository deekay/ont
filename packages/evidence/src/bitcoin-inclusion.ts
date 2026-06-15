// D-BI — Bitcoin inclusion-proof construction (B3, FREE; conforms to the cited
// Merkle + PoW inclusion rule). Builds the `bitcoinInclusion` anchor section the
// kernel's `verifyProofBundleAgainstBitcoin` checks: given a block's ordered
// txids + header, compute the Merkle sibling path (display/big-endian hex, as
// esplora `/merkle-proof` returns) and the target's position. The VERIFIER lives
// in @ont/consensus; B3 owns only the BUILDER (non-deciding).
//
// Convention mirrors the verifier (proof-bundle.ts merkleRootFromProof): leaves
// and internal nodes are hashed in INTERNAL (little-endian) byte order; siblings
// are emitted in DISPLAY (big-endian) order. Bitcoin's Merkle rule duplicates the
// last node when a level has an odd count.
import { bytesToHex, concatBytes, hexToBytes, sha256Bytes } from "@ont/protocol";

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

const HEX_64 = /^[0-9a-f]{64}$/;
const HEX_HEADER = /^[0-9a-f]{160}$/;

const dsha = (bytes: Uint8Array): Uint8Array => sha256Bytes(sha256Bytes(bytes));
const reversed = (bytes: Uint8Array): Uint8Array => Uint8Array.from(bytes).reverse();

/** Display (big-endian) txid hex → internal (little-endian) leaf bytes. */
function txidToInternal(displayHex: string): Uint8Array {
  const lower = displayHex.toLowerCase();
  if (!HEX_64.test(lower)) {
    throw new Error(`@ont/evidence: txid must be 32-byte hex, got ${JSON.stringify(displayHex)}`);
  }
  return reversed(hexToBytes(lower));
}

/**
 * Build the inclusion proof for `txid` within its block. The result verifies
 * against the header's Merkle root via the kernel's against-Bitcoin verifier.
 * Throws on misuse: malformed header (not 80 bytes of hex), malformed/duplicate
 * txids, or a target absent from the block.
 */
export function buildBitcoinInclusion(input: BitcoinInclusionInput): BuiltBitcoinInclusion {
  const target = input.txid.toLowerCase();
  if (!HEX_64.test(target)) {
    throw new Error(`@ont/evidence.buildBitcoinInclusion: target txid must be 32-byte hex`);
  }
  if (!HEX_HEADER.test(input.blockHeaderHex.toLowerCase())) {
    throw new Error(`@ont/evidence.buildBitcoinInclusion: blockHeaderHex must be 80 bytes of hex`);
  }
  const ordered = input.orderedBlockTxids.map((t) => t.toLowerCase());
  const pos = ordered.indexOf(target);
  if (pos < 0) {
    throw new Error(`@ont/evidence.buildBitcoinInclusion: target ${target} is not in the block`);
  }
  if (new Set(ordered).size !== ordered.length) {
    throw new Error(`@ont/evidence.buildBitcoinInclusion: duplicate txid in the block`);
  }

  let level = ordered.map(txidToInternal);
  let index = pos;
  const merkle: string[] = [];
  while (level.length > 1) {
    if (level.length % 2 === 1) {
      level.push(level[level.length - 1]!); // Bitcoin: duplicate the last node
    }
    const siblingIndex = index ^ 1;
    merkle.push(bytesToHex(reversed(level[siblingIndex]!))); // emit display order
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(dsha(concatBytes(level[i]!, level[i + 1]!)));
    }
    level = next;
    index >>= 1;
  }

  return {
    txid: target,
    height: input.height,
    blockHeaderHex: input.blockHeaderHex.toLowerCase(),
    merkle,
    pos,
  };
}
