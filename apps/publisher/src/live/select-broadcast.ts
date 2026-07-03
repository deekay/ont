// G1 slice 4b — env-selected publisher broadcast port (go-live entrypoint wiring).
//
// The single seam index.ts uses to choose its broadcast port from the live env:
// resolveNodeRuntime(env) → selectLivePort. In-memory is the hermetic default; ONT_SOURCE=node
// runs the chain gate (assertExpectedChain) and only THEN constructs the live broadcast port
// (serialize a signed tx → sendrawtransaction). The live builder is LAZY so the RPC submit
// closure is never constructed until the chain gate has passed (CL slice-4 watch). The
// publisher NEVER signs — it serializes the caller's signed tx and submits. assertChain is
// injectable for tests; production uses the real @ont/bitcoin chain check.
// See docs/core/GO_LIVE_PLAN.md (G1).
//
// PURPOSE: env → the publisher's PublisherBroadcastPort (memory|node), chain-gated.
// SCOPE: source selection + lazy live wiring only; no signing, no assembling.
// TESTS: ./select-broadcast.test.ts.
import { resolveNodeRuntime, selectLivePort, type ChainAssert } from "@ont/node-live";
import { sendBitcoinRpcRawTransaction } from "@ont/bitcoin/node";
import { createInMemoryPublisherBroadcastPort, type PublisherBroadcastPort } from "../server.js";
import { createLivePublisherBroadcastPort } from "./broadcast.js";

export async function selectPublisherBroadcastPort(
  env: Record<string, string | undefined>,
  assertChain?: ChainAssert,
): Promise<PublisherBroadcastPort> {
  // async so a synchronous resolveNodeRuntime throw (e.g. missing ONT_RPC_URL) surfaces as a
  // rejected promise, not a thrown call — callers always await a single failure channel.
  const { source, chain, rpc } = resolveNodeRuntime(env);
  return selectLivePort({
    source,
    chain,
    rpc,
    memory: () => createInMemoryPublisherBroadcastPort(),
    // LAZY: the RPC submit closure is only constructed AFTER selectLivePort's chain gate
    // passes (node mode). The publisher NEVER signs — the live port serializes the caller's
    // signed tx and submits it via sendrawtransaction.
    live: () => createLivePublisherBroadcastPort((hex) => sendBitcoinRpcRawTransaction(rpc, hex)),
    ...(assertChain === undefined ? {} : { assertChain }),
  });
}
