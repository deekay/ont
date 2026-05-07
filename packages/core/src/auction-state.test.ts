import { describe, expect, it } from "vitest";

import { createDefaultLaunchAuctionPolicy } from "./auction-policy.js";
import { simulateLaunchAuctionStateAtBlock } from "./auction-state.js";
import { parseLaunchAuctionScenario } from "./auction-sim.js";

const policy = createDefaultLaunchAuctionPolicy();

describe("simulateLaunchAuctionStateAtBlock", () => {
  it("reports pre-eligibility before the opening-bid window", () => {
    const state = simulateLaunchAuctionStateAtBlock({
      policy,
      currentBlockHeight: 839_990,
      scenario: parseLaunchAuctionScenario({
        name: "marble",
        auctionClassId: "launch_name",
        unlockBlock: 840_000,
        bidAttempts: [
          { bidderId: "alpha", blockHeight: 840_010, amountSats: "1000000000" }
        ]
      })
    });

    expect(state.phase).toBe("pending_unlock");
    expect(state.blocksUntilUnlock).toBe(10);
    expect(state.currentRequiredMinimumBidSats?.toString()).toBe("3125000");
  });

  it("reports eligible to open when only underfloor bids are visible", () => {
    const state = simulateLaunchAuctionStateAtBlock({
      policy,
      currentBlockHeight: 880_030,
      scenario: parseLaunchAuctionScenario({
        name: "luna",
        auctionClassId: "launch_name",
        unlockBlock: 880_000,
        bidAttempts: [
          { bidderId: "speculator_a", blockHeight: 880_015, amountSats: "10000000" },
          { bidderId: "speculator_b", blockHeight: 880_020, amountSats: "11000000" },
          { bidderId: "speculator_c", blockHeight: 880_030, amountSats: "12499999" }
        ]
      })
    });

    expect(state.phase).toBe("awaiting_opening_bid");
    expect(state.acceptedBidCount).toBe(0);
    expect(state.rejectedBidCount).toBe(3);
    expect(state.currentRequiredMinimumBidSats?.toString()).toBe("12500000");
  });

  it("keeps unopened eligible names available for an opening bid", () => {
    const state = simulateLaunchAuctionStateAtBlock({
      policy,
      currentBlockHeight: 884_321,
      scenario: parseLaunchAuctionScenario({
        name: "luna",
        auctionClassId: "launch_name",
        unlockBlock: 880_000,
        bidAttempts: [
          { bidderId: "speculator_a", blockHeight: 880_015, amountSats: "10000000" },
          { bidderId: "speculator_b", blockHeight: 880_020, amountSats: "11000000" },
          { bidderId: "speculator_c", blockHeight: 880_030, amountSats: "12499999" }
        ]
      })
    });

    expect(state.phase).toBe("awaiting_opening_bid");
    expect(state.baseMinimumBidSats).toBe(12_500_000n);
    expect(state.currentRequiredMinimumBidSats?.toString()).toBe("12500000");
    expect(state.acceptedBidCount).toBe(0);
    expect(state.rejectedBidCount).toBe(3);
  });

  it("reports live bidding after a valid opening bid before soft close", () => {
    const state = simulateLaunchAuctionStateAtBlock({
      policy,
      currentBlockHeight: 851_600,
      scenario: parseLaunchAuctionScenario({
        name: "meadow",
        auctionClassId: "launch_name",
        unlockBlock: 850_000,
        bidAttempts: [
          { bidderId: "speculator_a", blockHeight: 850_010, amountSats: "200000000" },
          { bidderId: "speculator_b", blockHeight: 851_500, amountSats: "220000000" }
        ]
      })
    });

    expect(state.phase).toBe("live_bidding");
    expect(state.currentLeaderBidderId).toBe("speculator_b");
    expect(state.blocksUntilClose).toBeGreaterThan(0);
    expect(state.currentRequiredMinimumBidSats?.toString()).toBe("231000000");
  });

  it("reports soft close after a late extension bid", () => {
    const state = simulateLaunchAuctionStateAtBlock({
      policy,
      currentBlockHeight: 844_360,
      scenario: parseLaunchAuctionScenario({
        name: "marble",
        auctionClassId: "launch_name",
        unlockBlock: 840_000,
        bidAttempts: [
          { bidderId: "alpha", blockHeight: 840_010, amountSats: "1000000000" },
          { bidderId: "beta", blockHeight: 844_210, amountSats: "1100000000" },
          { bidderId: "gamma", blockHeight: 844_353, amountSats: "1210000000" }
        ]
      })
    });

    expect(state.phase).toBe("soft_close");
    expect(state.currentLeaderBidderId).toBe("gamma");
    expect(state.auctionCloseBlockAfter).toBe(844_497);
    expect(state.blocksUntilClose).toBe(137);
    expect(state.currentRequiredMinimumBidSats?.toString()).toBe("1331000000");
  });

  it("reports settled after the closing block passes", () => {
    const state = simulateLaunchAuctionStateAtBlock({
      policy,
      currentBlockHeight: 854_700,
      scenario: parseLaunchAuctionScenario({
        name: "meadow",
        auctionClassId: "launch_name",
        unlockBlock: 850_000,
        bidAttempts: [
          { bidderId: "speculator_a", blockHeight: 850_010, amountSats: "200000000" },
          { bidderId: "speculator_b", blockHeight: 851_500, amountSats: "220000000" },
          { bidderId: "speculator_c", blockHeight: 854_320, amountSats: "242000000" },
          { bidderId: "speculator_d", blockHeight: 854_450, amountSats: "267000000" }
        ]
      })
    });

    expect(state.phase).toBe("settled");
    expect(state.currentLeaderBidderId).toBe("speculator_d");
    expect(state.currentRequiredMinimumBidSats).toBeNull();
    expect(state.blocksUntilClose).toBe(0);
  });
});
