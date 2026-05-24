export interface SponsoredFlatIssuanceScenario {
  readonly years: number;
  readonly directBondedNamesPerYear: number;
  readonly averageDirectBondBtc: number;
  readonly averageContestedAuctionBondBtc: number;
  readonly sponsorMaturityYears: number;
  readonly sponsorBondRetentionRate: number;
  readonly baseCreditsPerBtcYear: number;
  readonly ageMultiplierExponent: number;
  readonly ageMultiplierCap: number;
  readonly creditCarryoverRate: number;
  readonly desiredSponsoredClaimsPerYear: number;
  readonly desiredSponsoredClaimsGrowthRate: number;
  readonly cleanClaimCreditCost: number;
  readonly contestedClaimCreditCost: number;
  readonly contestRate: number;
  readonly invalidChallengeRate: number;
  readonly unfairDiscoveryRiskRate: number;
  readonly transferableInventoryRate: number;
  readonly topSponsorCreditShare: number;
  readonly contestedAuctionSettlementRate: number;
  readonly maxContestedAuctionSettlementsPerYear: number;
}

export interface SponsoredFlatIssuanceYearResult {
  readonly year: number;
  readonly directBondedNames: number;
  readonly eligibleSponsorBtc: number;
  readonly weightedSponsorBtc: number;
  readonly creditsEarned: number;
  readonly creditsAvailable: number;
  readonly desiredSponsoredClaims: number;
  readonly sponsoredClaimsProcessed: number;
  readonly sponsoredFinalizedNames: number;
  readonly contestedClaims: number;
  readonly invalidChallengeEvents: number;
  readonly unfairDiscoveryRiskNames: number;
  readonly transferableInventoryRiskNames: number;
  readonly topSponsorFinalizedNames: number;
  readonly contestedAuctionSettledNames: number;
  readonly contestedAuctionBacklogNames: number;
  readonly creditsBurned: number;
  readonly creditsCarriedForward: number;
  readonly newBondedNames: number;
  readonly newBondedBtc: number;
  readonly activeImmatureBondedNames: number;
  readonly cumulativeNames: number;
  readonly cumulativeBondedNames: number;
  readonly cumulativeSponsoredFinalizedNames: number;
  readonly cumulativeContestedAuctionNames: number;
  readonly cumulativeContestedAuctionBacklogNames: number;
  readonly cumulativeInvalidChallengeEvents: number;
  readonly cumulativeUnfairDiscoveryRiskNames: number;
  readonly cumulativeTransferableInventoryRiskNames: number;
  readonly cumulativeTopSponsorFinalizedNames: number;
}

export interface SponsoredFlatIssuanceSimulationResult {
  readonly scenario: SponsoredFlatIssuanceScenario;
  readonly years: readonly SponsoredFlatIssuanceYearResult[];
  readonly summary: {
    readonly finalYear: number;
    readonly cumulativeNames: number;
    readonly cumulativeBondedNames: number;
    readonly cumulativeSponsoredFinalizedNames: number;
    readonly cumulativeContestedAuctionNames: number;
    readonly cumulativeContestedAuctionBacklogNames: number;
    readonly cumulativeInvalidChallengeEvents: number;
    readonly cumulativeUnfairDiscoveryRiskNames: number;
    readonly cumulativeTransferableInventoryRiskNames: number;
    readonly cumulativeTopSponsorFinalizedNames: number;
    readonly finalEligibleSponsorBtc: number;
    readonly finalWeightedSponsorBtc: number;
    readonly finalAnnualSponsoredFinalizedNames: number;
    readonly finalAnnualInvalidChallengeEvents: number;
    readonly finalAnnualUnfairDiscoveryRiskNames: number;
    readonly finalAnnualTransferableInventoryRiskNames: number;
    readonly finalAnnualTopSponsorFinalizedNames: number;
    readonly finalCreditBalance: number;
    readonly peakActiveImmatureBondedNames: number;
    readonly hit8BYear: number | null;
    readonly hit80BYear: number | null;
  };
}

interface BondCohort {
  readonly year: number;
  readonly bondedNames: number;
  readonly bondedBtc: number;
}

export function createDefaultSponsoredFlatIssuanceScenario(): SponsoredFlatIssuanceScenario {
  return {
    years: 30,
    directBondedNamesPerYear: 500_000,
    averageDirectBondBtc: 0.02,
    averageContestedAuctionBondBtc: 0.02,
    sponsorMaturityYears: 1,
    sponsorBondRetentionRate: 0.9,
    baseCreditsPerBtcYear: 50_000,
    ageMultiplierExponent: 1.4,
    ageMultiplierCap: 5,
    creditCarryoverRate: 0,
    desiredSponsoredClaimsPerYear: 20_000_000_000,
    desiredSponsoredClaimsGrowthRate: 0,
    cleanClaimCreditCost: 1,
    contestedClaimCreditCost: 100,
    contestRate: 0.01,
    invalidChallengeRate: 0,
    unfairDiscoveryRiskRate: 0,
    transferableInventoryRate: 0,
    topSponsorCreditShare: 0,
    contestedAuctionSettlementRate: 1,
    maxContestedAuctionSettlementsPerYear: 2_600_000
  };
}

export function simulateSponsoredFlatIssuance(
  scenario: SponsoredFlatIssuanceScenario
): SponsoredFlatIssuanceSimulationResult {
  validateScenario(scenario);

  const cohorts: BondCohort[] = [];
  const years: SponsoredFlatIssuanceYearResult[] = [];
  let creditBalance = 0;
  let cumulativeNames = 0;
  let cumulativeBondedNames = 0;
  let cumulativeSponsoredFinalizedNames = 0;
  let cumulativeContestedAuctionNames = 0;
  let cumulativeContestedAuctionBacklogNames = 0;
  let cumulativeInvalidChallengeEvents = 0;
  let cumulativeUnfairDiscoveryRiskNames = 0;
  let cumulativeTransferableInventoryRiskNames = 0;
  let cumulativeTopSponsorFinalizedNames = 0;

  for (let year = 1; year <= scenario.years; year += 1) {
    const sponsorState = calculateSponsorState({
      scenario,
      cohorts,
      year
    });
    const creditsEarned = sponsorState.weightedSponsorBtc * scenario.baseCreditsPerBtcYear;
    const creditsAvailable = creditBalance * scenario.creditCarryoverRate + creditsEarned;
    const desiredSponsoredClaims = scenario.desiredSponsoredClaimsPerYear *
      ((1 + scenario.desiredSponsoredClaimsGrowthRate) ** (year - 1));
    const averageClaimCreditCost =
      scenario.cleanClaimCreditCost * (1 - scenario.contestRate) +
      scenario.contestedClaimCreditCost * scenario.contestRate;
    const creditLimitedClaims =
      averageClaimCreditCost === 0 ? desiredSponsoredClaims : creditsAvailable / averageClaimCreditCost;
    const sponsoredClaimsProcessed = Math.min(desiredSponsoredClaims, creditLimitedClaims);
    const contestedClaims = sponsoredClaimsProcessed * scenario.contestRate;
    const sponsoredFinalizedNames = sponsoredClaimsProcessed - contestedClaims;
    const invalidChallengeEvents = sponsoredClaimsProcessed * scenario.invalidChallengeRate;
    const unfairDiscoveryRiskNames = sponsoredFinalizedNames * scenario.unfairDiscoveryRiskRate;
    const transferableInventoryRiskNames = sponsoredFinalizedNames * scenario.transferableInventoryRate;
    const topSponsorFinalizedNames = sponsoredFinalizedNames * scenario.topSponsorCreditShare;
    const settleableContestedAuctionNames = contestedClaims * scenario.contestedAuctionSettlementRate;
    const contestedAuctionSettledNames = Math.min(
      settleableContestedAuctionNames,
      scenario.maxContestedAuctionSettlementsPerYear
    );
    const contestedAuctionBacklogNames = Math.max(
      0,
      settleableContestedAuctionNames - contestedAuctionSettledNames
    );
    const creditsBurned =
      sponsoredFinalizedNames * scenario.cleanClaimCreditCost +
      contestedClaims * scenario.contestedClaimCreditCost;

    creditBalance = Math.max(0, creditsAvailable - creditsBurned);

    const directBondedNames = scenario.directBondedNamesPerYear;
    const newBondedNames = directBondedNames + contestedAuctionSettledNames;
    const newBondedBtc =
      directBondedNames * scenario.averageDirectBondBtc +
      contestedAuctionSettledNames * scenario.averageContestedAuctionBondBtc;

    cohorts.push({
      year,
      bondedNames: newBondedNames,
      bondedBtc: newBondedBtc
    });

    cumulativeBondedNames += newBondedNames;
    cumulativeSponsoredFinalizedNames += sponsoredFinalizedNames;
    cumulativeContestedAuctionNames += contestedAuctionSettledNames;
    cumulativeContestedAuctionBacklogNames += contestedAuctionBacklogNames;
    cumulativeInvalidChallengeEvents += invalidChallengeEvents;
    cumulativeUnfairDiscoveryRiskNames += unfairDiscoveryRiskNames;
    cumulativeTransferableInventoryRiskNames += transferableInventoryRiskNames;
    cumulativeTopSponsorFinalizedNames += topSponsorFinalizedNames;
    cumulativeNames += directBondedNames + sponsoredFinalizedNames + contestedAuctionSettledNames;

    years.push({
      year,
      directBondedNames,
      eligibleSponsorBtc: sponsorState.eligibleSponsorBtc,
      weightedSponsorBtc: sponsorState.weightedSponsorBtc,
      creditsEarned,
      creditsAvailable,
      desiredSponsoredClaims,
      sponsoredClaimsProcessed,
      sponsoredFinalizedNames,
      contestedClaims,
      invalidChallengeEvents,
      unfairDiscoveryRiskNames,
      transferableInventoryRiskNames,
      topSponsorFinalizedNames,
      contestedAuctionSettledNames,
      contestedAuctionBacklogNames,
      creditsBurned,
      creditsCarriedForward: creditBalance,
      newBondedNames,
      newBondedBtc,
      activeImmatureBondedNames: calculateActiveImmatureBondedNames({
        scenario,
        cohorts,
        year
      }),
      cumulativeNames,
      cumulativeBondedNames,
      cumulativeSponsoredFinalizedNames,
      cumulativeContestedAuctionNames,
      cumulativeContestedAuctionBacklogNames,
      cumulativeInvalidChallengeEvents,
      cumulativeUnfairDiscoveryRiskNames,
      cumulativeTransferableInventoryRiskNames,
      cumulativeTopSponsorFinalizedNames
    });
  }

  const finalYear = years.at(-1);

  return {
    scenario,
    years,
    summary: {
      finalYear: finalYear?.year ?? 0,
      cumulativeNames,
      cumulativeBondedNames,
      cumulativeSponsoredFinalizedNames,
      cumulativeContestedAuctionNames,
      cumulativeContestedAuctionBacklogNames,
      cumulativeInvalidChallengeEvents,
      cumulativeUnfairDiscoveryRiskNames,
      cumulativeTransferableInventoryRiskNames,
      cumulativeTopSponsorFinalizedNames,
      finalEligibleSponsorBtc: finalYear?.eligibleSponsorBtc ?? 0,
      finalWeightedSponsorBtc: finalYear?.weightedSponsorBtc ?? 0,
      finalAnnualSponsoredFinalizedNames: finalYear?.sponsoredFinalizedNames ?? 0,
      finalAnnualInvalidChallengeEvents: finalYear?.invalidChallengeEvents ?? 0,
      finalAnnualUnfairDiscoveryRiskNames: finalYear?.unfairDiscoveryRiskNames ?? 0,
      finalAnnualTransferableInventoryRiskNames: finalYear?.transferableInventoryRiskNames ?? 0,
      finalAnnualTopSponsorFinalizedNames: finalYear?.topSponsorFinalizedNames ?? 0,
      finalCreditBalance: finalYear?.creditsCarriedForward ?? 0,
      peakActiveImmatureBondedNames: Math.max(
        0,
        ...years.map((row) => row.activeImmatureBondedNames)
      ),
      hit8BYear: years.find((row) => row.cumulativeNames >= 8_000_000_000)?.year ?? null,
      hit80BYear: years.find((row) => row.cumulativeNames >= 80_000_000_000)?.year ?? null
    }
  };
}

export function parseSponsoredFlatIssuanceScenario(input: unknown): SponsoredFlatIssuanceScenario {
  const record = assertRecord(input, "sponsored flat issuance scenario");
  const defaults = createDefaultSponsoredFlatIssuanceScenario();

  return {
    years: parsePositiveInteger(record.years ?? defaults.years, "years"),
    directBondedNamesPerYear: parseNonNegativeNumber(
      record.directBondedNamesPerYear ?? defaults.directBondedNamesPerYear,
      "directBondedNamesPerYear"
    ),
    averageDirectBondBtc: parseNonNegativeNumber(
      record.averageDirectBondBtc ?? defaults.averageDirectBondBtc,
      "averageDirectBondBtc"
    ),
    averageContestedAuctionBondBtc: parseNonNegativeNumber(
      record.averageContestedAuctionBondBtc ?? defaults.averageContestedAuctionBondBtc,
      "averageContestedAuctionBondBtc"
    ),
    sponsorMaturityYears: parsePositiveInteger(
      record.sponsorMaturityYears ?? defaults.sponsorMaturityYears,
      "sponsorMaturityYears"
    ),
    sponsorBondRetentionRate: parseRate(
      record.sponsorBondRetentionRate ?? defaults.sponsorBondRetentionRate,
      "sponsorBondRetentionRate"
    ),
    baseCreditsPerBtcYear: parseNonNegativeNumber(
      record.baseCreditsPerBtcYear ?? defaults.baseCreditsPerBtcYear,
      "baseCreditsPerBtcYear"
    ),
    ageMultiplierExponent: parseNonNegativeNumber(
      record.ageMultiplierExponent ?? defaults.ageMultiplierExponent,
      "ageMultiplierExponent"
    ),
    ageMultiplierCap: parsePositiveNumber(
      record.ageMultiplierCap ?? defaults.ageMultiplierCap,
      "ageMultiplierCap"
    ),
    creditCarryoverRate: parseRate(
      record.creditCarryoverRate ?? defaults.creditCarryoverRate,
      "creditCarryoverRate"
    ),
    desiredSponsoredClaimsPerYear: parseNonNegativeNumber(
      record.desiredSponsoredClaimsPerYear ?? defaults.desiredSponsoredClaimsPerYear,
      "desiredSponsoredClaimsPerYear"
    ),
    desiredSponsoredClaimsGrowthRate: parseNonNegativeNumber(
      record.desiredSponsoredClaimsGrowthRate ?? defaults.desiredSponsoredClaimsGrowthRate,
      "desiredSponsoredClaimsGrowthRate"
    ),
    cleanClaimCreditCost: parsePositiveNumber(
      record.cleanClaimCreditCost ?? defaults.cleanClaimCreditCost,
      "cleanClaimCreditCost"
    ),
    contestedClaimCreditCost: parsePositiveNumber(
      record.contestedClaimCreditCost ?? defaults.contestedClaimCreditCost,
      "contestedClaimCreditCost"
    ),
    contestRate: parseRate(record.contestRate ?? defaults.contestRate, "contestRate"),
    invalidChallengeRate: parseRate(
      record.invalidChallengeRate ?? defaults.invalidChallengeRate,
      "invalidChallengeRate"
    ),
    unfairDiscoveryRiskRate: parseRate(record.unfairDiscoveryRiskRate ?? defaults.unfairDiscoveryRiskRate, "unfairDiscoveryRiskRate"),
    transferableInventoryRate: parseRate(
      record.transferableInventoryRate ?? defaults.transferableInventoryRate,
      "transferableInventoryRate"
    ),
    topSponsorCreditShare: parseRate(
      record.topSponsorCreditShare ?? defaults.topSponsorCreditShare,
      "topSponsorCreditShare"
    ),
    contestedAuctionSettlementRate: parseRate(
      record.contestedAuctionSettlementRate ?? defaults.contestedAuctionSettlementRate,
      "contestedAuctionSettlementRate"
    ),
    maxContestedAuctionSettlementsPerYear: parseNonNegativeNumber(
      record.maxContestedAuctionSettlementsPerYear ?? defaults.maxContestedAuctionSettlementsPerYear,
      "maxContestedAuctionSettlementsPerYear"
    )
  };
}

export function serializeSponsoredFlatIssuanceSimulationResult(
  result: SponsoredFlatIssuanceSimulationResult
): SponsoredFlatIssuanceSimulationResult {
  return result;
}

function calculateSponsorState(input: {
  readonly scenario: SponsoredFlatIssuanceScenario;
  readonly cohorts: readonly BondCohort[];
  readonly year: number;
}): {
  readonly eligibleSponsorBtc: number;
  readonly weightedSponsorBtc: number;
} {
  let eligibleSponsorBtc = 0;
  let weightedSponsorBtc = 0;

  for (const cohort of input.cohorts) {
    const ageYears = input.year - cohort.year;
    if (ageYears < input.scenario.sponsorMaturityYears) {
      continue;
    }

    const yearsSinceMaturity = ageYears - input.scenario.sponsorMaturityYears;
    const activeBtc = cohort.bondedBtc *
      (input.scenario.sponsorBondRetentionRate ** yearsSinceMaturity);
    const sponsorAgeYears = yearsSinceMaturity + 1;
    const multiplier = calculateAgeMultiplier({
      ageYears: sponsorAgeYears,
      exponent: input.scenario.ageMultiplierExponent,
      cap: input.scenario.ageMultiplierCap
    });

    eligibleSponsorBtc += activeBtc;
    weightedSponsorBtc += activeBtc * multiplier;
  }

  return {
    eligibleSponsorBtc,
    weightedSponsorBtc
  };
}

function calculateAgeMultiplier(input: {
  readonly ageYears: number;
  readonly exponent: number;
  readonly cap: number;
}): number {
  return Math.min(input.cap, input.ageYears ** input.exponent);
}

function calculateActiveImmatureBondedNames(input: {
  readonly scenario: SponsoredFlatIssuanceScenario;
  readonly cohorts: readonly BondCohort[];
  readonly year: number;
}): number {
  return input.cohorts.reduce((total, cohort) => {
    const ageYears = input.year - cohort.year;
    return ageYears < input.scenario.sponsorMaturityYears
      ? total + cohort.bondedNames
      : total;
  }, 0);
}

function validateScenario(scenario: SponsoredFlatIssuanceScenario): void {
  parseSponsoredFlatIssuanceScenario(scenario);
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value as Record<string, unknown>;
}

function parsePositiveInteger(value: unknown, label: string): number {
  const parsed = parseNumber(value, label);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }

  return parsed;
}

function parseRate(value: unknown, label: string): number {
  const parsed = parseNumber(value, label);
  if (parsed < 0 || parsed > 1) {
    throw new Error(`${label} must be between 0 and 1`);
  }

  return parsed;
}

function parseNonNegativeNumber(value: unknown, label: string): number {
  const parsed = parseNumber(value, label);
  if (parsed < 0) {
    throw new Error(`${label} must be non-negative`);
  }

  return parsed;
}

function parsePositiveNumber(value: unknown, label: string): number {
  const parsed = parseNumber(value, label);
  if (parsed <= 0) {
    throw new Error(`${label} must be positive`);
  }

  return parsed;
}

function parseNumber(value: unknown, label: string): number {
  const parsed = typeof value === "string" ? Number(value) : value;

  if (typeof parsed !== "number" || !Number.isFinite(parsed)) {
    throw new Error(`${label} must be a finite number`);
  }

  return parsed;
}
