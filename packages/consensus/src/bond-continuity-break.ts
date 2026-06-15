// B2 bond-continuity-break predicate (S6 / S7 / B18 / #5). A PURE, total, closed-shape verdict over
// resolved chain facts: a pre-maturity spend of a name's current bond outpoint with NO same-tx valid
// successor bond RELEASES the name (ownership continuity broken, name reopens for a new auction
// generation) — REGARDLESS of which key signed the spend. Continuity is an ONT rule, not a Bitcoin
// timelock: the kernel assigns the release consequence to an OBSERVED spend, never to a key-authorized
// event.
//
// NO SIGNER / KEY / AUTHORIZED INPUT CHANNEL (the S6 crux). The bond outpoint is spendable by whoever
// holds the funding-wallet key, which is distinct from the owner key (#41) — so there is NO
// owner-signature exemption: a break is decided purely from {preMaturity, bond-outpoint-spent,
// same-tx-valid-successor}. The closed shape explicitly admits ONLY those three booleans; any
// signer / funding-key / owner-key / authorized field is rejected (undecided), so no key can ever be
// consulted to avert the release.
//
// `sameTxValidSuccessorBond` is a CONSUMED resolved fact (engine/B3): full successor output/script
// validation is outside this slice; this predicate decides the continuity consequence given the
// resolved facts.
//
// Total / fail-closed + closed-shape (the #63-#78 discipline): a malformed or extra-field input is
// `undecided` (fail closed — NOT silently a valid no-break) and never throws. The four valid fact
// combinations are all `decided`; only the pre-maturity-spent-no-successor combination `released`.
//
// Rules: docs/core/B2_KERNEL_HARDENING.md S6 / S7 / B18; DECISIONS #5 (bond continuity break →
// release), #41 (funding-wallet key distinct from owner key); X8 (mature transfers impose no
// continuity).

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const isClosedShape = (obj: object, allowed: readonly string[]): boolean =>
  Object.keys(obj).every((key) => allowed.includes(key));

export interface BondContinuityFacts {
  /** Evaluated before the maturity height (X8: a mature name imposes no bond-continuity requirement). */
  readonly preMaturity: boolean;
  /** Resolved chain fact: the name's current bond outpoint was spent. */
  readonly currentBondOutpointSpent: boolean;
  /** Consumed resolved engine/B3 fact: a valid successor bond was created in the SAME transaction. */
  readonly sameTxValidSuccessorBond: boolean;
}

export interface BondContinuityVerdict {
  /** False = malformed / out-of-domain input (fail closed); true = a valid fact combination was ruled. */
  readonly decided: boolean;
  /** True iff bond continuity broke and the name is released; meaningful only when `decided`. */
  readonly released: boolean;
  /** Stable, rule-grounded reason code. */
  readonly reason: string;
}

const FACT_KEYS = ["preMaturity", "currentBondOutpointSpent", "sameTxValidSuccessorBond"] as const;

const undecided = (reason: string): BondContinuityVerdict => ({ decided: false, released: false, reason });
const ruled = (released: boolean, reason: string): BondContinuityVerdict => ({ decided: true, released, reason });

/**
 * Decide whether a name's bond continuity broke, releasing it (S6). Pure and total — a malformed or
 * extra-field input (including ANY signer/key/authorized field) is `undecided` (fail closed) and never
 * throws. Release is an observed-spend consequence: pre-maturity + bond outpoint spent + no same-tx
 * valid successor releases the name regardless of which key signed the spend.
 */
export function bondContinuityBreak(facts: BondContinuityFacts): BondContinuityVerdict {
  const f = facts as unknown;
  if (!isObject(f) || !isClosedShape(f, FACT_KEYS)) {
    // A signer / funding-key / owner-key / authorized field lands here — there is no such input channel.
    return undecided("s6-input-malformed");
  }
  if (
    typeof f.preMaturity !== "boolean" ||
    typeof f.currentBondOutpointSpent !== "boolean" ||
    typeof f.sameTxValidSuccessorBond !== "boolean"
  ) {
    return undecided("s6-input-malformed");
  }

  // X8: a mature name imposes no bond-continuity requirement — a spend does not release it.
  if (!f.preMaturity) {
    return ruled(false, "s6-mature-no-continuity-requirement");
  }
  // Pre-maturity, the bond outpoint is unspent — continuity holds.
  if (!f.currentBondOutpointSpent) {
    return ruled(false, "s6-bond-unspent-continuous");
  }
  // Pre-maturity spend WITH a valid same-tx successor bond — continuity is preserved by rotation.
  if (f.sameTxValidSuccessorBond) {
    return ruled(false, "s6-spent-with-valid-successor-continuous");
  }
  // Pre-maturity spend with NO same-tx valid successor — continuity broke; the name is released,
  // regardless of which key signed the spend (no owner-signature exemption; observed-spend consequence).
  return ruled(true, "s6-pre-maturity-spend-no-successor-released");
}
