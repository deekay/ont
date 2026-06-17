// @ont/node-live runtime env reader (go-live phase, slice 4b).
//
// Shared so the indexer and publisher read the live-runtime env identically: ONT_SOURCE
// (memory|node — validation downstream in selectLivePort), ONT_CHAIN (regtest|signet —
// validated in the chain gate), and the Bitcoin RPC config (ONT_RPC_URL/USER/PASSWORD).
// Fail closed early: node mode requires an RPC URL, so selection can't reach the live
// build without one. ONT_SOURCE="" is preserved (NOT coerced to unset) so an empty env
// value fails the selector rather than silently defaulting to memory.
// See docs/core/GO_LIVE_PLAN.md (G1 slice 4).
import { createBitcoinRpcConfig, type BitcoinRpcConfig } from "@ont/bitcoin";

export interface NodeRuntimeEnv {
  readonly source: string | undefined;
  readonly chain: string | undefined;
  readonly rpc: BitcoinRpcConfig;
}

export function resolveNodeRuntime(env: Record<string, string | undefined>): NodeRuntimeEnv {
  // Preserve exact env values — no trim/case-fold. Validation lives downstream:
  // ONT_SOURCE in selectLivePort, ONT_CHAIN in the chain gate.
  const source = env.ONT_SOURCE;
  const chain = env.ONT_CHAIN;
  const url = env.ONT_RPC_URL;

  if (source === "node") {
    // Fail closed early: a present, non-empty URL is required so selection can't reach the
    // live build without one (the set-but-blank env footgun fails here, not at deploy time).
    if (url === undefined || url.length === 0) {
      throw new Error("ONT_SOURCE=node requires ONT_RPC_URL");
    }
    // Single-sources the empty-url + password-requires-username invariants.
    const rpc = createBitcoinRpcConfig(url, env.ONT_RPC_USER, env.ONT_RPC_PASSWORD);
    return { source, chain, rpc };
  }

  // Memory/unset/any other source: a dummy rpc the selector never touches.
  return { source, chain, rpc: { url: url ?? "" } };
}
