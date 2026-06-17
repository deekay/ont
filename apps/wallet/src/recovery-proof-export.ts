// B5-WALLET — recovery-wallet-proof export (KEEP-later module; CL design-concur event ef02ab2d). KEY-FREE: the
// recovery-wallet-proof is BIP322-signed by the RECOVERY wallet (recoveryAddress), NOT the §5 owner key — so
// these are standalone wallet exports, not WalletSigner methods. The wallet builds the message for the recovery
// wallet (external/cold) to sign, and assembles the proof from the returned signature; it consumes @ont/protocol
// and re-derives no proof / descriptor-hash rules. No private key enters or leaves. Total + fail-closed.
import {
  computeRecoveryDescriptorHash,
  createRecoveryWalletProof,
  createRecoveryWalletProofMessage,
  type SignedRecoveryDescriptor,
  type RecoveryWalletProof,
} from "@ont/protocol";

export interface RecoveryProofExportInput {
  readonly descriptor: SignedRecoveryDescriptor;
  readonly prevStateTxid: string;
  readonly newOwnerPubkey: string;
  readonly successorBondVout: number;
  readonly chainTipBlockHash?: string;
  readonly chainTipHeight?: number;
}

export type RecoveryProofMessageResult =
  | { readonly ok: true; readonly message: string }
  | { readonly ok: false; readonly reason: "not-implemented" | "invalid-input" };

export type AssembleRecoveryProofResult =
  | { readonly ok: true; readonly proof: RecoveryWalletProof }
  | { readonly ok: false; readonly reason: "not-implemented" | "invalid-input" };

/** The message fields, derived from the descriptor + the transfer context. chainTip is both-or-neither (matches
 *  createRecoveryWalletProofMessage's "unspecified" rule). recoveryDescriptorHash / name / challengeWindowBlocks
 *  come from the descriptor — re-derived via @ont/protocol, never reimplemented. */
function messageFields(input: RecoveryProofExportInput) {
  const chainTip =
    input.chainTipBlockHash !== undefined && input.chainTipHeight !== undefined
      ? { chainTipBlockHash: input.chainTipBlockHash, chainTipHeight: input.chainTipHeight }
      : {};
  return {
    name: input.descriptor.name,
    prevStateTxid: input.prevStateTxid,
    recoveryDescriptorHash: computeRecoveryDescriptorHash(input.descriptor),
    newOwnerPubkey: input.newOwnerPubkey,
    successorBondVout: input.successorBondVout,
    challengeWindowBlocks: input.descriptor.challengeWindowBlocks,
    ...chainTip,
  };
}

/**
 * RED stub. Green: createRecoveryWalletProofMessage(messageFields(input)) — the string the recovery wallet
 * BIP322-signs. Total; never throws (malformed → invalid-input).
 */
export function recoveryWalletProofMessage(input: RecoveryProofExportInput): RecoveryProofMessageResult {
  void input;
  void messageFields;
  return { ok: false, reason: "not-implemented" };
}

/**
 * RED stub. Green: createRecoveryWalletProof({...messageFields(input), recoveryAddress: descriptor.recoveryAddress,
 * signingProfile: descriptor.signingProfile, signatureBase64}) — assembles the proof from the recovery wallet's
 * BIP322 signature. Total; never throws (malformed → invalid-input). The returned proof carries no private key.
 */
export function assembleRecoveryWalletProof(
  input: RecoveryProofExportInput & { readonly signatureBase64: string }
): AssembleRecoveryProofResult {
  void input;
  void createRecoveryWalletProof;
  return { ok: false, reason: "not-implemented" };
}
