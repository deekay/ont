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
import {
  parseLegacyTransaction,
  type BitcoinBlock,
  type BitcoinHeaderSource,
  type BitcoinTransaction,
  type LegacyTransaction,
} from "@ont/bitcoin";
import { decodeEvent, EventType } from "@ont/wire";
import type { BuildConfirmedBatchAnchorInput } from "@ont/adapter-indexer";
import { blockToAnchorCandidates, type AnchorCandidateTx } from "./block-to-candidates.js";

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

/** Does this output's OP_RETURN payload decode to a RootAnchor? Catch is LOCAL to the output —
 *  arbitrary OP_RETURN noise (decodeEvent throws) just skips this output, never the tx or the height. */
function outputIsRootAnchor(dataHex: string): boolean {
  try {
    return decodeEvent(Buffer.from(dataHex, "hex")).type === EventType.RootAnchor;
  } catch {
    return false;
  }
}

function txHasRootAnchor(tx: BitcoinTransaction): boolean {
  return tx.outputs.some((o) => o.scriptType === "op_return" && o.dataHex !== undefined && outputIsRootAnchor(o.dataHex));
}

export function createNodeBlockSourceDeps(port: NodeBlockReadPort): NodeBlockSourceDeps {
  return {
    getTipHeight: () => port.getTipHeight(),
    async anchorsAtHeight(height: number): Promise<readonly BuildConfirmedBatchAnchorInput[]> {
      const block = await port.getBlock(height);
      const headerHex = await port.getBlockHeaderHex(block.hash);
      const orderedTxids = block.transactions.map((tx) => tx.txid);

      // Prefilter RootAnchor txs from per-output OP_RETURN payloads — BEFORE any raw-body fetch.
      const matched: { readonly txid: string; readonly pos: number }[] = [];
      block.transactions.forEach((tx, pos) => {
        if (txHasRootAnchor(tx)) matched.push({ txid: tx.txid, pos });
      });

      // Fetch the full legacy body only for matched anchors; an unparseable (e.g. witness) body drops it.
      const anchors: AnchorCandidateTx[] = [];
      for (const { txid, pos } of matched) {
        const anchorTx = parseLegacyTransaction(await port.getRawTxHex(txid));
        if (anchorTx !== null) anchors.push({ anchorTx, pos });
      }

      const headerSource: BitcoinHeaderSource = { headerHexAtHeight: (h) => (h === height ? headerHex : null) };
      const legacyTxByTxid = async (txid: string): Promise<LegacyTransaction | null> =>
        parseLegacyTransaction(await port.getRawTxHex(txid));

      return blockToAnchorCandidates(
        { blockHeaderHex: headerHex, minedHeight: height, orderedTxids, anchors },
        { headerSource, legacyTxByTxid },
      );
    },
  };
}
