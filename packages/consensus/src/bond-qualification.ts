// Bond qualification for escalation (B6 / DECISIONS #37 bond-opens). A PURE predicate: a bond
// qualifies to escalate iff its amount is at or above the supplied bond floor. This is ONLY the
// #37 qualification test — it is named around qualification, not state transition.
//
// SCOPE (B2 slice B6): it asserts nothing about the candidate "contested" state, the auction
// state machine, auction RESOLUTION (who wins), or a claim-count trigger — a bare claim can never
// escalate, and there is no claim-count parameter. The bond floor is a launch-freeze PARAMETER
// supplied to the predicate; B2 does NOT fix the floor's value or define a fee/floor schedule.
// Total / fail-closed (the #63 discipline): a non-bigint or negative amount/floor does not
// qualify (returns a verdict, never throws) — the exported boundary sees arbitrary JS.

export interface BondQualificationVerdict {
  readonly qualifies: boolean;
  /** Stable, rule-grounded reason code. */
  readonly reason: string;
}

const reject = (reason: string): BondQualificationVerdict => ({ qualifies: false, reason });
const qualify = (): BondQualificationVerdict => ({ qualifies: true, reason: "bond-at-or-above-floor" });

/**
 * Decide whether `bondAmountSats` qualifies to escalate against `bondFloorSats` (#37): it
 * qualifies iff it is at or above the floor. Pure and total — a malformed (non-bigint or
 * negative) amount or floor does not qualify and never throws.
 */
export function bondQualifiesForEscalation(
  bondAmountSats: bigint,
  bondFloorSats: bigint
): BondQualificationVerdict {
  // Total fail-closed: only non-negative integer (bigint) satoshi values are considered.
  const amount = bondAmountSats as unknown;
  const floor = bondFloorSats as unknown;
  if (typeof amount !== "bigint" || typeof floor !== "bigint") {
    return reject("b6-non-bigint-amount");
  }
  if (amount < 0n || floor < 0n) {
    return reject("b6-negative-amount");
  }
  // #37: a qualifying bond is at or above the floor; a sub-floor bond is a no-op (does not escalate).
  if (amount < floor) {
    return reject("b6-sub-floor-bond-no-op");
  }
  return qualify();
}
