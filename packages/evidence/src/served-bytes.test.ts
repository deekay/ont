// D-SB-bind conformance battery (B3_EVIDENCE_HARDENING.md §9 / E-SB1, E-SB3,
// E-ND1; conforms to served-evidence-interface #51 + commitment-match #52). The
// served leaf SET must recompute to anchoredRoot (COMPLETENESS, not inclusion);
// then the kernel deadline composition runs over an already-verified height. A
// forged/unbound witness must produce the same reject EFFECT as no-witness (E-ND1).
import { createDaWindowParams, holdsPriority, includable, type AnchorFacts } from "@ont/consensus";
import { describe, expect, it } from "vitest";

import { accumulatorRootOf } from "./membership.js";
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

const COMMITTED = new Map([
  [KEY_A, VAL_A],
  [KEY_B, VAL_B],
]);
const ROOT = accumulatorRootOf(COMMITTED); // the anchor's committed root over {A,B}
const SERVED: ServedLeaf[] = [
  { keyHex: KEY_A, valueHex: VAL_A },
  { keyHex: KEY_B, valueHex: VAL_B },
];

const ANCHOR_HEIGHT = 100;
const PARAMS = createDaWindowParams({ K: 6, W: 2, C: 3 }); // h+W = 102, h+W+C = 105
const anchor = (over: Partial<AnchorFacts> = {}): AnchorFacts => ({
  minedHeight: ANCHOR_HEIGHT,
  anchoredRoot: ROOT,
  batchSize: 2,
  ...over,
});

// Test-only: simulate a height the D-SB-avail verifier has already checked against
// confirmed-chain facts. Production code can only obtain this brand from D-SB-avail.
const verified = (n: number): VerifiedAvailabilityHeight => n as unknown as VerifiedAvailabilityHeight;

const evidence = (firstServableHeight: number) =>
  toServedEvidence(
    bindServedBytes(SERVED, { anchorHeight: ANCHOR_HEIGHT, anchoredRoot: ROOT }),
    verified(firstServableHeight),
  );

describe("D-SB-bind served-bytes binding (B3)", () => {
  it("E-SB1: the complete served set recomputes to anchoredRoot and the witness is includable", () => {
    const bound = bindServedBytes(SERVED, { anchorHeight: ANCHOR_HEIGHT, anchoredRoot: ROOT });
    expect(bound.batchSize).toBe(2);
    expect(bound.anchoredRoot).toBe(ROOT);
    const ev = toServedEvidence(bound, verified(101));
    expect(includable(anchor(), ev, PARAMS)).toBe(true); // 101 ≤ 105
    expect(holdsPriority(anchor(), ev, PARAMS)).toBe(true); // 101 ≤ 102
  });

  it("E-SB1 completeness: omitted / extra / duplicate / hidden-leaf served sets fail closed", () => {
    // Omit a committed leaf — recomputed root ≠ anchoredRoot.
    expect(() => bindServedBytes([SERVED[0]!], { anchorHeight: ANCHOR_HEIGHT, anchoredRoot: ROOT })).toThrow();
    // Serve an extra leaf not in the committed set.
    expect(() =>
      bindServedBytes([...SERVED, { keyHex: KEY_C, valueHex: VAL_C }], {
        anchorHeight: ANCHOR_HEIGHT,
        anchoredRoot: ROOT,
      }),
    ).toThrow();
    // Duplicate a served key (e.g. serve [A, A] to fake batchSize).
    expect(() =>
      bindServedBytes([SERVED[0]!, { keyHex: KEY_A, valueHex: VAL_A }], {
        anchorHeight: ANCHOR_HEIGHT,
        anchoredRoot: ROOT,
      }),
    ).toThrow();
    // Anchor a 3-leaf root but serve only 2 valid members — recompute catches it.
    const root3 = accumulatorRootOf(new Map([...COMMITTED, [KEY_C, VAL_C]]));
    expect(() => bindServedBytes(SERVED, { anchorHeight: ANCHOR_HEIGHT, anchoredRoot: root3 })).toThrow();
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
