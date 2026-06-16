// D-SB-avail conformance battery (B3_EVIDENCE_HARDENING.md §5.2 / E-AV1..E-AV4;
// RATIFIED #84 availability-height, O1 + O3). O1: firstServableHeight = the CONFIRMED
// anchor mined height h, gated on the PRESENTED bytes reconstructing the anchored
// commitment; fail closed otherwise; never producer-attested. The height always
// collapses to h — no late-served (h+W, h+W+C] branch for the accumulator path.
//
// Tests-first RED battery: the positive vectors fail against the slice-3 stub, and the
// negative vectors assert the SPECIFIC fail-closed message (not the stub sentinel), so
// the whole battery is red until the O1 implementation lands.
import { createDaWindowParams, holdsPriority, includable, type AnchorFacts } from "@ont/consensus";
import { accumulatorRootOf } from "@ont/protocol";
import { describe, expect, it } from "vitest";

import { verifyAvailabilityHeight, type AvailabilityInput } from "./served-availability.js";
import { toServedEvidence, type ServedLeaf } from "./served-bytes.js";

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

const ANCHOR_HEIGHT = 100;
const BINDING = { anchorHeight: ANCHOR_HEIGHT, prevRoot: PREV_ROOT, anchoredRoot: NEW_ROOT };
const PARAMS = createDaWindowParams({ K: 6, W: 2, C: 3 }); // h+W = 102, h+W+C = 105
const anchor = (over: Partial<AnchorFacts> = {}): AnchorFacts => ({
  minedHeight: ANCHOR_HEIGHT,
  anchoredRoot: NEW_ROOT,
  batchSize: 1,
  ...over,
});

const input = (over: Partial<AvailabilityInput> = {}): AvailabilityInput => ({
  baseLeaves: BASE,
  servedDelta: DELTA,
  binding: BINDING,
  confirmedAnchorMinedHeight: ANCHOR_HEIGHT,
  ...over,
});

describe("D-SB-avail first-servable-height (B3; #84 O1+O3)", () => {
  it("E-AV1: presented bytes reconstruct → mints h; the kernel reads includable + priority", () => {
    const { bound, firstServableHeight } = verifyAvailabilityHeight(input());
    expect(firstServableHeight).toBe(ANCHOR_HEIGHT); // O1: the height IS the confirmed mined height h
    expect(bound.batchSize).toBe(1); // served delta count
    expect(bound.anchoredRoot).toBe(NEW_ROOT);
    const ev = toServedEvidence(bound, firstServableHeight);
    expect(ev.firstServableHeight).toBe(ANCHOR_HEIGHT);
    expect(includable(anchor(), ev, PARAMS)).toBe(true); // 100 ≤ 105
    expect(holdsPriority(anchor(), ev, PARAMS)).toBe(true); // 100 ≤ 102
  });

  it("E-AV2: bytes that do not reconstruct the anchored commitment fail closed (no mint)", () => {
    // Missing leaf (empty delta), extra leaf, and a stale/wrong prevRoot all fail closed —
    // O1 mints nothing when the presented witness does not reconstruct the commitment.
    expect(() => verifyAvailabilityHeight(input({ servedDelta: [] }))).toThrow(/reconstruct|empty|prevRoot|insert-only/);
    expect(() =>
      verifyAvailabilityHeight(input({ servedDelta: [...DELTA, { keyHex: KEY_C, valueHex: VAL_C }] })),
    ).toThrow(/reconstruct|incomplete|extra/);
    expect(() => verifyAvailabilityHeight(input({ binding: { ...BINDING, prevRoot: NEW_ROOT } }))).toThrow(
      /prevRoot|reconstruct/,
    );
  });

  it("E-AV3: a confirmed mined height disagreeing with the binding anchor (an attested height) fails closed", () => {
    // The producer presents bytes for anchor height 100 but claims a confirmed height of 200:
    // the stamped height must be the confirmed mined height of the SAME anchor, never attested.
    expect(() => verifyAvailabilityHeight(input({ confirmedAnchorMinedHeight: 200 }))).toThrow(
      /mined height|anchor height|attested|provenance/,
    );
    // A malformed (negative / non-integer) confirmed height fails closed.
    expect(() => verifyAvailabilityHeight(input({ confirmedAnchorMinedHeight: -1 }))).toThrow(
      /mined height|non-negative|integer/,
    );
    expect(() => verifyAvailabilityHeight(input({ confirmedAnchorMinedHeight: 1.5 }))).toThrow(/mined height|integer/);
  });

  it("E-AV4: O1 collapse — the minted height is exactly the confirmed mined height, never a presentation time", () => {
    // A reconstructing batch mints exactly h; there is no late-served (h+W, h+W+C] height for the
    // accumulator path (#84 amendment). Two anchors at different mined heights each mint their own h,
    // proving the height tracks the confirmed mined height, not any served/presentation time.
    expect(verifyAvailabilityHeight(input()).firstServableHeight).toBe(ANCHOR_HEIGHT);
    const newRoot90 = accumulatorRootOf(
      new Map([
        [KEY_A, VAL_A],
        [KEY_C, VAL_C],
      ]),
    );
    const r = verifyAvailabilityHeight({
      baseLeaves: BASE,
      servedDelta: [{ keyHex: KEY_C, valueHex: VAL_C }],
      binding: { anchorHeight: 90, prevRoot: PREV_ROOT, anchoredRoot: newRoot90 },
      confirmedAnchorMinedHeight: 90,
    });
    expect(r.firstServableHeight).toBe(90);
  });
});
