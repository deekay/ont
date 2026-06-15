// D-SB-bind — served-bytes (data-availability) BINDING (B3, FREE; conforms to
// served-evidence-interface (#51), commitment-match (#52) full-batch recompute,
// root-chain-linkage (#53), and the WIRE §4.4 anchor surface prevRoot|newRoot|
// batchSize). Produces the binding half of the ServedEvidence the kernel's
// da-verdict (includable / holdsPriority) consumes. Non-deciding — it never calls
// or overrides the DA verdict.
//
// prevRoot → newRoot, NOT from-empty (CL r-on-244fe9d): the anchor commits
// `newRoot` as the result of applying THIS batch's delta leaves onto `prevRoot`
// (= R_{h-K}, #53). So the binding takes the verified base accumulator state, checks
// its root equals `prevRoot`, requires the served delta to be insert-only (keys
// disjoint from the base, per the batched-path insert-only merge — DA agreement
// §5 / D7), recomputes
// `newRoot = root(base ∪ servedDelta)` and requires it equals `anchoredRoot`.
// `batchSize` = the served delta's distinct-key count. This is PR-2's full-batch
// recomputation from prevRoot; a from-empty recompute would reject every valid
// non-genesis batch.
//
// BASE STATE: `baseLeaves` is the verified base accumulator state whose root is
// `prevRoot`. Modeled here as the prior committed leaf set; how the base is
// *provisioned* in production (full set vs a sibling-path snapshot) is a D-CV
// concern — D-SB-bind only enforces the prevRoot→newRoot delta binding.
//
// SPLIT (CL scope (b)): first-servable HEIGHT provenance (the §6c availability
// proof, #51 (iii)) is the separate D-SB-avail sub-slice. D-SB-bind never accepts a
// bare/attested height — `toServedEvidence` consumes only a `VerifiedAvailabilityHeight`,
// the brand the future D-SB-avail verifier mints.
import { accumulatorRootOf } from "./membership.js";

import type { ServedEvidence } from "@ont/consensus";

const HEX_32 = /^[0-9a-f]{64}$/;

/** One served batch leaf: its committed (keyHex, valueHex), lowercase hex. */
export interface ServedLeaf {
  readonly keyHex: string;
  readonly valueHex: string;
}

/** The ratified anchor surface the served bytes must reconstruct (WIRE §4.4 / #53). */
export interface ServedBatchBinding {
  readonly anchorHeight: number;
  /** R_{h-K}: the base root this batch's delta applies onto (#53). */
  readonly prevRoot: string;
  /** newRoot: the root the anchor commits after applying the delta. */
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

function toSet(leaves: readonly ServedLeaf[], label: string): Map<string, string> {
  const set = new Map<string, string>();
  for (const { keyHex, valueHex } of leaves) {
    const k = keyHex.toLowerCase();
    const v = valueHex.toLowerCase();
    if (!HEX_32.test(k) || !HEX_32.test(v)) {
      throw new Error(`@ont/evidence.bindServedBytes: ${label} leaf must be 32-byte hex key/value`);
    }
    if (set.has(k)) {
      throw new Error(`@ont/evidence.bindServedBytes: duplicate ${label} key ${k}`);
    }
    set.set(k, v);
  }
  return set;
}

/**
 * Bind served bytes to an anchor through `prevRoot → newRoot`. `baseLeaves` is the
 * verified base accumulator state (its root must equal `binding.prevRoot`); the
 * served delta must be non-empty, insert-only (keys disjoint from the base), and
 * `root(base ∪ delta)` must equal `binding.anchoredRoot`. Throws on any mismatch —
 * stale/wrong prevRoot, non-disjoint delta, or an omitted / extra / hidden leaf.
 */
export function bindServedBytes(
  baseLeaves: ReadonlyMap<string, string>,
  servedDelta: readonly ServedLeaf[],
  binding: ServedBatchBinding,
): BoundServedBatch {
  if (servedDelta.length === 0) {
    throw new Error("@ont/evidence.bindServedBytes: empty served delta");
  }
  // (1) the base state must match the anchor's prevRoot.
  if (accumulatorRootOf(baseLeaves) !== binding.prevRoot.toLowerCase()) {
    throw new Error("@ont/evidence.bindServedBytes: base state does not match prevRoot");
  }
  // (2) the served delta is well-formed and insert-only (disjoint from the base).
  const delta = toSet(servedDelta, "served");
  const union = new Map(baseLeaves);
  for (const [k, v] of delta) {
    if (union.has(k)) {
      throw new Error(`@ont/evidence.bindServedBytes: served key ${k} already in the base (not insert-only)`);
    }
    union.set(k, v);
  }
  // (3) newRoot = root(base ∪ delta) must equal the anchor's committed root.
  if (accumulatorRootOf(union) !== binding.anchoredRoot.toLowerCase()) {
    throw new Error(
      "@ont/evidence.bindServedBytes: prevRoot+delta does not reconstruct anchoredRoot (incomplete/extra/hidden leaf)",
    );
  }
  return {
    anchorHeight: binding.anchorHeight,
    anchoredRoot: binding.anchoredRoot.toLowerCase(),
    batchSize: delta.size,
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
