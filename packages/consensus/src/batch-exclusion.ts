// B2 batch-exclusion locality predicate (B10 / D7 / DA §5). A PURE, total, closed-shape derivation of
// the per-name insertion provenance from a set of insert-only anchored batches, with a DA-excluded
// subset removed. It exists to make the EXCLUSION-LOCALITY / STATE-EQUIVALENCE property checkable:
// excluding a batch removes only that batch's own leaves, every other name is byte-identical, no
// already-final name is unseated, and the result equals the as-if-the-excluded-batch-never-anchored
// world.
//
// AUTHORITY (the ratified aspects):
//   - B10 / D7: a DA-excluded batch's claims vanish uniformly; exclusion removes only that batch's own
//     leaves and alters no other name; the resulting state equals the state computed as if the
//     excluded batch never existed.
//   - DA §5 / D7 attack flag: this rests on the INSERT-ONLY / commutative merge fact — a batch only
//     INSERTS names, never mutates an existing one. This predicate models exactly that and nothing
//     else; that insert-only invariant is a cross-area coupling the batched-path (B) area MUST hold
//     (if batches ever admit non-insert ops, exclusion stops being self-contained).
//
// #49-INDEPENDENT (the parking-rule boundary). The DA verdict enters as `excludedBatchIds` — an
// explicit CONSUMED witnessed input — never recomputed from a node's own local availability success
// (B10 attack flag: "the kernel must take the verdict as an explicit witnessed input"). No W/C/K here.
//
// DELIBERATELY EXCLUDED: finalization / collision / nullify (notice-window #69), first-anchor-wins
// reduction (A12, engine), occupancy takeover decisions (occupancy #71 / B7). `priorFinalNames` is a
// PRESERVATION fact, not a new occupancy reducer: a leaf targeting an already-final name is an
// insert-only no-op (it never appears as a fresh insertion and never unseats the final owner, per
// #26/B7) — this predicate does not re-decide takeover. Name bytes are caller-parsed canonical facts;
// the A6 name grammar is not re-opened here.
//
// Total / fail-closed + closed-shape (the #63-#71 discipline): malformed, extra-field, duplicate
// batchId, or duplicate/unknown excluded id fails closed (derived:false) and never throws — so the
// derivation can never become order-dependent or admit a producer-asserted exclusion. Determinism:
// names and contributing batch ids are emitted as sorted arrays (Map-internal, no prototype-key
// surprises).
//
// Rules: docs/core/B2_KERNEL_HARDENING.md B10 / D7; DECISIONS #26 (insertion-only anchors), DA §5.

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const isClosedShape = (obj: object, allowed: readonly string[]): boolean =>
  Object.keys(obj).every((key) => allowed.includes(key));
const isNonEmptyString = (x: unknown): x is string => typeof x === "string" && x.length > 0;

export interface BatchLeaf {
  /** A canonical name being inserted (caller-parsed; the A6 grammar is not re-checked here). */
  readonly name: string;
}

export interface InsertionBatch {
  readonly batchId: string;
  readonly leaves: readonly BatchLeaf[];
}

export interface BatchExclusionInput {
  /** The accepted anchored batches, each an insert-only set of name leaves. */
  readonly batches: readonly InsertionBatch[];
  /** The DA verdict's exclusions — a consumed witnessed input; each MUST reference an existing batch. */
  readonly excludedBatchIds: readonly string[];
  /** Names already final before this merge — preserved, never unseated (a preservation fact). */
  readonly priorFinalNames: readonly string[];
}

export interface BatchNameInsertion {
  readonly name: string;
  /** The non-excluded batch ids that inserted this name, sorted (deterministic). */
  readonly contributingBatchIds: readonly string[];
}

export interface BatchExclusionVerdict {
  /** False on malformed input (fail closed). */
  readonly derived: boolean;
  /** Per-name insertion provenance from the non-excluded batches, sorted by name; excludes final names. */
  readonly insertions: readonly BatchNameInsertion[];
  /** The already-final names, preserved (sorted) — none unseated by the merge. */
  readonly preservedFinalNames: readonly string[];
  /** Stable, rule-grounded reason code. */
  readonly reason: string;
}

const INPUT_KEYS = ["batches", "excludedBatchIds", "priorFinalNames"] as const;
const BATCH_KEYS = ["batchId", "leaves"] as const;
const LEAF_KEYS = ["name"] as const;

const fail = (reason: string): BatchExclusionVerdict => ({
  derived: false,
  insertions: [],
  preservedFinalNames: [],
  reason,
});

/**
 * Derive the per-name insertion provenance of `batches` with `excludedBatchIds` removed, preserving
 * `priorFinalNames`. Pure and total — malformed input fails closed (derived:false) and never throws.
 * The result is a deterministic, sorted projection so callers can prove the exclusion-locality /
 * state-equivalence property by comparing two derivations.
 */
export function deriveBatchedInsertions(input: BatchExclusionInput): BatchExclusionVerdict {
  const i = input as unknown;
  if (!isObject(i) || !isClosedShape(i, INPUT_KEYS)) {
    return fail("batch-exclusion-input-malformed");
  }
  if (!Array.isArray(i.batches) || !Array.isArray(i.excludedBatchIds) || !Array.isArray(i.priorFinalNames)) {
    return fail("batch-exclusion-input-malformed");
  }

  // Validate batches + collect unique batch ids (duplicate batchId fails closed — not order-dependent).
  const batchIds = new Set<string>();
  for (const batch of i.batches) {
    if (!isObject(batch) || !isClosedShape(batch, BATCH_KEYS) || !isNonEmptyString(batch.batchId) || !Array.isArray(batch.leaves)) {
      return fail("batch-exclusion-batch-malformed");
    }
    if (batchIds.has(batch.batchId)) {
      return fail("batch-exclusion-duplicate-batch-id");
    }
    batchIds.add(batch.batchId);
    for (const leaf of batch.leaves) {
      if (!isObject(leaf) || !isClosedShape(leaf, LEAF_KEYS) || !isNonEmptyString(leaf.name)) {
        return fail("batch-exclusion-leaf-malformed");
      }
    }
  }

  // Validate exclusions: unique, and every id must reference an existing batch (unknown fails closed).
  const excluded = new Set<string>();
  for (const id of i.excludedBatchIds) {
    if (!isNonEmptyString(id)) {
      return fail("batch-exclusion-excluded-id-malformed");
    }
    if (excluded.has(id)) {
      return fail("batch-exclusion-duplicate-excluded-id");
    }
    if (!batchIds.has(id)) {
      return fail("batch-exclusion-unknown-excluded-id");
    }
    excluded.add(id);
  }

  // Validate + collect the preserved final names.
  const finalNames = new Set<string>();
  for (const name of i.priorFinalNames) {
    if (!isNonEmptyString(name)) {
      return fail("batch-exclusion-final-name-malformed");
    }
    finalNames.add(name);
  }

  // Insert-only merge over the NON-excluded batches: group contributing batch ids per name. A leaf
  // targeting an already-final name is an insert-only no-op (preserved, never re-inserted; #26/B7).
  const perName = new Map<string, Set<string>>();
  for (const batch of i.batches as readonly InsertionBatch[]) {
    if (excluded.has(batch.batchId)) {
      continue;
    }
    for (const leaf of batch.leaves) {
      if (finalNames.has(leaf.name)) {
        continue;
      }
      let contributors = perName.get(leaf.name);
      if (contributors === undefined) {
        contributors = new Set<string>();
        perName.set(leaf.name, contributors);
      }
      contributors.add(batch.batchId);
    }
  }

  const insertions: BatchNameInsertion[] = [...perName.entries()]
    .map(([name, contributors]) => ({ name, contributingBatchIds: [...contributors].sort() }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  return {
    derived: true,
    insertions,
    preservedFinalNames: [...finalNames].sort(),
    reason: "batch-exclusion-derived",
  };
}
