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

/** Prefilter: does any output carry an OP_RETURN that decodes to a RootAnchor? (Authority re-decides.) */
function txHasRootAnchor(tx: LegacyTransaction): boolean {
  for (const output of tx.outputs) {
    const data = opReturnData(output.scriptPubKeyHex);
    if (data === null) continue;
    try {
      if (decodeEvent(data).type === EventType.RootAnchor) return true;
    } catch {
      // not a decodable event — ignore (the authority would reject it anyway)
    }
  }
  return false;
}

export async function blockToAnchorCandidates(
  block: BlockSnapshot,
  deps: BlockToAnchorCandidatesDeps,
): Promise<readonly BuildConfirmedBatchAnchorInput[]> {
  const { blockHeaderHex, minedHeight, orderedLegacyTxs } = block;

  // Cheap block-wide txid derivation FIRST — any unserializable tx ⇒ drop the whole block
  // (no Merkle path is sound), before touching the prevout I/O.
  const txids: string[] = [];
  for (const tx of orderedLegacyTxs) {
    const txid = legacyTxidOf(tx);
    if (txid === null) return [];
    txids.push(txid);
  }

  const candidates: BuildConfirmedBatchAnchorInput[] = [];
  for (let pos = 0; pos < orderedLegacyTxs.length; pos += 1) {
    const anchorTx = orderedLegacyTxs[pos]!;
    if (!txHasRootAnchor(anchorTx)) continue; // prefilter BEFORE any prevout fetch
    const merkle = merkleBranchForIndex(txids, pos);
    if (merkle === null) continue; // fail closed (unreachable given valid txids, but never mint without a path)

    // Fetch prevouts in input order; drop the candidate if any is missing/unparseable.
    const prevoutTxs: LegacyTransaction[] = [];
    let dropped = false;
    for (const input of anchorTx.inputs) {
      const prevout = await deps.legacyTxByTxid(input.prevoutTxid);
      if (prevout === null) {
        dropped = true;
        break;
      }
      prevoutTxs.push(prevout);
    }
    if (dropped) continue;

    candidates.push({
      anchorTx,
      prevoutTxs,
      blockHeaderHex,
      minedHeight,
      merkle,
      pos,
      headerSource: deps.headerSource,
    });
  }
  return candidates;
}
