import { Verifier } from "bip322-js";

import { assertHexBytes, bytesToHex, hexToBytes } from "./bytes.js";
import { concatBytes, sha256Bytes, utf8ToBytes } from "./crypto.js";
import { createRecoveryWalletProofMessage, RECOVERY_WALLET_PROOF_PROFILE } from "./events.js";
import { normalizeName } from "./names.js";
import {
  computeRecoveryDescriptorHash,
  DEFAULT_RECOVERY_SIGNING_PROFILE,
  type SignedRecoveryDescriptor
} from "./recovery-descriptor.js";

export const RECOVERY_WALLET_PROOF_FORMAT = "ont-recovery-wallet-proof";
export const RECOVERY_WALLET_PROOF_VERSION = 1;
export const RECOVERY_WALLET_PROOF_COMMITMENT_RESERVED_HEX = "00".repeat(32);

export interface RecoveryWalletProofFields {
  readonly name: string;
  readonly prevStateTxid: string;
  readonly recoveryDescriptorHash: string;
  readonly newOwnerPubkey: string;
  readonly successorBondVout: number;
  readonly challengeWindowBlocks: number;
  readonly chainTipBlockHash?: string;
  readonly chainTipHeight?: number;
}

export interface RecoveryWalletProof extends RecoveryWalletProofFields {
  readonly format: typeof RECOVERY_WALLET_PROOF_FORMAT;
  readonly proofVersion: typeof RECOVERY_WALLET_PROOF_VERSION;
  readonly recoveryAddress: string;
  readonly signingProfile: string;
  readonly message: string;
  readonly signatureBase64: string;
}

export interface RecoveryWalletProofVerificationResult {
  readonly ok: boolean;
  readonly reason: string;
  readonly proofHash: string;
}

export function createRecoveryWalletProof(
  input: RecoveryWalletProofFields & {
    readonly recoveryAddress: string;
    readonly signingProfile?: string;
    readonly signatureBase64: string;
  }
): RecoveryWalletProof {
  const normalizedFields = normalizeRecoveryWalletProofFields(input);
  const signingProfile = normalizeRecoverySigningProfile(
    input.signingProfile ?? DEFAULT_RECOVERY_SIGNING_PROFILE
  );

  return {
    format: RECOVERY_WALLET_PROOF_FORMAT,
    proofVersion: RECOVERY_WALLET_PROOF_VERSION,
    ...normalizedFields,
    recoveryAddress: normalizeRecoveryAddress(input.recoveryAddress),
    signingProfile,
    message: createRecoveryWalletProofMessage(normalizedFields),
    signatureBase64: normalizeBase64(input.signatureBase64, "signatureBase64")
  };
}

export function parseRecoveryWalletProof(input: unknown): RecoveryWalletProof {
  const record = assertRecord(input, "recovery wallet proof");

  if (record.format !== RECOVERY_WALLET_PROOF_FORMAT) {
    throw new Error(`recovery wallet proof format must be ${RECOVERY_WALLET_PROOF_FORMAT}`);
  }

  if (record.proofVersion !== RECOVERY_WALLET_PROOF_VERSION) {
    throw new Error(`recovery wallet proof version must be ${RECOVERY_WALLET_PROOF_VERSION}`);
  }

  const proof = createRecoveryWalletProof({
    name: assertString(record.name, "name"),
    prevStateTxid: assertString(record.prevStateTxid, "prevStateTxid"),
    recoveryDescriptorHash: assertString(record.recoveryDescriptorHash, "recoveryDescriptorHash"),
    newOwnerPubkey: assertString(record.newOwnerPubkey, "newOwnerPubkey"),
    successorBondVout: assertInteger(record.successorBondVout, "successorBondVout"),
    challengeWindowBlocks: assertInteger(record.challengeWindowBlocks, "challengeWindowBlocks"),
    ...(record.chainTipBlockHash === undefined
      ? {}
      : { chainTipBlockHash: assertString(record.chainTipBlockHash, "chainTipBlockHash") }),
    ...(record.chainTipHeight === undefined
      ? {}
      : { chainTipHeight: assertInteger(record.chainTipHeight, "chainTipHeight") }),
    recoveryAddress: assertString(record.recoveryAddress, "recoveryAddress"),
    signingProfile: assertString(record.signingProfile, "signingProfile"),
    signatureBase64: assertString(record.signatureBase64, "signatureBase64")
  });

  if (record.message !== proof.message) {
    throw new Error("recovery wallet proof message does not match normalized fields");
  }

  return proof;
}

export function verifyRecoveryWalletProof(input: {
  readonly descriptor: SignedRecoveryDescriptor;
  readonly proof: RecoveryWalletProof;
  readonly expected?: Partial<RecoveryWalletProofFields>;
}): RecoveryWalletProofVerificationResult {
  const proofHash = computeRecoveryWalletProofHash(input.proof);
  const descriptorHash = computeRecoveryDescriptorHash(input.descriptor);

  if (!verifyProofFieldMatches(input.proof.recoveryDescriptorHash, descriptorHash)) {
    return { ok: false, reason: "proof_descriptor_hash_mismatch", proofHash };
  }

  if (!verifyProofFieldMatches(input.proof.name, normalizeName(input.descriptor.name))) {
    return { ok: false, reason: "proof_name_mismatch", proofHash };
  }

  if (!verifyProofFieldMatches(input.proof.recoveryAddress, input.descriptor.recoveryAddress)) {
    return { ok: false, reason: "proof_recovery_address_mismatch", proofHash };
  }

  if (!verifyProofFieldMatches(input.proof.signingProfile, input.descriptor.signingProfile)) {
    return { ok: false, reason: "proof_signing_profile_mismatch", proofHash };
  }

  if (input.proof.signingProfile !== RECOVERY_WALLET_PROOF_PROFILE) {
    return { ok: false, reason: "unsupported_recovery_signing_profile", proofHash };
  }

  if (input.proof.challengeWindowBlocks !== input.descriptor.challengeWindowBlocks) {
    return { ok: false, reason: "proof_challenge_window_mismatch", proofHash };
  }

  const expectedMessage = createRecoveryWalletProofMessage(input.proof);
  if (input.proof.message !== expectedMessage) {
    return { ok: false, reason: "proof_message_mismatch", proofHash };
  }

  const expected = input.expected ?? {};
  const expectedMatches =
    (expected.name === undefined || normalizeName(expected.name) === input.proof.name) &&
    (expected.prevStateTxid === undefined || expected.prevStateTxid === input.proof.prevStateTxid) &&
    (expected.recoveryDescriptorHash === undefined ||
      expected.recoveryDescriptorHash === input.proof.recoveryDescriptorHash) &&
    (expected.newOwnerPubkey === undefined || expected.newOwnerPubkey === input.proof.newOwnerPubkey) &&
    (expected.successorBondVout === undefined ||
      expected.successorBondVout === input.proof.successorBondVout) &&
    (expected.challengeWindowBlocks === undefined ||
      expected.challengeWindowBlocks === input.proof.challengeWindowBlocks) &&
    (expected.chainTipBlockHash === undefined ||
      expected.chainTipBlockHash === input.proof.chainTipBlockHash) &&
    (expected.chainTipHeight === undefined || expected.chainTipHeight === input.proof.chainTipHeight);

  if (!expectedMatches) {
    return { ok: false, reason: "proof_expected_fields_mismatch", proofHash };
  }

  try {
    const ok = Verifier.verifySignature(
      input.proof.recoveryAddress,
      input.proof.message,
      input.proof.signatureBase64,
      true
    );

    return ok
      ? { ok: true, reason: "valid", proofHash }
      : { ok: false, reason: "wallet_signature_invalid", proofHash };
  } catch {
    return { ok: false, reason: "wallet_signature_invalid", proofHash };
  }
}

export function computeRecoveryWalletProofHash(input: RecoveryWalletProof): string {
  const proof = createRecoveryWalletProof(input);

  return bytesToHex(
    sha256Bytes(
      concatBytes(
        ...lengthPrefixedUtf8(RECOVERY_WALLET_PROOF_FORMAT),
        Uint8Array.of(RECOVERY_WALLET_PROOF_VERSION),
        ...lengthPrefixedUtf8(proof.name),
        hexToBytes(proof.prevStateTxid),
        hexToBytes(proof.recoveryDescriptorHash),
        hexToBytes(proof.newOwnerPubkey),
        Uint8Array.of(proof.successorBondVout),
        uint32ToBytes(proof.challengeWindowBlocks),
        proof.chainTipBlockHash === undefined
          ? Uint8Array.of(0)
          : concatBytes(Uint8Array.of(1), hexToBytes(proof.chainTipBlockHash)),
        proof.chainTipHeight === undefined
          ? Uint8Array.of(0)
          : concatBytes(Uint8Array.of(1), uint32ToBytes(proof.chainTipHeight)),
        ...lengthPrefixedUtf8(proof.recoveryAddress),
        ...lengthPrefixedUtf8(proof.signingProfile),
        ...lengthPrefixedUtf8(proof.message),
        ...lengthPrefixedUtf8(proof.signatureBase64)
      )
    )
  );
}

export function createRecoveryWalletProofCommitment(input: RecoveryWalletProof | string): string {
  const proofHash =
    typeof input === "string"
      ? assertHexBytes(input, 32, "proofHash")
      : computeRecoveryWalletProofHash(input);

  return `${proofHash}${RECOVERY_WALLET_PROOF_COMMITMENT_RESERVED_HEX}`;
}

export function extractRecoveryWalletProofHashFromCommitment(commitment: string): string {
  const normalized = assertHexBytes(commitment, 64, "proofCommitment");
  const proofHash = normalized.slice(0, 64);
  const reserved = normalized.slice(64);

  if (reserved !== RECOVERY_WALLET_PROOF_COMMITMENT_RESERVED_HEX) {
    throw new Error("proofCommitment reserved half must be zero");
  }

  return proofHash;
}

function normalizeRecoveryWalletProofFields(input: RecoveryWalletProofFields): RecoveryWalletProofFields {
  const chainTipBlockHash =
    input.chainTipBlockHash === undefined
      ? undefined
      : assertHexBytes(input.chainTipBlockHash, 32, "chainTipBlockHash");

  return {
    name: normalizeName(input.name),
    prevStateTxid: assertHexBytes(input.prevStateTxid, 32, "prevStateTxid"),
    recoveryDescriptorHash: assertHexBytes(input.recoveryDescriptorHash, 32, "recoveryDescriptorHash"),
    newOwnerPubkey: assertHexBytes(input.newOwnerPubkey, 32, "newOwnerPubkey"),
    successorBondVout: assertByte(input.successorBondVout, "successorBondVout"),
    challengeWindowBlocks: assertUint32(input.challengeWindowBlocks, "challengeWindowBlocks"),
    ...(chainTipBlockHash === undefined ? {} : { chainTipBlockHash }),
    ...(input.chainTipHeight === undefined
      ? {}
      : { chainTipHeight: assertUint32(input.chainTipHeight, "chainTipHeight") })
  };
}

function verifyProofFieldMatches(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
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

function normalizeRecoverySigningProfile(value: string): string {
  if (typeof value !== "string") {
    throw new Error("signingProfile must be a string");
  }

  const normalized = value.trim().toLowerCase();
  if (normalized !== RECOVERY_WALLET_PROOF_PROFILE) {
    throw new Error(`signingProfile must be ${RECOVERY_WALLET_PROOF_PROFILE}`);
  }

  return normalized;
}

function normalizeBase64(value: string, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty base64 string`);
  }

  return value.trim();
}

function lengthPrefixedUtf8(value: string): readonly [Uint8Array, Uint8Array] {
  const bytes = utf8ToBytes(value);
  return [uint16ToBytes(bytes.length), bytes];
}

function uint16ToBytes(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new Error("length must fit in 2 bytes");
  }

  return Uint8Array.of((value >> 8) & 0xff, value & 0xff);
}

function uint32ToBytes(value: number): Uint8Array {
  assertUint32(value, "value");

  return Uint8Array.of(
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff
  );
}

function assertByte(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new Error(`${label} must fit in one byte`);
  }

  return value;
}

function assertUint32(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new Error(`${label} must be an unsigned 32-bit integer`);
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

function assertInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer`);
  }

  return value as number;
}
