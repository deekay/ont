import { schnorr, secp256k1 } from "@noble/curves/secp256k1.js";

import { assertHexBytes, bytesToHex, hexToBytes } from "./bytes.js";
import { concatBytes, sha256Bytes, utf8ToBytes } from "./crypto.js";
import { normalizeName } from "./names.js";

export const VALUE_RECORD_FORMAT = "ont-value-record";
export const VALUE_RECORD_VERSION = 2;

export interface ValueRecordFields {
  readonly name: string;
  readonly ownerPubkey: string;
  readonly ownershipRef: string;
  readonly sequence: number;
  readonly previousRecordHash: string | null;
  readonly valueType: number;
  readonly payloadHex: string;
  readonly issuedAt: string;
}

export interface SignedValueRecord extends ValueRecordFields {
  readonly format: typeof VALUE_RECORD_FORMAT;
  readonly recordVersion: typeof VALUE_RECORD_VERSION;
  readonly signature: string;
}

export function createValueRecord(input: ValueRecordFields & {
  readonly signature: string;
}): SignedValueRecord {
  return {
    format: VALUE_RECORD_FORMAT,
    recordVersion: VALUE_RECORD_VERSION,
    name: normalizeName(input.name),
    ownerPubkey: assertHexBytes(input.ownerPubkey, 32, "ownerPubkey"),
    ownershipRef: assertHexBytes(input.ownershipRef, 32, "ownershipRef"),
    sequence: assertSequence(input.sequence),
    previousRecordHash: normalizePreviousRecordHash(input.previousRecordHash),
    valueType: assertByte(input.valueType, "valueType"),
    payloadHex: normalizePayloadHex(input.payloadHex),
    issuedAt: assertIsoTimestamp(input.issuedAt, "issuedAt"),
    signature: assertHexBytes(input.signature, 64, "signature")
  };
}

export function signValueRecord(input: {
  readonly name: string;
  readonly ownerPrivateKeyHex: string;
  readonly ownershipRef: string;
  readonly sequence: number;
  readonly previousRecordHash: string | null;
  readonly valueType: number;
  readonly payloadHex: string;
  readonly issuedAt?: string;
}): SignedValueRecord {
  const ownerPrivateKeyHex = assertHexBytes(input.ownerPrivateKeyHex, 32, "ownerPrivateKeyHex");
  const ownerPrivateKey = hexToBytes(ownerPrivateKeyHex);

  if (!secp256k1.utils.isValidSecretKey(ownerPrivateKey)) {
    throw new Error("ownerPrivateKeyHex must be a valid secp256k1 private key");
  }

  const ownerPubkey = deriveOwnerPubkey(ownerPrivateKeyHex);
  const fields: ValueRecordFields = {
    name: normalizeName(input.name),
    ownerPubkey,
    ownershipRef: assertHexBytes(input.ownershipRef, 32, "ownershipRef"),
    sequence: assertSequence(input.sequence),
    previousRecordHash: normalizePreviousRecordHash(input.previousRecordHash),
    valueType: assertByte(input.valueType, "valueType"),
    payloadHex: normalizePayloadHex(input.payloadHex),
    issuedAt: assertIsoTimestamp(input.issuedAt ?? new Date().toISOString(), "issuedAt")
  };

  return createValueRecord({
    ...fields,
    signature: bytesToHex(schnorr.sign(computeValueRecordDigest(fields), ownerPrivateKey))
  });
}

export function deriveOwnerPubkey(ownerPrivateKeyHex: string): string {
  const ownerPrivateKey = hexToBytes(assertHexBytes(ownerPrivateKeyHex, 32, "ownerPrivateKeyHex"));

  if (!secp256k1.utils.isValidSecretKey(ownerPrivateKey)) {
    throw new Error("ownerPrivateKeyHex must be a valid secp256k1 private key");
  }

  return bytesToHex(schnorr.getPublicKey(ownerPrivateKey));
}

export function verifyValueRecord(input: SignedValueRecord): boolean {
  const ownerPubkey = hexToBytes(assertHexBytes(input.ownerPubkey, 32, "ownerPubkey"));
  const signature = hexToBytes(assertHexBytes(input.signature, 64, "signature"));

  try {
    return schnorr.verify(
      signature,
      computeValueRecordDigest({
        name: input.name,
        ownerPubkey: input.ownerPubkey,
        ownershipRef: input.ownershipRef,
        sequence: input.sequence,
        previousRecordHash: input.previousRecordHash,
        valueType: input.valueType,
        payloadHex: input.payloadHex,
        issuedAt: input.issuedAt
      }),
      ownerPubkey
    );
  } catch {
    return false;
  }
}

export function computeValueRecordHash(input: ValueRecordFields): string {
  return bytesToHex(computeValueRecordDigest(input));
}

export function parseSignedValueRecord(input: unknown): SignedValueRecord {
  const record = assertRecord(input, "value record");

  if (record.format !== VALUE_RECORD_FORMAT) {
    throw new Error(`value record format must be ${VALUE_RECORD_FORMAT}`);
  }

  if (record.recordVersion !== VALUE_RECORD_VERSION) {
    throw new Error(`value record version must be ${VALUE_RECORD_VERSION}`);
  }

  return createValueRecord({
    name: assertString(record.name, "name"),
    ownerPubkey: assertString(record.ownerPubkey, "ownerPubkey"),
    ownershipRef: assertString(record.ownershipRef, "ownershipRef"),
    sequence: assertInteger(record.sequence, "sequence"),
    previousRecordHash: assertNullableString(record.previousRecordHash, "previousRecordHash"),
    valueType: assertInteger(record.valueType, "valueType"),
    payloadHex: assertString(record.payloadHex, "payloadHex"),
    issuedAt: assertString(record.issuedAt, "issuedAt"),
    signature: assertString(record.signature, "signature")
  });
}

function computeValueRecordDigest(input: ValueRecordFields): Uint8Array {
  const name = normalizeName(input.name);
  const ownerPubkey = assertHexBytes(input.ownerPubkey, 32, "ownerPubkey");
  const ownershipRef = assertHexBytes(input.ownershipRef, 32, "ownershipRef");
  const sequence = assertSequence(input.sequence);
  const previousRecordHash = normalizePreviousRecordHash(input.previousRecordHash);
  const valueType = assertByte(input.valueType, "valueType");
  const payloadHex = normalizePayloadHex(input.payloadHex);
  const payloadBytes = hexToBytes(payloadHex);
  const issuedAt = assertIsoTimestamp(input.issuedAt, "issuedAt");
  return sha256Bytes(
    concatBytes(
      ...lengthPrefixedUtf8(VALUE_RECORD_FORMAT),
      Uint8Array.of(VALUE_RECORD_VERSION),
      ...lengthPrefixedUtf8(name),
      hexToBytes(ownerPubkey),
      hexToBytes(ownershipRef),
      bigIntToUint64Bytes(BigInt(sequence)),
      previousRecordHash === null
        ? Uint8Array.of(0)
        : concatBytes(Uint8Array.of(1), hexToBytes(previousRecordHash)),
      Uint8Array.of(valueType),
      uint16ToBytes(payloadBytes.length),
      payloadBytes,
      ...lengthPrefixedUtf8(issuedAt)
    )
  );
}

function lengthPrefixedUtf8(value: string): readonly [Uint8Array, Uint8Array] {
  const bytes = utf8ToBytes(value);
  return [uint16ToBytes(bytes.length), bytes];
}

function normalizePayloadHex(payloadHex: string): string {
  if (typeof payloadHex !== "string") {
    throw new Error("payloadHex must be a string");
  }

  const normalized = payloadHex.toLowerCase();
  const payloadBytes = hexToBytes(normalized);

  if (payloadBytes.length > 0xffff) {
    throw new Error("payloadHex must fit in 65535 bytes");
  }

  return normalized;
}

function bigIntToUint64Bytes(value: bigint): Uint8Array {
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) {
    throw new Error("sequence must fit in 8 bytes");
  }

  const bytes = new Uint8Array(8);
  let remaining = value;

  for (let index = 7; index >= 0; index -= 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }

  return bytes;
}

function uint16ToBytes(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new Error("payload length must fit in 2 bytes");
  }

  return Uint8Array.of((value >> 8) & 0xff, value & 0xff);
}

function assertSequence(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("sequence must be a positive safe integer");
  }

  return value;
}

function assertByte(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new Error(`${label} must fit in one byte`);
  }

  return value;
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

function assertNullableString(value: unknown, label: string): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`${label} must be a string or null`);
  }

  return value;
}

function assertInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer`);
  }

  return value as number;
}

function normalizePreviousRecordHash(value: string | null): string | null {
  return value === null ? null : assertHexBytes(value, 32, "previousRecordHash");
}

function assertIsoTimestamp(value: string, label: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be a valid ISO timestamp`);
  }

  return value;
}
