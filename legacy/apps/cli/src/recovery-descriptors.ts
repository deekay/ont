import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  computeRecoveryDescriptorHash,
  createRecoveryWalletProof,
  createRecoveryWalletProofCommitment,
  createRecoveryWalletProofMessage,
  DEFAULT_RECOVERY_CHALLENGE_WINDOW_BLOCKS,
  DEFAULT_RECOVERY_SIGNING_PROFILE,
  parseRecoveryWalletProof,
  parseSignedRecoveryDescriptor,
  type RecoveryWalletProof,
  type RecoveryWalletProofVerificationResult,
  signRecoveryDescriptor,
  type SignedRecoveryDescriptor,
  verifyRecoveryWalletProof
} from "@ont/protocol";

import { resolveResolverUrl } from "./resolver-actions.js";

export function createSignedRecoveryDescriptor(options: {
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
  return signRecoveryDescriptor({
    name: options.name,
    ownerPrivateKeyHex: options.ownerPrivateKeyHex,
    ownershipRef: options.ownershipRef,
    sequence: options.sequence,
    previousDescriptorHash: options.previousDescriptorHash,
    recoveryAddress: options.recoveryAddress,
    signingProfile: options.signingProfile ?? DEFAULT_RECOVERY_SIGNING_PROFILE,
    challengeWindowBlocks: options.challengeWindowBlocks ?? DEFAULT_RECOVERY_CHALLENGE_WINDOW_BLOCKS,
    ...(options.issuedAt === undefined ? {} : { issuedAt: options.issuedAt })
  });
}

export async function loadSignedRecoveryDescriptor(filePath: string): Promise<SignedRecoveryDescriptor> {
  const resolvedPath = resolve(process.cwd(), filePath);
  const raw = await readFile(resolvedPath, "utf8");
  return parseSignedRecoveryDescriptor(JSON.parse(raw));
}

export function createRecoveryWalletProofMessageForDescriptor(options: {
  readonly descriptor: SignedRecoveryDescriptor;
  readonly prevStateTxid: string;
  readonly newOwnerPubkey: string;
  readonly successorBondVout: number;
  readonly chainTipBlockHash?: string;
  readonly chainTipHeight?: number;
}): string {
  return createRecoveryWalletProofMessage({
    name: options.descriptor.name,
    prevStateTxid: options.prevStateTxid,
    recoveryDescriptorHash: computeRecoveryDescriptorHash(options.descriptor),
    newOwnerPubkey: options.newOwnerPubkey,
    successorBondVout: options.successorBondVout,
    challengeWindowBlocks: options.descriptor.challengeWindowBlocks,
    ...(options.chainTipBlockHash === undefined ? {} : { chainTipBlockHash: options.chainTipBlockHash }),
    ...(options.chainTipHeight === undefined ? {} : { chainTipHeight: options.chainTipHeight })
  });
}

export function createRecoveryWalletProofEnvelope(options: {
  readonly descriptor: SignedRecoveryDescriptor;
  readonly prevStateTxid: string;
  readonly newOwnerPubkey: string;
  readonly successorBondVout: number;
  readonly signatureBase64: string;
  readonly chainTipBlockHash?: string;
  readonly chainTipHeight?: number;
}): RecoveryWalletProof & {
  readonly proofHash: string;
  readonly proofCommitment: string;
} {
  const proof = createRecoveryWalletProof({
    name: options.descriptor.name,
    prevStateTxid: options.prevStateTxid,
    recoveryDescriptorHash: computeRecoveryDescriptorHash(options.descriptor),
    newOwnerPubkey: options.newOwnerPubkey,
    successorBondVout: options.successorBondVout,
    challengeWindowBlocks: options.descriptor.challengeWindowBlocks,
    recoveryAddress: options.descriptor.recoveryAddress,
    signingProfile: options.descriptor.signingProfile,
    signatureBase64: options.signatureBase64,
    ...(options.chainTipBlockHash === undefined ? {} : { chainTipBlockHash: options.chainTipBlockHash }),
    ...(options.chainTipHeight === undefined ? {} : { chainTipHeight: options.chainTipHeight })
  });
  const proofCommitment = createRecoveryWalletProofCommitment(proof);

  return {
    ...proof,
    proofHash: proofCommitment.slice(0, 64),
    proofCommitment
  };
}

export async function loadRecoveryWalletProof(filePath: string): Promise<RecoveryWalletProof> {
  const resolvedPath = resolve(process.cwd(), filePath);
  const raw = await readFile(resolvedPath, "utf8");
  return parseRecoveryWalletProof(JSON.parse(raw));
}

export function verifyRecoveryWalletProofEnvelope(options: {
  readonly descriptor: SignedRecoveryDescriptor;
  readonly proof: RecoveryWalletProof;
  readonly prevStateTxid?: string;
  readonly newOwnerPubkey?: string;
  readonly successorBondVout?: number;
}): RecoveryWalletProofVerificationResult {
  return verifyRecoveryWalletProof({
    descriptor: options.descriptor,
    proof: options.proof,
    expected: {
      ...(options.prevStateTxid === undefined ? {} : { prevStateTxid: options.prevStateTxid }),
      ...(options.newOwnerPubkey === undefined ? {} : { newOwnerPubkey: options.newOwnerPubkey }),
      ...(options.successorBondVout === undefined ? {} : { successorBondVout: options.successorBondVout })
    }
  });
}

export async function publishRecoveryDescriptor(options: {
  readonly resolverUrl?: string;
  readonly recoveryDescriptor: SignedRecoveryDescriptor;
}): Promise<unknown> {
  const resolverUrl = resolveResolverUrl(options.resolverUrl);
  const response = await fetch(`${resolverUrl.replace(/\/$/, "")}/recovery-descriptors`, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8"
    },
    body: JSON.stringify(options.recoveryDescriptor)
  });
  const raw = await response.text();
  const parsed = raw.length === 0 ? null : JSON.parse(raw);

  if (!response.ok) {
    const message =
      parsed !== null &&
      typeof parsed === "object" &&
      parsed !== null &&
      "message" in parsed &&
      typeof parsed.message === "string"
        ? parsed.message
        : `resolver returned HTTP ${response.status}`;
    throw new Error(message);
  }

  return parsed;
}

export async function publishRecoveryWalletProof(options: {
  readonly resolverUrl?: string;
  readonly recoveryWalletProof: RecoveryWalletProof;
}): Promise<unknown> {
  const resolverUrl = resolveResolverUrl(options.resolverUrl);
  const response = await fetch(`${resolverUrl.replace(/\/$/, "")}/recovery-proofs`, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8"
    },
    body: JSON.stringify(options.recoveryWalletProof)
  });
  const raw = await response.text();
  const parsed = raw.length === 0 ? null : JSON.parse(raw);

  if (!response.ok) {
    const message =
      parsed !== null &&
      typeof parsed === "object" &&
      parsed !== null &&
      "message" in parsed &&
      typeof parsed.message === "string"
        ? parsed.message
        : `resolver returned HTTP ${response.status}`;
    throw new Error(message);
  }

  return parsed;
}
