import { buildAuctionBidArtifacts, parseFundingInputDescriptor } from "@ont/architect/browser";
import {
  createAuctionBidPackage,
  type AuctionBidPackage
} from "@ont/protocol";
import {
  createDefaultLaunchAuctionPolicy,
  getLaunchAuctionOpeningRequirements
} from "@ont/core/auction-policy";
import { getExperimentalLaunchAuctionId } from "@ont/core/experimental-auction";

type WebsiteAuctionBidPackageStateInput = {
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
};

export function buildOpeningAuctionBidPackage(input: {
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
  const unlockBlock = input.unlockBlock ?? 0;

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

export function buildLiveAuctionBidPackage(input: {
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

export function buildBrowserAuctionBidArtifacts(input: {
  readonly bidPackage: AuctionBidPackage;
  readonly fundingInputs: readonly string[];
  readonly feeSats: bigint | number | string;
  readonly network?: "main" | "signet" | "testnet" | "regtest";
  readonly bondAddress: string;
  readonly changeAddress?: string;
}) {
  return buildAuctionBidArtifacts({
    bidPackage: input.bidPackage,
    fundingInputs: input.fundingInputs.map(parseFundingInputDescriptor),
    feeSats: BigInt(input.feeSats),
    network: input.network ?? "signet",
    bondAddress: input.bondAddress,
    ...(input.changeAddress ? { changeAddress: input.changeAddress } : {})
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
