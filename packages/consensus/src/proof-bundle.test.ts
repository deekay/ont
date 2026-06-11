import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  verifyProofBundle,
  verifyProofBundleAgainstBitcoin,
  verifyProofBundleStructure,
  type BitcoinHeaderSource
} from "./index.js";

// Only the two current acquisition paths. Ark/RGB explorations were removed from
// the frozen verifier (see docs/research/archive/SIMPLIFICATION_AUDIT.md, Phase 4).
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

  it("rejects a direct L1 bundle that declares a non-highest bid the winner", async () => {
    const bundle = await loadProofBundleFixture("direct-l1-auction-proof.json");
    const auctionTranscript = bundle.auctionTranscript as Record<string, unknown>;
    const bids = auctionTranscript.acceptedBids as Record<string, unknown>[];
    const winner = auctionTranscript.winner as Record<string, unknown>;
    // Inject a strictly-higher accepted bid. The declared winner is no longer the
    // highest accepted bid, so the bundle must be rejected — even though every
    // internal-consistency check (owner/amount/bond) still passes.
    const higher = (BigInt(winner.winningAmountSats as string) + 50_000n).toString();
    bids.push({ txid: "aa".repeat(32), ownerPubkey: "bb".repeat(32), amountSats: higher });

    const report = verifyProofBundleStructure(bundle);

    expect(report.valid).toBe(false);
    expect(report.checks).toContainEqual({
      id: "direct.winner.isHighestBid",
      status: "failed",
      message: "winner is the highest accepted bid (no accepted bid exceeds it)"
    });
  });

  it("rejects a direct L1 bundle that lists the same bid txid twice", async () => {
    const bundle = await loadProofBundleFixture("direct-l1-auction-proof.json");
    const auctionTranscript = bundle.auctionTranscript as Record<string, unknown>;
    const bids = auctionTranscript.acceptedBids as Record<string, unknown>[];
    const first = bids[0];
    if (first === undefined) {
      throw new Error("fixture expected to contain at least one accepted bid");
    }
    // Duplicate-stuff the transcript: re-list an existing bid under its own txid.
    // The set is no longer well-formed — distinct txids must equal listed bids.
    bids.push({ ...first });

    const report = verifyProofBundleStructure(bundle);

    expect(report.valid).toBe(false);
    expect(report.checks).toContainEqual({
      id: "direct.bids.unique",
      status: "failed",
      message: "every accepted bid is a distinct L1 transaction (no duplicate txids)"
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

describe("proof bundle Bitcoin verifier", () => {
  // The fixture's anchor is Bitcoin mainnet block 170 (the first BTC payment):
  // a real header with valid PoW and a real Merkle branch.
  const BLOCK_170_HEADER =
    "0100000055bd840a78798ad0da853f68974f3d183e2bd1db6a842c1feecf222a00000000ff104ccb05421ab93e63f8c3ce5c2c2e9dbb37de2764b3a3175c8166562cac7d51b96a49ffff001d283e9e70";

  it("accepts a bundle whose cited anchor is Merkle-committed by a real PoW header", async () => {
    const bundle = await loadProofBundleFixture("bitcoin-anchored-claim-proof.json");
    const report = verifyProofBundleAgainstBitcoin(bundle);

    expect(report.valid).toBe(true);
    expect(report.checks).toContainEqual({
      id: "btc.0.pow",
      status: "passed",
      message: "anchor 1 header meets its proof-of-work target"
    });
    expect(report.checks).toContainEqual({
      id: "btc.0.inclusion",
      status: "passed",
      message: "anchor 1 transaction is Merkle-committed by its block header"
    });
    expect(report.checks.some((c) => c.id === "btc.cited.0.verified" && c.status === "passed")).toBe(true);
  });

  it("rejects a structurally-valid bundle that carries no Bitcoin inclusion proof", async () => {
    const bundle = await loadProofBundleFixture("accumulator-batch-claim-proof.json");
    expect(verifyProofBundleStructure(bundle).valid).toBe(true);

    const report = verifyProofBundleAgainstBitcoin(bundle);
    expect(report.valid).toBe(false);
    expect(report.checks).toContainEqual({
      id: "btc.inclusion.present",
      status: "failed",
      message: "bundle carries Bitcoin inclusion proofs (bitcoinInclusion.anchors)"
    });
  });

  it("rejects a tampered block header (proof-of-work fails)", async () => {
    const bundle = await loadProofBundleFixture("bitcoin-anchored-claim-proof.json");
    const inclusion = bundle.bitcoinInclusion as Record<string, unknown>;
    const anchors = inclusion.anchors as Record<string, unknown>[];
    const anchor = anchors[0];
    if (anchor === undefined) throw new Error("fixture expected to contain one anchor");
    // Flip the nonce so the header no longer hashes below its target.
    anchor.blockHeaderHex = BLOCK_170_HEADER.slice(0, -2) + "71";

    const report = verifyProofBundleAgainstBitcoin(bundle);
    expect(report.valid).toBe(false);
    expect(report.checks).toContainEqual({
      id: "btc.0.pow",
      status: "failed",
      message: "anchor 1 header meets its proof-of-work target"
    });
  });

  it("rejects a tampered Merkle sibling (inclusion fails)", async () => {
    const bundle = await loadProofBundleFixture("bitcoin-anchored-claim-proof.json");
    const inclusion = bundle.bitcoinInclusion as Record<string, unknown>;
    const anchors = inclusion.anchors as Record<string, unknown>[];
    const anchor = anchors[0];
    if (anchor === undefined) throw new Error("fixture expected to contain one anchor");
    anchor.merkle = ["00".repeat(32)];

    const report = verifyProofBundleAgainstBitcoin(bundle);
    expect(report.valid).toBe(false);
    expect(report.checks).toContainEqual({
      id: "btc.0.inclusion",
      status: "failed",
      message: "anchor 1 transaction is Merkle-committed by its block header"
    });
  });

  it("pins the header to a canonical chain when a header source is supplied", async () => {
    const bundle = await loadProofBundleFixture("bitcoin-anchored-claim-proof.json");

    const goodSource: BitcoinHeaderSource = {
      headerHexAtHeight: (height) => (height === 170 ? BLOCK_170_HEADER : null)
    };
    expect(verifyProofBundleAgainstBitcoin(bundle, { headerSource: goodSource }).valid).toBe(true);

    const wrongSource: BitcoinHeaderSource = {
      headerHexAtHeight: () => "00".repeat(80)
    };
    const report = verifyProofBundleAgainstBitcoin(bundle, { headerSource: wrongSource });
    expect(report.valid).toBe(false);
    expect(report.checks).toContainEqual({
      id: "btc.0.chain",
      status: "failed",
      message: "anchor 1 header is the canonical chain header at height 170"
    });
  });
});

async function loadProofBundleFixture(fileName: string): Promise<Record<string, unknown>> {
  const fixtureUrl = new URL(`../../../fixtures/proof-bundles/${fileName}`, import.meta.url);
  const raw = await readFile(fixtureUrl, "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}
