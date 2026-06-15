// D-SB-avail — served-bytes first-servable-HEIGHT attribution (B3; RATIFIED #84
// availability-height, O1 + O3). Mints the `VerifiedAvailabilityHeight` that
// D-SB-bind's `toServedEvidence` consumes and the kernel's includable / holdsPriority
// verdicts read. Non-deciding — it constructs/checks a witness; it never overrides a
// kernel verdict.
//
// O1 (fail-closed over the PRESENTED content witness): `firstServableHeight = h`, the
// anchor's CONFIRMED mined height, for any batch whose presented base+delta
// reconstruct the anchored commitment (D-SB-bind). Absent that reconstruction, fail
// closed — no height is minted. A challenge is fault-attribution / diagnostic only,
// never a deciding event (§215). Priority-bearing contention routes to bonded /
// direct-L1 (O3), out of this path.
//
// O1 amendment (#84): the height ALWAYS collapses to `h` for a non-faulted batched
// claim — there is NO late-served `(h+W, h+W+C]` height for the accumulator path; the
// late-served-priority race is settled at L1 (O3), not via this height.
//
// The height is NEVER producer-attested (#51 (iii)). `confirmedAnchorMinedHeight` is
// the confirmed-chain mined height (sourced from a verified D-BI bitcoin inclusion)
// and must equal the binding's anchor height, so the stamped height is the confirmed
// mined height of the very anchor the presented bytes reconstruct.
import {
  bindServedBytes,
  type BoundServedBatch,
  type ServedBatchBinding,
  type ServedLeaf,
  type VerifiedAvailabilityHeight,
} from "./served-bytes.js";

/** Inputs to the first-servable-height verifier (the presented witness + confirmed h). */
export interface AvailabilityInput {
  /** The verified base accumulator state whose root is `binding.prevRoot`. */
  readonly baseLeaves: ReadonlyMap<string, string>;
  /** The PRESENTED served delta — the content witness whose reconstruction O1 gates on. */
  readonly servedDelta: readonly ServedLeaf[];
  /** The ratified anchor surface the served bytes must reconstruct (WIRE §4.4 / #53). */
  readonly binding: ServedBatchBinding;
  /**
   * h: the anchor tx's CONFIRMED mined height, sourced from a verified D-BI bitcoin
   * inclusion — NOT producer-attested. Must equal `binding.anchorHeight`.
   */
  readonly confirmedAnchorMinedHeight: number;
}

/** The verified result: the bound batch + the minted (branded) first-servable height. */
export interface VerifiedAvailability {
  readonly bound: BoundServedBatch;
  readonly firstServableHeight: VerifiedAvailabilityHeight;
}

/**
 * Verify the first-servable height for a presented batch and mint a
 * `VerifiedAvailabilityHeight` (O1: it is the confirmed anchor mined height `h`).
 * Throws (fail-closed, no mint) when the presented bytes do not reconstruct the
 * anchored commitment, or when the confirmed mined height is malformed or disagrees
 * with the binding's anchor (a producer-attested height).
 */
export function verifyAvailabilityHeight(_input: AvailabilityInput): VerifiedAvailability {
  // STUB (tests-first red battery). The E-AV vectors are RED against this until the
  // O1 implementation lands.
  throw new Error("@ont/evidence.verifyAvailabilityHeight: not implemented (D-SB-avail slice-3 stub)");
}
