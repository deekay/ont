// D-CV canonical-root derivation conformance battery (B3_EVIDENCE_HARDENING.md §10 / cv.*;
// ratified #53 prevRoot=R_{h-K} delta-merge + #54/#55 anchor order + PR-5/PR-9 via #66). D-CV is
// the ROOT-DERIVATION half over the locked #83 closed projection contract: fold the DA-valid
// priority-bearing delta leaves into ONE deterministic SMT root + provenance. PURE / total /
// fail-closed / order-independent.
//
// Tests-first RED battery: positives fail against the slice stub (`dcv-not-implemented`, null root);
// negatives assert the SPECIFIC fail-closed reason / disposition (not the stub sentinel), so the
// whole battery is red until the derivation + boundary gates land. CL review round 1 pinned five
// edges: exact base height (`baseRootHeight === minedHeight - K`), contest-only must NOT collapse to
// no-op, leaf value vs projection binding coherence, duplicate-handling contradiction BOTH
// directions + non-priority skip (#69), and same-owner conflicting value / duplicate base-key.
import { accumulatorRootOf } from "@ont/protocol";
import { describe, expect, it } from "vitest";

import {
  deriveCanonicalRoot,
  type BatchCompletenessLeafWitness,
  type DcvClosedLeafProjection,
  type DcvDerivationInput,
} from "./batch-exclusion.js";

const BASE_KEY = "11".repeat(32);
const BASE_VAL = "12".repeat(32);
const LEAF_A = "aa".repeat(32);
const LEAF_B = "bb".repeat(32);
const BIND_A = "a0".repeat(32); // owner-A committed value binding (folded into the SMT)
const BIND_A2 = "a2".repeat(32); // a SECOND, conflicting owner-A binding/value
const BIND_B = "b0".repeat(32); // owner-B committed value binding
const LEAF_C = "c1".repeat(32);
const BIND_C = "c0".repeat(32); // owner-C committed value binding (used by the mixed-anchor-height vector)
const OWNER_A = "a1".repeat(32);
const OWNER_B = "b1".repeat(32);
const OWNER_C = "c2".repeat(32);

const baseLeaves = [{ keyHex: BASE_KEY, valueHex: BASE_VAL }];
const PREV_ROOT = accumulatorRootOf(new Map([[BASE_KEY, BASE_VAL]]));
const K = 6;
const ANCHOR_HEIGHT = 110;
const BASE_HEIGHT = ANCHOR_HEIGHT - K; // 104 — the EXACT R_{h-K} horizon (#83: baseRootHeight === minedHeight - K)
const BASE_REL = { prevRoot: PREV_ROOT, baseRootHeight: BASE_HEIGHT };

const rootWith = (entries: readonly (readonly [string, string])[]): string =>
  accumulatorRootOf(new Map([[BASE_KEY, BASE_VAL], ...entries]));

const proj = (over: Partial<DcvClosedLeafProjection> = {}): DcvClosedLeafProjection => ({
  name: "alice",
  leafKeyHex: LEAF_A,
  owner: { kind: "owner-key", ownerKeyHex: OWNER_A },
  ownerValueBindingHex: BIND_A,
  anchor: { txid: "cc".repeat(32), minedHeight: ANCHOR_HEIGHT, txIndex: 0, vout: 0, anchorInstance: 0 },
  batchId: "batch-1",
  batchLocalIndex: 0,
  duplicateHandling: "unique",
  daVerdict: { kind: "includable", firstCompleteServedHeight: 112, holdsPriority: true },
  base: BASE_REL,
  ...over,
});

const leaf = (
  projOver: Partial<DcvClosedLeafProjection> = {},
  valueHex = BIND_A,
  servedHeight: number | null = 112,
): BatchCompletenessLeafWitness => ({ projection: proj(projOver), valueHex, servedHeight });

// A second, distinct-key unique leaf (LEAF_B → BIND_B) used to keep the effective delta non-empty
// where a case needs an unrelated inserted leaf.
const leafB = (): BatchCompletenessLeafWitness =>
  leaf({ name: "bob", leafKeyHex: LEAF_B, owner: { kind: "owner-key", ownerKeyHex: OWNER_B }, ownerValueBindingHex: BIND_B, batchId: "batch-2", batchLocalIndex: 0 }, BIND_B);

// A second distinct-owner claim for LEAF_A from another batch, parameterised so vectors can flip
// duplicateHandling / daVerdict.
const bClaimForA = (over: Partial<DcvClosedLeafProjection> = {}): BatchCompletenessLeafWitness =>
  leaf({ leafKeyHex: LEAF_A, owner: { kind: "owner-key", ownerKeyHex: OWNER_B }, ownerValueBindingHex: BIND_B, batchId: "batch-3", ...over }, BIND_B);

const input = (over: Partial<DcvDerivationInput> = {}): DcvDerivationInput => ({
  base: BASE_REL,
  baseLeaves,
  K,
  leaves: [leaf()],
  ...over,
});

describe("D-CV canonical-root derivation (B3 §10; #53 delta-merge, root-derivation over #83 projection)", () => {
  it("cv.derives-canonical-root: a unique DA-valid priority leaf folds to base ∪ {leaf}", () => {
    const v = deriveCanonicalRoot(input());
    expect(v.derived).toBe(true);
    expect(v.reason).toBe("dcv-derived");
    expect(v.newRoot).toBe(rootWith([[LEAF_A, BIND_A]]));
    expect(v.leaves).toEqual([
      { leafKeyHex: LEAF_A, name: "alice", disposition: "inserted", ownerValueHex: BIND_A, contributingBatchIds: ["batch-1"] },
    ]);
  });

  it("cv.prevroot-k-deep: base height must be EXACTLY minedHeight - K; a too-recent base fails closed", () => {
    // anchor minedHeight 110, K 6 ⇒ base MUST be 104; a base at 109 (within K) is the tip, not R_{h-K}.
    const tooRecent = { prevRoot: PREV_ROOT, baseRootHeight: 109 };
    const v = deriveCanonicalRoot(input({ base: tooRecent, leaves: [leaf({ base: tooRecent })] }));
    expect(v.derived).toBe(false);
    expect(v.reason).toBe("dcv-base-mismatch");
  });

  it("cv.base-too-old: a too-old base (omits already-K-deep anchors) fails closed", () => {
    // 103 < 104: a base older than R_{h-K} would re-admit anchors that are already in the canonical
    // prefix, so it is not the pinned D-SB-bind base snapshot. Exact relation, both directions.
    const tooOld = { prevRoot: PREV_ROOT, baseRootHeight: 103 };
    const v = deriveCanonicalRoot(input({ base: tooOld, leaves: [leaf({ base: tooOld })] }));
    expect(v.derived).toBe(false);
    expect(v.reason).toBe("dcv-base-mismatch");
  });

  it("cv.mixed-anchor-height-base-exactness: base exactness is checked PER included priority leaf", () => {
    // CL r2 #last: the single base at 104 is exact for the anchor-A leaf (110-6) but NOT for an
    // includable priority leaf whose anchor is at 111 (its exact base would be 105). Validating the
    // base against only the first/min anchor height would re-admit an already-K-deep anchor through a
    // multi-leaf input — so the exactness MUST hold per included priority leaf; otherwise the input
    // (mixed anchor heights under one base) is malformed for this surface. Fail closed.
    const laterAnchor = { txid: "dd".repeat(32), minedHeight: ANCHOR_HEIGHT + 1, txIndex: 0, vout: 0, anchorInstance: 0 };
    const laterLeaf = leaf(
      { name: "carol", leafKeyHex: LEAF_C, owner: { kind: "owner-key", ownerKeyHex: OWNER_C }, ownerValueBindingHex: BIND_C, batchId: "batch-4", anchor: laterAnchor },
      BIND_C,
    );
    const v = deriveCanonicalRoot(input({ leaves: [leaf(), laterLeaf] }));
    expect(v.derived).toBe(false);
    expect(v.reason).toBe("dcv-base-mismatch");
  });

  it("cv.base-root-binding: baseLeaves that do not fold to base.prevRoot fail closed", () => {
    const v = deriveCanonicalRoot(input({ baseLeaves: [{ keyHex: BASE_KEY, valueHex: "99".repeat(32) }] }));
    expect(v.derived).toBe(false);
    expect(v.reason).toBe("dcv-base-mismatch");
  });

  it("cv.duplicate-base-key: a duplicate key in baseLeaves fails closed (no silent Map overwrite)", () => {
    const v = deriveCanonicalRoot(input({ baseLeaves: [{ keyHex: BASE_KEY, valueHex: BASE_VAL }, { keyHex: BASE_KEY, valueHex: BASE_VAL }] }));
    expect(v.derived).toBe(false);
    expect(v.reason).toBe("dcv-input-malformed");
  });

  it("cv.no-op-anchor: an all-excluded (no DA-valid) delta whose root equals prevRoot is rejected", () => {
    const excluded = leaf({ daVerdict: { kind: "excluded", firstCompleteServedHeight: null, holdsPriority: false } });
    const v = deriveCanonicalRoot(input({ leaves: [excluded] }));
    expect(v.derived).toBe(false);
    expect(v.reason).toBe("dcv-no-op");
  });

  it("cv.commute: order-independent — any processing order yields the same canonical root", () => {
    const forward = deriveCanonicalRoot(input({ leaves: [leaf(), leafB()] }));
    const reverse = deriveCanonicalRoot(input({ leaves: [leafB(), leaf()] }));
    expect(forward.derived).toBe(true);
    expect(forward.newRoot).toBe(rootWith([[LEAF_A, BIND_A], [LEAF_B, BIND_B]]));
    expect(reverse.newRoot).toBe(forward.newRoot);
    expect(reverse.leaves).toEqual(forward.leaves); // sorted by leafKeyHex ⇒ identical regardless of order
  });

  it("cv.no-contest-decision: two DA-valid distinct-owner claims for one leaf → contested, NO owner in the root", () => {
    const aClaim = leaf({ duplicateHandling: "distinct-owner-contested" }, BIND_A);
    const bClaim = bClaimForA({ duplicateHandling: "distinct-owner-contested" });
    const v = deriveCanonicalRoot(input({ leaves: [aClaim, bClaim, leafB()] }));
    expect(v.derived).toBe(true);
    // The derived root contains LEAF_B but NEITHER owner's value for LEAF_A — no provable membership for A or B.
    expect(v.newRoot).toBe(rootWith([[LEAF_B, BIND_B]]));
    expect(v.leaves.find((l) => l.leafKeyHex === LEAF_A)).toMatchObject({ disposition: "contested-no-owner", ownerValueHex: null, contributingBatchIds: ["batch-1", "batch-3"] });
  });

  it("cv.no-contest-only-no-op: a contest-only delta derives (root === prevRoot) and PRESERVES the contest signal", () => {
    // CL r1 #2: without an unrelated inserted leaf, the root does not change — but the derivation must
    // NOT collapse to dcv-no-op, or it erases the nullify/reopen signal the contest represents.
    const aClaim = leaf({ duplicateHandling: "distinct-owner-contested" }, BIND_A);
    const bClaim = bClaimForA({ duplicateHandling: "distinct-owner-contested" });
    const v = deriveCanonicalRoot(input({ leaves: [aClaim, bClaim] }));
    expect(v.derived).toBe(true);
    expect(v.reason).toBe("dcv-derived");
    expect(v.newRoot).toBe(PREV_ROOT); // unchanged, but NOT a no-op
    expect(v.leaves.find((l) => l.leafKeyHex === LEAF_A)).toMatchObject({ disposition: "contested-no-owner", ownerValueHex: null });
  });

  it("cv.winner-leakage-guard: a projection claiming `unique` for a distinct-owner collision fails closed", () => {
    // The disposition is COMPUTED from the actual grouping; a projection cannot assert away a contest
    // to smuggle its owner value in as the winner.
    const aClaim = leaf({ duplicateHandling: "unique" }, BIND_A);
    const bClaim = bClaimForA({ duplicateHandling: "unique" });
    const v = deriveCanonicalRoot(input({ leaves: [aClaim, bClaim, leafB()] }));
    expect(v.derived).toBe(false);
    expect(v.reason).toBe("dcv-projection-contradiction");
  });

  it("cv.false-contest-claim: a real unique leaf claiming `distinct-owner-contested` fails closed (denial vector)", () => {
    // CL r1 #4: a producer must not assert a FALSE contest to nullify a genuinely unique claim.
    const falseContest = leaf({ duplicateHandling: "distinct-owner-contested" }, BIND_A);
    const v = deriveCanonicalRoot(input({ leaves: [falseContest] }));
    expect(v.derived).toBe(false);
    expect(v.reason).toBe("dcv-projection-contradiction");
  });

  it("cv.same-owner-coalesce: same-owner duplicates with the SAME value coalesce to one inserted owner", () => {
    const first = leaf({ duplicateHandling: "same-owner-duplicate" }, BIND_A);
    const second = leaf({ batchId: "batch-3", duplicateHandling: "same-owner-duplicate" }, BIND_A);
    const v = deriveCanonicalRoot(input({ leaves: [first, second] }));
    expect(v.derived).toBe(true);
    expect(v.newRoot).toBe(rootWith([[LEAF_A, BIND_A]]));
    expect(v.leaves.find((l) => l.leafKeyHex === LEAF_A)).toMatchObject({ disposition: "inserted", ownerValueHex: BIND_A, contributingBatchIds: ["batch-1", "batch-3"] });
  });

  it("cv.same-owner-conflicting-value: same owner but a DIFFERENT bound value fails closed", () => {
    // CL r1 #5: same-owner duplicates are idempotent only if the folded value is identical; a
    // conflicting value cannot be silently resolved.
    const first = leaf({ duplicateHandling: "same-owner-duplicate" }, BIND_A);
    const conflicting = leaf({ batchId: "batch-3", duplicateHandling: "same-owner-duplicate", ownerValueBindingHex: BIND_A2 }, BIND_A2);
    const v = deriveCanonicalRoot(input({ leaves: [first, conflicting] }));
    expect(v.derived).toBe(false);
    expect(v.reason).toBe("dcv-projection-contradiction");
  });

  it("cv.value-binding-mismatch: leaf.valueHex must equal projection.ownerValueBindingHex", () => {
    // CL r1 #3: D-CV must not fold one value into the root while the provenance binds another.
    const mismatch = leaf({}, "ee".repeat(32)); // valueHex != ownerValueBindingHex (BIND_A)
    const v = deriveCanonicalRoot(input({ leaves: [mismatch] }));
    expect(v.derived).toBe(false);
    expect(v.reason).toBe("dcv-projection-contradiction");
  });

  it("cv.same-key-name-mismatch: same leafKeyHex with inconsistent name fails closed, order-independently", () => {
    // CL r1: leafKeyHex = H(name) is NOT recomputed; a same-key bucket carrying two distinct names
    // would make the returned provenance name order-dependent. Reject — and identically for either order.
    const alice = leaf({}); // name "alice", LEAF_A, includable + priority
    const mallory = leaf({ name: "mallory", batchId: "batch-3", daVerdict: { kind: "excluded", firstCompleteServedHeight: null, holdsPriority: false } }); // same LEAF_A, different name
    const forward = deriveCanonicalRoot(input({ leaves: [alice, mallory] }));
    const reverse = deriveCanonicalRoot(input({ leaves: [mallory, alice] }));
    expect(forward.derived).toBe(false);
    expect(forward.reason).toBe("dcv-projection-contradiction");
    expect(reverse).toEqual(forward); // deterministic provenance: identical verdict regardless of input order
  });

  it("cv.negative-K: a negative confirmation depth is malformed input", () => {
    const v = deriveCanonicalRoot(input({ K: -1 }));
    expect(v.derived).toBe(false);
    expect(v.reason).toBe("dcv-input-malformed");
  });

  it("cv.excluded-duplicate-no-nullify: a DA-excluded same-leaf duplicate does not contest or nullify", () => {
    const aClaim = leaf({}, BIND_A);
    const bExcluded = bClaimForA({ daVerdict: { kind: "excluded", firstCompleteServedHeight: null, holdsPriority: false } });
    const v = deriveCanonicalRoot(input({ leaves: [aClaim, bExcluded] }));
    expect(v.derived).toBe(true);
    expect(v.newRoot).toBe(rootWith([[LEAF_A, BIND_A]])); // A wins outright; B has no effect
    expect(v.leaves.find((l) => l.leafKeyHex === LEAF_A)).toMatchObject({ disposition: "inserted", ownerValueHex: BIND_A });
  });

  it("cv.non-priority-no-nullify: an includable but holdsPriority:false same-leaf duplicate is skipped (#69)", () => {
    // CL r1 #4: #69 counts only DA-valid PRIORITY-bearing claims — a non-priority duplicate does not
    // count, so it neither wins nor contests; the priority claim wins outright.
    const aClaim = leaf({}, BIND_A);
    const bNonPriority = bClaimForA({ daVerdict: { kind: "includable", firstCompleteServedHeight: 112, holdsPriority: false } });
    const v = deriveCanonicalRoot(input({ leaves: [aClaim, bNonPriority] }));
    expect(v.derived).toBe(true);
    expect(v.newRoot).toBe(rootWith([[LEAF_A, BIND_A]]));
    expect(v.leaves.find((l) => l.leafKeyHex === LEAF_A)).toMatchObject({ disposition: "inserted", ownerValueHex: BIND_A });
  });

  it("cv.reorg-rederive: a leaf whose anchor is reorged out (now DA-excluded) re-derives to without it", () => {
    const reorgedOut = leaf({ daVerdict: { kind: "excluded", firstCompleteServedHeight: null, holdsPriority: false } });
    const v = deriveCanonicalRoot(input({ leaves: [reorgedOut, leafB()] }));
    expect(v.derived).toBe(true);
    expect(v.newRoot).toBe(rootWith([[LEAF_B, BIND_B]]));
    expect(v.leaves.find((l) => l.leafKeyHex === LEAF_A)).toMatchObject({ disposition: "skipped-excluded", ownerValueHex: null });
  });

  it("cv.stale-base: a delta projection whose base relation disagrees with the input base fails closed", () => {
    const staleProj = leaf({ base: { prevRoot: "ee".repeat(32), baseRootHeight: BASE_HEIGHT } });
    const v = deriveCanonicalRoot(input({ leaves: [staleProj] }));
    expect(v.derived).toBe(false);
    expect(v.reason).toBe("dcv-stale-base");
  });

  it("cv.insert-only: a delta leaf key already present in the base set fails closed", () => {
    const collide = leaf({ leafKeyHex: BASE_KEY });
    const v = deriveCanonicalRoot(input({ leaves: [collide] }));
    expect(v.derived).toBe(false);
    expect(v.reason).toBe("dcv-insert-only-violation");
  });

  it("cv.batch-local-duplicate: the same leaf key twice within one batch fails closed", () => {
    const first = leaf({});
    const dup = leaf({ batchLocalIndex: 1 }); // same batchId batch-1, same LEAF_A
    const v = deriveCanonicalRoot(input({ leaves: [first, dup] }));
    expect(v.derived).toBe(false);
    expect(v.reason).toBe("dcv-batch-local-duplicate");
  });

  it("cv.malformed: a malformed projection (non-hex leaf key) fails closed and never throws", () => {
    const bad = { projection: proj({ leafKeyHex: "zz".repeat(32) }), valueHex: BIND_A, servedHeight: 112 };
    let v: ReturnType<typeof deriveCanonicalRoot>;
    expect(() => {
      v = deriveCanonicalRoot(input({ leaves: [bad] }));
    }).not.toThrow();
    expect(v!.derived).toBe(false);
    expect(v!.reason).toBe("dcv-input-malformed");
  });
});
