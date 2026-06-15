// D-SB-bind — served-bytes (data-availability) BINDING (B3, FREE; conforms to
// served-evidence-interface (#51) + commitment-match (#52) full-batch recompute).
// Produces the binding half of the ServedEvidence the kernel's da-verdict
// (includable / holdsPriority) consumes: the canonical served leaf SET recomputes
// to the anchor's committed root under batchSize, bound to one anchor. Non-deciding
// — it never calls or overrides the DA verdict.
//
// COMPLETENESS, not inclusion (CL r-on-00a7c5f): N membership proofs would only
// prove the presented leaves are members; a malicious witness could omit, duplicate,
// or hide a leaf and still pass. So D-SB-bind takes the canonical served key→value
// SET, requires distinct keys, RECOMPUTES the accumulator root of that exact set
// (the shared @ont/protocol fold, via @ont/evidence accumulatorRootOf), and requires
// it equals `anchoredRoot`. batchSize = the set's distinct-key count. This is PR-2's
// full-batch root recomputation.
//
// SPLIT (CL scope call (b)): the first-servable HEIGHT provenance (the §6c
// availability proof, #51 (iii)) is a separate sub-slice, D-SB-avail. D-SB-bind
// never accepts a bare/attested height — `toServedEvidence` consumes only a
// `VerifiedAvailabilityHeight`, the brand that the future D-SB-avail verifier mints
// after checking the height against confirmed-chain facts.
import { accumulatorRootOf } from "./membership.js";

import type { ServedEvidence } from "@ont/consensus";

const HEX_32 = /^[0-9a-f]{64}$/;

/** One served batch leaf: its committed (keyHex, valueHex), display/lowercase hex. */
export interface ServedLeaf {
  readonly keyHex: string;
  readonly valueHex: string;
}

/** The anchor facts the served bytes must reconstruct (D2/D8 binding). */
export interface AnchorBinding {
  readonly anchorHeight: number;
  readonly anchoredRoot: string;
}

/** The binding result: anchor-bound facts WITHOUT a height (that is D-SB-avail). */
export interface BoundServedBatch {
  readonly anchorHeight: number;
  readonly anchoredRoot: string;
  readonly batchSize: number;
}

/**
 * A first-servable height that the D-SB-avail verifier has checked against
 * confirmed-chain facts (#51 (iii)) — never producer-attested. Only that verifier
 * may mint it; D-SB-bind never accepts a bare number as a height.
 */
export type VerifiedAvailabilityHeight = number & {
  readonly __verifiedAvailability: unique symbol;
};

/**
 * Bind served bytes to an anchor by COMPLETENESS: the canonical served leaf set
 * must recompute to `anchoredRoot`. Throws on misuse — empty set, malformed hex,
 * duplicate served key, or a set whose accumulator root does not equal
 * `anchoredRoot` (omitted / hidden / extra leaf, or a wrong-size committed root).
 */
export function bindServedBytes(
  servedLeaves: readonly ServedLeaf[],
  anchor: AnchorBinding,
): BoundServedBatch {
  if (servedLeaves.length === 0) {
    throw new Error("@ont/evidence.bindServedBytes: empty served set");
  }
  const set = new Map<string, string>();
  for (const { keyHex, valueHex } of servedLeaves) {
    const k = keyHex.toLowerCase();
    const v = valueHex.toLowerCase();
    if (!HEX_32.test(k) || !HEX_32.test(v)) {
      throw new Error("@ont/evidence.bindServedBytes: served leaf must be 32-byte hex key/value");
    }
    if (set.has(k)) {
      throw new Error(`@ont/evidence.bindServedBytes: duplicate served key ${k}`);
    }
    set.set(k, v);
  }
  const recomputed = accumulatorRootOf(set);
  if (recomputed !== anchor.anchoredRoot.toLowerCase()) {
    throw new Error(
      "@ont/evidence.bindServedBytes: served set does not reconstruct anchoredRoot (incomplete/extra/hidden leaf)",
    );
  }
  return {
    anchorHeight: anchor.anchorHeight,
    anchoredRoot: anchor.anchoredRoot.toLowerCase(),
    batchSize: set.size,
  };
}

/**
 * Stamp a D-SB-avail-verified first-servable height onto a bound batch, producing
 * the kernel's `ServedEvidence`. The brand makes "the height was independently
 * verified" a type-level requirement — a bare number cannot reach this API.
 */
export function toServedEvidence(
  bound: BoundServedBatch,
  firstServableHeight: VerifiedAvailabilityHeight,
): ServedEvidence {
  return {
    anchorHeight: bound.anchorHeight,
    anchoredRoot: bound.anchoredRoot,
    batchSize: bound.batchSize,
    firstServableHeight,
  };
}
