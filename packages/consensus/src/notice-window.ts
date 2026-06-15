// B2 notice-window resolution predicate (T17 / F11 / A12 / A13 / D10 / #37). A PURE, total,
// closed-shape verdict for the cheap-claim lifecycle: at the notice deadline it rules a name
// finalize / nullify / escalate / provisional from the witnessed set of competing in-window
// claims and the qualifying-bond input.
//
// #49-INDEPENDENT (the parking-rule boundary). This predicate consumes each claim's ALREADY-
// RESOLVED DA verdict — the {decided, holdsPriority} output of ./da-verdict.ts, composed by the
// engine over a served-bytes witness — and never recomputes includable/holdsPriority and never
// sees W/C/K. The #49-governed window algebra lives in the DA verdict the caller supplies; this
// rule only counts the resolved priority-bearing claims. So da-windows (#49) values may move
// without touching this module — the conformance tests vary the supplied DA facts to show the
// holdsPriority (h+W) boundary (F11), exactly as the scope concurrence directed.
//
// SCOPE:
//   - A13: the notice window opens at the name's earliest-valid anchor mined height; the verdict
//     is derived only at currentHeight >= anchorHeight + W_notice (a >= gate; before it the name
//     is provisional). W_notice is a launch-freeze parameter, not a value this rule fixes.
//   - T17 / F11 / #37: exactly one distinct-owner DA-valid claim and no qualifying bond ->
//     finalize; two or more distinct-owner DA-valid claims and no qualifying bond -> nullify (no
//     owner, the name reopens); any qualifying bond (against a claim, or bond-first) -> escalate to
//     auction. A bare collision can deny, never award.
//   - PR-6 / first-anchor-wins (B5): a "competing claim" counts DISTINCT (name, owner) only; a
//     same-owner duplicate or re-anchor is idempotent (A12), not a second nullifier — claims are
//     deduped by owner key before counting.
//   - D10: a claim whose DA verdict resolved NOT priority-bearing does not count for any lifecycle
//     purpose (it cannot finalize, collide/nullify, or be the claim a bond escalates against); a
//     withheld competing claim (resolved excluded) does not nullify an available claim.
//   - Fail closed (D10 nullification-by-withholding guard): if any presented claim's DA verdict is
//     UNDECIDED at the evaluation height, the claim set is not yet rulable -> undecidable (never a
//     premature finalize/nullify). Under #49 K>=W+C every challenge resolves before finalization,
//     so an honest deadline evaluation never carries an undecided claim; this is the defensive edge.
//
// DELIBERATELY EXCLUDED: the auction itself (escalate emits the outcome; selecting the winner is
// ./auction-resolution.ts); the exact notice-deadline INCLUSIVITY of a claim landing AT the close
// height (that non-DA edge is PR-13, cf. A13); the in-window membership filter and the choice of
// the governing anchor among competing claims (the engine's first-anchor-wins composition);
// whole-batch-vs-per-leaf DA granularity (./da-verdict.ts D4); and any indexer/resolver
// integration. Total / fail-closed + closed-shape (the #63-#68 discipline): malformed or
// extra-field inputs return a non-award verdict and never throw — no producer-asserted
// "qualifies" / "daValid" boolean is admitted as authority; bond qualification is delegated to the
// resident #37 predicate and DA-validity is the resident DA verdict's resolved output.
//
// Rules: docs/core/B2_KERNEL_HARDENING.md A12 / A13 / D10 / F11 / F12 / T17; DECISIONS #37
// bond-opens, #47 marker-fold, #49 da-windows (K>=W+C), PR-6 distinct-owner.

import { bondQualifiesForEscalation } from "./bond-qualification.js";

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const isClosedShape = (obj: object, allowed: readonly string[]): boolean =>
  Object.keys(obj).every((key) => allowed.includes(key));
const isSafeNonNegInt = (x: unknown): x is number =>
  typeof x === "number" && Number.isSafeInteger(x) && x >= 0;
const isPositiveSafeInt = (x: unknown): x is number =>
  typeof x === "number" && Number.isSafeInteger(x) && x >= 1;
const isNonNegBigInt = (x: unknown): x is bigint => typeof x === "bigint" && x >= 0n;
const isPubkey = (x: unknown): x is string => typeof x === "string" && /^[0-9a-f]{64}$/.test(x);

export type NoticeWindowOutcome =
  | "provisional"
  | "finalized"
  | "nullified"
  | "escalated"
  | "undecidable";

/**
 * The RESOLVED data-availability verdict for one claim's batch: the {decided, holdsPriority}
 * output of ./da-verdict.ts, composed by the engine over a served-bytes witness. This module
 * consumes it as a fact — it never recomputes includable/holdsPriority and never sees W/C/K, so it
 * stays #49-independent.
 */
export interface ResolvedClaimDaVerdict {
  /**
   * True once the claim's DA challenge window has closed at the evaluation height (#49 decidability,
   * guaranteed by K>=W+C before finalization). An undecided verdict fails the whole resolution
   * closed — the claim set is not yet rulable.
   */
  readonly decided: boolean;
  /**
   * The resolved §6d priority verdict (./da-verdict.ts holdsPriority — bytes served by the
   * availability deadline h+W). Whether this claim is a priority-bearing DA-valid competitor.
   * Meaningful only when `decided` is true. Keying the collision count to holdsPriority is the F11
   * W-boundary input.
   */
  readonly holdsPriority: boolean;
}

export interface NoticeWindowClaim {
  /** Owner key (BIP340 x-only pubkey, lowercase hex) — the (name, owner) identity for PR-6 dedup. */
  readonly ownerKey: string;
  /** This claim's resolved DA verdict (consumed, never recomputed). */
  readonly daVerdict: ResolvedClaimDaVerdict;
}

export interface NoticeWindowBondInput {
  /** Bond amount in sats, or null when no bond is present. */
  readonly bondAmountSats: bigint | null;
  /** The #37 bond floor (launch-freeze parameter). */
  readonly bondFloorSats: bigint;
}

export interface NoticeWindowParams {
  /** W_notice — the notice window length in blocks (A13; launch-freeze, not fixed here). */
  readonly noticeWindowBlocks: number;
}

export interface NoticeWindowInput {
  /**
   * The notice window's opening anchor mined height — the single window clock (A12 / A13 /
   * marker-fold #47): the earliest-valid anchor governing this resolution per first-anchor-wins.
   */
  readonly anchorHeight: number;
  /** The evaluation height. */
  readonly currentHeight: number;
  /** The complete witnessed set of competing in-window claims for THIS name (caller-filtered). */
  readonly claims: readonly NoticeWindowClaim[];
  /** The qualifying-bond input (raw amount + floor; qualification delegated to the #37 predicate). */
  readonly bond: NoticeWindowBondInput;
  readonly params: NoticeWindowParams;
}

export interface NoticeWindowVerdict {
  readonly outcome: NoticeWindowOutcome;
  /** True ONLY for "finalized" — a name awarded to a single distinct-owner DA-valid claim. */
  readonly awarded: boolean;
  /**
   * The distinct-owner DA-valid (priority-bearing) claim count the decision used; null pre-deadline,
   * undecidable, or malformed (the count was not computed).
   */
  readonly daValidOwnerCount: number | null;
  /** Stable, rule-grounded reason code. */
  readonly reason: string;
}

const DA_VERDICT_KEYS = ["decided", "holdsPriority"] as const;
const CLAIM_KEYS = ["ownerKey", "daVerdict"] as const;
const BOND_KEYS = ["bondAmountSats", "bondFloorSats"] as const;
const PARAM_KEYS = ["noticeWindowBlocks"] as const;
const INPUT_KEYS = ["anchorHeight", "currentHeight", "claims", "bond", "params"] as const;

function validateDaVerdict(input: unknown): input is ResolvedClaimDaVerdict {
  return (
    isObject(input) &&
    isClosedShape(input, DA_VERDICT_KEYS) &&
    typeof input.decided === "boolean" &&
    typeof input.holdsPriority === "boolean"
  );
}

function validateClaim(input: unknown): input is NoticeWindowClaim {
  return (
    isObject(input) &&
    isClosedShape(input, CLAIM_KEYS) &&
    isPubkey(input.ownerKey) &&
    validateDaVerdict(input.daVerdict)
  );
}

function validateBond(input: unknown): input is NoticeWindowBondInput {
  return (
    isObject(input) &&
    isClosedShape(input, BOND_KEYS) &&
    (input.bondAmountSats === null || isNonNegBigInt(input.bondAmountSats)) &&
    isNonNegBigInt(input.bondFloorSats)
  );
}

function validateParams(input: unknown): input is NoticeWindowParams {
  return isObject(input) && isClosedShape(input, PARAM_KEYS) && isPositiveSafeInt(input.noticeWindowBlocks);
}

const reject = (
  outcome: NoticeWindowOutcome,
  reason: string,
  daValidOwnerCount: number | null = null
): NoticeWindowVerdict => ({ outcome, awarded: false, daValidOwnerCount, reason });

/**
 * Rule a name's notice-window outcome at the evaluation height (A13/T17/F11/#37). Pure and total —
 * malformed inputs return a non-award verdict and never throw. The decision is a pure function of
 * the supplied chain facts: the window clock, the resolved per-claim DA verdicts, and the
 * qualifying-bond input. #49-independent: DA-validity enters as a resolved fact, never recomputed.
 */
export function resolveNoticeWindow(input: NoticeWindowInput): NoticeWindowVerdict {
  const i = input as unknown;
  if (!isObject(i) || !isClosedShape(i, INPUT_KEYS)) {
    return reject("undecidable", "notice-window-input-malformed");
  }
  if (!isSafeNonNegInt(i.anchorHeight) || !isSafeNonNegInt(i.currentHeight)) {
    return reject("undecidable", "notice-window-height-malformed");
  }
  if (!validateParams(i.params)) {
    return reject("undecidable", "notice-window-params-malformed");
  }
  if (!validateBond(i.bond)) {
    return reject("undecidable", "notice-window-bond-malformed");
  }
  if (!Array.isArray(i.claims)) {
    return reject("undecidable", "notice-window-claims-malformed");
  }
  for (const claim of i.claims) {
    if (!validateClaim(claim)) {
      return reject("undecidable", "notice-window-claim-malformed");
    }
  }
  const claims = i.claims as readonly NoticeWindowClaim[];
  const params = i.params as NoticeWindowParams;
  const bond = i.bond as NoticeWindowBondInput;

  // A13: the verdict is derived only at currentHeight >= anchorHeight + W_notice (a >= gate; before
  // the deadline the name is provisional). Safe arithmetic — an overflowing deadline fails closed.
  const deadline = i.anchorHeight + params.noticeWindowBlocks;
  if (!Number.isSafeInteger(deadline)) {
    return reject("undecidable", "notice-window-deadline-overflow");
  }
  if (i.currentHeight < deadline) {
    return reject("provisional", "notice-window-pre-deadline-provisional");
  }

  // D10 / nullification-by-withholding guard: if any presented claim's DA verdict is undecided at
  // the evaluation height, the claim set is not yet rulable — fail closed (never a premature
  // finalize/nullify). Under #49 K>=W+C an honest deadline evaluation never carries an undecided
  // claim; this is the defensive edge.
  if (claims.some((claim) => !claim.daVerdict.decided)) {
    return reject("undecidable", "notice-window-da-verdict-undecided-fail-closed");
  }

  // D10 + PR-6: count only DISTINCT-owner priority-bearing (holdsPriority) DA-valid claims. A
  // resolved non-priority claim (withheld / forfeited priority) does not count; a same-owner
  // duplicate or re-anchor is idempotent (A12), deduped by owner key.
  const daValidOwners = new Set<string>();
  for (const claim of claims) {
    if (claim.daVerdict.holdsPriority) {
      daValidOwners.add(claim.ownerKey);
    }
  }
  const daValidOwnerCount = daValidOwners.size;

  // #37 / T17 / F11: any qualifying bond (against a claim, or bond-first) escalates to auction.
  // Bond qualification is delegated to the resident #37 predicate — never a producer assertion.
  if (
    bond.bondAmountSats !== null &&
    bondQualifiesForEscalation(bond.bondAmountSats, bond.bondFloorSats).qualifies
  ) {
    return {
      outcome: "escalated",
      awarded: false,
      daValidOwnerCount,
      reason: "notice-window-qualifying-bond-escalates",
    };
  }

  // No qualifying bond: exactly one distinct-owner DA-valid claim finalizes; two or more nullify (a
  // bare collision can deny, never award); zero DA-valid claims leaves no owner (the name reopens).
  if (daValidOwnerCount === 1) {
    return {
      outcome: "finalized",
      awarded: true,
      daValidOwnerCount,
      reason: "notice-window-single-da-valid-claim-finalizes",
    };
  }
  if (daValidOwnerCount >= 2) {
    return reject("nullified", "notice-window-collision-bondless-nullifies", daValidOwnerCount);
  }
  return reject("nullified", "notice-window-no-da-valid-claim-no-owner", daValidOwnerCount);
}

// ---- Z9: the one-clock qualifying-bond in-window test (#73) ----

export type BondWindowVerdict = "in-window" | "out-of-window" | "boundary-unspecified" | "undecidable";

export interface BondWindowResult {
  readonly verdict: BondWindowVerdict;
  readonly reason: string;
}

/**
 * Decide whether a bond's mined height falls inside the notice window (Z9 / #49 S1). `bondMinedHeight`
 * MUST be the bond's RE-DERIVED height on the current canonical chain (the #49 S1 one-clock rule:
 * every deadline keys off the current best chain; reorgs re-derive; no receipt/first-seen time) — a
 * test reading a first-seen / superseded-chain height is non-conformant (Z9-neg-01).
 *
 * The exact notice-CLOSE edge (`h === anchorHeight + W_notice`) is the unruled PR-13/G4/F12 boundary
 * and is deliberately NOT decided here: it returns "boundary-unspecified" so no implementation
 * silently freezes the edge ahead of the spec ruling. Pure and total — malformed input fails closed to
 * "undecidable" and never throws.
 */
export function bondInNoticeWindow(
  bondMinedHeight: number,
  anchorHeight: number,
  noticeWindowBlocks: number
): BondWindowResult {
  if (!isSafeNonNegInt(bondMinedHeight) || !isSafeNonNegInt(anchorHeight) || !isPositiveSafeInt(noticeWindowBlocks)) {
    return { verdict: "undecidable", reason: "bond-window-input-malformed" };
  }
  const close = anchorHeight + noticeWindowBlocks;
  if (!Number.isSafeInteger(close)) {
    return { verdict: "undecidable", reason: "bond-window-close-overflow" };
  }
  if (bondMinedHeight === close) {
    return { verdict: "boundary-unspecified", reason: "bond-window-close-boundary-unspecified" };
  }
  if (bondMinedHeight >= anchorHeight && bondMinedHeight < close) {
    return { verdict: "in-window", reason: "bond-in-notice-window" };
  }
  return { verdict: "out-of-window", reason: "bond-outside-notice-window" };
}
