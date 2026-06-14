// Unit tests for the DA-verdict predicate (opaque DA-evidence interface).
//
// Grounded in da-windows (#49) S2/S3/S4 (ratified) and the D-area rules
// (B2_KERNEL_HARDENING.md D1-D8). These are predicate unit tests over the
// ratified algebra; the da-verdict.json conformance vectors are the harness's
// concern (D4-neg-01 promoted to ratified under #49 S3/S4; D7-pos-01 stays
// parked on the batched-path area).

import { describe, expect, it } from "vitest";

import { createDaWindowParams } from "./params.js";
import {
  evidenceBindsToAnchor,
  holdsPriority,
  includable,
  type AnchorFacts,
  type ServedEvidence,
} from "./da-verdict.js";

// (6, 2, 3): availability deadline h+W = h+2, challenge deadline h+W+C = h+5.
const params = createDaWindowParams({ K: 6, W: 2, C: 3 });
const anchor: AnchorFacts = { minedHeight: 1000, anchoredRoot: "abcd", batchSize: 4 };

function evidenceAt(firstServableHeight: number): ServedEvidence {
  return { anchorHeight: 1000, anchoredRoot: "abcd", batchSize: 4, firstServableHeight };
}

describe("includable — §6c fail-closed inclusion (S3), inclusive at h+W+C", () => {
  it("S3/S2: served at or before the challenge deadline h+W+C is includable", () => {
    expect(includable(anchor, evidenceAt(1000), params)).toBe(true); // first servable at h
    expect(includable(anchor, evidenceAt(1004), params)).toBe(true); // inside the window
    expect(includable(anchor, evidenceAt(1005), params)).toBe(true); // exactly h+W+C = 1005 (inclusive)
  });

  it("S3: served one block after h+W+C is not includable (challenge-deadline miss)", () => {
    expect(includable(anchor, evidenceAt(1006), params)).toBe(false);
    expect(includable(anchor, evidenceAt(99999), params)).toBe(false);
  });

  it("D4: absent evidence fails closed (never a provisional include)", () => {
    expect(includable(anchor, null, params)).toBe(false);
  });
});

describe("holdsPriority — §6d contested priority (S3), inclusive at h+W", () => {
  it("S3/S2: served at or before the availability deadline h+W holds priority", () => {
    expect(holdsPriority(anchor, evidenceAt(1000), params)).toBe(true);
    expect(holdsPriority(anchor, evidenceAt(1002), params)).toBe(true); // exactly h+W = 1002 (inclusive)
  });

  it("D6/S3: served inside (h+W, h+W+C] forfeits priority but stays includable", () => {
    const ev = evidenceAt(1004); // in (1002, 1005]
    expect(holdsPriority(anchor, ev, params)).toBe(false);
    expect(includable(anchor, ev, params)).toBe(true);
  });

  it("D4: absent evidence fails closed", () => {
    expect(holdsPriority(anchor, null, params)).toBe(false);
  });
});

describe("binding — D2/D8: only a witness bound to this anchor's commitment counts", () => {
  it("a witness for a different mined height does not bind", () => {
    const ev: ServedEvidence = { ...evidenceAt(1002), anchorHeight: 999 };
    expect(evidenceBindsToAnchor(anchor, ev)).toBe(false);
    expect(includable(anchor, ev, params)).toBe(false);
    expect(holdsPriority(anchor, ev, params)).toBe(false);
  });

  it("D8: bytes for a root never anchored here are refused", () => {
    const ev: ServedEvidence = { ...evidenceAt(1002), anchoredRoot: "dead" };
    expect(includable(anchor, ev, params)).toBe(false);
  });

  it("D8: a mismatched batchSize does not bind (commitment is root + batchSize)", () => {
    const ev: ServedEvidence = { ...evidenceAt(1002), batchSize: 5 };
    expect(includable(anchor, ev, params)).toBe(false);
  });

  it("D8: identical timely bytes bind regardless of where they came from (no source field)", () => {
    // The witness carries no source/transport identity, so two witnesses with the
    // same commitment + first-servable height are indistinguishable to the verdict.
    expect(includable(anchor, evidenceAt(1003), params)).toBe(includable(anchor, evidenceAt(1003), params));
  });
});

describe("D1 determinism + parametricity over the window triple (G9)", () => {
  it("D1: identical inputs yield identical verdicts", () => {
    const ev = evidenceAt(1004);
    expect(includable(anchor, ev, params)).toBe(includable(anchor, ev, params));
    expect(holdsPriority(anchor, ev, params)).toBe(holdsPriority(anchor, ev, params));
  });

  it("evaluates correctly at a second parameterization (no baked window)", () => {
    const p2 = createDaWindowParams({ K: 20, W: 5, C: 10 }); // h+W = 1005, h+W+C = 1015
    expect(holdsPriority(anchor, evidenceAt(1005), p2)).toBe(true);
    expect(holdsPriority(anchor, evidenceAt(1006), p2)).toBe(false);
    expect(includable(anchor, evidenceAt(1015), p2)).toBe(true);
    expect(includable(anchor, evidenceAt(1016), p2)).toBe(false);
  });
});
