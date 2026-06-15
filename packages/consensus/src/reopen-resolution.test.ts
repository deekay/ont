import { describe, expect, it } from "vitest";

import { resolveReopen, type ReopenInput } from "./reopen-resolution.js";

const complete = (breaks: { releaseHeight: number }[]) => ({ witnessComplete: true, breaks });
const opening = (releaseAnchor: number, breaks: { releaseHeight: number }[] = []): ReopenInput => ({
  reopenLot: { kind: "opening", releaseAnchor },
  bondContinuity: complete(breaks),
});
const reopen = (releaseAnchor: number, breaks: { releaseHeight: number }[]): ReopenInput => ({
  reopenLot: { kind: "reopen", releaseAnchor },
  bondContinuity: complete(breaks),
});

describe("resolveReopen — opening (first generation)", () => {
  it("recognizes an opening lot at anchor 0 with no prior break", () => {
    expect(resolveReopen(opening(0))).toMatchObject({
      recognized: true,
      derivedLatestReleaseHeight: null,
      reason: "reopen-opening-first-generation",
    });
  });

  it("rejects an opening lot after any witnessed break (stale first generation)", () => {
    expect(resolveReopen(opening(0, [{ releaseHeight: 800_000 }]))).toMatchObject({
      recognized: false,
      reason: "reopen-opening-after-break-rejected",
      derivedLatestReleaseHeight: 800_000,
    });
  });

  it("rejects an opening lot whose anchor is not 0", () => {
    expect(resolveReopen(opening(800_000))).toMatchObject({
      recognized: false,
      reason: "reopen-opening-anchor-must-be-zero",
    });
  });
});

describe("resolveReopen — reopen (kernel-derived latest release)", () => {
  it("recognizes a reopen anchored to the unique latest release (distinct heights → max)", () => {
    expect(
      resolveReopen(reopen(900_000, [{ releaseHeight: 800_000 }, { releaseHeight: 900_000 }]))
    ).toMatchObject({
      recognized: true,
      derivedLatestReleaseHeight: 900_000,
      reason: "reopen-anchored-to-latest-release",
    });
  });

  it("rejects a reopen with no witnessed break (an adapter cannot mint a generation)", () => {
    expect(resolveReopen(reopen(900_000, []))).toMatchObject({
      recognized: false,
      reason: "reopen-no-witnessed-break",
      derivedLatestReleaseHeight: null,
    });
  });

  it("rejects stale, fabricated, future, and zero anchors (returns the real unique latest)", () => {
    const breaks = [{ releaseHeight: 800_000 }, { releaseHeight: 900_000 }];
    for (const stale of [800_000 /* older release */, 950_000 /* fabricated/future */, 0 /* reopen-after-0 */]) {
      expect(resolveReopen(reopen(stale, breaks))).toMatchObject({
        recognized: false,
        reason: "reopen-anchor-not-latest-release",
        derivedLatestReleaseHeight: 900_000,
      });
    }
  });

  it("fails closed on a same-height max tie (the S8 tx-level tiebreak is unruled)", () => {
    expect(
      resolveReopen(reopen(900_000, [{ releaseHeight: 900_000 }, { releaseHeight: 900_000 }]))
    ).toMatchObject({
      recognized: false,
      reason: "reopen-same-height-break-tiebreak-unspecified",
      derivedLatestReleaseHeight: null,
    });
  });
});

describe("resolveReopen — fail closed on incomplete witness / malformed input", () => {
  it("rejects an incomplete bond-continuity witness before any matching", () => {
    expect(
      resolveReopen({
        reopenLot: { kind: "reopen", releaseAnchor: 900_000 },
        bondContinuity: { witnessComplete: false, breaks: [{ releaseHeight: 900_000 }] },
      })
    ).toMatchObject({
      recognized: false,
      reason: "reopen-incomplete-bond-continuity-witness",
      derivedLatestReleaseHeight: null,
    });
    // the same breaks under a COMPLETE witness would recognize — the witness gate is what stops it
    expect(resolveReopen(reopen(900_000, [{ releaseHeight: 900_000 }])).recognized).toBe(true);
  });

  it("rejects malformed / extra-field / adapter inputs without throwing and never recognizes", () => {
    expect(resolveReopen(null as never).recognized).toBe(false);
    // extra field on the input
    expect(resolveReopen({ ...reopen(900_000, [{ releaseHeight: 900_000 }]), recognizer: "indexer" } as never).recognized).toBe(false);
    // extra field on a break (adapter-asserted release height smuggled alongside)
    expect(
      resolveReopen({
        reopenLot: { kind: "reopen", releaseAnchor: 900_000 },
        bondContinuity: { witnessComplete: true, breaks: [{ releaseHeight: 900_000, assertedBy: "adapter" } as never] },
      }).reason
    ).toBe("reopen-bond-continuity-malformed");
    // releaseHeight 0 is not a valid release (positive-int requirement)
    expect(resolveReopen(reopen(0, [{ releaseHeight: 0 }])).reason).toBe("reopen-bond-continuity-malformed");
    // unknown lot kind
    expect(resolveReopen({ reopenLot: { kind: "mint", releaseAnchor: 1 }, bondContinuity: complete([]) } as never).reason).toBe(
      "reopen-lot-malformed"
    );
  });

  it("is deterministic on identical inputs", () => {
    const i = reopen(900_000, [{ releaseHeight: 800_000 }, { releaseHeight: 900_000 }]);
    expect(resolveReopen(i)).toEqual(resolveReopen(i));
  });
});
