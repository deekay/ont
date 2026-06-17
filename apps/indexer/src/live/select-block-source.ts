// G1 slice 4b — env-selected indexer block source (go-live entrypoint wiring).
//
// The single seam main.ts uses to choose its block source from the live env:
// resolveNodeRuntime(env) → selectLivePort. Memory is the hermetic default; ONT_SOURCE=node
// runs the chain gate (assertExpectedChain) and only THEN constructs the live node-backed
// source. The live builder is LAZY (passed as a thunk) so the node read port / RPC objects
// are never constructed until the chain gate has passed (CL slice-4 watch). assertChain is
// injectable for tests; production uses the real @ont/bitcoin chain check.
// See docs/core/GO_LIVE_PLAN.md (G1).
//
// PURPOSE: env → the indexer's IndexerBlockSource (memory|node), chain-gated.
// SCOPE: source selection + lazy live wiring only; no consensus verdicts, no persistence.
// TESTS: ./select-block-source.test.ts.
import { resolveNodeRuntime, selectLivePort, type ChainAssert } from "@ont/node-live";
import { createEmptyIndexerBlockSource, type IndexerBlockSource } from "../runner.js";
import { createLiveIndexerBlockSource } from "./block-source.js";
import { createNodeBlockSourceDeps } from "./node-block-source.js";
import { createNodeBlockReadPort } from "./node-block-read-port.js";

export function selectIndexerBlockSource(
  env: Record<string, string | undefined>,
  assertChain?: ChainAssert,
): Promise<IndexerBlockSource> {
  // RED stub — slice 4b green pending CL red-OK.
  void env;
  void assertChain;
  void resolveNodeRuntime;
  void selectLivePort;
  void createEmptyIndexerBlockSource;
  void createLiveIndexerBlockSource;
  void createNodeBlockSourceDeps;
  void createNodeBlockReadPort;
  return Promise.reject(new Error("selectIndexerBlockSource: not implemented (slice 4b green pending)"));
}
