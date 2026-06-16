import {
  validateHeaderChain,
  type BitcoinDifficultyCheckpoint,
  type BitcoinHeaderSource,
  type BitcoinNetworkParams,
  type HeaderChainRejectReason,
} from "@ont/bitcoin";

// B4-HEADER (B4_ADAPTERS_PLAN §8) — the canonical Bitcoin header source adapter. Fetches a header range
// from an UNTRUSTED provider and validates it through the audited @ont/bitcoin validateHeaderChain (#82)
// against TRUSTED launch config (checkpoint + params, caller-supplied). Returns a BitcoinHeaderSource the
// B3 inclusion verifier consumes, or nothing — it decides no consensus. The firewall lives here: a hostile
// provider (forged child / withheld / short or overlong range) yields no source, so B3 cannot falsely
// accept. Scope: ONE trusted active-chain provider; no multi-source / fork-selection / reorg-currentness.

/** The network I/O seam (real RPC/Esplora in production; fixture in tests). ASYNC — never sync I/O. */
export interface HeaderRangeProvider {
  /** Fetch exactly `count` consecutive header hexes from `startHeight`, or null if unavailable/withheld. */
  fetchHeaderHex(startHeight: number, count: number): Promise<readonly string[] | null>;
}

export type CanonicalHeaderRejectReason =
  | HeaderChainRejectReason
  | "header-provider-unavailable"
  | "header-range-count-mismatch";

export type CanonicalHeaderResult =
  | {
      readonly ok: true;
      readonly headerSource: BitcoinHeaderSource;
      readonly tipHeight: number;
      readonly tipHashHex: string;
      readonly cumulativeWorkHex: string;
    }
  | { readonly ok: false; readonly reason: CanonicalHeaderRejectReason };

/**
 * PURE (sync) core: the exact-count firewall + validation. `headersHex` must be exactly `expectedCount`
 * long (a withheld short tail / overlong response must NOT become a shorter accepted source) — else
 * `header-range-count-mismatch`, BEFORE validation. Then `validateHeaderChain` (#82) decides; its `spv-*`
 * reason is surfaced. Total + fail-closed; never throws.
 *
 * STUB (B4-HEADER, tests-first): returns a fixed reject so the `hdr.*` red battery fails for the right
 * reason until the adapter is implemented.
 */
export function buildCanonicalHeaderSourceFromHeaders(
  _headersHex: readonly string[],
  _startHeight: number,
  _expectedCount: number,
  _checkpoint: BitcoinDifficultyCheckpoint,
  _params: BitcoinNetworkParams,
): CanonicalHeaderResult {
  void validateHeaderChain;
  return { ok: false, reason: "header-provider-unavailable" };
}

export interface FetchCanonicalHeaderSourceInput {
  readonly provider: HeaderRangeProvider;
  readonly startHeight: number;
  readonly count: number;
  readonly checkpoint: BitcoinDifficultyCheckpoint;
  readonly params: BitcoinNetworkParams;
}

/**
 * ASYNC wrapper: the network I/O around the pure core. Awaits the provider (null / reject / throw all →
 * `header-provider-unavailable`), then runs the pure core. Total + fail-closed; never throws, never rejects.
 *
 * STUB (B4-HEADER, tests-first).
 */
export async function fetchCanonicalHeaderSource(
  _input: FetchCanonicalHeaderSourceInput,
): Promise<CanonicalHeaderResult> {
  return { ok: false, reason: "header-provider-unavailable" };
}
