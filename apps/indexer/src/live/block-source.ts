// G1 live indexer block source (go-live phase, RootAnchor claim path, slice 3).
//
// The polling/cursor orchestration over the node, with the two I/O seams injected:
// the confirmed tip height, and per-height RootAnchor candidate extraction. It is
// STATELESS w.r.t. height — each call polls from the DURABLE cursor (the argument),
// never from internal poller state, so a restart or a re-run with the same cursor
// re-polls the same range and stale state can never override the durable cursor
// (CL slice-3 watch). It never polls backwards.
//
// Real wiring (later sub-slice): getTipHeight -> getBitcoinRpcBlockCount, and
// anchorsAtHeight -> loadBitcoinBlocksFromRpc + RootAnchor (0x0b) extraction.
// See docs/core/GO_LIVE_PLAN.md (G1).
//
// PURPOSE: turn a durable cursor into the next confirmed-anchor batch from the node.
// SCOPE: tip-vs-cursor polling + ordering only; block->candidate extraction and the
//   RPC primitives are injected. TESTS: ./block-source.test.ts (red battery).
import type { BuildConfirmedBatchAnchorInput } from "@ont/adapter-indexer";
import type { ConfirmedAnchorBatch, IndexerBlockSource, IndexerCursor } from "../runner.js";

export interface LiveBlockSourceDeps {
  /** Current confirmed tip height from the node (real: getBitcoinRpcBlockCount). */
  getTipHeight(): Promise<number>;
  /** Confirmed RootAnchor candidates mined at exactly `height` (block -> candidate). */
  anchorsAtHeight(height: number): Promise<readonly BuildConfirmedBatchAnchorInput[]>;
}

export function createLiveIndexerBlockSource(deps: LiveBlockSourceDeps): IndexerBlockSource {
  return {
    async nextConfirmedAnchors(cursor: IndexerCursor): Promise<ConfirmedAnchorBatch> {
      // Drive polling from the DURABLE cursor argument only — no long-lived poller
      // whose internal nextHeight could compete with it (CL slice-3 watch).
      const tip = await deps.getTipHeight();
      // Never poll backwards; an empty/regressed tip leaves the durable cursor as-is.
      if (tip <= cursor.height) {
        return { candidates: [], cursor };
      }
      const candidates: BuildConfirmedBatchAnchorInput[] = [];
      for (let height = cursor.height + 1; height <= tip; height += 1) {
        candidates.push(...(await deps.anchorsAtHeight(height)));
      }
      return { candidates, cursor: { height: tip } };
    },
  };
}
