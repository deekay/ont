// B2 window-schedule predicate (B22 / Z11). A PURE, total, closed-shape verdict: a lifecycle window's
// length is a function of the anchor height + a frozen, height-keyed schedule ONLY, with an
// extend-only adaptive adjustment. It exists to make the "no market-derived window shrink" property
// checkable by construction.
//
// AUTHORITY (the ratified aspects):
//   - B22: the window function's only inputs are anchor height + frozen schedule constants; any
//     market / state-derived signal (claim volume, bond totals, distinct keys, "market maturity")
//     that would SHORTEN a window is rejected by construction.
//   - Z11: blocks = max-with-the-height-keyed-floor: a computed window shorter than
//     height_keyed_floor(anchorHeight) driven by any market signal is rejected; windows reduce only
//     by passage of block height (the deterministic, frozen height schedule); adaptive behavior is
//     EXTEND-ONLY.
//
// HOW "no market shrink" is enforced by construction (not by a runtime market check):
//   - There is NO market-signal input channel: the input is closed-shape at the top level AND inside
//     `floorConstants` / each segment, so a market field (claimVolume, bondTotals, distinctKeys,
//     marketMaturity, …) is rejected, never read.
//   - The adaptive adjustment is EXTEND-ONLY: a present `adaptiveExtensionBlocks` must be a safe
//     nonnegative integer; a negative (shrink) request fails closed (window-schedule-shrink-rejected)
//     rather than being silently normalized to 0. The result is always `>= floorBlocks`.
//   - The floor is a deterministic function of anchor height over a frozen, value-free schedule
//     (a height-keyed segment table); the concrete launch schedule VALUES remain launch-freeze.
//
// DELIBERATELY EXCLUDED: the concrete launch schedule values (launch-freeze; the schedule enters as
// caller-supplied frozen constants, tested at >=2 constant sets so no value is baked); which specific
// lifecycle window (notice / auction / DA) a caller computes (this is the shared schedule shape, not
// a per-window policy). Total / fail-closed + closed-shape (the #63-#73 discipline): malformed,
// extra-field, unordered-segment, negative/non-int extension, or overflow input fails closed
// (computed:false, blocks/floorBlocks null) and never throws.
//
// Rules: docs/core/B2_KERNEL_HARDENING.md B22 / Z11; DECISIONS — windows reduce only by block height.

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const isClosedShape = (obj: object, allowed: readonly string[]): boolean =>
  Object.keys(obj).every((key) => allowed.includes(key));
const isSafeNonNegInt = (x: unknown): x is number =>
  typeof x === "number" && Number.isSafeInteger(x) && x >= 0;

export interface WindowFloorSegment {
  /** Inclusive lower height bound at which this floor takes effect. */
  readonly fromHeight: number;
  /** The height-keyed floor window length (blocks) from `fromHeight` onward, until the next segment. */
  readonly floorBlocks: number;
}

export interface WindowFloorConstants {
  /**
   * The frozen, value-free height-keyed floor schedule: a non-empty list of segments STRICTLY
   * ascending by `fromHeight`. The floor at an anchor height is the `floorBlocks` of the last segment
   * whose `fromHeight <= anchorHeight`. Concrete values are launch-freeze.
   */
  readonly segments: readonly WindowFloorSegment[];
}

export interface WindowScheduleInput {
  readonly anchorHeight: number;
  readonly floorConstants: WindowFloorConstants;
  /** An EXTEND-ONLY adjustment (safe nonnegative integer). Absent = 0; a negative value fails closed. */
  readonly adaptiveExtensionBlocks?: number;
}

export interface WindowScheduleVerdict {
  /** False on malformed input (fail closed). */
  readonly computed: boolean;
  /** The computed window length (floor + extension), or null on malformed input. */
  readonly blocks: number | null;
  /** The height-keyed floor used, or null on malformed input. */
  readonly floorBlocks: number | null;
  /** Stable, rule-grounded reason code. */
  readonly reason: string;
}

const INPUT_KEYS = ["anchorHeight", "floorConstants", "adaptiveExtensionBlocks"] as const;
const FLOOR_CONSTANTS_KEYS = ["segments"] as const;
const SEGMENT_KEYS = ["fromHeight", "floorBlocks"] as const;

const fail = (reason: string): WindowScheduleVerdict => ({ computed: false, blocks: null, floorBlocks: null, reason });

/**
 * Compute a lifecycle window's length from the anchor height + a frozen height-keyed floor schedule,
 * plus an extend-only adaptive adjustment. Pure and total — malformed input fails closed
 * (computed:false) and never throws. By construction there is no market-signal input channel and the
 * adjustment can only extend, so `blocks >= floorBlocks` always holds.
 */
export function windowSchedule(input: WindowScheduleInput): WindowScheduleVerdict {
  const i = input as unknown;
  if (!isObject(i) || !isClosedShape(i, INPUT_KEYS)) {
    // A market-derived field (claimVolume, bondTotals, distinctKeys, marketMaturity, …) lands here —
    // there is no input channel for it.
    return fail("window-schedule-input-malformed");
  }
  if (!isSafeNonNegInt(i.anchorHeight)) {
    return fail("window-schedule-anchor-height-malformed");
  }
  const fc = i.floorConstants;
  if (!isObject(fc) || !isClosedShape(fc, FLOOR_CONSTANTS_KEYS)) {
    // A market field smuggled INSIDE floorConstants is rejected here.
    return fail("window-schedule-floor-constants-malformed");
  }
  if (!Array.isArray(fc.segments) || fc.segments.length === 0) {
    return fail("window-schedule-segments-malformed");
  }
  let previousFrom = -1;
  for (const segment of fc.segments) {
    if (
      !isObject(segment) ||
      !isClosedShape(segment, SEGMENT_KEYS) ||
      !isSafeNonNegInt(segment.fromHeight) ||
      !isSafeNonNegInt(segment.floorBlocks)
    ) {
      return fail("window-schedule-segment-malformed");
    }
    // Strictly ascending fromHeight — an unordered or duplicate schedule is non-deterministic, reject.
    if (segment.fromHeight <= previousFrom) {
      return fail("window-schedule-segments-unordered");
    }
    previousFrom = segment.fromHeight;
  }

  // The adaptive adjustment is EXTEND-ONLY. Absent = 0; a present value must be a safe nonnegative
  // integer — a negative (shrink) request fails closed rather than being normalized to 0.
  let extension = 0;
  if (i.adaptiveExtensionBlocks !== undefined) {
    const ext = i.adaptiveExtensionBlocks;
    if (typeof ext !== "number" || !Number.isSafeInteger(ext)) {
      return fail("window-schedule-extension-malformed");
    }
    if (ext < 0) {
      return fail("window-schedule-shrink-rejected");
    }
    extension = ext;
  }

  // The height-keyed floor: the last segment whose fromHeight <= anchorHeight. If none applies (the
  // anchor precedes the schedule's first segment), fail closed.
  let floorBlocks: number | null = null;
  for (const segment of fc.segments as readonly WindowFloorSegment[]) {
    if (segment.fromHeight <= i.anchorHeight) {
      floorBlocks = segment.floorBlocks;
    } else {
      break; // ascending — no later segment applies
    }
  }
  if (floorBlocks === null) {
    return fail("window-schedule-no-applicable-floor");
  }

  const blocks = floorBlocks + extension;
  if (!Number.isSafeInteger(blocks)) {
    return fail("window-schedule-overflow");
  }
  // Extend-only: blocks >= floorBlocks by construction (extension >= 0).
  return { computed: true, blocks, floorBlocks, reason: "window-schedule-computed" };
}
