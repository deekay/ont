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
import { accumulatorRootOf } from "@ont/protocol";
import { resolveNoticeWindow } from "./notice-window.js";

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
// Agrees with the happy-path served heights (101): firstCompleteServedHeight === maxServed, and
// holdsPriority === (101 <= availabilityDeadline 102). The slice-4 timing-consistency conjunct
// rejects a verdict that disagrees with its own served-height facts, so the fixture must be honest.
const DA_INCLUDABLE: DcvDaVerdict = { kind: "includable", firstCompleteServedHeight: 101, holdsPriority: true };

// Real D-CV roots, computed via the @ont/protocol SMT builder (the same one the
// slice-4 replay will use), so the happy path is genuinely replay-valid and the
// mirror-lies / replay-from-base faults isolate `replay-mismatch` honestly rather
// than against dummy roots.
const ALICE_KEY = "aa".repeat(32);
const ALICE_VALUE = "66".repeat(32);
const BOB_KEY = "bb".repeat(32);
const BOB_VALUE = "77".repeat(32);
const BASE_PRIOR_LEAVES = [{ keyHex: "0a".repeat(32), valueHex: "0b".repeat(32) }];
const baseMap = new Map<string, string>(BASE_PRIOR_LEAVES.map((l) => [l.keyHex, l.valueHex]));
const PREV_ROOT = accumulatorRootOf(baseMap);
const NEW_ROOT = accumulatorRootOf(
  new Map<string, string>([...baseMap, [ALICE_KEY, ALICE_VALUE], [BOB_KEY, BOB_VALUE]]),
);
const BASE_A: DcvBaseRootRelationship = { prevRoot: PREV_ROOT, baseRootHeight: 94 };

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

// A valid full-N input: 2 served leaves whose delta replays PREV_ROOT -> NEW_ROOT,
// matching batchSize 2, all within window. base height 94 = anchor.minedHeight(100) - K(6).
function baseInput(): BatchCompletenessPredicateInput {
  return {
    commitment: { prevRoot: PREV_ROOT, newRoot: NEW_ROOT, batchSize: 2 },
    base: BASE_A,
    baseLeaves: [...BASE_PRIOR_LEAVES],
    window: { K: 6, W: 2, C: 3, availabilityDeadlineHeight: 102, challengeDeadlineHeight: 105 },
    daVerdict: DA_INCLUDABLE,
    priorSettledVerdict: null,
    batches: [
      {
        batchId: "batch-a",
        anchor: ANCHOR_A,
        leaves: [
          leafWitness({ name: "alice", leafKeyHex: ALICE_KEY, index: 0, valueHex: ALICE_VALUE, owner: OWNER_A }),
          leafWitness({ name: "bob", leafKeyHex: BOB_KEY, index: 1, valueHex: BOB_VALUE, owner: OWNER_B }),
        ],
      },
    ],
  };
}

// Helpers to clone the single base batch while mutating its leaves.
function withLeaves(input: BatchCompletenessPredicateInput, leaves: readonly BatchCompletenessLeafWitness[]): BatchCompletenessPredicateInput {
  return { ...input, batches: [{ ...input.batches[0]!, leaves }] };
}

// Set the DA verdict COHERENTLY on both the top-level input and every leaf projection, so a vector
// exercising timing/priority does not trip the projection-coherence guard (which requires
// projection.daVerdict === top-level daVerdict) by accident.
function withDaVerdict(input: BatchCompletenessPredicateInput, v: DcvDaVerdict): BatchCompletenessPredicateInput {
  return {
    ...input,
    daVerdict: v,
    batches: input.batches.map((batch) => ({
      ...batch,
      leaves: batch.leaves.map((lf) => ({ ...lf, projection: { ...lf.projection, daVerdict: v } })),
    })),
  };
}

// Set the base relationship COHERENTLY on both the top-level input and every leaf projection, so a
// vector exercising replay/stale isolates that reason rather than tripping projection-coherence.
function withBaseRel(input: BatchCompletenessPredicateInput, base: DcvBaseRootRelationship): BatchCompletenessPredicateInput {
  return {
    ...input,
    base,
    batches: input.batches.map((batch) => ({
      ...batch,
      leaves: batch.leaves.map((lf) => ({ ...lf, projection: { ...lf.projection, base } })),
    })),
  };
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

  it("bc.hidden-claim-no-effect (notice-window): visible DA-valid + hidden excluded finalizes as 1, not nullified (green)", () => {
    // The other half of "hidden claim has no effect": at the notice-window layer, a hidden
    // claim that resolves not-DA-priority does not count toward the collision, so the single
    // visible DA-valid claim finalizes (count 1) rather than nullifying the name.
    const verdict = resolveNoticeWindow({
      anchorHeight: 100,
      currentHeight: 120, // notice window (10 blocks) closed → decidable
      claims: [
        { ownerKey: "11".repeat(32), daVerdict: { decided: true, holdsPriority: true } }, // visible DA-valid (victim)
        { ownerKey: "12".repeat(32), daVerdict: { decided: true, holdsPriority: false } }, // hidden / not DA-priority → uncounted
      ],
      bond: { bondAmountSats: null, bondFloorSats: 50_000n },
      params: { noticeWindowBlocks: 10 },
    });
    expect(verdict.outcome).toBe("finalized");
    expect(verdict.awarded).toBe(true);
    expect(verdict.daValidOwnerCount).toBe(1);
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

  it("bc.copied-anchor-grief-not-steal: a copied/relocated anchor never changes the owner (green)", () => {
    // An attacker copies the victim's anchor label and re-mines it elsewhere. The leaf
    // projection still carries the VICTIM's owner key — ownership is fixed by the owner
    // field, not the anchor — so a copied current anchor cannot steal the name (and is
    // not, by itself, a completeness reject; that is the grief-not-steal property).
    const p = projectionFixture(); // owner = OWNER_A, the victim
    const copiedAnchor: DcvClosedLeafProjection = {
      ...p,
      anchor: { ...p.anchor, txid: "ee".repeat(32), minedHeight: 200 },
    };
    expect(isClosedDcvProjection(copiedAnchor)).toBe(true);
    expect(copiedAnchor.owner).toEqual({ kind: "owner-key", ownerKeyHex: "11".repeat(32) });
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
    // Coherently claim a base prevRoot ("99"...) that does NOT match the actual base leaf set;
    // commitment.prevRoot stays the real PREV_ROOT, so b.prevRoot !== c.prevRoot → replay-mismatch.
    // Mutating the base on both the top-level and every projection keeps it internally coherent so
    // this isolates replay-mismatch rather than tripping the projection-coherence guard.
    const wrongBase = withBaseRel(baseInput(), { prevRoot: "99".repeat(32), baseRootHeight: 94 });
    expect(evaluateBatchCompleteness(wrongBase)).toEqual({ accepts: false, reason: "batch-completeness-replay-mismatch" });
  });

  it("bc.one-bad-leaf-poisons-batch: a single malformed leaf (open projection) fails the WHOLE batch, not N-1", () => {
    const i = baseInput();
    // One leaf with a wrong-length (16-byte) owner-value binding → open projection.
    // Per O2, that fails the WHOLE batch closed, not N-1 accepted.
    const badLeaf = withLeaves(i, [
      i.batches[0]!.leaves[0]!,
      { ...i.batches[0]!.leaves[1]!, projection: { ...i.batches[0]!.leaves[1]!.projection, ownerValueBindingHex: "00".repeat(16) } },
    ]);
    expect(evaluateBatchCompleteness(badLeaf)).toEqual({ accepts: false, reason: "batch-completeness-projection-open-shape" });
  });

  it("bc.partial-timing: last leaf in (h+W, h+W+C] is includable without priority; after h+W+C is late", () => {
    const base = baseInput();
    // In-window-but-after-availability: served at 104, within (h+W=102, h+W+C=105]. The batch first
    // completes at maxServed=104, beyond availability, so the honest verdict is fcsh=104,
    // holdsPriority=false. Completeness accepts. (withDaVerdict keeps the projections coherent.)
    const inWindow = withDaVerdict(
      withLeaves(base, [base.batches[0]!.leaves[0]!, { ...base.batches[0]!.leaves[1]!, servedHeight: 104 }]),
      { kind: "includable", firstCompleteServedHeight: 104, holdsPriority: false },
    );
    expect(evaluateBatchCompleteness(inWindow)).toEqual({ accepts: true, reason: "batch-completeness-accepted" });

    // After the challenge deadline (105): the whole batch is excluded as late.
    const late = withLeaves(base, [base.batches[0]!.leaves[0]!, { ...base.batches[0]!.leaves[1]!, servedHeight: 106 }]);
    expect(evaluateBatchCompleteness(late)).toEqual({ accepts: false, reason: "batch-completeness-late" });

    // Timing contradiction: a holdsPriority=true verdict refuted by a leaf served after h+W (102)
    // — maxServed=104 > availability 102, so holdsPriority MUST be false; a true claim fails closed.
    const contradiction = withDaVerdict(
      withLeaves(base, [base.batches[0]!.leaves[0]!, { ...base.batches[0]!.leaves[1]!, servedHeight: 104 }]),
      { kind: "includable", firstCompleteServedHeight: 104, holdsPriority: true },
    );
    expect(evaluateBatchCompleteness(contradiction)).toEqual({ accepts: false, reason: "batch-completeness-timing-contradiction" });
  });

  it("bc.reorg-remine: evidence bound to a stale base height after re-mine fails closed", () => {
    // baseRootHeight 50 is not anchor.minedHeight(100) - K(6) = 94 on the canonical chain. Set
    // coherently on both top-level and projections so it isolates stale-anchor.
    const remined = withBaseRel(baseInput(), { prevRoot: PREV_ROOT, baseRootHeight: 50 });
    expect(evaluateBatchCompleteness(remined)).toEqual({ accepts: false, reason: "batch-completeness-stale-anchor" });
  });

  it("bc.projection-closure: open/incomplete/malformed projections are rejected by the closed-shape gate (green)", () => {
    const p = projectionFixture();
    const { base: _omitBase, ...missingBase } = p;
    expect(isClosedDcvProjection(missingBase)).toBe(false);
    expect(isClosedDcvProjection({ ...p, anchor: { ...p.anchor, txid: "" } })).toBe(false);
    expect(isClosedDcvProjection({ ...p, daVerdict: { kind: "includable", firstCompleteServedHeight: 1 } })).toBe(false);
    // Wrong-length hex (16 bytes, not 32) is rejected by the tightened gate.
    expect(isClosedDcvProjection({ ...p, leafKeyHex: "aa".repeat(16) })).toBe(false);
    expect(isClosedDcvProjection({ ...p, ownerValueBindingHex: "22".repeat(16) })).toBe(false);
    expect(isClosedDcvProjection({ ...p, owner: { kind: "owner-key", ownerKeyHex: "11".repeat(16) } })).toBe(false);
    expect(isClosedDcvProjection({ ...p, base: { ...p.base, prevRoot: "44".repeat(16) } })).toBe(false);
  });
});

describe("batch-completeness (#83) slice-4 hostile cases (CL round-2 review)", () => {
  // Blocker 1: a base/delta collision must not silently overwrite a base value (insert-only).
  it("rejects a delta leaf colliding with a base key (insert-only / no silent overwrite)", () => {
    const baseKey = BASE_PRIOR_LEAVES[0]!.keyHex; // a key already present in the base set
    const updatedValue = "ed".repeat(32);
    // The attacker commits newRoot = root(base with that key UPDATED), so replay alone would pass
    // and admit a mutation. Insert-only must reject it before replay.
    const mutatedNewRoot = accumulatorRootOf(
      new Map<string, string>([...baseMap, [baseKey, updatedValue], [BOB_KEY, BOB_VALUE]]),
    );
    const i = baseInput();
    const collide: BatchCompletenessPredicateInput = {
      ...i,
      commitment: { ...i.commitment, newRoot: mutatedNewRoot },
      batches: [
        {
          ...i.batches[0]!,
          leaves: [
            leafWitness({ name: "evil", leafKeyHex: baseKey, index: 0, valueHex: updatedValue }),
            i.batches[0]!.leaves[1]!,
          ],
        },
      ],
    };
    expect(evaluateBatchCompleteness(collide)).toEqual({ accepts: false, reason: "batch-completeness-insert-only-violation" });
  });

  it("rejects a base leaf set with a duplicate key (base is not a well-formed set)", () => {
    const i = baseInput();
    const dupBase: BatchCompletenessPredicateInput = {
      ...i,
      baseLeaves: [...BASE_PRIOR_LEAVES, { keyHex: BASE_PRIOR_LEAVES[0]!.keyHex, valueHex: "ff".repeat(32) }],
    };
    expect(evaluateBatchCompleteness(dupBase)).toEqual({ accepts: false, reason: "batch-completeness-insert-only-violation" });
  });

  // Blocker 2: projection facts must agree with the enclosing batch + top-level base + DA verdict.
  it("rejects a leaf whose projection DA verdict disagrees with the consumed top-level verdict", () => {
    const i = baseInput();
    const incoherent: BatchCompletenessPredicateInput = {
      ...i,
      batches: [
        {
          ...i.batches[0]!,
          leaves: [
            {
              ...i.batches[0]!.leaves[0]!,
              projection: {
                ...i.batches[0]!.leaves[0]!.projection,
                daVerdict: { kind: "excluded", firstCompleteServedHeight: null, holdsPriority: false },
              },
            },
            i.batches[0]!.leaves[1]!,
          ],
        },
      ],
    };
    expect(evaluateBatchCompleteness(incoherent)).toEqual({ accepts: false, reason: "batch-completeness-projection-incoherent" });
  });

  it("rejects a leaf whose projection anchor disagrees with its enclosing batch anchor", () => {
    const i = baseInput();
    const incoherent: BatchCompletenessPredicateInput = {
      ...i,
      batches: [
        {
          ...i.batches[0]!,
          leaves: [
            {
              ...i.batches[0]!.leaves[0]!,
              projection: { ...i.batches[0]!.leaves[0]!.projection, anchor: { ...ANCHOR_A, txid: "ee".repeat(32) } },
            },
            i.batches[0]!.leaves[1]!,
          ],
        },
      ],
    };
    expect(evaluateBatchCompleteness(incoherent)).toEqual({ accepts: false, reason: "batch-completeness-projection-incoherent" });
  });

  it("rejects a leaf whose projection base relationship disagrees with the top-level base", () => {
    const i = baseInput();
    const incoherent: BatchCompletenessPredicateInput = {
      ...i,
      batches: [
        {
          ...i.batches[0]!,
          leaves: [
            {
              ...i.batches[0]!.leaves[0]!,
              projection: { ...i.batches[0]!.leaves[0]!.projection, base: { prevRoot: "99".repeat(32), baseRootHeight: 94 } },
            },
            i.batches[0]!.leaves[1]!,
          ],
        },
      ],
    };
    expect(evaluateBatchCompleteness(incoherent)).toEqual({ accepts: false, reason: "batch-completeness-projection-incoherent" });
  });

  it("rejects a leaf whose projection batchId disagrees with its enclosing batch", () => {
    const i = baseInput();
    const incoherent: BatchCompletenessPredicateInput = {
      ...i,
      batches: [
        {
          ...i.batches[0]!,
          leaves: [
            { ...i.batches[0]!.leaves[0]!, projection: { ...i.batches[0]!.leaves[0]!.projection, batchId: "batch-z" } },
            i.batches[0]!.leaves[1]!,
          ],
        },
      ],
    };
    expect(evaluateBatchCompleteness(incoherent)).toEqual({ accepts: false, reason: "batch-completeness-projection-incoherent" });
  });

  // Blocker 3: the witnessed verdict must agree with the witnessed served-heights.
  it("rejects an includable verdict whose firstCompleteServedHeight disagrees with the served heights", () => {
    // All leaves served at 101, but the verdict claims the batch first completed at 106.
    const i = withDaVerdict(baseInput(), { kind: "includable", firstCompleteServedHeight: 106, holdsPriority: true });
    expect(evaluateBatchCompleteness(i)).toEqual({ accepts: false, reason: "batch-completeness-timing-contradiction" });
  });

  it("rejects an includable verdict whose holdsPriority disagrees with the availability deadline", () => {
    // maxServed 101 <= availability 102 → priority IS held; a holdsPriority=false claim understates it.
    const i = withDaVerdict(baseInput(), { kind: "includable", firstCompleteServedHeight: 101, holdsPriority: false });
    expect(evaluateBatchCompleteness(i)).toEqual({ accepts: false, reason: "batch-completeness-timing-contradiction" });
  });

  // Non-blocker tightening: a settled accept carrying a non-canonical reason is not trusted.
  it("does not honour a settled accept carrying a non-canonical reason (finalize-once integrity)", () => {
    const i = baseInput();
    const nMinus1 = withLeaves(i, [i.batches[0]!.leaves[0]!]); // would fresh-fail count-mismatch
    const spoofed: BatchCompletenessPredicateInput = {
      ...nMinus1,
      priorSettledVerdict: { accepts: true, reason: "batch-completeness-late", settledAtHeight: 105 },
    };
    expect(evaluateBatchCompleteness(spoofed)).toEqual({ accepts: false, reason: "batch-completeness-count-mismatch" });
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
