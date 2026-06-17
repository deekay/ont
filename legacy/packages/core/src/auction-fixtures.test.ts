import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  createDefaultLaunchAuctionPolicy,
  parseLaunchAuctionScenario,
  simulateLaunchAuction
} from "./index.js";

interface AuctionFixtureExpectation {
  readonly status: "unopened" | "settled";
  readonly winnerBidderId: string | null;
  readonly winnerAmountSats: string | null;
  readonly initialAuctionCloseBlock: number | null;
  readonly finalAuctionCloseBlock: number | null;
  readonly reasons: ReadonlyArray<string>;
}

interface AuctionFixtureFile {
  readonly scenario: unknown;
  readonly expected: AuctionFixtureExpectation;
}

const FIXTURE_FILES = [
  "marble-competitive.json",
  "meadow-moderate.json",
  "silverpine-thin-market.json",
  "unopened-eligible.json",
  "underfloor-opening-bid.json",
  "soft-close-tail.json"
] as const;

describe("auction fixture coverage", () => {
  for (const fixtureFile of FIXTURE_FILES) {
    it(`matches expected outcome for ${fixtureFile}`, async () => {
      const fixture = await loadAuctionFixture(fixtureFile);
      const result = simulateLaunchAuction({
        policy: createDefaultLaunchAuctionPolicy(),
        scenario: parseLaunchAuctionScenario(fixture.scenario)
      });

      expect(result.status).toBe(fixture.expected.status);
      expect(result.winner?.bidderId ?? null).toBe(fixture.expected.winnerBidderId);
      expect(result.winner?.amountSats.toString() ?? null).toBe(fixture.expected.winnerAmountSats);
      expect(result.initialAuctionCloseBlock).toBe(fixture.expected.initialAuctionCloseBlock);
      expect(result.finalAuctionCloseBlock).toBe(fixture.expected.finalAuctionCloseBlock);
      expect(result.bidOutcomes.map((outcome) => outcome.reason)).toEqual(fixture.expected.reasons);
    });
  }
});

async function loadAuctionFixture(fileName: string): Promise<AuctionFixtureFile> {
  const fixtureUrl = new URL(`../../../fixtures/auction/${fileName}`, import.meta.url);
  const raw = await readFile(fixtureUrl, "utf8");
  return JSON.parse(raw) as AuctionFixtureFile;
}
