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
} from "@ont/bitcoin/node";

/** The only chains a live ONT runtime may target until the audit gate clears. */
export type AllowedChain = "regtest" | "signet";

/** The chain-assert seam (injectable for tests); real default = @ont/bitcoin. */
export type ChainAssert = (
  rpc: BitcoinRpcConfig,
  expected: BitcoinRpcChain,
) => Promise<BitcoinRpcBlockchainInfo>;

export function parseAllowedChain(raw: string | undefined): AllowedChain {
  // Exact value only — no trim, no case-fold, no default. Anything but the two
  // live chains (including unset/empty/main/mainnet/test and whitespace-padded
  // variants) is rejected so a stray ONT_CHAIN can never resolve toward mainnet.
  if (raw === "regtest" || raw === "signet") return raw;
  throw new Error(
    `ONT_CHAIN must be exactly "regtest" or "signet" (no mainnet-reachable default); got ${
      raw === undefined ? "(unset)" : JSON.stringify(raw)
    }`,
  );
}

export async function assertExpectedChain(
  rpc: BitcoinRpcConfig,
  raw: string | undefined,
  assertChain: ChainAssert = assertBitcoinRpcChain,
): Promise<BitcoinRpcBlockchainInfo> {
  // Parse FIRST — throws before any RPC if ONT_CHAIN is rejected, so a mispointed
  // URL never gets contacted. Only then assert the node actually is that chain.
  const expected = parseAllowedChain(raw);
  return assertChain(rpc, expected);
}
