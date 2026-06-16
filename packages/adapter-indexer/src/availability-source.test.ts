import { describe, expect, it } from "vitest";
import { accumulatorRootOf } from "@ont/protocol";
import { verifyAvailabilityHeight, type ServedLeaf } from "@ont/evidence";
import {
  createAvailabilitySource,
  verifyBaseLeaves,
  verifyServedDelta,
  type IndexedBatchRecord,
  type VerifyServedDeltaInput,
} from "./availability-source.js";

// B4-INDEX-DATASOURCE red battery (B4_ADAPTERS_PLAN §9.8). The two availability accessors are firewall-
// minted: a verified base map + a verified served delta, piped into the REAL verifyAvailabilityHeight — a
// withheld / tampered / unverifiable source mints null so the B3 availability stage cannot reconstruct a
// false root. RED until the cores land (the stubs return null).

const BASE_KEY = "11".repeat(32);
const BASE_VAL = "22".repeat(32);
const baseLeaves = new Map<string, string>([[BASE_KEY, BASE_VAL]]);
const PREV_ROOT = accumulatorRootOf(baseLeaves);
const EMPTY_ROOT = accumulatorRootOf(new Map());

const served: readonly ServedLeaf[] = [
  { keyHex: "33".repeat(32), valueHex: "44".repeat(32) },
  { keyHex: "55".repeat(32), valueHex: "66".repeat(32) },
];
const fullLeaves = new Map<string, string>([
  [BASE_KEY, BASE_VAL],
  ["33".repeat(32), "44".repeat(32)],
  ["55".repeat(32), "66".repeat(32)],
]);
const ANCHORED_ROOT = accumulatorRootOf(fullLeaves);
const ANCHOR_HEIGHT = 800_000;

const SORTED_SERVED = [...served].sort((a, b) => (a.keyHex < b.keyHex ? -1 : a.keyHex > b.keyHex ? 1 : 0));

function validServed(over: Partial<VerifyServedDeltaInput> = {}): VerifyServedDeltaInput {
  return { prevRoot: PREV_ROOT, anchoredRoot: ANCHORED_ROOT, baseLeaves, presentedServed: served, ...over };
}
const RECORD: IndexedBatchRecord = { prevRoot: PREV_ROOT, anchoredRoot: ANCHORED_ROOT, baseLeaves, presentedServed: served };

describe("verifyBaseLeaves — base firewall (fresh canonical copy; never an empty default)", () => {
  it("a base that verifies to prevRoot → a FRESH canonical Map (not caller-owned)", () => {
    const r = verifyBaseLeaves(PREV_ROOT, baseLeaves);
    expect(r).not.toBeNull();
    if (r === null) return;
    expect(r).toEqual(baseLeaves);
    expect(r).not.toBe(baseLeaves); // fresh copy out, never the caller's material
  });

  it("a genesis empty Map is valid ONLY for the empty prevRoot", () => {
    const r = verifyBaseLeaves(EMPTY_ROOT, new Map());
    expect(r).not.toBeNull();
    expect(r?.size).toBe(0);
  });

  it("a base that does not verify to prevRoot → null", () => {
    expect(verifyBaseLeaves("ab".repeat(32), baseLeaves)).toBeNull();
  });

  it("a non-lowercase-hex / non-32-byte key or value → null", () => {
    expect(verifyBaseLeaves(PREV_ROOT, new Map([["AA".repeat(32), BASE_VAL]]))).toBeNull();
    expect(verifyBaseLeaves(PREV_ROOT, new Map([[BASE_KEY, "GG".repeat(32)]]))).toBeNull();
  });

  it("a non-Map (map-like object) or null base → null (never synthesized into an empty accumulator)", () => {
    expect(verifyBaseLeaves(PREV_ROOT, { get: () => BASE_VAL } as unknown as ReadonlyMap<string, string>)).toBeNull();
    expect(verifyBaseLeaves(PREV_ROOT, null as unknown as ReadonlyMap<string, string>)).toBeNull();
  });
});

describe("verifyServedDelta — served firewall (reconstructs anchoredRoot over the verified base)", () => {
  it("a served delta reconstructing anchoredRoot → a FRESH array sorted by keyHex", () => {
    const r = verifyServedDelta(validServed());
    expect(r).not.toBeNull();
    if (r === null) return;
    expect(r).toEqual(SORTED_SERVED);
    expect(r).not.toBe(served);
  });

  it("is order-independent (input permutation → identical sorted output)", () => {
    const a = verifyServedDelta(validServed());
    const b = verifyServedDelta(validServed({ presentedServed: [...served].reverse() }));
    expect(a).not.toBeNull();
    expect(a).toEqual(b);
  });

  it("withheld / empty served → null (non-empty required)", () => {
    expect(verifyServedDelta(validServed({ presentedServed: [] }))).toBeNull();
  });

  it("a tampered/omitted leaf so root(base ∪ served) !== anchoredRoot → null", () => {
    expect(verifyServedDelta(validServed({ presentedServed: [served[0]!] }))).toBeNull();
  });

  it("a served leaf already in the base (non-disjoint) → null (insert-only)", () => {
    expect(verifyServedDelta(validServed({ presentedServed: [{ keyHex: BASE_KEY, valueHex: BASE_VAL }, ...served] }))).toBeNull();
  });

  it("a non-lowercase-hex served key/value → null", () => {
    expect(verifyServedDelta(validServed({ presentedServed: [{ keyHex: "AB".repeat(32), valueHex: "44".repeat(32) }] }))).toBeNull();
  });

  it("an internally duplicated served key → null", () => {
    expect(verifyServedDelta(validServed({ presentedServed: [served[0]!, served[0]!] }))).toBeNull();
  });

  it("a non-lowercase-hex prevRoot / anchoredRoot → null", () => {
    expect(verifyServedDelta(validServed({ prevRoot: "XY".repeat(32) }))).toBeNull();
    expect(verifyServedDelta(validServed({ anchoredRoot: "XY".repeat(32) }))).toBeNull();
  });

  it("a base that does not verify to prevRoot → null (no served accept over an unverified base)", () => {
    expect(verifyServedDelta(validServed({ prevRoot: "ab".repeat(32) }))).toBeNull();
  });
});

describe("createAvailabilitySource — the cross-bound BatchDataSource availability wrapper", () => {
  it("firewall-positive: both accessors → the REAL verifyAvailabilityHeight reconstructs anchoredRoot", () => {
    const src = createAvailabilitySource([RECORD]);
    const base = src.baseLeavesForPrevRoot(PREV_ROOT);
    const servedDelta = src.servedLeavesForRoot(ANCHORED_ROOT);
    expect(base).not.toBeNull();
    expect(servedDelta).not.toBeNull();
    if (base === null || servedDelta === null) return;
    const availability = verifyAvailabilityHeight({
      baseLeaves: base,
      servedDelta,
      binding: { anchorHeight: ANCHOR_HEIGHT, prevRoot: PREV_ROOT, anchoredRoot: ANCHORED_ROOT },
      confirmedAnchorMinedHeight: ANCHOR_HEIGHT,
    });
    expect(availability.firstServableHeight).toBe(ANCHOR_HEIGHT);
    expect(availability.bound.anchoredRoot).toBe(ANCHORED_ROOT);
  });

  it("an unknown root → null (no record)", () => {
    const src = createAvailabilitySource([RECORD]);
    expect(src.baseLeavesForPrevRoot("ab".repeat(32))).toBeNull();
    expect(src.servedLeavesForRoot("cd".repeat(32))).toBeNull();
  });

  it("cross-bind: a record whose base does not verify to its prevRoot → servedLeavesForRoot null", () => {
    const wrongBase: IndexedBatchRecord = { prevRoot: PREV_ROOT, anchoredRoot: ANCHORED_ROOT, baseLeaves: new Map([["77".repeat(32), "88".repeat(32)]]), presentedServed: served };
    const src = createAvailabilitySource([wrongBase]);
    expect(src.servedLeavesForRoot(ANCHORED_ROOT)).toBeNull(); // not a raw payload lookup
  });

  it("never throws on bogus input", () => {
    expect(() => verifyBaseLeaves(null as unknown as string, null as unknown as ReadonlyMap<string, string>)).not.toThrow();
    expect(() => verifyServedDelta(null as unknown as VerifyServedDeltaInput)).not.toThrow();
    expect(() => createAvailabilitySource([]).servedLeavesForRoot("ab".repeat(32))).not.toThrow();
  });
});
