import { describe, expect, it } from "vitest";

import {
  calculateLaunchAuctionMinimumIncrementBidSats,
  createDefaultLaunchAuctionPolicy,
  getLaunchAuctionOpeningRequirements,
  parseLaunchAuctionPolicy,
  parseLaunchAuctionScenario,
  serializeLaunchAuctionPolicy,
  serializeLaunchAuctionScenario,
  serializeLaunchAuctionSimulationResult,
  simulateLaunchAuction
} from "./index.js";

describe("auction policy", () => {
  it("round-trips the default policy through a JSON-safe representation", () => {
    const policy = createDefaultLaunchAuctionPolicy();
    const serialized = serializeLaunchAuctionPolicy(policy);
    const reparsed = parseLaunchAuctionPolicy(JSON.parse(JSON.stringify(serialized)));

    expect(reparsed).toEqual(policy);
  });

  it("calculates the greater of the absolute and percentage minimum increment", () => {
    const policy = createDefaultLaunchAuctionPolicy();

    expect(policy.auction.minimumIncrementAbsoluteSats).toBe(1_000n);
    expect(policy.auction.minimumIncrementBasisPoints).toBe(500);
    expect(policy.auction.softCloseMinimumIncrementAbsoluteSats).toBe(1_000n);
    expect(policy.auction.softCloseMinimumIncrementBasisPoints).toBe(1_000);
    expect(
      calculateLaunchAuctionMinimumIncrementBidSats({
        currentBidSats: 1_000_000_000n,
        policy
      })
    ).toBe(1_050_000_000n);
    expect(
      calculateLaunchAuctionMinimumIncrementBidSats({
        currentBidSats: 10_000_000n,
        policy
      })
    ).toBe(10_500_000n);
    expect(
      calculateLaunchAuctionMinimumIncrementBidSats({
        currentBidSats: 10_000n,
        policy
      })
    ).toBe(11_000n);
    expect(
      calculateLaunchAuctionMinimumIncrementBidSats({
        currentBidSats: 10_000n,
        policy,
        useSoftCloseIncrement: true
      })
    ).toBe(11_000n);
    expect(
      calculateLaunchAuctionMinimumIncrementBidSats({
        currentBidSats: 1_100_000_000n,
        policy,
        useSoftCloseIncrement: true
      })
    ).toBe(1_210_000_000n);
  });

  it("rounds percentage increments up so fractional requirements cannot be bypassed", () => {
    const defaultPolicy = createDefaultLaunchAuctionPolicy();
    const policy = {
      ...defaultPolicy,
      auction: {
        ...defaultPolicy.auction,
        minimumIncrementAbsoluteSats: 1n,
        minimumIncrementBasisPoints: 500,
        softCloseMinimumIncrementAbsoluteSats: 1n,
        softCloseMinimumIncrementBasisPoints: 1_000
      }
    };

    expect(
      calculateLaunchAuctionMinimumIncrementBidSats({
        currentBidSats: 101n,
        policy
      })
    ).toBe(107n);
    expect(
      calculateLaunchAuctionMinimumIncrementBidSats({
        currentBidSats: 101n,
        policy,
        useSoftCloseIncrement: true
      })
    ).toBe(112n);
  });
});

describe("simulateLaunchAuction", () => {
  it("uses the neutral length floor when it exceeds the launch auction floor", () => {
    const policy = createDefaultLaunchAuctionPolicy();
    const result = simulateLaunchAuction({
      policy,
      scenario: {
        // 4-char name → the length floor (₿12,500,000) genuinely exceeds the
        // launch floor. (Names 5+ chars clamp to the flat floor — see bond.ts.)
        name: "moon",
        unlockBlock: 840_000,
        bidAttempts: [
          {
            bidderId: "operator_a",
            blockHeight: 840_010,
            amountSats: 25_000_000n
          }
        ]
      }
    });

    expect(result.status).toBe("settled");
    expect(result.openingMinimumBidSats).toBe(12_500_000n);
    expect(result.winner?.amountSats).toBe(25_000_000n);
    expect(result.settlementLockBlocks).toBe(policy.defaultSettlementLockBlocks);
  });

  it("rejects bids before opening, rejects low increments, and extends on soft close", () => {
    const policy = createDefaultLaunchAuctionPolicy();
    const result = simulateLaunchAuction({
      policy,
      scenario: {
        name: "marble",
        unlockBlock: 840_000,
        bidAttempts: [
          {
            bidderId: "early_bidder",
            blockHeight: 839_999,
            amountSats: 1_000_000_000n
          },
          {
            bidderId: "alpha",
            blockHeight: 840_010,
            amountSats: 1_000_000_000n
          },
          {
            bidderId: "beta",
            blockHeight: 840_900,
            amountSats: 1_020_000_000n
          },
          {
            bidderId: "beta",
            blockHeight: 840_910,
            amountSats: 1_100_000_000n
          },
          {
            bidderId: "gamma",
            blockHeight: 841_053,
            amountSats: 1_210_000_000n
          },
          {
            bidderId: "late",
            blockHeight: 841_200,
            amountSats: 1_300_000_000n
          }
        ]
      }
    });

    expect(result.bidOutcomes.map((outcome) => outcome.reason)).toEqual([
      "before_unlock",
      "opening_bid",
      "below_minimum_increment",
      "higher_bid_soft_close_extended",
      "higher_bid_soft_close_extended",
      "auction_closed"
    ]);
    expect(result.initialAuctionCloseBlock).toBe(841_018);
    expect(result.finalAuctionCloseBlock).toBe(841_197);
    expect(result.winner).toEqual({
      bidderId: "gamma",
      blockHeight: 841_053,
      amountSats: 1_210_000_000n
    });
  });

  it("returns unopened when no accepted opening bid exists", () => {
    const policy = createDefaultLaunchAuctionPolicy();
    const result = simulateLaunchAuction({
      policy,
      scenario: {
        // Long-tail (6-char) name → flat ₿50,000 floor; a sub-floor bid is
        // rejected and the auction never opens.
        name: "meadow",
        unlockBlock: 900_000,
        bidAttempts: [
          {
            bidderId: "speculator_a",
            blockHeight: 900_010,
            amountSats: 49_999n
          }
        ]
      }
    });

    expect(result.status).toBe("unopened");
    expect(result.winner).toBeNull();
    expect(result.bidOutcomes[0]?.reason).toBe("below_opening_minimum");
  });

  it("accepts the exact opening minimum and rejects one sat below it", () => {
    const policy = createDefaultLaunchAuctionPolicy();
    const opening = getLaunchAuctionOpeningRequirements({
      policy,
      name: "silverpine"
    }).openingMinimumBidSats;
    const result = simulateLaunchAuction({
      policy,
      scenario: {
        name: "silverpine",
        unlockBlock: 900_000,
        bidAttempts: [
          {
            bidderId: "under",
            blockHeight: 900_001,
            amountSats: opening - 1n
          },
          {
            bidderId: "exact",
            blockHeight: 900_002,
            amountSats: opening
          }
        ]
      }
    });

    expect(result.bidOutcomes.map((outcome) => outcome.reason)).toEqual([
      "below_opening_minimum",
      "opening_bid"
    ]);
    expect(result.winner?.bidderId).toBe("exact");
    expect(result.winner?.amountSats).toBe(opening);
  });

  it("accepts the exact normal increment and rejects one sat below it", () => {
    const policy = createDefaultLaunchAuctionPolicy();
    const result = simulateLaunchAuction({
      policy,
      scenario: {
        name: "marble",
        unlockBlock: 900_000,
        bidAttempts: [
          {
            bidderId: "alpha",
            blockHeight: 900_010,
            amountSats: 1_000_000_000n
          },
          {
            bidderId: "under",
            blockHeight: 900_020,
            amountSats: 1_049_999_999n
          },
          {
            bidderId: "exact",
            blockHeight: 900_021,
            amountSats: 1_050_000_000n
          }
        ]
      }
    });

    expect(result.bidOutcomes.map((outcome) => outcome.reason)).toEqual([
      "opening_bid",
      "below_minimum_increment",
      "higher_bid"
    ]);
    expect(result.winner).toEqual({
      bidderId: "exact",
      blockHeight: 900_021,
      amountSats: 1_050_000_000n
    });
  });

  it("handles soft-close boundaries, exact late increments, repeated extensions, and after-close rejection", () => {
    const defaultPolicy = createDefaultLaunchAuctionPolicy();
    const policy = {
      ...defaultPolicy,
      auction: {
        ...defaultPolicy.auction,
        baseWindowBlocks: 10,
        softCloseExtensionBlocks: 3,
        minimumIncrementAbsoluteSats: 1n,
        minimumIncrementBasisPoints: 500,
        softCloseMinimumIncrementAbsoluteSats: 1n,
        softCloseMinimumIncrementBasisPoints: 1_000
      }
    };
    const result = simulateLaunchAuction({
      policy,
      scenario: {
        name: "silverpine",
        unlockBlock: 100,
        bidAttempts: [
          {
            bidderId: "alpha",
            blockHeight: 100,
            amountSats: 200_000n
          },
          {
            bidderId: "before_soft_close",
            blockHeight: 106,
            amountSats: 210_000n
          },
          {
            bidderId: "under_soft_close",
            blockHeight: 107,
            amountSats: 230_999n
          },
          {
            bidderId: "exact_soft_close",
            blockHeight: 107,
            amountSats: 231_000n
          },
          {
            bidderId: "at_close_boundary",
            blockHeight: 110,
            amountSats: 254_100n
          },
          {
            bidderId: "after_extended_close",
            blockHeight: 114,
            amountSats: 279_510n
          }
        ]
      }
    });

    expect(result.initialAuctionCloseBlock).toBe(110);
    expect(result.finalAuctionCloseBlock).toBe(113);
    expect(result.bidOutcomes.map((outcome) => outcome.reason)).toEqual([
      "opening_bid",
      "higher_bid",
      "below_minimum_increment",
      "higher_bid_soft_close_extended",
      "higher_bid_soft_close_extended",
      "auction_closed"
    ]);
    expect(result.bidOutcomes.map((outcome) => outcome.auctionCloseBlockAfter)).toEqual([
      110,
      110,
      110,
      110,
      113,
      113
    ]);
    expect(result.winner).toEqual({
      bidderId: "at_close_boundary",
      blockHeight: 110,
      amountSats: 254_100n
    });
  });

  it("accepts bids at the close boundary but rejects after it", () => {
    const defaultPolicy = createDefaultLaunchAuctionPolicy();
    const policy = {
      ...defaultPolicy,
      auction: {
        ...defaultPolicy.auction,
        softCloseExtensionBlocks: 0
      }
    };
    const result = simulateLaunchAuction({
      policy,
      scenario: {
        name: "marble",
        unlockBlock: 900_000,
        bidAttempts: [
          {
            bidderId: "alpha",
            blockHeight: 900_010,
            amountSats: 1_000_000_000n
          },
          {
            bidderId: "at_boundary",
            blockHeight: 901_018,
            amountSats: 1_100_000_000n
          },
          {
            bidderId: "after_boundary",
            blockHeight: 901_019,
            amountSats: 1_210_000_000n
          }
        ]
      }
    });

    expect(result.initialAuctionCloseBlock).toBe(901_018);
    expect(result.bidOutcomes.map((outcome) => outcome.reason)).toEqual([
      "opening_bid",
      "higher_bid",
      "auction_closed"
    ]);
    expect(result.winner?.bidderId).toBe("at_boundary");
  });

  it("round-trips scenarios and results through JSON-safe forms", () => {
    const policy = createDefaultLaunchAuctionPolicy();
    const scenario = parseLaunchAuctionScenario(
      JSON.parse(
        JSON.stringify(
          serializeLaunchAuctionScenario({
            name: "markzuckerberg",
            unlockBlock: 910_000,
            bidAttempts: [
              {
                bidderId: "speculator_a",
                blockHeight: 910_100,
                amountSats: 25_000_000n
              },
              {
                bidderId: "speculator_b",
                blockHeight: 910_101,
                amountSats: 30_000_000n
              }
            ]
          })
        )
      )
    );
    const result = simulateLaunchAuction({
      policy,
      scenario
    });
    const serializedResult = serializeLaunchAuctionSimulationResult(result);

    expect(serializedResult.winner?.amountSats).toBe("30000000");
    expect(serializedResult.bidOutcomes).toHaveLength(2);
    expect(serializedResult.bidOutcomes[1]?.status).toBe("accepted");
  });
});
