// G1 sub-slice 3b-3 — block → confirmed-anchor candidate extraction (go-live phase).
//
// The pure (modulo the injected async prevout fetch) bridge from a confirmed block
// snapshot to the UNTRUSTED BuildConfirmedBatchAnchorInput candidates the audited
// buildConfirmedBatchAnchor firewall consumes. decodeEvent is used ONLY to prefilter
// which txs carry a RootAnchor OP_RETURN; the firewall re-decodes/recomputes as the
// authority (we omit anchorVout so its exactly-one-RootAnchor rule decides). See
// docs/core/GO_LIVE_PLAN.md (G1) and B4_ADAPTERS_PLAN §9.4.
//
// PURPOSE: confirmed block → RootAnchor candidate inputs (recompute-don't-trust).
// SCOPE: prefilter + field assembly (txids via legacyTxidOf, merkle via
//   merkleBranchForIndex, prevouts via injected legacyTxByTxid); NO consensus
//   verdicts. TESTS: ./block-to-candidates.test.ts.
import {
  legacyTxidOf,
  merkleBranchForIndex,
  opReturnData,
  type BitcoinHeaderSource,
  type LegacyTransaction,
} from "@ont/bitcoin";
import { decodeEvent, EventType } from "@ont/wire";
import type { BuildConfirmedBatchAnchorInput } from "@ont/adapter-indexer";

/** A confirmed block as the binding hands it over: header hex, height, txs in block order. */
export interface BlockSnapshot {
  readonly blockHeaderHex: string;
  readonly minedHeight: number;
  readonly orderedLegacyTxs: readonly LegacyTransaction[];
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
  // RED stub — sub-slice 3b-3 green pending CL red-OK.
  void legacyTxidOf;
  void merkleBranchForIndex;
  void opReturnData;
  void decodeEvent;
  void EventType;
  throw new Error("blockToAnchorCandidates: not implemented (3b-3 green pending)");
}
