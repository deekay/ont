// G1 sub-slice 3b-4c — the real node read port factory (closes 3b live ingest).
//
// Wires the NodeBlockReadPort (consumed by createNodeBlockSourceDeps) to the live
// @ont/bitcoin RPC helpers. Thin glue + the one pure guard requireSingleBlockAtHeight.
// Chain-AGNOSTIC by design: the @ont/node-live chain gate (assertExpectedChain) belongs
// in the env-selected wiring slice (slice 4), before this port is ever polled.
// See docs/core/GO_LIVE_PLAN.md (G1).
//
// PURPOSE: BitcoinRpcConfig → a live NodeBlockReadPort.
// SCOPE: RPC wiring + single-block-at-height guard; NO consensus verdicts, NO chain gate.
// TESTS: ./node-block-read-port.test.ts (pure guard; factory smoke via mocked fetch).
import {
  getBitcoinRpcBlockCount,
  getBitcoinRpcBlockHeaderHex,
  getBitcoinRpcRawTransactionHex,
  loadBitcoinBlocksFromRpc,
  type BitcoinBlock,
  type BitcoinRpcConfig,
} from "@ont/bitcoin";
import type { NodeBlockReadPort } from "./node-block-source.js";

/** Require exactly one block at the requested height — else fail closed (no Merkle ordering is sound). */
export function requireSingleBlockAtHeight(_blocks: readonly BitcoinBlock[], _height: number): BitcoinBlock {
  // RED stub — sub-slice 3b-4c green pending CL red-OK.
  throw new Error("requireSingleBlockAtHeight: not implemented (3b-4c green pending)");
}

export function createNodeBlockReadPort(rpc: BitcoinRpcConfig): NodeBlockReadPort {
  return {
    getTipHeight: () => getBitcoinRpcBlockCount(rpc),
    getBlock: async (height) =>
      requireSingleBlockAtHeight(
        await loadBitcoinBlocksFromRpc({ rpc, startHeight: height, endHeight: height }),
        height,
      ),
    getBlockHeaderHex: (blockHash) => getBitcoinRpcBlockHeaderHex(rpc, blockHash),
    getRawTxHex: (txid) => getBitcoinRpcRawTransactionHex(rpc, txid),
  };
}
