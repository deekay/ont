// Unit tests for the DA-window CONSENSUS_PARAMS slice.
//
// Grounded ONLY in required-tier rules D9 / D12 / G9 (docs/core/
// B2_KERNEL_HARDENING.md). No provisional/candidate vector is used as a green
// gate here — the candidate da-windows vectors live in docs/core/vectors/
// provisional/ and are the harness's concern, not this constructor's.

import { describe, expect, it } from "vitest";

import {
  availabilityDeadlineHeight,
  challengeDeadlineHeight,
  confirmedRootEligible,
  ConsensusParamsError,
  createDaWindowParams,
  modeAt,
  type DaWindowParams,
  type LaunchParams,
} from "./params.js";

// A spread of structurally valid triples (each satisfies K >= W + C, all >= 1).
// Deliberately includes the provisional (6, 2, 3) AND unrelated triples so no
// single value can be a fossilized default (D12 / G9 anti-fossilization).
const VALID_TRIPLES = [
  { K: 6, W: 2, C: 3 }, // provisional placeholder — one parameterization among many
  { K: 10, W: 3, C: 4 }, // G9's second parameterization
  { K: 5, W: 3, C: 2 }, // K = W + C exactly (tightest accepted fit)
  { K: 100, W: 50, C: 20 },
  { K: 3, W: 1, C: 1 },
] as const;

describe("createDaWindowParams — D12/G9 construction validity", () => {
  it("accepts every structurally valid (K, W, C) triple and returns it intact", () => {
    for (const t of VALID_TRIPLES) {
      const p = createDaWindowParams(t);
      expect({ K: p.K, W: p.W, C: p.C }).toEqual({ K: t.K, W: t.W, C: t.C });
    }
  });

  it("freezes the returned parameterization (determinism)", () => {
    const p = createDaWindowParams({ K: 6, W: 2, C: 3 });
    expect(Object.isFrozen(p)).toBe(true);
    expect(() => {
      (p as { K: number }).K = 99;
    }).toThrow();
  });

  // D12 (−) / G9 (−): reject non-integer, sub-1, and K < W+C parameterizations.
  it("D12: rejects non-integer block counts", () => {
    expect(() => createDaWindowParams({ K: 6.5, W: 2, C: 3 })).toThrow(ConsensusParamsError);
    expect(() => createDaWindowParams({ K: 6, W: Number.NaN, C: 3 })).toThrow(ConsensusParamsError);
    expect(() => createDaWindowParams({ K: 6, W: 2, C: Number.POSITIVE_INFINITY })).toThrow(ConsensusParamsError);
  });

  it("G9: rejects any of K/W/C below 1 (zero or negative windows)", () => {
    expect(() => createDaWindowParams({ K: 0, W: 0, C: 0 })).toThrow(ConsensusParamsError);
    expect(() => createDaWindowParams({ K: 6, W: 0, C: 3 })).toThrow(ConsensusParamsError);
    expect(() => createDaWindowParams({ K: 6, W: 2, C: -1 })).toThrow(ConsensusParamsError);
  });

  // D12 / G10 no-default: there is no implicit default parameterization. A
  // missing field is `undefined`, which fails the integer check — construction
  // cannot silently fall back to baked values.
  it("D12/G10: rejects a missing parameter (no silent default)", () => {
    expect(() => createDaWindowParams({ W: 2, C: 3 } as unknown as DaWindowParams)).toThrow(ConsensusParamsError);
    expect(() => createDaWindowParams({ K: 6, C: 3 } as unknown as DaWindowParams)).toThrow(ConsensusParamsError);
    expect(() => createDaWindowParams({ K: 6, W: 2 } as unknown as DaWindowParams)).toThrow(ConsensusParamsError);
  });
});

describe("createDaWindowParams — D9 window-fit invariant (K >= W + C)", () => {
  it("accepts the boundary K = W + C", () => {
    expect(() => createDaWindowParams({ K: 5, W: 3, C: 2 })).not.toThrow();
  });

  it("D9 (−): rejects K < W + C", () => {
    expect(() => createDaWindowParams({ K: 4, W: 3, C: 2 })).toThrow(ConsensusParamsError);
    expect(() => createDaWindowParams({ K: 4, W: 2, C: 3 })).toThrow(ConsensusParamsError);
  });

  it("the rejection message names the invariant", () => {
    expect(() => createDaWindowParams({ K: 4, W: 3, C: 2 })).toThrow(/K \(4\) must be >= W \+ C/);
  });
});

describe("DA-deadline derivations — D9/G9 parametric over the whole triple", () => {
  // D9 (+): an anchor is absent from the confirmed root while tip < h+K and
  // present once tip >= h+K, for any valid parameterization (G9).
  it("D9 (+): confirmedRootEligible flips exactly at tip = h + K", () => {
    const h = 1000;
    for (const t of VALID_TRIPLES) {
      const p = createDaWindowParams(t);
      expect(confirmedRootEligible(h, h + p.K - 1, p)).toBe(false);
      expect(confirmedRootEligible(h, h + p.K, p)).toBe(true);
      expect(confirmedRootEligible(h, h + p.K + 1, p)).toBe(true);
    }
  });

  it("derives availability (h+W) and challenge (h+W+C) deadline heights per triple", () => {
    const h = 1000;
    for (const t of VALID_TRIPLES) {
      const p = createDaWindowParams(t);
      expect(availabilityDeadlineHeight(h, p)).toBe(h + t.W);
      expect(challengeDeadlineHeight(h, p)).toBe(h + t.W + t.C);
    }
  });

  // G9 (−) mechanical anti-fossilization: a hard-coded implementation would
  // return the same deadlines regardless of params. Distinct triples MUST yield
  // distinct derivations, proving the surface is genuinely parametric.
  it("G9: distinct parameterizations yield distinct derivations (no baked constant)", () => {
    const h = 1000;
    const a = createDaWindowParams({ K: 6, W: 2, C: 3 });
    const b = createDaWindowParams({ K: 10, W: 3, C: 4 });

    expect(confirmedRootEligible(h, h + 6, a)).toBe(true);
    expect(confirmedRootEligible(h, h + 6, b)).toBe(false); // needs h+10 under b

    expect(challengeDeadlineHeight(h, a)).toBe(h + 5);
    expect(challengeDeadlineHeight(h, b)).toBe(h + 7);
    expect(challengeDeadlineHeight(h, a)).not.toBe(challengeDeadlineHeight(h, b));
  });
});

describe("modeAt — §6 availability-mode seam", () => {
  it("resolves from frozen LaunchParams and is constant-mode today", () => {
    const params: LaunchParams = Object.freeze({
      launchHeight: 0,
      daWindow: createDaWindowParams({ K: 3, W: 1, C: 1 }),
      availabilityMode: "O1-collapsed",
    });

    expect(modeAt(0, params)).toBe("O1-collapsed");
    expect(modeAt(144, params)).toBe("O1-collapsed");
  });

  it("has no production activation schedule field on LaunchParams in slice 2", () => {
    const params: LaunchParams = {
      launchHeight: 0,
      daWindow: createDaWindowParams({ K: 3, W: 1, C: 1 }),
      availabilityMode: "O2-in-band",
    };

    expect(Object.keys(params).sort()).toEqual(["availabilityMode", "daWindow", "launchHeight"]);
  });
});
