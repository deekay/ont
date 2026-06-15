// D-CV canonical-root derivation conformance battery (B3_EVIDENCE_HARDENING.md §10 / cv.*;
// ratified #53 prevRoot=R_{h-K} delta-merge + #54/#55 anchor order + PR-5/PR-9 via #66). D-CV is
// the ROOT-DERIVATION half over the locked #83 closed projection contract: fold the DA-valid
// priority-bearing delta leaves into ONE deterministic SMT root + provenance. PURE / total /
// fail-closed / order-independent.
//
// Tests-first RED battery: positives fail against the slice stub (`dcv-not-implemented`, null root);
// negatives assert the SPECIFIC fail-closed reason / disposition (not the stub sentinel), so the
// whole battery is red until the derivation + boundary gates land. CL's review focus: winner
// leakage (no contest-decision), stale-base edges, malformed totality.
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
const BIND_B = "b0".repeat(32); // owner-B committed value binding
const OWNER_A = "a1".repeat(32);
const OWNER_B = "b1".repeat(32);

const baseLeaves = [{ keyHex: BASE_KEY, valueHex: BASE_VAL }];
const PREV_ROOT = accumulatorRootOf(new Map([[BASE_KEY, BASE_VAL]]));
const BASE_HEIGHT = 100;
const K = 6;
const BASE_REL = { prevRoot: PREV_ROOT, baseRootHeight: BASE_HEIGHT };

const rootWith = (entries: readonly (readonly [string, string])[]): string =>
  accumulatorRootOf(new Map([[BASE_KEY, BASE_VAL], ...entries]));

const proj = (over: Partial<DcvClosedLeafProjection> = {}): DcvClosedLeafProjection => ({
  name: "alice",
  leafKeyHex: LEAF_A,
  owner: { kind: "owner-key", ownerKeyHex: OWNER_A },
  ownerValueBindingHex: BIND_A,
  anchor: { txid: "cc".repeat(32), minedHeight: 110, txIndex: 0, vout: 0, anchorInstance: 0 },
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
// so a contested/excluded LEAF_A case does not collapse into a no-op.
const leafB = (): BatchCompletenessLeafWitness =>
  leaf({ name: "bob", leafKeyHex: LEAF_B, owner: { kind: "owner-key", ownerKeyHex: OWNER_B }, ownerValueBindingHex: BIND_B, batchId: "batch-2", batchLocalIndex: 0 }, BIND_B);

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

  it("cv.prevroot-k-deep: a base that is not K-deep vs the delta anchors fails closed", () => {
    // anchor minedHeight 110, K 6 ⇒ base must be ≤ 104; a base at 109 (within K) is the tip, not R_{h-K}.
    const notKDeep = { prevRoot: PREV_ROOT, baseRootHeight: 109 };
    const v = deriveCanonicalRoot(input({ base: notKDeep, leaves: [leaf({ base: notKDeep })] }));
    expect(v.derived).toBe(false);
    expect(v.reason).toBe("dcv-base-mismatch");
  });

  it("cv.base-root-binding: baseLeaves that do not fold to base.prevRoot fail closed", () => {
    const v = deriveCanonicalRoot(input({ baseLeaves: [{ keyHex: BASE_KEY, valueHex: "99".repeat(32) }] }));
    expect(v.derived).toBe(false);
    expect(v.reason).toBe("dcv-base-mismatch");
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
    // provenance is sorted by leafKeyHex, so it is identical regardless of input order.
    expect(reverse.leaves).toEqual(forward.leaves);
  });

  it("cv.no-contest-decision: two DA-valid distinct-owner claims for one leaf → contested, NO owner in the root", () => {
    // LEAF_A is claimed by owner A (batch-1) and owner B (batch-3); LEAF_B keeps the delta non-empty.
    const aClaim = leaf({ duplicateHandling: "distinct-owner-contested" }, BIND_A);
    const bClaim = leaf(
      { leafKeyHex: LEAF_A, owner: { kind: "owner-key", ownerKeyHex: OWNER_B }, ownerValueBindingHex: BIND_B, batchId: "batch-3", duplicateHandling: "distinct-owner-contested" },
      BIND_B,
    );
    const v = deriveCanonicalRoot(input({ leaves: [aClaim, bClaim, leafB()] }));
    expect(v.derived).toBe(true);
    // The derived root contains LEAF_B but NEITHER owner's value for LEAF_A — no provable membership for A or B.
    expect(v.newRoot).toBe(rootWith([[LEAF_B, BIND_B]]));
    const contested = v.leaves.find((l) => l.leafKeyHex === LEAF_A);
    expect(contested).toMatchObject({ disposition: "contested-no-owner", ownerValueHex: null, contributingBatchIds: ["batch-1", "batch-3"] });
  });

  it("cv.winner-leakage-guard: a projection claiming `unique` for a distinct-owner collision fails closed", () => {
    // The disposition is COMPUTED from the actual grouping; a projection cannot assert away a contest
    // to smuggle its owner value in as the winner.
    const aClaim = leaf({ duplicateHandling: "unique" }, BIND_A);
    const bClaim = leaf(
      { leafKeyHex: LEAF_A, owner: { kind: "owner-key", ownerKeyHex: OWNER_B }, ownerValueBindingHex: BIND_B, batchId: "batch-3", duplicateHandling: "unique" },
      BIND_B,
    );
    const v = deriveCanonicalRoot(input({ leaves: [aClaim, bClaim, leafB()] }));
    expect(v.derived).toBe(false);
    expect(v.reason).toBe("dcv-projection-contradiction");
  });

  it("cv.same-owner-coalesce: same-owner duplicates for one leaf coalesce to a single inserted owner", () => {
    const first = leaf({ duplicateHandling: "same-owner-duplicate" }, BIND_A);
    const second = leaf({ batchId: "batch-3", duplicateHandling: "same-owner-duplicate" }, BIND_A);
    const v = deriveCanonicalRoot(input({ leaves: [first, second] }));
    expect(v.derived).toBe(true);
    expect(v.newRoot).toBe(rootWith([[LEAF_A, BIND_A]]));
    const folded = v.leaves.find((l) => l.leafKeyHex === LEAF_A);
    expect(folded).toMatchObject({ disposition: "inserted", ownerValueHex: BIND_A, contributingBatchIds: ["batch-1", "batch-3"] });
  });

  it("cv.excluded-duplicate-no-nullify: a DA-excluded same-leaf duplicate does not contest or nullify the valid claim", () => {
    // owner A is includable+priority; owner B's same-leaf claim is DA-excluded ⇒ skipped, no contest.
    const aClaim = leaf({}, BIND_A);
    const bExcluded = leaf(
      { leafKeyHex: LEAF_A, owner: { kind: "owner-key", ownerKeyHex: OWNER_B }, ownerValueBindingHex: BIND_B, batchId: "batch-3", daVerdict: { kind: "excluded", firstCompleteServedHeight: null, holdsPriority: false } },
      BIND_B,
    );
    const v = deriveCanonicalRoot(input({ leaves: [aClaim, bExcluded] }));
    expect(v.derived).toBe(true);
    expect(v.newRoot).toBe(rootWith([[LEAF_A, BIND_A]])); // A wins outright; B has no effect
    expect(v.leaves.find((l) => l.leafKeyHex === LEAF_A)).toMatchObject({ disposition: "inserted", ownerValueHex: BIND_A });
  });

  it("cv.reorg-rederive: a leaf whose anchor is reorged out (now DA-excluded) re-derives to without it", () => {
    // Same two-leaf delta, but LEAF_A's verdict flipped to excluded by the reorg ⇒ skipped; the
    // canonical root is the one WITHOUT LEAF_A — no first-seen / old-chain height as authority.
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
