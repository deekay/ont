import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { createAuctionBidPackage, type AuctionBidPackage } from "@ont/protocol";
import {
  createDefaultLaunchAuctionPolicy,
  getExperimentalLaunchAuctionId,
  getLaunchAuctionOpeningRequirements,
  parseLaunchAuctionScenario,
  serializeLaunchAuctionPolicy,
  serializeLaunchAuctionStateAtBlock,
  simulateLaunchAuctionStateAtBlock,
  type SerializedLaunchAuctionPolicy
} from "@ont/core";

interface AuctionLabFixtureFile {
  readonly title: string;
  readonly description: string;
  readonly currentBlockHeight: number;
  readonly scenario: unknown;
}

export interface AuctionLabCase {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly state: ReturnType<typeof serializeLaunchAuctionStateAtBlock>;
}

export interface LaunchAuctionLabPayload {
  readonly kind: "auction_lab";
  readonly policy: SerializedLaunchAuctionPolicy;
  readonly cases: ReadonlyArray<AuctionLabCase>;
}

interface WebsiteAuctionBidPackageStateInput {
  readonly auctionId: string;
  readonly normalizedName: string;
  readonly auctionClassId: string;
  readonly classLabel: string;
  readonly currentBlockHeight: number;
  readonly phase: string;
  readonly unlockBlock: number;
  readonly auctionCloseBlockAfter: number | null;
  readonly openingMinimumBidSats: string;
  readonly currentLeaderBidderId?: string | null;
  readonly currentLeaderBidderCommitment?: string | null;
  readonly currentHighestBidSats: string | null;
  readonly currentRequiredMinimumBidSats: string | null;
  readonly settlementLockBlocks: number;
  readonly blocksUntilUnlock: number;
  readonly blocksUntilClose: number | null;
  readonly baseMinimumBidSats?: string;
}

const AUCTION_LAB_FIXTURE_DIR =
  process.env.ONT_EXPERIMENTAL_AUCTION_FIXTURE_DIR?.trim()
  || fileURLToPath(new URL("../../../fixtures/auction/lab", import.meta.url));
const UNIVERSAL_LAUNCH_AUCTION_UNLOCK_BLOCK = 0;

export async function loadLaunchAuctionLab(): Promise<LaunchAuctionLabPayload> {
  const policy = createDefaultLaunchAuctionPolicy();
  const policyPayload = serializeLaunchAuctionPolicy(policy);
  const fixtureFileNames = (await readdir(AUCTION_LAB_FIXTURE_DIR))
    .filter((name) => name.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right));

  const casesWithLegacy = await Promise.all(
    fixtureFileNames.map(async (fileName) => {
      const raw = await readFile(`${AUCTION_LAB_FIXTURE_DIR}/${fileName}`, "utf8");
      const fixture = JSON.parse(raw) as AuctionLabFixtureFile;
      const scenario = parseLaunchAuctionScenario(fixture.scenario);
      const state = simulateLaunchAuctionStateAtBlock({
        policy,
        scenario,
        currentBlockHeight: fixture.currentBlockHeight
      });

      return {
        id: fileName.replace(/\.json$/u, ""),
        title: fixture.title,
        description: fixture.description,
        state: serializeLaunchAuctionStateAtBlock(state)
      } satisfies AuctionLabCase;
    })
  );
  const cases = casesWithLegacy.filter(
    (entry) =>
      entry.state.phase !== "pending_unlock"
      && !entry.id.includes("legacy")
      && !entry.id.includes("released")
  );

  return {
    kind: "auction_lab",
    policy: policyPayload,
    cases
  };
}

export async function createLaunchAuctionLabBidPackage(input: {
  readonly caseId: string;
  readonly bidderId: string;
  readonly ownerPubkey: string;
  readonly bidAmountSats: bigint | number | string;
}): Promise<AuctionBidPackage> {
  const payload = await loadLaunchAuctionLab();
  const auctionCase = payload.cases.find((entry) => entry.id === input.caseId);

  if (!auctionCase) {
    throw new Error(`Unknown auction lab case: ${input.caseId}`);
  }

  return createWebsiteAuctionBidPackage({
    auctionState: {
      auctionId: auctionCase.id,
      normalizedName: auctionCase.state.normalizedName,
      auctionClassId: auctionCase.state.auctionClassId,
      classLabel: auctionCase.state.classLabel,
      currentBlockHeight: auctionCase.state.currentBlockHeight,
      phase: auctionCase.state.phase,
      unlockBlock: auctionCase.state.unlockBlock,
      auctionCloseBlockAfter: auctionCase.state.auctionCloseBlockAfter,
      openingMinimumBidSats: auctionCase.state.openingMinimumBidSats,
      currentLeaderBidderId: auctionCase.state.currentLeaderBidderId,
      currentHighestBidSats: auctionCase.state.currentHighestBidSats,
      currentRequiredMinimumBidSats: auctionCase.state.currentRequiredMinimumBidSats,
      settlementLockBlocks: auctionCase.state.settlementLockBlocks,
      blocksUntilUnlock: auctionCase.state.blocksUntilUnlock,
      blocksUntilClose: auctionCase.state.blocksUntilClose,
      baseMinimumBidSats: auctionCase.state.baseMinimumBidSats
    },
    bidderId: input.bidderId,
    ownerPubkey: input.ownerPubkey,
    bidAmountSats: input.bidAmountSats,
    sourceLabel: `auction example ${auctionCase.id}`
  });
}

export function createLaunchAuctionOpeningBidPackage(input: {
  readonly name: string;
  readonly currentBlockHeight: number;
  readonly bidderId: string;
  readonly ownerPubkey: string;
  readonly bidAmountSats: bigint | number | string;
  readonly unlockBlock?: number;
}): AuctionBidPackage {
  const policy = createDefaultLaunchAuctionPolicy();
  const requirements = getLaunchAuctionOpeningRequirements({
    policy,
    name: input.name,
    auctionClassId: "launch_name"
  });
  const unlockBlock = input.unlockBlock ?? UNIVERSAL_LAUNCH_AUCTION_UNLOCK_BLOCK;

  return createWebsiteAuctionBidPackage({
    auctionState: {
      auctionId: getExperimentalLaunchAuctionId({
        name: requirements.normalizedName,
        unlockBlock
      }),
      normalizedName: requirements.normalizedName,
      auctionClassId: "launch_name",
      classLabel: requirements.classLabel,
      currentBlockHeight: input.currentBlockHeight,
      phase: input.currentBlockHeight < unlockBlock ? "pending_unlock" : "awaiting_opening_bid",
      unlockBlock,
      auctionCloseBlockAfter: null,
      openingMinimumBidSats: requirements.openingMinimumBidSats.toString(),
      currentLeaderBidderId: null,
      currentLeaderBidderCommitment: null,
      currentHighestBidSats: null,
      currentRequiredMinimumBidSats: requirements.openingMinimumBidSats.toString(),
      settlementLockBlocks: requirements.settlementLockBlocks,
      blocksUntilUnlock: Math.max(0, unlockBlock - input.currentBlockHeight),
      blocksUntilClose: null,
      baseMinimumBidSats: requirements.baseMinimumBidSats.toString()
    },
    bidderId: input.bidderId,
    ownerPubkey: input.ownerPubkey,
    bidAmountSats: input.bidAmountSats,
    sourceLabel: `opening bid for ${requirements.normalizedName}`
  });
}

export function createExperimentalAuctionFeedBidPackage(input: {
  readonly auction: WebsiteAuctionBidPackageStateInput;
  readonly bidderId: string;
  readonly ownerPubkey: string;
  readonly bidAmountSats: bigint | number | string;
}): AuctionBidPackage {
  return createWebsiteAuctionBidPackage({
    auctionState: input.auction,
    bidderId: input.bidderId,
    ownerPubkey: input.ownerPubkey,
    bidAmountSats: input.bidAmountSats,
    sourceLabel: `live auction ${input.auction.auctionId}`
  });
}

function createWebsiteAuctionBidPackage(input: {
  readonly auctionState: WebsiteAuctionBidPackageStateInput;
  readonly bidderId: string;
  readonly ownerPubkey: string;
  readonly bidAmountSats: bigint | number | string;
  readonly sourceLabel: string;
}): AuctionBidPackage {
  assertAuctionStateAllowsWebsiteBidPackage(input.auctionState, input.sourceLabel);

  return createAuctionBidPackage({
    auctionId: input.auctionState.auctionId,
    name: input.auctionState.normalizedName,
    auctionClassId: input.auctionState.auctionClassId,
    classLabel: input.auctionState.classLabel,
    currentBlockHeight: input.auctionState.currentBlockHeight,
    phase: input.auctionState.phase as
      | "pending_unlock"
      | "awaiting_opening_bid"
      | "live_bidding"
      | "soft_close",
    unlockBlock: input.auctionState.unlockBlock,
    auctionCloseBlockAfter: input.auctionState.auctionCloseBlockAfter,
    openingMinimumBidSats: input.auctionState.openingMinimumBidSats,
    ...(input.auctionState.currentLeaderBidderId === undefined
      ? {}
      : { currentLeaderBidderId: input.auctionState.currentLeaderBidderId }),
    ...(input.auctionState.currentLeaderBidderCommitment === undefined
      ? {}
      : { currentLeaderBidderCommitment: input.auctionState.currentLeaderBidderCommitment }),
    currentHighestBidSats: input.auctionState.currentHighestBidSats,
    currentRequiredMinimumBidSats: input.auctionState.currentRequiredMinimumBidSats,
    settlementLockBlocks: input.auctionState.settlementLockBlocks,
    blocksUntilUnlock: input.auctionState.blocksUntilUnlock,
    blocksUntilClose: input.auctionState.blocksUntilClose,
    bidderId: input.bidderId,
    ownerPubkey: input.ownerPubkey,
    bidAmountSats: input.bidAmountSats
  });
}

function assertAuctionStateAllowsWebsiteBidPackage(
  auctionState: WebsiteAuctionBidPackageStateInput,
  sourceLabel: string
): void {
  if (auctionState.phase === "settled") {
    throw new Error(
      `Auction for ${auctionState.normalizedName} from ${sourceLabel} is already settled and no longer accepts new bids.`
    );
  }
}
