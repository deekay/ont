// B2 name-occupancy predicate (A11 / #26 / D10). A PURE, total, closed-shape verdict: it decides
// whether an anchored batch may insert a fresh claim for a name, given the name's resolved governing
// occupancy. Anchored batches are insertion-only — a batched claim MUST NOT take a name that is
// already FINAL, and an accepted anchor carries no authorization to change any name's owner, value
// records, or transfer state (#26).
//
// THE A11 CRUX (A11-pos-01): occupancy is enforced over POST-DA-VERDICT state. A name "inserted" only
// by a later-FORFEITED (DA-failed) batch does NOT occupy it — that forfeited insertion must not block
// honest re-claiming (D10: a DA-failed claim counts for no lifecycle purpose). Only a name held by a
// DA-valid FINAL owner blocks a fresh insertion.
//
// #49-INDEPENDENT (the parking-rule boundary, same discipline as notice-window). The predicate
// consumes the name's RESOLVED governing occupancy as a fact — the caller (engine) has already
// composed the DA verdict (da-verdict.ts) and the lifecycle verdict (notice-window / auction) and
// reduced any multiple prior insertions (first-anchor-wins, A12) into ONE governing occupancy. This
// predicate never recomputes W/C/K and never reduces insertions itself.
//
// The occupancy kinds this gate accepts as a governing fact are deliberately narrow:
//   - "forfeited"               — a DA-decided non-priority prior insertion (does not occupy).
//   - "contestable-provisional" — the caller has established this candidate is inside the live
//                                 competition window (a fresh competing insertion is admitted here;
//                                 the collision / finalize / nullify outcome is notice-window #69's).
//   - "final"                   — a DA-valid finalized owner holds the name (blocks: no takeover).
// Auction-pending and nullified-reopen states are NOT mapped to an admitting kind here; a reducer
// must deliberately introduce a future occupancy kind for them — they are not silently insertable.
//
// DELIBERATELY EXCLUDED: reducing multiple prior insertions into the governing occupancy (engine
// first-anchor-wins, A12); how the DA verdict / finality were computed (da-verdict + notice-window /
// auction, upstream); the competing-claim nullify / finalize outcome (notice-window #69); and
// non-canonical-name-byte rejection (A6 — a separate A-area name-canonicalization concern). The
// verdict carries ONLY an admit/refuse decision and a classification — there is no owner/value/
// transfer field, so the predicate is structurally insertion-only (no mutation path).
//
// Total / fail-closed + closed-shape (the #63-#70 discipline): malformed, unknown-kind, or
// extra-field input fails closed to a non-admitting "undecidable" verdict and never throws — no
// producer-asserted occupancy outside the three resolved kinds is admitted as authority.
//
// Rules: docs/core/B2_KERNEL_HARDENING.md A11; DECISIONS #26 (insertion-only anchors), #37/#47/#49
// (the upstream DA/lifecycle resolution this consumes), PR-6/first-anchor-wins (A12, the reduction).

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const isClosedShape = (obj: object, allowed: readonly string[]): boolean =>
  Object.keys(obj).every((key) => allowed.includes(key));

export type NameOccupancyKind = "forfeited" | "contestable-provisional" | "final";

export interface PriorOccupancy {
  readonly kind: NameOccupancyKind;
}

export interface OccupancyInput {
  /** The name's resolved governing occupancy, or null when the name has none (unoccupied / reopened). */
  readonly priorOccupancy: PriorOccupancy | null;
}

export type OccupancyResolution =
  | "unoccupied"
  | "forfeited"
  | "contestable-provisional"
  | "final"
  | "undecidable";

export interface OccupancyVerdict {
  /** True iff a fresh batched claim may be inserted for the name. */
  readonly admitsInsertion: boolean;
  /** The resolved occupancy classification the decision used. */
  readonly occupancy: OccupancyResolution;
  /** Stable, rule-grounded reason code. */
  readonly reason: string;
}

const INPUT_KEYS = ["priorOccupancy"] as const;
const PRIOR_OCCUPANCY_KEYS = ["kind"] as const;
const OCCUPANCY_KINDS: readonly NameOccupancyKind[] = ["forfeited", "contestable-provisional", "final"];

const undecidable = (reason: string): OccupancyVerdict => ({
  admitsInsertion: false,
  occupancy: "undecidable",
  reason,
});

/**
 * Decide whether an anchored batch may insert a fresh claim for a name, given its resolved governing
 * occupancy (A11). Pure and total — malformed input fails closed (no insertion) and never throws.
 * Insertion-only: the verdict carries no owner/value/transfer mutation, only an admit/refuse decision.
 */
export function resolveNameOccupancy(input: OccupancyInput): OccupancyVerdict {
  const i = input as unknown;
  if (!isObject(i) || !isClosedShape(i, INPUT_KEYS)) {
    return undecidable("occupancy-input-malformed");
  }
  const prior = i.priorOccupancy;

  // No governing occupancy: the name is unoccupied (never claimed, or fully reopened) — admit.
  if (prior === null) {
    return { admitsInsertion: true, occupancy: "unoccupied", reason: "occupancy-unoccupied-fresh-insertion" };
  }
  if (!isObject(prior) || !isClosedShape(prior, PRIOR_OCCUPANCY_KEYS) || !OCCUPANCY_KINDS.includes(prior.kind as NameOccupancyKind)) {
    return undecidable("occupancy-prior-malformed");
  }

  switch (prior.kind as NameOccupancyKind) {
    case "forfeited":
      // The A11-pos-01 crux: a DA-failed prior insertion does not occupy — honest re-claim admitted.
      return {
        admitsInsertion: true,
        occupancy: "forfeited",
        reason: "occupancy-forfeited-da-failed-does-not-block-reclaim",
      };
    case "contestable-provisional":
      // A live-window competing insertion is admitted here; the collision outcome is notice-window's.
      return {
        admitsInsertion: true,
        occupancy: "contestable-provisional",
        reason: "occupancy-contestable-provisional-competing-insertion",
      };
    case "final":
      // Insertion-only: a name already final blocks a fresh claim; the existing owner is unchanged.
      return {
        admitsInsertion: false,
        occupancy: "final",
        reason: "occupancy-name-already-final-no-takeover",
      };
  }
}
