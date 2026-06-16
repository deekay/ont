import type {
  RecoveryWalletProof,
  RecoveryWalletProofFields,
  RecoveryWalletProofVerificationResult,
  SignedRecoveryDescriptor,
} from "@ont/protocol";
import type { ProofBundleVerificationReport } from "@ont/consensus";

// B5-CLI verify cores (B5_CLI_CLASSIFICATION.md KEEP/verify). PURE thin orchestrators: they consume the
// AUDITED @ont/* verify/render APIs over PROVIDED artifacts and surface the result verbatim — no signing, no
// key material, no file I/O, no reimplemented rules (parsing/file reads, when later wired, are an edge wrapper
// feeding already-parsed inputs into these cores). Total; never throw.

// ---- print-recovery-wallet-proof-message: pure render of the BIP322 message a user must sign (no key) ----
export interface RecoveryWalletProofMessageFields {
  readonly name: string;
  readonly prevStateTxid: string;
  readonly recoveryDescriptorHash: string;
  readonly newOwnerPubkey: string;
  readonly successorBondVout: number;
  readonly challengeWindowBlocks: number;
  readonly chainTipBlockHash?: string;
  readonly chainTipHeight?: number;
}
export type RenderMessageResult = { readonly ok: true; readonly message: string } | { readonly ok: false; readonly reason: "malformed" };

// ---- verify-recovery-wallet-proof: surface the audited verifyRecoveryWalletProof result verbatim ----
export interface VerifyRecoveryWalletProofInput {
  readonly descriptor: SignedRecoveryDescriptor;
  readonly proof: RecoveryWalletProof;
  readonly expected?: Partial<RecoveryWalletProofFields>;
}
export type VerifyWalletProofResult =
  | { readonly ok: true; readonly result: RecoveryWalletProofVerificationResult }
  | { readonly ok: false; readonly reason: "malformed" };

// ---- inspect-proof-bundle: surface the audited STRUCTURAL report verbatim (NOT Bitcoin-inclusion finality) ----
export type InspectProofBundleResult =
  | { readonly ok: true; readonly report: ProofBundleVerificationReport }
  | { readonly ok: false; readonly reason: "malformed" };

/** RED stub. Green: { ok:true, message: createRecoveryWalletProofMessage(fields) }; throws (bad fields) → malformed. */
export function renderRecoveryWalletProofMessage(fields: RecoveryWalletProofMessageFields): RenderMessageResult {
  void fields;
  return { ok: false, reason: "malformed" };
}

/** RED stub. Green: { ok:true, result: verifyRecoveryWalletProof(input) } (verbatim); malformed input/throw → malformed. */
export function runVerifyRecoveryWalletProof(input: VerifyRecoveryWalletProofInput): VerifyWalletProofResult {
  void input;
  return { ok: false, reason: "malformed" };
}

/** RED stub. Green: { ok:true, report: verifyProofBundleStructure(bundle) } (verbatim; structural inspection only). */
export function runInspectProofBundle(bundle: unknown): InspectProofBundleResult {
  void bundle;
  return { ok: false, reason: "malformed" };
}
