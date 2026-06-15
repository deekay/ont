import { describe, expect, it } from "vitest";

import { acceptPostFinalAttempt, type PostFinalAttemptInput } from "./post-final-attempt.js";

const OWNER = "a".repeat(64);
const finalName = (kind: "claim" | "bond"): PostFinalAttemptInput => ({
  incumbent: { status: "final", ownerKey: OWNER },
  attempt: { kind },
});

describe("acceptPostFinalAttempt — B7 post-final no-effect gate", () => {
  it("refuses a post-final CLAIM with no state effect and the incumbent byte-unchanged", () => {
    expect(acceptPostFinalAttempt(finalName("claim"))).toEqual({
      refused: true,
      stateEffect: "none",
      incumbentUnchanged: true,
      reason: "b7-post-final-attempt-already-owned",
    });
  });

  it("refuses a post-final BOND identically — opens no auction, evicts no owner", () => {
    expect(acceptPostFinalAttempt(finalName("bond"))).toMatchObject({
      refused: true,
      stateEffect: "none",
      incumbentUnchanged: true,
    });
  });

  it("fails closed (never admits a change) on a non-final name — defers to #69/#71/#68", () => {
    expect(acceptPostFinalAttempt({ incumbent: { status: "provisional", ownerKey: OWNER } as never, attempt: { kind: "claim" } })).toMatchObject({
      refused: false,
      stateEffect: "undecidable",
      incumbentUnchanged: true,
      reason: "b7-not-a-final-name",
    });
  });

  it("fails closed on malformed / extra-field input without throwing", () => {
    expect(acceptPostFinalAttempt(null as never).refused).toBe(false);
    expect(acceptPostFinalAttempt({ ...finalName("claim"), source: "x" } as never).reason).toBe("b7-input-malformed");
    expect(acceptPostFinalAttempt({ incumbent: { status: "final", ownerKey: "nothex" }, attempt: { kind: "claim" } } as never).reason).toBe(
      "b7-incumbent-malformed"
    );
    expect(acceptPostFinalAttempt({ incumbent: { status: "final", ownerKey: OWNER }, attempt: { kind: "transfer" } } as never).reason).toBe(
      "b7-attempt-malformed"
    );
    // an extra field on the incumbent (e.g. a smuggled "reopen" signal) is closed-shape-rejected
    expect(acceptPostFinalAttempt({ incumbent: { status: "final", ownerKey: OWNER, reopen: true }, attempt: { kind: "bond" } } as never).reason).toBe(
      "b7-incumbent-malformed"
    );
  });

  it("is deterministic on identical inputs", () => {
    expect(acceptPostFinalAttempt(finalName("bond"))).toEqual(acceptPostFinalAttempt(finalName("bond")));
  });
});
