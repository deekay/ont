// B2 executable vector bindings — turning ready-for-binding conformance vectors into
// executable predicate assertions (the binding lane atop the loader spine in
// b2-vector-suite.test.ts). For each ready vector this loads the conformance JSON,
// constructs predicate inputs that realize its fixture scenario, and asserts the
// resident @ont/consensus predicate returns the vector's expected verdict — giving the
// SOFTWARE_CANON doc-cite -> test -> impl traceability per vector id.
//
// Family 1 (this file, pilot): DA-verdict (includable / holdsPriority) — the ready
// vectors D3/D4/D6/D13 from da-verdict.json. The remaining ready families
// (params: A3/D9/D12/G9; value-record: V*; engine: X*) follow as their own binding
// slices. The spine's pending-predicate / pending-dk vectors are NOT bound here.
//
// The assertion checks the predicate output against the vector's own expected.verdict
// (loaded from JSON), so a binding only passes if its realization faithfully matches the
// ratified vector — not against a hand-copied expectation.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { createDaWindowParams } from "./params.js";
import { holdsPriority, includable, type AnchorFacts, type ServedEvidence } from "./da-verdict.js";

const vectorsDir = join(dirname(fileURLToPath(import.meta.url)), "../../../docs/core/vectors");

interface ConformanceVector {
  id: string;
  ruleId: string;
  authorityTier: string;
  kind: string;
  expected: { verdict: string; reason: string };
  status: string;
}

// A vector for a given area file lives in either the vector-now dir (docs/core/vectors)
// or the ratified provisional-origin dir (docs/core/vectors/provisional) — the same two
// roots the loader spine reads. Search both for the id.
function loadVector(file: string, id: string): ConformanceVector {
  for (const rel of [file, join("provisional", file)]) {
    let arr: ConformanceVector[];
    try {
      arr = JSON.parse(readFileSync(join(vectorsDir, rel), "utf8")) as ConformanceVector[];
    } catch {
      continue;
    }
    const vector = arr.find((entry) => entry.id === id);
    if (vector !== undefined) {
      return vector;
    }
  }
  throw new Error(`vector ${id} not found in ${file} or provisional/${file}`);
}

// The ids this file binds to a resident predicate. This MUST stay a subset of the loader
// spine's ready-for-binding set (b2-vector-suite.test.ts `readyBindingTargetById`, which
// the spine independently validates is the correct 23). Adding an id here without a real
// resident predicate would re-open the hole the spine guards against; only add an id when
// its binding lands. The spine cannot be imported for a cross-check (a non-test src/*.ts
// trips the kernel manifest; importing its .test.ts would double-run its suites), so this
// local manifest is the agreed mirror (ChatLunatique review event dab9960b).
const LOCAL_BINDING_MANIFEST = new Set<string>([
  // DA-verdict family
  "D4-neg-01",
  "D3-pos-01",
  "D6-neg-01",
  "D13-pos-01",
]);

// A binding may only execute a vector that is (a) locked, (b) required-tier
// (normative/ratified, never candidate/DK-gated), AND (c) in this file's binding manifest
// — so a required-but-pending-predicate vector (e.g. R1/B1/T1/Q10: ratified but with no
// resident predicate) can never execute just because it is ratified.
function assertBindable(vector: ConformanceVector): void {
  expect(vector.status, `${vector.id} must be locked`).toBe("locked");
  expect(["normative", "ratified"], `${vector.id} must be required-tier, not DK-gated`).toContain(
    vector.authorityTier
  );
  expect(
    LOCAL_BINDING_MANIFEST.has(vector.id),
    `${vector.id} is not in LOCAL_BINDING_MANIFEST — only ready-for-binding vectors (resident predicate) may execute`
  ).toBe(true);
}

const accepts = (vector: ConformanceVector): boolean => vector.expected.verdict === "accept";

// (K, W, C) = (6, 2, 3): availability deadline h+W = h+2, challenge deadline h+W+C = h+5.
const params = createDaWindowParams({ K: 6, W: 2, C: 3 });
const H = 1000;
const anchor: AnchorFacts = { minedHeight: H, anchoredRoot: "abcd", batchSize: 4 };
const servedAt = (firstServableHeight: number): ServedEvidence => ({
  anchorHeight: H,
  anchoredRoot: "abcd",
  batchSize: 4,
  firstServableHeight,
});

describe("B2 vector bindings — DA-verdict family (includable / holdsPriority)", () => {
  it("D4-neg-01: absent or commitment-mismatched served evidence is excluded (fail closed)", () => {
    const vector = loadVector("da-verdict.json", "D4-neg-01");
    assertBindable(vector);
    // Realize the fixture: (caseA) no evidence at all, and (caseB) evidence present but
    // not bound to the anchored (root, batchSize) commitment. Both must fail closed.
    expect(includable(anchor, null, params)).toBe(accepts(vector)); // accepts=false -> excluded
    const mismatched: ServedEvidence = { anchorHeight: H, anchoredRoot: "ffff", batchSize: 4, firstServableHeight: H };
    expect(includable(anchor, mismatched, params)).toBe(false);
  });

  it("D3-pos-01: served at the availability deadline h+W holds priority (inclusive)", () => {
    const vector = loadVector("da-verdict.json", "D3-pos-01");
    assertBindable(vector);
    expect(holdsPriority(anchor, servedAt(H + 2), params)).toBe(accepts(vector)); // h+W=1002, inclusive -> accept
  });

  it("D6-neg-01: served one block past h+W forfeits priority while staying includable", () => {
    const vector = loadVector("da-verdict.json", "D6-neg-01");
    assertBindable(vector);
    const evidence = servedAt(H + 3); // h+W+1 = 1003, inside (h+W, h+W+C]
    expect(holdsPriority(anchor, evidence, params)).toBe(accepts(vector)); // accepts=false -> forfeits
    expect(includable(anchor, evidence, params)).toBe(true); // but still includable
  });

  it("D13-pos-01: both h+W (priority) and h+W+C (inclusion) are inclusive boundaries", () => {
    const vector = loadVector("da-verdict.json", "D13-pos-01");
    assertBindable(vector);
    const accept = accepts(vector);
    expect(holdsPriority(anchor, servedAt(H + 2), params)).toBe(accept); // h+W inclusive
    expect(includable(anchor, servedAt(H + 5), params)).toBe(accept); // h+W+C inclusive
  });
});
