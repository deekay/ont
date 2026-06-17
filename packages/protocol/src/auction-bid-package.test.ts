import { describe, expect, it } from "vitest";

import {
  AUCTION_BID_PACKAGE_FORMAT,
  AUCTION_BID_PACKAGE_VERSION,
  computeAuctionBidderCommitment,
  computeAuctionLotCommitment,
  createAuctionBidPackage,
  parseAuctionBidPackage,
  PROTOCOL_NAME
} from "./index.js";

describe("auction bid packages", () => {
  it("builds a preview for pending-opening states", () => {
    const pkg = createAuctionBidPackage({
      auctionId: "01-pre-eligibility-marble",
      name: "marble",
      currentBlockHeight: 95_000,
      phase: "pending_unlock",
      unlockBlock: 95_144,
      auctionCloseBlockAfter: null,
      openingMinimumBidSats: 1_000_000_000n,
      currentLeaderBidderId: null,
      currentHighestBidSats: null,
      currentRequiredMinimumBidSats: 1_000_000_000n,
      settlementLockBlocks: 525_600,
      bidderId: "operator_a",
      ownerPubkey: "11".repeat(32),
      bidAmountSats: 1_000_000_000n,
      exportedAt: "2026-04-11T19:00:00.000Z"
    });

    expect(pkg.format).toBe(AUCTION_BID_PACKAGE_FORMAT);
    expect(pkg.packageVersion).toBe(AUCTION_BID_PACKAGE_VERSION);
    expect(pkg.protocol).toBe(PROTOCOL_NAME);
    expect(pkg.previewStatus).toBe("too_early");
    expect(pkg.previewRequiredMinimumBidSats).toBe("1000000000");
    expect(pkg.wouldBecomeLeader).toBe(false);
    expect(pkg.previewSummary).toContain("not eligible to open yet");
    expect(pkg.bidderCommitment).toBe(computeAuctionBidderCommitment("operator_a"));
    expect(pkg.bidderCommitment).toHaveLength(64);
    expect(pkg.currentLeaderBidderCommitment).toBeNull();
    expect(pkg.auctionLotCommitment).toBe(
      computeAuctionLotCommitment({
        auctionId: "01-pre-eligibility-marble",
        name: "marble",
        unlockBlock: 95_144
      })
    );
    expect(pkg.auctionLotCommitment).toHaveLength(64);
    expect(pkg.auctionStateCommitment).toHaveLength(64);
  });

  it("builds a valid soft-close preview when the amount clears the next minimum", () => {
    const pkg = createAuctionBidPackage({
      auctionId: "04-soft-close-marble",
      name: "marble",
      currentBlockHeight: 100_288,
      phase: "soft_close",
      unlockBlock: 96_000,
      auctionCloseBlockAfter: 100_432,
      openingMinimumBidSats: 1_000_000_000n,
      currentLeaderBidderId: "speculator_d",
      currentHighestBidSats: 1_600_000_000n,
      currentRequiredMinimumBidSats: 1_760_000_000n,
      settlementLockBlocks: 525_600,
      bidderId: "operator_b",
      ownerPubkey: "22".repeat(32),
      bidAmountSats: 1_800_000_000n,
      exportedAt: "2026-04-11T19:00:00.000Z"
    });

    expect(pkg.previewStatus).toBe("currently_valid");
    expect(pkg.previewRequiredMinimumBidSats).toBe("1760000000");
    expect(pkg.wouldBecomeLeader).toBe(true);
    expect(pkg.wouldExtendSoftClose).toBe(true);
    expect(pkg.currentLeaderBidderCommitment).toBe(
      computeAuctionBidderCommitment("speculator_d")
    );

    expect(parseAuctionBidPackage(pkg)).toEqual(pkg);
  });

  it("allows live-state packages that know only the current leader commitment", () => {
    const pkg = createAuctionBidPackage({
      auctionId: "03-live-meadow",
      name: "meadow",
      currentBlockHeight: 128,
      phase: "live_bidding",
      unlockBlock: 110,
      auctionCloseBlockAfter: 4431,
      openingMinimumBidSats: 200_000_000n,
      currentLeaderBidderId: null,
      currentLeaderBidderCommitment: computeAuctionBidderCommitment("unknown_live_leader"),
      currentHighestBidSats: 220_000_000n,
      currentRequiredMinimumBidSats: 231_000_000n,
      settlementLockBlocks: 262_800,
      bidderId: "operator_from_live_feed",
      ownerPubkey: "33".repeat(32),
      bidAmountSats: 231_000_000n,
      exportedAt: "2026-04-11T19:00:00.000Z"
    });

    expect(pkg.currentLeaderBidderId).toBeNull();
    expect(pkg.currentLeaderBidderCommitment).toBe(
      computeAuctionBidderCommitment("unknown_live_leader")
    );
    expect(pkg.previewStatus).toBe("currently_valid");
    expect(parseAuctionBidPackage(pkg)).toEqual(pkg);
  });

  it("rejects packages whose preview fields no longer match the observed state", () => {
    const pkg = createAuctionBidPackage({
      auctionId: "02-awaiting-opening",
      name: "luna",
      currentBlockHeight: 99_000,
      phase: "awaiting_opening_bid",
      unlockBlock: 99_000,
      auctionCloseBlockAfter: null,
      openingMinimumBidSats: 200_000_000n,
      currentLeaderBidderId: null,
      currentHighestBidSats: null,
      currentRequiredMinimumBidSats: 200_000_000n,
      settlementLockBlocks: 262_800,
      bidderId: "operator_c",
      ownerPubkey: "44".repeat(32),
      bidAmountSats: 150_000_000n,
      exportedAt: "2026-04-11T19:00:00.000Z"
    });

    expect(() =>
      parseAuctionBidPackage({
        ...pkg,
        previewStatus: "currently_valid"
      })
    ).toThrow(/previewStatus/);
  });
});
