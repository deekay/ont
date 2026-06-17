// G1 sub-slice 3b-3 (reopened) — pre-identified anchors → confirmed-anchor candidates.
//
// Live blocks contain segwit txs (incl. the regtest coinbase) whose witness
// serialization the legacy-only parseLegacyTransaction cannot read — and "compute
// the block's Merkle ordering" is a SEPARATE fact from "parse every tx body". So
// this helper takes the node's ordered txid list (UNTRUSTED — the audited
// buildConfirmedBatchAnchor recomputes the Merkle root against the committed header
// and fails closed on a bad list/pos) plus the already-identified RootAnchor txs
// (full legacy bodies). It self-binds only the tx it mints from:
// legacyTxidOf(anchorTx) === orderedTxids[pos]. The RootAnchor OP_RETURN prefilter
// lives in the RPC binding (3b-4), which has scriptPubKeys without full bodies.
// See docs/core/GO_LIVE_PLAN.md (G1).
//
// PURPOSE: validate + assemble UNTRUSTED BuildConfirmedBatchAnchorInput candidates.
// SCOPE: pos/txid binding, Merkle path, prevout fetch; NO consensus verdicts, NO
//   per-tx body parsing of non-anchors. TESTS: ./block-to-candidates.test.ts.
import {
  legacyTxidOf,
  merkleBranchForIndex,
  type BitcoinHeaderSource,
  type LegacyTransaction,
} from "@ont/bitcoin";
import type { BuildConfirmedBatchAnchorInput } from "@ont/adapter-indexer";

/** A RootAnchor tx the binding already identified (full legacy body) + its block position. */
export interface AnchorCandidateTx {
  readonly anchorTx: LegacyTransaction;
  readonly pos: number;
}

/** A confirmed block as the binding hands it over. `orderedTxids` is the node's tx hash list. */
export interface BlockSnapshot {
  readonly blockHeaderHex: string;
  readonly minedHeight: number;
  readonly orderedTxids: readonly string[];
  readonly anchors: readonly AnchorCandidateTx[];
}

/** Injected prevout fetch (I/O edge): the legacy tx for a display-hex txid, or null. */
export type LegacyTxByTxid = (prevoutTxidDisplayHex: string) => Promise<LegacyTransaction | null>;

export interface BlockToAnchorCandidatesDeps {
  readonly headerSource: BitcoinHeaderSource;
  readonly legacyTxByTxid: LegacyTxByTxid;
}

export async function blockToAnchorCandidates(
  _block: BlockSnapshot,
  _deps: BlockToAnchorCandidatesDeps,
): Promise<readonly BuildConfirmedBatchAnchorInput[]> {
  // RED stub — reopened 3b-3 green pending CL red-OK.
  void legacyTxidOf;
  void merkleBranchForIndex;
  throw new Error("blockToAnchorCandidates: not implemented (3b-3 reopen green pending)");
}
