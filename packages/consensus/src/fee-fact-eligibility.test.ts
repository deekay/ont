import { describe, expect, it } from "vitest";

import { feeFactEligibility } from "./fee-fact-eligibility.js";

describe("feeFactEligibility — F9 K-depth gate + own-intrinsic-fee selection", () => {
  it("contributes no fee fact before K-depth (reorged-out / pre-K anchor)", () => {
    expect(feeFactEligibility({ reachedKDepthOnCanonicalChain: false, intrinsicFeeSats: 100_000n })).toEqual({
      contributesFeeFact: false,
      feeFactSats: null,
      reason: "f9-not-k-deep-no-fee-fact",
    });
    // independent of the anchor's own fee amount — even a huge fee contributes nothing before K-depth.
    expect(feeFactEligibility({ reachedKDepthOnCanonicalChain: false, intrinsicFeeSats: 9_999_999n }).contributesFeeFact).toBe(false);
  });

  it("contributes the anchor's OWN intrinsic fee once K-deep — source selection, not economics", () => {
    // a re-mined replacement with a LOWER own fee still contributes its OWN fee (never an orphan's higher fee).
    expect(feeFactEligibility({ reachedKDepthOnCanonicalChain: true, intrinsicFeeSats: 1_000n })).toEqual({
      contributesFeeFact: true,
      feeFactSats: 1_000n,
      reason: "f9-k-deep-fee-fact-own-intrinsic-fee",
    });
    expect(feeFactEligibility({ reachedKDepthOnCanonicalChain: true, intrinsicFeeSats: 250_000n }).feeFactSats).toBe(250_000n);
    expect(feeFactEligibility({ reachedKDepthOnCanonicalChain: true, intrinsicFeeSats: 0n }).contributesFeeFact).toBe(true); // zero own fee is still a fact (economics gate downstream)
  });

  it("has no orphan / previous / first-seen fee or confirmationDepth / K input channel (closed shape)", () => {
    for (const field of ["orphanFeeSats", "previousFeeSats", "firstSeenFeeSats", "confirmationDepth", "K"]) {
      const r = feeFactEligibility({ reachedKDepthOnCanonicalChain: true, intrinsicFeeSats: 1_000n, [field]: 9_999_999n } as never);
      expect(r).toMatchObject({ contributesFeeFact: false, feeFactSats: null, reason: "f9-input-malformed" });
    }
  });

  it("fails closed on malformed input without throwing", () => {
    expect(feeFactEligibility(null as never).contributesFeeFact).toBe(false);
    expect(feeFactEligibility({ reachedKDepthOnCanonicalChain: "yes" as never, intrinsicFeeSats: 1n }).reason).toBe("f9-k-depth-fact-malformed");
    expect(feeFactEligibility({ reachedKDepthOnCanonicalChain: true, intrinsicFeeSats: -1n }).reason).toBe("f9-intrinsic-fee-malformed");
    expect(feeFactEligibility({ reachedKDepthOnCanonicalChain: true, intrinsicFeeSats: 5 as never }).reason).toBe("f9-intrinsic-fee-malformed");
  });

  it("is deterministic on identical inputs", () => {
    const i = { reachedKDepthOnCanonicalChain: true, intrinsicFeeSats: 1_000n } as const;
    expect(feeFactEligibility(i)).toEqual(feeFactEligibility(i));
  });
});
