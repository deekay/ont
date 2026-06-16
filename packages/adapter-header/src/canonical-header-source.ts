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
  | "header-range-count-mismatch"
  | "header-range-malformed";

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
 * The shared range-input guard for BOTH the pure core and the async wrapper (CL green-watch): an adapter
 * range is well-formed iff `startHeight` is an int ≥ 0 and `count` is an int ≥ 1. A `count=0`/empty range
 * must never become a vacuous accepted source, so it is rejected here before any fetch or validation.
 */
function isWellFormedRange(startHeight: number, count: number): boolean {
  return Number.isInteger(startHeight) && startHeight >= 0 && Number.isInteger(count) && count >= 1;
}

/**
 * PURE (sync) core: range-input firewall → exact-count firewall → validation. ORDER MATTERS:
 *   1. range inputs — `startHeight` int ≥ 0 and `expectedCount` int ≥ 1 (a `count=0`/empty range must
 *      NOT become a vacuous accepted source) — else `header-range-malformed`.
 *   2. exact-count — `headersHex.length === expectedCount` (a withheld short tail / overlong response
 *      must NOT become a shorter accepted source) — else `header-range-count-mismatch`, BEFORE validation.
 *   3. `validateHeaderChain` (#82) decides; its `spv-*` reason (incl. `spv-header-malformed` strict
 *      80-byte parse and `spv-pow-insufficient`) is surfaced verbatim.
 * Total + fail-closed; never throws.
 */
export function buildCanonicalHeaderSourceFromHeaders(
  headersHex: readonly string[],
  startHeight: number,
  expectedCount: number,
  checkpoint: BitcoinDifficultyCheckpoint,
  params: BitcoinNetworkParams,
): CanonicalHeaderResult {
  if (!isWellFormedRange(startHeight, expectedCount)) {
    return { ok: false, reason: "header-range-malformed" };
  }
  if (!Array.isArray(headersHex) || headersHex.length !== expectedCount) {
    return { ok: false, reason: "header-range-count-mismatch" };
  }
  const result = validateHeaderChain(headersHex, startHeight, checkpoint, params);
  if (!result.ok) return { ok: false, reason: result.reason };
  return {
    ok: true,
    headerSource: result.headerSource,
    tipHeight: result.tipHeight,
    tipHashHex: result.tipHashHex,
    cumulativeWorkHex: result.cumulativeWorkHex,
  };
}

export interface FetchCanonicalHeaderSourceInput {
  readonly provider: HeaderRangeProvider;
  readonly startHeight: number;
  readonly count: number;
  readonly checkpoint: BitcoinDifficultyCheckpoint;
  readonly params: BitcoinNetworkParams;
}

/**
 * ASYNC wrapper: the network I/O around the pure core. Validates the range inputs (`startHeight`/`count`)
 * FIRST — a malformed range → `header-range-malformed` WITHOUT consulting the provider (input validity
 * must not depend on provider behavior). Then awaits the provider (null / reject / throw all →
 * `header-provider-unavailable`), forwarding the EXACT `(startHeight, count)` requested, and runs the pure
 * core. Total + fail-closed; never throws, never rejects.
 */
export async function fetchCanonicalHeaderSource(
  input: FetchCanonicalHeaderSourceInput,
): Promise<CanonicalHeaderResult> {
  const { provider, startHeight, count, checkpoint, params } = input;
  // Range validity must not depend on provider behavior — guard BEFORE any fetch (same shared guard as
  // the pure core, literal startHeight + count, so count=0/non-int count rejects without a network call).
  if (!isWellFormedRange(startHeight, count)) {
    return { ok: false, reason: "header-range-malformed" };
  }
  let headersHex: readonly string[] | null;
  try {
    headersHex = await provider.fetchHeaderHex(startHeight, count);
  } catch {
    return { ok: false, reason: "header-provider-unavailable" };
  }
  if (headersHex === null || headersHex === undefined) {
    return { ok: false, reason: "header-provider-unavailable" };
  }
  return buildCanonicalHeaderSourceFromHeaders(headersHex, startHeight, count, checkpoint, params);
}
