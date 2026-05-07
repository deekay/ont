import { describe, expect, it } from "vitest";

import {
  calculateLaunchAuctionMinimumIncrementBidSats,
  createDefaultLaunchAuctionPolicy,
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
});

describe("simulateLaunchAuction", () => {
  it("uses the neutral length floor when it exceeds the launch auction floor", () => {
    const policy = createDefaultLaunchAuctionPolicy();
    const result = simulateLaunchAuction({
      policy,
      scenario: {
        name: "silverpine",
        auctionClassId: "launch_name",
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
    expect(result.openingMinimumBidSats).toBe(195_312n);
    expect(result.winner?.amountSats).toBe(25_000_000n);
    expect(result.settlementLockBlocks).toBe(policy.auctionClasses.launch_name.lockBlocks);
  });

  it("rejects bids before opening, rejects low increments, and extends on soft close", () => {
    const policy = createDefaultLaunchAuctionPolicy();
    const result = simulateLaunchAuction({
      policy,
      scenario: {
        name: "marble",
        auctionClassId: "launch_name",
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
            blockHeight: 844_200,
            amountSats: 1_020_000_000n
          },
          {
            bidderId: "beta",
            blockHeight: 844_210,
            amountSats: 1_100_000_000n
          },
          {
            bidderId: "gamma",
            blockHeight: 844_353,
            amountSats: 1_210_000_000n
          },
          {
            bidderId: "late",
            blockHeight: 844_500,
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
    expect(result.initialAuctionCloseBlock).toBe(844_330);
    expect(result.finalAuctionCloseBlock).toBe(844_497);
    expect(result.winner).toEqual({
      bidderId: "gamma",
      blockHeight: 844_353,
      amountSats: 1_210_000_000n
    });
  });

  it("returns unopened when no accepted opening bid exists", () => {
    const policy = createDefaultLaunchAuctionPolicy();
    const result = simulateLaunchAuction({
      policy,
      scenario: {
        name: "meadow",
        auctionClassId: "launch_name",
        unlockBlock: 900_000,
        bidAttempts: [
          {
            bidderId: "speculator_a",
            blockHeight: 900_010,
            amountSats: 3_124_999n
          }
        ]
      }
    });

    expect(result.status).toBe("unopened");
    expect(result.winner).toBeNull();
    expect(result.bidOutcomes[0]?.reason).toBe("below_opening_minimum");
  });

  it("round-trips scenarios and results through JSON-safe forms", () => {
    const policy = createDefaultLaunchAuctionPolicy();
    const scenario = parseLaunchAuctionScenario(
      JSON.parse(
        JSON.stringify(
          serializeLaunchAuctionScenario({
            name: "markzuckerberg",
            auctionClassId: "launch_name",
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
