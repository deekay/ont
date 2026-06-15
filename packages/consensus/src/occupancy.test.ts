import { describe, expect, it } from "vitest";

import { resolveNameOccupancy } from "./occupancy.js";

describe("resolveNameOccupancy — A11 insertion-only / post-DA-verdict occupancy", () => {
  it("admits a fresh insertion when the name is unoccupied (no governing occupancy)", () => {
    expect(resolveNameOccupancy({ priorOccupancy: null })).toMatchObject({
      admitsInsertion: true,
      occupancy: "unoccupied",
      reason: "occupancy-unoccupied-fresh-insertion",
    });
  });

  it("admits re-claim over a FORFEITED (DA-failed) prior insertion — the A11-pos-01 post-DA-verdict crux", () => {
    expect(resolveNameOccupancy({ priorOccupancy: { kind: "forfeited" } })).toMatchObject({
      admitsInsertion: true,
      occupancy: "forfeited",
      reason: "occupancy-forfeited-da-failed-does-not-block-reclaim",
    });
  });

  it("refuses a fresh insertion on a FINAL name (insertion-only, no takeover)", () => {
    expect(resolveNameOccupancy({ priorOccupancy: { kind: "final" } })).toMatchObject({
      admitsInsertion: false,
      occupancy: "final",
      reason: "occupancy-name-already-final-no-takeover",
    });
  });

  it("admits a competing insertion only under the explicit contestable-provisional kind", () => {
    expect(resolveNameOccupancy({ priorOccupancy: { kind: "contestable-provisional" } })).toMatchObject({
      admitsInsertion: true,
      occupancy: "contestable-provisional",
      reason: "occupancy-contestable-provisional-competing-insertion",
    });
  });

  it("fails closed (undecidable, no insertion) on unknown kind / extra field / malformed input", () => {
    // unknown occupancy kind (e.g. an auction-pending / nullified state never mapped to an admitting kind)
    expect(resolveNameOccupancy({ priorOccupancy: { kind: "auction-pending" } as never })).toMatchObject({
      admitsInsertion: false,
      occupancy: "undecidable",
      reason: "occupancy-prior-malformed",
    });
    // extra field on the prior occupancy
    expect(resolveNameOccupancy({ priorOccupancy: { kind: "final", owner: "x" } as never }).admitsInsertion).toBe(false);
    // extra field on the input
    expect(resolveNameOccupancy({ priorOccupancy: null, mutate: true } as never)).toMatchObject({
      admitsInsertion: false,
      occupancy: "undecidable",
      reason: "occupancy-input-malformed",
    });
    // non-object input
    expect(resolveNameOccupancy(null as never).admitsInsertion).toBe(false);
  });

  it("returns only an admit/refuse classification — no owner/value/transfer mutation field (insertion-only)", () => {
    const result = resolveNameOccupancy({ priorOccupancy: { kind: "final" } });
    expect(Object.keys(result).sort()).toEqual(["admitsInsertion", "occupancy", "reason"]);
  });

  it("is deterministic on identical inputs", () => {
    const i = { priorOccupancy: { kind: "forfeited" } } as const;
    expect(resolveNameOccupancy(i)).toEqual(resolveNameOccupancy(i));
  });
});
