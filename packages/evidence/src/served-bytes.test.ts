// D-SB-bind conformance battery (B3_EVIDENCE_HARDENING.md §9 / E-SB1, E-SB3,
// E-ND1; conforms to #51 + #52 full-batch recompute + #53 prevRoot=R_{h-K} + WIRE
// §4.4). The served delta applied onto the base (root = prevRoot) must recompute to
// anchoredRoot (newRoot) — COMPLETENESS from prevRoot, not from-empty. Then the
// kernel deadline composition runs over an already-verified height.
import { createDaWindowParams, holdsPriority, includable, type AnchorFacts } from "@ont/consensus";
import { accumulatorRootOf } from "@ont/protocol";
import { describe, expect, it } from "vitest";

import {
  bindServedBytes,
  toServedEvidence,
  type ServedLeaf,
  type VerifiedAvailabilityHeight,
} from "./served-bytes.js";

const KEY_A = "aa".repeat(32);
const KEY_B = "bb".repeat(32);
const KEY_C = "cc".repeat(32);
const VAL_A = "11".repeat(32);
const VAL_B = "22".repeat(32);
const VAL_C = "33".repeat(32);

// Non-genesis batch: base = {A}, this batch's delta = {B}, newRoot = root(A,B).
const BASE = new Map([[KEY_A, VAL_A]]);
const PREV_ROOT = accumulatorRootOf(BASE);
const DELTA: ServedLeaf[] = [{ keyHex: KEY_B, valueHex: VAL_B }];
const NEW_ROOT = accumulatorRootOf(
  new Map([
    [KEY_A, VAL_A],
    [KEY_B, VAL_B],
  ]),
);
const ROOT_B_ONLY = accumulatorRootOf(new Map([[KEY_B, VAL_B]])); // from-empty {B}
const EMPTY_ROOT = accumulatorRootOf(new Map());

const ANCHOR_HEIGHT = 100;
const BINDING = { anchorHeight: ANCHOR_HEIGHT, prevRoot: PREV_ROOT, anchoredRoot: NEW_ROOT };
const PARAMS = createDaWindowParams({ K: 6, W: 2, C: 3 }); // h+W = 102, h+W+C = 105
const anchor = (over: Partial<AnchorFacts> = {}): AnchorFacts => ({
  minedHeight: ANCHOR_HEIGHT,
  anchoredRoot: NEW_ROOT,
  batchSize: 1,
  ...over,
});

// Test-only: simulate a height the D-SB-avail verifier has already checked.
const verified = (n: number): VerifiedAvailabilityHeight => n as unknown as VerifiedAvailabilityHeight;
const evidence = (firstServableHeight: number) =>
  toServedEvidence(bindServedBytes(BASE, DELTA, BINDING), verified(firstServableHeight));

describe("D-SB-bind served-bytes binding (B3)", () => {
  it("E-SB1: a non-genesis delta applied onto prevRoot reconstructs newRoot and is includable", () => {
    const bound = bindServedBytes(BASE, DELTA, BINDING);
    expect(bound.batchSize).toBe(1); // served delta count, not the whole base
    expect(bound.anchoredRoot).toBe(NEW_ROOT);
    const ev = toServedEvidence(bound, verified(101));
    expect(includable(anchor(), ev, PARAMS)).toBe(true); // 101 ≤ 105
    expect(holdsPriority(anchor(), ev, PARAMS)).toBe(true); // 101 ≤ 102
  });

  it("E-SB1: a genesis batch binds against the empty-base root", () => {
    const bound = bindServedBytes(
      new Map(),
      [
        { keyHex: KEY_A, valueHex: VAL_A },
        { keyHex: KEY_B, valueHex: VAL_B },
      ],
      { anchorHeight: ANCHOR_HEIGHT, prevRoot: EMPTY_ROOT, anchoredRoot: NEW_ROOT },
    );
    expect(bound.batchSize).toBe(2);
    expect(bound.anchoredRoot).toBe(NEW_ROOT);
  });

  it("E-SB1: the from-empty trap — serving {B} against root(B) when prevRoot=root(A) is rejected", () => {
    // The old (buggy) contract would accept this; the prevRoot→newRoot check rejects it.
    expect(() =>
      bindServedBytes(BASE, DELTA, { anchorHeight: ANCHOR_HEIGHT, prevRoot: PREV_ROOT, anchoredRoot: ROOT_B_ONLY }),
    ).toThrow();
  });

  it("E-SB1: a stale/wrong prevRoot is rejected", () => {
    expect(() =>
      bindServedBytes(BASE, DELTA, { anchorHeight: ANCHOR_HEIGHT, prevRoot: ROOT_B_ONLY, anchoredRoot: NEW_ROOT }),
    ).toThrow();
  });

  it("E-SB1 completeness/insert-only: extra leaf, empty delta, and non-disjoint delta all fail closed", () => {
    // Extra leaf — root(A,B,C) ≠ newRoot.
    expect(() =>
      bindServedBytes(BASE, [...DELTA, { keyHex: KEY_C, valueHex: VAL_C }], BINDING),
    ).toThrow();
    // Empty served delta.
    expect(() => bindServedBytes(BASE, [], BINDING)).toThrow();
    // Delta key already in the base — not insert-only (DA agreement §5 / D7).
    expect(() =>
      bindServedBytes(BASE, [{ keyHex: KEY_A, valueHex: VAL_A }], { ...BINDING, anchoredRoot: PREV_ROOT }),
    ).toThrow();
  });

  it("E-SB1 deadlines: inside (h+W, h+W+C] is includable but not priority; past h+W+C neither", () => {
    expect(includable(anchor(), evidence(104), PARAMS)).toBe(true);
    expect(holdsPriority(anchor(), evidence(104), PARAMS)).toBe(false);
    expect(includable(anchor(), evidence(106), PARAMS)).toBe(false);
    expect(holdsPriority(anchor(), evidence(106), PARAMS)).toBe(false);
  });

  it("E-SB3 binding: the witness does not count against a different anchor / root / batchSize", () => {
    const ev = evidence(101);
    expect(includable(anchor({ anchoredRoot: "00".repeat(32) }), ev, PARAMS)).toBe(false);
    expect(includable(anchor({ batchSize: 3 }), ev, PARAMS)).toBe(false);
    expect(includable(anchor({ minedHeight: 999 }), ev, PARAMS)).toBe(false);
  });

  it("E-ND1 baseline: absent evidence fails closed through includable / holdsPriority", () => {
    expect(includable(anchor(), null, PARAMS)).toBe(false);
    expect(holdsPriority(anchor(), null, PARAMS)).toBe(false);
  });
});
