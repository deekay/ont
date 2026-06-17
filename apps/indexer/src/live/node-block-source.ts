// G1 sub-slice 3b-4 — node-backed live indexer block source binding (go-live phase).
//
// Composes the slice-3 createLiveIndexerBlockSource seams (getTipHeight /
// anchorsAtHeight) from an injected node-read port (the I/O edge — mockable in tests,
// wired to @ont/bitcoin RPC helpers in 3b-4b). Per height it: reads the block summary
// (txids + per-output OP_RETURN dataHex), PREFILTERS RootAnchor txs from those payloads
// via decodeEvent BEFORE any raw-body fetch, fetches the full legacy body only for
// matched anchors (segwit/witness serialization → parse null → drop), then hands a
// node-txids snapshot to the audited blockToAnchorCandidates. See docs/core/GO_LIVE_PLAN.md.
//
// PURPOSE: turn a node-read port into {getTipHeight, anchorsAtHeight} for the live source.
// SCOPE: prefilter + fetch-anchors-only + one-height headerSource wiring; NO consensus
//   verdicts. TESTS: ./node-block-source.test.ts.
import type { BitcoinBlock } from "@ont/bitcoin";
import type { BuildConfirmedBatchAnchorInput } from "@ont/adapter-indexer";

/** The node read seam (I/O edge). Real impl (3b-4b) wraps @ont/bitcoin RPC helpers. */
export interface NodeBlockReadPort {
  getTipHeight(): Promise<number>; // getblockcount
  getBlock(height: number): Promise<BitcoinBlock>; // getblockhash → getblock v2 summary
  getBlockHeaderHex(blockHash: string): Promise<string>; // getblockheader(hash, false) → 80-byte hex
  getRawTxHex(txid: string): Promise<string>; // getrawtransaction(txid, false) → raw hex
}

export interface NodeBlockSourceDeps {
  getTipHeight(): Promise<number>;
  anchorsAtHeight(height: number): Promise<readonly BuildConfirmedBatchAnchorInput[]>;
}

export function createNodeBlockSourceDeps(_port: NodeBlockReadPort): NodeBlockSourceDeps {
  // RED stub — sub-slice 3b-4 green pending CL red-OK.
  const notImplemented = (): never => {
    throw new Error("createNodeBlockSourceDeps: not implemented (3b-4 green pending)");
  };
  return { getTipHeight: notImplemented, anchorsAtHeight: notImplemented };
}
