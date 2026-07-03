// @ont/node-live env-selected port wiring (go-live phase, slice 4).
//
// The single source of truth for the memory|node selection both the indexer and the
// publisher need at startup: `memory` (the hermetic default) unless ONT_SOURCE=node is
// explicitly selected. In node mode it runs the chain gate (assertExpectedChain →
// ONT_CHAIN must be regtest|signet AND the node must actually be that chain) BEFORE the
// live port is constructed — so a mispointed RPC can never reach mainnet and no live
// poll/broadcast RPC happens until the chain is proven. See docs/core/GO_LIVE_PLAN.md.
import type { BitcoinRpcConfig } from "@ont/bitcoin/node";
import { assertExpectedChain, type ChainAssert } from "./chain-gate.js";

export interface SelectLivePortOptions<T> {
  /** ONT_SOURCE: undefined/"memory" → memory (hermetic default); "node" → live; else throws. */
  readonly source: string | undefined;
  /** ONT_CHAIN (node mode only): must be regtest|signet. */
  readonly chain: string | undefined;
  readonly rpc: BitcoinRpcConfig;
  /** Build the in-memory port (hermetic default). */
  readonly memory: () => T;
  /** Build the live port — only constructed AFTER the chain gate passes. */
  readonly live: () => T;
  /** Injectable chain-assert seam for tests; default = the real @ont/bitcoin RPC chain check. */
  readonly assertChain?: ChainAssert;
}

export async function selectLivePort<T>(opts: SelectLivePortOptions<T>): Promise<T> {
  const source = opts.source ?? "memory"; // unset → hermetic default; "" and case variants are NOT memory
  if (source === "memory") {
    return opts.memory();
  }
  if (source === "node") {
    // Parse-first chain gate: ONT_CHAIN must be regtest|signet (else throws before any RPC), then the
    // node must actually be that chain. Only after this awaited gate succeeds do we build the live port.
    await assertExpectedChain(opts.rpc, opts.chain, opts.assertChain);
    return opts.live();
  }
  throw new Error(`ONT_SOURCE must be memory|node, got ${JSON.stringify(opts.source)}`);
}
