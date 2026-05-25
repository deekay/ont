import { getBondSats, getMaturityBlocks, getMaturityHeight, normalizeName } from "@ont/protocol";

export type NameStatus = "unclaimed" | "pending" | "immature" | "mature" | "invalid";
export type ClaimedNameStatus = Exclude<NameStatus, "unclaimed">;

export interface ClaimState {
  readonly name: string;
  readonly claimHeight: number;
  readonly maturityHeight: number;
  readonly requiredBondSats: bigint;
}

export function createClaimState(input: {
  name: string;
  claimHeight: number;
  epochIndex: number;
}): ClaimState {
  const name = normalizeName(input.name);
  const maturityBlocks = getMaturityBlocks(input.epochIndex);

  return {
    name,
    claimHeight: input.claimHeight,
    maturityHeight: getMaturityHeight(input.claimHeight, maturityBlocks),
    requiredBondSats: getBondSats(name.length)
  };
}

export function getNameStatus(input: {
  isClaimed: boolean;
  isRevealConfirmed: boolean;
  currentHeight: number;
  maturityHeight: number;
  continuityIntact: boolean;
}): NameStatus {
  if (!input.isClaimed) {
    return "unclaimed";
  }

  if (!input.continuityIntact) {
    return "invalid";
  }

  if (!input.isRevealConfirmed) {
    return "pending";
  }

  return input.currentHeight >= input.maturityHeight ? "mature" : "immature";
}

export function getClaimedNameStatus(input: {
  isRevealConfirmed: boolean;
  currentHeight: number;
  maturityHeight: number;
  continuityIntact: boolean;
}): ClaimedNameStatus {
  if (!input.continuityIntact) {
    return "invalid";
  }

  if (!input.isRevealConfirmed) {
    return "pending";
  }

  return input.currentHeight >= input.maturityHeight ? "mature" : "immature";
}
