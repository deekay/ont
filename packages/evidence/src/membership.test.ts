// D-AM conformance battery (B3_EVIDENCE_HARDENING.md §9 / E-AM1–E-AM3, E-ND1).
// Tests-first: RED until membership.ts is implemented. Self-contained — builds
// witnesses with @ont/evidence and checks them with the shared @ont/protocol
// verifier, so a forged proof's acceptance effect is provably === a no-witness
// reject (E-ND1: diagnostics may differ, the accept/reject effect may not).
import { describe, expect, it } from "vitest";
import { verifyAccumulatorMembership } from "@ont/protocol";

import { buildMembershipProof, buildNonMembershipProof } from "./membership.js";

// 32-byte (256-bit) keys/values. A and B are committed; C is absent.
const KEY_A = "aa".repeat(32);
const KEY_B = "bb".repeat(32);
const KEY_C = "cc".repeat(32);
const VAL_A = "11".repeat(32);
const VAL_B = "22".repeat(32);

const leaves = (): ReadonlyMap<string, string> =>
  new Map([
    [KEY_A, VAL_A],
    [KEY_B, VAL_B],
  ]);

describe("D-AM accumulator membership witness (B3, tests-first)", () => {
  it("E-AM1: an honestly built membership proof verifies against the built root", () => {
    const { rootHex, proof } = buildMembershipProof(leaves(), KEY_A);
    expect(proof.value).toBe(VAL_A);
    expect(verifyAccumulatorMembership(rootHex, proof)).toBe(true);
  });

  it("E-AM3: the same proof against a DIFFERENT root does not verify (no false accept)", () => {
    const { proof } = buildMembershipProof(leaves(), KEY_A);
    // A different committed set ⇒ different root; the A-proof must not verify under it.
    const otherRoot = buildMembershipProof(new Map([[KEY_A, VAL_B]]), KEY_A).rootHex;
    expect(verifyAccumulatorMembership(otherRoot, proof)).toBe(false);
  });

  it("E-AM3: a tampered sibling hash fails closed (effect === a rejected/no witness)", () => {
    const { rootHex, proof } = buildMembershipProof(leaves(), KEY_A);
    expect(proof.siblings.length).toBeGreaterThan(0);
    const tampered = {
      ...proof,
      siblings: proof.siblings.map((s, i) => (i === 0 ? { ...s, hash: "00".repeat(32) } : s)),
    };
    expect(verifyAccumulatorMembership(rootHex, tampered)).toBe(false);
  });

  it("E-AM3: non-membership proof for an absent key verifies; claiming a value for it does not", () => {
    const { rootHex, proof } = buildNonMembershipProof(leaves(), KEY_C);
    expect(proof.value).toBeNull();
    expect(verifyAccumulatorMembership(rootHex, proof)).toBe(true); // proves absence
    const forgedMembership = { ...proof, value: VAL_A }; // claim C holds A's value
    expect(verifyAccumulatorMembership(rootHex, forgedMembership)).toBe(false);
  });

  it("E-AM3 / malformed: a wrong-length key fails closed, never throws", () => {
    const { rootHex } = buildMembershipProof(leaves(), KEY_A);
    expect(verifyAccumulatorMembership(rootHex, { keyHex: "aa", value: VAL_A, siblings: [] })).toBe(
      false,
    );
  });
});
