import { describe, expect, it } from "vitest";

import { windowSchedule, type WindowScheduleInput } from "./window-schedule.js";

// Two distinct frozen constant sets so no launch value is baked in.
const SCHEDULE_A = { segments: [{ fromHeight: 0, floorBlocks: 1_008 }, { fromHeight: 900_000, floorBlocks: 504 }] };
const SCHEDULE_B = { segments: [{ fromHeight: 0, floorBlocks: 2_016 }, { fromHeight: 800_000, floorBlocks: 720 }] };

const at = (anchorHeight: number, floorConstants: WindowScheduleInput["floorConstants"], adaptiveExtensionBlocks?: number): WindowScheduleInput =>
  adaptiveExtensionBlocks === undefined
    ? { anchorHeight, floorConstants }
    : { anchorHeight, floorConstants, adaptiveExtensionBlocks };

describe("windowSchedule — height-keyed floor (B22/Z11), value-free at two constant sets", () => {
  it("computes the floor from the height-keyed schedule (windows reduce only by passage of block height)", () => {
    // SCHEDULE_A: <900_000 -> 1_008; >=900_000 -> 504 (a deterministic height decay, not market-driven).
    expect(windowSchedule(at(800_000, SCHEDULE_A))).toMatchObject({ computed: true, floorBlocks: 1_008, blocks: 1_008 });
    expect(windowSchedule(at(950_000, SCHEDULE_A))).toMatchObject({ computed: true, floorBlocks: 504, blocks: 504 });
    // SCHEDULE_B: a different frozen set — no baked constant.
    expect(windowSchedule(at(700_000, SCHEDULE_B))).toMatchObject({ computed: true, floorBlocks: 2_016 });
    expect(windowSchedule(at(850_000, SCHEDULE_B))).toMatchObject({ computed: true, floorBlocks: 720 });
  });

  it("is extend-only: a nonnegative extension yields blocks >= floorBlocks; absent extension = 0", () => {
    expect(windowSchedule(at(800_000, SCHEDULE_A, 144))).toMatchObject({ computed: true, floorBlocks: 1_008, blocks: 1_152 });
    expect(windowSchedule(at(800_000, SCHEDULE_A, 0))).toMatchObject({ blocks: 1_008 });
    const r = windowSchedule(at(950_000, SCHEDULE_A, 10));
    expect(r.computed && (r.blocks as number) >= (r.floorBlocks as number)).toBe(true);
  });
});

describe("windowSchedule — Z11 no shrink below the height-keyed floor", () => {
  it("rejects a negative (shrink) extension instead of normalizing it to 0", () => {
    expect(windowSchedule(at(800_000, SCHEDULE_A, -1))).toMatchObject({
      computed: false,
      blocks: null,
      floorBlocks: null,
      reason: "window-schedule-shrink-rejected",
    });
  });

  it("rejects a non-integer / overflow extension", () => {
    expect(windowSchedule(at(800_000, SCHEDULE_A, 1.5)).reason).toBe("window-schedule-extension-malformed");
    expect(windowSchedule(at(800_000, SCHEDULE_A, Number.MAX_SAFE_INTEGER)).reason).toBe("window-schedule-overflow");
  });
});

describe("windowSchedule — B22 no market-signal input channel (closed shape, top-level + nested)", () => {
  it("rejects a market-derived field at the top level", () => {
    for (const field of ["claimVolume", "bondTotals", "distinctKeys", "marketMaturity"]) {
      expect(windowSchedule({ ...at(800_000, SCHEDULE_A), [field]: 999 } as never)).toMatchObject({
        computed: false,
        reason: "window-schedule-input-malformed",
      });
    }
  });

  it("rejects a market-derived field smuggled inside floorConstants or a segment", () => {
    expect(
      windowSchedule({ anchorHeight: 800_000, floorConstants: { segments: SCHEDULE_A.segments, marketMaturity: 1 } } as never).reason
    ).toBe("window-schedule-floor-constants-malformed");
    expect(
      windowSchedule({ anchorHeight: 800_000, floorConstants: { segments: [{ fromHeight: 0, floorBlocks: 1_008, bondTotals: 5 }] } } as never).reason
    ).toBe("window-schedule-segment-malformed");
  });
});

describe("windowSchedule — total / fail-closed", () => {
  it("rejects malformed schedule shapes (empty, unordered, non-object, no applicable floor)", () => {
    expect(windowSchedule({ anchorHeight: 800_000, floorConstants: { segments: [] } }).reason).toBe("window-schedule-segments-malformed");
    expect(
      windowSchedule({ anchorHeight: 800_000, floorConstants: { segments: [{ fromHeight: 900_000, floorBlocks: 504 }, { fromHeight: 900_000, floorBlocks: 1_008 }] } }).reason
    ).toBe("window-schedule-segments-unordered");
    // anchor precedes the first segment -> no applicable floor
    expect(windowSchedule({ anchorHeight: 100, floorConstants: { segments: [{ fromHeight: 900_000, floorBlocks: 504 }] } }).reason).toBe(
      "window-schedule-no-applicable-floor"
    );
    expect(windowSchedule(null as never).computed).toBe(false);
    expect(windowSchedule(at(-1, SCHEDULE_A)).reason).toBe("window-schedule-anchor-height-malformed");
  });

  it("is deterministic on identical inputs", () => {
    const i = at(950_000, SCHEDULE_A, 12);
    expect(windowSchedule(i)).toEqual(windowSchedule(i));
  });
});
