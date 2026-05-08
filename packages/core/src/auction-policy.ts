import { getBondSats } from "@ont/protocol/bond";
import { normalizeName } from "@ont/protocol/names";

export const LAUNCH_AUCTION_CLASS_IDS = [
  "launch_name"
] as const;

export type LaunchAuctionClassId = (typeof LAUNCH_AUCTION_CLASS_IDS)[number];

export interface LaunchAuctionClassPolicy {
  readonly id: LaunchAuctionClassId;
  readonly label: string;
  readonly floorSats: bigint;
  readonly lockBlocks: number;
}

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
  readonly auction: LaunchAuctionSettings;
  readonly auctionClasses: Readonly<Record<LaunchAuctionClassId, LaunchAuctionClassPolicy>>;
}

export interface SerializedLaunchAuctionClassPolicy {
  readonly label: string;
  readonly floorSats: string;
  readonly lockBlocks: number;
}

export interface SerializedLaunchAuctionPolicy {
  readonly defaultSettlementLockBlocks: number;
  readonly auction: {
    readonly baseWindowBlocks: number;
    readonly softCloseExtensionBlocks: number;
    readonly minimumIncrementAbsoluteSats: string;
    readonly minimumIncrementBasisPoints: number;
    readonly softCloseMinimumIncrementAbsoluteSats: string;
    readonly softCloseMinimumIncrementBasisPoints: number;
  };
  readonly auctionClasses: Readonly<Record<LaunchAuctionClassId, SerializedLaunchAuctionClassPolicy>>;
}

export interface LaunchAuctionOpeningRequirements {
  readonly normalizedName: string;
  readonly baseMinimumBidSats: bigint;
  readonly classMinimumBidSats: bigint;
  readonly openingMinimumBidSats: bigint;
  readonly settlementLockBlocks: number;
  readonly classLabel: string;
}

export function createDefaultLaunchAuctionPolicy(): LaunchAuctionPolicy {
  return {
    defaultSettlementLockBlocks: 52_560,
    auction: {
      baseWindowBlocks: 1_008,
      softCloseExtensionBlocks: 144,
      minimumIncrementAbsoluteSats: 1_000n,
      minimumIncrementBasisPoints: 500,
      softCloseMinimumIncrementAbsoluteSats: 1_000n,
      softCloseMinimumIncrementBasisPoints: 1_000
    },
    auctionClasses: {
      launch_name: {
        id: "launch_name",
        label: "Public auction",
        floorSats: 50_000n,
        lockBlocks: 52_560
      }
    }
  };
}

export function getDefaultLaunchAuctionClassIdForName(name: string): LaunchAuctionClassId {
  void name;
  return "launch_name";
}

export function getLaunchAuctionClass(
  policy: LaunchAuctionPolicy,
  classId: LaunchAuctionClassId
): LaunchAuctionClassPolicy {
  return policy.auctionClasses[classId];
}

export function getLaunchAuctionOpeningRequirements(input: {
  readonly policy: LaunchAuctionPolicy;
  readonly name: string;
  readonly auctionClassId: LaunchAuctionClassId;
}): LaunchAuctionOpeningRequirements {
  const normalizedName = normalizeName(input.name);
  const auctionClass = getLaunchAuctionClass(input.policy, input.auctionClassId);
  const baseMinimumBidSats = getBondSats(normalizedName.length);
  const classMinimumBidSats = auctionClass.floorSats;

  return {
    normalizedName,
    baseMinimumBidSats,
    classMinimumBidSats,
    openingMinimumBidSats:
      baseMinimumBidSats > classMinimumBidSats ? baseMinimumBidSats : classMinimumBidSats,
    settlementLockBlocks: auctionClass.lockBlocks,
    classLabel: auctionClass.label
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
    auction: {
      baseWindowBlocks: policy.auction.baseWindowBlocks,
      softCloseExtensionBlocks: policy.auction.softCloseExtensionBlocks,
      minimumIncrementAbsoluteSats: policy.auction.minimumIncrementAbsoluteSats.toString(),
      minimumIncrementBasisPoints: policy.auction.minimumIncrementBasisPoints,
      softCloseMinimumIncrementAbsoluteSats: policy.auction.softCloseMinimumIncrementAbsoluteSats.toString(),
      softCloseMinimumIncrementBasisPoints: policy.auction.softCloseMinimumIncrementBasisPoints
    },
    auctionClasses: {
      launch_name: serializeLaunchAuctionClass(policy.auctionClasses.launch_name)
    }
  };
}

export function parseLaunchAuctionPolicy(input: unknown): LaunchAuctionPolicy {
  const record = assertRecord(input, "auction policy");
  const auctionClasses = assertRecord(record.auctionClasses, "auction policy classes");
  const auction = assertRecord(record.auction, "auction policy auction");

  return {
    defaultSettlementLockBlocks: parseNonNegativeSafeInteger(record.defaultSettlementLockBlocks, "defaultSettlementLockBlocks"),
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
    },
    auctionClasses: {
      launch_name: parseLaunchAuctionClassPolicy(
        "launch_name",
        auctionClasses.launch_name
      )
    }
  };
}

function serializeLaunchAuctionClass(
  auctionClass: LaunchAuctionClassPolicy
): SerializedLaunchAuctionClassPolicy {
  return {
    label: auctionClass.label,
    floorSats: auctionClass.floorSats.toString(),
    lockBlocks: auctionClass.lockBlocks
  };
}

function parseLaunchAuctionClassPolicy(
  classId: LaunchAuctionClassId,
  input: unknown
): LaunchAuctionClassPolicy {
  const record = assertRecord(input, `auction class ${classId}`);

  return {
    id: classId,
    label: parseString(record.label, `${classId}.label`),
    floorSats: parseBigIntLike(record.floorSats, `${classId}.floorSats`),
    lockBlocks: parseNonNegativeSafeInteger(record.lockBlocks, `${classId}.lockBlocks`)
  };
}

function parseString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }

  return value;
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
