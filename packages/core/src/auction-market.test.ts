import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  parseLaunchAuctionMarketScenario,
  serializeLaunchAuctionMarketScenario,
  serializeLaunchAuctionMarketSimulationResult,
  simulateLaunchAuctionMarket
} from "./index.js";
import { createDefaultLaunchAuctionPolicy } from "./auction-policy.js";

interface MarketFixtureExpectation {
  readonly auctionWinners: Readonly<Record<string, string | null>>;
  readonly bidderSummaries: Readonly<
    Record<
      string,
      {
        readonly finalLockedSats: string;
        readonly peakLockedSats: string;
        readonly insufficientBudgetRejectCount: number;
      }
    >
  >;
  readonly chronologicalReasons: ReadonlyArray<string>;
}

interface MarketFixtureFile {
  readonly scenario: unknown;
  readonly expected: MarketFixtureExpectation;
}

const MARKET_FIXTURE_FILES = [
  "market-capital-pressure.json",
  "market-winner-locks-capital.json",
  "market-self-raise-delta.json"
] as const;

describe("auction market simulator", () => {
  it("round-trips market scenarios and results through JSON-safe forms", () => {
    const scenario = parseLaunchAuctionMarketScenario({
      bidderBudgetsSats: {
        alpha: "255000000",
        beta: "300000000"
      },
      auctions: [
        {
          auctionId: "meadow-main",
          name: "meadow",
          unlockBlock: 920000,
          bidAttempts: [
            {
              bidderId: "alpha",
              blockHeight: 920010,
              amountSats: "200000000"
            }
          ]
        }
      ]
    });
    const reparsed = parseLaunchAuctionMarketScenario(
      JSON.parse(JSON.stringify(serializeLaunchAuctionMarketScenario(scenario)))
    );
    const result = simulateLaunchAuctionMarket({
      policy: createDefaultLaunchAuctionPolicy(),
      scenario: reparsed
    });
    const serialized = serializeLaunchAuctionMarketSimulationResult(result);

    expect(reparsed).toEqual(scenario);
    expect(serialized.auctionResults[0]?.winner?.amountSats).toBe("200000000");
    expect(serialized.bidderSummaries[0]?.bidderId).toBe("alpha");
  });

  for (const fixtureFile of MARKET_FIXTURE_FILES) {
    it(`matches expected market outcome for ${fixtureFile}`, async () => {
      const fixture = await loadMarketFixture(fixtureFile);
      const result = simulateLaunchAuctionMarket({
        policy: createDefaultLaunchAuctionPolicy(),
        scenario: parseLaunchAuctionMarketScenario(fixture.scenario)
      });

      expect(
        Object.fromEntries(
          result.auctionResults.map((auction) => [auction.auctionId, auction.winner?.bidderId ?? null])
        )
      ).toEqual(fixture.expected.auctionWinners);

      for (const [bidderId, expectedSummary] of Object.entries(fixture.expected.bidderSummaries)) {
        const actual = result.bidderSummaries.find((summary) => summary.bidderId === bidderId);
        expect(actual?.finalLockedSats.toString()).toBe(expectedSummary.finalLockedSats);
        expect(actual?.peakLockedSats.toString()).toBe(expectedSummary.peakLockedSats);
        expect(actual?.insufficientBudgetRejectCount).toBe(expectedSummary.insufficientBudgetRejectCount);
      }

      expect(result.chronologicalBidOutcomes.map((outcome) => outcome.reason)).toEqual(
        fixture.expected.chronologicalReasons
      );
    });
  }
});

async function loadMarketFixture(fileName: string): Promise<MarketFixtureFile> {
  const fixtureUrl = new URL(`../../../fixtures/auction/${fileName}`, import.meta.url);
  const raw = await readFile(fixtureUrl, "utf8");
  return JSON.parse(raw) as MarketFixtureFile;
}
