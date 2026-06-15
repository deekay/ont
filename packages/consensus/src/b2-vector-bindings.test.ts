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

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  availabilityDeadlineHeight,
  challengeDeadlineHeight,
  confirmedRootEligible,
  createDaWindowParams,
} from "./params.js";
import { holdsPriority, includable, type AnchorFacts, type ServedEvidence } from "./da-verdict.js";
import { schnorr } from "@noble/curves/secp256k1.js";
import {
  RECOVERY_DESCRIPTOR_FORMAT,
  RECOVERY_DESCRIPTOR_VERSION,
  SEQUENCE_BOUND,
  VALUE_RECORD_FORMAT,
  VALUE_RECORD_VERSION,
  bytesToHex,
  hexToBytes,
  recoveryDescriptorDigest,
  valueRecordDigest,
} from "@ont/wire";
import { valueRecordAccept, type OwnershipInterval, type ValueRecordEnvelope } from "./value-record-authority.js";
import {
  gateFeeValidation,
  type CommittedBatchContents,
  type GateFee,
  type GateFeeAnchorFacts,
} from "./gate-fee.js";
import {
  transcriptCompleteness,
  type AuctionTranscript,
  type CompletenessWitness,
} from "./transcript-completeness.js";
import { bondQualifiesForEscalation } from "./bond-qualification.js";
import {
  createTransferPayload,
  deriveOwnerPubkey,
  encodeTransferPayload,
  signRecoverOwnerCancelAuthorization,
  signTransferAuthorization,
  type TransferAuthorizationFields,
  type TransferEventPayload,
} from "@ont/protocol";
import type {
  BitcoinTransactionInBlock,
  BitcoinTransactionInput,
  BitcoinTransactionOutput,
} from "@ont/bitcoin";
import {
  applyBlockTransactionsWithProvenance,
  createEmptyState,
  type NameRecord,
  type OntState,
} from "./engine.js";
import { classifyOutput } from "./scanner.js";

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
  "D3-neg-01",
  "D6-neg-01",
  "D13-pos-01",
  // T-area vector realized via the resident DA holdsPriority predicate (transcript entry)
  "T18-neg-01",
  // batched-path DA-consumer family (bindings over resident includable / holdsPriority)
  "B10-neg-01",
  "B3-neg-01",
  "B4-neg-01",
  "B1-neg-02",
  // bond-qualification family (bondQualifiesForEscalation)
  "B6-neg-01",
  // params family (DA-window construction + h+K eligibility)
  "A3-neg-01",
  "D9-neg-01",
  "D12-neg-01",
  "G9-neg-01",
  // value-record family (valueRecordAccept)
  "V1-neg-01",
  "V3-neg-01",
  "V4-neg-01",
  "V6-neg-01",
  "V7-neg-01",
  "V8-neg-01",
  "V10-neg-01",
  "V11-pos-01",
  // X-area vector realized via the value-record authority surface (post-transfer head)
  "X14-neg-01",
  // gate-fee family (gateFeeValidation)
  "F8-pos-01",
  // transcript-completeness family (transcriptCompleteness)
  "T1-neg-01",
  "T2-neg-01",
  "T21-neg-01",
  // engine-transfer family (applyBlockTransactions)
  "X2-neg-01",
  "X6-neg-01",
  "X6-neg-02",
  "X8-pos-01",
  // scanner / boundary-purity family (meta-shaped, not construct->predicate)
  "A1-neg-01",
  "A10-neg-01",
  "G7-neg-01",
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

// Maps a construction attempt to the vector's verdict vocabulary so the primary scenario
// is checked against the vector's OWN expected.verdict (not just `toThrow`): a triple that
// constructs is "accept", one that throws at construction is "reject".
function expectConstructionVerdict(vector: ConformanceVector, construct: () => unknown): void {
  let constructed = true;
  try {
    construct();
  } catch {
    constructed = false;
  }
  expect(constructed, `${vector.id}: construction outcome must equal expected.verdict`).toBe(accepts(vector));
}

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

  it("D3-neg-01: the deadline clock re-derives from the anchor's containing block on reorg — a stale pre-reorg h is non-conformant", () => {
    const vector = loadVector("da-verdict.json", "D3-neg-01");
    assertBindable(vector);
    // #49 S1: h is the mined height of the anchor's containing block in the evaluator's current
    // best chain; on reorg h re-derives from the new containing block and every deadline (h+W)
    // moves with it. The SAME served bytes (one absolute firstServableHeight) evaluated under the
    // stale pre-reorg h vs the re-derived post-reorg h' must diverge — so a verdict keyed to the
    // stale h is non-conformant (the reject this vector pins).
    const root = "abcd";
    const batchSize = 4;
    const staleH = 1000; // pre-reorg containing-block height
    const reorgH = staleH + 4; // the anchor re-mines 4 blocks deeper after the reorg
    const firstServable = staleH + 5; // 1005: within h'+W (1006) but past the stale h+W (1002)
    const staleAnchor: AnchorFacts = { minedHeight: staleH, anchoredRoot: root, batchSize };
    const reorgAnchor: AnchorFacts = { minedHeight: reorgH, anchoredRoot: root, batchSize };
    const evidenceAt = (anchorHeight: number): ServedEvidence => ({ anchorHeight, anchoredRoot: root, batchSize, firstServableHeight: firstServable });
    const staleVerdict = holdsPriority(staleAnchor, evidenceAt(staleH), params); // 1005 <= 1002 -> false
    const reorgVerdict = holdsPriority(reorgAnchor, evidenceAt(reorgH), params); // 1005 <= 1006 -> true
    // Primary -> expected.verdict: the stale-clock verdict is conformant only if it equals the
    // re-derived (correct) verdict. Here the re-derivation flips it, so "stale clock conformant" is
    // false === the vector's reject.
    const staleClockConformant = staleVerdict === reorgVerdict;
    expect(staleClockConformant).toBe(accepts(vector)); // false === reject
    // companions: the deadline moved with the re-derived h, and the post-reorg verdict is the correct one.
    expect(availabilityDeadlineHeight(staleH, params)).not.toBe(availabilityDeadlineHeight(reorgH, params)); // 1002 vs 1006
    expect(reorgVerdict).toBe(true); // re-derived h' -> holds priority
    expect(staleVerdict).toBe(false); // stale h -> diverges (would forfeit)
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

  it("T18-neg-01: a claim past the holdsPriority deadline (h+W+1) does not enter the transcript", () => {
    const vector = loadVector("transcript-completeness.json", "T18-neg-01");
    assertBindable(vector);
    // T-area vector bound DIRECTLY to the resident DA holdsPriority predicate (#49 S2/S3) — no
    // wrapper, no new module. The vector's prose `confirmedHeight` is the DA holdsPriority
    // comparand: the served evidence's first-servable height tested against h+W. It is named as
    // the DA comparand here to avoid implying a general claim-mined-height / transcript-admission
    // predicate (no such surface exists). The "does not enter the transcript / already-owned
    // attempt" consequence lives ONLY in this verdict mapping over holdsPriority.
    const hPlusW = H + 2; // the #49 S2/S3 holdsPriority deadline (h+W = 1002)
    const pastDeadlineComparand = hPlusW + 1; // h+W+1 = 1003, one block past the deadline
    // Primary -> expected.verdict: a comparand past h+W forfeits priority, so the transcript-entry
    // consequence is reject (the claim does not enter / is inert).
    expect(holdsPriority(anchor, servedAt(pastDeadlineComparand), params)).toBe(accepts(vector)); // false === reject
    // companion: a comparand at h+W is in-window per the #49 inclusive boundary -> the claim enters.
    expect(holdsPriority(anchor, servedAt(hPlusW), params)).toBe(true);
    // determinism companion: identical comparand -> identical verdict (the "identical on replay" half;
    // the reorg clock re-derivation itself is D3-neg-01's, not re-asserted here).
    expect(holdsPriority(anchor, servedAt(pastDeadlineComparand), params)).toBe(
      holdsPriority(anchor, servedAt(pastDeadlineComparand), params)
    );
  });
});

describe("B2 vector bindings — batched-path DA-consumer family (over the resident DA verdict)", () => {
  // These B vectors are bindings over the RESIDENT da-verdict facts (includable / holdsPriority),
  // NOT a batched-path state model. The candidate B1 5-state enum {provisional, collided,
  // contested, final, nullified} is NOT asserted; auction resolution and the B3 witness format
  // stay out of scope.

  it("B10-neg-01: the DA verdict is a witnessed input — no local-fetch channel can supply it", () => {
    const vector = loadVector("batched-path-transitions.json", "B10-neg-01");
    assertBindable(vector);
    // includable's only evidence input is the witnessed servedEvidence (the #47 eligible(anchor,
    // servedEvidence, W, C) surface). There is no local-fetch / network parameter, so absent
    // witnessed evidence fails closed — a kernel cannot rescue it with "I fetched it locally".
    // Primary -> expected.verdict: with no witnessed evidence the verdict is excluded, and there is
    // no fetch channel to flip it.
    expect(includable(anchor, null, params)).toBe(accepts(vector)); // false === reject (no fetch fallback)
    // companion: the verdict is a pure function of the witnessed servedEvidence only (determinism;
    // the signature carries no fetch / network channel).
    const witnessed = servedAt(H + 5);
    expect(includable(anchor, witnessed, params)).toBe(includable(anchor, witnessed, params));
  });

  it("B3-neg-01: the eligible-claim count is evaluated at one #49 S1 clock; a desynced height changes it", () => {
    const vector = loadVector("batched-path-transitions.json", "B3-neg-01");
    assertBindable(vector);
    // Count includable claims at ONE clock (the anchor's mined height h). Evaluating one claim's
    // eligibility against a DIFFERENT (shifted) clock desynchronizes the count — so the verdict that
    // a multi-clock count is conformant is false (reject); the honest count is one-clock. (No
    // finalization edge is asserted.)
    const claimA = servedAt(H + 5); // includable at h: 1005 <= h+W+C = 1005
    const claimB = servedAt(H + 5);
    const countAtOneClock = [claimA, claimB].filter((e) => includable(anchor, e, params)).length; // 2
    // claimB evaluated against a desynced earlier clock h' = H-1 (deadline 1004) drops it.
    const shiftedAnchor: AnchorFacts = { minedHeight: H - 1, anchoredRoot: "abcd", batchSize: 4 };
    const shiftedB: ServedEvidence = { anchorHeight: H - 1, anchoredRoot: "abcd", batchSize: 4, firstServableHeight: H + 5 };
    const countDesynced =
      (includable(anchor, claimA, params) ? 1 : 0) + (includable(shiftedAnchor, shiftedB, params) ? 1 : 0); // 1
    // Primary -> expected.verdict: a one-clock count equals itself; the desynced count differs, so
    // "the multi-clock count is conformant" is false === reject.
    expect(countAtOneClock === countDesynced).toBe(accepts(vector)); // false === reject
    expect(countAtOneClock).toBe(2);
    expect(countDesynced).toBe(1); // the desynced clock drops claimB
  });

  it("B4-neg-01: only DA-includable claims count toward a collision; a withheld claim contributes nothing", () => {
    const vector = loadVector("batched-path-transitions.json", "B4-neg-01");
    assertBindable(vector);
    // A name collision counts ONLY DA-includable claims. A withheld / DA-excluded colliding claim
    // (no witnessed served evidence) contributes nothing, so it cannot nullify the victim's name by
    // withholding. (The two-DA-valid contrast is a companion, NOT a nullified-state-enum assertion.)
    const realClaim = servedAt(H + 5); // includable
    const withheldClaim = null; // withheld: no witnessed served evidence -> not includable
    const includableCollidingCount =
      (includable(anchor, realClaim, params) ? 1 : 0) + (includable(anchor, withheldClaim, params) ? 1 : 0); // 1
    // Primary -> expected.verdict: a withheld colliding claim does not push the collision to >= 2,
    // so it cannot nullify — "the withheld claim nullifies" is false === reject.
    expect(includableCollidingCount >= 2).toBe(accepts(vector)); // false === reject
    // companion: two DA-valid (includable) colliding claims do reach a collision count of 2.
    const twoIncludable =
      (includable(anchor, servedAt(H + 5), params) ? 1 : 0) + (includable(anchor, servedAt(H + 4), params) ? 1 : 0);
    expect(twoIncludable).toBe(2);
  });

  it("B1-neg-02: batched-path state re-derives from the current witnessed DA verdict; no cache across a flip", () => {
    const vector = loadVector("batched-path-transitions.json", "B1-neg-02");
    assertBindable(vector);
    // The DA verdict flips as the witnessed served evidence changes; the kernel re-derives from the
    // CURRENT witnessed verdict and never serves a cached one across a flip. (No {provisional,
    // collided, contested, final, nullified} state enum is asserted — that is candidate.)
    const beforeFlip = includable(anchor, servedAt(H + 5), params); // true: 1005 <= h+W+C = 1005
    const afterFlip = includable(anchor, servedAt(H + 6), params); // false: 1006 > 1005 — the verdict flips
    // Primary -> expected.verdict: serving the cached pre-flip verdict after a flip is non-conformant;
    // "cached-across-flip is conformant" requires before === after, which is false === reject.
    expect(beforeFlip === afterFlip).toBe(accepts(vector)); // false === reject
    expect(beforeFlip).toBe(true);
    expect(afterFlip).toBe(false); // the verdict genuinely flipped
    // determinism companion: re-deriving from the same current evidence yields the same verdict.
    expect(includable(anchor, servedAt(H + 6), params)).toBe(includable(anchor, servedAt(H + 6), params));
  });
});

describe("B2 vector bindings — bond-qualification family (bondQualifiesForEscalation)", () => {
  it("B6-neg-01: only a qualifying bond at or above the floor escalates; a sub-floor bond is a no-op", () => {
    const vector = loadVector("batched-path-transitions.json", "B6-neg-01");
    assertBindable(vector);
    // #37: a qualifying bond is at/above the supplied floor. The signature takes only
    // (bondAmount, bondFloor) — no claim-count parameter, so a bare claim can never escalate; it
    // asserts nothing about the candidate "contested" state or auction resolution. The floor is a
    // launch-freeze parameter, exercised at TWO distinct values so a baked constant fails.
    expect(bondQualifiesForEscalation.length).toBe(2); // no claim-count channel
    // Primary -> expected.verdict: a sub-floor bond does not qualify (no-op).
    expect(bondQualifiesForEscalation(99_999n, 100_000n).qualifies).toBe(accepts(vector)); // sub-floor -> false === reject
    expect(bondQualifiesForEscalation(100_000n, 100_000n).qualifies).toBe(true); // at-floor -> qualifies (positive companion)
    // second floor (no baked constant): the threshold tracks the supplied floor, not a constant.
    expect(bondQualifiesForEscalation(49_999n, 50_000n).qualifies).toBe(false);
    expect(bondQualifiesForEscalation(50_000n, 50_000n).qualifies).toBe(true);
    // total fail-closed companions: a negative amount does not qualify, and the call never throws.
    expect(bondQualifiesForEscalation(-1n, 100_000n).qualifies).toBe(false);
    expect(() => bondQualifiesForEscalation(100_000n, 100_000n)).not.toThrow();
  });
});

describe("B2 vector bindings — params family (DA-window construction + h+K eligibility)", () => {
  // A second valid parameterization, distinct from the module-level (6, 2, 3): (10, 3, 4)
  // gives availability deadline h+3 and challenge deadline h+7 — used to detect a kernel
  // that has baked the (6, 2, 3) constants.
  const altParams = createDaWindowParams({ K: 10, W: 3, C: 4 });

  it("D9-neg-01: a weak-form triple K < W+C is rejected at kernel construction (#49 S6 strong form)", () => {
    const vector = loadVector("da-verdict.json", "D9-neg-01");
    assertBindable(vector);
    // Primary -> expected.verdict: a weak-form triple's construction outcome is the verdict.
    expectConstructionVerdict(vector, () => createDaWindowParams({ K: 4, W: 2, C: 3 })); // K=4 < W+C=5 -> reject
    expect(() => createDaWindowParams({ K: 5, W: 2, C: 3 })).not.toThrow(); // companion: K=W+C boundary is valid
  });

  it("D12-neg-01: invalid params are rejected; the predicate is total at two distinct parameterizations (no baked constant)", () => {
    const vector = loadVector("da-verdict.json", "D12-neg-01");
    assertBindable(vector);
    // Primary -> expected.verdict: an invalid triple's construction outcome is the verdict.
    expectConstructionVerdict(vector, () => createDaWindowParams({ K: 2, W: 2, C: 3 })); // K < W+C -> reject
    expect(() => createDaWindowParams({ K: 6.5, W: 2, C: 3 })).toThrow(); // companion: non-integer also rejected
    // companion (no baked constant): a (6,2,3)-baked deadline cannot also be correct at (10,3,4).
    expect(challengeDeadlineHeight(H, params)).toBe(H + 5); // (6,2,3)
    expect(challengeDeadlineHeight(H, altParams)).toBe(H + 7); // (10,3,4)
  });

  it("G9-neg-01: a true parametric kernel produces different windows per parameterization (baked default would fail the second)", () => {
    const vector = loadVector("kernel-wide-glue.json", "G9-neg-01");
    assertBindable(vector);
    // Primary -> expected.verdict: the rejected realization is a baked default — one that
    // returns identical windows across both parameterizations. A true parametric kernel does
    // not, so `bakedDefaultAccepted` is false, matching the vector's reject verdict.
    const bakedDefaultAccepted =
      availabilityDeadlineHeight(H, params) === availabilityDeadlineHeight(H, altParams) &&
      challengeDeadlineHeight(H, params) === challengeDeadlineHeight(H, altParams);
    expect(bakedDefaultAccepted).toBe(accepts(vector)); // false === reject
    // companions: the actual windows differ per parameterization.
    expect(availabilityDeadlineHeight(H, params)).not.toBe(availabilityDeadlineHeight(H, altParams)); // h+2 vs h+3
    expect(challengeDeadlineHeight(H, params)).not.toBe(challengeDeadlineHeight(H, altParams)); // h+5 vs h+7
  });

  it("A3-neg-01: an anchor at tip = h+K-1 is not yet eligible (inclusive boundary at h+K)", () => {
    const vector = loadVector("anchor-acceptance.json", "A3-neg-01");
    assertBindable(vector);
    expect(confirmedRootEligible(H, H + params.K - 1, params)).toBe(accepts(vector)); // h+K-1 -> not eligible (accepts=false)
    expect(confirmedRootEligible(H, H + params.K, params)).toBe(true); // companion: eligible exactly at h+K
    expect(() => createDaWindowParams({ K: 4, W: 2, C: 3 })).toThrow(); // S6 companion: K<W+C can't be constructed
  });
});

describe("B2 vector bindings — gate-fee family (gateFeeValidation)", () => {
  it("F8-pos-01: the gate-fee verdict is a pure function of (anchor, batch, fee) with no publisher-identity channel", () => {
    const vector = loadVector("gate-fee-validation.json", "F8-pos-01");
    assertBindable(vector);
    const feeAnchor: GateFeeAnchorFacts = { minedHeight: 1000, anchoredRoot: "abcd", batchSize: 4 };
    const batch: CommittedBatchContents = { anchoredRoot: "abcd", batchSize: 4 };
    const fee: GateFee = { amountSats: 1_000_000n };
    // Primary -> expected.verdict: a structurally-valid, anchor-bound fee passes the B2 gate.
    expect(gateFeeValidation(feeAnchor, batch, fee).accepted).toBe(accepts(vector)); // accept
    // F8 structural assertion (the vector's actual claim): the predicate signature carries exactly
    // three witnessed inputs and NO publisher-identity / endpoint / source parameter — so there is
    // no channel by which a publisher-batched anchor and an N=1 self-posted anchor could validate
    // differently (the I5 censorship-resistance floor). Arity is the mechanical no-extra-param pin.
    expect(gateFeeValidation.length).toBe(3);
    // determinism / no hidden channel: identical witnessed inputs -> byte-identical verdict.
    expect(gateFeeValidation(feeAnchor, batch, fee)).toEqual(gateFeeValidation(feeAnchor, batch, fee));
    // companions (fail-closed, structural — NOT economics): a malformed (negative) fee rejects, and
    // a batch not bound to the anchor's (anchoredRoot, batchSize) commitment rejects.
    expect(gateFeeValidation(feeAnchor, batch, { amountSats: -1n }).accepted).toBe(false);
    expect(gateFeeValidation(feeAnchor, { anchoredRoot: "ffff", batchSize: 4 }, fee).accepted).toBe(false);
    // NOTE: amount adequacy (fee >= Σ g(name), the g(name) schedule) and batchSize-vs-leaf-count are
    // deliberately B3 per the vector scopeNote — not asserted here.
  });
});

describe("B2 vector bindings — transcript-completeness family (transcriptCompleteness)", () => {
  // A distinct, well-formed counted bid set + a labelled "B3-verified witness placeholder".
  // The concrete verifier-checkable witness format and the lot's block range / soft-close are
  // B3 (T2-neg-02 candidate); B2 consumes the witness opaquely.
  const b3Verified: CompletenessWitness = { kind: "b3-verified-completeness-witness" };
  const cleanTranscript: AuctionTranscript = { bids: [{ txid: "ab".repeat(32) }, { txid: "cd".repeat(32) }] };

  it("T1-neg-01: the transcript verdict is pure with no out-of-kernel override channel", () => {
    const vector = loadVector("transcript-completeness.json", "T1-neg-01");
    assertBindable(vector);
    // The signature admits exactly two witnessed inputs (transcript, completenessWitness) and NO
    // actor / source / endpoint / producer / evidence-layer parameter — there is no channel by which
    // a hostile or swapped evidence-layer stub could override the verdict (T1; canon boundary rule).
    expect(transcriptCompleteness.length).toBe(2);
    // determinism / no hidden channel: identical witnessed inputs -> byte-identical verdict.
    expect(transcriptCompleteness(cleanTranscript, b3Verified)).toEqual(transcriptCompleteness(cleanTranscript, b3Verified));
    // Primary -> expected.verdict (negative): with no witness the verdict is incomplete, and there is
    // no out-of-kernel input that could flip it to complete — a hostile stub cannot override it.
    expect(transcriptCompleteness(cleanTranscript, null).complete).toBe(accepts(vector)); // false === reject
    // The no-source/identity guarantee is enforced at RUNTIME (closed shape), not just in the type:
    // a transcript / bid / witness carrying a source / identity / auction-resolution field is rejected,
    // never silently ignored — the exported B2 boundary admits no such field.
    expect(
      transcriptCompleteness({ bids: [{ txid: "ab".repeat(32) }], source: "publisher-x" } as unknown as AuctionTranscript, b3Verified).complete
    ).toBe(false); // `source` on the transcript -> rejected
    expect(
      transcriptCompleteness({ bids: [{ txid: "ab".repeat(32), bidder: "alice", amount: 1000 } as unknown as { txid: string }] }, b3Verified).complete
    ).toBe(false); // `bidder`/`amount` on a bid -> rejected
    expect(
      transcriptCompleteness(cleanTranscript, { kind: "b3-verified-completeness-witness", producer: "publisher-x" } as unknown as CompletenessWitness).complete
    ).toBe(false); // `producer` on the witness -> rejected
    // Total / fail-closed: a malformed JS shape returns a rejecting verdict, never throws (an
    // exported B2 verdict must not be exceptional).
    expect(() => transcriptCompleteness(null as unknown as AuctionTranscript, b3Verified)).not.toThrow();
    expect(transcriptCompleteness(null as unknown as AuctionTranscript, b3Verified).complete).toBe(false); // null transcript
    expect(transcriptCompleteness({ bids: null } as unknown as AuctionTranscript, b3Verified).complete).toBe(false); // bids not an array
    expect(transcriptCompleteness(cleanTranscript, undefined as unknown as CompletenessWitness).complete).toBe(false); // undefined witness
    expect(transcriptCompleteness({ bids: [null as unknown as { txid: string }] }, b3Verified).complete).toBe(false); // null bid
    expect(transcriptCompleteness({ bids: [{ txid: 123 } as unknown as { txid: string }] }, b3Verified).complete).toBe(false); // non-string txid
  });

  it("T2-neg-01: completeness must be witnessed — an absent or producer-asserted witness fails closed", () => {
    const vector = loadVector("transcript-completeness.json", "T2-neg-01");
    assertBindable(vector);
    // Primary -> expected.verdict: a producer-asserted completeness claim is never trusted -> incomplete.
    expect(transcriptCompleteness(cleanTranscript, { kind: "producer-asserted" }).complete).toBe(accepts(vector)); // false === reject
    // companion: an absent witness also fails closed.
    expect(transcriptCompleteness(cleanTranscript, null).complete).toBe(false);
    // companion (positive control): only the B3-verified witness placeholder satisfies the posture.
    // The concrete verifier-checkable format and the lot's block range / soft-close are B3 (T2-neg-02);
    // consumed opaquely here.
    expect(transcriptCompleteness(cleanTranscript, b3Verified).complete).toBe(true);
  });

  it("T21-neg-01: counted bids must be distinct, well-formed L1 txids — no silent dedup", () => {
    const vector = loadVector("transcript-completeness.json", "T21-neg-01");
    assertBindable(vector);
    const dup = "ab".repeat(32);
    // Primary -> expected.verdict: a transcript repeating a bid txid is rejected (not silently deduped).
    expect(transcriptCompleteness({ bids: [{ txid: dup }, { txid: dup }] }, b3Verified).complete).toBe(accepts(vector)); // false === reject
    // companion: a malformed (non-32-byte-lowercase-hex) txid is rejected.
    expect(transcriptCompleteness({ bids: [{ txid: "ZZ" }] }, b3Verified).complete).toBe(false);
    expect(transcriptCompleteness({ bids: [{ txid: "AB".repeat(32) }] }, b3Verified).complete).toBe(false); // uppercase hex rejected
    // companion (positive control): an all-distinct, well-formed set with a verified witness passes.
    expect(transcriptCompleteness(cleanTranscript, b3Verified).complete).toBe(true);
  });
});

// Value-record fixtures. Records are signed over the B1 §8.1 wire v1 digest with @noble
// (the same primitive @ont/wire verifies with), mirroring value-record-authority.test.ts.
const VR_PRIV = "11".repeat(32);
const VR_AUX = new Uint8Array(32); // deterministic BIP340 aux -> reproducible signatures
const vrXonly = (privHex: string): string => bytesToHex(schnorr.getPublicKey(hexToBytes(privHex)));
const VR_PUB = vrXonly(VR_PRIV);
const VR_REF_1 = "aa".repeat(32);
const VR_REF_2 = "bb".repeat(32);
const VR_NAME = "alice";
const VR_T0 = "2026-06-01T00:00:00Z";
const vrIntervalA: OwnershipInterval = { ownerPubkey: VR_PUB, ownershipRef: VR_REF_1 };

function vrSign(opts: {
  priv?: string;
  name?: string;
  ownershipRef?: string;
  sequence: number;
  previousRecordHash?: string | null;
  payloadHex?: string;
  issuedAt?: string;
}): ValueRecordEnvelope {
  const priv = opts.priv ?? VR_PRIV;
  const unsigned: ValueRecordEnvelope = {
    format: VALUE_RECORD_FORMAT,
    recordVersion: VALUE_RECORD_VERSION,
    name: opts.name ?? VR_NAME,
    ownerPubkey: vrXonly(priv),
    ownershipRef: opts.ownershipRef ?? VR_REF_1,
    sequence: opts.sequence,
    previousRecordHash: opts.previousRecordHash ?? null,
    valueType: 1,
    payloadHex: opts.payloadHex ?? "00",
    issuedAt: opts.issuedAt ?? VR_T0,
    signature: "00".repeat(64),
  };
  const digest = valueRecordDigest(unsigned as unknown as Record<string, unknown>);
  return { ...unsigned, signature: bytesToHex(schnorr.sign(digest, hexToBytes(priv), VR_AUX)) };
}

const vrHeadHash = (head: ValueRecordEnvelope): string =>
  bytesToHex(valueRecordDigest(head as unknown as Record<string, unknown>));

describe("B2 vector bindings — value-record family (valueRecordAccept)", () => {
  it("V6-neg-01: a first record must be sequence 1 with a null previous hash", () => {
    const vector = loadVector("value-record-authority.json", "V6-neg-01");
    assertBindable(vector);
    expect(valueRecordAccept(vrSign({ sequence: 2 }), vrIntervalA, null).accepted).toBe(accepts(vector)); // first record at seq 2 -> reject
    expect(valueRecordAccept(vrSign({ sequence: 1 }), vrIntervalA, null).accepted).toBe(true); // companion: valid first record accepts
  });

  it("V7-neg-01: a chain at the max sequence bound cannot extend (fail-closed)", () => {
    const vector = loadVector("value-record-authority.json", "V7-neg-01");
    assertBindable(vector);
    const maxHead = vrSign({ sequence: SEQUENCE_BOUND });
    expect(
      valueRecordAccept(vrSign({ sequence: 5, previousRecordHash: vrHeadHash(maxHead) }), vrIntervalA, maxHead).accepted
    ).toBe(accepts(vector)); // no head+1 is a safe integer at the bound -> reject
    // companions: stale (<=head) and gap (>head+1) sequences also reject.
    const head = vrSign({ sequence: 1 });
    expect(valueRecordAccept(vrSign({ sequence: 1, previousRecordHash: vrHeadHash(head) }), vrIntervalA, head).reason).toBe(
      "v7-stale-or-duplicate-sequence"
    );
    expect(valueRecordAccept(vrSign({ sequence: 3, previousRecordHash: vrHeadHash(head) }), vrIntervalA, head).reason).toBe(
      "v7-sequence-gap"
    );
  });

  it("V8-neg-01: the previous-record hash is recomputed, never trusted as declared", () => {
    const vector = loadVector("value-record-authority.json", "V8-neg-01");
    assertBindable(vector);
    const head = vrSign({ sequence: 1 });
    expect(
      valueRecordAccept(vrSign({ sequence: 2, previousRecordHash: "dd".repeat(32) }), vrIntervalA, head).accepted
    ).toBe(accepts(vector)); // wrong previousRecordHash -> reject
    expect(
      valueRecordAccept(vrSign({ sequence: 2, previousRecordHash: vrHeadHash(head) }), vrIntervalA, head).accepted
    ).toBe(true); // companion: linking the recomputed head hash accepts
  });

  it("V3-neg-01: a recovery-descriptor signature presented as a value-record signature is rejected (domain separation)", () => {
    const vector = loadVector("value-record-authority.json", "V3-neg-01");
    assertBindable(vector);
    // A valid BIP340 signature by owner A, but over the 'ont-recovery-descriptor' digest of the
    // structurally-identical prefix — only the domain label differs, so it cannot authorize a value record.
    const descriptor = {
      format: RECOVERY_DESCRIPTOR_FORMAT,
      descriptorVersion: RECOVERY_DESCRIPTOR_VERSION,
      name: VR_NAME,
      ownerPubkey: VR_PUB,
      ownershipRef: VR_REF_1,
      sequence: 1,
      previousDescriptorHash: null,
      recoveryAddress: "bc1qrecoveryexampleaddr0000000000000000",
      signingProfile: "bip322",
      challengeWindowBlocks: 144,
      issuedAt: VR_T0,
      signature: "00".repeat(64),
    };
    const descSig = bytesToHex(schnorr.sign(recoveryDescriptorDigest(descriptor), hexToBytes(VR_PRIV), VR_AUX));
    const crossContext = { ...vrSign({ sequence: 1 }), signature: descSig };
    expect(valueRecordAccept(crossContext, vrIntervalA, null).accepted).toBe(accepts(vector)); // reject
  });

  it("V4-neg-01: a record validly signed for name A does not validate for name B (the §8.1 digest binds the name)", () => {
    const vector = loadVector("value-record-authority.json", "V4-neg-01");
    assertBindable(vector);
    const recA = vrSign({ name: "alice", sequence: 1 });
    const replayedAsB = { ...recA, name: "bob" }; // keep A's signature, relabel the name (sibling names share ownershipRef)
    expect(valueRecordAccept(replayedAsB, vrIntervalA, null).accepted).toBe(accepts(vector)); // reject: digest binds name
  });

  it("V10-neg-01: a transfer is non-preserving — an old-interval record is rejected under the new interval", () => {
    const vector = loadVector("value-record-authority.json", "V10-neg-01");
    assertBindable(vector);
    const newInterval: OwnershipInterval = { ownerPubkey: VR_PUB, ownershipRef: VR_REF_2 };
    expect(valueRecordAccept(vrSign({ ownershipRef: VR_REF_1, sequence: 1 }), newInterval, null).accepted).toBe(
      accepts(vector)
    ); // old-interval ref under the post-transfer interval -> reject
    expect(valueRecordAccept(vrSign({ ownershipRef: VR_REF_2, sequence: 1 }), newInterval, null).accepted).toBe(true); // companion: fresh seq-1/null-prev under the new ref accepts
    // NOTE: the unassigned-"preserve"-flag-bit aspect of V10 is engine/Transfer-side (X-area); valueRecordAccept
    // only ever sees the post-transfer interval the engine supplies (new ref, null head) — a companion concern.
  });

  it("X14-neg-01: after transfer with no preserve carrier, a prior-owner record is cleared-by-default; the new owner's seq-1 record is the valid head", () => {
    const vector = loadVector("transfer-authority.json", "X14-neg-01");
    assertBindable(vector);
    // X-area vector realized via the value-record authority surface. #18: with no spec-defined
    // preserve carrier the prior record is cleared by default; #17: authority moves to the new
    // owner key under a fresh interval. (DELIBERATELY EXCLUDED, per the vector scopeNote: the
    // Transfer flag-bit registry / preserve-signal carrier — engine X-side, not asserted here.)
    const NEW_OWNER_PRIV = "22".repeat(32);
    const newOwnerPub = vrXonly(NEW_OWNER_PRIV);
    const postTransferInterval: OwnershipInterval = { ownerPubkey: newOwnerPub, ownershipRef: VR_REF_2 };
    // Primary -> expected.verdict: a record validly signed by the PRIOR owner (key A) is stale under
    // the post-transfer interval — the prior record does not carry forward.
    const priorOwnerRecord = vrSign({ ownershipRef: VR_REF_1, sequence: 1 }); // signed by VR_PRIV (owner A)
    expect(valueRecordAccept(priorOwnerRecord, postTransferInterval, null).accepted).toBe(accepts(vector)); // reject
    // the clearing is the authority-moved-to-the-new-owner-key check (#17), not merely the interval ref:
    // even a prior-owner record carrying the NEW ref is stale because the owner key is checked first.
    expect(valueRecordAccept(vrSign({ ownershipRef: VR_REF_2, sequence: 1 }), postTransferInterval, null).reason).toBe(
      "v2-owner-key-mismatch"
    );
    // companion: the new owner's fresh seq-1/null-prev record is the valid head.
    const newOwnerHead = vrSign({ priv: NEW_OWNER_PRIV, ownershipRef: VR_REF_2, sequence: 1 });
    expect(valueRecordAccept(newOwnerHead, postTransferInterval, null).accepted).toBe(true);
  });

  it("V11-pos-01: issuedAt never orders the chain — an earlier-issuedAt successor on valid linkage is accepted", () => {
    const vector = loadVector("value-record-authority.json", "V11-pos-01");
    assertBindable(vector);
    const head = vrSign({ sequence: 1, issuedAt: "2026-06-01T00:00:00Z" });
    const earlier = vrSign({ sequence: 2, previousRecordHash: vrHeadHash(head), issuedAt: "2026-01-01T00:00:00Z" });
    expect(valueRecordAccept(earlier, vrIntervalA, head).accepted).toBe(accepts(vector)); // earlier issuedAt + valid linkage -> accept
    // companion: a LATER issuedAt with a stale sequence is still rejected (recency confers nothing).
    const laterStale = vrSign({ sequence: 1, previousRecordHash: vrHeadHash(head), issuedAt: "2027-01-01T00:00:00Z" });
    expect(valueRecordAccept(laterStale, vrIntervalA, head).reason).toBe("v7-stale-or-duplicate-sequence");
  });

  it("V1-neg-01: the verdict never compares issuedAt to a host clock (purity probe)", () => {
    const vector = loadVector("value-record-authority.json", "V1-neg-01");
    assertBindable(vector);
    // A structurally-rejected record (first record at seq 2 -> v6), evaluated at a far-future and a
    // far-past issuedAt: the verdict must be identical, proving issuedAt is never compared to "now".
    const future = valueRecordAccept(vrSign({ sequence: 2, issuedAt: "2999-01-01T00:00:00Z" }), vrIntervalA, null);
    const past = valueRecordAccept(vrSign({ sequence: 2, issuedAt: "1999-01-01T00:00:00Z" }), vrIntervalA, null);
    expect(future.accepted).toBe(accepts(vector)); // reject regardless of issuedAt
    expect(future).toEqual(past); // companion: byte-identical verdict at any host clock
  });
});

// Engine-transfer fixtures (mirror engine.test.ts): seed an owned NameRecord, build a
// Transfer as an OP_RETURN-carrying Bitcoin tx, apply it through the engine, and read the
// transfer event's provenance verdict — "applied" maps to accept, "ignored" to reject.
const ET_OWNER_PRIV = "01".repeat(32);
const ET_OWNER_PUB = deriveOwnerPubkey(ET_OWNER_PRIV);
const ET_NEW_OWNER_PRIV = "02".repeat(32);
const ET_NEW_OWNER_PUB = deriveOwnerPubkey(ET_NEW_OWNER_PRIV);
const ET_STRANGER_PRIV = "03".repeat(32);
const ET_OLD_BOND_TXID = "cc".repeat(32);
const ET_OLD_BOND_VOUT = 0;
const ET_OLD_HEAD_TXID = "dd".repeat(32);

function etSeed(state: OntState, overrides: Partial<NameRecord> & { name: string }): NameRecord {
  const record: NameRecord = {
    status: "immature",
    currentOwnerPubkey: ET_OWNER_PUB,
    claimCommitTxid: "a1".repeat(32),
    claimRevealTxid: "b1".repeat(32),
    claimHeight: 100,
    maturityHeight: 1000,
    requiredBondSats: 50_000n,
    currentBondTxid: ET_OLD_BOND_TXID,
    currentBondVout: ET_OLD_BOND_VOUT,
    currentBondValueSats: 50_000n,
    lastStateTxid: ET_OLD_HEAD_TXID,
    lastStateHeight: 100,
    winningCommitBlockHeight: 100,
    winningCommitTxIndex: 0,
    ...overrides,
  };
  state.names.set(record.name, record);
  return record;
}
const etOpReturn = (payload: TransferEventPayload): BitcoinTransactionOutput => ({
  valueSats: 0n,
  scriptType: "op_return",
  dataHex: bytesToHex(encodeTransferPayload(payload)),
});
const etPayment = (valueSats: bigint): BitcoinTransactionOutput => ({ valueSats, scriptType: "payment" });
const etBondInput = (txid: string, vout: number): BitcoinTransactionInput => ({ txid, vout, coinbase: false });
const etSignedTransfer = (fields: TransferAuthorizationFields, signerPriv: string): TransferEventPayload =>
  createTransferPayload({ ...fields, signature: signTransferAuthorization({ ...fields, ownerPrivateKeyHex: signerPriv }) });
function etBlock(input: {
  txid: string;
  blockHeight: number;
  payload: TransferEventPayload;
  inputs?: readonly BitcoinTransactionInput[];
  extraOutputs?: readonly BitcoinTransactionOutput[]; // outputs[0] is always the OP_RETURN
}): BitcoinTransactionInBlock {
  return {
    tx: { txid: input.txid, inputs: input.inputs ?? [], outputs: [etOpReturn(input.payload), ...(input.extraOutputs ?? [])] },
    blockHeight: input.blockHeight,
    txIndex: 0,
  };
}
function etApplyVerdict(state: OntState, tx: BitcoinTransactionInBlock): "applied" | "ignored" | undefined {
  return applyBlockTransactionsWithProvenance(state, [tx], 0).flatMap((record) => record.events)[0]?.validationStatus;
}

describe("B2 vector bindings — engine-transfer family (applyBlockTransactions)", () => {
  const baseFields: TransferAuthorizationFields = {
    prevStateTxid: ET_OLD_HEAD_TXID,
    newOwnerPubkey: ET_NEW_OWNER_PUB,
    flags: 0,
    successorBondVout: 1,
  };
  const matureFields: TransferAuthorizationFields = { ...baseFields, successorBondVout: 0 };

  it("X2-neg-01: only the current owner key over the §5 transfer digest authorizes a transfer", () => {
    const vector = loadVector("transfer-authority.json", "X2-neg-01");
    assertBindable(vector);
    // primary: a transfer signed by a non-owner (stranger) key authorizes nothing (mature path).
    const state = createEmptyState();
    etSeed(state, { name: "alice", maturityHeight: 1000 });
    const applied =
      etApplyVerdict(state, etBlock({ txid: "e0".repeat(32), blockHeight: 2000, payload: etSignedTransfer(matureFields, ET_STRANGER_PRIV) })) ===
      "applied";
    expect(applied).toBe(accepts(vector)); // accepts=false -> ignored
    // companion (caseA): a recover-owner-domain signature presented as a transfer signature also authorizes nothing.
    const recoverSig = signRecoverOwnerCancelAuthorization({
      ...matureFields,
      challengeWindowBlocks: 144,
      recoveryDescriptorHash: "ee".repeat(32),
      ownerPrivateKeyHex: ET_OWNER_PRIV,
    });
    const crossState = createEmptyState();
    etSeed(crossState, { name: "alice", maturityHeight: 1000 });
    const crossPayload = createTransferPayload({ ...matureFields, signature: recoverSig });
    expect(etApplyVerdict(crossState, etBlock({ txid: "e1".repeat(32), blockHeight: 2000, payload: crossPayload }))).toBe("ignored");
    // companion (caseB): the incoming/recipient owner self-signing authorizes nothing — it must
    // verify against the current owner key, not the key being transferred to.
    const recipientState = createEmptyState();
    etSeed(recipientState, { name: "alice", maturityHeight: 1000 });
    expect(
      etApplyVerdict(recipientState, etBlock({ txid: "e8".repeat(32), blockHeight: 2000, payload: etSignedTransfer(matureFields, ET_NEW_OWNER_PRIV) }))
    ).toBe("ignored");
  });

  it("X6-neg-01: a pre-maturity successor bond below the required amount is rejected — at two distinct required values (no baked constant)", () => {
    const vector = loadVector("transfer-authority.json", "X6-neg-01");
    assertBindable(vector);
    // The threshold tracks the per-name requiredBondSats, exercised at two distinct
    // non-coincident values: a kernel with a baked 50,000 constant would WRONGLY apply the
    // 123,455-sat successor under the 123,456 requirement.
    const transferVerdict = (
      requiredBondSats: bigint,
      successorSats: bigint,
      txid: string
    ): "applied" | "ignored" | undefined => {
      const state = createEmptyState();
      etSeed(state, { name: "alice", maturityHeight: 1000, requiredBondSats });
      return etApplyVerdict(state, etBlock({
        txid,
        blockHeight: 500, // pre-maturity, spends the current bond
        payload: etSignedTransfer(baseFields, ET_OWNER_PRIV),
        inputs: [etBondInput(ET_OLD_BOND_TXID, ET_OLD_BOND_VOUT)],
        extraOutputs: [etPayment(successorSats)],
      }));
    };
    // primary -> expected.verdict, at a non-placeholder required value: 1 sat short rejects.
    expect(transferVerdict(123_456n, 123_455n, "e2".repeat(32)) === "applied").toBe(accepts(vector));
    // companions: the same required value applies exactly, and the threshold tracks a SECOND value.
    expect(transferVerdict(123_456n, 123_456n, "e3".repeat(32))).toBe("applied"); // exact = required applies
    expect(transferVerdict(50_000n, 49_999n, "e6".repeat(32))).toBe("ignored"); // tracks a different value
    expect(transferVerdict(50_000n, 50_000n, "e7".repeat(32))).toBe("applied");
  });

  it("X6-neg-02: a successorBondVout beyond the u8 ceiling is unrepresentable and rejected at the wire", () => {
    const vector = loadVector("transfer-authority.json", "X6-neg-02");
    assertBindable(vector);
    // primary -> expected.verdict: an out-of-range (>255) successorBondVout cannot be encoded.
    expectConstructionVerdict(vector, () =>
      createTransferPayload({ ...baseFields, successorBondVout: 256, signature: "00".repeat(64) })
    );
    // companion: the same transfer with an in-range vout designating an adequate output applies.
    const ok = createEmptyState();
    etSeed(ok, { name: "alice", maturityHeight: 1000, requiredBondSats: 50_000n });
    expect(
      etApplyVerdict(ok, etBlock({
        txid: "e4".repeat(32),
        blockHeight: 500,
        payload: etSignedTransfer(baseFields, ET_OWNER_PRIV),
        inputs: [etBondInput(ET_OLD_BOND_TXID, ET_OLD_BOND_VOUT)],
        extraOutputs: [etPayment(50_000n)],
      }))
    ).toBe("applied");
  });

  it("X8-pos-01: a mature transfer ignores the bond byte and applies with no bond inputs/outputs", () => {
    const vector = loadVector("transfer-authority.json", "X8-pos-01");
    assertBindable(vector);
    const state = createEmptyState();
    etSeed(state, { name: "alice", maturityHeight: 1000 });
    // primary: comfortably past maturity (h=5000 >> 1000), arbitrary successorBondVout, no bond -> applied.
    const applied =
      etApplyVerdict(state, etBlock({
        txid: "e5".repeat(32),
        blockHeight: 5000,
        payload: etSignedTransfer({ ...baseFields, successorBondVout: 255 }, ET_OWNER_PRIV),
      })) === "applied";
    expect(applied).toBe(accepts(vector)); // accepts=true -> applied
    expect(state.names.get("alice")?.currentBondTxid).toBe(ET_OLD_BOND_TXID); // companion: bond fields untouched on the mature path
  });
});

// The consensus package's own source dir, for the A10 purity re-scan. This file is a
// .test.ts and so is itself excluded from the production-module gate (as in b2-boundary.test.ts).
const consensusSrcDir = dirname(fileURLToPath(import.meta.url));
const HOST_IO_IMPORT =
  /^(node:|fs$|fs\/promises$|https?$|net$|tls$|dns$|dgram$|child_process$|worker_threads$|cluster$|readline$|process$|timers$|perf_hooks$|os$)/;
const HOST_IO_GLOBAL =
  /\b(Date|setTimeout|setInterval|fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB)\b|\bprocess\.env\b|\bMath\.random\b/;

// Production @ont/consensus modules that admit a host-I/O / clock / network channel — the
// seam a live-availability check would need. Mirrors b2-boundary.test.ts's import-surface scan.
function productionModulesAdmittingHostIO(): string[] {
  const offenders: string[] = [];
  for (const file of readdirSync(consensusSrcDir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).sort()) {
    const text = readFileSync(join(consensusSrcDir, file), "utf8");
    const imports = [
      ...text.matchAll(/\bfrom\s*["']([^"']+)["']/g),
      ...text.matchAll(/\bimport\s*["']([^"']+)["']/g),
    ].map((match) => match[1] as string);
    if (imports.some((spec) => HOST_IO_IMPORT.test(spec)) || HOST_IO_GLOBAL.test(text)) {
      offenders.push(file);
    }
  }
  return offenders;
}

describe("B2 vector bindings — scanner / boundary-purity family (meta-shaped)", () => {
  it("A1-neg-01: the golden RootAnchor near-miss sweep (truncations, trailing byte, wrong magic, bad version, unassigned/retired type) opens no batch", () => {
    const vector = loadVector("anchor-acceptance.json", "A1-neg-01");
    assertBindable(vector);
    const active = new Set([0x01]);
    // The 0x0b RootAnchor golden (packages/wire/vectors/events.json) — the fixture's positive control.
    const goldenHex =
      "4f4e54010b24ba75b09004e044b254d238c53fa7c057111a65f4959335968970a70a75083e22d10d5ce4947e2f186d299a8f648f96032d0e22d3d4cc55930e7ac31e47ddc40000002a";
    const golden = hexToBytes(goldenHex);
    expect(classifyOutput(golden, active).class).toBe("valid"); // positive control decodes valid

    // The fixture's full near-miss family: every truncation, one trailing byte, wrong magic,
    // a non-active version, an unassigned type, and the retired 0x0d marker type.
    const mutated = (set: (bytes: Uint8Array) => void): Uint8Array => {
      const copy = golden.slice();
      set(copy);
      return copy;
    };
    const nearMisses: Uint8Array[] = [];
    for (let n = 1; n < golden.length; n++) nearMisses.push(golden.slice(0, n)); // truncations 1..len-1
    nearMisses.push(new Uint8Array([...golden, 0x00])); // one trailing byte (over-long)
    nearMisses.push(mutated((b) => { b[0] = 0x00; })); // wrong magic (byte 0)
    nearMisses.push(mutated((b) => { b[3] = 0x02; })); // non-active version (byte 3 != 0x01)
    nearMisses.push(mutated((b) => { b[4] = 0x05; })); // unassigned event type (byte 4)
    nearMisses.push(mutated((b) => { b[4] = 0x0d; })); // retired 0x0d (AvailabilityMarker) type

    // primary -> expected.verdict (aggregate over the whole family): NO near-miss opens a batch.
    const anyOpensBatch = nearMisses.some((bytes) => {
      const r = classifyOutput(bytes, active);
      return r.class === "valid" || r.event !== null;
    });
    expect(anyOpensBatch).toBe(accepts(vector)); // false === reject
    // companion: each near-miss individually classifies non-valid with no event materializing.
    for (const bytes of nearMisses) {
      const r = classifyOutput(bytes, active);
      expect(r.class === "valid", `near-miss of length ${bytes.length} unexpectedly classified valid`).toBe(false);
      expect(r.event).toBeNull();
    }
  });

  it("A10-neg-01: the production kernel admits no live-availability seam (host I/O / clock / network)", () => {
    const vector = loadVector("anchor-acceptance.json", "A10-neg-01");
    assertBindable(vector);
    // Meta/purity binding: re-scan the production modules for the host-I/O channel a live
    // availability check would need. (b2-boundary.test.ts is the standing gate; this ties
    // A10's verdict to that invariant.)
    const admitsSeam = productionModulesAdmittingHostIO().length > 0;
    expect(admitsSeam).toBe(accepts(vector)); // false === reject: no live-availability seam admitted
  });

  it("G7-neg-01: the evidence interface is fail-closed and admits no provenanceless boolean witness", () => {
    const vector = loadVector("kernel-wide-glue.json", "G7-neg-01");
    assertBindable(vector);
    // caseB primary: absent witnessed evidence fails closed — the verdict goes against eligibility.
    expect(includable(anchor, null, params)).toBe(accepts(vector)); // false === reject
    // caseA companion: a present-but-unbound witness (wrong root — no verifier-checkable match to the
    // anchored commitment) is also rejected; there is no bare-boolean "available:true" acceptance path.
    const unbound: ServedEvidence = {
      anchorHeight: anchor.minedHeight,
      anchoredRoot: "ffff",
      batchSize: anchor.batchSize,
      firstServableHeight: anchor.minedHeight,
    };
    expect(includable(anchor, unbound, params)).toBe(false);
    // positiveCompanion: determinism — two evaluations of identical inputs agree.
    const bound = servedAt(anchor.minedHeight);
    expect(includable(anchor, bound, params)).toBe(includable(anchor, bound, params));
  });
});
