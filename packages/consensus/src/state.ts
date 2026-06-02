import { BOND_MATURITY_BLOCKS, getBondSats, getMaturityHeight, normalizeName } from "@ont/protocol";

export type NameStatus = "unclaimed" | "pending" | "immature" | "mature" | "invalid";
export type ClaimedNameStatus = Exclude<NameStatus, "unclaimed">;

export interface ClaimState {
  readonly name: string;
  readonly claimHeight: number;
  readonly maturityHeight: number;
  readonly requiredBondSats: bigint;
}

// Current bonded-name claim state uses one fixed maturity duration. `epochIndex`
// remains optional only so older prototype callers do not break at compile time;
// it is intentionally ignored.
export function createClaimState(input: {
  name: string;
  claimHeight: number;
  /** @deprecated Epoch maturity is prototype residue and is ignored. */
  epochIndex?: number;
}): ClaimState {
  const name = normalizeName(input.name);

  return {
    name,
    claimHeight: input.claimHeight,
    maturityHeight: getMaturityHeight(input.claimHeight, BOND_MATURITY_BLOCKS),
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
