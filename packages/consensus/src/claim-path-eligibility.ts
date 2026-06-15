// B2 claim-path-eligibility predicate (F15 / PR-15). A PURE, total verdict: a name whose canonical
// byte length is at or below the short-name threshold T cannot finalize via the cheap-claim path
// (it is bond-first only); a name longer than T may finalize via a cheap claim. T is a launch-freeze
// parameter, not a baked-in constant.
//
// It consumes the canonical name BYTE LENGTH (a number) — never the name itself — so it carries no
// normalization concern (canonicality / reject-not-normalize is name-canonicalization.ts / A6; the
// caller supplies the validated canonical byte length). It is a separate predicate from A6 by design.
//
// Total / fail-closed (the #63-#74 discipline): a non-positive-integer length or threshold fails
// closed (no cheap-claim path) and never throws.
//
// Rules: docs/core/B2_KERNEL_HARDENING.md F15; DECISIONS PR-15 (short-name no-cheap-path).

const isPositiveSafeInt = (x: unknown): x is number =>
  typeof x === "number" && Number.isSafeInteger(x) && x >= 1;

export interface ClaimPathEligibilityVerdict {
  /** True iff a name of this length may finalize via the cheap-claim path (length > threshold T). */
  readonly cheapClaimAllowed: boolean;
  /** Stable, rule-grounded reason code. */
  readonly reason: string;
}

/**
 * Decide whether a name of `canonicalNameByteLength` may use the cheap-claim path under the launch
 * short-name threshold `thresholdT` (PR-15): `length <= T` is bond-first only; `length > T` allows a
 * cheap claim. Pure and total — a malformed length or threshold fails closed (no cheap path) and never
 * throws. T enters as a parameter so no launch value is baked in.
 */
export function claimPathEligibility(
  canonicalNameByteLength: number,
  thresholdT: number
): ClaimPathEligibilityVerdict {
  if (!isPositiveSafeInt(canonicalNameByteLength)) {
    return { cheapClaimAllowed: false, reason: "f15-name-length-malformed" };
  }
  if (!isPositiveSafeInt(thresholdT)) {
    return { cheapClaimAllowed: false, reason: "f15-threshold-malformed" };
  }
  if (canonicalNameByteLength <= thresholdT) {
    return { cheapClaimAllowed: false, reason: "f15-short-name-bond-first-only" };
  }
  return { cheapClaimAllowed: true, reason: "f15-cheap-claim-allowed" };
}
