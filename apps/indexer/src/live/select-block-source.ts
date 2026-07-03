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
import type { HeaderRecord } from "@ont/header-store";

export interface IndexerHeaderSource {
  headerAtHeight(height: number): Promise<HeaderRecord>;
}

export interface SelectedIndexerBlockSource {
  readonly blockSource: IndexerBlockSource;
  readonly headerSource?: IndexerHeaderSource;
}

export async function selectIndexerBlockSource(
  env: Record<string, string | undefined>,
  assertChain?: ChainAssert,
): Promise<IndexerBlockSource> {
  return (await selectIndexerBlockSourceWithHeaders(env, assertChain)).blockSource;
}

export async function selectIndexerBlockSourceWithHeaders(
  env: Record<string, string | undefined>,
  assertChain?: ChainAssert,
): Promise<SelectedIndexerBlockSource> {
  // async so a synchronous resolveNodeRuntime throw (e.g. missing ONT_RPC_URL) surfaces as a
  // rejected promise, not a thrown call — callers always await a single failure channel.
  const { source, chain, rpc } = resolveNodeRuntime(env);
  return selectLivePort({
    source,
    chain,
    rpc,
    memory: () => ({ blockSource: createEmptyIndexerBlockSource() }),
    // LAZY: the node read port / RPC objects are only constructed AFTER selectLivePort's
    // chain gate passes (node mode) — never in memory mode, never before the gate.
    live: () => {
      const deps = createNodeBlockSourceDeps(createNodeBlockReadPort(rpc));
      return {
        blockSource: createLiveIndexerBlockSource(deps),
        headerSource: {
          headerAtHeight: async (height: number) => ({ height, headerHex: await deps.headerAtHeight(height) }),
        },
      };
    },
    ...(assertChain === undefined ? {} : { assertChain }),
  });
}
