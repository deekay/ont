// @ont/node-live runtime env reader (go-live phase, slice 4b).
//
// Shared so the indexer and publisher read the live-runtime env identically: ONT_SOURCE
// (memory|node — validation downstream in selectLivePort), ONT_CHAIN (regtest|signet —
// validated in the chain gate), and the Bitcoin RPC config (ONT_RPC_URL/USER/PASSWORD).
// Fail closed early: node mode requires an RPC URL, so selection can't reach the live
// build without one. ONT_SOURCE="" is preserved (NOT coerced to unset) so an empty env
// value fails the selector rather than silently defaulting to memory.
// See docs/core/GO_LIVE_PLAN.md (G1 slice 4).
import type { BitcoinRpcConfig } from "@ont/bitcoin";

export interface NodeRuntimeEnv {
  readonly source: string | undefined;
  readonly chain: string | undefined;
  readonly rpc: BitcoinRpcConfig;
}

export function resolveNodeRuntime(_env: Record<string, string | undefined>): NodeRuntimeEnv {
  // RED stub — slice 4b green pending CL red-OK.
  throw new Error("resolveNodeRuntime: not implemented (slice 4b green pending)");
}
