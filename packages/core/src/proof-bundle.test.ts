import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { verifyProofBundle } from "./index.js";

const PROOF_BUNDLE_FIXTURES = [
  "direct-l1-auction-proof.json",
  "accumulator-batch-claim-proof.json",
  "ark-auction-transcript-proof.json",
  "ark-sponsored-claim-proof.json",
  "rgb-state-transition-proof.json"
] as const;

describe("proof bundle verifier", () => {
  for (const fixtureFile of PROOF_BUNDLE_FIXTURES) {
    it(`accepts the ${fixtureFile} research fixture`, async () => {
      const bundle = await loadProofBundleFixture(fixtureFile);
      const report = verifyProofBundle(bundle);

      expect(report.valid).toBe(true);
      expect(report.failedCheckCount).toBe(0);
      expect(report.passedCheckCount).toBeGreaterThan(0);
    });
  }

  it("rejects an accumulator bundle whose leaf is not bound to the name", async () => {
    const bundle = await loadProofBundleFixture("accumulator-batch-claim-proof.json");
    const accumulatorProof = bundle.accumulatorProof as Record<string, unknown>;
    accumulatorProof.leaf = "00".repeat(32); // not H("alice")

    const report = verifyProofBundle(bundle);

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

    const report = verifyProofBundle(bundle);

    expect(report.valid).toBe(false);
    expect(report.checks).toContainEqual({
      id: "direct.winner.amountMatchesBid",
      status: "failed",
      message: "winner amount matches the winning bid amount"
    });
  });

  it("rejects value records that do not belong to the current owner key", async () => {
    const bundle = await loadProofBundleFixture("rgb-state-transition-proof.json");
    const valueRecordChain = bundle.valueRecordChain as Record<string, unknown>;
    const records = valueRecordChain.records as Record<string, unknown>[];
    const firstRecord = records[0];
    if (firstRecord === undefined) {
      throw new Error("fixture expected to contain at least one value record");
    }

    firstRecord.ownerPubkey = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const report = verifyProofBundle(bundle);

    expect(report.valid).toBe(false);
    expect(report.checks).toContainEqual({
      id: "valueRecords.0.ownerPubkey",
      status: "failed",
      message: "value record 1 is signed for the current owner pubkey"
    });
  });

  it("rejects sponsored claim bundles that use the old non-transferable policy", async () => {
    const bundle = await loadProofBundleFixture("ark-sponsored-claim-proof.json");
    const ownershipProof = bundle.ownershipProof as Record<string, unknown>;
    ownershipProof.transferPolicy = "mock-nontransferable-until-hardened";

    const report = verifyProofBundle(bundle);

    expect(report.valid).toBe(false);
    expect(report.checks).toContainEqual({
      id: "arkSponsored.transferPolicy.afterFinality",
      status: "failed",
      message: "sponsored names transfer by owner key after finality while preserving assurance tier"
    });
  });
});

async function loadProofBundleFixture(fileName: string): Promise<Record<string, unknown>> {
  const fixtureUrl = new URL(`../../../fixtures/proof-bundles/${fileName}`, import.meta.url);
  const raw = await readFile(fixtureUrl, "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}
