import { describe, expect, it } from "vitest";

import {
  createExperimentalAuctionFeedBidPackage,
  createLaunchAuctionOpeningBidPackage,
  createLaunchAuctionLabBidPackage,
  loadLaunchAuctionLab
} from "../src/auction-lab.js";

describe("loadLaunchAuctionLab", () => {
  it("loads curated auction fixtures with visible phase coverage", async () => {
    const payload = await loadLaunchAuctionLab();

    expect(payload.kind).toBe("auction_lab");
    expect(payload.cases.length).toBeGreaterThanOrEqual(4);
    expect(payload.cases.map((entry) => entry.state.phase)).toEqual([
      "awaiting_opening_bid",
      "live_bidding",
      "soft_close",
      "settled"
    ]);
    expect(payload.cases[0]?.state.currentRequiredMinimumBidSats).toBe("12500000");
    expect(payload.cases[3]?.state.currentLeaderBidderId).toBe("speculator_d");
    expect(payload.cases.map((entry) => entry.state.phase)).not.toContain("pending_unlock");
  });

  it("can derive a shared auction bid package from a website-facing case", async () => {
    const pkg = await createLaunchAuctionLabBidPackage({
      caseId: "04-soft-close-marble",
      bidderId: "operator_alpha",
      ownerPubkey: "11".repeat(32),
      bidAmountSats: "1340000000"
    });

    expect(pkg.auctionId).toBe("04-soft-close-marble");
    expect(pkg.name).toBe("marble");
    expect(pkg.previewStatus).toBe("currently_valid");
    expect(pkg.wouldExtendSoftClose).toBe(true);
    expect(pkg.previewRequiredMinimumBidSats).toBe("1331000000");
  });

  it("uses a deterministic auction lot for direct name openings", () => {
    const first = createLaunchAuctionOpeningBidPackage({
      name: "satoshi",
      currentBlockHeight: 790,
      bidderId: "operator_a",
      ownerPubkey: "11".repeat(32),
      bidAmountSats: "1562500"
    });
    const second = createLaunchAuctionOpeningBidPackage({
      name: "Satoshi",
      currentBlockHeight: 792,
      bidderId: "operator_b",
      ownerPubkey: "22".repeat(32),
      bidAmountSats: "1562500"
    });

    expect(first.auctionId).toBe("opening-satoshi");
    expect(first.unlockBlock).toBe(0);
    expect(second.auctionLotCommitment).toBe(first.auctionLotCommitment);
  });

  it("uses the release height as the deterministic lot for reopened names", () => {
    const pkg = createLaunchAuctionOpeningBidPackage({
      name: "satoshi",
      currentBlockHeight: 905,
      bidderId: "operator_a",
      ownerPubkey: "11".repeat(32),
      bidAmountSats: "1562500",
      unlockBlock: 900
    });

    expect(pkg.auctionId).toBe("reopen-satoshi-after-900");
    expect(pkg.unlockBlock).toBe(900);
    expect(pkg.phase).toBe("awaiting_opening_bid");
  });

  it("can derive a bid package from resolver-derived live auction state", () => {
    const pkg = createExperimentalAuctionFeedBidPackage({
      auction: {
        auctionId: "private-meadow",
        normalizedName: "meadow",
        auctionClassId: "launch_name",
        classLabel: "Public auction",
        currentBlockHeight: 123456,
        phase: "soft_close",
        unlockBlock: 123440,
        auctionCloseBlockAfter: 123460,
        openingMinimumBidSats: "250000000",
        currentLeaderBidderCommitment: "11".repeat(16),
        currentHighestBidSats: "300000000",
        currentRequiredMinimumBidSats: "330000000",
        settlementLockBlocks: 1440,
        blocksUntilUnlock: 0,
        blocksUntilClose: 4
      },
      bidderId: "operator_beta",
      ownerPubkey: "22".repeat(32),
      bidAmountSats: "330000000"
    });

    expect(pkg.auctionId).toBe("private-meadow");
    expect(pkg.previewStatus).toBe("currently_valid");
    expect(pkg.wouldExtendSoftClose).toBe(true);
    expect(pkg.previewRequiredMinimumBidSats).toBe("330000000");
  });

  it("refuses resolver-derived bid packages after settlement", () => {
    expect(() =>
      createExperimentalAuctionFeedBidPackage({
        auction: {
          auctionId: "private-meadow",
          normalizedName: "meadow",
          auctionClassId: "launch_name",
          classLabel: "Public auction",
          currentBlockHeight: 123470,
          phase: "settled",
          unlockBlock: 123440,
          auctionCloseBlockAfter: 123460,
          openingMinimumBidSats: "250000000",
          currentLeaderBidderCommitment: "11".repeat(16),
          currentHighestBidSats: "330000000",
          currentRequiredMinimumBidSats: null,
          settlementLockBlocks: 1440,
          blocksUntilUnlock: 0,
          blocksUntilClose: 0
        },
        bidderId: "operator_beta",
        bidAmountSats: "350000000"
      })
    ).toThrow(/already settled/i);
  });

  it("keeps pre-eligibility states out of the public lab payload", async () => {
    const payload = await loadLaunchAuctionLab();

    expect(payload.cases.map((entry) => entry.id)).not.toContain("01-pre-eligibility-marble");
    expect(payload.cases.map((entry) => entry.state.phase)).not.toContain("pending_unlock");
  });
});
