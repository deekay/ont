import { schnorr, secp256k1 } from "@noble/curves/secp256k1.js";

import { assertHexBytes, bytesToHex, hexToBytes } from "./bytes.js";
import { concatBytes, sha256Bytes, utf8ToBytes } from "./crypto.js";
import { normalizeName } from "./names.js";
import { deriveOwnerPubkey } from "./value-record.js";

export const RECOVERY_DESCRIPTOR_FORMAT = "ont-recovery-descriptor";
export const RECOVERY_DESCRIPTOR_VERSION = 1;
export const DEFAULT_RECOVERY_SIGNING_PROFILE = "bip322";
export const DEFAULT_RECOVERY_CHALLENGE_WINDOW_BLOCKS = 144;

export interface RecoveryDescriptorFields {
  readonly name: string;
  readonly ownerPubkey: string;
  readonly ownershipRef: string;
  readonly sequence: number;
  readonly previousDescriptorHash: string | null;
  readonly recoveryAddress: string;
  readonly signingProfile: string;
  readonly challengeWindowBlocks: number;
  readonly issuedAt: string;
}

export interface SignedRecoveryDescriptor extends RecoveryDescriptorFields {
  readonly format: typeof RECOVERY_DESCRIPTOR_FORMAT;
  readonly descriptorVersion: typeof RECOVERY_DESCRIPTOR_VERSION;
  readonly signature: string;
}

export function createRecoveryDescriptor(input: RecoveryDescriptorFields & {
  readonly signature: string;
}): SignedRecoveryDescriptor {
  return {
    format: RECOVERY_DESCRIPTOR_FORMAT,
    descriptorVersion: RECOVERY_DESCRIPTOR_VERSION,
    name: normalizeName(input.name),
    ownerPubkey: assertHexBytes(input.ownerPubkey, 32, "ownerPubkey"),
    ownershipRef: assertHexBytes(input.ownershipRef, 32, "ownershipRef"),
    sequence: assertSequence(input.sequence),
    previousDescriptorHash: normalizePreviousDescriptorHash(input.previousDescriptorHash),
    recoveryAddress: normalizeRecoveryAddress(input.recoveryAddress),
    signingProfile: normalizeSigningProfile(input.signingProfile),
    challengeWindowBlocks: assertChallengeWindow(input.challengeWindowBlocks),
    issuedAt: assertIsoTimestamp(input.issuedAt, "issuedAt"),
    signature: assertHexBytes(input.signature, 64, "signature")
  };
}

export function signRecoveryDescriptor(input: {
  readonly name: string;
  readonly ownerPrivateKeyHex: string;
  readonly ownershipRef: string;
  readonly sequence: number;
  readonly previousDescriptorHash: string | null;
  readonly recoveryAddress: string;
  readonly signingProfile?: string;
  readonly challengeWindowBlocks?: number;
  readonly issuedAt?: string;
}): SignedRecoveryDescriptor {
  const ownerPrivateKeyHex = assertHexBytes(input.ownerPrivateKeyHex, 32, "ownerPrivateKeyHex");
  const ownerPrivateKey = hexToBytes(ownerPrivateKeyHex);

  if (!secp256k1.utils.isValidSecretKey(ownerPrivateKey)) {
    throw new Error("ownerPrivateKeyHex must be a valid secp256k1 private key");
  }

  const fields: RecoveryDescriptorFields = {
    name: normalizeName(input.name),
    ownerPubkey: deriveOwnerPubkey(ownerPrivateKeyHex),
    ownershipRef: assertHexBytes(input.ownershipRef, 32, "ownershipRef"),
    sequence: assertSequence(input.sequence),
    previousDescriptorHash: normalizePreviousDescriptorHash(input.previousDescriptorHash),
    recoveryAddress: normalizeRecoveryAddress(input.recoveryAddress),
    signingProfile: normalizeSigningProfile(input.signingProfile ?? DEFAULT_RECOVERY_SIGNING_PROFILE),
    challengeWindowBlocks: assertChallengeWindow(
      input.challengeWindowBlocks ?? DEFAULT_RECOVERY_CHALLENGE_WINDOW_BLOCKS
    ),
    issuedAt: assertIsoTimestamp(input.issuedAt ?? new Date().toISOString(), "issuedAt")
  };

  return createRecoveryDescriptor({
    ...fields,
    signature: bytesToHex(schnorr.sign(computeRecoveryDescriptorDigest(fields), ownerPrivateKey))
  });
}

export function verifyRecoveryDescriptor(input: SignedRecoveryDescriptor): boolean {
  const ownerPubkey = hexToBytes(assertHexBytes(input.ownerPubkey, 32, "ownerPubkey"));
  const signature = hexToBytes(assertHexBytes(input.signature, 64, "signature"));

  try {
    return schnorr.verify(
      signature,
      computeRecoveryDescriptorDigest({
        name: input.name,
        ownerPubkey: input.ownerPubkey,
        ownershipRef: input.ownershipRef,
        sequence: input.sequence,
        previousDescriptorHash: input.previousDescriptorHash,
        recoveryAddress: input.recoveryAddress,
        signingProfile: input.signingProfile,
        challengeWindowBlocks: input.challengeWindowBlocks,
        issuedAt: input.issuedAt
      }),
      ownerPubkey
    );
  } catch {
    return false;
  }
}

export function computeRecoveryDescriptorHash(input: RecoveryDescriptorFields): string {
  return bytesToHex(computeRecoveryDescriptorDigest(input));
}

export function parseSignedRecoveryDescriptor(input: unknown): SignedRecoveryDescriptor {
  const record = assertRecord(input, "recovery descriptor");

  if (record.format !== RECOVERY_DESCRIPTOR_FORMAT) {
    throw new Error(`recovery descriptor format must be ${RECOVERY_DESCRIPTOR_FORMAT}`);
  }

  if (record.descriptorVersion !== RECOVERY_DESCRIPTOR_VERSION) {
    throw new Error(`recovery descriptor version must be ${RECOVERY_DESCRIPTOR_VERSION}`);
  }

  return createRecoveryDescriptor({
    name: assertString(record.name, "name"),
    ownerPubkey: assertString(record.ownerPubkey, "ownerPubkey"),
    ownershipRef: assertString(record.ownershipRef, "ownershipRef"),
    sequence: assertInteger(record.sequence, "sequence"),
    previousDescriptorHash: assertNullableString(record.previousDescriptorHash, "previousDescriptorHash"),
    recoveryAddress: assertString(record.recoveryAddress, "recoveryAddress"),
    signingProfile: assertString(record.signingProfile, "signingProfile"),
    challengeWindowBlocks: assertInteger(record.challengeWindowBlocks, "challengeWindowBlocks"),
    issuedAt: assertString(record.issuedAt, "issuedAt"),
    signature: assertString(record.signature, "signature")
  });
}

function computeRecoveryDescriptorDigest(input: RecoveryDescriptorFields): Uint8Array {
  const name = normalizeName(input.name);
  const ownerPubkey = assertHexBytes(input.ownerPubkey, 32, "ownerPubkey");
  const ownershipRef = assertHexBytes(input.ownershipRef, 32, "ownershipRef");
  const sequence = assertSequence(input.sequence);
  const previousDescriptorHash = normalizePreviousDescriptorHash(input.previousDescriptorHash);
  const recoveryAddress = normalizeRecoveryAddress(input.recoveryAddress);
  const signingProfile = normalizeSigningProfile(input.signingProfile);
  const challengeWindowBlocks = assertChallengeWindow(input.challengeWindowBlocks);
  const issuedAt = assertIsoTimestamp(input.issuedAt, "issuedAt");

  return sha256Bytes(
    concatBytes(
      ...lengthPrefixedUtf8(RECOVERY_DESCRIPTOR_FORMAT),
      Uint8Array.of(RECOVERY_DESCRIPTOR_VERSION),
      ...lengthPrefixedUtf8(name),
      hexToBytes(ownerPubkey),
      hexToBytes(ownershipRef),
      bigIntToUint64Bytes(BigInt(sequence)),
      previousDescriptorHash === null
        ? Uint8Array.of(0)
        : concatBytes(Uint8Array.of(1), hexToBytes(previousDescriptorHash)),
      ...lengthPrefixedUtf8(recoveryAddress),
      ...lengthPrefixedUtf8(signingProfile),
      uint32ToBytes(challengeWindowBlocks),
      ...lengthPrefixedUtf8(issuedAt)
    )
  );
}

function lengthPrefixedUtf8(value: string): readonly [Uint8Array, Uint8Array] {
  const bytes = utf8ToBytes(value);
  return [uint16ToBytes(bytes.length), bytes];
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
    throw new Error("length must fit in 2 bytes");
  }

  return Uint8Array.of((value >> 8) & 0xff, value & 0xff);
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

function assertSequence(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("sequence must be a positive safe integer");
  }

  return value;
}

function assertChallengeWindow(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 0xffff_ffff) {
    throw new Error("challengeWindowBlocks must be a positive unsigned 32-bit integer");
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

function normalizePreviousDescriptorHash(value: string | null): string | null {
  return value === null ? null : assertHexBytes(value, 32, "previousDescriptorHash");
}

function normalizeRecoveryAddress(value: string): string {
  if (typeof value !== "string") {
    throw new Error("recoveryAddress must be a string");
  }

  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 200) {
    throw new Error("recoveryAddress must be 1-200 characters");
  }

  return normalized;
}

function normalizeSigningProfile(value: string): string {
  if (typeof value !== "string") {
    throw new Error("signingProfile must be a string");
  }

  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9._-]{1,32}$/.test(normalized)) {
    throw new Error("signingProfile must be 1-32 lowercase letters, digits, dot, underscore, or hyphen");
  }

  return normalized;
}

function assertIsoTimestamp(value: string, label: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be a valid ISO timestamp`);
  }

  return value;
}
