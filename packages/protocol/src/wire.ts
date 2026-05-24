import { bytesToHex, hexToBytes } from "./bytes.js";
import { OntEventType, PROTOCOL_MAGIC, PROTOCOL_VERSION } from "./constants.js";
import { bytesToUtf8, concatBytes, utf8ToBytes } from "./crypto.js";
import {
  AUCTION_BID_FLAG_INCLUDES_NAME,
  type AvailabilityMarkerEventPayload,
  createAuctionBidPayload,
  createAvailabilityMarkerPayload,
  createRecoverOwnerPayload,
  createRootAnchorPayload,
  createTransferPayload,
  type AuctionBidEventPayload,
  type RecoverOwnerEventPayload,
  type RootAnchorEventPayload,
  type TransferEventPayload
} from "./events.js";

const MAGIC_BYTES = utf8ToBytes(PROTOCOL_MAGIC);

export const TRANSFER_BODY_LENGTH = 32 + 32 + 1 + 1 + 64;
export const RECOVER_OWNER_BODY_LENGTH = 32 + 32 + 1 + 1 + 4 + 32 + 64;
export const AUCTION_BID_FIXED_PAYLOAD_LENGTH = 3 + 1 + 1 + 1 + 1 + 4 + 8 + 32 + 16 + 32 + 16;
export const AUCTION_BID_NAMED_PAYLOAD_OVERHEAD = 4 + 1;
export const ROOT_ANCHOR_BODY_LENGTH = 32 + 32 + 4; // prevRoot|newRoot|batchSize
export const AVAILABILITY_MARKER_BODY_LENGTH = 32 + 4; // dataDigest|batchSize

export type DecodedOntPayload =
  | { readonly type: OntEventType.Transfer; readonly payload: TransferEventPayload }
  | { readonly type: OntEventType.AuctionBid; readonly payload: AuctionBidEventPayload }
  | { readonly type: OntEventType.RecoverOwner; readonly payload: RecoverOwnerEventPayload };

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

export function encodeRecoverOwnerBody(payload: RecoverOwnerEventPayload): Uint8Array {
  const normalized = createRecoverOwnerPayload(payload);

  return joinBytes(
    hexToBytes(normalized.prevStateTxid),
    hexToBytes(normalized.newOwnerPubkey),
    Uint8Array.of(normalized.flags, normalized.successorBondVout),
    uint32ToBytes(normalized.challengeWindowBlocks),
    hexToBytes(normalized.recoveryDescriptorHash),
    hexToBytes(normalized.signature)
  );
}

export function decodeRecoverOwnerBody(payload: Uint8Array): RecoverOwnerEventPayload {
  if (payload.length !== RECOVER_OWNER_BODY_LENGTH) {
    throw new Error(`recover owner body must be ${RECOVER_OWNER_BODY_LENGTH} bytes`);
  }

  return createRecoverOwnerPayload({
    prevStateTxid: bytesToHex(payload.slice(0, 32)),
    newOwnerPubkey: bytesToHex(payload.slice(32, 64)),
    flags: payload[64] ?? 0,
    successorBondVout: payload[65] ?? 0,
    challengeWindowBlocks: uint32FromBytes(payload.slice(66, 70)),
    recoveryDescriptorHash: bytesToHex(payload.slice(70, 102)),
    signature: bytesToHex(payload.slice(102, 166))
  });
}

export function decodeOntPayload(payload: Uint8Array): DecodedOntPayload {
  const type = peekEventType(payload);

  switch (type) {
    case OntEventType.Transfer:
      return { type, payload: decodeTransferBody(payload.slice(5)) };
    case OntEventType.AuctionBid:
      return { type, payload: decodeAuctionBidPayload(payload) };
    case OntEventType.RecoverOwner:
      return { type, payload: decodeRecoverOwnerBody(payload.slice(5)) };
  }
}

export function peekEventType(
  payload: Uint8Array
): OntEventType.Transfer | OntEventType.AuctionBid | OntEventType.RecoverOwner {
  assertOntPrefix(payload);

  const type = payload[4];

  if (
    type !== OntEventType.Transfer &&
    type !== OntEventType.AuctionBid &&
    type !== OntEventType.RecoverOwner
  ) {
    throw new Error(`unsupported event type ${type}`);
  }

  return type;
}

// --- Scaling-rail codecs (root anchor + availability marker) ---
// These use the same magic+version+type framing but are decoded by their own functions, kept out of
// the v1 `decodeOntPayload` dispatcher above.

export function encodeRootAnchorBody(payload: RootAnchorEventPayload): Uint8Array {
  const normalized = createRootAnchorPayload(payload);
  return joinBytes(
    hexToBytes(normalized.prevRoot),
    hexToBytes(normalized.newRoot),
    uint32ToBytes(normalized.batchSize)
  );
}

export function decodeRootAnchorBody(body: Uint8Array): RootAnchorEventPayload {
  if (body.length !== ROOT_ANCHOR_BODY_LENGTH) {
    throw new Error(`root anchor body must be ${ROOT_ANCHOR_BODY_LENGTH} bytes`);
  }
  return createRootAnchorPayload({
    prevRoot: bytesToHex(body.slice(0, 32)),
    newRoot: bytesToHex(body.slice(32, 64)),
    batchSize: uint32FromBytes(body.slice(64, 68))
  });
}

export function encodeRootAnchorPayload(payload: RootAnchorEventPayload): Uint8Array {
  return joinBytes(
    MAGIC_BYTES,
    Uint8Array.of(PROTOCOL_VERSION, OntEventType.RootAnchor),
    encodeRootAnchorBody(payload)
  );
}

export function decodeRootAnchorPayload(payload: Uint8Array): RootAnchorEventPayload {
  const expected = 5 + ROOT_ANCHOR_BODY_LENGTH;
  if (payload.length !== expected) {
    throw new Error(`root anchor payload must be ${expected} bytes`);
  }
  assertOntPrefix(payload);
  if (payload[4] !== OntEventType.RootAnchor) {
    throw new Error("payload is not a root anchor");
  }
  return decodeRootAnchorBody(payload.slice(5));
}

export function encodeAvailabilityMarkerBody(payload: AvailabilityMarkerEventPayload): Uint8Array {
  const normalized = createAvailabilityMarkerPayload(payload);
  return joinBytes(hexToBytes(normalized.dataDigest), uint32ToBytes(normalized.batchSize));
}

export function decodeAvailabilityMarkerBody(body: Uint8Array): AvailabilityMarkerEventPayload {
  if (body.length !== AVAILABILITY_MARKER_BODY_LENGTH) {
    throw new Error(`availability marker body must be ${AVAILABILITY_MARKER_BODY_LENGTH} bytes`);
  }
  return createAvailabilityMarkerPayload({
    dataDigest: bytesToHex(body.slice(0, 32)),
    batchSize: uint32FromBytes(body.slice(32, 36))
  });
}

export function encodeAvailabilityMarkerPayload(payload: AvailabilityMarkerEventPayload): Uint8Array {
  return joinBytes(
    MAGIC_BYTES,
    Uint8Array.of(PROTOCOL_VERSION, OntEventType.AvailabilityMarker),
    encodeAvailabilityMarkerBody(payload)
  );
}

export function decodeAvailabilityMarkerPayload(payload: Uint8Array): AvailabilityMarkerEventPayload {
  const expected = 5 + AVAILABILITY_MARKER_BODY_LENGTH;
  if (payload.length !== expected) {
    throw new Error(`availability marker payload must be ${expected} bytes`);
  }
  assertOntPrefix(payload);
  if (payload[4] !== OntEventType.AvailabilityMarker) {
    throw new Error("payload is not an availability marker");
  }
  return decodeAvailabilityMarkerBody(payload.slice(5));
}

export function encodeTransferPayload(payload: TransferEventPayload): Uint8Array {
  return joinBytes(
    MAGIC_BYTES,
    Uint8Array.of(PROTOCOL_VERSION, OntEventType.Transfer),
    encodeTransferBody(payload)
  );
}

export function encodeRecoverOwnerPayload(payload: RecoverOwnerEventPayload): Uint8Array {
  return joinBytes(
    MAGIC_BYTES,
    Uint8Array.of(PROTOCOL_VERSION, OntEventType.RecoverOwner),
    encodeRecoverOwnerBody(payload)
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
