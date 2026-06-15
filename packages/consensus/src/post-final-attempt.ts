// B2 post-final-attempt predicate (B7 / #37 in-window / first-anchor-wins). A PURE, total, closed-shape
// state-shape gate: a claim OR bond that lands at or after a name's finality is refused as an
// already-owned attempt and changes nothing — no insertion, no auction opened, no window reopen /
// extend, no nullify; the incumbent (final) record is byte-unchanged.
//
// AUTHORITY (the ratified aspects):
//   - State machine: a post-final claim is an already-owned attempt (no nullify, no contest).
//   - #37 in-window phrasing: a qualifying bond opens an auction ONLY when posted inside the notice
//     window — so a post-final bond opens no auction and cannot evict the final owner.
//   - First-anchor-wins (PR-5): ordering / bonds never touch a name that is already final.
//
// SCOPE: this gate consumes a name whose lifecycle is ALREADY RESOLVED to `final` (the caller composed
// notice-window #69 / auction #68 / settlement #65 to reach finality) plus a post-final claim/bond
// attempt, and asserts the no-effect verdict. It does NOT decide finality itself, and it is distinct
// from occupancy #71: occupancy admits/refuses a fresh INSERTION over a name's occupancy; this gate is
// the broader post-final no-effect invariant covering both a claim AND a bond attempt (the bond half
// has no other resident home). It deliberately does not re-derive the incumbent or model the auction.
//
// Total / fail-closed + closed-shape (the #63-#76 discipline): a non-final incumbent (this gate's
// precondition is a final name), a malformed attempt, or any extra field fails closed
// (refused:false, stateEffect:"undecidable") and never throws — so the gate never silently admits a
// change, and it never overclaims for a non-final name (that lifecycle lives in #69/#71/#68).
//
// Rules: docs/core/B2_KERNEL_HARDENING.md B7; DECISIONS #37 (bond-opens, in-window), PR-5
// (first-anchor-wins).

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const isClosedShape = (obj: object, allowed: readonly string[]): boolean =>
  Object.keys(obj).every((key) => allowed.includes(key));
const isPubkey = (x: unknown): x is string => typeof x === "string" && /^[0-9a-f]{64}$/.test(x);

export type PostFinalAttemptKind = "claim" | "bond";

export interface FinalIncumbent {
  /** This gate's precondition: the name's lifecycle is already resolved to `final`. */
  readonly status: "final";
  /** The incumbent (final) owner key — asserted byte-unchanged by any post-final attempt. */
  readonly ownerKey: string;
}

export interface PostFinalAttempt {
  readonly kind: PostFinalAttemptKind;
}

export interface PostFinalAttemptInput {
  readonly incumbent: FinalIncumbent;
  readonly attempt: PostFinalAttempt;
}

export interface PostFinalAttemptVerdict {
  /** True iff the attempt is refused as an already-owned post-final attempt. */
  readonly refused: boolean;
  /** "none": a final name admits no state effect; "undecidable": malformed / non-final input. */
  readonly stateEffect: "none" | "undecidable";
  /** True iff the incumbent (final) record is byte-unchanged by this attempt. */
  readonly incumbentUnchanged: boolean;
  /** Stable, rule-grounded reason code. */
  readonly reason: string;
}

const INPUT_KEYS = ["incumbent", "attempt"] as const;
const INCUMBENT_KEYS = ["status", "ownerKey"] as const;
const ATTEMPT_KEYS = ["kind"] as const;

const failClosed = (reason: string): PostFinalAttemptVerdict => ({
  refused: false,
  stateEffect: "undecidable",
  incumbentUnchanged: true,
  reason,
});

/**
 * Decide a post-final claim/bond attempt against an already-final name (B7). Pure and total — a
 * malformed or non-final input fails closed (never admits a change) and never throws. For a valid
 * final incumbent, ANY attempt (claim or bond) is refused with no state effect and the incumbent
 * byte-unchanged.
 */
export function acceptPostFinalAttempt(input: PostFinalAttemptInput): PostFinalAttemptVerdict {
  const i = input as unknown;
  if (!isObject(i) || !isClosedShape(i, INPUT_KEYS)) {
    return failClosed("b7-input-malformed");
  }
  const incumbent = i.incumbent;
  if (!isObject(incumbent) || !isClosedShape(incumbent, INCUMBENT_KEYS) || !isPubkey(incumbent.ownerKey)) {
    return failClosed("b7-incumbent-malformed");
  }
  if (incumbent.status !== "final") {
    // Precondition: this gate is only the post-FINAL rule; a non-final name's lifecycle lives in
    // notice-window #69 / occupancy #71 / auction #68 — fail closed rather than overclaim.
    return failClosed("b7-not-a-final-name");
  }
  const attempt = i.attempt;
  if (!isObject(attempt) || !isClosedShape(attempt, ATTEMPT_KEYS) || (attempt.kind !== "claim" && attempt.kind !== "bond")) {
    return failClosed("b7-attempt-malformed");
  }

  // A final name refuses any post-final attempt (claim OR bond) with zero state effect: no insertion,
  // no auction opened, no window reopen/extend, no nullify — the incumbent record is byte-unchanged.
  return {
    refused: true,
    stateEffect: "none",
    incumbentUnchanged: true,
    reason: "b7-post-final-attempt-already-owned",
  };
}
