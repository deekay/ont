// I-HARNESS red battery (B3_INTEGRATION_PLAN §6; 4-stage pipeline, CL concur event 9f4cebb4) — the
// batched-claim enforcement orchestrator threads the AUDITED §2 calls and fails closed in precedence:
// inclusion (verifyProofBundleAgainstBitcoin — SPV + structural membership) → availability
// (verifyAvailabilityHeight) → completeness (evaluateBatchCompleteness — owns prevRoot→newRoot replay)
// → verdict. The happy fixture is COHERENT (real block-170 anchor + real accumulator roots + a resident
// proof bundle), so a green that runs the real calls can only accept it if those calls genuinely pass.
//
// RED PHASE: enforceBatchedClaim is stubbed to reject ("hrns-pending-green-impl") with an empty trace;
// every behavioral assertion is therefore red until the threaded green lands (determinism is the lone
// impl-independent invariant that holds against the stub).
import {
  accumulatorRootOf,
  computeValueRecordHash,
  deriveOwnerPubkey,
  normalizeName,
  sha256Hex,
  signValueRecord,
  utf8ToBytes,
} from "@ont/protocol";
import { describe, expect, it } from "vitest";

import { buildAccumulatorBatchClaimBundle } from "@ont/evidence";
import { buildBitcoinInclusion } from "@ont/evidence";
import { buildMembershipProof } from "@ont/evidence";
import type { ServedLeaf } from "@ont/evidence";
import type { BitcoinHeaderSource } from "@ont/consensus";

import {
  enforceBatchedClaim,
  type BatchDataSource,
  type BatchedClaimInput,
  type BatchedClaimSources,
} from "./enforce-batched-claim.js";

// --- The real Bitcoin anchor (mainnet block 170) — reused from the resident proof-bundle fixtures so
// inclusion verifies against Bitcoin, not a mock. ---
const BLOCK_170_HEADER =
  "0100000055bd840a78798ad0da853f68974f3d183e2bd1db6a842c1feecf222a00000000ff104ccb05421ab93e63f8c3ce5c2c2e9dbb37de2764b3a3175c8166562cac7d51b96a49ffff001d283e9e70";
const COINBASE_TXID = "b1fea52486ce0c62bb442b530a3f0132b826c74e473d1f2c220bfa78111c5082";
const PAYMENT_TXID = "f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16";
const ANCHOR_HEIGHT = 170;

const NAME = "alice";
const LEAF = sha256Hex(utf8ToBytes(normalizeName(NAME))); // H("alice"), the membership leaf
const OWNER_SK = "11".repeat(32);
const OWNER = deriveOwnerPubkey(OWNER_SK); // real x-only pubkey, so value records sign/verify
const REF = "ab".repeat(32);
const OTHER_KEY = "aa".repeat(32);
const OTHER_VAL = "33".repeat(32);

// One coherent base + delta: prevRoot = root(base); anchoredRoot = root(base ∪ delta) = membership root.
const BASE = new Map([[OTHER_KEY, OTHER_VAL]]);
const FULL = new Map([
  [OTHER_KEY, OTHER_VAL],
  [LEAF, OWNER],
]);
const PREV_ROOT = accumulatorRootOf(BASE);
const ANCHORED_ROOT = accumulatorRootOf(FULL);
const SERVED_DELTA: readonly ServedLeaf[] = [{ keyHex: LEAF, valueHex: OWNER }];

// A SECOND coherent root B (different delta leaf) used to prove the anchor↔bundle binding: B's served
// bytes reconstruct B, but the resident BUNDLE commits root A — a green that does not bind would wrongly
// accept "Bitcoin-included membership for A + served bytes for B".
const LEAF2 = "cc".repeat(32);
const OWNER2 = "dd".repeat(32);
const FULL2 = new Map([
  [OTHER_KEY, OTHER_VAL],
  [LEAF2, OWNER2],
]);
const ANCHORED_ROOT_2 = accumulatorRootOf(FULL2); // root B (≠ ANCHORED_ROOT = the bundle's root A)
const SERVED_DELTA_2: readonly ServedLeaf[] = [{ keyHex: LEAF2, valueHex: OWNER2 }];

const inclusion = buildBitcoinInclusion({
  txid: PAYMENT_TXID,
  height: ANCHOR_HEIGHT,
  blockHeaderHex: BLOCK_170_HEADER,
  orderedBlockTxids: [COINBASE_TXID, PAYMENT_TXID],
});
const membership = buildMembershipProof(FULL, LEAF); // rootHex === ANCHORED_ROOT

const rec1 = signValueRecord({
  name: NAME, ownerPrivateKeyHex: OWNER_SK, ownershipRef: REF, sequence: 1,
  previousRecordHash: null, valueType: 0, payloadHex: "00", issuedAt: "2026-06-01T00:00:00.000Z",
});
const rec2 = signValueRecord({
  name: NAME, ownerPrivateKeyHex: OWNER_SK, ownershipRef: REF, sequence: 2,
  previousRecordHash: computeValueRecordHash(rec1), valueType: 0, payloadHex: "01", issuedAt: "2026-06-02T00:00:00.000Z",
});

// A resident, Bitcoin-anchored, structurally-valid proof bundle (D-PB) — verifyProofBundleAgainstBitcoin accepts it.
const BUNDLE = buildAccumulatorBatchClaimBundle({
  name: NAME,
  assuranceTier: "accumulator-batched",
  verificationGoal: "Enforce alice's batched accumulator claim end-to-end.",
  ownership: { currentOwnerPubkey: OWNER, ownershipRef: REF },
  membership,
  anchor: { anchorTxid: PAYMENT_TXID, anchorHeight: ANCHOR_HEIGHT },
  inclusion,
  valueRecords: [rec1, rec2],
});

const K = 6;
const W = 2;
const C = 3;

function headerSource(at?: (h: number) => string | null): BitcoinHeaderSource {
  return { headerHexAtHeight: at ?? ((h) => (h === ANCHOR_HEIGHT ? BLOCK_170_HEADER : null)) };
}

function batchDataSource(over: Partial<BatchDataSource> = {}): BatchDataSource {
  return {
    baseLeavesForPrevRoot: over.baseLeavesForPrevRoot ?? ((r) => (r === PREV_ROOT ? BASE : null)),
    servedLeavesForRoot: over.servedLeavesForRoot ?? ((r) => (r === ANCHORED_ROOT ? SERVED_DELTA : null)),
  };
}

function claim(over: Partial<BatchedClaimInput> = {}): BatchedClaimInput {
  return {
    proofBundle: BUNDLE,
    anchor: { txid: PAYMENT_TXID, prevRoot: PREV_ROOT, anchoredRoot: ANCHORED_ROOT, anchorHeight: ANCHOR_HEIGHT, batchSize: 1 },
    window: { K, W, C },
    ...over,
  };
}

function sources(over: { header?: BitcoinHeaderSource; batch?: BatchDataSource } = {}): BatchedClaimSources {
  return { headerSource: over.header ?? headerSource(), batchDataSource: over.batch ?? batchDataSource() };
}

const stepOk = (r: { trace: readonly { step: string; ok: boolean }[] }, step: string): boolean | undefined =>
  r.trace.find((e) => e.step === step)?.ok;
const reached = (r: { trace: readonly { step: string }[] }, step: string): boolean =>
  r.trace.some((e) => e.step === step);

describe("I-HARNESS enforceBatchedClaim — end-to-end batched-claim enforcement (4-stage)", () => {
  it("accepts a coherent honest claim: every audited stage ok, ordered trace, a name-state delta", () => {
    const r = enforceBatchedClaim(claim(), sources());
    expect(r.accepted).toBe(true);
    expect(r.reason).toBe("batched-claim-accepted");
    expect(r.trace.map((e) => e.step)).toEqual(["inclusion", "availability", "completeness", "verdict"]);
    expect(r.trace.every((e) => e.ok)).toBe(true);
    expect(r.nameStateDelta).toEqual({ anchoredRoot: ANCHORED_ROOT, firstServableHeight: ANCHOR_HEIGHT });
  });

  it("is pure + deterministic — identical inputs give a byte-identical result", () => {
    expect(enforceBatchedClaim(claim(), sources())).toEqual(enforceBatchedClaim(claim(), sources()));
  });

  it("rejects absent Bitcoin inclusion at the inclusion step (membership/SPV live here)", () => {
    const noInclusion = { ...(BUNDLE as Record<string, unknown>), bitcoinInclusion: undefined };
    const r = enforceBatchedClaim(claim({ proofBundle: noInclusion }), sources());
    expect(r.accepted).toBe(false);
    expect(stepOk(r, "inclusion")).toBe(false);
  });

  it("rejects a stale / noncanonical header (headerSource returns null at the anchor height) at inclusion", () => {
    const r = enforceBatchedClaim(claim(), sources({ header: headerSource(() => null) }));
    expect(r.accepted).toBe(false);
    expect(stepOk(r, "inclusion")).toBe(false);
  });

  it("precedence: inclusion failure stops BEFORE availability/completeness are evaluated", () => {
    const noInclusion = { ...(BUNDLE as Record<string, unknown>), bitcoinInclusion: undefined };
    const r = enforceBatchedClaim(claim({ proofBundle: noInclusion }), sources({ batch: batchDataSource({ servedLeavesForRoot: () => null }) }));
    expect(stepOk(r, "inclusion")).toBe(false);
    expect(reached(r, "availability")).toBe(false);
    expect(reached(r, "completeness")).toBe(false);
  });

  it("rejects withheld served bytes at availability — before any completeness/delta", () => {
    const r = enforceBatchedClaim(claim(), sources({ batch: batchDataSource({ servedLeavesForRoot: () => null }) }));
    expect(r.accepted).toBe(false);
    expect(stepOk(r, "availability")).toBe(false);
    expect(reached(r, "completeness")).toBe(false);
  });

  it("rejects a committed-batchSize / served-count mismatch at completeness (availability still reconstructs)", () => {
    // batchSize claims 2, but the served delta is the real 1 leaf that reconstructs anchoredRoot:
    // availability passes (bytes reconstruct), completeness fails on the count.
    const r = enforceBatchedClaim(claim({ anchor: { txid: PAYMENT_TXID, prevRoot: PREV_ROOT, anchoredRoot: ANCHORED_ROOT, anchorHeight: ANCHOR_HEIGHT, batchSize: 2 } }), sources());
    expect(r.accepted).toBe(false);
    expect(stepOk(r, "availability")).toBe(true);
    expect(stepOk(r, "completeness")).toBe(false);
  });

  it("precedence: completeness failure stops BEFORE any name-state delta", () => {
    const r = enforceBatchedClaim(claim({ anchor: { txid: PAYMENT_TXID, prevRoot: PREV_ROOT, anchoredRoot: ANCHORED_ROOT, anchorHeight: ANCHOR_HEIGHT, batchSize: 2 } }), sources());
    expect(r.accepted).toBe(false);
    expect(stepOk(r, "completeness")).toBe(false);
    expect(r.nameStateDelta).toBeUndefined();
  });

  it("content-only: withheld content rejects; presenting the actual matching content is the only way to mint the witness", () => {
    // Per #84/O1 the non-content rule is: omitted bytes give no witness, and no timestamp/receipt channel
    // exists to substitute. The ONLY difference here is presence of the real content.
    const withheld = enforceBatchedClaim(claim(), sources({ batch: batchDataSource({ servedLeavesForRoot: () => null }) }));
    const present = enforceBatchedClaim(claim(), sources());
    expect(withheld.accepted).toBe(false);
    expect(present.accepted).toBe(true);
  });

  it("is total on a throwing seam — a header/batch source that throws yields a failed trace step, not an exception", () => {
    const throwingHeader: BitcoinHeaderSource = { headerHexAtHeight: () => { throw new Error("header source down"); } };
    const rh = enforceBatchedClaim(claim(), sources({ header: throwingHeader }));
    expect(rh.accepted).toBe(false);
    expect(stepOk(rh, "inclusion")).toBe(false);

    const throwingBatch = batchDataSource({ servedLeavesForRoot: () => { throw new Error("batch source down"); } });
    expect(() => enforceBatchedClaim(claim(), sources({ batch: throwingBatch }))).not.toThrow();
    const rb = enforceBatchedClaim(claim(), sources({ batch: throwingBatch }));
    expect(rb.accepted).toBe(false);
    expect(stepOk(rb, "availability")).toBe(false);
  });

  it("binds input.anchor to the bundle: a txid / anchorHeight mismatch rejects at inclusion, before availability", () => {
    const badTxid = enforceBatchedClaim(
      claim({ anchor: { txid: "99".repeat(32), prevRoot: PREV_ROOT, anchoredRoot: ANCHORED_ROOT, anchorHeight: ANCHOR_HEIGHT, batchSize: 1 } }),
      sources(),
    );
    expect(badTxid.accepted).toBe(false);
    expect(stepOk(badTxid, "inclusion")).toBe(false);
    expect(reached(badTxid, "availability")).toBe(false);

    const badHeight = enforceBatchedClaim(
      claim({ anchor: { txid: PAYMENT_TXID, prevRoot: PREV_ROOT, anchoredRoot: ANCHORED_ROOT, anchorHeight: ANCHOR_HEIGHT + 1, batchSize: 1 } }),
      sources(),
    );
    expect(stepOk(badHeight, "inclusion")).toBe(false);
  });

  it("binds anchoredRoot to the bundle's membership root: a root-B claim with reconstructing B bytes still rejects (no membership-A + bytes-B)", () => {
    // input.anchor commits root B and batchDataSource serves B's reconstructing bytes, but the BUNDLE
    // commits root A. The bind must reject before availability/completeness — never accept the cross.
    const r = enforceBatchedClaim(
      claim({ anchor: { txid: PAYMENT_TXID, prevRoot: PREV_ROOT, anchoredRoot: ANCHORED_ROOT_2, anchorHeight: ANCHOR_HEIGHT, batchSize: 1 } }),
      sources({ batch: batchDataSource({ servedLeavesForRoot: (root) => (root === ANCHORED_ROOT_2 ? SERVED_DELTA_2 : null) }) }),
    );
    expect(r.accepted).toBe(false);
    expect(stepOk(r, "inclusion")).toBe(false);
    expect(reached(r, "completeness")).toBe(false);
    expect(r.nameStateDelta).toBeUndefined();
  });

  it("a null base (baseLeavesForPrevRoot returns null) fails at availability — never treated as an empty base, never reaches completeness", () => {
    const r = enforceBatchedClaim(claim(), sources({ batch: batchDataSource({ baseLeavesForPrevRoot: () => null }) }));
    expect(r.accepted).toBe(false);
    expect(stepOk(r, "availability")).toBe(false);
    expect(reached(r, "completeness")).toBe(false);
  });
});
