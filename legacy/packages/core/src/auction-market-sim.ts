import { normalizeName } from "@ont/protocol";

import {
  calculateLaunchAuctionMinimumIncrementBidSats,
  getLaunchAuctionOpeningRequirements,
  isLaunchAuctionSoftCloseWindow,
  type LaunchAuctionPolicy
} from "./auction-policy.js";
import {
  parseLaunchAuctionScenario,
  type LaunchAuctionBidAcceptanceReason,
  type LaunchAuctionBidOutcome,
  type LaunchAuctionBidOutcomeReason,
  type LaunchAuctionScenario,
  type LaunchAuctionWinningBid
} from "./auction-sim.js";

export interface LaunchAuctionMarketAuctionScenario extends LaunchAuctionScenario {
  readonly auctionId: string;
}

export interface SerializedLaunchAuctionMarketAuctionScenario {
  readonly auctionId: string;
  readonly name: string;
  readonly unlockBlock: number;
  readonly bidAttempts: ReadonlyArray<{
    readonly bidderId: string;
    readonly blockHeight: number;
    readonly amountSats: string;
  }>;
}

export interface LaunchAuctionMarketScenario {
  readonly bidderBudgetsSats: Readonly<Record<string, bigint>>;
  readonly auctions: ReadonlyArray<LaunchAuctionMarketAuctionScenario>;
}

export interface SerializedLaunchAuctionMarketScenario {
  readonly bidderBudgetsSats: Readonly<Record<string, string>>;
  readonly auctions: ReadonlyArray<SerializedLaunchAuctionMarketAuctionScenario>;
}

export interface LaunchAuctionMarketAuctionResult {
  readonly auctionId: string;
  readonly normalizedName: string;
  readonly unlockBlock: number;
  readonly openingMinimumBidSats: bigint;
  readonly settlementLockBlocks: number;
  readonly auctionStartBlock: number | null;
  readonly initialAuctionCloseBlock: number | null;
  readonly finalAuctionCloseBlock: number | null;
  readonly status: "unopened" | "settled";
  readonly winner: LaunchAuctionWinningBid | null;
  readonly bidOutcomes: ReadonlyArray<LaunchAuctionBidOutcome>;
}

export interface SerializedLaunchAuctionMarketAuctionResult {
  readonly auctionId: string;
  readonly normalizedName: string;
  readonly unlockBlock: number;
  readonly openingMinimumBidSats: string;
  readonly settlementLockBlocks: number;
  readonly auctionStartBlock: number | null;
  readonly initialAuctionCloseBlock: number | null;
  readonly finalAuctionCloseBlock: number | null;
  readonly status: "unopened" | "settled";
  readonly winner:
    | {
        readonly bidderId: string;
        readonly blockHeight: number;
        readonly amountSats: string;
      }
    | null;
  readonly bidOutcomes: ReadonlyArray<{
    readonly index: number;
    readonly bidderId: string;
    readonly blockHeight: number;
    readonly amountSats: string;
    readonly status: "accepted" | "rejected";
    readonly reason: LaunchAuctionBidOutcomeReason;
    readonly requiredMinimumBidSats: string;
    readonly auctionCloseBlockAfter: number | null;
    readonly highestBidSatsAfter: string | null;
  }>;
}

export interface LaunchAuctionMarketBidderSummary {
  readonly bidderId: string;
  readonly budgetSats: bigint;
  readonly peakLockedSats: bigint;
  readonly finalLockedSats: bigint;
  readonly finalAvailableSats: bigint;
  readonly wonAuctionIds: ReadonlyArray<string>;
  readonly insufficientBudgetRejectCount: number;
}

export interface SerializedLaunchAuctionMarketBidderSummary {
  readonly bidderId: string;
  readonly budgetSats: string;
  readonly peakLockedSats: string;
  readonly finalLockedSats: string;
  readonly finalAvailableSats: string;
  readonly wonAuctionIds: ReadonlyArray<string>;
  readonly insufficientBudgetRejectCount: number;
}

export interface LaunchAuctionMarketChronologicalBidOutcome extends LaunchAuctionBidOutcome {
  readonly auctionId: string;
  readonly normalizedName: string;
  readonly additionalLockedSats: bigint;
  readonly bidderLockedSatsAfter: bigint;
  readonly bidderAvailableSatsAfter: bigint;
}

export interface SerializedLaunchAuctionMarketChronologicalBidOutcome {
  readonly auctionId: string;
  readonly normalizedName: string;
  readonly index: number;
  readonly bidderId: string;
  readonly blockHeight: number;
  readonly amountSats: string;
  readonly status: "accepted" | "rejected";
  readonly reason: LaunchAuctionBidOutcomeReason;
  readonly requiredMinimumBidSats: string;
  readonly auctionCloseBlockAfter: number | null;
  readonly highestBidSatsAfter: string | null;
  readonly additionalLockedSats: string;
  readonly bidderLockedSatsAfter: string;
  readonly bidderAvailableSatsAfter: string;
}

export interface LaunchAuctionMarketSimulationResult {
  readonly auctionResults: ReadonlyArray<LaunchAuctionMarketAuctionResult>;
  readonly bidderSummaries: ReadonlyArray<LaunchAuctionMarketBidderSummary>;
  readonly chronologicalBidOutcomes: ReadonlyArray<LaunchAuctionMarketChronologicalBidOutcome>;
}

export interface SerializedLaunchAuctionMarketSimulationResult {
  readonly auctionResults: ReadonlyArray<SerializedLaunchAuctionMarketAuctionResult>;
  readonly bidderSummaries: ReadonlyArray<SerializedLaunchAuctionMarketBidderSummary>;
  readonly chronologicalBidOutcomes: ReadonlyArray<SerializedLaunchAuctionMarketChronologicalBidOutcome>;
}

interface AuctionRuntime {
  readonly auctionId: string;
  readonly normalizedName: string;
  readonly unlockBlock: number;
  readonly openingMinimumBidSats: bigint;
  readonly settlementLockBlocks: number;
  readonly bidAttempts: LaunchAuctionScenario["bidAttempts"];
  readonly bidderCommitmentsSats: Map<string, bigint>;
  readonly bidOutcomes: LaunchAuctionBidOutcome[];
  auctionStartBlock: number | null;
  initialAuctionCloseBlock: number | null;
  finalAuctionCloseBlock: number | null;
  winner: LaunchAuctionWinningBid | null;
  releasesApplied: boolean;
}

interface ChronologicalBidEvent {
  readonly auctionArrayIndex: number;
  readonly auctionId: string;
  readonly normalizedName: string;
  readonly bidAttemptIndex: number;
  readonly bidderId: string;
  readonly blockHeight: number;
  readonly amountSats: bigint;
}

export function simulateLaunchAuctionMarket(input: {
  readonly policy: LaunchAuctionPolicy;
  readonly scenario: LaunchAuctionMarketScenario;
}): LaunchAuctionMarketSimulationResult {
  const bidderLockedTotalsSats = new Map<string, bigint>();
  const bidderPeakLockedSats = new Map<string, bigint>();
  const bidderWonAuctionIds = new Map<string, string[]>();
  const insufficientBudgetRejectCounts = new Map<string, number>();

  const runtimes = input.scenario.auctions.map((auction) => {
    const normalizedName = normalizeName(auction.name);
    const openingRequirements = getLaunchAuctionOpeningRequirements({
      policy: input.policy,
      name: normalizedName
    });

    return {
      auctionId: auction.auctionId,
      normalizedName,
      unlockBlock: auction.unlockBlock,
      openingMinimumBidSats: openingRequirements.openingMinimumBidSats,
      settlementLockBlocks: openingRequirements.settlementLockBlocks,
      bidAttempts: auction.bidAttempts,
      bidderCommitmentsSats: new Map<string, bigint>(),
      bidOutcomes: [] as LaunchAuctionBidOutcome[],
      auctionStartBlock: null,
      initialAuctionCloseBlock: null,
      finalAuctionCloseBlock: null,
      winner: null,
      releasesApplied: false
    } satisfies AuctionRuntime;
  });

  const chronologicalEvents = runtimes
    .flatMap((runtime, auctionArrayIndex) =>
      runtime.bidAttempts.map((attempt, bidAttemptIndex) => ({
        auctionArrayIndex,
        auctionId: runtime.auctionId,
        normalizedName: runtime.normalizedName,
        bidAttemptIndex,
        bidderId: attempt.bidderId,
        blockHeight: attempt.blockHeight,
        amountSats: attempt.amountSats
      }))
    )
    .sort(
      (left, right) =>
        left.blockHeight - right.blockHeight ||
        left.auctionArrayIndex - right.auctionArrayIndex ||
        left.bidAttemptIndex - right.bidAttemptIndex
    );

  const chronologicalBidOutcomes: LaunchAuctionMarketChronologicalBidOutcome[] = [];

  for (const event of chronologicalEvents) {
    releaseClosedAuctionLosers({
      currentBlockHeight: event.blockHeight,
      runtimes,
      bidderLockedTotalsSats,
      bidderWonAuctionIds
    });

    const runtime = runtimes[event.auctionArrayIndex]!;
    const bidderBudgetSats = input.scenario.bidderBudgetsSats[event.bidderId] ?? 0n;
    const bidderLockedBeforeSats = bidderLockedTotalsSats.get(event.bidderId) ?? 0n;
    const bidderExistingCommitmentSats = runtime.bidderCommitmentsSats.get(event.bidderId) ?? 0n;

    const outcome = processChronologicalBidEvent({
      policy: input.policy,
      runtime,
      event,
      bidderBudgetSats,
      bidderLockedBeforeSats,
      bidderExistingCommitmentSats
    });

    if (outcome.status === "accepted") {
      const bidderLockedAfterSats = bidderLockedBeforeSats + outcome.additionalLockedSats;
      bidderLockedTotalsSats.set(event.bidderId, bidderLockedAfterSats);
      bidderPeakLockedSats.set(
        event.bidderId,
        maxBigInt(bidderPeakLockedSats.get(event.bidderId) ?? 0n, bidderLockedAfterSats)
      );
      runtime.bidderCommitmentsSats.set(event.bidderId, event.amountSats);
    } else if (outcome.reason === "insufficient_bidder_budget") {
      insufficientBudgetRejectCounts.set(
        event.bidderId,
        (insufficientBudgetRejectCounts.get(event.bidderId) ?? 0) + 1
      );
    }

    runtime.bidOutcomes.push({
      index: event.bidAttemptIndex,
      bidderId: outcome.bidderId,
      blockHeight: outcome.blockHeight,
      amountSats: outcome.amountSats,
      status: outcome.status,
      reason: outcome.reason,
      requiredMinimumBidSats: outcome.requiredMinimumBidSats,
      auctionCloseBlockAfter: outcome.auctionCloseBlockAfter,
      highestBidSatsAfter: outcome.highestBidSatsAfter
    });
    chronologicalBidOutcomes.push(outcome);
  }

  releaseClosedAuctionLosers({
    currentBlockHeight: Number.MAX_SAFE_INTEGER,
    runtimes,
    bidderLockedTotalsSats,
    bidderWonAuctionIds
  });

  const auctionResults: LaunchAuctionMarketAuctionResult[] = runtimes.map((runtime) => ({
    auctionId: runtime.auctionId,
    normalizedName: runtime.normalizedName,
    unlockBlock: runtime.unlockBlock,
    openingMinimumBidSats: runtime.openingMinimumBidSats,
    settlementLockBlocks: runtime.settlementLockBlocks,
    auctionStartBlock: runtime.auctionStartBlock,
    initialAuctionCloseBlock: runtime.initialAuctionCloseBlock,
    finalAuctionCloseBlock: runtime.finalAuctionCloseBlock,
    status: runtime.winner === null ? "unopened" : "settled",
    winner: runtime.winner,
    bidOutcomes: runtime.bidOutcomes
  }));

  const bidderIds = new Set<string>([
    ...Object.keys(input.scenario.bidderBudgetsSats),
    ...chronologicalEvents.map((event) => event.bidderId)
  ]);
  const bidderSummaries: LaunchAuctionMarketBidderSummary[] = [...bidderIds]
    .sort((left, right) => left.localeCompare(right))
    .map((bidderId) => {
      const budgetSats = input.scenario.bidderBudgetsSats[bidderId] ?? 0n;
      const finalLockedSats = bidderLockedTotalsSats.get(bidderId) ?? 0n;

      return {
        bidderId,
        budgetSats,
        peakLockedSats: bidderPeakLockedSats.get(bidderId) ?? 0n,
        finalLockedSats,
        finalAvailableSats: budgetSats >= finalLockedSats ? budgetSats - finalLockedSats : 0n,
        wonAuctionIds: bidderWonAuctionIds.get(bidderId) ?? [],
        insufficientBudgetRejectCount: insufficientBudgetRejectCounts.get(bidderId) ?? 0
      };
    });

  return {
    auctionResults,
    bidderSummaries,
    chronologicalBidOutcomes
  };
}

export function parseLaunchAuctionMarketScenario(input: unknown): LaunchAuctionMarketScenario {
  const record = assertRecord(input, "auction market scenario");
  const auctionsValue = record.auctions;
  const bidderBudgetsValue = assertRecord(record.bidderBudgetsSats, "bidderBudgetsSats");

  if (!Array.isArray(auctionsValue)) {
    throw new Error("auction market scenario auctions must be an array");
  }

  const auctions = auctionsValue.map((auction, index) =>
    parseLaunchAuctionMarketAuctionScenario(auction, index)
  );
  const bidderBudgetsSats = Object.fromEntries(
    Object.entries(bidderBudgetsValue).map(([bidderId, value]) => [
      bidderId,
      parseBigIntLike(value, `bidderBudgetsSats.${bidderId}`)
    ])
  );

  for (const auction of auctions) {
    for (const attempt of auction.bidAttempts) {
      if (!(attempt.bidderId in bidderBudgetsSats)) {
        throw new Error(`bidderBudgetsSats is missing a budget for ${attempt.bidderId}`);
      }
    }
  }

  return {
    bidderBudgetsSats,
    auctions
  };
}

export function serializeLaunchAuctionMarketScenario(
  scenario: LaunchAuctionMarketScenario
): SerializedLaunchAuctionMarketScenario {
  return {
    bidderBudgetsSats: Object.fromEntries(
      Object.entries(scenario.bidderBudgetsSats).map(([bidderId, budgetSats]) => [
        bidderId,
        budgetSats.toString()
      ])
    ),
    auctions: scenario.auctions.map((auction) => ({
      auctionId: auction.auctionId,
      name: auction.name,
      unlockBlock: auction.unlockBlock,
      bidAttempts: auction.bidAttempts.map((attempt) => ({
        bidderId: attempt.bidderId,
        blockHeight: attempt.blockHeight,
        amountSats: attempt.amountSats.toString()
      }))
    }))
  };
}

export function serializeLaunchAuctionMarketSimulationResult(
  result: LaunchAuctionMarketSimulationResult
): SerializedLaunchAuctionMarketSimulationResult {
  return {
    auctionResults: result.auctionResults.map((auction) => ({
      auctionId: auction.auctionId,
      normalizedName: auction.normalizedName,
      unlockBlock: auction.unlockBlock,
      openingMinimumBidSats: auction.openingMinimumBidSats.toString(),
      settlementLockBlocks: auction.settlementLockBlocks,
      auctionStartBlock: auction.auctionStartBlock,
      initialAuctionCloseBlock: auction.initialAuctionCloseBlock,
      finalAuctionCloseBlock: auction.finalAuctionCloseBlock,
      status: auction.status,
      winner:
        auction.winner === null
          ? null
          : {
              bidderId: auction.winner.bidderId,
              blockHeight: auction.winner.blockHeight,
              amountSats: auction.winner.amountSats.toString()
            },
      bidOutcomes: auction.bidOutcomes.map((outcome) => ({
        index: outcome.index,
        bidderId: outcome.bidderId,
        blockHeight: outcome.blockHeight,
        amountSats: outcome.amountSats.toString(),
        status: outcome.status,
        reason: outcome.reason,
        requiredMinimumBidSats: outcome.requiredMinimumBidSats.toString(),
        auctionCloseBlockAfter: outcome.auctionCloseBlockAfter,
        highestBidSatsAfter: outcome.highestBidSatsAfter?.toString() ?? null
      }))
    })),
    bidderSummaries: result.bidderSummaries.map((summary) => ({
      bidderId: summary.bidderId,
      budgetSats: summary.budgetSats.toString(),
      peakLockedSats: summary.peakLockedSats.toString(),
      finalLockedSats: summary.finalLockedSats.toString(),
      finalAvailableSats: summary.finalAvailableSats.toString(),
      wonAuctionIds: summary.wonAuctionIds,
      insufficientBudgetRejectCount: summary.insufficientBudgetRejectCount
    })),
    chronologicalBidOutcomes: result.chronologicalBidOutcomes.map((outcome) => ({
      auctionId: outcome.auctionId,
      normalizedName: outcome.normalizedName,
      index: outcome.index,
      bidderId: outcome.bidderId,
      blockHeight: outcome.blockHeight,
      amountSats: outcome.amountSats.toString(),
      status: outcome.status,
      reason: outcome.reason,
      requiredMinimumBidSats: outcome.requiredMinimumBidSats.toString(),
      auctionCloseBlockAfter: outcome.auctionCloseBlockAfter,
      highestBidSatsAfter: outcome.highestBidSatsAfter?.toString() ?? null,
      additionalLockedSats: outcome.additionalLockedSats.toString(),
      bidderLockedSatsAfter: outcome.bidderLockedSatsAfter.toString(),
      bidderAvailableSatsAfter: outcome.bidderAvailableSatsAfter.toString()
    }))
  };
}

function processChronologicalBidEvent(input: {
  readonly policy: LaunchAuctionPolicy;
  readonly runtime: AuctionRuntime;
  readonly event: ChronologicalBidEvent;
  readonly bidderBudgetSats: bigint;
  readonly bidderLockedBeforeSats: bigint;
  readonly bidderExistingCommitmentSats: bigint;
}): LaunchAuctionMarketChronologicalBidOutcome {
  const attempt = input.event;
  const runtime = input.runtime;

  if (attempt.blockHeight < runtime.unlockBlock) {
    return buildChronologicalOutcome({
      event: attempt,
      status: "rejected",
      reason: "before_unlock",
      requiredMinimumBidSats: runtime.openingMinimumBidSats,
      auctionCloseBlockAfter: runtime.finalAuctionCloseBlock,
      highestBidSatsAfter: runtime.winner?.amountSats ?? null,
      additionalLockedSats: 0n,
      bidderLockedSatsAfter: input.bidderLockedBeforeSats,
      bidderAvailableSatsAfter: clampAvailable(input.bidderBudgetSats - input.bidderLockedBeforeSats)
    });
  }

  if (runtime.winner === null) {
    if (attempt.amountSats < runtime.openingMinimumBidSats) {
      return buildChronologicalOutcome({
        event: attempt,
        status: "rejected",
        reason: "below_opening_minimum",
        requiredMinimumBidSats: runtime.openingMinimumBidSats,
        auctionCloseBlockAfter: runtime.finalAuctionCloseBlock,
        highestBidSatsAfter: null,
        additionalLockedSats: 0n,
        bidderLockedSatsAfter: input.bidderLockedBeforeSats,
        bidderAvailableSatsAfter: clampAvailable(input.bidderBudgetSats - input.bidderLockedBeforeSats)
      });
    }

    const additionalLockedSats = maxBigInt(0n, attempt.amountSats - input.bidderExistingCommitmentSats);
    if (input.bidderLockedBeforeSats + additionalLockedSats > input.bidderBudgetSats) {
      return buildChronologicalOutcome({
        event: attempt,
        status: "rejected",
        reason: "insufficient_bidder_budget",
        requiredMinimumBidSats: runtime.openingMinimumBidSats,
        auctionCloseBlockAfter: runtime.finalAuctionCloseBlock,
        highestBidSatsAfter: null,
        additionalLockedSats: 0n,
        bidderLockedSatsAfter: input.bidderLockedBeforeSats,
        bidderAvailableSatsAfter: clampAvailable(input.bidderBudgetSats - input.bidderLockedBeforeSats)
      });
    }

    runtime.auctionStartBlock = attempt.blockHeight;
    runtime.initialAuctionCloseBlock = attempt.blockHeight + input.policy.auction.baseWindowBlocks;
    runtime.finalAuctionCloseBlock = runtime.initialAuctionCloseBlock;
    runtime.winner = {
      bidderId: attempt.bidderId,
      blockHeight: attempt.blockHeight,
      amountSats: attempt.amountSats
    };

    return buildChronologicalOutcome({
      event: attempt,
      status: "accepted",
      reason: "opening_bid",
      requiredMinimumBidSats: runtime.openingMinimumBidSats,
      auctionCloseBlockAfter: runtime.finalAuctionCloseBlock,
      highestBidSatsAfter: runtime.winner.amountSats,
      additionalLockedSats,
      bidderLockedSatsAfter: input.bidderLockedBeforeSats + additionalLockedSats,
      bidderAvailableSatsAfter: clampAvailable(
        input.bidderBudgetSats - (input.bidderLockedBeforeSats + additionalLockedSats)
      )
    });
  }

  if (runtime.finalAuctionCloseBlock !== null && attempt.blockHeight > runtime.finalAuctionCloseBlock) {
    return buildChronologicalOutcome({
      event: attempt,
      status: "rejected",
      reason: "auction_closed",
      requiredMinimumBidSats: calculateLaunchAuctionMinimumIncrementBidSats({
        currentBidSats: runtime.winner.amountSats,
        policy: input.policy
      }),
      auctionCloseBlockAfter: runtime.finalAuctionCloseBlock,
      highestBidSatsAfter: runtime.winner.amountSats,
      additionalLockedSats: 0n,
      bidderLockedSatsAfter: input.bidderLockedBeforeSats,
      bidderAvailableSatsAfter: clampAvailable(input.bidderBudgetSats - input.bidderLockedBeforeSats)
    });
  }

  const extendsSoftClose = isLaunchAuctionSoftCloseWindow({
    currentBlockHeight: attempt.blockHeight,
    auctionCloseBlockAfter: runtime.finalAuctionCloseBlock,
    policy: input.policy
  });
  const requiredMinimumBidSats = calculateLaunchAuctionMinimumIncrementBidSats({
    currentBidSats: runtime.winner.amountSats,
    policy: input.policy,
    useSoftCloseIncrement: extendsSoftClose
  });
  if (attempt.amountSats < requiredMinimumBidSats) {
    return buildChronologicalOutcome({
      event: attempt,
      status: "rejected",
      reason: "below_minimum_increment",
      requiredMinimumBidSats,
      auctionCloseBlockAfter: runtime.finalAuctionCloseBlock,
      highestBidSatsAfter: runtime.winner.amountSats,
      additionalLockedSats: 0n,
      bidderLockedSatsAfter: input.bidderLockedBeforeSats,
      bidderAvailableSatsAfter: clampAvailable(input.bidderBudgetSats - input.bidderLockedBeforeSats)
    });
  }

  const additionalLockedSats = maxBigInt(0n, attempt.amountSats - input.bidderExistingCommitmentSats);
  if (input.bidderLockedBeforeSats + additionalLockedSats > input.bidderBudgetSats) {
    return buildChronologicalOutcome({
      event: attempt,
      status: "rejected",
      reason: "insufficient_bidder_budget",
      requiredMinimumBidSats,
      auctionCloseBlockAfter: runtime.finalAuctionCloseBlock,
      highestBidSatsAfter: runtime.winner.amountSats,
      additionalLockedSats: 0n,
      bidderLockedSatsAfter: input.bidderLockedBeforeSats,
      bidderAvailableSatsAfter: clampAvailable(input.bidderBudgetSats - input.bidderLockedBeforeSats)
    });
  }

  runtime.winner = {
    bidderId: attempt.bidderId,
    blockHeight: attempt.blockHeight,
    amountSats: attempt.amountSats
  };

  const acceptanceReason: LaunchAuctionBidAcceptanceReason = extendsSoftClose
    ? "higher_bid_soft_close_extended"
    : "higher_bid";

  if (extendsSoftClose) {
    runtime.finalAuctionCloseBlock = Math.max(
      runtime.finalAuctionCloseBlock ?? 0,
      attempt.blockHeight + input.policy.auction.softCloseExtensionBlocks
    );
  }

  return buildChronologicalOutcome({
    event: attempt,
    status: "accepted",
    reason: acceptanceReason,
    requiredMinimumBidSats,
    auctionCloseBlockAfter: runtime.finalAuctionCloseBlock,
    highestBidSatsAfter: runtime.winner.amountSats,
    additionalLockedSats,
    bidderLockedSatsAfter: input.bidderLockedBeforeSats + additionalLockedSats,
    bidderAvailableSatsAfter: clampAvailable(
      input.bidderBudgetSats - (input.bidderLockedBeforeSats + additionalLockedSats)
    )
  });
}

function releaseClosedAuctionLosers(input: {
  readonly currentBlockHeight: number;
  readonly runtimes: ReadonlyArray<AuctionRuntime>;
  readonly bidderLockedTotalsSats: Map<string, bigint>;
  readonly bidderWonAuctionIds: Map<string, string[]>;
}): void {
  for (const runtime of input.runtimes) {
    if (
      runtime.releasesApplied ||
      runtime.finalAuctionCloseBlock === null ||
      input.currentBlockHeight <= runtime.finalAuctionCloseBlock
    ) {
      continue;
    }

    runtime.releasesApplied = true;
    for (const [bidderId, amountSats] of runtime.bidderCommitmentsSats.entries()) {
      if (runtime.winner?.bidderId === bidderId) {
        const existing = input.bidderWonAuctionIds.get(bidderId) ?? [];
        input.bidderWonAuctionIds.set(bidderId, [...existing, runtime.auctionId]);
        continue;
      }

      const lockedTotal = input.bidderLockedTotalsSats.get(bidderId) ?? 0n;
      input.bidderLockedTotalsSats.set(bidderId, maxBigInt(0n, lockedTotal - amountSats));
    }
  }
}

function parseLaunchAuctionMarketAuctionScenario(
  input: unknown,
  index: number
): LaunchAuctionMarketAuctionScenario {
  const record = assertRecord(input, `auctions[${index}]`);

  return {
    auctionId: parseString(record.auctionId, `auctions[${index}].auctionId`),
    ...parseLaunchAuctionScenario({
      name: record.name,
      unlockBlock: record.unlockBlock,
      bidAttempts: record.bidAttempts
    })
  };
}

function buildChronologicalOutcome(input: {
  readonly event: ChronologicalBidEvent;
  readonly status: "accepted" | "rejected";
  readonly reason: LaunchAuctionBidOutcomeReason;
  readonly requiredMinimumBidSats: bigint;
  readonly auctionCloseBlockAfter: number | null;
  readonly highestBidSatsAfter: bigint | null;
  readonly additionalLockedSats: bigint;
  readonly bidderLockedSatsAfter: bigint;
  readonly bidderAvailableSatsAfter: bigint;
}): LaunchAuctionMarketChronologicalBidOutcome {
  return {
    auctionId: input.event.auctionId,
    normalizedName: input.event.normalizedName,
    index: input.event.bidAttemptIndex,
    bidderId: input.event.bidderId,
    blockHeight: input.event.blockHeight,
    amountSats: input.event.amountSats,
    status: input.status,
    reason: input.reason,
    requiredMinimumBidSats: input.requiredMinimumBidSats,
    auctionCloseBlockAfter: input.auctionCloseBlockAfter,
    highestBidSatsAfter: input.highestBidSatsAfter,
    additionalLockedSats: input.additionalLockedSats,
    bidderLockedSatsAfter: input.bidderLockedSatsAfter,
    bidderAvailableSatsAfter: input.bidderAvailableSatsAfter
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

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value as Record<string, unknown>;
}

function clampAvailable(value: bigint): bigint {
  return value >= 0n ? value : 0n;
}

function maxBigInt(left: bigint, right: bigint): bigint {
  return left > right ? left : right;
}
