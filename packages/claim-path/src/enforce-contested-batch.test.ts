import { accumulatorRootOf } from "@ont/protocol";
import { describe, expect, it } from "vitest";
import type {
  BatchCompletenessLeafWitness,
  DcvClosedLeafProjection,
  DcvDerivationInput,
} from "@ont/consensus";
import { enforceContestedBatch } from "./enforce-contested-batch.js";

// I-CONTESTED red battery (B3_INTEGRATION_PLAN §11). Fixtures mirror the kernel canonical-root.test.ts
// recipe: a K-deep base + delta leaves carrying #83 closed projections. enforceContestedBatch runs the
// audited deriveCanonicalRoot and partitions the provenance into { canonicalRoot, inserted, contestedToL1 }.
// RED until the wrapper lands (the stub rejects with cnt-stub-not-implemented).

const BASE_KEY = "11".repeat(32);
const BASE_VAL = "12".repeat(32);
const LEAF_A = "aa".repeat(32);
const LEAF_B = "bb".repeat(32);
const BIND_A = "a0".repeat(32);
const BIND_B = "b0".repeat(32);
const BIND_C = "c0".repeat(32);
const OWNER_A = "a1".repeat(32);
const OWNER_B = "b1".repeat(32);
const OWNER_C = "c2".repeat(32);

const baseLeaves = [{ keyHex: BASE_KEY, valueHex: BASE_VAL }];
const PREV_ROOT = accumulatorRootOf(new Map([[BASE_KEY, BASE_VAL]]));
const K = 6;
const ANCHOR_HEIGHT = 110;
const BASE_HEIGHT = ANCHOR_HEIGHT - K; // exact R_{h-K} horizon (#83)
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

const leafB = (): BatchCompletenessLeafWitness =>
  leaf(
    { name: "bob", leafKeyHex: LEAF_B, owner: { kind: "owner-key", ownerKeyHex: OWNER_B }, ownerValueBindingHex: BIND_B, batchId: "batch-2" },
    BIND_B,
  );

// A second distinct-owner claim for LEAF_A from another batch.
const bClaimForA = (over: Partial<DcvClosedLeafProjection> = {}): BatchCompletenessLeafWitness =>
  leaf({ leafKeyHex: LEAF_A, owner: { kind: "owner-key", ownerKeyHex: OWNER_B }, ownerValueBindingHex: BIND_B, batchId: "batch-3", ...over }, BIND_B);

const input = (over: Partial<DcvDerivationInput> = {}): DcvDerivationInput => ({
  base: BASE_REL,
  baseLeaves,
  K,
  leaves: [leaf()],
  ...over,
});

// The two contesting priority claims for LEAF_A (distinct owners), the standard contest fixture.
const aContest = (): BatchCompletenessLeafWitness => leaf({ duplicateHandling: "distinct-owner-contested" }, BIND_A);
const bContest = (): BatchCompletenessLeafWitness => bClaimForA({ duplicateHandling: "distinct-owner-contested" });
const OWNER_A_ID = { kind: "owner-key" as const, ownerKeyHex: OWNER_A };
const OWNER_B_ID = { kind: "owner-key" as const, ownerKeyHex: OWNER_B };

describe("enforceContestedBatch — happy derivation + inserted provenance", () => {
  it("an uncontested multi-leaf delta → canonical root + all inserted, empty contestedToL1", () => {
    const { verdict } = enforceContestedBatch(input({ leaves: [leaf(), leafB()] }));
    expect(verdict.accepted).toBe(true);
    if (!verdict.accepted) return;
    expect(verdict.canonicalRoot).toBe(rootWith([[LEAF_A, BIND_A], [LEAF_B, BIND_B]]));
    expect(verdict.contestedToL1).toEqual([]);
    expect(verdict.inserted.map((i) => i.leafKeyHex).sort()).toEqual([LEAF_A, LEAF_B].sort());
  });

  it("is deterministic under leaf-order permutation", () => {
    const fwd = enforceContestedBatch(input({ leaves: [leaf(), leafB()] }));
    const rev = enforceContestedBatch(input({ leaves: [leafB(), leaf()] }));
    expect(fwd).toEqual(rev);
  });
});

describe("enforceContestedBatch — contested distinct-owner → L1", () => {
  it("a distinct-owner collision → contested-no-owner (absent from root), routed to L1", () => {
    const { verdict } = enforceContestedBatch(input({ leaves: [aContest(), bContest(), leafB()] }));
    expect(verdict.accepted).toBe(true);
    if (!verdict.accepted) return;
    expect(verdict.canonicalRoot).toBe(rootWith([[LEAF_B, BIND_B]])); // LEAF_A's owner NOT in the root
    expect(verdict.inserted.map((i) => i.leafKeyHex)).toEqual([LEAF_B]);
    expect(verdict.contestedToL1).toEqual([
      { leafKeyHex: LEAF_A, name: "alice", contendingOwners: [OWNER_A_ID, OWNER_B_ID] },
    ]);
  });

  it("a contest-only delta derives (canonicalRoot === prevRoot) and STILL routes to L1 — not a no-op", () => {
    const { verdict } = enforceContestedBatch(input({ leaves: [aContest(), bContest()] }));
    expect(verdict.accepted).toBe(true);
    if (!verdict.accepted) return;
    expect(verdict.canonicalRoot).toBe(PREV_ROOT); // unchanged, but accepted
    expect(verdict.inserted).toEqual([]);
    expect(verdict.contestedToL1).toEqual([
      { leafKeyHex: LEAF_A, name: "alice", contendingOwners: [OWNER_A_ID, OWNER_B_ID] },
    ]);
  });

  it("owner-extraction hygiene: only includable-priority owners, sorted, no winner field; excluded/non-priority excluded", () => {
    // A third LEAF_A claim that is non-priority (#69) must NOT enter contendingOwners.
    const cNonPriority = leaf(
      { leafKeyHex: LEAF_A, owner: { kind: "owner-key", ownerKeyHex: OWNER_C }, ownerValueBindingHex: BIND_C, batchId: "batch-5",
        daVerdict: { kind: "includable", firstCompleteServedHeight: 112, holdsPriority: false } },
      BIND_C,
    );
    const { verdict } = enforceContestedBatch(input({ leaves: [bContest(), aContest(), cNonPriority] })); // reversed order
    expect(verdict.accepted).toBe(true);
    if (!verdict.accepted) return;
    const routed = verdict.contestedToL1.find((c) => c.leafKeyHex === LEAF_A);
    expect(routed?.contendingOwners).toEqual([OWNER_A_ID, OWNER_B_ID]); // order-independent + C excluded
    expect(Object.keys(routed ?? {}).sort()).toEqual(["contendingOwners", "leafKeyHex", "name"]); // no winner field
  });
});

describe("enforceContestedBatch — coalesce / skip / fail-closed", () => {
  it("same-owner duplicates (same value) coalesce to one inserted, no contest", () => {
    const first = leaf({ duplicateHandling: "same-owner-duplicate" }, BIND_A);
    const second = leaf({ batchId: "batch-3", duplicateHandling: "same-owner-duplicate" }, BIND_A);
    const { verdict } = enforceContestedBatch(input({ leaves: [first, second] }));
    expect(verdict.accepted).toBe(true);
    if (!verdict.accepted) return;
    expect(verdict.canonicalRoot).toBe(rootWith([[LEAF_A, BIND_A]]));
    expect(verdict.contestedToL1).toEqual([]);
    expect(verdict.inserted).toEqual([{ leafKeyHex: LEAF_A, name: "alice", ownerValueHex: BIND_A }]);
  });

  it("a non-priority leaf alongside an inserted one is skipped (not inserted, not contested)", () => {
    const nonPriority = leaf(
      { name: "bob", leafKeyHex: LEAF_B, owner: { kind: "owner-key", ownerKeyHex: OWNER_B }, ownerValueBindingHex: BIND_B, batchId: "batch-2",
        daVerdict: { kind: "includable", firstCompleteServedHeight: 112, holdsPriority: false } },
      BIND_B,
    );
    const { verdict } = enforceContestedBatch(input({ leaves: [leaf(), nonPriority] }));
    expect(verdict.accepted).toBe(true);
    if (!verdict.accepted) return;
    expect(verdict.canonicalRoot).toBe(rootWith([[LEAF_A, BIND_A]])); // only LEAF_A
    expect(verdict.inserted.map((i) => i.leafKeyHex)).toEqual([LEAF_A]);
    expect(verdict.contestedToL1).toEqual([]);
  });

  it("a batch-local duplicate fails closed (dcv-batch-local-duplicate surfaced)", () => {
    const dupA = leaf({ batchLocalIndex: 1 }, BIND_A); // same key + same batchId (batch-1) as leaf()
    const { verdict } = enforceContestedBatch(input({ leaves: [leaf(), dupA] }));
    expect(verdict.accepted).toBe(false);
    if (verdict.accepted) return;
    expect(verdict.reason).toBe("dcv-batch-local-duplicate");
  });

  it("a winner-leakage projection (unique claimed for a collision) fails closed (dcv-projection-contradiction)", () => {
    const aUnique = leaf({ duplicateHandling: "unique" }, BIND_A);
    const bUnique = bClaimForA({ duplicateHandling: "unique" });
    const { verdict } = enforceContestedBatch(input({ leaves: [aUnique, bUnique, leafB()] }));
    expect(verdict.accepted).toBe(false);
    if (verdict.accepted) return;
    expect(verdict.reason).toBe("dcv-projection-contradiction");
  });

  it("a base that does not fold to prevRoot fails closed (dcv-base-mismatch)", () => {
    const { verdict } = enforceContestedBatch(input({ baseLeaves: [{ keyHex: BASE_KEY, valueHex: "99".repeat(32) }] }));
    expect(verdict.accepted).toBe(false);
    if (verdict.accepted) return;
    expect(verdict.reason).toBe("dcv-base-mismatch");
  });

  it("never throws on bogus input", () => {
    expect(() => enforceContestedBatch(null as unknown as DcvDerivationInput)).not.toThrow();
    expect(() => enforceContestedBatch({ base: 1 } as unknown as DcvDerivationInput)).not.toThrow();
  });
});
