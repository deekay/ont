// D-SB conformance battery (B3_EVIDENCE_HARDENING.md §9 / E-SB1-SB5, E-ND1;
// conforms to served-evidence-interface #51). Tests-first: RED until
// served-bytes.ts is built. Composes the D-AM builder to produce served leaves
// with real membership proofs, then exercises the binding + deadline through the
// kernel's includable / holdsPriority — a forged/unbound witness must produce the
// same reject EFFECT as no-witness (E-ND1), not matched diagnostics.
import { createDaWindowParams, holdsPriority, includable, type AnchorFacts } from "@ont/consensus";
import { describe, expect, it } from "vitest";

import { buildMembershipProof } from "./membership.js";
import { buildServedEvidence, type ServedLeaf } from "./served-bytes.js";

const KEY_A = "aa".repeat(32);
const KEY_B = "bb".repeat(32);
const VAL_A = "11".repeat(32);
const VAL_B = "22".repeat(32);
const COMMITTED = new Map([
  [KEY_A, VAL_A],
  [KEY_B, VAL_B],
]);

const ROOT = buildMembershipProof(COMMITTED, KEY_A).rootHex;
// The served batch: both committed leaves, each with a membership proof vs ROOT.
const SERVED: ServedLeaf[] = [...COMMITTED.keys()].map((k) => ({
  proof: buildMembershipProof(COMMITTED, k).proof,
}));

const ANCHOR_HEIGHT = 100;
const PARAMS = createDaWindowParams({ K: 6, W: 2, C: 3 }); // h+W = 102, h+W+C = 105
const anchor = (over: Partial<AnchorFacts> = {}): AnchorFacts => ({
  minedHeight: ANCHOR_HEIGHT,
  anchoredRoot: ROOT,
  batchSize: 2,
  ...over,
});

const batch = (firstServableHeight: number) => ({
  anchorHeight: ANCHOR_HEIGHT,
  anchoredRoot: ROOT,
  leaves: SERVED,
  firstServableHeight,
});

describe("D-SB served-bytes witness (B3, tests-first)", () => {
  it("E-SB1: a witness built from served leaves binds to the anchor and is includable", () => {
    const ev = buildServedEvidence(batch(101));
    expect(ev.anchoredRoot).toBe(ROOT);
    expect(ev.batchSize).toBe(2);
    expect(ev.anchorHeight).toBe(ANCHOR_HEIGHT);
    expect(includable(anchor(), ev, PARAMS)).toBe(true); // 101 ≤ 105
    expect(holdsPriority(anchor(), ev, PARAMS)).toBe(true); // 101 ≤ 102
  });

  it("E-SB1 deadlines: served inside (h+W, h+W+C] is includable but not priority; past h+W+C neither", () => {
    expect(includable(anchor(), buildServedEvidence(batch(104)), PARAMS)).toBe(true);
    expect(holdsPriority(anchor(), buildServedEvidence(batch(104)), PARAMS)).toBe(false);
    expect(includable(anchor(), buildServedEvidence(batch(106)), PARAMS)).toBe(false);
    expect(holdsPriority(anchor(), buildServedEvidence(batch(106)), PARAMS)).toBe(false);
  });

  it("E-SB3 binding: the witness does not count against a different anchor / root / batchSize", () => {
    const ev = buildServedEvidence(batch(101));
    expect(includable(anchor({ anchoredRoot: "00".repeat(32) }), ev, PARAMS)).toBe(false);
    expect(includable(anchor({ batchSize: 3 }), ev, PARAMS)).toBe(false);
    expect(includable(anchor({ minedHeight: 999 }), ev, PARAMS)).toBe(false);
  });

  it("E-SB reconstruction: a served leaf that is not a member of anchoredRoot fails closed (builder throws)", () => {
    // A proof against a DIFFERENT committed set won't verify under ROOT.
    const alienProof = buildMembershipProof(new Map([[KEY_A, VAL_B]]), KEY_A).proof;
    expect(() =>
      buildServedEvidence({ ...batch(101), leaves: [{ proof: alienProof }, ...SERVED] }),
    ).toThrow();
  });

  it("E-ND1 baseline: absent evidence fails closed through includable / holdsPriority", () => {
    expect(includable(anchor(), null, PARAMS)).toBe(false);
    expect(holdsPriority(anchor(), null, PARAMS)).toBe(false);
  });
});
