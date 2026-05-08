import { schnorr, secp256k1 } from "@noble/curves/secp256k1.js";

import { assertHexBytes, bytesToHex, hexToBytes } from "./bytes.js";
import { OntEventType } from "./constants.js";
import { concatBytes, sha256Bytes, utf8ToBytes } from "./crypto.js";
import { normalizeName } from "./names.js";

export const AUCTION_BID_FLAG_INCLUDES_NAME = 0x01;
export const RECOVER_OWNER_FLAG_CANCEL = 0x01;
export const RECOVERY_WALLET_PROOF_PROFILE = "bip322";

export interface TransferEventPayload {
  readonly prevStateTxid: string;
  readonly newOwnerPubkey: string;
  readonly flags: number;
  readonly successorBondVout: number;
  readonly signature: string;
}

export interface AuctionBidEventPayload {
  readonly flags: number;
  readonly bondVout: number;
  readonly settlementLockBlocks: number;
  readonly bidAmountSats: bigint;
  readonly ownerPubkey: string;
  readonly auctionLotCommitment: string;
  readonly auctionCommitment: string;
  readonly bidderCommitment: string;
  readonly name: string;
  readonly unlockBlock: number;
}

export interface RecoverOwnerEventPayload {
  readonly prevStateTxid: string;
  readonly newOwnerPubkey: string;
  readonly flags: number;
  readonly successorBondVout: number;
  readonly challengeWindowBlocks: number;
  readonly recoveryDescriptorHash: string;
  readonly signature: string;
}

export interface TransferAuthorizationFields {
  readonly prevStateTxid: string;
  readonly newOwnerPubkey: string;
  readonly flags: number;
  readonly successorBondVout: number;
}

export interface RecoverOwnerAuthorizationFields {
  readonly prevStateTxid: string;
  readonly newOwnerPubkey: string;
  readonly flags: number;
  readonly successorBondVout: number;
  readonly challengeWindowBlocks: number;
  readonly recoveryDescriptorHash: string;
}

export function createTransferPayload(input: {
  prevStateTxid: string;
  newOwnerPubkey: string;
  flags: number;
  successorBondVout: number;
  signature: string;
}): TransferEventPayload {
  if (!Number.isInteger(input.flags) || input.flags < 0 || input.flags > 0xff) {
    throw new Error("flags must fit in one byte");
  }

  if (
    !Number.isInteger(input.successorBondVout) ||
    input.successorBondVout < 0 ||
    input.successorBondVout > 0xff
  ) {
    throw new Error("successorBondVout must fit in one byte");
  }

  return {
    prevStateTxid: assertHexBytes(input.prevStateTxid, 32, "prevStateTxid"),
    newOwnerPubkey: assertHexBytes(input.newOwnerPubkey, 32, "newOwnerPubkey"),
    flags: input.flags,
    successorBondVout: input.successorBondVout,
    signature: assertHexBytes(input.signature, 64, "signature")
  };
}

export function createRecoverOwnerPayload(input: {
  readonly prevStateTxid: string;
  readonly newOwnerPubkey: string;
  readonly flags: number;
  readonly successorBondVout: number;
  readonly challengeWindowBlocks: number;
  readonly recoveryDescriptorHash: string;
  readonly signature: string;
}): RecoverOwnerEventPayload {
  assertByte(input.flags, "flags");
  assertByte(input.successorBondVout, "successorBondVout");
  assertChallengeWindowBlocks(input.challengeWindowBlocks);

  return {
    prevStateTxid: assertHexBytes(input.prevStateTxid, 32, "prevStateTxid"),
    newOwnerPubkey: assertHexBytes(input.newOwnerPubkey, 32, "newOwnerPubkey"),
    flags: input.flags,
    successorBondVout: input.successorBondVout,
    challengeWindowBlocks: input.challengeWindowBlocks,
    recoveryDescriptorHash: assertHexBytes(input.recoveryDescriptorHash, 32, "recoveryDescriptorHash"),
    signature: assertHexBytes(input.signature, 64, "signature")
  };
}

export function createAuctionBidPayload(input: {
  readonly flags?: number;
  readonly bondVout: number;
  readonly settlementLockBlocks: number;
  readonly bidAmountSats: bigint;
  readonly ownerPubkey: string;
  readonly auctionLotCommitment: string;
  readonly auctionCommitment: string;
  readonly bidderCommitment: string;
  readonly name: string;
  readonly unlockBlock: number;
}): AuctionBidEventPayload {
  const normalizedName = normalizeName(input.name);
  const flags = (input.flags ?? 0) | AUCTION_BID_FLAG_INCLUDES_NAME;

  if (!Number.isInteger(flags) || flags < 0 || flags > 0xff) {
    throw new Error("flags must fit in one byte");
  }

  if (!Number.isInteger(input.bondVout) || input.bondVout < 0 || input.bondVout > 0xff) {
    throw new Error("bondVout must fit in one byte");
  }

  if (!Number.isInteger(input.settlementLockBlocks) || input.settlementLockBlocks < 0 || input.settlementLockBlocks > 0xffff_ffff) {
    throw new Error("settlementLockBlocks must fit in an unsigned 32-bit integer");
  }

  if (input.bidAmountSats < 0n || input.bidAmountSats > 0xffff_ffff_ffff_ffffn) {
    throw new Error("bidAmountSats must fit in an unsigned 64-bit integer");
  }

  if (
    !Number.isInteger(input.unlockBlock) ||
    input.unlockBlock < 0 ||
    input.unlockBlock > 0xffff_ffff
  ) {
    throw new Error("unlockBlock must fit in an unsigned 32-bit integer");
  }

  return {
    flags,
    bondVout: input.bondVout,
    settlementLockBlocks: input.settlementLockBlocks,
    bidAmountSats: input.bidAmountSats,
    ownerPubkey: assertHexBytes(input.ownerPubkey, 32, "ownerPubkey"),
    auctionLotCommitment: assertHexBytes(input.auctionLotCommitment, 16, "auctionLotCommitment"),
    auctionCommitment: assertHexBytes(input.auctionCommitment, 32, "auctionCommitment"),
    bidderCommitment: assertHexBytes(input.bidderCommitment, 16, "bidderCommitment"),
    name: normalizedName,
    unlockBlock: input.unlockBlock
  };
}

export function createRecoveryWalletProofMessage(input: {
  readonly name: string;
  readonly prevStateTxid: string;
  readonly recoveryDescriptorHash: string;
  readonly newOwnerPubkey: string;
  readonly successorBondVout: number;
  readonly challengeWindowBlocks: number;
  readonly chainTipBlockHash?: string;
  readonly chainTipHeight?: number;
}): string {
  const chainTip =
    input.chainTipBlockHash === undefined || input.chainTipHeight === undefined
      ? "unspecified"
      : `${assertHexBytes(input.chainTipBlockHash, 32, "chainTipBlockHash")}@${assertNonNegativeSafeInteger(input.chainTipHeight, "chainTipHeight")}`;

  return [
    "Open Name Tags owner recovery proof",
    `profile: ${RECOVERY_WALLET_PROOF_PROFILE}`,
    `name: ${normalizeName(input.name)}`,
    `prevStateTxid: ${assertHexBytes(input.prevStateTxid, 32, "prevStateTxid")}`,
    `recoveryDescriptorHash: ${assertHexBytes(input.recoveryDescriptorHash, 32, "recoveryDescriptorHash")}`,
    `newOwnerPubkey: ${assertHexBytes(input.newOwnerPubkey, 32, "newOwnerPubkey")}`,
    `successorBondVout: ${assertByte(input.successorBondVout, "successorBondVout")}`,
    `challengeWindowBlocks: ${assertChallengeWindowBlocks(input.challengeWindowBlocks)}`,
    `chainTip: ${chainTip}`
  ].join("\n");
}

export function signTransferAuthorization(
  input: TransferAuthorizationFields & { readonly ownerPrivateKeyHex: string }
): string {
  const ownerPrivateKey = hexToBytes(assertHexBytes(input.ownerPrivateKeyHex, 32, "ownerPrivateKeyHex"));

  if (!secp256k1.utils.isValidSecretKey(ownerPrivateKey)) {
    throw new Error("ownerPrivateKeyHex must be a valid secp256k1 private key");
  }

  return bytesToHex(
    schnorr.sign(computeTransferAuthorizationDigest(input), ownerPrivateKey)
  );
}

export function signRecoverOwnerCancelAuthorization(
  input: RecoverOwnerAuthorizationFields & { readonly ownerPrivateKeyHex: string }
): string {
  const ownerPrivateKey = hexToBytes(assertHexBytes(input.ownerPrivateKeyHex, 32, "ownerPrivateKeyHex"));

  if (!secp256k1.utils.isValidSecretKey(ownerPrivateKey)) {
    throw new Error("ownerPrivateKeyHex must be a valid secp256k1 private key");
  }

  return bytesToHex(
    schnorr.sign(computeRecoverOwnerAuthorizationDigest(input), ownerPrivateKey)
  );
}

export function verifyTransferAuthorization(
  input: TransferAuthorizationFields & {
    readonly ownerPubkey: string;
    readonly signature: string;
  }
): boolean {
  const ownerPubkey = hexToBytes(assertHexBytes(input.ownerPubkey, 32, "ownerPubkey"));
  const signature = hexToBytes(assertHexBytes(input.signature, 64, "signature"));

  try {
    return schnorr.verify(signature, computeTransferAuthorizationDigest(input), ownerPubkey);
  } catch {
    return false;
  }
}

export function verifyRecoverOwnerCancelAuthorization(
  input: RecoverOwnerAuthorizationFields & {
    readonly ownerPubkey: string;
    readonly signature: string;
  }
): boolean {
  const ownerPubkey = hexToBytes(assertHexBytes(input.ownerPubkey, 32, "ownerPubkey"));
  const signature = hexToBytes(assertHexBytes(input.signature, 64, "signature"));

  try {
    return schnorr.verify(signature, computeRecoverOwnerAuthorizationDigest(input), ownerPubkey);
  } catch {
    return false;
  }
}

export function computeTransferAuthorizationHash(input: TransferAuthorizationFields): string {
  return bytesToHex(computeTransferAuthorizationDigest(input));
}

export function computeRecoverOwnerAuthorizationHash(input: RecoverOwnerAuthorizationFields): string {
  return bytesToHex(computeRecoverOwnerAuthorizationDigest(input));
}

export function getEventTypeName(
  type: OntEventType
):
  | "TRANSFER"
  | "AUCTION_BID"
  | "RECOVER_OWNER" {
  switch (type) {
    case OntEventType.Transfer:
      return "TRANSFER";
    case OntEventType.AuctionBid:
      return "AUCTION_BID";
    case OntEventType.RecoverOwner:
      return "RECOVER_OWNER";
  }
}

export function serializeUint8ArrayToHex(bytes: Uint8Array): string {
  return bytesToHex(bytes);
}

function computeTransferAuthorizationDigest(input: TransferAuthorizationFields): Uint8Array {
  assertByte(input.flags, "flags");
  assertByte(input.successorBondVout, "successorBondVout");

  return sha256Bytes(
    concatBytes(
      hexToBytes(assertHexBytes(input.prevStateTxid, 32, "prevStateTxid")),
      hexToBytes(assertHexBytes(input.newOwnerPubkey, 32, "newOwnerPubkey")),
      Uint8Array.of(input.flags, input.successorBondVout)
    )
  );
}

function computeRecoverOwnerAuthorizationDigest(input: RecoverOwnerAuthorizationFields): Uint8Array {
  assertByte(input.flags, "flags");
  assertByte(input.successorBondVout, "successorBondVout");
  assertChallengeWindowBlocks(input.challengeWindowBlocks);

  return sha256Bytes(
    concatBytes(
      ...lengthPrefixedUtf8("ont-recover-owner"),
      hexToBytes(assertHexBytes(input.prevStateTxid, 32, "prevStateTxid")),
      hexToBytes(assertHexBytes(input.newOwnerPubkey, 32, "newOwnerPubkey")),
      Uint8Array.of(input.flags, input.successorBondVout),
      uint32ToBytes(input.challengeWindowBlocks),
      hexToBytes(assertHexBytes(input.recoveryDescriptorHash, 32, "recoveryDescriptorHash"))
    )
  );
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

function assertByte(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new Error(`${label} must fit in one byte`);
  }

  return value;
}

function assertChallengeWindowBlocks(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 0xffff_ffff) {
    throw new Error("challengeWindowBlocks must be a positive unsigned 32-bit integer");
  }

  return value;
}

function assertNonNegativeSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }

  return value;
}
