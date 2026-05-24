import { describe, expect, it } from "vitest";

import {
  createDefaultSponsoredFlatIssuanceScenario,
  parseSponsoredFlatIssuanceScenario,
  simulateSponsoredFlatIssuance
} from "./index.js";

describe("sponsored flat issuance simulator", () => {
  it("starts sponsor credits only after the maturity cliff", () => {
    const result = simulateSponsoredFlatIssuance({
      ...createDefaultSponsoredFlatIssuanceScenario(),
      years: 3,
      directBondedNamesPerYear: 100,
      averageDirectBondBtc: 1,
      averageContestedAuctionBondBtc: 1,
      sponsorMaturityYears: 1,
      sponsorBondRetentionRate: 1,
      baseCreditsPerBtcYear: 100,
      ageMultiplierExponent: 1,
      ageMultiplierCap: 1,
      desiredSponsoredClaimsPerYear: 1_000_000,
      cleanClaimCreditCost: 1,
      contestedClaimCreditCost: 100,
      contestRate: 0,
      contestedAuctionSettlementRate: 1
    });

    expect(result.years[0]?.creditsEarned).toBe(0);
    expect(result.years[0]?.sponsoredFinalizedNames).toBe(0);
    expect(result.years[1]?.eligibleSponsorBtc).toBe(100);
    expect(result.years[1]?.sponsoredFinalizedNames).toBe(10_000);
    expect(result.years[2]?.eligibleSponsorBtc).toBe(200);
    expect(result.years[2]?.sponsoredFinalizedNames).toBe(20_000);
  });

  it("applies capped age multipliers to active mature bonds", () => {
    const result = simulateSponsoredFlatIssuance({
      ...createDefaultSponsoredFlatIssuanceScenario(),
      years: 4,
      directBondedNamesPerYear: 10,
      averageDirectBondBtc: 1,
      sponsorMaturityYears: 1,
      sponsorBondRetentionRate: 1,
      baseCreditsPerBtcYear: 100,
      ageMultiplierExponent: 2,
      ageMultiplierCap: 3,
      desiredSponsoredClaimsPerYear: 1_000_000,
      cleanClaimCreditCost: 1,
      contestedClaimCreditCost: 100,
      contestRate: 0
    });

    expect(result.years[1]?.weightedSponsorBtc).toBe(10);
    expect(result.years[2]?.weightedSponsorBtc).toBe(40);
    expect(result.years[3]?.weightedSponsorBtc).toBe(70);
  });

  it("burns more credits for contested claims and turns settled contests into bonded names", () => {
    const result = simulateSponsoredFlatIssuance({
      ...createDefaultSponsoredFlatIssuanceScenario(),
      years: 2,
      directBondedNamesPerYear: 100,
      averageDirectBondBtc: 1,
      averageContestedAuctionBondBtc: 2,
      sponsorMaturityYears: 1,
      sponsorBondRetentionRate: 1,
      baseCreditsPerBtcYear: 10_000,
      ageMultiplierExponent: 1,
      ageMultiplierCap: 1,
      desiredSponsoredClaimsPerYear: 1_000,
      cleanClaimCreditCost: 1,
      contestedClaimCreditCost: 101,
      contestRate: 0.1,
      contestedAuctionSettlementRate: 1
    });

    const year2 = result.years[1];
    expect(year2?.sponsoredClaimsProcessed).toBe(1_000);
    expect(year2?.sponsoredFinalizedNames).toBe(900);
    expect(year2?.contestedClaims).toBe(100);
    expect(year2?.contestedAuctionSettledNames).toBe(100);
    expect(year2?.creditsBurned).toBe(11_000);
    expect(year2?.newBondedNames).toBe(200);
    expect(year2?.newBondedBtc).toBe(300);
  });

  it("caps contested auction settlement and reports backlog", () => {
    const result = simulateSponsoredFlatIssuance({
      ...createDefaultSponsoredFlatIssuanceScenario(),
      years: 2,
      directBondedNamesPerYear: 100,
      averageDirectBondBtc: 1,
      averageContestedAuctionBondBtc: 1,
      sponsorMaturityYears: 1,
      sponsorBondRetentionRate: 1,
      baseCreditsPerBtcYear: 10_000,
      ageMultiplierExponent: 1,
      ageMultiplierCap: 1,
      desiredSponsoredClaimsPerYear: 10_000,
      cleanClaimCreditCost: 1,
      contestedClaimCreditCost: 1,
      contestRate: 0.5,
      contestedAuctionSettlementRate: 1,
      maxContestedAuctionSettlementsPerYear: 100
    });

    const year2 = result.years[1];
    expect(year2?.contestedClaims).toBe(5_000);
    expect(year2?.contestedAuctionSettledNames).toBe(100);
    expect(year2?.contestedAuctionBacklogNames).toBe(4_900);
    expect(year2?.newBondedNames).toBe(200);
  });

  it("limits processed claims when credits are scarce", () => {
    const result = simulateSponsoredFlatIssuance({
      ...createDefaultSponsoredFlatIssuanceScenario(),
      years: 2,
      directBondedNamesPerYear: 1,
      averageDirectBondBtc: 1,
      sponsorMaturityYears: 1,
      sponsorBondRetentionRate: 1,
      baseCreditsPerBtcYear: 100,
      ageMultiplierExponent: 1,
      ageMultiplierCap: 1,
      desiredSponsoredClaimsPerYear: 1_000,
      cleanClaimCreditCost: 2,
      contestedClaimCreditCost: 2,
      contestRate: 0
    });

    expect(result.years[1]?.creditsAvailable).toBe(100);
    expect(result.years[1]?.sponsoredClaimsProcessed).toBe(50);
    expect(result.years[1]?.sponsoredFinalizedNames).toBe(50);
  });

  it("reports adversarial risk metrics without changing issuance counts", () => {
    const result = simulateSponsoredFlatIssuance({
      ...createDefaultSponsoredFlatIssuanceScenario(),
      years: 2,
      directBondedNamesPerYear: 100,
      averageDirectBondBtc: 1,
      sponsorMaturityYears: 1,
      sponsorBondRetentionRate: 1,
      baseCreditsPerBtcYear: 1_000,
      ageMultiplierExponent: 1,
      ageMultiplierCap: 1,
      desiredSponsoredClaimsPerYear: 1_000,
      cleanClaimCreditCost: 1,
      contestedClaimCreditCost: 1,
      contestRate: 0.1,
      invalidChallengeRate: 0.2,
      unfairDiscoveryRiskRate: 0.3,
      transferableInventoryRate: 0.4,
      topSponsorCreditShare: 0.5
    });

    const year2 = result.years[1];
    expect(year2?.sponsoredClaimsProcessed).toBe(1_000);
    expect(year2?.sponsoredFinalizedNames).toBe(900);
    expect(year2?.invalidChallengeEvents).toBe(200);
    expect(year2?.unfairDiscoveryRiskNames).toBe(270);
    expect(year2?.transferableInventoryRiskNames).toBe(360);
    expect(year2?.topSponsorFinalizedNames).toBe(450);
    expect(result.summary.cumulativeInvalidChallengeEvents).toBe(200);
    expect(result.summary.cumulativeUnfairDiscoveryRiskNames).toBe(270);
    expect(result.summary.cumulativeTransferableInventoryRiskNames).toBe(360);
    expect(result.summary.cumulativeTopSponsorFinalizedNames).toBe(450);
  });

  it("round-trips JSON-like scenario input", () => {
    const scenario = parseSponsoredFlatIssuanceScenario({
      years: "2",
      directBondedNamesPerYear: "500000",
      averageDirectBondBtc: "0.02",
      contestRate: "0.05",
      invalidChallengeRate: "0.1",
      unfairDiscoveryRiskRate: "0.2"
    });
    const result = simulateSponsoredFlatIssuance(scenario);

    expect(scenario.years).toBe(2);
    expect(scenario.directBondedNamesPerYear).toBe(500_000);
    expect(scenario.averageDirectBondBtc).toBe(0.02);
    expect(scenario.invalidChallengeRate).toBe(0.1);
    expect(scenario.unfairDiscoveryRiskRate).toBe(0.2);
    expect(result.years).toHaveLength(2);
  });
});
