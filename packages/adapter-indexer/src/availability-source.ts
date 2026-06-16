import { accumulatorRootOf } from "@ont/protocol";
import type { ServedLeaf } from "@ont/evidence";
import type { BatchDataSource } from "@ont/claim-path";

// B4-INDEX-DATASOURCE (B4_ADAPTERS_PLAN §9.8) — the availability seam: the two BatchDataSource accessors
// the B3 availability stage (verifyAvailabilityHeight) consumes. Both are firewall-minted
// (recompute-don't-trust): a withheld / tampered / unverifiable source mints null, so the stage fails
// closed (base-leaves-absent / served-bytes-withheld) and can never reconstruct a false root. The indexer
// supplies NO height / window / shortcut — only a verified base map + a verified served delta.
//
// Invariants (CL): a real Map only (never a map-like object); every key/value 32-byte LOWERCASE hex;
// accumulatorRootOf wrapped (malformed → null, never a throw); FRESH canonical copies out (never
// caller-owned material); null/missing base NEVER synthesized into an empty accumulator (an explicit empty
// Map is valid ONLY for a genesis empty prevRoot); servedLeavesForRoot is cross-bound to the indexed
// prevRoot/baseLeaves for that anchoredRoot (not a raw payload lookup).

/** The two availability accessors of the B3 BatchDataSource seam (the rest = ANCHOR/COMMIT slices). */
export type AvailabilitySource = Pick<BatchDataSource, "baseLeavesForPrevRoot" | "servedLeavesForRoot">;

/** One indexed batch record: the anchored identity + its verified-against base + the presented served bytes. */
export interface IndexedBatchRecord {
  readonly prevRoot: string;
  readonly anchoredRoot: string;
  readonly baseLeaves: ReadonlyMap<string, string>;
  readonly presentedServed: readonly ServedLeaf[];
}

const HEX_64_LOWER = /^[0-9a-f]{64}$/;

/**
 * GREEN contract — `verifyBaseLeaves(prevRoot, baseLeaves)`:
 *   require a real Map (else null; never synthesize from null/missing); prevRoot lowercase 32-byte hex;
 *   every key + value lowercase 32-byte hex; build a FRESH canonical Map; accumulatorRootOf(fresh) ===
 *   prevRoot ? the fresh Map : null. A genesis empty Map is valid iff prevRoot === accumulatorRootOf(∅).
 *   Total + fail-closed; accumulatorRootOf wrapped; never throws; never returns caller-owned material.
 *
 * STUB (tests-first): returns null until implemented.
 */
export function verifyBaseLeaves(
  _prevRoot: string,
  _baseLeaves: ReadonlyMap<string, string>,
): ReadonlyMap<string, string> | null {
  void accumulatorRootOf;
  void HEX_64_LOWER;
  return null;
}

export interface VerifyServedDeltaInput {
  readonly prevRoot: string;
  readonly anchoredRoot: string;
  readonly baseLeaves: ReadonlyMap<string, string>;
  readonly presentedServed: readonly ServedLeaf[];
}

/**
 * GREEN contract — `verifyServedDelta({ prevRoot, anchoredRoot, baseLeaves, presentedServed })`:
 *   prevRoot + anchoredRoot lowercase 32-byte hex; base = verifyBaseLeaves(prevRoot, baseLeaves) (else null);
 *   presentedServed non-empty; every leaf keyHex+valueHex lowercase 32-byte hex; insert-only disjoint from
 *   the base + internally unique (duplicate key → null); accumulatorRootOf(base ∪ served) === anchoredRoot
 *   ? a FRESH array of FRESH { keyHex, valueHex } objects SORTED by keyHex : null (never caller-owned leaf
 *   objects). Total + fail-closed; never throws.
 *
 * STUB (tests-first): returns null until implemented.
 */
export function verifyServedDelta(_input: VerifyServedDeltaInput): readonly ServedLeaf[] | null {
  return null;
}

/**
 * The thin BatchDataSource availability wrapper, keyed by root over indexed records. Decides nothing — each
 * accessor runs the firewall core. `servedLeavesForRoot(anchoredRoot)` is CROSS-BOUND: it verifies the
 * record's served payload against THAT record's indexed prevRoot/baseLeaves, not a raw payload lookup.
 */
export function createAvailabilitySource(records: readonly IndexedBatchRecord[]): AvailabilitySource {
  return {
    baseLeavesForPrevRoot(prevRoot: string): ReadonlyMap<string, string> | null {
      const record = records.find((r) => r.prevRoot === prevRoot);
      if (record === undefined) return null;
      return verifyBaseLeaves(prevRoot, record.baseLeaves);
    },
    servedLeavesForRoot(anchoredRoot: string): readonly ServedLeaf[] | null {
      const record = records.find((r) => r.anchoredRoot === anchoredRoot);
      if (record === undefined) return null;
      return verifyServedDelta({
        prevRoot: record.prevRoot,
        anchoredRoot,
        baseLeaves: record.baseLeaves,
        presentedServed: record.presentedServed,
      });
    },
  };
}
