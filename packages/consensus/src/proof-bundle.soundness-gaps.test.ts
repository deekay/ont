// Soundness tests for the portable proof-bundle verifier — born from the
// 2026-06-09 adversarial e2e campaign (docs/research/archive/ONT_ADVERSARIAL_FINDINGS_2026_06_09.md).
//
// PB1/PB2/PB3 (the accumulator membership-soundness gaps) are now CLOSED: the
// verifier recomputes the sparse-Merkle root from (leaf, value, siblings) using
// the shared @ont/protocol fold and binds the value commitment to the claimed
// owner. These tests assert the verifier now REJECTS each tampering and would
// regress loudly if the checks were removed.
//
// PB5 (value-record chain: trust declared recordHash + skip signature checks)
// remains open and is kept as an `it.fails` reproduction below.
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { verifyProofBundleStructure } from "./index.js";

describe("proof-bundle accumulator soundness (PB1/PB2/PB3 — closed)", () => {
  it("accepts the real, recomputing accumulator fixture", async () => {
    const bundle = await loadFixture();
    const report = verifyProofBundleStructure(bundle);
    expect(report.valid).toBe(true);
    // The membership-recompute check is present and passing.
    expect(report.checks).toContainEqual({
      id: "accumulator.membership.verifies",
      status: "passed",
      message: "membership proof recomputes to the claimed accumulator root"
    });
  });

  // PB1/PB3 — root recompute.
  it("rejects a tampered Merkle sibling (root no longer recomputes)", async () => {
    const bundle = await loadFixture();
    const proof = bundle.accumulatorProof as Record<string, unknown>;
    const siblings = proof.siblings as Record<string, unknown>[];
    siblings[0] = { ...siblings[0], hash: "aa".repeat(32) };
    const report = verifyProofBundleStructure(bundle);
    expect(report.valid).toBe(false);
    expect(report.checks).toContainEqual({
      id: "accumulator.membership.verifies",
      status: "failed",
      message: "membership proof recomputes to the claimed accumulator root"
    });
  });

  it("rejects an accumulator root unrelated to leaf/siblings", async () => {
    const bundle = await loadFixture();
    const proof = bundle.accumulatorProof as Record<string, unknown>;
    proof.root = "cd".repeat(32);
    expect(verifyProofBundleStructure(bundle).valid).toBe(false);
  });

  // PB2 — value commitment must equal the claimed owner.
  it("rejects a value commitment that is not the claimed owner", async () => {
    const bundle = await loadFixture();
    const proof = bundle.accumulatorProof as Record<string, unknown>;
    proof.value = "ab".repeat(32); // valid 32-byte hex, but not the owner (and breaks the recompute)
    const report = verifyProofBundleStructure(bundle);
    expect(report.valid).toBe(false);
    expect(report.checks).toContainEqual({
      id: "accumulator.value.bindsOwner",
      status: "failed",
      message: "owner value commitment equals the claimed current owner pubkey"
    });
  });
});

describe("proof-bundle value-record chain soundness (PB5 — closed)", () => {
  it("accepts the real, signed value-record chain", async () => {
    const bundle = await loadFixture("direct-l1-auction-proof.json");
    const report = verifyProofBundleStructure(bundle);
    expect(report.valid).toBe(true);
    expect(report.checks).toContainEqual({
      id: "valueRecords.0.signature",
      status: "passed",
      message: "value record 1 signature verifies against its owner key"
    });
  });

  it("rejects a value-record chain whose recordHash is fabricated", async () => {
    const bundle = await loadFixture("direct-l1-auction-proof.json");
    const chain = bundle.valueRecordChain as Record<string, unknown> | undefined;
    const records = (chain?.records as Record<string, unknown>[]) ?? [];
    if (records.length === 0) throw new Error("fixture expected a value-record chain");
    records[0] = { ...records[0], recordHash: "ee".repeat(32) }; // not the real H(record)
    expect(verifyProofBundleStructure(bundle).valid).toBe(false);
  });

  it("rejects a value-record whose payload was tampered after signing", async () => {
    const bundle = await loadFixture("direct-l1-auction-proof.json");
    const chain = bundle.valueRecordChain as Record<string, unknown> | undefined;
    const records = (chain?.records as Record<string, unknown>[]) ?? [];
    // Swap the destination payload but keep the original signature: the
    // signature no longer verifies over the new digest.
    records[0] = { ...records[0], payloadHex: "6465616462656566" };
    const report = verifyProofBundleStructure(bundle);
    expect(report.valid).toBe(false);
    expect(report.checks).toContainEqual({
      id: "valueRecords.0.signature",
      status: "failed",
      message: "value record 1 signature verifies against its owner key"
    });
  });
});

async function loadFixture(
  fileName = "accumulator-batch-claim-proof.json"
): Promise<Record<string, unknown>> {
  const fixtureUrl = new URL(`../../../fixtures/proof-bundles/${fileName}`, import.meta.url);
  return JSON.parse(await readFile(fixtureUrl, "utf8")) as Record<string, unknown>;
}
