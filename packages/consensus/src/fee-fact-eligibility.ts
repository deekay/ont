// B2 fee-fact-eligibility predicate (F9). A PURE, total, closed-shape verdict: an anchor contributes
// a fee fact ONLY once it has reached K-deep confirmation on the CURRENT canonical chain, and the fee
// fact's value is THIS anchor's OWN intrinsic fee. An anchor reorged out before reaching K-depth
// contributes no fee fact (and no name); a re-mined replacement is gated on its own intrinsic fee,
// never the orphaned tx's.
//
// #49-INDEPENDENT (the parking-rule boundary, same discipline as notice-window/occupancy). K-depth
// enters as a RESOLVED boolean (`reachedKDepthOnCanonicalChain`) — the caller composes the #49
// K-depth check (confirmation depth vs the K parameter); this predicate never sees K or the raw
// confirmation depth, so the open/ratified da-windows K value can move without touching this module.
//
// NO ORPHAN / PREVIOUS / FIRST-SEEN FEE INPUT CHANNEL (the F9 crux). The closed shape admits ONLY
// `reachedKDepthOnCanonicalChain` + `intrinsicFeeSats` (THIS current-chain anchor's own fee). Any
// orphan-fee / previous-fee / first-seen-fee / confirmationDepth / K field is rejected, so a
// reorged-before-K anchor contributes no fact regardless of what an orphaned tx paid, and a re-mined
// replacement's fee fact is its OWN fee by construction (source selection, not economics).
//
// SCOPE: F9 decides fee-fact EXISTENCE + WHICH fee (the own intrinsic fee), only. The economic fee
// gate is downstream: `gate-fee.ts` (gateFeeValidation) stays reorg/confirmation-unaware and the
// g(name) fee schedule is B3 — a lower own fee may be rejected there later, but that is not F9's call.
//
// Total / fail-closed + closed-shape (the #63-#80 discipline): malformed, extra-field, non-boolean
// K-depth, or non-nonnegative-bigint fee input contributes no fee fact (feeFactSats:null) and never
// throws.
//
// Rules: docs/core/B2_KERNEL_HARDENING.md F9; DECISIONS #49 da-windows (K-depth, consumed as a
// resolved fact); intrinsic fee = Σin − Σout of the anchor tx, witnessed from Bitcoin.

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const isClosedShape = (obj: object, allowed: readonly string[]): boolean =>
  Object.keys(obj).every((key) => allowed.includes(key));
const isNonNegBigInt = (x: unknown): x is bigint => typeof x === "bigint" && x >= 0n;

export interface FeeFactEligibilityInput {
  /** Resolved chain fact: the anchor is K-deep on the CURRENT canonical chain (#49 K-depth, composed by the caller). */
  readonly reachedKDepthOnCanonicalChain: boolean;
  /** THIS current-chain anchor's OWN intrinsic fee (Σin − Σout of THIS tx). */
  readonly intrinsicFeeSats: bigint;
}

export interface FeeFactEligibilityVerdict {
  /** True iff the anchor contributes a fee fact (reached K-depth on the current chain). */
  readonly contributesFeeFact: boolean;
  /** The fee fact value (this anchor's own intrinsic fee) when it contributes one; null otherwise. */
  readonly feeFactSats: bigint | null;
  /** Stable, rule-grounded reason code. */
  readonly reason: string;
}

const INPUT_KEYS = ["reachedKDepthOnCanonicalChain", "intrinsicFeeSats"] as const;
const noFact = (reason: string): FeeFactEligibilityVerdict => ({ contributesFeeFact: false, feeFactSats: null, reason });

/**
 * Decide whether an anchor contributes a fee fact and which fee it is (F9). Pure and total — a
 * malformed input contributes no fee fact and never throws. An anchor not yet K-deep on the current
 * canonical chain contributes nothing (independent of any orphan fee, which has no input channel); a
 * K-deep anchor's fee fact is its OWN intrinsic fee.
 */
export function feeFactEligibility(input: FeeFactEligibilityInput): FeeFactEligibilityVerdict {
  const i = input as unknown;
  if (!isObject(i) || !isClosedShape(i, INPUT_KEYS)) {
    // An orphanFeeSats / previousFeeSats / firstSeenFeeSats / confirmationDepth / K field lands here —
    // there is no input channel for an orphaned tx's fee or a raw confirmation depth.
    return noFact("f9-input-malformed");
  }
  if (typeof i.reachedKDepthOnCanonicalChain !== "boolean") {
    return noFact("f9-k-depth-fact-malformed");
  }
  if (!isNonNegBigInt(i.intrinsicFeeSats)) {
    return noFact("f9-intrinsic-fee-malformed");
  }

  if (!i.reachedKDepthOnCanonicalChain) {
    // Reorged out / pre-K: contributes no fee fact and no name — regardless of any orphan fee.
    return noFact("f9-not-k-deep-no-fee-fact");
  }
  // K-deep on the current canonical chain: the fee fact is THIS anchor's OWN intrinsic fee (source
  // selection; a re-mined replacement contributes its own fee, never the orphan's). Economics are
  // gated downstream.
  return {
    contributesFeeFact: true,
    feeFactSats: i.intrinsicFeeSats,
    reason: "f9-k-deep-fee-fact-own-intrinsic-fee",
  };
}
