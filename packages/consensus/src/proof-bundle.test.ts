import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { verifyProofBundle, verifyProofBundleStructure } from "./index.js";

// Only the two current acquisition paths. Ark/RGB explorations were removed from
// the frozen verifier (see docs/core/SIMPLIFICATION_AUDIT.md, Phase 4).
const PROOF_BUNDLE_FIXTURES = [
  "direct-l1-auction-proof.json",
  "accumulator-batch-claim-proof.json"
] as const;

describe("proof bundle structural verifier", () => {
  for (const fixtureFile of PROOF_BUNDLE_FIXTURES) {
    it(`accepts the ${fixtureFile} fixture`, async () => {
      const bundle = await loadProofBundleFixture(fixtureFile);
      const report = verifyProofBundleStructure(bundle);

      expect(report.valid).toBe(true);
      expect(report.failedCheckCount).toBe(0);
      expect(report.passedCheckCount).toBeGreaterThan(0);
    });
  }

  it("verifyProofBundle remains a deprecated alias of verifyProofBundleStructure", async () => {
    const bundle = await loadProofBundleFixture("direct-l1-auction-proof.json");
    expect(verifyProofBundle(bundle)).toEqual(verifyProofBundleStructure(bundle));
  });

  it("rejects an accumulator bundle whose leaf is not bound to the name", async () => {
    const bundle = await loadProofBundleFixture("accumulator-batch-claim-proof.json");
    const accumulatorProof = bundle.accumulatorProof as Record<string, unknown>;
    accumulatorProof.leaf = "00".repeat(32); // not H("alice")

    const report = verifyProofBundleStructure(bundle);

    expect(report.valid).toBe(false);
    expect(report.checks).toContainEqual({
      id: "accumulator.leaf.bindsName",
      status: "failed",
      message: "leaf key equals H(name) — the proof is bound to this name"
    });
  });

  it("rejects a direct L1 bundle whose winner amount does not match the winning bid", async () => {
    const bundle = await loadProofBundleFixture("direct-l1-auction-proof.json");
    const auctionTranscript = bundle.auctionTranscript as Record<string, unknown>;
    const winner = auctionTranscript.winner as Record<string, unknown>;
    winner.winningAmountSats = "71000";

    const report = verifyProofBundleStructure(bundle);

    expect(report.valid).toBe(false);
    expect(report.checks).toContainEqual({
      id: "direct.winner.amountMatchesBid",
      status: "failed",
      message: "winner amount matches the winning bid amount"
    });
  });

  it("rejects value records that do not belong to the current owner key", async () => {
    const bundle = await loadProofBundleFixture("direct-l1-auction-proof.json");
    const valueRecordChain = bundle.valueRecordChain as Record<string, unknown>;
    const records = valueRecordChain.records as Record<string, unknown>[];
    const firstRecord = records[0];
    if (firstRecord === undefined) {
      throw new Error("fixture expected to contain at least one value record");
    }

    firstRecord.ownerPubkey = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const report = verifyProofBundleStructure(bundle);

    expect(report.valid).toBe(false);
    expect(report.checks).toContainEqual({
      id: "valueRecords.0.ownerPubkey",
      status: "failed",
      message: "value record 1 is signed for the current owner pubkey"
    });
  });
});

async function loadProofBundleFixture(fileName: string): Promise<Record<string, unknown>> {
  const fixtureUrl = new URL(`../../../fixtures/proof-bundles/${fileName}`, import.meta.url);
  const raw = await readFile(fixtureUrl, "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}
