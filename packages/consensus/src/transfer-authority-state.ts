// B2 transfer-authority-by-state predicate (X11). A PURE, total, closed-shape verdict: a Transfer has
// authority ONLY over a name in the `owned` lifecycle state; a Transfer against any non-owned state
// (provisional-in-notice / live-auction / nullified / broken-bond / nonexistent) has no authority and
// makes no state change.
//
// WHY A DEDICATED PREDICATE (not an engine binding): the engine's NameRecord.status enum
// (pending | immature | mature | invalid | unclaimed) collapses the X11 non-owned battery — live-auction,
// nullified, and broken-bond are not distinct record statuses — so `applyTransfer` cannot express the
// per-state battery cleanly. This pure lifecycle-state authority predicate states it directly; the
// engine binds it later.
//
// SCOPE: it consumes the RESOLVED `nameLifecycleState` (the caller composes notice-window #69 /
// auction #68 / bond-continuity-break #79 / occupancy #71 to resolve it). It does NOT decide the
// lifecycle state, verify the transfer signature, or model bond continuity. Recovery-pending is NOT a
// state here — the X13 transfer-block (engine, #67/PR-34) already owns that case; folding it in would
// double-own the invariant.
//
// Total / fail-closed + closed-shape (the #63-#79 discipline): an unknown lifecycle state, a non-object
// input, or any extra field (actor / signature / owner-key) is rejected (not transferable) and never
// throws — so no signer/authority field can ride the boundary to grant a transfer over a non-owned
// state.
//
// Rules: docs/core/B2_KERNEL_HARDENING.md X11 (transfer authority requires an owned state).

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const isClosedShape = (obj: object, allowed: readonly string[]): boolean =>
  Object.keys(obj).every((key) => allowed.includes(key));

export type NameLifecycleState =
  | "owned"
  | "provisional"
  | "live-auction"
  | "nullified"
  | "broken-bond"
  | "nonexistent";

const LIFECYCLE_STATES: readonly NameLifecycleState[] = [
  "owned",
  "provisional",
  "live-auction",
  "nullified",
  "broken-bond",
  "nonexistent",
];

export interface TransferAuthorityInput {
  /** The name's resolved lifecycle state (caller-composed; this predicate does not derive it). */
  readonly nameLifecycleState: NameLifecycleState;
}

export interface TransferAuthorityVerdict {
  /** True iff a Transfer has authority over the name — only the `owned` state is transferable. */
  readonly transferable: boolean;
  /** Stable, rule-grounded reason code. */
  readonly reason: string;
}

const INPUT_KEYS = ["nameLifecycleState"] as const;
const reject = (reason: string): TransferAuthorityVerdict => ({ transferable: false, reason });

/**
 * Decide whether a Transfer has authority given the name's resolved lifecycle state (X11). Pure and
 * total — a malformed input, an extra field (actor/signature/owner-key), or an unknown state is not
 * transferable and never throws. Transfer authority requires the `owned` state; every non-owned state
 * makes no state change.
 */
export function transferAuthorityByState(input: TransferAuthorityInput): TransferAuthorityVerdict {
  const i = input as unknown;
  if (!isObject(i) || !isClosedShape(i, INPUT_KEYS)) {
    // An actor / signature / owner-key field lands here — no such input channel grants authority.
    return reject("x11-input-malformed");
  }
  if (typeof i.nameLifecycleState !== "string" || !LIFECYCLE_STATES.includes(i.nameLifecycleState as NameLifecycleState)) {
    return reject("x11-unknown-lifecycle-state");
  }
  if (i.nameLifecycleState === "owned") {
    return { transferable: true, reason: "x11-owned-transferable" };
  }
  // provisional / live-auction / nullified / broken-bond / nonexistent — transfer authority requires
  // an owned state; a Transfer here makes no state change.
  return reject("x11-non-owned-state-no-transfer");
}
