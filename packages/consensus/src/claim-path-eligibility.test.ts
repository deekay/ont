import { describe, expect, it } from "vitest";

import { claimPathEligibility } from "./claim-path-eligibility.js";

describe("claimPathEligibility — F15 short-name threshold (PR-15), parameterized", () => {
  it("a name <= T is bond-first only; a name > T may cheap-claim — at two thresholds (no baked constant)", () => {
    for (const T of [4, 8]) {
      // length <= T -> bond-first only
      expect(claimPathEligibility(T, T)).toEqual({ cheapClaimAllowed: false, reason: "f15-short-name-bond-first-only" });
      expect(claimPathEligibility(1, T).cheapClaimAllowed).toBe(false);
      // length T+1 -> cheap claim allowed
      expect(claimPathEligibility(T + 1, T)).toEqual({ cheapClaimAllowed: true, reason: "f15-cheap-claim-allowed" });
      expect(claimPathEligibility(20, T).cheapClaimAllowed).toBe(true);
    }
  });

  it("fails closed on malformed length or threshold (no cheap path), never throws", () => {
    expect(claimPathEligibility(0, 4).reason).toBe("f15-name-length-malformed"); // names are >= 1 byte
    expect(claimPathEligibility(-1, 4).cheapClaimAllowed).toBe(false);
    expect(claimPathEligibility(1.5 as never, 4).cheapClaimAllowed).toBe(false);
    expect(claimPathEligibility(5, 0).reason).toBe("f15-threshold-malformed");
    expect(claimPathEligibility(5, null as never).cheapClaimAllowed).toBe(false);
  });

  it("is deterministic on identical inputs", () => {
    expect(claimPathEligibility(5, 4)).toEqual(claimPathEligibility(5, 4));
  });
});
