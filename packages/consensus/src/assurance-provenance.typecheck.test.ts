import { describe, expect, it } from "vitest";

import type { AssuranceProvenance } from "./engine.js";

type AcceptsAssuranceProvenance<T extends AssuranceProvenance> = T;

type AccumulatorFinalizedHeightMayBeNumber = AcceptsAssuranceProvenance<{
  readonly tier: "accumulator-batched";
  readonly availabilityMode: "O1-collapsed";
  readonly priorityBearing: false;
  readonly finalizedAtHeight: 500;
  readonly anchorHeight: 500;
}>;

// @ts-expect-error Accumulator-batched provenance is never priority-bearing.
type AccumulatorPriorityBearingTrueRejected = AcceptsAssuranceProvenance<{
  readonly tier: "accumulator-batched";
  readonly availabilityMode: "O1-collapsed";
  readonly priorityBearing: true;
  readonly finalizedAtHeight: null;
  readonly anchorHeight: 500;
}>;

describe("AssuranceProvenance type contract", () => {
  it("admits accumulator finalization height without priority-bearing authority", () => {
    const finalizedAccumulatorProvenance = {
      tier: "accumulator-batched",
      availabilityMode: "O1-collapsed",
      priorityBearing: false,
      finalizedAtHeight: 500,
      anchorHeight: 500,
    } satisfies AccumulatorFinalizedHeightMayBeNumber;

    expect(finalizedAccumulatorProvenance.priorityBearing).toBe(false);
    expect(finalizedAccumulatorProvenance.finalizedAtHeight).toBe(500);
  });
});
