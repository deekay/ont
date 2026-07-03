import { verifyProofBundleAgainstBitcoin, verifyProofBundleStructure } from "@ont/consensus";
import type { BitcoinHeaderSource, ProofBundleVerificationReport } from "@ont/consensus";

export type { BitcoinHeaderSource, ProofBundleVerificationReport };

// Shared proof-bundle light-client core. PURE thin orchestrators over the audited @ont/consensus verifier:
// no file I/O, no network I/O, no signing, no reimplemented ownership law. Total; never throw.

// ---- inspect-proof-bundle: surface the audited STRUCTURAL report verbatim (NOT Bitcoin-inclusion finality) ----
export type InspectProofBundleResult =
  | { readonly ok: true; readonly report: ProofBundleVerificationReport }
  | { readonly ok: false; readonly reason: "malformed" };

// ---- verify-proof-bundle-against-bitcoin: require canonical-header source; reject unverified ----
// @ont/consensus accepts an optional headerSource for Merkle/PoW-only reports; this light-client core does not.
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

export type ProofBundleHeaderDepthCoverageResult =
  | { readonly ok: true; readonly anchorHeight: number; readonly requiredHeight: number }
  | { readonly ok: false; readonly reason: "missing-header-source" }
  | { readonly ok: false; readonly reason: "missing-anchor-height" }
  | { readonly ok: false; readonly reason: "short-header-range"; readonly anchorHeight: number; readonly requiredHeight: number }
  | { readonly ok: false; readonly reason: "malformed" };

export interface ProofBundleHeaderDepthCoverageInput {
  readonly bundle: unknown;
  readonly headerSource?: BitcoinHeaderSource | null;
  readonly confirmationDepth: number;
}

export function isBitcoinHeaderSource(value: unknown): value is BitcoinHeaderSource {
  return value !== null && typeof value === "object" && typeof (value as { readonly headerHexAtHeight?: unknown }).headerHexAtHeight === "function";
}

/** Surfaces the audited STRUCTURAL report VERBATIM (not Bitcoin finality); only a throw from the audited verifier -> malformed. */
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

/**
 * Freshness/depth gate for client UI state. This is deliberately separate from
 * runVerifyProofBundleAgainstBitcoin: the shared verifier means "bundle verifies
 * against the supplied canonical header source"; clients add the independent
 * launch-depth coverage check before presenting a Bitcoin-verified state.
 */
export function checkProofBundleHeaderDepthCoverage(
  input: ProofBundleHeaderDepthCoverageInput,
): ProofBundleHeaderDepthCoverageResult {
  try {
    if (input === null || typeof input !== "object") return { ok: false, reason: "malformed" };
    if (!isBitcoinHeaderSource(input.headerSource)) return { ok: false, reason: "missing-header-source" };
    if (!Number.isInteger(input.confirmationDepth) || input.confirmationDepth < 0) {
      return { ok: false, reason: "malformed" };
    }

    const anchorHeights = proofBundleAnchorHeights(input.bundle);
    if (anchorHeights.length === 0) return { ok: false, reason: "missing-anchor-height" };

    const anchorHeight = Math.max(...anchorHeights);
    const requiredHeight = anchorHeight + input.confirmationDepth;
    const header = input.headerSource.headerHexAtHeight(requiredHeight);
    if (typeof header !== "string" || header.length === 0) {
      return { ok: false, reason: "short-header-range", anchorHeight, requiredHeight };
    }
    return { ok: true, anchorHeight, requiredHeight };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}

function proofBundleAnchorHeights(bundle: unknown): number[] {
  if (!isRecord(bundle)) return [];
  const inclusion = bundle.bitcoinInclusion;
  if (!isRecord(inclusion) || !Array.isArray(inclusion.anchors)) return [];
  const heights: number[] = [];
  for (const anchor of inclusion.anchors) {
    if (!isRecord(anchor)) continue;
    const height = anchor.height;
    if (typeof height === "number" && Number.isInteger(height) && height >= 0) heights.push(height);
  }
  return heights;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
