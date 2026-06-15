// B2 reopen / re-auction resolution predicate (T22 / B19 / S7 / S9 / #5 / #18 / #56). A PURE, total,
// closed-shape verdict: it recognizes whether a reopen lot is a valid auction generation for a name,
// keyed off the latest KERNEL-DERIVED bond-break release height.
//
// AUTHORITY (the ratified aspects this predicate lands):
//   - B19 / #56 / #42: the latest bond-break release height is a KERNEL-DERIVED chain fact, derived
//     here FROM the witnessed bond-break facts (`bondContinuity.breaks`) — it is never an
//     adapter-asserted number. A lying adapter cannot mint a reopen generation: a reopen with no
//     witnessed break, or anchored to a height that is not the derived latest, is refused.
//   - T22-01: the verdict is a PURE function of (reopenLot, witnessed breaks). There is no actor /
//     indexer "recognizer" channel — recognition is derivation + equality, nothing else.
//   - T22-02: an INCOMPLETE bond-continuity / release witness fails closed (reject) BEFORE any
//     matching — the release-block witness gets the same completeness treatment as the bid set (T2).
//   - S7 / S9 / B19: a released name reopens only as a fresh generation anchored to the latest
//     release height (lot identity reopen-{name}-after-{release_height}); the first generation is
//     opening-{name} with anchor 0. A reopen anchored to any other block opens no auction and enters
//     no transcript.
//
// PARKED (S8 / `release height` def, B2_KERNEL_HARDENING.md): the "deterministic latest-rule" needs a
// TX-LEVEL TIEBREAK for multiple same-height breaking observations, and that tiebreak is a
// genuinely-unstated/candidate clause — NOT ruled. So this predicate derives the latest only when it
// is UNIQUE; two or more breaks sharing the max height fail closed
// (`reopen-same-height-break-tiebreak-unspecified`) rather than inventing the tiebreak. `breaks`
// carries `{releaseHeight}` only; a `txOrder` field lands when the tiebreak is ruled by a spec PR.
//
// DELIBERATELY EXCLUDED (B3 / engine / launch-freeze): the auctionId string grammar
// (opening-{name} / reopen-{name}-after-{r}) and its §6 lot-commitment preimage (a B3-verified lot
// binding, consumed elsewhere as a parsed fact — like auction-resolution's lotBinding); bond-break
// DETECTION itself (S7/B18 "bond spent pre-maturity without a valid successor → break" lives in the
// engine/settlement; this predicate consumes the RESOLVED break facts); nullification-reopen (B24)
// and its cooldown / re-claim mechanics (separate, candidate); reorg of release facts (Z*). The
// engine composes a recognized reopen into auction-resolution (#68) — out of this predicate.
//
// Total / fail-closed + closed-shape (the #63-#69 discipline): malformed or extra-field inputs return
// a non-recognition verdict and never throw — no adapter/source/producer field is admitted as
// authority.

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const isClosedShape = (obj: object, allowed: readonly string[]): boolean =>
  Object.keys(obj).every((key) => allowed.includes(key));
const isSafeNonNegInt = (x: unknown): x is number =>
  typeof x === "number" && Number.isSafeInteger(x) && x >= 0;
const isPositiveSafeInt = (x: unknown): x is number =>
  typeof x === "number" && Number.isSafeInteger(x) && x >= 1;

export type ReopenLotKind = "opening" | "reopen";

export interface ReopenLot {
  /** The generation kind the bid's lot claims: the first auction ("opening") or a reopen. */
  readonly kind: ReopenLotKind;
  /**
   * The release height the lot binds (the `{release_height}` of reopen-{name}-after-{r}; parsed from
   * the B3-verified lot commitment). For an "opening" lot this MUST be 0; a "reopen" lot MUST carry a
   * positive height equal to the latest kernel-derived release.
   */
  readonly releaseAnchor: number;
}

export interface BondBreakFact {
  /**
   * The mined height of the canonical-chain transaction whose spend broke the name's bond continuity
   * (the invalidating spend) — a RESOLVED witnessed fact (detection is the engine/settlement's job;
   * this predicate consumes it). Positive: a height of 0 is never a release and is rejected.
   */
  readonly releaseHeight: number;
}

export interface BondContinuityWitness {
  /**
   * Whether the witnessed bond-continuity / release history is COMPLETE (T22-02). An incomplete
   * witness fails the reopen gate closed — the latest release cannot be decided on partial facts.
   */
  readonly witnessComplete: boolean;
  /** The resolved bond-break facts witnessed for this name. */
  readonly breaks: readonly BondBreakFact[];
}

export interface ReopenInput {
  readonly reopenLot: ReopenLot;
  readonly bondContinuity: BondContinuityWitness;
}

export interface ReopenVerdict {
  /** True iff the reopen lot is recognized as a valid auction generation for the name. */
  readonly recognized: boolean;
  /**
   * The latest release height the predicate derived — non-null ONLY after a complete, unique
   * derivation (so it is non-null for a recognized reopen and for a stale/fabricated-anchor reject,
   * but null when the witness is incomplete, malformed, empty-for-reopen, or same-height-tied).
   */
  readonly derivedLatestReleaseHeight: number | null;
  /** Stable, rule-grounded reason code. */
  readonly reason: string;
}

const REOPEN_INPUT_KEYS = ["reopenLot", "bondContinuity"] as const;
const REOPEN_LOT_KEYS = ["kind", "releaseAnchor"] as const;
const BOND_CONTINUITY_KEYS = ["witnessComplete", "breaks"] as const;
const BOND_BREAK_KEYS = ["releaseHeight"] as const;

const reject = (reason: string, derivedLatestReleaseHeight: number | null = null): ReopenVerdict => ({
  recognized: false,
  derivedLatestReleaseHeight,
  reason,
});

function validateLot(input: unknown): input is ReopenLot {
  return (
    isObject(input) &&
    isClosedShape(input, REOPEN_LOT_KEYS) &&
    (input.kind === "opening" || input.kind === "reopen") &&
    isSafeNonNegInt(input.releaseAnchor)
  );
}

function validateBondContinuity(input: unknown): input is BondContinuityWitness {
  if (!isObject(input) || !isClosedShape(input, BOND_CONTINUITY_KEYS)) {
    return false;
  }
  if (typeof input.witnessComplete !== "boolean" || !Array.isArray(input.breaks)) {
    return false;
  }
  return input.breaks.every(
    (b) => isObject(b) && isClosedShape(b, BOND_BREAK_KEYS) && isPositiveSafeInt(b.releaseHeight)
  );
}

/**
 * The UNIQUE latest release height among `breaks`, or null if there is no break OR two-or-more breaks
 * tie at the maximum height (the S8 unstated tx-level tiebreak — parked, fails closed). Pure.
 */
function uniqueLatestReleaseHeight(breaks: readonly BondBreakFact[]): number | null {
  if (breaks.length === 0) {
    return null;
  }
  let max = breaks[0]!.releaseHeight;
  for (const b of breaks) {
    if (b.releaseHeight > max) {
      max = b.releaseHeight;
    }
  }
  const atMax = breaks.filter((b) => b.releaseHeight === max).length;
  return atMax === 1 ? max : null;
}

/**
 * Recognize whether `reopenLot` is a valid auction generation for the name, keyed off the latest
 * kernel-derived bond-break release height. Pure and total — malformed inputs return a
 * non-recognition verdict and never throw.
 */
export function resolveReopen(input: ReopenInput): ReopenVerdict {
  const i = input as unknown;
  if (!isObject(i) || !isClosedShape(i, REOPEN_INPUT_KEYS)) {
    return reject("reopen-input-malformed");
  }
  if (!validateLot(i.reopenLot)) {
    return reject("reopen-lot-malformed");
  }
  if (!validateBondContinuity(i.bondContinuity)) {
    return reject("reopen-bond-continuity-malformed");
  }
  const lot = i.reopenLot;
  const { witnessComplete, breaks } = i.bondContinuity;

  // T22-02: an incomplete witness fails closed BEFORE any matching.
  if (!witnessComplete) {
    return reject("reopen-incomplete-bond-continuity-witness");
  }

  if (lot.kind === "opening") {
    // First generation (opening-{name}, anchor 0): valid only with no prior break and anchor 0.
    if (breaks.length > 0) {
      // A first-generation lot is stale once a release has been witnessed.
      return reject("reopen-opening-after-break-rejected", uniqueLatestReleaseHeight(breaks));
    }
    if (lot.releaseAnchor !== 0) {
      return reject("reopen-opening-anchor-must-be-zero");
    }
    return { recognized: true, derivedLatestReleaseHeight: null, reason: "reopen-opening-first-generation" };
  }

  // kind === "reopen": needs a witnessed break and a unique latest release.
  if (breaks.length === 0) {
    // No witnessed break — an adapter cannot mint a reopen generation out of nothing (B19/#42).
    return reject("reopen-no-witnessed-break");
  }
  const latest = uniqueLatestReleaseHeight(breaks);
  if (latest === null) {
    // Two-or-more breaks tie at the max height: the tx-level tiebreak is unruled (S8) — fail closed.
    return reject("reopen-same-height-break-tiebreak-unspecified");
  }
  // A reopen lot is recognized only when anchored exactly to the unique latest release. A stale,
  // fabricated, future, or zero anchor (reopen-after-0 cannot collapse into first generation) rejects.
  if (lot.releaseAnchor !== latest) {
    return reject("reopen-anchor-not-latest-release", latest);
  }
  return { recognized: true, derivedLatestReleaseHeight: latest, reason: "reopen-anchored-to-latest-release" };
}
