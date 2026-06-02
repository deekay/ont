import { assertHexBytes } from "./bytes.js";
import { PROTOCOL_NAME } from "./constants.js";
import { concatBytes, sha256Hex, utf8ToBytes } from "./crypto.js";
import { normalizeName } from "./names.js";

export const AUCTION_BID_PACKAGE_FORMAT = "ont-auction-bid-package";
export const AUCTION_BID_PACKAGE_VERSION = 3;

export type AuctionBidPackagePhase =
  | "pending_unlock"
  | "awaiting_opening_bid"
  | "live_bidding"
  | "soft_close"
  | "settled";

export type AuctionBidPackagePreviewStatus =
  | "too_early"
  | "below_minimum"
  | "currently_valid"
  | "auction_closed";

export interface AuctionBidPackage {
  readonly format: typeof AUCTION_BID_PACKAGE_FORMAT;
  readonly packageVersion: typeof AUCTION_BID_PACKAGE_VERSION;
  readonly protocol: typeof PROTOCOL_NAME;
  readonly exportedAt: string;
  readonly auctionId: string;
  readonly name: string;
  readonly currentBlockHeight: number;
  readonly phase: AuctionBidPackagePhase;
  readonly unlockBlock: number;
  readonly auctionCloseBlockAfter: number | null;
  readonly openingMinimumBidSats: string;
  readonly currentLeaderBidderId: string | null;
  readonly currentLeaderBidderCommitment: string | null;
  readonly currentHighestBidSats: string | null;
  readonly currentRequiredMinimumBidSats: string | null;
  readonly settlementLockBlocks: number;
  readonly blocksUntilUnlock: number;
  readonly blocksUntilClose: number | null;
  readonly bidderId: string;
  readonly ownerPubkey: string;
  readonly bidAmountSats: string;
  readonly auctionLotCommitment: string;
  readonly auctionStateCommitment: string;
  readonly bidderCommitment: string;
  readonly previewStatus: AuctionBidPackagePreviewStatus;
  readonly previewSummary: string;
  readonly previewRequiredMinimumBidSats: string | null;
  readonly wouldBecomeLeader: boolean;
  readonly wouldExtendSoftClose: boolean;
}

export interface CreateAuctionBidPackageInput {
  readonly auctionId: string;
  readonly name: string;
  readonly currentBlockHeight: number;
  readonly phase: AuctionBidPackagePhase;
  readonly unlockBlock: number;
  readonly auctionCloseBlockAfter?: number | null;
  readonly openingMinimumBidSats: bigint | number | string;
  readonly currentLeaderBidderId?: string | null;
  readonly currentLeaderBidderCommitment?: string | null;
  readonly currentHighestBidSats?: bigint | number | string | null;
  readonly currentRequiredMinimumBidSats?: bigint | number | string | null;
  readonly settlementLockBlocks: number;
  readonly blocksUntilUnlock?: number;
  readonly blocksUntilClose?: number | null;
  readonly bidderId: string;
  readonly ownerPubkey: string;
  readonly bidAmountSats: bigint | number | string;
  readonly auctionLotCommitment?: string;
  readonly auctionStateCommitment?: string;
  readonly bidderCommitment?: string;
  readonly exportedAt?: string;
}

export function createAuctionBidPackage(input: CreateAuctionBidPackageInput): AuctionBidPackage {
  const auctionId = normalizeRequiredText(input.auctionId, "auctionId");
  const name = normalizeName(input.name);
  const currentBlockHeight = parseNonNegativeSafeInteger(input.currentBlockHeight, "currentBlockHeight");
  const phase = parseAuctionBidPackagePhase(input.phase, "phase");
  const unlockBlock = parseNonNegativeSafeInteger(input.unlockBlock, "unlockBlock");
  const auctionCloseBlockAfter = parseOptionalNonNegativeSafeInteger(input.auctionCloseBlockAfter, "auctionCloseBlockAfter");
  const openingMinimumBidSats = parseBigIntLike(input.openingMinimumBidSats, "openingMinimumBidSats");
  const currentLeaderBidderId = normalizeOptionalText(input.currentLeaderBidderId);
  const currentLeaderBidderCommitment = normalizeAuctionBidderCommitment(
    currentLeaderBidderId,
    input.currentLeaderBidderCommitment
  );
  const currentHighestBidSats = parseOptionalBigIntLike(input.currentHighestBidSats, "currentHighestBidSats");
  const currentRequiredMinimumBidSats = parseOptionalBigIntLike(
    input.currentRequiredMinimumBidSats,
    "currentRequiredMinimumBidSats"
  );
  const settlementLockBlocks = parseNonNegativeSafeInteger(input.settlementLockBlocks, "settlementLockBlocks");
  const blocksUntilUnlock = input.blocksUntilUnlock ?? Math.max(0, unlockBlock - currentBlockHeight);
  const blocksUntilClose = input.blocksUntilClose ?? (
    auctionCloseBlockAfter === null ? null : Math.max(0, auctionCloseBlockAfter - currentBlockHeight)
  );
  const bidderId = normalizeRequiredText(input.bidderId, "bidderId");
  const ownerPubkey = assertHexBytes(input.ownerPubkey, 32, "ownerPubkey");
  const bidAmountSats = parseBigIntLike(input.bidAmountSats, "bidAmountSats");
  const auctionLotCommitment = input.auctionLotCommitment
    ? assertHexBytes(input.auctionLotCommitment, 16, "auctionLotCommitment")
    : computeAuctionLotCommitment({
        auctionId,
        name,
        unlockBlock
      });
  const auctionStateCommitment = input.auctionStateCommitment
    ? assertHexBytes(input.auctionStateCommitment, 32, "auctionStateCommitment")
    : computeAuctionBidStateCommitment({
        auctionId,
        name,
        currentBlockHeight,
        phase,
        unlockBlock,
        auctionCloseBlockAfter,
        openingMinimumBidSats,
        currentLeaderBidderCommitment,
        currentHighestBidSats,
        currentRequiredMinimumBidSats,
        settlementLockBlocks
      });
  const bidderCommitment = input.bidderCommitment
    ? assertHexBytes(input.bidderCommitment, 16, "bidderCommitment")
    : computeAuctionBidderCommitment(bidderId);

  assertAuctionStateConsistency({
    phase,
    currentLeaderBidderId,
    currentLeaderBidderCommitment,
    currentHighestBidSats,
    currentRequiredMinimumBidSats
  });

  const preview = deriveAuctionBidPreview({
    phase,
    unlockBlock,
    currentBlockHeight,
    openingMinimumBidSats,
    currentRequiredMinimumBidSats,
    bidAmountSats,
    blocksUntilUnlock
  });

  return parseAuctionBidPackage({
    format: AUCTION_BID_PACKAGE_FORMAT,
    packageVersion: AUCTION_BID_PACKAGE_VERSION,
    protocol: PROTOCOL_NAME,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    auctionId,
    name,
    currentBlockHeight,
    phase,
    unlockBlock,
    auctionCloseBlockAfter,
    openingMinimumBidSats: openingMinimumBidSats.toString(),
    currentLeaderBidderId,
    currentLeaderBidderCommitment,
    currentHighestBidSats: currentHighestBidSats?.toString() ?? null,
    currentRequiredMinimumBidSats: currentRequiredMinimumBidSats?.toString() ?? null,
    settlementLockBlocks,
    blocksUntilUnlock,
    blocksUntilClose,
    bidderId,
    ownerPubkey,
    bidAmountSats: bidAmountSats.toString(),
    auctionLotCommitment,
    auctionStateCommitment,
    bidderCommitment,
    previewStatus: preview.previewStatus,
    previewSummary: preview.previewSummary,
    previewRequiredMinimumBidSats: preview.previewRequiredMinimumBidSats?.toString() ?? null,
    wouldBecomeLeader: preview.wouldBecomeLeader,
    wouldExtendSoftClose: preview.wouldExtendSoftClose
  });
}

export function parseAuctionBidPackage(input: unknown): AuctionBidPackage {
  const record = assertRecord(input, "auction bid package");

  const format = assertString(record.format, "format");
  if (format !== AUCTION_BID_PACKAGE_FORMAT) {
    throw new Error(`auction bid package format must be ${AUCTION_BID_PACKAGE_FORMAT}`);
  }

  const packageVersion = assertInteger(record.packageVersion, "packageVersion");
  if (packageVersion !== AUCTION_BID_PACKAGE_VERSION) {
    throw new Error(`auction bid package version must be ${AUCTION_BID_PACKAGE_VERSION}`);
  }

  const protocol = assertString(record.protocol, "protocol");
  if (protocol !== PROTOCOL_NAME) {
    throw new Error(`auction bid package protocol must be ${PROTOCOL_NAME}`);
  }

  const exportedAt = assertString(record.exportedAt, "exportedAt");
  if (Number.isNaN(Date.parse(exportedAt))) {
    throw new Error("exportedAt must be a valid ISO timestamp");
  }

  const auctionId = normalizeRequiredText(assertString(record.auctionId, "auctionId"), "auctionId");
  const name = normalizeName(assertString(record.name, "name"));
  const currentBlockHeight = parseNonNegativeSafeInteger(record.currentBlockHeight, "currentBlockHeight");
  const phase = parseAuctionBidPackagePhase(record.phase, "phase");
  const unlockBlock = parseNonNegativeSafeInteger(record.unlockBlock, "unlockBlock");
  const auctionCloseBlockAfter = parseOptionalNonNegativeSafeInteger(record.auctionCloseBlockAfter, "auctionCloseBlockAfter");
  const openingMinimumBidSats = parseBigIntLike(record.openingMinimumBidSats, "openingMinimumBidSats");
  const currentLeaderBidderId = parseOptionalString(record.currentLeaderBidderId, "currentLeaderBidderId");
  const currentLeaderBidderCommitment = parseOptionalAuctionBidCommitment(
    record.currentLeaderBidderCommitment,
    "currentLeaderBidderCommitment"
  );
  const currentHighestBidSats = parseOptionalBigIntLike(record.currentHighestBidSats, "currentHighestBidSats");
  const currentRequiredMinimumBidSats = parseOptionalBigIntLike(
    record.currentRequiredMinimumBidSats,
    "currentRequiredMinimumBidSats"
  );
  const settlementLockBlocks = parseNonNegativeSafeInteger(record.settlementLockBlocks, "settlementLockBlocks");
  const blocksUntilUnlock = parseNonNegativeSafeInteger(record.blocksUntilUnlock, "blocksUntilUnlock");
  const blocksUntilClose = parseOptionalNonNegativeSafeInteger(record.blocksUntilClose, "blocksUntilClose");
  const bidderId = normalizeRequiredText(assertString(record.bidderId, "bidderId"), "bidderId");
  const ownerPubkey = assertHexBytes(assertString(record.ownerPubkey, "ownerPubkey"), 32, "ownerPubkey");
  const bidAmountSats = parseBigIntLike(record.bidAmountSats, "bidAmountSats");
  const auctionLotCommitment = assertHexBytes(
    assertString(record.auctionLotCommitment, "auctionLotCommitment"),
    16,
    "auctionLotCommitment"
  );
  const auctionStateCommitment = assertHexBytes(
    assertString(record.auctionStateCommitment, "auctionStateCommitment"),
    32,
    "auctionStateCommitment"
  );
  const bidderCommitment = assertHexBytes(
    assertString(record.bidderCommitment, "bidderCommitment"),
    16,
    "bidderCommitment"
  );
  const previewStatus = parseAuctionBidPackagePreviewStatus(record.previewStatus, "previewStatus");
  const previewSummary = assertString(record.previewSummary, "previewSummary");
  const previewRequiredMinimumBidSats = parseOptionalBigIntLike(
    record.previewRequiredMinimumBidSats,
    "previewRequiredMinimumBidSats"
  );
  const wouldBecomeLeader = assertBoolean(record.wouldBecomeLeader, "wouldBecomeLeader");
  const wouldExtendSoftClose = assertBoolean(record.wouldExtendSoftClose, "wouldExtendSoftClose");

  assertAuctionStateConsistency({
    phase,
    currentLeaderBidderId,
    currentLeaderBidderCommitment,
    currentHighestBidSats,
    currentRequiredMinimumBidSats
  });

  const expectedBlocksUntilUnlock = Math.max(0, unlockBlock - currentBlockHeight);
  if (blocksUntilUnlock !== expectedBlocksUntilUnlock) {
    throw new Error("blocksUntilUnlock does not match the observed auction state");
  }

  const expectedBlocksUntilClose =
    auctionCloseBlockAfter === null ? null : Math.max(0, auctionCloseBlockAfter - currentBlockHeight);
  if (blocksUntilClose !== expectedBlocksUntilClose) {
    throw new Error("blocksUntilClose does not match the observed auction state");
  }

  const expectedPreview = deriveAuctionBidPreview({
    phase,
    unlockBlock,
    currentBlockHeight,
    openingMinimumBidSats,
    currentRequiredMinimumBidSats,
    bidAmountSats,
    blocksUntilUnlock
  });
  const expectedAuctionStateCommitment = computeAuctionBidStateCommitment({
    auctionId,
    name,
    currentBlockHeight,
    phase,
    unlockBlock,
    auctionCloseBlockAfter,
    openingMinimumBidSats,
    currentLeaderBidderCommitment,
    currentHighestBidSats,
    currentRequiredMinimumBidSats,
    settlementLockBlocks
  });
  const expectedAuctionLotCommitment = computeAuctionLotCommitment({
    auctionId,
    name,
    unlockBlock
  });
  if (auctionLotCommitment !== expectedAuctionLotCommitment) {
    throw new Error("name commitment does not match the auction name");
  }
  if (auctionStateCommitment !== expectedAuctionStateCommitment) {
    throw new Error("auctionStateCommitment does not match the observed auction state");
  }

  const expectedBidderCommitment = computeAuctionBidderCommitment(bidderId);
  if (bidderCommitment !== expectedBidderCommitment) {
    throw new Error("bidderCommitment does not match bidderId");
  }

  if (previewStatus !== expectedPreview.previewStatus) {
    throw new Error("previewStatus does not match the observed auction state");
  }

  if (previewSummary !== expectedPreview.previewSummary) {
    throw new Error("previewSummary does not match the observed auction state");
  }

  if ((previewRequiredMinimumBidSats?.toString() ?? null) !== (expectedPreview.previewRequiredMinimumBidSats?.toString() ?? null)) {
    throw new Error("previewRequiredMinimumBidSats does not match the observed auction state");
  }

  if (wouldBecomeLeader !== expectedPreview.wouldBecomeLeader) {
    throw new Error("wouldBecomeLeader does not match the observed auction state");
  }

  if (wouldExtendSoftClose !== expectedPreview.wouldExtendSoftClose) {
    throw new Error("wouldExtendSoftClose does not match the observed auction state");
  }

  return {
    format,
    packageVersion,
    protocol,
    exportedAt,
    auctionId,
    name,
    currentBlockHeight,
    phase,
    unlockBlock,
    auctionCloseBlockAfter,
    openingMinimumBidSats: openingMinimumBidSats.toString(),
    currentLeaderBidderId,
    currentLeaderBidderCommitment,
    currentHighestBidSats: currentHighestBidSats?.toString() ?? null,
    currentRequiredMinimumBidSats: currentRequiredMinimumBidSats?.toString() ?? null,
    settlementLockBlocks,
    blocksUntilUnlock,
    blocksUntilClose,
    bidderId,
    ownerPubkey,
    bidAmountSats: bidAmountSats.toString(),
    auctionLotCommitment,
    auctionStateCommitment,
    bidderCommitment,
    previewStatus,
    previewSummary,
    previewRequiredMinimumBidSats: previewRequiredMinimumBidSats?.toString() ?? null,
    wouldBecomeLeader,
    wouldExtendSoftClose
  };
}

export function computeAuctionBidderCommitment(bidderId: string): string {
  return sha256Hex(
    concatBytes(
      utf8ToBytes("ont-auction-bidder-v1"),
      utf8ToBytes("\u0000"),
      utf8ToBytes(normalizeRequiredText(bidderId, "bidderId"))
    )
  ).slice(0, 32);
}

export function computeAuctionLotCommitment(input: {
  readonly auctionId: string;
  readonly name: string;
  readonly unlockBlock: number;
}): string {
  return sha256Hex(
    concatBytes(
      utf8ToBytes("ont-auction-lot-v1"),
      utf8ToBytes("\u0000"),
      utf8ToBytes(normalizeRequiredText(input.auctionId, "auctionId")),
      utf8ToBytes("\u0000"),
      utf8ToBytes(normalizeName(input.name)),
      utf8ToBytes("\u0000"),
      utf8ToBytes(String(parseNonNegativeSafeInteger(input.unlockBlock, "unlockBlock")))
    )
  ).slice(0, 32);
}

export function computeAuctionBidStateCommitment(input: {
  readonly auctionId: string;
  readonly name: string;
  readonly currentBlockHeight: number;
  readonly phase: AuctionBidPackagePhase;
  readonly unlockBlock: number;
  readonly auctionCloseBlockAfter: number | null;
  readonly openingMinimumBidSats: bigint;
  readonly currentLeaderBidderCommitment: string | null;
  readonly currentHighestBidSats: bigint | null;
  readonly currentRequiredMinimumBidSats: bigint | null;
  readonly settlementLockBlocks: number;
}): string {
  const fields = [
    "ont-auction-state-v1",
    normalizeRequiredText(input.auctionId, "auctionId"),
    normalizeName(input.name),
    String(parseNonNegativeSafeInteger(input.currentBlockHeight, "currentBlockHeight")),
    parseAuctionBidPackagePhase(input.phase, "phase"),
    String(parseNonNegativeSafeInteger(input.unlockBlock, "unlockBlock")),
    input.auctionCloseBlockAfter === null ? "" : String(parseNonNegativeSafeInteger(input.auctionCloseBlockAfter, "auctionCloseBlockAfter")),
    input.openingMinimumBidSats.toString(),
    input.currentLeaderBidderCommitment ?? "",
    input.currentHighestBidSats?.toString() ?? "",
    input.currentRequiredMinimumBidSats?.toString() ?? "",
    String(parseNonNegativeSafeInteger(input.settlementLockBlocks, "settlementLockBlocks"))
  ];

  return sha256Hex(
    concatBytes(
      ...fields.flatMap((field) => [
        utf8ToBytes(field),
        utf8ToBytes("\u0000")
      ])
    )
  );
}

function deriveAuctionBidPreview(input: {
  readonly phase: AuctionBidPackagePhase;
  readonly unlockBlock: number;
  readonly currentBlockHeight: number;
  readonly openingMinimumBidSats: bigint;
  readonly currentRequiredMinimumBidSats: bigint | null;
  readonly bidAmountSats: bigint;
  readonly blocksUntilUnlock: number;
}): {
  readonly previewStatus: AuctionBidPackagePreviewStatus;
  readonly previewSummary: string;
  readonly previewRequiredMinimumBidSats: bigint | null;
  readonly wouldBecomeLeader: boolean;
  readonly wouldExtendSoftClose: boolean;
} {
  if (input.phase === "pending_unlock" || input.currentBlockHeight < input.unlockBlock) {
    return {
      previewStatus: "too_early",
      previewSummary:
        `This name is not eligible to open yet. Wait ${input.blocksUntilUnlock} more block${input.blocksUntilUnlock === 1 ? "" : "s"} before bidding.`,
      previewRequiredMinimumBidSats: input.openingMinimumBidSats,
      wouldBecomeLeader: false,
      wouldExtendSoftClose: false
    };
  }

  if (input.phase === "settled") {
    return {
      previewStatus: "auction_closed",
      previewSummary: "Auction is already settled at this observed block height.",
      previewRequiredMinimumBidSats: null,
      wouldBecomeLeader: false,
      wouldExtendSoftClose: false
    };
  }

  const requiredMinimumBidSats = input.currentRequiredMinimumBidSats ?? input.openingMinimumBidSats;
  if (input.bidAmountSats < requiredMinimumBidSats) {
    return {
      previewStatus: "below_minimum",
      previewSummary:
        `Bid is below the current minimum valid bid of ${requiredMinimumBidSats.toString()} base units for this observed state.`,
      previewRequiredMinimumBidSats: requiredMinimumBidSats,
      wouldBecomeLeader: false,
      wouldExtendSoftClose: false
    };
  }

  if (input.phase === "awaiting_opening_bid") {
    return {
      previewStatus: "currently_valid",
      previewSummary: "Bid clears the opening minimum and would open the auction from this observed state.",
      previewRequiredMinimumBidSats: requiredMinimumBidSats,
      wouldBecomeLeader: true,
      wouldExtendSoftClose: false
    };
  }

  if (input.phase === "soft_close") {
    return {
      previewStatus: "currently_valid",
      previewSummary:
        "Bid clears the current minimum and would become the leader while extending soft close at this observed state.",
      previewRequiredMinimumBidSats: requiredMinimumBidSats,
      wouldBecomeLeader: true,
      wouldExtendSoftClose: true
    };
  }

  return {
    previewStatus: "currently_valid",
    previewSummary: "Bid clears the current minimum and would become the leader at this observed state.",
    previewRequiredMinimumBidSats: requiredMinimumBidSats,
    wouldBecomeLeader: true,
    wouldExtendSoftClose: false
  };
}

function assertAuctionStateConsistency(input: {
  readonly phase: AuctionBidPackagePhase;
  readonly currentLeaderBidderId: string | null;
  readonly currentLeaderBidderCommitment: string | null;
  readonly currentHighestBidSats: bigint | null;
  readonly currentRequiredMinimumBidSats: bigint | null;
}) {
  if ((input.currentLeaderBidderCommitment === null) !== (input.currentHighestBidSats === null)) {
    throw new Error(
      "currentLeaderBidderCommitment and currentHighestBidSats must either both be present or both be null"
    );
  }

  if (input.phase === "pending_unlock" || input.phase === "awaiting_opening_bid") {
    if (input.currentLeaderBidderCommitment !== null || input.currentHighestBidSats !== null) {
      throw new Error(`${input.phase} auctions must not include a current leader or highest bid`);
    }
  }

  if ((input.phase === "live_bidding" || input.phase === "soft_close" || input.phase === "settled")
    && (input.currentLeaderBidderCommitment === null || input.currentHighestBidSats === null)) {
    throw new Error(`${input.phase} auctions must include a current leader commitment and highest bid`);
  }

  if (input.phase === "settled") {
    if (input.currentRequiredMinimumBidSats !== null) {
      throw new Error("settled auctions must not include currentRequiredMinimumBidSats");
    }
    return;
  }

  if (input.currentRequiredMinimumBidSats === null) {
    throw new Error("active auctions must include currentRequiredMinimumBidSats");
  }
}

function normalizeAuctionBidderCommitment(
  bidderId: string | null,
  commitment: unknown
): string | null {
  const normalizedCommitment = parseOptionalAuctionBidCommitment(commitment, "currentLeaderBidderCommitment");

  if (bidderId === null) {
    return normalizedCommitment;
  }

  const expected = computeAuctionBidderCommitment(bidderId);
  if (normalizedCommitment === null) {
    return expected;
  }

  if (normalizedCommitment !== expected) {
    throw new Error("currentLeaderBidderCommitment does not match currentLeaderBidderId");
  }

  return normalizedCommitment;
}

function parseOptionalAuctionBidCommitment(value: unknown, label: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  return assertHexBytes(assertString(value, label), 16, label);
}

function parseAuctionBidPackagePhase(value: unknown, label: string): AuctionBidPackagePhase {
  const parsed = assertString(value, label);
  switch (parsed) {
    case "pending_unlock":
    case "awaiting_opening_bid":
    case "live_bidding":
    case "soft_close":
    case "settled":
      return parsed;
    default:
      throw new Error(`${label} must be a supported auction phase`);
  }
}

function parseAuctionBidPackagePreviewStatus(value: unknown, label: string): AuctionBidPackagePreviewStatus {
  const parsed = assertString(value, label);
  switch (parsed) {
    case "too_early":
    case "below_minimum":
    case "currently_valid":
    case "auction_closed":
      return parsed;
    default:
      throw new Error(`${label} must be a supported preview status`);
  }
}

function normalizeRequiredText(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }

  return trimmed;
}

function normalizeOptionalText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = normalizeRequiredText(value, "value");
  return parsed.length === 0 ? null : parsed;
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value as Record<string, unknown>;
}

function assertString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }

  return value;
}

function parseOptionalString(value: unknown, label: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return normalizeRequiredText(assertString(value, label), label);
}

function assertBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean`);
  }

  return value;
}

function assertInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${label} must be an integer`);
  }

  return value;
}

function parseNonNegativeSafeInteger(value: unknown, label: string): number {
  const parsed = assertInteger(value, label);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }

  return parsed;
}

function parseOptionalNonNegativeSafeInteger(value: unknown, label: string): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  return parseNonNegativeSafeInteger(value, label);
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
      throw new Error(`${label} must be a non-negative safe integer`);
    }

    return BigInt(value);
  }

  if (typeof value === "string" && /^[0-9]+$/u.test(value)) {
    return BigInt(value);
  }

  throw new Error(`${label} must be a non-negative integer string`);
}

function parseOptionalBigIntLike(value: unknown, label: string): bigint | null {
  if (value === null || value === undefined) {
    return null;
  }

  return parseBigIntLike(value, label);
}
