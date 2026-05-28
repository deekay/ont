import { verifyProofBundle } from "@ont/consensus";
import { Accumulator, accumulatorKeyForName } from "@ont/core";
import { describe, expect, it } from "vitest";

import {
  assembleAccumulatorBatchClaimBundle,
  assembleDirectAuctionProofBundle,
  ProofExportError
} from "./proof-export.js";
import type { ResolverAuctionState, ResolverNameRecord, ResolverValueHistory } from "./resolver.js";

const WINNER_PUBKEY = "ab".repeat(32);
const WINNING_TXID = "cd".repeat(32);

function record(overrides: Partial<ResolverNameRecord> = {}): ResolverNameRecord {
  return {
    name: "satoshi",
    status: "mature",
    currentOwnerPubkey: WINNER_PUBKEY,
    lastStateTxid: WINNING_TXID,
    maturityHeight: 100,
    requiredBondSats: "5000",
    currentBondTxid: WINNING_TXID,
    currentBondVout: 0,
    currentBondValueSats: "10000",
    ...overrides
  };
}

function auction(overrides: Partial<ResolverAuctionState> = {}): ResolverAuctionState {
  return {
    auctionId: "opening-satoshi",
    normalizedName: "satoshi",
    auctionClassId: "class-a",
    classLabel: "Class A",
    currentBlockHeight: 200,
    phase: "settled",
    unlockBlock: 100,
    auctionCloseBlockAfter: 150,
    openingMinimumBidSats: "10000",
    currentLeaderBidderCommitment: null,
    currentHighestBidSats: null,
    currentRequiredMinimumBidSats: null,
    settlementLockBlocks: 144,
    blocksUntilUnlock: 0,
    blocksUntilClose: 0,
    visibleBidOutcomes: [
      { txid: "ee".repeat(32), ownerPubkey: "11".repeat(32), amountSats: "12000", status: "rejected" },
      { txid: WINNING_TXID, ownerPubkey: WINNER_PUBKEY, amountSats: "20000", status: "accepted" }
    ],
    ...overrides
  };
}

describe("assembleDirectAuctionProofBundle", () => {
  it("assembles a bundle that passes verifyProofBundle", () => {
    const bundle = assembleDirectAuctionProofBundle({ record: record(), auction: auction() });
    const report = verifyProofBundle(bundle);
    expect(report.valid).toBe(true);
    expect(report.proofSource).toBe("bitcoin_l1_direct_auction");
    expect(report.normalizedName).toBe("satoshi");
  });

  it("produces a bundle that fails ownership verification after a transfer", () => {
    // Name transferred to a new owner: the direct-auction proof can't validate it.
    const bundle = assembleDirectAuctionProofBundle({
      record: record({ currentOwnerPubkey: "99".repeat(32) }),
      auction: auction()
    });
    const report = verifyProofBundle(bundle);
    expect(report.valid).toBe(false);
    expect(report.checks.some((c) => c.id === "direct.ownership.ownerMatchesWinner" && c.status === "failed")).toBe(true);
  });

  it("throws when the bond txid is not among the accepted bids", () => {
    expect(() =>
      assembleDirectAuctionProofBundle({ record: record({ currentBondTxid: "ff".repeat(32) }), auction: auction() })
    ).toThrow(ProofExportError);
  });

  it("throws when there are no accepted bids", () => {
    expect(() =>
      assembleDirectAuctionProofBundle({
        record: record(),
        auction: auction({ visibleBidOutcomes: [] })
      })
    ).toThrow(ProofExportError);
  });

  it("includes a value-record chain when supplied, and it passes verification", () => {
    const valueHistory: ResolverValueHistory = {
      records: [
        {
          sequence: 1,
          recordHash: "aa".repeat(32),
          previousRecordHash: null,
          ownerPubkey: WINNER_PUBKEY,
          ownershipRef: WINNING_TXID
        },
        {
          sequence: 2,
          recordHash: "bb".repeat(32),
          previousRecordHash: "aa".repeat(32),
          ownerPubkey: WINNER_PUBKEY,
          ownershipRef: WINNING_TXID
        }
      ]
    };
    const bundle = assembleDirectAuctionProofBundle({ record: record(), auction: auction(), valueHistory });
    const report = verifyProofBundle(bundle);
    expect(report.valid).toBe(true);
    expect((bundle as { valueRecordChain?: { records: unknown[] } }).valueRecordChain?.records).toHaveLength(2);
  });

  it("throws when the resolver omitted the bond outpoint", () => {
    const { currentBondTxid: _t, currentBondVout: _v, currentBondValueSats: _val, ...withoutBond } = record();
    expect(() =>
      assembleDirectAuctionProofBundle({ record: withoutBond, auction: auction() })
    ).toThrow(ProofExportError);
  });
});

describe("assembleAccumulatorBatchClaimBundle", () => {
  function buildInclusion(name: string, ownerPubkey: string) {
    const acc = new Accumulator();
    const leaf = accumulatorKeyForName(name);
    // Insert a few decoy leaves alongside so the proof has real siblings.
    acc.insert(accumulatorKeyForName("decoy1"), "11".repeat(32));
    acc.insert(leaf, ownerPubkey);
    acc.insert(accumulatorKeyForName("decoy2"), "22".repeat(32));
    const proof = acc.proveMembership(leaf);
    return {
      root: acc.root(),
      leaf: proof.keyHex,
      value: proof.value as string,
      siblings: proof.siblings,
      anchorTxid: "33".repeat(32),
      anchorHeight: 1_000_001,
      claimedAt: new Date().toISOString()
    };
  }

  it("assembles a bundle that passes verifyProofBundle", () => {
    const owner = "ab".repeat(32);
    const inclusion = buildInclusion("alice", owner);
    const bundle = assembleAccumulatorBatchClaimBundle({
      name: "alice",
      ownerPubkey: owner,
      inclusion
    });
    const report = verifyProofBundle(bundle);
    expect(report.valid).toBe(true);
    expect(report.proofSource).toBe("accumulator_batch_claim");
    expect(report.normalizedName).toBe("alice");
  });

  it("fails verification when the leaf doesn't bind the name", () => {
    const owner = "ab".repeat(32);
    const inclusion = buildInclusion("alice", owner);
    const bundle = assembleAccumulatorBatchClaimBundle({
      name: "alice",
      ownerPubkey: owner,
      inclusion: { ...inclusion, leaf: "00".repeat(32) }
    });
    const report = verifyProofBundle(bundle);
    expect(report.valid).toBe(false);
    expect(report.checks.some((c) => c.id === "accumulator.leaf.bindsName" && c.status === "failed")).toBe(true);
  });
});
