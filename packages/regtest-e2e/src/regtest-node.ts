// G1 slice 6a — throwaway bitcoind -regtest control helper (go-live e2e harness).
//
// Spins a disposable regtest node for the end-to-end harness: an ephemeral -datadir (NEVER the user's
// default Bitcoin dir), -txindex=1 (the live indexer reads getrawtransaction(txid,false) bodies), random
// RPC/P2P ports (parallel-safe), and rpcuser/rpcpassword auth wired into a BitcoinRpcConfig the live
// publisher/indexer consume. stop() shuts the node down and removes the ephemeral datadir. cli() is a thin
// JSON-RPC call against the same node for harness wallet/mining ops. NOT a shipped surface; env-gated
// (ONT_E2E_REGTEST=1) so the hermetic suite needs no node. See docs/core/GO_LIVE_PLAN.md (G1 slice 6).
//
// PURPOSE: a disposable regtest node + its BitcoinRpcConfig, started clean and torn down clean.
// SCOPE: process lifecycle + RPC plumbing only; no ONT rules. TESTS: ./regtest-node.test.ts (env-gated).
import type { BitcoinRpcConfig } from "@ont/bitcoin";

export interface RegtestNode {
  /** RPC config for the throwaway node — feeds the live publisher/indexer + cli(). */
  readonly rpc: BitcoinRpcConfig;
  /** The ephemeral datadir (removed by stop()). */
  readonly datadir: string;
  /** Thin JSON-RPC call against this node (harness wallet/mining ops). Throws on RPC error. */
  cli(method: string, params?: readonly unknown[]): Promise<unknown>;
  /** Shut the node down and remove its ephemeral datadir. Idempotent. */
  stop(): Promise<void>;
}

export interface RegtestNodeOptions {
  readonly rpcUser?: string;
  readonly rpcPassword?: string;
}

export async function createRegtestNode(opts?: RegtestNodeOptions): Promise<RegtestNode> {
  // RED stub — slice 6a green pending CL red-OK.
  void opts;
  throw new Error("createRegtestNode: not implemented (slice 6a green pending)");
}
