import {
  AUCTION_BOND_BASE_SATS,
  AUCTION_BOND_FLOOR_SATS,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH
} from "./constants.js";

export function getBondSats(nameLength: number): bigint {
  assertNameLength(nameLength);

  const halved = AUCTION_BOND_BASE_SATS >> BigInt(nameLength - 1);
  return halved > AUCTION_BOND_FLOOR_SATS ? halved : AUCTION_BOND_FLOOR_SATS;
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
