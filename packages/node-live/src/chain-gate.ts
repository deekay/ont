// @ont/node-live chain-safety gate (go-live phase, G1 slice 2).
//
// App-runtime policy only. @ont/bitcoin owns the low-level `assertBitcoinRpcChain`
// (the RPC round-trip + chain compare). This module owns the runtime guard around
// it so indexer + publisher cannot drift:
//   - parse an env-like ONT_CHAIN string,
//   - allow ONLY `regtest|signet`,
//   - reject unset/empty/`main`/`mainnet`/`test` (no mainnet-reachable default),
//   - assert the node's chain BEFORE any poll/broadcast wiring is constructed,
//   - return the asserted chain info.
// A mispointed RPC URL therefore cannot become an accidental mainnet write path.
// See docs/core/GO_LIVE_PLAN.md (G1, chain gate).
import {
  assertBitcoinRpcChain,
  type BitcoinRpcBlockchainInfo,
  type BitcoinRpcChain,
  type BitcoinRpcConfig,
} from "@ont/bitcoin";

/** The only chains a live ONT runtime may target until the audit gate clears. */
export type AllowedChain = "regtest" | "signet";

/** The chain-assert seam (injectable for tests); real default = @ont/bitcoin. */
export type ChainAssert = (
  rpc: BitcoinRpcConfig,
  expected: BitcoinRpcChain,
) => Promise<BitcoinRpcBlockchainInfo>;

export function parseAllowedChain(_raw: string | undefined): AllowedChain {
  // RED stub — slice 2 green pending CL red-OK.
  throw new Error("parseAllowedChain: not implemented (slice 2 green pending)");
}

export async function assertExpectedChain(
  _rpc: BitcoinRpcConfig,
  _raw: string | undefined,
  _assertChain: ChainAssert = assertBitcoinRpcChain,
): Promise<BitcoinRpcBlockchainInfo> {
  // RED stub — slice 2 green pending CL red-OK.
  throw new Error("assertExpectedChain: not implemented (slice 2 green pending)");
}
