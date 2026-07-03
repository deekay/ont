import { createRecoveryWalletProofMessage, verifyRecoveryWalletProof } from "@ont/protocol";
import type {
  RecoveryWalletProof,
  RecoveryWalletProofFields,
  RecoveryWalletProofVerificationResult,
  SignedRecoveryDescriptor,
} from "@ont/protocol";
import { verifyProofBundleAgainstBitcoin, verifyProofBundleStructure } from "@ont/consensus";
import type { BitcoinHeaderSource, ProofBundleVerificationReport } from "@ont/consensus";

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

// ---- verify-proof-bundle-against-bitcoin: require canonical-header source; reject unverified ----
// @ont/consensus accepts an optional headerSource for Merkle/PoW-only reports; this CLI core does not.
// A missing source is a distinct fail-closed result and must never surface ok:true.
export interface VerifyProofBundleAgainstBitcoinInput {
  readonly bundle: unknown;
  readonly headerSource?: BitcoinHeaderSource | null;
}
export type VerifyProofBundleAgainstBitcoinResult =
  | { readonly ok: true; readonly report: ProofBundleVerificationReport }
  | { readonly ok: false; readonly reason: "missing-header-source" }
  | { readonly ok: false; readonly reason: "unverified"; readonly report: ProofBundleVerificationReport }
  | { readonly ok: false; readonly reason: "malformed" };

function isBitcoinHeaderSource(value: unknown): value is BitcoinHeaderSource {
  return value !== null && typeof value === "object" && typeof (value as { readonly headerHexAtHeight?: unknown }).headerHexAtHeight === "function";
}

/** Pure render of the BIP322 message; bad fields (createRecoveryWalletProofMessage asserts) → malformed. Never throws. */
export function renderRecoveryWalletProofMessage(fields: RecoveryWalletProofMessageFields): RenderMessageResult {
  try {
    return { ok: true, message: createRecoveryWalletProofMessage(fields) };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}

/** Surfaces the audited verifyRecoveryWalletProof result VERBATIM; malformed input / throw → malformed. Never throws. */
export function runVerifyRecoveryWalletProof(input: VerifyRecoveryWalletProofInput): VerifyWalletProofResult {
  try {
    if (input === null || typeof input !== "object") return { ok: false, reason: "malformed" };
    return { ok: true, result: verifyRecoveryWalletProof(input) };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}

/** Surfaces the audited STRUCTURAL report VERBATIM (not Bitcoin finality); only a throw from the audited verifier → malformed. */
export function runInspectProofBundle(bundle: unknown): InspectProofBundleResult {
  try {
    return { ok: true, report: verifyProofBundleStructure(bundle) };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}

/** Requires a canonical header source and rejects every bundle the audited Bitcoin verifier does not accept. */
export function runVerifyProofBundleAgainstBitcoin(input: VerifyProofBundleAgainstBitcoinInput): VerifyProofBundleAgainstBitcoinResult {
  try {
    if (input === null || typeof input !== "object") return { ok: false, reason: "malformed" };
    if (!isBitcoinHeaderSource(input.headerSource)) return { ok: false, reason: "missing-header-source" };
    const report = verifyProofBundleAgainstBitcoin(input.bundle, { headerSource: input.headerSource });
    return report.valid ? { ok: true, report } : { ok: false, reason: "unverified", report };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}
