import { getBondSats } from "@ont/protocol/bond";
import {
  AUCTION_BOND_FLOOR_SATS,
  AUCTION_MIN_INCREMENT_SATS,
  BOND_MATURITY_BLOCKS
} from "@ont/protocol";
import { normalizeName } from "@ont/protocol/names";

export interface LaunchAuctionSettings {
  readonly baseWindowBlocks: number;
  readonly softCloseExtensionBlocks: number;
  readonly minimumIncrementAbsoluteSats: bigint;
  readonly minimumIncrementBasisPoints: number;
  readonly softCloseMinimumIncrementAbsoluteSats: bigint;
  readonly softCloseMinimumIncrementBasisPoints: number;
}

export interface LaunchAuctionPolicy {
  readonly defaultSettlementLockBlocks: number;
  readonly openingFloorSats: bigint;
  readonly auction: LaunchAuctionSettings;
}

export interface SerializedLaunchAuctionPolicy {
  readonly defaultSettlementLockBlocks: number;
  readonly openingFloorSats: string;
  readonly auction: {
    readonly baseWindowBlocks: number;
    readonly softCloseExtensionBlocks: number;
    readonly minimumIncrementAbsoluteSats: string;
    readonly minimumIncrementBasisPoints: number;
    readonly softCloseMinimumIncrementAbsoluteSats: string;
    readonly softCloseMinimumIncrementBasisPoints: number;
  };
}

export interface LaunchAuctionOpeningRequirements {
  readonly normalizedName: string;
  readonly baseMinimumBidSats: bigint;
  readonly floorMinimumBidSats: bigint;
  readonly openingMinimumBidSats: bigint;
  readonly settlementLockBlocks: number;
}

export function createDefaultLaunchAuctionPolicy(): LaunchAuctionPolicy {
  return {
    defaultSettlementLockBlocks: BOND_MATURITY_BLOCKS,
    openingFloorSats: AUCTION_BOND_FLOOR_SATS,
    auction: {
      baseWindowBlocks: 1_008,
      softCloseExtensionBlocks: 144,
      minimumIncrementAbsoluteSats: AUCTION_MIN_INCREMENT_SATS,
      minimumIncrementBasisPoints: 500,
      softCloseMinimumIncrementAbsoluteSats: AUCTION_MIN_INCREMENT_SATS,
      softCloseMinimumIncrementBasisPoints: 1_000
    }
  };
}

export function getLaunchAuctionOpeningRequirements(input: {
  readonly policy: LaunchAuctionPolicy;
  readonly name: string;
}): LaunchAuctionOpeningRequirements {
  const normalizedName = normalizeName(input.name);
  const baseMinimumBidSats = getBondSats(normalizedName.length);
  const floorMinimumBidSats = input.policy.openingFloorSats;

  return {
    normalizedName,
    baseMinimumBidSats,
    floorMinimumBidSats,
    openingMinimumBidSats:
      baseMinimumBidSats > floorMinimumBidSats ? baseMinimumBidSats : floorMinimumBidSats,
    settlementLockBlocks: input.policy.defaultSettlementLockBlocks
  };
}

export function calculateLaunchAuctionMinimumIncrementBidSats(input: {
  readonly currentBidSats: bigint;
  readonly policy: LaunchAuctionPolicy;
  readonly useSoftCloseIncrement?: boolean;
}): bigint {
  const minimumIncrementAbsoluteSats = input.useSoftCloseIncrement
    ? input.policy.auction.softCloseMinimumIncrementAbsoluteSats
    : input.policy.auction.minimumIncrementAbsoluteSats;
  const minimumIncrementBasisPoints = input.useSoftCloseIncrement
    ? input.policy.auction.softCloseMinimumIncrementBasisPoints
    : input.policy.auction.minimumIncrementBasisPoints;
  const absoluteMinimum = input.currentBidSats + minimumIncrementAbsoluteSats;
  const percentageMinimum = divideCeil(
    input.currentBidSats * BigInt(10_000 + minimumIncrementBasisPoints),
    10_000n
  );
  const minimum = absoluteMinimum > percentageMinimum ? absoluteMinimum : percentageMinimum;

  return minimum > input.currentBidSats ? minimum : input.currentBidSats + 1n;
}

export function isLaunchAuctionSoftCloseWindow(input: {
  readonly currentBlockHeight: number;
  readonly auctionCloseBlockAfter: number | null;
  readonly policy: LaunchAuctionPolicy;
}): boolean {
  return (
    input.auctionCloseBlockAfter !== null
    && input.policy.auction.softCloseExtensionBlocks > 0
    && input.currentBlockHeight >= input.auctionCloseBlockAfter - input.policy.auction.softCloseExtensionBlocks
    && input.currentBlockHeight <= input.auctionCloseBlockAfter
  );
}

export function serializeLaunchAuctionPolicy(
  policy: LaunchAuctionPolicy
): SerializedLaunchAuctionPolicy {
  return {
    defaultSettlementLockBlocks: policy.defaultSettlementLockBlocks,
    openingFloorSats: policy.openingFloorSats.toString(),
    auction: {
      baseWindowBlocks: policy.auction.baseWindowBlocks,
      softCloseExtensionBlocks: policy.auction.softCloseExtensionBlocks,
      minimumIncrementAbsoluteSats: policy.auction.minimumIncrementAbsoluteSats.toString(),
      minimumIncrementBasisPoints: policy.auction.minimumIncrementBasisPoints,
      softCloseMinimumIncrementAbsoluteSats: policy.auction.softCloseMinimumIncrementAbsoluteSats.toString(),
      softCloseMinimumIncrementBasisPoints: policy.auction.softCloseMinimumIncrementBasisPoints
    }
  };
}

export function parseLaunchAuctionPolicy(input: unknown): LaunchAuctionPolicy {
  const record = assertRecord(input, "auction policy");
  const auction = assertRecord(record.auction, "auction policy auction");

  return {
    defaultSettlementLockBlocks: parseNonNegativeSafeInteger(record.defaultSettlementLockBlocks, "defaultSettlementLockBlocks"),
    openingFloorSats: parseBigIntLike(record.openingFloorSats, "openingFloorSats"),
    auction: {
      baseWindowBlocks: parseNonNegativeSafeInteger(auction.baseWindowBlocks, "auction.baseWindowBlocks"),
      softCloseExtensionBlocks: parseNonNegativeSafeInteger(
        auction.softCloseExtensionBlocks,
        "auction.softCloseExtensionBlocks"
      ),
      minimumIncrementAbsoluteSats: parseBigIntLike(
        auction.minimumIncrementAbsoluteSats,
        "auction.minimumIncrementAbsoluteSats"
      ),
      minimumIncrementBasisPoints: parseNonNegativeSafeInteger(
        auction.minimumIncrementBasisPoints,
        "auction.minimumIncrementBasisPoints"
      ),
      softCloseMinimumIncrementAbsoluteSats: parseBigIntLike(
        auction.softCloseMinimumIncrementAbsoluteSats,
        "auction.softCloseMinimumIncrementAbsoluteSats"
      ),
      softCloseMinimumIncrementBasisPoints: parseNonNegativeSafeInteger(
        auction.softCloseMinimumIncrementBasisPoints,
        "auction.softCloseMinimumIncrementBasisPoints"
      )
    }
  };
}

function parseBigIntLike(value: unknown, label: string): bigint {
  if (typeof value === "bigint") {
    if (value < 0n) {
      throw new Error(`${label} must be non-negative`);
    }

    return value;
  }

  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${label} must be a non-negative safe integer when provided as a number`);
    }

    return BigInt(value);
  }

  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    return BigInt(value);
  }

  throw new Error(`${label} must be a non-negative integer string`);
}

function parseNonNegativeSafeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }

  return value;
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value as Record<string, unknown>;
}

function divideCeil(dividend: bigint, divisor: bigint): bigint {
  return (dividend + divisor - 1n) / divisor;
}
