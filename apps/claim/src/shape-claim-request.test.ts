import { describe, expect, it } from "vitest";
import type { RootAnchorFundingInput } from "@ont/adapter-publisher";
import { shapeClaimRequest, type ClaimRequest } from "./shape-claim-request.js";

// B5-CLAIM red battery — claim-request shaping. Validates the request shape + that the name is canonical
// (consuming @ont/wire's rule, reject-don't-normalize), and passes funding/change through to the assembler.
// It computes NO roots/batches (that is the adapter/fixture stack). RED until the core lands (stub rejects).

const FUNDING: readonly RootAnchorFundingInput[] = [{ prevoutTxid: "11".repeat(32), prevoutVout: 0 }];

function req(over: Partial<ClaimRequest> = {}): ClaimRequest {
  return { name: "alice", fundingInputs: FUNDING, ...over };
}

describe("shapeClaimRequest — accept", () => {
  it("canonical name + funding → accept, passthrough", () => {
    const r = shapeClaimRequest(req());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.name).toBe("alice");
    expect(r.fundingInputs).toEqual(FUNDING);
    expect(r.changeOutput).toBeUndefined();
  });

  it("with changeOutput → passthrough", () => {
    const change = { valueSats: 50_000n, scriptPubKeyHex: "51" };
    const r = shapeClaimRequest(req({ changeOutput: change }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.changeOutput).toEqual(change);
  });
});

describe("shapeClaimRequest — reject", () => {
  it("non-canonical name (uppercase) → non-canonical-name (reject, don't normalize)", () => {
    const r = shapeClaimRequest(req({ name: "Alice" }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("non-canonical-name");
  });

  it("non-canonical name (empty / too long / illegal chars) → non-canonical-name", () => {
    for (const name of ["", "a".repeat(33), "al-ce", "al ce", "naïve"]) {
      const r = shapeClaimRequest(req({ name }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("non-canonical-name");
    }
  });

  it("empty fundingInputs → no-funding", () => {
    const r = shapeClaimRequest(req({ fundingInputs: [] }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("no-funding");
  });

  it("malformed inputs → malformed (never throws)", () => {
    const cases: Array<() => ReturnType<typeof shapeClaimRequest>> = [
      () => shapeClaimRequest(null as unknown as ClaimRequest),
      () => shapeClaimRequest(req({ name: 123 as unknown as string })),
      () => shapeClaimRequest(req({ fundingInputs: null as unknown as RootAnchorFundingInput[] })),
    ];
    for (const run of cases) {
      let r: ReturnType<typeof shapeClaimRequest> | undefined;
      expect(() => { r = run(); }).not.toThrow();
      expect(r?.ok).toBe(false);
    }
  });
});

describe("shapeClaimRequest — determinism", () => {
  it("is deterministic", () => {
    expect(shapeClaimRequest(req())).toEqual(shapeClaimRequest(req()));
  });
});
