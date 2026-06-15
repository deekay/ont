import { describe, expect, it } from "vitest";

import { bondContinuityBreak, type BondContinuityFacts } from "./bond-continuity-break.js";

const facts = (o: Partial<BondContinuityFacts> = {}): BondContinuityFacts => ({
  preMaturity: true,
  currentBondOutpointSpent: false,
  sameTxValidSuccessorBond: false,
  ...o,
});

describe("bondContinuityBreak — S6 observed-spend release (no key channel)", () => {
  it("releases on a pre-maturity spend with no same-tx valid successor", () => {
    expect(bondContinuityBreak(facts({ currentBondOutpointSpent: true, sameTxValidSuccessorBond: false }))).toEqual({
      decided: true,
      released: true,
      reason: "s6-pre-maturity-spend-no-successor-released",
    });
  });

  it("does NOT release on the three valid no-break combinations (each decided)", () => {
    // mature spend -> no continuity requirement
    expect(bondContinuityBreak(facts({ preMaturity: false, currentBondOutpointSpent: true }))).toMatchObject({ decided: true, released: false });
    // pre-maturity, unspent
    expect(bondContinuityBreak(facts({ currentBondOutpointSpent: false }))).toMatchObject({ decided: true, released: false });
    // pre-maturity spend with a valid same-tx successor -> rotated, continuous
    expect(bondContinuityBreak(facts({ currentBondOutpointSpent: true, sameTxValidSuccessorBond: true }))).toMatchObject({
      decided: true,
      released: false,
    });
  });

  it("has no signer/key channel — a key field is rejected (undecided), never consulted to avert release", () => {
    for (const keyField of ["signerKey", "fundingKey", "ownerKey", "authorized"]) {
      const r = bondContinuityBreak({ ...facts({ currentBondOutpointSpent: true }), [keyField]: "a".repeat(64) } as never);
      expect(r).toMatchObject({ decided: false, released: false, reason: "s6-input-malformed" });
    }
  });

  it("fails closed (undecided) on malformed input without throwing — not a silent valid no-break", () => {
    expect(bondContinuityBreak(null as never)).toMatchObject({ decided: false, released: false });
    expect(bondContinuityBreak(facts({ preMaturity: "yes" as never })).decided).toBe(false);
  });

  it("is deterministic on identical inputs", () => {
    const f = facts({ currentBondOutpointSpent: true });
    expect(bondContinuityBreak(f)).toEqual(bondContinuityBreak(f));
  });
});
