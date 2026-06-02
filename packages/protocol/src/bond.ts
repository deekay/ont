import {
  AUCTION_BOND_BASE_SATS,
  AUCTION_BOND_FLOOR_SATS,
  EPOCH_LENGTH_BLOCKS,
  INITIAL_MATURITY_BLOCKS,
  MIN_MATURITY_BLOCKS,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH
} from "./constants.js";

export function getBondSats(nameLength: number): bigint {
  assertNameLength(nameLength);

  const halved = AUCTION_BOND_BASE_SATS >> BigInt(nameLength - 1);
  return halved > AUCTION_BOND_FLOOR_SATS ? halved : AUCTION_BOND_FLOOR_SATS;
}

/**
 * @deprecated Epoch-based maturity is retained for prototype compatibility.
 * Current launch docs use a fixed bonded-name maturity.
 */
export function getEpochIndex(claimHeight: number, launchHeight: number): number {
  if (!Number.isInteger(claimHeight) || claimHeight < 0) {
    throw new Error("claimHeight must be a non-negative integer");
  }

  if (!Number.isInteger(launchHeight) || launchHeight < 0) {
    throw new Error("launchHeight must be a non-negative integer");
  }

  if (claimHeight < launchHeight) {
    throw new Error("claimHeight cannot be before launchHeight");
  }

  return Math.floor((claimHeight - launchHeight) / EPOCH_LENGTH_BLOCKS);
}

/**
 * @deprecated Epoch-based maturity is retained for prototype compatibility.
 * Current launch docs use a fixed bonded-name maturity.
 */
export function getMaturityBlocks(epochIndex: number): number {
  if (!Number.isInteger(epochIndex) || epochIndex < 0) {
    throw new Error("epochIndex must be a non-negative integer");
  }

  const halved = INITIAL_MATURITY_BLOCKS >> epochIndex;
  return halved > MIN_MATURITY_BLOCKS ? halved : MIN_MATURITY_BLOCKS;
}

export function getMaturityHeight(claimHeight: number, maturityBlocks: number): number {
  if (!Number.isInteger(claimHeight) || claimHeight < 0) {
    throw new Error("claimHeight must be a non-negative integer");
  }

  if (!Number.isInteger(maturityBlocks) || maturityBlocks < 0) {
    throw new Error("maturityBlocks must be a non-negative integer");
  }

  return claimHeight + maturityBlocks;
}

function assertNameLength(nameLength: number): void {
  if (!Number.isInteger(nameLength)) {
    throw new Error("name length must be an integer");
  }

  if (nameLength < NAME_MIN_LENGTH || nameLength > NAME_MAX_LENGTH) {
    throw new Error(`name length must be between ${NAME_MIN_LENGTH} and ${NAME_MAX_LENGTH}`);
  }
}
