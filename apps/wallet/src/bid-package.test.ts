import { buildAuctionBidArtifacts, parseFundingInputDescriptor } from "@ont/architect";
import { describe, expect, it } from "vitest";

import { bidPackageFromAuction } from "./bid-package.js";
import { generateFundingKey, generateOwnerKey } from "./keys.js";
import type { ResolverAuctionState } from "./resolver.js";

const OPENING_AUCTION: ResolverAuctionState = {
  auctionId: "opening-satoshi",
  normalizedName: "satoshi",
  auctionClassId: "class-a",
  classLabel: "Class A",
  currentBlockHeight: 200,
  phase: "awaiting_opening_bid",
  unlockBlock: 100,
  auctionCloseBlockAfter: null,
  openingMinimumBidSats: "10000",
  currentLeaderBidderCommitment: null,
  currentHighestBidSats: null,
  currentRequiredMinimumBidSats: "10000",
  settlementLockBlocks: 144,
  blocksUntilUnlock: 0,
  blocksUntilClose: null
};

describe("bidPackageFromAuction", () => {
  it("maps live auction state into a valid, currently-valid bid package", () => {
    const owner = generateOwnerKey();
    const pkg = bidPackageFromAuction(OPENING_AUCTION, {
      ownerPubkey: owner.ownerPubkey,
      bidderId: "demo-bidder",
      bidAmountSats: 20_000n
    });

    expect(pkg.name).toBe("satoshi");
    expect(pkg.phase).toBe("awaiting_opening_bid");
    expect(pkg.ownerPubkey).toBe(owner.ownerPubkey);
    expect(pkg.bidAmountSats).toBe("20000");
    expect(pkg.previewStatus).toBe("currently_valid");
  });

  it("produces a package the artifact builder accepts", () => {
    const owner = generateOwnerKey();
    const funding = generateFundingKey("regtest");
    const pkg = bidPackageFromAuction(OPENING_AUCTION, {
      ownerPubkey: owner.ownerPubkey,
      bidderId: "demo-bidder",
      bidAmountSats: 20_000n
    });

    const artifacts = buildAuctionBidArtifacts({
      bidPackage: pkg,
      fundingInputs: [parseFundingInputDescriptor(`${"11".repeat(32)}:0:50000:${funding.fundingAddress}`)],
      feeSats: 500n,
      network: "regtest",
      bondAddress: funding.fundingAddress,
      changeAddress: funding.fundingAddress
    });

    expect(artifacts.kind).toBe("ont-auction-bid-artifacts");
    expect(artifacts.bidTxid).toMatch(/^[0-9a-f]{64}$/);
  });

  it("flags a below-minimum bid via preview status", () => {
    const owner = generateOwnerKey();
    const pkg = bidPackageFromAuction(OPENING_AUCTION, {
      ownerPubkey: owner.ownerPubkey,
      bidderId: "demo-bidder",
      bidAmountSats: 1_000n
    });
    expect(pkg.previewStatus).toBe("below_minimum");
  });
});
