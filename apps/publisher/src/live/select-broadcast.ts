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
import { sendBitcoinRpcRawTransaction } from "@ont/bitcoin";
import { createInMemoryPublisherBroadcastPort, type PublisherBroadcastPort } from "../server.js";
import { createLivePublisherBroadcastPort } from "./broadcast.js";

export function selectPublisherBroadcastPort(
  env: Record<string, string | undefined>,
  assertChain?: ChainAssert,
): Promise<PublisherBroadcastPort> {
  // RED stub — slice 4b green pending CL red-OK.
  void env;
  void assertChain;
  void resolveNodeRuntime;
  void selectLivePort;
  void sendBitcoinRpcRawTransaction;
  void createInMemoryPublisherBroadcastPort;
  void createLivePublisherBroadcastPort;
  return Promise.reject(new Error("selectPublisherBroadcastPort: not implemented (slice 4b green pending)"));
}
