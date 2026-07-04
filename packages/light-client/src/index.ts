import {
  buildCanonicalHeaderSourceFromHeaders,
  fetchCanonicalHeaderSource,
  type CanonicalHeaderResult,
  type HeaderRangeProvider,
} from "@ont/adapter-header";
import { verifyProofBundleAgainstBitcoin, verifyProofBundleStructure } from "@ont/consensus";
import type { BitcoinHeaderSource, ProofBundleVerificationReport } from "@ont/consensus";
import {
  LAUNCH_CONFIRMATION_DEPTH,
  type LaunchBitcoinDifficultyCheckpoint,
  SIGNET_BITCOIN_DIFFICULTY_CHECKPOINT,
  SIGNET_BITCOIN_NETWORK_PARAMS,
} from "@ont/launch-config";

export type { BitcoinHeaderSource, ProofBundleVerificationReport };
export type { CanonicalHeaderRejectReason, CanonicalHeaderResult, HeaderRangeProvider } from "@ont/adapter-header";

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

export const SIGNET_LAUNCH_HEADER_SOURCE_ID = "signet:launch-checkpoint";

export type SignetLaunchHeaderRangeResult =
  | {
      readonly ok: true;
      readonly checkpointHeight: number;
      readonly startHeight: number;
      readonly count: number;
      readonly anchorHeight: number;
      readonly requiredHeight: number;
      readonly confirmationDepth: number;
    }
  | { readonly ok: false; readonly reason: "header-range-malformed" };

export interface SignetLaunchHeaderRangeInput {
  readonly anchorHeight: number;
  readonly confirmationDepth?: number | undefined;
  readonly checkpoint?: LaunchBitcoinDifficultyCheckpoint | undefined;
}

export interface BuildSignetLaunchHeaderSourceInput extends SignetLaunchHeaderRangeInput {
  readonly headersHex: readonly string[];
}

export interface FetchSignetLaunchHeaderSourceInput extends SignetLaunchHeaderRangeInput {
  readonly provider: HeaderRangeProvider;
}

export interface ResolverHeaderRangeProviderOptions {
  readonly resolverUrl: string;
  readonly fetchImpl?: typeof fetch | undefined;
}

export interface EsploraHeaderRangeProviderOptions {
  readonly esploraBaseUrl: string;
  readonly fetchImpl?: typeof fetch | undefined;
}

export function isBitcoinHeaderSource(value: unknown): value is BitcoinHeaderSource {
  return value !== null && typeof value === "object" && typeof (value as { readonly headerHexAtHeight?: unknown }).headerHexAtHeight === "function";
}

export function signetLaunchHeaderRange(input: SignetLaunchHeaderRangeInput): SignetLaunchHeaderRangeResult {
  try {
    if (!isRecord(input)) return { ok: false, reason: "header-range-malformed" };
    const anchorHeight = input.anchorHeight;
    const confirmationDepth = input.confirmationDepth ?? LAUNCH_CONFIRMATION_DEPTH;
    const checkpoint = input.checkpoint ?? SIGNET_BITCOIN_DIFFICULTY_CHECKPOINT;
    if (!isDifficultyCheckpoint(checkpoint)) return { ok: false, reason: "header-range-malformed" };
    if (!Number.isInteger(anchorHeight) || anchorHeight <= checkpoint.height) {
      return { ok: false, reason: "header-range-malformed" };
    }
    if (!Number.isInteger(confirmationDepth) || confirmationDepth < 0) {
      return { ok: false, reason: "header-range-malformed" };
    }
    const requiredHeight = anchorHeight + confirmationDepth;
    if (!Number.isSafeInteger(requiredHeight)) return { ok: false, reason: "header-range-malformed" };
    const startHeight = checkpoint.height + 1;
    const count = requiredHeight - checkpoint.height;
    if (!Number.isInteger(count) || count < 1) return { ok: false, reason: "header-range-malformed" };
    return {
      ok: true,
      checkpointHeight: checkpoint.height,
      startHeight,
      count,
      anchorHeight,
      requiredHeight,
      confirmationDepth,
    };
  } catch {
    return { ok: false, reason: "header-range-malformed" };
  }
}

export function proofBundleMaxAnchorHeight(bundle: unknown): number | null {
  const anchorHeights = proofBundleAnchorHeights(bundle);
  return anchorHeights.length === 0 ? null : Math.max(...anchorHeights);
}

export function buildSignetLaunchHeaderSourceFromHeaders(input: BuildSignetLaunchHeaderSourceInput): CanonicalHeaderResult {
  const range = signetLaunchHeaderRange(input);
  if (!range.ok) return range;
  const checkpoint = input.checkpoint ?? SIGNET_BITCOIN_DIFFICULTY_CHECKPOINT;
  return buildCanonicalHeaderSourceFromHeaders(
    input.headersHex,
    range.startHeight,
    range.count,
    checkpoint,
    SIGNET_BITCOIN_NETWORK_PARAMS,
  );
}

export async function fetchSignetLaunchHeaderSource(input: FetchSignetLaunchHeaderSourceInput): Promise<CanonicalHeaderResult> {
  const range = signetLaunchHeaderRange(input);
  if (!range.ok) return range;
  return await fetchCanonicalHeaderSource({
    provider: input.provider,
    startHeight: range.startHeight,
    count: range.count,
    checkpoint: input.checkpoint ?? SIGNET_BITCOIN_DIFFICULTY_CHECKPOINT,
    params: SIGNET_BITCOIN_NETWORK_PARAMS,
  });
}

export function createResolverHeaderRangeProvider(input: ResolverHeaderRangeProviderOptions): HeaderRangeProvider {
  const baseUrl = input.resolverUrl.replace(/\/+$/, "");
  const fetchImpl = input.fetchImpl ?? fetch;
  return {
    async fetchHeaderHex(startHeight: number, count: number): Promise<readonly string[] | null> {
      try {
        const res = await fetchImpl(`${baseUrl}/bitcoin/header-range?startHeight=${startHeight}&count=${count}`);
        if (res.status !== 200) return null;
        const body: unknown = await res.json();
        if (!isRecord(body)) return null;
        if (body.startHeight !== startHeight) return null;
        if (!Array.isArray(body.headersHex) || body.headersHex.length !== count) return null;
        if (!body.headersHex.every((header): header is string => typeof header === "string")) return null;
        return body.headersHex;
      } catch {
        return null;
      }
    },
  };
}

export function createEsploraHeaderRangeProvider(input: EsploraHeaderRangeProviderOptions): HeaderRangeProvider {
  const fetchImpl = input.fetchImpl ?? fetch;
  return {
    async fetchHeaderHex(startHeight: number, count: number): Promise<readonly string[] | null> {
      try {
        if (!isWellFormedHeaderRange(startHeight, count)) return null;
        const headers: string[] = [];
        for (let offset = 0; offset < count; offset += 1) {
          const height = startHeight + offset;
          if (!Number.isSafeInteger(height)) return null;
          const hash = await fetchEsploraText(fetchImpl, input.esploraBaseUrl, `block-height/${height}`);
          if (!isHexLower(hash, 64)) return null;
          const headerHex = await fetchEsploraText(fetchImpl, input.esploraBaseUrl, `block/${hash}/header`);
          if (!isHexLower(headerHex, 160)) return null;
          headers.push(headerHex);
        }
        return headers.length === count ? headers : null;
      } catch {
        return null;
      }
    },
  };
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

    const anchorHeight = proofBundleMaxAnchorHeight(input.bundle);
    if (anchorHeight === null) return { ok: false, reason: "missing-anchor-height" };
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

function isDifficultyCheckpoint(value: unknown): value is LaunchBitcoinDifficultyCheckpoint {
  if (!isRecord(value)) return false;
  const { height, hashHex, bits, time, epochStartTime, cumulativeWorkHex } = value;
  return (
    typeof height === "number" &&
    Number.isSafeInteger(height) &&
    height >= 0 &&
    typeof hashHex === "string" &&
    /^[0-9a-f]{64}$/.test(hashHex) &&
    typeof bits === "number" &&
    Number.isSafeInteger(bits) &&
    bits >= 0 &&
    typeof time === "number" &&
    Number.isSafeInteger(time) &&
    time >= 0 &&
    typeof epochStartTime === "number" &&
    Number.isSafeInteger(epochStartTime) &&
    epochStartTime >= 0 &&
    typeof cumulativeWorkHex === "string" &&
    /^[0-9a-f]+$/.test(cumulativeWorkHex)
  );
}

function isWellFormedHeaderRange(startHeight: number, count: number): boolean {
  return Number.isInteger(startHeight) && startHeight >= 0 && Number.isInteger(count) && count >= 1;
}

async function fetchEsploraText(fetchImpl: typeof fetch, baseUrl: string, path: string): Promise<string | null> {
  const base = baseUrl.replace(/\/+$/, "") + "/";
  const res = await fetchImpl(new URL(path, base).toString());
  if (res.status !== 200) return null;
  return (await res.text()).trim();
}

function isHexLower(value: unknown, length: number): value is string {
  return typeof value === "string" && value.length === length && /^[0-9a-f]+$/.test(value);
}
