function readTestOverrideInteger(name: string, fallback: number): number {
  const raw = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.[name];

  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer when provided`);
  }

  return parsed;
}

export const PROTOCOL_NAME = "ONT";
export const PROTOCOL_MAGIC = "ONT";
export const PROTOCOL_VERSION = 1;
export const PRODUCT_NAME = "Open Name Tags";

export const NAME_MIN_LENGTH = 1;
export const NAME_MAX_LENGTH = 32;
export const NAME_PATTERN = /^[a-z0-9]{1,32}$/;

export const CLAIM_GATE_SATS = 1_000n;
export const AUCTION_MIN_INCREMENT_SATS = 1_000n;
export const AUCTION_BOND_BASE_SATS = 100_000_000n;
export const AUCTION_BOND_FLOOR_SATS = 50_000n;
export const BOND_MATURITY_BLOCKS = readTestOverrideInteger(
  "ONT_TEST_OVERRIDE_BOND_MATURITY_BLOCKS",
  52_560
);

export enum OntEventType {
  Transfer = 0x03,
  AuctionBid = 0x07,
  RecoverOwner = 0x09,
  // Scaling-rail messages (decoded by their own codecs, not the v1 event dispatcher).
  RootAnchor = 0x0b,
  AvailabilityMarker = 0x0d
}

export enum ValueType {
  Null = 0x00,
  BitcoinPaymentTarget = 0x01,
  HttpsTarget = 0x02,
  RawAppDefined = 0xff
}
