import { describe, expect, it } from "vitest";

import {
  BATCH_COMPLETENESS_CONFORMANCE_MATRIX,
  DCV_ANCHOR_COORDINATE_KEYS,
  DCV_BASE_RELATIONSHIP_KEYS,
  DCV_CLOSED_LEAF_PROJECTION_KEYS,
  evaluateBatchCompleteness,
  isClosedDcvProjection,
  type BatchCompletenessCaseOwner,
  type BatchCompletenessLeafWitness,
  type BatchCompletenessPredicateInput,
  type DcvAnchorCoordinates,
  type DcvBaseRootRelationship,
  type DcvClosedLeafProjection,
  type DcvDaVerdict,
  type DcvOwnerIdentity,
} from "./batch-exclusion.js";

const expectedCaseIds = [
  "bc.full-n-required",
  "bc.hidden-claim-no-effect",
  "bc.mirror-lies-fail",
  "bc.projection-carries-owner",
  "bc.copied-anchor-grief-not-steal",
  "bc.finalize-once",
  "bc.exact-n-no-extras",
  "bc.replay-from-base",
  "bc.one-bad-leaf-poisons-batch",
  "bc.partial-timing",
  "bc.reorg-remine",
  "bc.projection-closure",
] as const;

const projectionFixture = (): DcvClosedLeafProjection => ({
  name: "alice",
  leafKeyHex: "aa".repeat(32),
  owner: { kind: "owner-key", ownerKeyHex: "11".repeat(32) },
  ownerValueBindingHex: "22".repeat(32),
  anchor: {
    txid: "33".repeat(32),
    minedHeight: 100,
    txIndex: 2,
    vout: 1,
    anchorInstance: 0,
  },
  batchId: "batch-a",
  batchLocalIndex: 0,
  duplicateHandling: "unique",
  daVerdict: {
    kind: "includable",
    firstCompleteServedHeight: 103,
    holdsPriority: true,
  },
  base: {
    prevRoot: "44".repeat(32),
    baseRootHeight: 94,
  },
});

// ---- Slice-2 conformance fixtures ----------------------------------------
// A happy-path full-N batch (2 leaves, batchSize 2). Each vector below clones
// this and mutates only the field its case exercises. All assertions are RED
// against the sentinel `evaluateBatchCompleteness` until the slice-4 replay
// conjunct lands (tests-first red battery); the two `target: "projection"`
// cases bind to the resident `isClosedDcvProjection` gate and are green now.
const OWNER_A: DcvOwnerIdentity = { kind: "owner-key", ownerKeyHex: "11".repeat(32) };
const OWNER_B: DcvOwnerIdentity = { kind: "owner-key", ownerKeyHex: "12".repeat(32) };
const ANCHOR_A: DcvAnchorCoordinates = { txid: "33".repeat(32), minedHeight: 100, txIndex: 2, vout: 1, anchorInstance: 0 };
const BASE_A: DcvBaseRootRelationship = { prevRoot: "44".repeat(32), baseRootHeight: 94 };
const DA_INCLUDABLE: DcvDaVerdict = { kind: "includable", firstCompleteServedHeight: 103, holdsPriority: true };

function leafWitness(opts: {
  name: string;
  leafKeyHex: string;
  index: number;
  valueHex: string;
  owner?: DcvOwnerIdentity;
  servedHeight?: number | null;
  ownerValueBindingHex?: string;
}): BatchCompletenessLeafWitness {
  return {
    projection: {
      name: opts.name,
      leafKeyHex: opts.leafKeyHex,
      owner: opts.owner ?? OWNER_A,
      ownerValueBindingHex: opts.ownerValueBindingHex ?? "22".repeat(32),
      anchor: ANCHOR_A,
      batchId: "batch-a",
      batchLocalIndex: opts.index,
      duplicateHandling: "unique",
      daVerdict: DA_INCLUDABLE,
      base: BASE_A,
    },
    valueHex: opts.valueHex,
    servedHeight: opts.servedHeight ?? 101,
  };
}

// A valid full-N input: 2 served leaves matching batchSize 2, all within window.
function baseInput(): BatchCompletenessPredicateInput {
  return {
    commitment: { prevRoot: "44".repeat(32), newRoot: "55".repeat(32), batchSize: 2 },
    base: BASE_A,
    baseLeaves: [],
    window: { W: 2, C: 3, availabilityDeadlineHeight: 102, challengeDeadlineHeight: 105 },
    daVerdict: DA_INCLUDABLE,
    priorSettledVerdict: null,
    batches: [
      {
        batchId: "batch-a",
        anchor: ANCHOR_A,
        leaves: [
          leafWitness({ name: "alice", leafKeyHex: "aa".repeat(32), index: 0, valueHex: "66".repeat(32), owner: OWNER_A }),
          leafWitness({ name: "bob", leafKeyHex: "bb".repeat(32), index: 1, valueHex: "77".repeat(32), owner: OWNER_B }),
        ],
      },
    ],
  };
}

// Helpers to clone the single base batch while mutating its leaves.
function withLeaves(input: BatchCompletenessPredicateInput, leaves: readonly BatchCompletenessLeafWitness[]): BatchCompletenessPredicateInput {
  return { ...input, batches: [{ ...input.batches[0]!, leaves }] };
}

function ownerCounts(): Record<BatchCompletenessCaseOwner, number> {
  const counts: Record<BatchCompletenessCaseOwner, number> = {
    "batch-completeness": 0,
    "bond-notice-guard": 0,
    "da-trust-model": 0,
    "served-bytes-da-windows": 0,
  };
  for (const vector of BATCH_COMPLETENESS_CONFORMANCE_MATRIX) {
    counts[vector.owner] += 1;
  }
  return counts;
}

describe("batch-completeness (#83) conformance matrix scaffold", () => {
  it("pins the ratified 12-case inventory in order", () => {
    expect(BATCH_COMPLETENESS_CONFORMANCE_MATRIX.map((vector) => vector.id)).toEqual(expectedCaseIds);
    expect(new Set(BATCH_COMPLETENESS_CONFORMANCE_MATRIX.map((vector) => vector.id)).size).toBe(12);
  });

  it("keeps owned vs inherited cases explicit", () => {
    expect(ownerCounts()).toEqual({
      "batch-completeness": 6,
      "bond-notice-guard": 1,
      "da-trust-model": 2,
      "served-bytes-da-windows": 3,
    });
  });

  it("pins the reviewer ruling that batchSize=0/no-op is rejected", () => {
    expect(BATCH_COMPLETENESS_CONFORMANCE_MATRIX.find((vector) => vector.id === "bc.exact-n-no-extras")?.title).toContain(
      "batchSize=0/no-op rejected",
    );
  });

  // The 12 conformance vectors. RED against the sentinel until the slice-4 replay
  // conjunct lands (except the two projection-gate cases, which are green now).
  it("bc.full-n-required: full N accepts; a missing leaf (N-1) fails the batch closed", () => {
    expect(evaluateBatchCompleteness(baseInput())).toEqual({ accepts: true, reason: "batch-completeness-accepted" });
    const i = baseInput();
    const nMinus1 = withLeaves(i, [i.batches[0]!.leaves[0]!]); // served 1 vs batchSize 2
    expect(evaluateBatchCompleteness(nMinus1)).toEqual({ accepts: false, reason: "batch-completeness-count-mismatch" });
  });

  it("bc.hidden-claim-no-effect: a DA-excluded (withheld) batch has no completeness effect", () => {
    const excluded: BatchCompletenessPredicateInput = {
      ...baseInput(),
      daVerdict: { kind: "excluded", firstCompleteServedHeight: null, holdsPriority: false },
    };
    expect(evaluateBatchCompleteness(excluded)).toEqual({ accepts: false, reason: "batch-completeness-da-excluded" });
  });

  it("bc.mirror-lies-fail: served bytes that do not recompute newRoot are rejected", () => {
    const i = baseInput();
    const tampered = withLeaves(i, [{ ...i.batches[0]!.leaves[0]!, valueHex: "de".repeat(32) }, i.batches[0]!.leaves[1]!]);
    expect(evaluateBatchCompleteness(tampered)).toEqual({ accepts: false, reason: "batch-completeness-replay-mismatch" });
  });

  it("bc.projection-carries-owner: the closed projection carries owner identity (green via the gate)", () => {
    const p = projectionFixture();
    expect(isClosedDcvProjection(p)).toBe(true);
    // Owner material stripped → the projection is open/invalid → rejected.
    expect(isClosedDcvProjection({ ...p, owner: { kind: "owner-key" } })).toBe(false);
    // The gate admits distinguishing same-owner-duplicate from distinct-owner-contested.
    expect(isClosedDcvProjection({ ...p, duplicateHandling: "distinct-owner-contested" })).toBe(true);
    expect(isClosedDcvProjection({ ...p, duplicateHandling: "same-owner-duplicate" })).toBe(true);
  });

  it("bc.copied-anchor-grief-not-steal: a copied/relocated anchor (stale coords) fails closed", () => {
    const i = baseInput();
    const copied: BatchCompletenessPredicateInput = {
      ...i,
      batches: [{ ...i.batches[0]!, anchor: { ...ANCHOR_A, txid: "ee".repeat(32), minedHeight: 200 } }],
    };
    expect(evaluateBatchCompleteness(copied)).toEqual({ accepts: false, reason: "batch-completeness-stale-anchor" });
  });

  it("bc.finalize-once: an already-settled accept is preserved despite later byte-loss", () => {
    const i = baseInput();
    const withPrior: BatchCompletenessPredicateInput = {
      ...withLeaves(i, [{ ...i.batches[0]!.leaves[0]!, servedHeight: null }, i.batches[0]!.leaves[1]!]),
      priorSettledVerdict: { accepts: true, reason: "batch-completeness-accepted", settledAtHeight: 105 },
    };
    expect(evaluateBatchCompleteness(withPrior)).toEqual({ accepts: true, reason: "batch-completeness-accepted" });
  });

  it("bc.exact-n-no-extras: N+1, duplicate leaf key, and batchSize=0/no-op all fail closed", () => {
    const i1 = baseInput();
    const extra = withLeaves(i1, [
      ...i1.batches[0]!.leaves,
      leafWitness({ name: "carol", leafKeyHex: "cc".repeat(32), index: 2, valueHex: "88".repeat(32) }),
    ]);
    expect(evaluateBatchCompleteness(extra)).toEqual({ accepts: false, reason: "batch-completeness-count-mismatch" });

    const i2 = baseInput();
    const dupKey = withLeaves(i2, [
      i2.batches[0]!.leaves[0]!,
      { ...i2.batches[0]!.leaves[1]!, projection: { ...i2.batches[0]!.leaves[1]!.projection, leafKeyHex: "aa".repeat(32) } },
    ]);
    expect(evaluateBatchCompleteness(dupKey)).toEqual({ accepts: false, reason: "batch-completeness-duplicate-leaf-key" });

    const i3 = baseInput();
    const zero: BatchCompletenessPredicateInput = {
      ...withLeaves(i3, []),
      commitment: { ...i3.commitment, batchSize: 0 },
    };
    expect(evaluateBatchCompleteness(zero)).toEqual({ accepts: false, reason: "batch-completeness-zero-or-noop-anchor" });
  });

  it("bc.replay-from-base: leaves that cannot replay prevRoot->newRoot fail (all N, not these N)", () => {
    const wrongBase: BatchCompletenessPredicateInput = {
      ...baseInput(),
      base: { ...BASE_A, prevRoot: "99".repeat(32) }, // inconsistent base → cannot replay onto the committed prefix
    };
    expect(evaluateBatchCompleteness(wrongBase)).toEqual({ accepts: false, reason: "batch-completeness-replay-mismatch" });
  });

  it("bc.one-bad-leaf-poisons-batch: a single invalid owner binding fails the WHOLE batch, not N-1", () => {
    const i = baseInput();
    const badLeaf = withLeaves(i, [
      i.batches[0]!.leaves[0]!,
      { ...i.batches[0]!.leaves[1]!, projection: { ...i.batches[0]!.leaves[1]!.projection, ownerValueBindingHex: "00".repeat(32) } },
    ]);
    expect(evaluateBatchCompleteness(badLeaf)).toEqual({ accepts: false, reason: "batch-completeness-owner-binding-invalid" });
  });

  it("bc.partial-timing: the last leaf served after h+W+C excludes the whole batch (late)", () => {
    const i = baseInput();
    const late = withLeaves(i, [i.batches[0]!.leaves[0]!, { ...i.batches[0]!.leaves[1]!, servedHeight: 106 }]); // > challengeDeadline 105
    expect(evaluateBatchCompleteness(late)).toEqual({ accepts: false, reason: "batch-completeness-late" });
  });

  it("bc.reorg-remine: evidence bound to a stale base height after re-mine fails closed", () => {
    const remined: BatchCompletenessPredicateInput = {
      ...baseInput(),
      base: { ...BASE_A, baseRootHeight: 50 }, // stale: not anchor.minedHeight - K on the canonical chain
    };
    expect(evaluateBatchCompleteness(remined)).toEqual({ accepts: false, reason: "batch-completeness-stale-anchor" });
  });

  it("bc.projection-closure: open/incomplete projections are rejected by the closed-shape gate (green)", () => {
    const p = projectionFixture();
    const { base: _omitBase, ...missingBase } = p;
    expect(isClosedDcvProjection(missingBase)).toBe(false);
    expect(isClosedDcvProjection({ ...p, anchor: { ...p.anchor, txid: "" } })).toBe(false);
    expect(isClosedDcvProjection({ ...p, daVerdict: { kind: "includable", firstCompleteServedHeight: 1 } })).toBe(false);
  });

  it("pins the exact-delta completeness predicate signature as a sentinel API", () => {
    const projection = projectionFixture();
    const input: BatchCompletenessPredicateInput = {
      commitment: {
        prevRoot: "44".repeat(32),
        newRoot: "55".repeat(32),
        batchSize: 1,
      },
      base: projection.base,
      baseLeaves: [],
      window: {
        W: 2,
        C: 3,
        availabilityDeadlineHeight: 102,
        challengeDeadlineHeight: 105,
      },
      daVerdict: projection.daVerdict,
      priorSettledVerdict: null,
      batches: [
        {
          batchId: "batch-a",
          anchor: projection.anchor,
          leaves: [{ projection, valueHex: "66".repeat(32), servedHeight: 101 }],
        },
      ],
    };

    expect(evaluateBatchCompleteness(input)).toEqual({
      accepts: false,
      reason: "batch-completeness-not-implemented",
    });
  });
});

describe("D-CV closed projection shape scaffold", () => {
  it("lists the required projection field groups", () => {
    expect(DCV_CLOSED_LEAF_PROJECTION_KEYS).toEqual([
      "name",
      "leafKeyHex",
      "owner",
      "ownerValueBindingHex",
      "anchor",
      "batchId",
      "batchLocalIndex",
      "duplicateHandling",
      "daVerdict",
      "base",
    ]);
    expect(DCV_ANCHOR_COORDINATE_KEYS).toEqual(["txid", "minedHeight", "txIndex", "vout", "anchorInstance"]);
    expect(DCV_BASE_RELATIONSHIP_KEYS).toEqual(["prevRoot", "baseRootHeight"]);
  });

  it("can represent owner identity, anchor coordinates, DA verdict, duplicate handling, and base root", () => {
    const projection = projectionFixture();

    expect(Object.keys(projection).sort()).toEqual([...DCV_CLOSED_LEAF_PROJECTION_KEYS].sort());
    expect(Object.keys(projection.anchor).sort()).toEqual([...DCV_ANCHOR_COORDINATE_KEYS].sort());
    expect(Object.keys(projection.base).sort()).toEqual([...DCV_BASE_RELATIONSHIP_KEYS].sort());
  });

  it("rejects producer-asserted completeness or other open projection fields", () => {
    const projection = projectionFixture();
    expect(isClosedDcvProjection(projection)).toBe(true);
    expect(isClosedDcvProjection({ ...projection, complete: true })).toBe(false);
    expect(isClosedDcvProjection({ ...projection, owner: { kind: "owner-key" } })).toBe(false);
  });
});
