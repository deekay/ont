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
  RECOVERY_DESCRIPTOR_VERSION_V1,
  RECOVERY_DESCRIPTOR_VERSION_V2,
  SEQUENCE_BOUND,
  VALUE_RECORD_FORMAT,
  VALUE_RECORD_VERSION,
  bytesToHex,
  hexToBytes,
  recoverAuthDigest,
  recoveryDescriptorDigest,
  valueRecordDigest,
} from "@ont/wire";
import {
  acceptRecoverOwner,
  type RecoverOwnerInvokeFacts,
  type RecoveryDescriptorEvidence,
  type RecoveryNameStateFacts,
  type RecoveryParams,
} from "./recovery-invoke-authority.js";
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
  settlementLockMatchesMaturity,
  settlementMaterializes,
  type AcceptedWinningBid,
  type SettlementLockCommitment,
} from "./settlement.js";
import {
  acceptAuctionBid,
  openingFloor,
  selectAuctionWinner,
  type AuctionBidFacts,
  type AuctionBondFacts,
  type AuctionParams,
  type AuctionResolutionTranscript,
  type PriorAuctionState,
} from "./auction-resolution.js";
import { resolveNoticeWindow, bondInNoticeWindow, type NoticeWindowClaim, type NoticeWindowInput } from "./notice-window.js";
import { resolveReopen, type ReopenInput } from "./reopen-resolution.js";
import { resolveNameOccupancy } from "./occupancy.js";
import { deriveBatchedInsertions, type BatchExclusionInput } from "./batch-exclusion.js";
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
  refreshDerivedState,
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
  // settlement family (settlementLockMatchesMaturity / settlementMaterializes)
  "S5-neg-01",
  "S15-neg-01",
  // reorg/replay-determinism family (over resident params / value-record predicates)
  "Z13-neg-01",
  "Z4-neg-01",
  "Z12-neg-01",
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
  // recovery-invoke-authority family (acceptRecoverOwner authorization/evidence gate, #67)
  "R1-neg-01",
  "R2-neg-01",
  "R7-neg-01",
  "R9-neg-01",
  "R10-neg-01",
  "R10-neg-02",
  "T19-pos-01",
  // recovery completion (R18, via refreshDerivedState) + pending-create purity (G6, no callback)
  "R18-pos-01",
  "G6-neg-01",
  // auction-resolution family (#68)
  "Q1-pos-01",
  "Q2-pos-01",
  "Q3-neg-01",
  "Q4-neg-01",
  "Q7-neg-01",
  "Q9-pos-01",
  "Q9-neg-01",
  "Q10-neg-01",
  "T7-neg-01",
  "T9-neg-01",
  "G1-pos-01",
  // notice-window resolution family (#69)
  "T17-neg-01",
  "F11-neg-01",
  // reopen/re-auction resolution family (#70)
  "T22-neg-01",
  "T22-neg-02",
  "B19-neg-01",
  // occupancy family (#71)
  "A11-pos-01",
  // DA-locality trio: batch-exclusion (#72) + Z9 one-clock bond (#73)
  "B10-pos-01",
  "D7-pos-01",
  "Z9-neg-01",
  // bind-to-resident closing batch (auction #68 / reopen #70 / settlement #65)
  "B14-neg-01",
  "B15-pos-01",
  "S9-neg-01",
  "S4-neg-01",
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
    // Total fail-closed (the #64 / #63 discipline) — pin every claim #64 makes: a non-bigint or
    // negative amount/floor does not qualify AND never throws (the exported boundary sees arbitrary
    // JS). A loose view exercises the non-bigint cases the typed signature forbids at call sites.
    const callLoose = bondQualifiesForEscalation as unknown as (
      a: unknown,
      b: unknown
    ) => { qualifies: boolean; reason: string };
    expect(bondQualifiesForEscalation(-1n, 100_000n).qualifies).toBe(false); // negative amount
    expect(bondQualifiesForEscalation(100_000n, -1n).qualifies).toBe(false); // negative floor
    expect(callLoose("100000", 100_000n).qualifies).toBe(false); // non-bigint amount (string)
    expect(callLoose(100_000n, 100_000).qualifies).toBe(false); // non-bigint floor (number)
    expect(() => bondQualifiesForEscalation(100_000n, 100_000n)).not.toThrow(); // valid call
    expect(() => bondQualifiesForEscalation(-1n, -1n)).not.toThrow(); // negative inputs
    expect(() => callLoose("x", null)).not.toThrow(); // arbitrary malformed inputs
  });
});

describe("B2 vector bindings — settlement family (settlementLockMatchesMaturity / settlementMaterializes)", () => {
  it("S5-neg-01: a winning bid whose settlementLockBlocks != the protocol maturity does not settle", () => {
    const vector = loadVector("settlement-consequences.json", "S5-neg-01");
    assertBindable(vector);
    // S5 (#12 + WIRE §4.3): the per-bid settlementLockBlocks must equal the protocol maturityBlocks;
    // a differing (e.g. shortened) override does not settle. maturityBlocks is a launch-freeze
    // parameter, exercised at TWO distinct values so a baked constant fails. It validates ONLY the
    // equality — no maturity-height computation, no anchor choice, no bid validation, no record settle.
    // Primary -> expected.verdict: a mismatched lock commitment does not match (does not settle).
    expect(settlementLockMatchesMaturity({ settlementLockBlocks: 99 }, 100).matches).toBe(accepts(vector)); // mismatch -> false === reject
    expect(settlementLockMatchesMaturity({ settlementLockBlocks: 100 }, 100).matches).toBe(true); // equal -> matches (positive companion)
    // second maturity value (no baked constant): the comparison tracks the supplied parameter.
    expect(settlementLockMatchesMaturity({ settlementLockBlocks: 144 }, 288).matches).toBe(false);
    expect(settlementLockMatchesMaturity({ settlementLockBlocks: 288 }, 288).matches).toBe(true);
    // Total fail-closed + closed-shape (the #65 discipline) — pin every claim mechanically. A
    // loose-typed view exercises the non-object cases the typed signature forbids at call sites.
    const s5Loose = settlementLockMatchesMaturity as unknown as (a: unknown, b: unknown) => { matches: boolean; reason: string };
    expect(settlementLockMatchesMaturity({ settlementLockBlocks: -1 }, 100).matches).toBe(false); // negative lock
    expect(s5Loose(null, 100).matches).toBe(false); // null commitment
    expect(s5Loose("x", 100).matches).toBe(false); // non-object commitment
    expect(s5Loose({ settlementLockBlocks: 1.5 }, 100).matches).toBe(false); // non-integer settlementLockBlocks
    expect(s5Loose({ settlementLockBlocks: 100 }, 1.5).matches).toBe(false); // non-integer maturityBlocks
    expect(s5Loose({ settlementLockBlocks: 100 }, -1).matches).toBe(false); // negative maturityBlocks
    expect(
      settlementLockMatchesMaturity({ settlementLockBlocks: 100, source: "bidder-x" } as unknown as SettlementLockCommitment, 100).matches
    ).toBe(false); // extra field rejected — no source authority
    expect(() => s5Loose(null, 100)).not.toThrow();
    expect(() => s5Loose("x", "y")).not.toThrow();
    expect(() => s5Loose({ settlementLockBlocks: 1.5 }, -1)).not.toThrow();
  });

  it("S15-neg-01: ownership materializes only from an actual accepted winning bid", () => {
    const vector = loadVector("settlement-consequences.json", "S15-neg-01");
    assertBindable(vector);
    // S15 (#37): the materialization GATE. No accepted winner / zero bids / a settled phase with no
    // valid accepted winner yields no owner. The accepted winner is an INPUT from winner selection
    // (Q); B2 does not resolve it, and this gate does NOT construct the NameRecord.
    // Primary -> expected.verdict: with no accepted winning bid, nothing materializes (no owner).
    expect(settlementMaterializes(null).materializes).toBe(accepts(vector)); // null -> false === reject
    // companion (positive control): a valid accepted-winning-bid placeholder materializes.
    expect(settlementMaterializes({ kind: "accepted-winning-bid" }).materializes).toBe(true);
    // closed-shape: a catalog / phase / source field on the winner object is not admitted as
    // authority — it does not materialize (fail closed), never throws.
    expect(
      settlementMaterializes({ kind: "accepted-winning-bid", phase: "settled", source: "catalog" } as unknown as AcceptedWinningBid).materializes
    ).toBe(false); // extra field rejected — no catalog/phase/source authority
    // Total fail-closed (the #65 discipline) — a loose-typed view exercises the malformed cases.
    const s15Loose = settlementMaterializes as unknown as (a: unknown) => { materializes: boolean; reason: string };
    expect(s15Loose(undefined).materializes).toBe(false); // undefined -> no owner
    expect(s15Loose("x").materializes).toBe(false); // non-object
    expect(s15Loose({ kind: "nope" }).materializes).toBe(false); // wrong kind
    expect(() => s15Loose(undefined)).not.toThrow();
    expect(() => s15Loose("x")).not.toThrow();
    expect(() => s15Loose({ kind: "nope" })).not.toThrow();
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

describe("B2 vector bindings — reorg/replay-determinism family (over resident predicates)", () => {
  // Z vectors are determinism / reorg-invariance / no-wall-clock PROPERTIES over the resident
  // predicates (params, value-record) — same-lane bindings, no new module and no reorg-replay
  // engine. They assert the properties by feeding the pure predicates their canonical inputs.
  // (Z9-neg-01 is deferred: it needs a notice-window / bond-window surface that consumes the
  // re-derived current-chain mined height, which is not resident — binding it through holdsPriority
  // or bondQualifiesForEscalation would conflate distinct rules.)

  it("Z13-neg-01: the DA-window kernel enforces #49 S6 strong form at construction (K>=W+C; lower bounds; no baked constant)", () => {
    const vector = loadVector("reorg-replay-determinism.json", "Z13-neg-01");
    assertBindable(vector);
    // Strong form #49 S6: K >= W+C. The weak-form-only triple K = W+C-1 (here 4 = 5-1, with W <= K
    // still holding) is REJECTED at construction — the distinct strong-form content beyond D9.
    // Primary -> expected.verdict: a strong-form-violating (weak-form-passing) triple fails construction.
    expectConstructionVerdict(vector, () => createDaWindowParams({ K: 4, W: 2, C: 3 })); // K=W+C-1=4 -> reject
    // lower-bound rejects (#49 S6: K < 1 / W < 1 / C < 1):
    expect(() => createDaWindowParams({ K: 0, W: 2, C: 3 })).toThrow();
    expect(() => createDaWindowParams({ K: 6, W: 0, C: 3 })).toThrow();
    expect(() => createDaWindowParams({ K: 6, W: 2, C: 0 })).toThrow();
    // two distinct valid K>=W+C parameterizations both construct and are boundary-consistent (no
    // baked constant -> different deadlines).
    const a = createDaWindowParams({ K: 6, W: 2, C: 3 });
    const b = createDaWindowParams({ K: 10, W: 3, C: 4 });
    expect(challengeDeadlineHeight(H, a)).not.toBe(challengeDeadlineHeight(H, b)); // h+5 vs h+7
  });

  it("Z4-neg-01: an anchor contributes to the confirmed root only at depth >= K; sub-K churn cannot make a K-1 anchor eligible", () => {
    const vector = loadVector("reorg-replay-determinism.json", "Z4-neg-01");
    assertBindable(vector);
    // #49 S2: confirmed-root membership is a pure function of (anchorHeight, tipHeight, K), recomputed
    // from the current canonical chain — never latched.
    // Primary -> expected.verdict: an anchor at depth K-1 (tip = h+K-1) is not eligible.
    expect(confirmedRootEligible(H, H + params.K - 1, params)).toBe(accepts(vector)); // depth K-1 -> false === reject
    expect(confirmedRootEligible(H, H + params.K, params)).toBe(true); // depth K -> eligible (companion)
    // reorg-invariance (the honest property the resident surface shows; NOT a full root-sequence
    // engine): any sub-K-deep churn that leaves the anchor at depth K-1 (tip recomputed to h+K-1)
    // keeps it not-eligible, deterministically — membership is recomputed, never latched.
    expect(confirmedRootEligible(H, H + params.K - 1, params)).toBe(
      confirmedRootEligible(H, H + params.K - 1, params)
    ); // recompute -> identical
    expect(confirmedRootEligible(H, H + params.K - 1, params)).toBe(false); // sub-K churn cannot promote a K-1 anchor
  });

  it("Z12-neg-01: no kernel predicate consumes wall-clock; issuedAt is opaque bytes, replays byte-identical (kernel-wide guard)", () => {
    const vector = loadVector("reorg-replay-determinism.json", "Z12-neg-01");
    assertBindable(vector);
    // Kernel-wide no-wall-clock guard (SOFTWARE_CANON L2 "No DB/network/clock" + WIRE §8). Two limbs:
    // (a) STRUCTURAL — the b2-boundary purity gate (b2-boundary.test.ts) already bars Date/clock/
    //     Math.random imports + globals from every production consensus module: the no-clock channel
    //     is closed at the boundary, kernel-wide. This binding rides that gate.
    // (b) DETERMINISM PROBE — a resident issuedAt-consuming predicate yields a byte-identical verdict
    //     at a far-future vs far-past issuedAt; issuedAt influences only digest bytes, never compared
    //     to "now". Uses the value-record surface as a witness for the KERNEL-WIDE guard (NOT a
    //     restatement of V11 issuedAt-ordering).
    const farFuture = valueRecordAccept(vrSign({ sequence: 2, issuedAt: "2999-01-01T00:00:00Z" }), vrIntervalA, null);
    const farPast = valueRecordAccept(vrSign({ sequence: 2, issuedAt: "1999-01-01T00:00:00Z" }), vrIntervalA, null);
    // Primary -> expected.verdict: a kernel rule comparing issuedAt to "now" is rejected; the verdict
    // is wall-clock-independent, so "wall-clock affects the verdict" is false === reject.
    const wallClockAffectsVerdict = farFuture.accepted !== farPast.accepted || farFuture.reason !== farPast.reason;
    expect(wallClockAffectsVerdict).toBe(accepts(vector)); // false === reject
    expect(farFuture).toEqual(farPast); // byte-identical verdict at any host clock
  });
});

// ---- auction-resolution family (#68) ----
const AUCTION_PARAMS: AuctionParams = {
  baseWindowBlocks: 1_008,
  softCloseWindowBlocks: 144,
  minRaiseSats: 1_000n,
  minRaiseBasisPoints: 500,
  softCloseMinRaiseSats: 1_000n,
  softCloseMinRaiseBasisPoints: 1_000,
};
const auctionTxid = (byte: string): string => byte.repeat(64);
const auctionPubkey = (byte: string): string => byte.repeat(64);
const auctionBid = (overrides: Partial<AuctionBidFacts> = {}): AuctionBidFacts => ({
  bidAmountSats: 50_000n,
  minedHeight: 900_000,
  bondVout: 1,
  lotBinding: { kind: "b3-verified-auction-lot-binding" },
  ...overrides,
});
const auctionPaymentBond = (valueSats: bigint): AuctionBondFacts => ({
  kind: "b3-verified-bidder-controlled-payment",
  valueSats,
});
const auctionUnopened = (openingFloorSats = 50_000n): PriorAuctionState => ({
  openingFloorSats,
  currentLeaderAmountSats: null,
  currentCloseHeight: null,
});
const auctionOpened = (overrides: Partial<PriorAuctionState> = {}): PriorAuctionState => ({
  openingFloorSats: 50_000n,
  currentLeaderAmountSats: 100_000n,
  currentCloseHeight: 901_000,
  ...overrides,
});
const auctionComplete = { complete: true, reason: "transcript-complete" } as const;
const auctionTranscriptBid = (overrides: Partial<AuctionResolutionTranscript["bids"][number]> = {}) => ({
  txid: auctionTxid("a"),
  bondVout: 1,
  bidderPubkey: auctionPubkey("1"),
  bidAmountSats: 100_000n,
  accepted: true,
  blockHeight: 900_000,
  txIndex: 1,
  ...overrides,
});
const auctionTranscript = (bids: AuctionResolutionTranscript["bids"]): AuctionResolutionTranscript => ({ bids });

describe("B2 vector bindings — auction-resolution family (#68)", () => {
  it("Q1-pos-01: an at-floor opening bid satisfying every acceptance clause opens the auction", () => {
    const vector = loadVector("winner-selection.json", "Q1-pos-01");
    assertBindable(vector);
    expect(acceptAuctionBid(auctionBid(), auctionPaymentBond(50_000n), auctionUnopened(), AUCTION_PARAMS).accepted).toBe(
      accepts(vector)
    ); // accept
    expect(
      acceptAuctionBid(
        auctionBid({ bidAmountSats: 49_999n }),
        auctionPaymentBond(49_999n),
        auctionUnopened(),
        AUCTION_PARAMS
      )
    ).toMatchObject({ accepted: false, stateEffect: "none" }); // one sat below opens nothing
  });

  it("Q2-pos-01: opening floor keys off canonical byte length with <=4 curve / >=5 flat clamp", () => {
    const vector = loadVector("winner-selection.json", "Q2-pos-01");
    assertBindable(vector);
    const p1 = { oneCharPriceSats: 100_000_000n, longNameFloorSats: 50_000n };
    const p2 = { oneCharPriceSats: 80_000_000n, longNameFloorSats: 70_000n };
    expect(openingFloor({ canonicalNameByteLength: 4 }, p1).computed).toBe(accepts(vector)); // accept
    expect(openingFloor({ canonicalNameByteLength: 4 }, p1).floorSats).toBe(12_500_000n);
    expect(openingFloor({ canonicalNameByteLength: 5 }, p1).floorSats).toBe(50_000n);
    expect(openingFloor({ canonicalNameByteLength: 4 }, p2).floorSats).toBe(10_000_000n);
    expect(openingFloor({ canonicalNameByteLength: 5 }, p2).floorSats).toBe(70_000n);
  });

  it("Q3-neg-01: under-bond and missing output reject; exact and over-bond pass the PR-21 value clause", () => {
    const vector = loadVector("winner-selection.json", "Q3-neg-01");
    assertBindable(vector);
    expect(
      acceptAuctionBid(auctionBid({ bidAmountSats: 50_000n }), auctionPaymentBond(49_999n), auctionUnopened(), AUCTION_PARAMS)
        .accepted
    ).toBe(accepts(vector)); // reject
    expect(acceptAuctionBid(auctionBid(), { kind: "missing", valueSats: null }, auctionUnopened(), AUCTION_PARAMS).accepted).toBe(false);
    expect(acceptAuctionBid(auctionBid(), auctionPaymentBond(50_000n), auctionUnopened(), AUCTION_PARAMS).accepted).toBe(true);
    expect(acceptAuctionBid(auctionBid(), auctionPaymentBond(60_000n), auctionUnopened(), AUCTION_PARAMS).accepted).toBe(true);
  });

  it("Q4-neg-01: OP_RETURN / unspendable bond outputs are rejected even with sufficient value", () => {
    const vector = loadVector("winner-selection.json", "Q4-neg-01");
    assertBindable(vector);
    expect(
      acceptAuctionBid(auctionBid(), { kind: "op_return", valueSats: 50_000n }, auctionUnopened(), AUCTION_PARAMS)
        .accepted
    ).toBe(accepts(vector)); // reject
    expect(
      acceptAuctionBid(auctionBid(), { kind: "provably-unspendable", valueSats: 50_000n }, auctionUnopened(), AUCTION_PARAMS)
        .accepted
    ).toBe(false);
    expect(acceptAuctionBid(auctionBid(), auctionPaymentBond(50_000n), auctionUnopened(), AUCTION_PARAMS).accepted).toBe(true);
  });

  it("Q7-neg-01: rejected bids do not extend soft-close; accepted in-window bids do", () => {
    const vector = loadVector("winner-selection.json", "Q7-neg-01");
    assertBindable(vector);
    const rejected = acceptAuctionBid(
      auctionBid({ bidAmountSats: 109_999n, minedHeight: 900_900 }),
      auctionPaymentBond(109_999n),
      auctionOpened(),
      AUCTION_PARAMS
    );
    const rejectedBidExtended = rejected.nextCloseHeight !== auctionOpened().currentCloseHeight;
    expect(rejectedBidExtended).toBe(accepts(vector)); // false === reject
    const accepted = acceptAuctionBid(
      auctionBid({ bidAmountSats: 110_000n, minedHeight: 900_900 }),
      auctionPaymentBond(110_000n),
      auctionOpened(),
      AUCTION_PARAMS
    );
    expect(accepted).toMatchObject({ accepted: true, nextCloseHeight: 901_044 });
  });

  it("Q9-pos-01: largest accepted bid wins; rejected larger bids cannot win; #25 tie order applies", () => {
    const vector = loadVector("winner-selection.json", "Q9-pos-01");
    assertBindable(vector);
    const result = selectAuctionWinner(
      auctionTranscript([
        auctionTranscriptBid({ txid: auctionTxid("a"), bidAmountSats: 100_000n, txIndex: 1 }),
        auctionTranscriptBid({ txid: auctionTxid("b"), bidAmountSats: 200_000n, txIndex: 2 }),
        auctionTranscriptBid({ txid: auctionTxid("c"), bidAmountSats: 300_000n, accepted: false, txIndex: 3 }),
      ]),
      auctionComplete
    );
    expect(result.selected).toBe(accepts(vector)); // accept
    expect(result.winner).toMatchObject({ txid: auctionTxid("b"), bidAmountSats: 200_000n });
  });

  it("Q9-neg-01: incomplete transcripts fail closed instead of selecting the next-lower bid", () => {
    const vector = loadVector("winner-selection.json", "Q9-neg-01");
    assertBindable(vector);
    expect(
      selectAuctionWinner(auctionTranscript([auctionTranscriptBid()]), { complete: false, reason: "omitted-bid" }).selected
    ).toBe(accepts(vector)); // reject
  });

  it("Q10-neg-01: a non-qualifying bid has null effect and opens no auction", () => {
    const vector = loadVector("winner-selection.json", "Q10-neg-01");
    assertBindable(vector);
    const outcome = acceptAuctionBid(
      auctionBid({ bidAmountSats: 49_999n }),
      auctionPaymentBond(49_999n),
      auctionUnopened(),
      AUCTION_PARAMS
    );
    expect(outcome.accepted).toBe(accepts(vector)); // reject
    expect(outcome).toMatchObject({ stateEffect: "none", nextLeaderAmountSats: null, nextCloseHeight: null });
  });

  it("T7-neg-01: zero accepted bids yields no auction winner / no owner", () => {
    const vector = loadVector("transcript-completeness.json", "T7-neg-01");
    assertBindable(vector);
    expect(selectAuctionWinner(auctionTranscript([auctionTranscriptBid({ accepted: false })]), auctionComplete).selected).toBe(
      accepts(vector)
    ); // reject
  });

  it("T9-neg-01: lower declared winners and phantom winner txids reject", () => {
    const vector = loadVector("transcript-completeness.json", "T9-neg-01");
    assertBindable(vector);
    const bids = [
      auctionTranscriptBid({ txid: auctionTxid("a"), bondVout: 1, bidAmountSats: 100_000n }),
      auctionTranscriptBid({ txid: auctionTxid("b"), bondVout: 2, bidAmountSats: 200_000n }),
    ];
    expect(selectAuctionWinner(auctionTranscript(bids), auctionComplete, { txid: auctionTxid("a"), bondVout: 1 }).selected).toBe(
      accepts(vector)
    ); // reject
    expect(selectAuctionWinner(auctionTranscript(bids), auctionComplete, { txid: auctionTxid("c"), bondVout: 1 }).selected).toBe(false);
    expect(selectAuctionWinner(auctionTranscript(bids), auctionComplete, { txid: auctionTxid("b"), bondVout: 2 }).selected).toBe(true);
  });

  it("G1-pos-01: same-block equal-amount tied bids resolve by lower txIndex, with no self-placement veto", () => {
    const vector = loadVector("kernel-wide-glue.json", "G1-pos-01");
    assertBindable(vector);
    const result = selectAuctionWinner(
      auctionTranscript([
        auctionTranscriptBid({ txid: auctionTxid("a"), bidAmountSats: 100_000n, blockHeight: 900_000, txIndex: 5 }),
        auctionTranscriptBid({ txid: auctionTxid("b"), bidAmountSats: 100_000n, blockHeight: 900_000, txIndex: 2 }),
      ]),
      auctionComplete
    );
    expect(result.selected).toBe(accepts(vector)); // accept
    expect(result.winner).toMatchObject({ txid: auctionTxid("b"), txIndex: 2 });
  });
});

// ---- notice-window resolution family (#69) ----
// resolveNoticeWindow is #49-independent: each claim carries its already-resolved DA verdict
// ({decided, holdsPriority} — the ./da-verdict.ts output the engine composes over a served-bytes
// witness), so these fixtures show the holdsPriority (h+W) boundary by VARYING the supplied DA
// facts, never by recomputing W/C/K here (the scope-concurrence design point).
const noticeOwner = (byte: string): string => byte.repeat(64);
const NW_OWNER_A = noticeOwner("a");
const NW_OWNER_B = noticeOwner("b");
const nwDaValid = (ownerKey: string): NoticeWindowClaim => ({
  ownerKey,
  daVerdict: { decided: true, holdsPriority: true },
});
const nwDaExcluded = (ownerKey: string): NoticeWindowClaim => ({
  ownerKey,
  daVerdict: { decided: true, holdsPriority: false },
});
const noticeInput = (overrides: Partial<NoticeWindowInput> = {}): NoticeWindowInput => ({
  anchorHeight: 900_000,
  currentHeight: 900_006, // anchorHeight + W_notice — the deadline (>= gate satisfied)
  claims: [nwDaValid(NW_OWNER_A)],
  bond: { bondAmountSats: null, bondFloorSats: 10_000n },
  params: { noticeWindowBlocks: 6 },
  ...overrides,
});

describe("B2 vector bindings — notice-window resolution family (#69)", () => {
  it("T17-neg-01: two DA-valid bondless claims nullify (never an award); one finalizes; a qualifying bond escalates", () => {
    const vector = loadVector("transcript-completeness.json", "T17-neg-01");
    assertBindable(vector);
    // caseTwoDAValidBondlessNullify — the headline reject: an award MUST NOT be produced.
    const nullify = resolveNoticeWindow(noticeInput({ claims: [nwDaValid(NW_OWNER_A), nwDaValid(NW_OWNER_B)] }));
    expect(nullify.awarded).toBe(accepts(vector)); // false === reject
    expect(nullify).toMatchObject({ outcome: "nullified", daValidOwnerCount: 2 });
    // caseOneDAValidFinalize — the companion positive disposition.
    expect(resolveNoticeWindow(noticeInput({ claims: [nwDaValid(NW_OWNER_A)] }))).toMatchObject({
      outcome: "finalized",
      awarded: true,
      daValidOwnerCount: 1,
    });
    // caseBondEscalate — the #37 escalation trigger.
    expect(
      resolveNoticeWindow(
        noticeInput({
          claims: [nwDaValid(NW_OWNER_A)],
          bond: { bondAmountSats: 10_000n, bondFloorSats: 10_000n },
        })
      )
    ).toMatchObject({ outcome: "escalated", awarded: false });
  });

  it("F11-neg-01: collision counting consumes the resolved DA verdict — the holdsPriority (h+W) boundary flips finalize<->nullify", () => {
    const vector = loadVector("gate-fee-validation.json", "F11-neg-01");
    assertBindable(vector);
    // caseTwoDAValidBondless — the headline reject: two DA-valid bondless claims nullify, no award.
    const nullify = resolveNoticeWindow(noticeInput({ claims: [nwDaValid(NW_OWNER_A), nwDaValid(NW_OWNER_B)] }));
    expect(nullify.awarded).toBe(accepts(vector)); // false === reject
    expect(nullify).toMatchObject({ outcome: "nullified", daValidOwnerCount: 2 });
    // caseBorderlineWBoundary — the borderline claim's DA-validity hinges on holdsPriority (h+W):
    //   served by h+W  -> priority-bearing -> counts -> 2 competitors -> nullify (above);
    //   misses h+W     -> forfeits priority -> does not count -> single survivor -> finalize.
    const borderlineMisses = resolveNoticeWindow(
      noticeInput({ claims: [nwDaValid(NW_OWNER_A), nwDaExcluded(NW_OWNER_B)] })
    );
    expect(borderlineMisses).toMatchObject({ outcome: "finalized", awarded: true, daValidOwnerCount: 1 });
  });
});

// ---- reopen/re-auction resolution family (#70) ----
// resolveReopen derives the latest bond-break release height FROM the witnessed `breaks` (kernel-
// derived, B19/#42/#56), so these fixtures vary the witnessed facts to show the no-actor / no-adapter
// / fail-closed-incomplete-witness authority. recognized===false maps to each negative vector.
const reopenComplete = (breaks: { releaseHeight: number }[]) => ({ witnessComplete: true, breaks });
const reopenInput = (
  kind: "opening" | "reopen",
  releaseAnchor: number,
  witnessComplete: boolean,
  breaks: { releaseHeight: number }[]
): ReopenInput => ({ reopenLot: { kind, releaseAnchor }, bondContinuity: { witnessComplete, breaks } });

describe("B2 vector bindings — reopen/re-auction resolution family (#70)", () => {
  it("T22-neg-01: a reopen anchored to a non-latest block opens nothing — pure verdict, no actor channel", () => {
    const vector = loadVector("transcript-completeness.json", "T22-neg-01");
    assertBindable(vector);
    // a reopen anchored to a stale (non-latest) release height is not recognized: opens no auction.
    const breaks = [{ releaseHeight: 800_000 }, { releaseHeight: 900_000 }];
    expect(resolveReopen(reopenInput("reopen", 800_000, true, breaks)).recognized).toBe(accepts(vector)); // false === reject
    // the verdict is a pure function of witnessed facts: anchored to the unique latest, it recognizes
    // (no actor/indexer "recognition" channel exists to flip it).
    expect(resolveReopen(reopenInput("reopen", 900_000, true, breaks)).recognized).toBe(true);
  });

  it("T22-neg-02: an incomplete bond-continuity witness fails closed before matching", () => {
    const vector = loadVector("transcript-completeness.json", "T22-neg-02");
    assertBindable(vector);
    const breaks = [{ releaseHeight: 900_000 }];
    // incomplete witness -> reject, even though the anchor would otherwise match the latest.
    expect(resolveReopen(reopenInput("reopen", 900_000, false, breaks))).toMatchObject({
      recognized: accepts(vector), // false === reject
      reason: "reopen-incomplete-bond-continuity-witness",
      derivedLatestReleaseHeight: null,
    });
    // the SAME breaks under a complete witness recognize — the witness gate is what stops it.
    expect(resolveReopen(reopenInput("reopen", 900_000, true, breaks)).recognized).toBe(true);
  });

  it("B19-neg-01: release height is kernel-derived from witnessed breaks, not adapter-minted", () => {
    const vector = loadVector("batched-path-transitions.json", "B19-neg-01");
    assertBindable(vector);
    // an adapter cannot mint a reopen generation: a reopen claimed with NO witnessed break rejects.
    expect(resolveReopen(reopenInput("reopen", 900_000, true, [])).recognized).toBe(accepts(vector)); // false === reject
    // nor can it assert a release height that the witnessed breaks do not support.
    expect(resolveReopen(reopenInput("reopen", 950_000, true, reopenComplete([{ releaseHeight: 900_000 }]).breaks)).recognized).toBe(false);
    // a reopen anchored to a genuinely witnessed break is recognized — the height is derived, not asserted.
    expect(resolveReopen(reopenInput("reopen", 900_000, true, [{ releaseHeight: 900_000 }]))).toMatchObject({
      recognized: true,
      derivedLatestReleaseHeight: 900_000,
    });
  });
});

// ---- occupancy family (#71) ----
// resolveNameOccupancy consumes the name's resolved governing occupancy (the caller composes the DA
// verdict + lifecycle verdict and reduces multiple insertions). The A11 crux: occupancy is enforced
// over post-DA-verdict state, so a forfeited (DA-failed) prior insertion does NOT block re-claim.
describe("B2 vector bindings — occupancy family (#71)", () => {
  it("A11-pos-01: a forfeited (DA-failed) prior insertion does not block honest re-claim", () => {
    const vector = loadVector("anchor-acceptance.json", "A11-pos-01");
    assertBindable(vector);
    // the post-DA-verdict crux: a name 'occupied' only by a later-forfeited batch admits re-claim.
    expect(resolveNameOccupancy({ priorOccupancy: { kind: "forfeited" } }).admitsInsertion).toBe(accepts(vector)); // accept
    // companion: a FINAL name refuses a fresh insertion (insertion-only, no takeover); an unoccupied
    // name admits — so the forfeited-admit is the post-DA-verdict distinction, not a blanket admit.
    expect(resolveNameOccupancy({ priorOccupancy: { kind: "final" } }).admitsInsertion).toBe(false);
    expect(resolveNameOccupancy({ priorOccupancy: null }).admitsInsertion).toBe(true);
  });
});

// ---- batch-exclusion locality family (#72) ----
// deriveBatchedInsertions is the insert-only batched merge; these bindings PROVE the exclusion-
// locality / state-equivalence property by comparing two derivations. DA exclusion is the consumed
// `excludedBatchIds`; #49-independent. Batches A (alice, shared) + X (bob, shared); carol prior-final.
const exclBatch = (batchId: string, names: string[]) => ({ batchId, leaves: names.map((name) => ({ name })) });
const exclBase: BatchExclusionInput = {
  batches: [exclBatch("A", ["alice", "shared"]), exclBatch("X", ["bob", "shared"])],
  excludedBatchIds: [],
  priorFinalNames: ["carol"],
};

describe("B2 vector bindings — batch-exclusion locality family (#72)", () => {
  it("D7-pos-01: excluding a batch equals the as-if-never-anchored state (insert-only state-equivalence)", () => {
    const vector = loadVector("da-verdict.json", "D7-pos-01");
    assertBindable(vector);
    const excludeX = deriveBatchedInsertions({ ...exclBase, excludedBatchIds: ["X"] });
    const asIfNeverAnchored = deriveBatchedInsertions({ ...exclBase, batches: [exclBatch("A", ["alice", "shared"])] });
    const equivalenceHolds = JSON.stringify(excludeX) === JSON.stringify(asIfNeverAnchored);
    expect(equivalenceHolds).toBe(accepts(vector)); // true === accept
  });

  it("B10-pos-01: excluding a batch removes only its leaves; every other name byte-identical, no final unseated", () => {
    const vector = loadVector("batched-path-transitions.json", "B10-pos-01");
    assertBindable(vector);
    const all = deriveBatchedInsertions(exclBase);
    const exX = deriveBatchedInsertions({ ...exclBase, excludedBatchIds: ["X"] });
    const find = (r: typeof all, n: string) => r.insertions.find((x) => x.name === n);
    const localityHolds =
      JSON.stringify(find(exX, "alice")) === JSON.stringify(find(all, "alice")) && // name not in X: byte-identical
      find(exX, "bob") === undefined && // X's own leaf vanishes
      JSON.stringify(find(exX, "shared")?.contributingBatchIds) === JSON.stringify(["A"]) && // shared loses only X
      JSON.stringify(exX.preservedFinalNames) === JSON.stringify(["carol"]); // final name never unseated
    expect(localityHolds).toBe(accepts(vector)); // true === accept
  });
});

// ---- Z9 one-clock qualifying-bond window family (#73) ----
describe("B2 vector bindings — Z9 one-clock qualifying-bond window family (#73)", () => {
  it("Z9-neg-01: the bond window test reads the re-derived current-chain mined height, not first-seen", () => {
    const vector = loadVector("reorg-replay-determinism.json", "Z9-neg-01");
    assertBindable(vector);
    // anchorHeight 1000, W_notice 6 -> interior window [1000,1005], close 1006. Both heights are away
    // from the edges, so the only variable is which height the test reads.
    const anchorHeight = 1000;
    const wNotice = 6;
    const reDerivedHeight = 1003; // current canonical chain: in-window
    const firstSeenHeight = 1010; // superseded pre-reorg view: out-of-window
    const reDerived = bondInNoticeWindow(reDerivedHeight, anchorHeight, wNotice).verdict;
    const firstSeen = bondInNoticeWindow(firstSeenHeight, anchorHeight, wNotice).verdict;
    // a test reading first-seen height is conformant only if it agrees with the re-derived verdict;
    // here re-derivation flips it, so "first-seen conformant" is false === the vector's reject.
    const firstSeenConformant = firstSeen === reDerived;
    expect(firstSeenConformant).toBe(accepts(vector)); // false === reject
    // the re-derived current-chain verdict is the conformant (in-window) reading — the positive companion.
    expect(reDerived).toBe("in-window");
  });
});

// ---- bind-to-resident closing batch: ratified vectors whose rule is already a resident predicate ----
// Per-vector verification (ChatLunatique's concur, event 501a1094): of the 9 hypothesized
// bind-to-resident vectors only these 4 bind cleanly to a resident predicate with no new law; the
// other 5 (B7 bond-half, T2-neg-02 B3 range, S12 engine transfer, F9 gate-fee+params+reorg composite,
// F15 new threshold predicate) need a companion / new surface and are NOT forced here.
describe("B2 vector bindings — bind-to-resident closing batch (B14/B15/S9/S4)", () => {
  it("B14-neg-01: a rejected below-minimum soft-close bid does not extend the close (extension is acceptance-only) — auction #68", () => {
    const vector = loadVector("batched-path-transitions.json", "B14-neg-01");
    assertBindable(vector);
    // opened auction: leader 100_000, close 901_000, soft-close window 144 -> [900_856, 901_000].
    const rejected = acceptAuctionBid(
      auctionBid({ bidAmountSats: 109_999n, minedHeight: 900_900 }), // below the soft required minimum
      auctionPaymentBond(109_999n),
      auctionOpened(),
      AUCTION_PARAMS
    );
    expect(rejected.accepted).toBe(accepts(vector)); // false === reject
    // close, leader, and required-minimum are byte-unchanged — the extension is acceptance-only.
    expect(rejected).toMatchObject({ stateEffect: "none", nextCloseHeight: 901_000, nextLeaderAmountSats: 100_000n });
  });

  it("B15-pos-01: chained accepted soft-close bids extend the close monotonically with no hard cap — auction #68", () => {
    const vector = loadVector("batched-path-transitions.json", "B15-pos-01");
    assertBindable(vector);
    const bid1 = acceptAuctionBid(
      auctionBid({ bidAmountSats: 110_000n, minedHeight: 900_900 }),
      auctionPaymentBond(110_000n),
      auctionOpened(),
      AUCTION_PARAMS
    );
    expect(bid1).toMatchObject({ accepted: true, nextCloseHeight: 901_044 }); // close 901_000 -> 901_044
    // a further late accepted bid, inside the NEW soft-close window, extends again — no cap terminates it.
    const bid2 = acceptAuctionBid(
      auctionBid({ bidAmountSats: 121_000n, minedHeight: 901_040 }),
      auctionPaymentBond(121_000n),
      auctionOpened({ currentLeaderAmountSats: 110_000n, currentCloseHeight: 901_044 }),
      AUCTION_PARAMS
    );
    expect(bid2.accepted).toBe(accepts(vector)); // true === accept
    expect(bid2.nextCloseHeight).toBe(901_184); // 901_044 -> 901_184: monotone non-decreasing, no hard cap
  });

  it("S9-neg-01: a reauction bid not anchored to the latest recorded release height does not open/join — reopen #70", () => {
    const vector = loadVector("settlement-consequences.json", "S9-neg-01");
    assertBindable(vector);
    const breaks = [{ releaseHeight: 900_000 }]; // latest recorded release height
    // caseStaleAnchor / caseFabricatedFuture / caseZeroAfterRelease — none equal the latest release.
    for (const staleAnchor of [800_000 /* stale */, 950_000 /* fabricated-future */, 0 /* unlockBlock=0 after a release */]) {
      expect(resolveReopen({ reopenLot: { kind: "reopen", releaseAnchor: staleAnchor }, bondContinuity: { witnessComplete: true, breaks } }).recognized).toBe(
        accepts(vector)
      ); // false === reject
    }
    // positive control: a bid anchored to the latest release height opens the live generation.
    expect(resolveReopen({ reopenLot: { kind: "reopen", releaseAnchor: 900_000 }, bondContinuity: { witnessComplete: true, breaks } }).recognized).toBe(true);
  });

  it("S4-neg-01: maturity is the fixed MATURITY_BLOCKS param — an epoch-halving / override value does not settle — settlement #65", () => {
    const vector = loadVector("settlement-consequences.json", "S4-neg-01");
    assertBindable(vector);
    // run at two MATURITY_BLOCKS values so no baked-in constant passes.
    for (const maturityBlocks of [52_560, 40_000]) {
      const halved = Math.floor(maturityBlocks / 2); // an epoch-halving-derived maturity
      expect(settlementLockMatchesMaturity({ settlementLockBlocks: halved }, maturityBlocks).matches).toBe(accepts(vector)); // false === reject
      // positive control: the fixed parameter value settles.
      expect(settlementLockMatchesMaturity({ settlementLockBlocks: maturityBlocks }, maturityBlocks).matches).toBe(true);
    }
  });
});

// ---- recovery-invoke-authority family (acceptRecoverOwner authorization/evidence gate, #67) ----
// A shared builder produces a fully-consistent signed bundle: BIP340 over the §8.2a descriptor
// digest (arming) and over the W13 recoverAuthDigest (invoke). Each binding perturbs one facet to
// realize its vector and asserts the predicate verdict equals the vector's own expected.verdict.
const RIA_OWNER_PRIV = "11".repeat(32);
const RIA_RECOVERY_PRIV = "33".repeat(32);
const RIA_OTHER_PRIV = "44".repeat(32);
const RIA_AUX = new Uint8Array(32);
const riaXonly = (priv: string): string => bytesToHex(schnorr.getPublicKey(hexToBytes(priv)));
const RIA_REF = "aa".repeat(32);
const RIA_HEAD = "cc".repeat(32);
const RIA_NEWOWNER = "dd".repeat(32);
const RIA_CWB = 144;
const RIA_WR = 20;
const RIA_HR = 100000;
const RIA_SEQ = 3;

interface RiaBundle {
  invokeFacts: RecoverOwnerInvokeFacts;
  descriptorEvidence: RecoveryDescriptorEvidence;
  nameState: RecoveryNameStateFacts;
  recoveryParams: RecoveryParams;
}

function riaBundle(opts: {
  descriptorOwnerPriv?: string; // signs the arming sig + sets descriptor.ownerPubkey
  invokeSignerPriv?: string; // signs the invoke over W13 (default = the recovery key)
  descriptorVersion?: number;
  witness?: unknown; // override the verifier-checked witness (R1)
} = {}): RiaBundle {
  const dOwner = opts.descriptorOwnerPriv ?? RIA_OWNER_PRIV;
  const invokeSigner = opts.invokeSignerPriv ?? RIA_RECOVERY_PRIV;
  const unsigned: Record<string, unknown> = {
    format: RECOVERY_DESCRIPTOR_FORMAT,
    descriptorVersion: opts.descriptorVersion ?? RECOVERY_DESCRIPTOR_VERSION_V2,
    name: "alice",
    ownerPubkey: riaXonly(dOwner),
    ownershipRef: RIA_REF,
    sequence: RIA_SEQ,
    previousDescriptorHash: null,
    recoveryAddress: "bc1qrecoveryexampleaddr0000000000000000",
    signingProfile: "bip322",
    challengeWindowBlocks: RIA_CWB,
    issuedAt: "2026-01-01T00:00:00Z",
    recoveryPubkey: riaXonly(RIA_RECOVERY_PRIV),
    signature: "00".repeat(64),
  };
  const descriptorDigest = recoveryDescriptorDigest(unsigned);
  const descriptor = { ...unsigned, signature: bytesToHex(schnorr.sign(descriptorDigest, hexToBytes(dOwner), RIA_AUX)) };
  const descHash = bytesToHex(descriptorDigest);
  const w13 = recoverAuthDigest({
    prevStateTxid: RIA_HEAD,
    newOwnerPubkey: RIA_NEWOWNER,
    flags: 0,
    successorBondVout: 0,
    challengeWindowBlocks: RIA_CWB,
    recoveryDescriptorHash: descHash,
  });
  const defaultWitness = { kind: "b3-verified-recovery-descriptor-witness", witnessedByHeight: RIA_HR + RIA_WR };
  return {
    invokeFacts: {
      prevStateTxid: RIA_HEAD,
      newOwnerPubkey: RIA_NEWOWNER,
      flags: 0,
      successorBondVout: 0,
      challengeWindowBlocks: RIA_CWB,
      recoveryDescriptorHash: descHash,
      signature: bytesToHex(schnorr.sign(w13, hexToBytes(invokeSigner), RIA_AUX)),
      minedHeight: RIA_HR,
    },
    descriptorEvidence: {
      descriptor,
      witness: (opts.witness !== undefined ? opts.witness : defaultWitness) as RecoveryDescriptorEvidence["witness"],
    },
    nameState: {
      ownerPubkey: riaXonly(RIA_OWNER_PRIV), // the name's CURRENT owner
      headTxid: RIA_HEAD,
      currentOwnershipRef: RIA_REF,
      recoveryDescriptorHeadHash: descHash,
      recoveryDescriptorHeadSequence: RIA_SEQ,
    },
    recoveryParams: { recoveryEvidenceWindowBlocks: RIA_WR },
  };
}
const riaAccepted = (b: RiaBundle): boolean =>
  acceptRecoverOwner(b.invokeFacts, b.descriptorEvidence, b.nameState, b.recoveryParams).accepted;

describe("B2 vector bindings — recovery-invoke-authority family (acceptRecoverOwner, #67)", () => {
  it("T19-pos-01: a matching-window, fully-armed invoke is admitted (R8 window equality holds)", () => {
    const vector = loadVector("transcript-completeness.json", "T19-pos-01");
    assertBindable(vector);
    expect(riaAccepted(riaBundle())).toBe(accepts(vector)); // accept
  });

  it("R1-neg-01: an invoke with no verifier-witnessed descriptor evidence fails closed", () => {
    const vector = loadVector("recovery-authority.json", "R1-neg-01");
    assertBindable(vector);
    // No verifier-checked witness -> the §3c evidence gate has nothing to admit -> fail closed.
    expect(riaAccepted(riaBundle({ witness: null }))).toBe(accepts(vector)); // reject
  });

  it("R2-neg-01: a descriptor armed by a non-owner key does not authorize", () => {
    const vector = loadVector("recovery-authority.json", "R2-neg-01");
    assertBindable(vector);
    // descriptor self-claims + is signed by OTHER; the name's current owner is OWNER, so R2 rejects.
    expect(riaAccepted(riaBundle({ descriptorOwnerPriv: RIA_OTHER_PRIV }))).toBe(accepts(vector)); // reject
  });

  it("R7-neg-01: a v1 descriptor profile is not invokable", () => {
    const vector = loadVector("recovery-authority.json", "R7-neg-01");
    assertBindable(vector);
    expect(riaAccepted(riaBundle({ descriptorVersion: RECOVERY_DESCRIPTOR_VERSION_V1 }))).toBe(accepts(vector)); // reject
  });

  it("R9-neg-01: a non-authorizing wallet proof cannot substitute for a valid W13 event signature", () => {
    const vector = loadVector("recovery-authority.json", "R9-neg-01");
    assertBindable(vector);
    // #50-b1 non-substitution (NOT a BIP322 verifier in B2): the predicate has no wallet-proof input
    // channel, so an invoke whose W13 event signature is invalid (signed by the wrong key) rejects
    // regardless — nothing substitutes. And an out-of-band proof field is rejected by closed shape.
    expect(riaAccepted(riaBundle({ invokeSignerPriv: RIA_OTHER_PRIV }))).toBe(accepts(vector)); // reject: bad event sig
    const b = riaBundle();
    const smuggled = { ...b, descriptorEvidence: { ...b.descriptorEvidence, walletProof: "x" } as unknown as RecoveryDescriptorEvidence };
    expect(riaAccepted(smuggled)).toBe(false); // closed-shape rejects an out-of-band proof field
  });

  it("R10-neg-01: a replayed arming signature presented in the invoke slot is rejected", () => {
    const vector = loadVector("recovery-authority.json", "R10-neg-01");
    assertBindable(vector);
    const b = riaBundle();
    const replayed: RiaBundle = {
      ...b,
      invokeFacts: { ...b.invokeFacts, signature: b.descriptorEvidence.descriptor.signature as string },
    };
    expect(riaAccepted(replayed)).toBe(accepts(vector)); // reject
  });

  it("R10-neg-02: a legacy commitment value in the 64-byte signature slot is verified as a signature and rejected", () => {
    const vector = loadVector("recovery-authority.json", "R10-neg-02");
    assertBindable(vector);
    const b = riaBundle();
    // A 64-byte commitment-shaped value (not a BIP340 signature over W13) -> verifySchnorr false.
    const legacy: RiaBundle = { ...b, invokeFacts: { ...b.invokeFacts, signature: "ab".repeat(64) } };
    expect(riaAccepted(legacy)).toBe(accepts(vector)); // reject
  });

  it("G6-neg-01: recovery pending-create is pure over witnessed evidence — no eval-time availability callback", () => {
    const vector = loadVector("kernel-wide-glue.json", "G6-neg-01");
    assertBindable(vector);
    // Post-engine-B the recovery admission consumes witnessed descriptor evidence as DATA through
    // acceptRecoverOwner — there is NO availability callback. The only "available" signal is the
    // verifier-checked §3c witness; a merely producer-asserted witness (the callback-style "is it
    // available?" bypass) and an absent witness both fail closed, and the verdict is a pure function
    // of its data inputs (no oracle that could flip it at evaluation time).
    // primary -> expected.verdict (reject): a producer-asserted "available" witness is not the
    // verifier-checked one, so there is no acceptance path.
    const asserted = riaBundle({ witness: { kind: "producer-asserted", witnessedByHeight: RIA_HR + RIA_WR } });
    expect(riaAccepted(asserted)).toBe(accepts(vector)); // false === reject
    // absent witness also fails closed (no callback bypass).
    expect(riaAccepted(riaBundle({ witness: null }))).toBe(false);
    // purity/determinism: identical data inputs -> identical verdict.
    const b = riaBundle();
    expect(acceptRecoverOwner(b.invokeFacts, b.descriptorEvidence, b.nameState, b.recoveryParams)).toEqual(
      acceptRecoverOwner(b.invokeFacts, b.descriptorEvidence, b.nameState, b.recoveryParams)
    );
  });
});

describe("B2 vector bindings — recovery completion (R18, via refreshDerivedState)", () => {
  it("R18-pos-01: recovery completion is a deterministic function of (chain height, prior pendingRecovery)", () => {
    const vector = loadVector("recovery-authority.json", "R18-pos-01");
    assertBindable(vector);
    const FINALIZE = 644;
    const proposed = "dd".repeat(32);
    const seedPending = (): OntState => {
      const state = createEmptyState();
      const record: NameRecord = {
        name: "alice",
        status: "immature",
        currentOwnerPubkey: "11".repeat(32),
        claimCommitTxid: "a1".repeat(32),
        claimRevealTxid: "b1".repeat(32),
        claimHeight: 100,
        maturityHeight: 1000,
        requiredBondSats: 50_000n,
        currentBondTxid: "cc".repeat(32),
        currentBondVout: 0,
        currentBondValueSats: 50_000n,
        lastStateTxid: "cc".repeat(32),
        lastStateHeight: 500,
        winningCommitBlockHeight: 100,
        winningCommitTxIndex: 0,
        pendingRecovery: {
          requestedTxid: "cc".repeat(32),
          requestedHeight: 500,
          finalizeHeight: FINALIZE,
          proposedOwnerPubkey: proposed,
          predecessorStateTxid: "ee".repeat(32),
          recoveryDescriptorHash: "d1".repeat(32),
          challengeWindowBlocks: 144,
        },
      };
      state.names.set(record.name, record);
      return state;
    };
    // primary -> expected.verdict (accept): completion fires at the finalize height — the proposed
    // owner is installed and pendingRecovery clears.
    const sA = seedPending();
    refreshDerivedState(sA, FINALIZE);
    const completed = sA.names.get("alice");
    const didComplete = completed?.pendingRecovery === undefined && completed?.currentOwnerPubkey === proposed;
    expect(didComplete).toBe(accepts(vector)); // true === accept
    // replay determinism: an identical (prior state, height) refresh yields a byte-identical record.
    const sB = seedPending();
    refreshDerivedState(sB, FINALIZE);
    expect(sB.names.get("alice")).toEqual(completed);
    // no-refresh-timing: refreshing again at a later height is idempotent post-completion (the verdict
    // is a function of (chain height, prior state), never of refresh-invocation timing).
    refreshDerivedState(sA, FINALIZE + 50);
    expect(sA.names.get("alice")?.currentOwnerPubkey).toBe(proposed);
    expect(sA.names.get("alice")?.pendingRecovery).toBeUndefined();
    // not-yet: one block before the finalize height, completion does not fire.
    const sEarly = seedPending();
    refreshDerivedState(sEarly, FINALIZE - 1);
    expect(sEarly.names.get("alice")?.pendingRecovery).toBeDefined();
    expect(sEarly.names.get("alice")?.currentOwnerPubkey).toBe("11".repeat(32));
  });
});
