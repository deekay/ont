import { bytesToHex, hexToBytes } from "./bytes.js";
import { OntEventType, PROTOCOL_MAGIC, PROTOCOL_VERSION } from "./constants.js";
import { bytesToUtf8, concatBytes, utf8ToBytes } from "./crypto.js";
import {
  AUCTION_BID_FLAG_INCLUDES_NAME,
  createAuctionBidPayload,
  createTransferPayload,
  type AuctionBidEventPayload,
  type TransferEventPayload
} from "./events.js";

const MAGIC_BYTES = utf8ToBytes(PROTOCOL_MAGIC);

export const TRANSFER_BODY_LENGTH = 32 + 32 + 1 + 1 + 64;
export const AUCTION_BID_FIXED_PAYLOAD_LENGTH = 3 + 1 + 1 + 1 + 1 + 4 + 8 + 32 + 16 + 32 + 16;
export const AUCTION_BID_NAMED_PAYLOAD_OVERHEAD = 4 + 1;

export type DecodedOntPayload =
  | { readonly type: OntEventType.Transfer; readonly payload: TransferEventPayload }
  | { readonly type: OntEventType.AuctionBid; readonly payload: AuctionBidEventPayload };

export function encodeAuctionBidPayload(payload: AuctionBidEventPayload): Uint8Array {
  const normalized = createAuctionBidPayload(payload);

  const fixedPayload = joinBytes(
    MAGIC_BYTES,
    Uint8Array.of(
      PROTOCOL_VERSION,
      OntEventType.AuctionBid,
      normalized.flags,
      normalized.bondVout
    ),
    uint32ToBytes(normalized.settlementLockBlocks),
    bigIntToUint64Bytes(normalized.bidAmountSats),
    hexToBytes(normalized.ownerPubkey),
    hexToBytes(normalized.auctionLotCommitment),
    hexToBytes(normalized.auctionCommitment),
    hexToBytes(normalized.bidderCommitment)
  );
  const nameBytes = utf8ToBytes(normalized.name);

  return joinBytes(
    fixedPayload,
    uint32ToBytes(normalized.unlockBlock),
    Uint8Array.of(nameBytes.length),
    nameBytes
  );
}

export function decodeAuctionBidPayload(payload: Uint8Array): AuctionBidEventPayload {
  assertHeader(payload, OntEventType.AuctionBid);

  if (payload.length < AUCTION_BID_FIXED_PAYLOAD_LENGTH + AUCTION_BID_NAMED_PAYLOAD_OVERHEAD) {
    throw new Error("auction bid payload must include name context");
  }

  const flags = payload[5] ?? 0;
  if ((flags & AUCTION_BID_FLAG_INCLUDES_NAME) === 0) {
    throw new Error("auction bid payload must include name context");
  }

  const base = {
    flags,
    bondVout: payload[6] ?? 0,
    settlementLockBlocks: uint32FromBytes(payload.slice(7, 11)),
    bidAmountSats: uint64BytesToBigInt(payload.slice(11, 19)),
    ownerPubkey: bytesToHex(payload.slice(19, 51)),
    auctionLotCommitment: bytesToHex(payload.slice(51, 67)),
    auctionCommitment: bytesToHex(payload.slice(67, 99)),
    bidderCommitment: bytesToHex(payload.slice(99, 115))
  };

  const unlockBlockOffset = AUCTION_BID_FIXED_PAYLOAD_LENGTH;
  const nameLengthOffset = unlockBlockOffset + 4;
  const nameLength = payload[nameLengthOffset] ?? 0;
  const nameStart = nameLengthOffset + 1;
  const nameEnd = nameStart + nameLength;

  if (nameLength === 0) {
    throw new Error("named auction bid payload name is empty");
  }

  if (payload.length !== nameEnd) {
    throw new Error("named auction bid payload has inconsistent name length");
  }

  return createAuctionBidPayload({
    ...base,
    unlockBlock: uint32FromBytes(payload.slice(unlockBlockOffset, nameLengthOffset)),
    name: bytesToUtf8(payload.slice(nameStart, nameEnd))
  });
}

export function encodeTransferBody(payload: TransferEventPayload): Uint8Array {
  const normalized = createTransferPayload(payload);

  return joinBytes(
    hexToBytes(normalized.prevStateTxid),
    hexToBytes(normalized.newOwnerPubkey),
    Uint8Array.of(normalized.flags, normalized.successorBondVout),
    hexToBytes(normalized.signature)
  );
}

export function decodeTransferBody(payload: Uint8Array): TransferEventPayload {
  if (payload.length !== TRANSFER_BODY_LENGTH) {
    throw new Error(`transfer body must be ${TRANSFER_BODY_LENGTH} bytes`);
  }

  return createTransferPayload({
    prevStateTxid: bytesToHex(payload.slice(0, 32)),
    newOwnerPubkey: bytesToHex(payload.slice(32, 64)),
    flags: payload[64] ?? 0,
    successorBondVout: payload[65] ?? 0,
    signature: bytesToHex(payload.slice(66, 130))
  });
}

export function decodeOntPayload(payload: Uint8Array): DecodedOntPayload {
  const type = peekEventType(payload);

  switch (type) {
    case OntEventType.Transfer:
      return { type, payload: decodeTransferBody(payload.slice(5)) };
    case OntEventType.AuctionBid:
      return { type, payload: decodeAuctionBidPayload(payload) };
  }
}

export function peekEventType(payload: Uint8Array): OntEventType {
  assertOntPrefix(payload);

  const type = payload[4];

  if (
    type !== OntEventType.Transfer &&
    type !== OntEventType.AuctionBid
  ) {
    throw new Error(`unsupported event type ${type}`);
  }

  return type;
}

export function encodeTransferPayload(payload: TransferEventPayload): Uint8Array {
  return joinBytes(
    MAGIC_BYTES,
    Uint8Array.of(PROTOCOL_VERSION, OntEventType.Transfer),
    encodeTransferBody(payload)
  );
}

function assertHeader(payload: Uint8Array, eventType: OntEventType, exactLength?: number): void {
  if (exactLength !== undefined && payload.length !== exactLength) {
    throw new Error(`payload must be ${exactLength} bytes`);
  }

  assertOntPrefix(payload);

  const type = payload[4];
  if (type !== eventType) {
    throw new Error(`unexpected event type ${type}`);
  }
}

function assertOntPrefix(payload: Uint8Array): void {
  if (payload.length < 5) {
    throw new Error("payload is too short");
  }

  const magic = bytesToUtf8(payload.slice(0, 3));
  if (magic !== PROTOCOL_MAGIC) {
    throw new Error("payload does not start with the ONT magic bytes");
  }

  const version = payload[3];
  if (version !== PROTOCOL_VERSION) {
    throw new Error(`unsupported protocol version ${version}`);
  }
}

function bigIntToUint64Bytes(value: bigint): Uint8Array {
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) {
    throw new Error("value must fit in an unsigned 64-bit integer");
  }

  const bytes = new Uint8Array(8);
  let remaining = value;

  for (let index = 7; index >= 0; index -= 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }

  return bytes;
}

function uint64BytesToBigInt(bytes: Uint8Array): bigint {
  if (bytes.length !== 8) {
    throw new Error("uint64 requires exactly 8 bytes");
  }

  let value = 0n;

  for (const current of bytes) {
    value = (value << 8n) | BigInt(current);
  }

  return value;
}

function uint32ToBytes(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new Error("value must fit in an unsigned 32-bit integer");
  }

  return Uint8Array.of(
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff
  );
}

function uint32FromBytes(bytes: Uint8Array): number {
  if (bytes.length !== 4) {
    throw new Error("uint32 requires exactly 4 bytes");
  }

  return (
    ((bytes[0] ?? 0) * 0x1000000)
    + ((bytes[1] ?? 0) << 16)
    + ((bytes[2] ?? 0) << 8)
    + (bytes[3] ?? 0)
  );
}

const joinBytes = concatBytes;
