// G1 slice 6b — RootAnchor claim-path end-to-end (go-live e2e harness).
//
// The full live round-trip on a throwaway regtest node: fund + sign a RootAnchor anchor tx with bitcoind's
// own wallet (LEGACY addresses, so the signed raw is legacy-serializable), broadcast it through the LIVE
// publisher port (ONT_SOURCE=node, chain-gated), mine it, ingest it through the LIVE indexer block source,
// read it back by txid, bridge to the web snapshot, and render /tx/:txid. Asserts the confirmed RootAnchor
// facts (txid, mined height, newRoot, batchSize) surface in the rendered HTML. The publisher NEVER signs;
// the parseLegacyTransaction guard fails closed on any witness/segwit-funded raw BEFORE broadcast (CL pin).
// Env-gated (ONT_E2E_REGTEST=1). See docs/core/GO_LIVE_PLAN.md (G1 slice 6).
//
// PURPOSE: prove ingest→resolve→render end-to-end against a real node.
// SCOPE: RootAnchor claim path only (value/recovery render is B3-deferred). TESTS: ./root-anchor-e2e.test.ts.

export interface RootAnchorE2eResult {
  readonly renderedHtml: string;
  readonly anchorTxid: string;
  readonly minedHeight: number;
  readonly newRoot: string;
  readonly batchSize: number;
}

export async function runRootAnchorE2e(): Promise<RootAnchorE2eResult> {
  // RED stub — slice 6b green pending CL red-OK.
  throw new Error("runRootAnchorE2e: not implemented (slice 6b green pending)");
}
