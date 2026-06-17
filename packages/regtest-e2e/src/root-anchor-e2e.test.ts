// Slice 6b red battery — RootAnchor claim-path end-to-end (the G1 milestone).
// ENV-GATED (ONT_E2E_REGTEST=1): runs only with a local bitcoind; otherwise skipped so the hermetic suite
// needs no node. Pins the e2e contract: a funded+signed RootAnchor, broadcast through the LIVE publisher,
// ingested through the LIVE indexer, read back by txid, bridged to the web snapshot, and rendered at
// /tx/:txid surfaces the confirmed facts (txid, mined height, newRoot, batchSize). Structural asserts only
// (no block hash, no exact HTML layout). RED until runRootAnchorE2e is implemented (stub throws).
import { describe, expect, it } from "vitest";
import { runRootAnchorE2e } from "./root-anchor-e2e.js";

const RUN = process.env.ONT_E2E_REGTEST === "1";
const d = RUN ? describe : describe.skip;

d("runRootAnchorE2e (G1 slice 6b — RootAnchor claim path end-to-end)", () => {
  it("funds+signs+broadcasts a RootAnchor, ingests it live, and renders the confirmed facts", async () => {
    const r = await runRootAnchorE2e();
    // the anchor was broadcast + confirmed
    expect(r.anchorTxid).toMatch(/^[0-9a-f]{64}$/);
    expect(r.minedHeight).toBeGreaterThan(0);
    // the exact RootAnchor we anchored
    expect(r.newRoot).toBe("7a".repeat(32));
    expect(r.batchSize).toBe(5);
    // the rendered /tx/:txid surfaces the confirmed RootAnchor facts (structural, not layout)
    expect(r.renderedHtml).toContain(r.anchorTxid);
    expect(r.renderedHtml).toContain(String(r.minedHeight));
    expect(r.renderedHtml).toContain(r.newRoot);
    expect(r.renderedHtml).toContain(String(r.batchSize));
  }, 120_000);
});
