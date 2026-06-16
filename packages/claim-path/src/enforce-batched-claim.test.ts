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
import { legacyTxidOf, headerMeetsTarget, type LegacyTransaction } from "@ont/bitcoin";

import {
  enforceBatchedClaim,
  type BatchDataSource,
  type BatchedClaimInput,
  type BatchedClaimPolicy,
  type BatchedClaimResult,
  type BatchedClaimSources,
} from "./enforce-batched-claim.js";

// --- Synthetic mined fee-adequate anchor (I-FEE-PATH §10). Block-170's real payment tx pays ZERO fee
// (in 50 BTC = out 50 BTC) and can't be reconstructed as a LegacyTransaction fee witness, so the path
// fixture is a synthetic 1-tx block with an easy-nBits MINED header — verifyProofBundleAgainstBitcoin
// still verifies inclusion (header is 80 bytes, headerMeetsTarget passes, Merkle root = the 1-tx txid).
// Real block-170 PoW byte-order stays pinned in block-header / validate-header-chain / proof-bundle tests. ---
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function bytesToHex(bytes: Uint8Array): string {
  let h = "";
  for (const b of bytes) h += b.toString(16).padStart(2, "0");
  return h;
}
const reversedBytes = (b: Uint8Array): Uint8Array => Uint8Array.from(b).reverse();

// Fee-adequate anchor: prevouts 5_000_000 + 3_000_000 spent, one 7_000_000 output ⇒ paidFee = 1_000_000.
const FEE_PREVOUT_A: LegacyTransaction = {
  version: 1,
  inputs: [{ prevoutTxid: "00".repeat(32), prevoutVout: 0, scriptSigHex: "", sequence: 0xffffffff }],
  outputs: [{ valueSats: 5_000_000n, scriptPubKeyHex: "51" }],
  locktime: 0,
};
const FEE_PREVOUT_B: LegacyTransaction = {
  version: 1,
  inputs: [{ prevoutTxid: "00".repeat(32), prevoutVout: 1, scriptSigHex: "", sequence: 0xffffffff }],
  outputs: [{ valueSats: 3_000_000n, scriptPubKeyHex: "51" }],
  locktime: 0,
};
const ANCHOR_TX: LegacyTransaction = {
  version: 1,
  inputs: [FEE_PREVOUT_A, FEE_PREVOUT_B].map((p) => ({
    prevoutTxid: legacyTxidOf(p)!,
    prevoutVout: 0,
    scriptSigHex: "",
    sequence: 0xffffffff,
  })),
  outputs: [{ valueSats: 7_000_000n, scriptPubKeyHex: "6a04deadbeef" }],
  locktime: 0,
};
const ANCHOR_TXID = legacyTxidOf(ANCHOR_TX)!;
const ANCHOR_HEIGHT = 170;

// Synthetic 1-tx block header: merkleRoot (internal) = the anchor txid; easy nBits 0x2000ffff + a mined
// nonce so headerMeetsTarget passes. Deterministic (fixed fields → same first-passing nonce).
function mineAnchorHeader(): string {
  const h = new Uint8Array(80);
  h[0] = 1; // version 1 (LE)
  h.set(reversedBytes(hexToBytes(ANCHOR_TXID)), 36); // merkleRoot = 1-tx root (internal order)
  h[68] = 0x40; h[69] = 0x9c; h[70] = 0x00; h[71] = 0x00; // arbitrary block time
  h[72] = 0xff; h[73] = 0xff; h[74] = 0x00; h[75] = 0x20; // nBits LE = 0x2000ffff (easy target)
  for (let nonce = 0; nonce < 5_000_000; nonce++) {
    h[76] = nonce & 0xff;
    h[77] = (nonce >>> 8) & 0xff;
    h[78] = (nonce >>> 16) & 0xff;
    h[79] = (nonce >>> 24) & 0xff;
    if (headerMeetsTarget(h)) return bytesToHex(h);
  }
  throw new Error("mineAnchorHeader: no nonce found");
}
const ANCHOR_HEADER = mineAnchorHeader();

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
  txid: ANCHOR_TXID,
  height: ANCHOR_HEIGHT,
  blockHeaderHex: ANCHOR_HEADER,
  orderedBlockTxids: [ANCHOR_TXID], // synthetic 1-tx block → merkle root = the txid
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
  anchor: { anchorTxid: ANCHOR_TXID, anchorHeight: ANCHOR_HEIGHT },
  inclusion,
  valueRecords: [rec1, rec2],
});

const K = 6;
const W = 2;
const C = 3;

// Trusted launch policy (NOT producer claim material): DA window + gate-fee schedule (same trust tier).
// Curve floor 100_000 for ≥5-byte names; "alice" is 5 bytes ⇒ Σg = 100_000 ≤ the anchor's paidFee 1_000_000.
const SCHEDULE = { gateOneByteSats: 1_000_000n, gateLongNameFloorSats: 100_000n };
const POLICY: BatchedClaimPolicy = { window: { K, W, C }, gateFeeSchedule: SCHEDULE };

// Verified committed-batch projection (firewall-minted; canonicalNameByteLength is NOT producer-chosen).
const COMMITTED_BATCH = {
  anchoredRoot: ANCHORED_ROOT,
  batchSize: 1,
  leaves: [{ leafKeyHex: LEAF, canonicalNameByteLength: 5 }],
};
// A 2-leaf committed projection for the batchSize-2 completeness tests: gate-fee passes (Σg 200k ≤ 1M),
// so completeness still catches the served-count mismatch downstream.
const COMMITTED_BATCH_2 = {
  anchoredRoot: ANCHORED_ROOT,
  batchSize: 2,
  leaves: [
    { leafKeyHex: LEAF, canonicalNameByteLength: 5 },
    { leafKeyHex: OTHER_KEY, canonicalNameByteLength: 6 },
  ],
};
// The parsed anchor tx + prevouts (NO schedule) the fee/inclusion adapter supplies for the anchor txid.
const FEE_TX_PARTS = { anchorTx: ANCHOR_TX, prevoutTxs: [FEE_PREVOUT_A, FEE_PREVOUT_B] };
// A different anchor tx (distinct outputs → distinct txid) — a hostile fee witness not bound to the anchor.
const OTHER_ANCHOR_TX: LegacyTransaction = { ...ANCHOR_TX, outputs: [{ valueSats: 6_900_000n, scriptPubKeyHex: "6a04deadbeef" }] };
const OTHER_FEE_TX_PARTS = { anchorTx: OTHER_ANCHOR_TX, prevoutTxs: [FEE_PREVOUT_A, FEE_PREVOUT_B] };

function headerSource(at?: (h: number) => string | null): BitcoinHeaderSource {
  return { headerHexAtHeight: at ?? ((h) => (h === ANCHOR_HEIGHT ? ANCHOR_HEADER : null)) };
}

function batchDataSource(over: Partial<BatchDataSource> = {}): BatchDataSource {
  return {
    baseLeavesForPrevRoot: over.baseLeavesForPrevRoot ?? ((r) => (r === PREV_ROOT ? BASE : null)),
    servedLeavesForRoot: over.servedLeavesForRoot ?? ((r) => (r === ANCHORED_ROOT ? SERVED_DELTA : null)),
    committedBatchForRoot: over.committedBatchForRoot ?? ((r) => (r === ANCHORED_ROOT ? COMMITTED_BATCH : null)),
    feeTxForAnchor: over.feeTxForAnchor ?? ((t) => (t === ANCHOR_TXID ? FEE_TX_PARTS : null)),
  };
}

function claim(over: Partial<BatchedClaimInput> = {}): BatchedClaimInput {
  return {
    proofBundle: BUNDLE,
    anchor: { txid: ANCHOR_TXID, prevRoot: PREV_ROOT, anchoredRoot: ANCHORED_ROOT, anchorHeight: ANCHOR_HEIGHT, batchSize: 1 },
    ...over,
  };
}

function sources(over: { header?: BitcoinHeaderSource; batch?: BatchDataSource } = {}): BatchedClaimSources {
  return { headerSource: over.header ?? headerSource(), batchDataSource: over.batch ?? batchDataSource() };
}

// Trusted policy is a required 3rd arg; the wrapper defaults it to the launch POLICY for the existing
// tests, while gate-fee tests pass an explicit policy (e.g. a higher schedule) to probe underpay.
function run(c: BatchedClaimInput, s: BatchedClaimSources, p: BatchedClaimPolicy = POLICY): BatchedClaimResult {
  return enforceBatchedClaim(c, s, p);
}

const stepOk = (r: { trace: readonly { step: string; ok: boolean }[] }, step: string): boolean | undefined =>
  r.trace.find((e) => e.step === step)?.ok;
const reached = (r: { trace: readonly { step: string }[] }, step: string): boolean =>
  r.trace.some((e) => e.step === step);

describe("I-HARNESS enforceBatchedClaim — end-to-end batched-claim enforcement (4-stage)", () => {
  it("accepts a coherent honest claim: every audited stage ok, ordered trace, a name-state delta", () => {
    const r = run(claim(), sources());
    expect(r.accepted).toBe(true);
    expect(r.reason).toBe("batched-claim-accepted");
    expect(r.trace.map((e) => e.step)).toEqual(["inclusion", "gate-fee", "availability", "completeness", "verdict"]);
    expect(r.trace.every((e) => e.ok)).toBe(true);
    expect(r.nameStateDelta).toEqual({ anchoredRoot: ANCHORED_ROOT, firstServableHeight: ANCHOR_HEIGHT });
  });

  it("is pure + deterministic — identical inputs give a byte-identical result", () => {
    expect(run(claim(), sources())).toEqual(run(claim(), sources()));
  });

  it("rejects absent Bitcoin inclusion at the inclusion step, preserving the failed audited check id", () => {
    const noInclusion = { ...(BUNDLE as Record<string, unknown>), bitcoinInclusion: undefined };
    const r = run(claim({ proofBundle: noInclusion }), sources());
    expect(r.accepted).toBe(false);
    expect(stepOk(r, "inclusion")).toBe(false);
    // the trace must carry the REAL failed proof-bundle check, not the first passing one.
    expect(r.trace.find((e) => e.step === "inclusion")?.reason).toContain("btc.inclusion.present");
  });

  it("rejects a stale / noncanonical header at inclusion, preserving the failed audited check id", () => {
    const r = run(claim(), sources({ header: headerSource(() => null) }));
    expect(r.accepted).toBe(false);
    expect(stepOk(r, "inclusion")).toBe(false);
    expect(r.trace.find((e) => e.step === "inclusion")?.reason).toContain("btc.0.chain");
  });

  it("precedence: inclusion failure stops BEFORE availability/completeness are evaluated", () => {
    const noInclusion = { ...(BUNDLE as Record<string, unknown>), bitcoinInclusion: undefined };
    const r = run(claim({ proofBundle: noInclusion }), sources({ batch: batchDataSource({ servedLeavesForRoot: () => null }) }));
    expect(stepOk(r, "inclusion")).toBe(false);
    expect(reached(r, "availability")).toBe(false);
    expect(reached(r, "completeness")).toBe(false);
  });

  it("rejects withheld served bytes at availability — before any completeness/delta", () => {
    const r = run(claim(), sources({ batch: batchDataSource({ servedLeavesForRoot: () => null }) }));
    expect(r.accepted).toBe(false);
    expect(stepOk(r, "availability")).toBe(false);
    expect(reached(r, "completeness")).toBe(false);
  });

  it("rejects a committed-batchSize / served-count mismatch at completeness (availability still reconstructs)", () => {
    // batchSize claims 2, but the served delta is the real 1 leaf that reconstructs anchoredRoot:
    // availability passes (bytes reconstruct), completeness fails on the count.
    const r = run(
      claim({ anchor: { txid: ANCHOR_TXID, prevRoot: PREV_ROOT, anchoredRoot: ANCHORED_ROOT, anchorHeight: ANCHOR_HEIGHT, batchSize: 2 } }),
      sources({ batch: batchDataSource({ committedBatchForRoot: () => COMMITTED_BATCH_2 }) }),
    );
    expect(r.accepted).toBe(false);
    expect(stepOk(r, "availability")).toBe(true);
    expect(stepOk(r, "completeness")).toBe(false);
  });

  it("precedence: completeness failure stops BEFORE any name-state delta", () => {
    const r = run(
      claim({ anchor: { txid: ANCHOR_TXID, prevRoot: PREV_ROOT, anchoredRoot: ANCHORED_ROOT, anchorHeight: ANCHOR_HEIGHT, batchSize: 2 } }),
      sources({ batch: batchDataSource({ committedBatchForRoot: () => COMMITTED_BATCH_2 }) }),
    );
    expect(r.accepted).toBe(false);
    expect(stepOk(r, "completeness")).toBe(false);
    expect(r.nameStateDelta).toBeUndefined();
  });

  it("content-only: withheld content rejects; presenting the actual matching content is the only way to mint the witness", () => {
    // Per #84/O1 the non-content rule is: omitted bytes give no witness, and no timestamp/receipt channel
    // exists to substitute. The ONLY difference here is presence of the real content.
    const withheld = run(claim(), sources({ batch: batchDataSource({ servedLeavesForRoot: () => null }) }));
    const present = run(claim(), sources());
    expect(withheld.accepted).toBe(false);
    expect(present.accepted).toBe(true);
  });

  it("is total on a throwing seam — a header/batch source that throws yields a failed trace step, not an exception", () => {
    const throwingHeader: BitcoinHeaderSource = { headerHexAtHeight: () => { throw new Error("header source down"); } };
    const rh = run(claim(), sources({ header: throwingHeader }));
    expect(rh.accepted).toBe(false);
    expect(stepOk(rh, "inclusion")).toBe(false);

    const throwingBatch = batchDataSource({ servedLeavesForRoot: () => { throw new Error("batch source down"); } });
    expect(() => run(claim(), sources({ batch: throwingBatch }))).not.toThrow();
    const rb = run(claim(), sources({ batch: throwingBatch }));
    expect(rb.accepted).toBe(false);
    expect(stepOk(rb, "availability")).toBe(false);
  });

  it("binds input.anchor to the bundle: a txid / anchorHeight mismatch rejects at inclusion, before availability", () => {
    const badTxid = run(
      claim({ anchor: { txid: "99".repeat(32), prevRoot: PREV_ROOT, anchoredRoot: ANCHORED_ROOT, anchorHeight: ANCHOR_HEIGHT, batchSize: 1 } }),
      sources(),
    );
    expect(badTxid.accepted).toBe(false);
    expect(stepOk(badTxid, "inclusion")).toBe(false);
    expect(reached(badTxid, "availability")).toBe(false);

    const badHeight = run(
      claim({ anchor: { txid: ANCHOR_TXID, prevRoot: PREV_ROOT, anchoredRoot: ANCHORED_ROOT, anchorHeight: ANCHOR_HEIGHT + 1, batchSize: 1 } }),
      sources(),
    );
    expect(stepOk(badHeight, "inclusion")).toBe(false);
  });

  it("binds anchoredRoot to the bundle's membership root: a root-B claim with reconstructing B bytes still rejects (no membership-A + bytes-B)", () => {
    // input.anchor commits root B and batchDataSource serves B's reconstructing bytes, but the BUNDLE
    // commits root A. The bind must reject before availability/completeness — never accept the cross.
    const r = run(
      claim({ anchor: { txid: ANCHOR_TXID, prevRoot: PREV_ROOT, anchoredRoot: ANCHORED_ROOT_2, anchorHeight: ANCHOR_HEIGHT, batchSize: 1 } }),
      sources({ batch: batchDataSource({ servedLeavesForRoot: (root) => (root === ANCHORED_ROOT_2 ? SERVED_DELTA_2 : null) }) }),
    );
    expect(r.accepted).toBe(false);
    expect(stepOk(r, "inclusion")).toBe(false);
    expect(reached(r, "completeness")).toBe(false);
    expect(r.nameStateDelta).toBeUndefined();
  });

  it("a null base (baseLeavesForPrevRoot returns null) fails at availability — never treated as an empty base, never reaches completeness", () => {
    const r = run(claim(), sources({ batch: batchDataSource({ baseLeavesForPrevRoot: () => null }) }));
    expect(r.accepted).toBe(false);
    expect(stepOk(r, "availability")).toBe(false);
    expect(reached(r, "completeness")).toBe(false);
  });
});

// I-FEE-PATH (§10): the MANDATORY gate-fee stage — inclusion → gate-fee → availability → completeness →
// verdict. A claim cannot reach a verdict / nameStateDelta unless gate-fee admission passes. The schedule
// is the TRUSTED policy param; the seam supplies only {anchorTx, prevoutTxs}. RED until the stage lands.
const UNDERPAY_POLICY: BatchedClaimPolicy = {
  window: { K, W, C },
  // floor 2_000_000 for the ≥5-byte name ⇒ Σg = 2_000_000 > paidFee 1_000_000.
  gateFeeSchedule: { gateOneByteSats: 1_000_000n, gateLongNameFloorSats: 2_000_000n },
};

describe("I-FEE-PATH enforceBatchedClaim — mandatory gate-fee stage", () => {
  it("inclusion fault never reaches gate-fee (gate-fee runs only after the anchor bind)", () => {
    const noInclusion = { ...(BUNDLE as Record<string, unknown>), bitcoinInclusion: undefined };
    const r = run(claim({ proofBundle: noInclusion }), sources());
    expect(stepOk(r, "inclusion")).toBe(false);
    expect(reached(r, "gate-fee")).toBe(false);
  });

  it("underpaid batch rejects AT gate-fee — no availability/completeness, no nameStateDelta", () => {
    const r = run(claim(), sources(), UNDERPAY_POLICY);
    expect(r.accepted).toBe(false);
    expect(stepOk(r, "gate-fee")).toBe(false);
    expect(r.trace.find((e) => e.step === "gate-fee")?.reason).toContain("gf-underpaid");
    expect(reached(r, "availability")).toBe(false);
    expect(reached(r, "completeness")).toBe(false);
    expect(r.nameStateDelta).toBeUndefined();
  });

  it("a hostile fee tx (anchorTx != bound txid) rejects at gate-fee", () => {
    const r = run(claim(), sources({ batch: batchDataSource({ feeTxForAnchor: () => OTHER_FEE_TX_PARTS }) }));
    expect(r.accepted).toBe(false);
    expect(stepOk(r, "gate-fee")).toBe(false);
    expect(r.trace.find((e) => e.step === "gate-fee")?.reason).toContain("gf-anchor-txid-mismatch");
    expect(reached(r, "availability")).toBe(false);
  });

  it("a null committed-batch projection rejects at gate-fee (fail closed)", () => {
    const r = run(claim(), sources({ batch: batchDataSource({ committedBatchForRoot: () => null }) }));
    expect(r.accepted).toBe(false);
    expect(stepOk(r, "gate-fee")).toBe(false);
    expect(reached(r, "availability")).toBe(false);
  });

  it("a null fee tx rejects at gate-fee (fail closed)", () => {
    const r = run(claim(), sources({ batch: batchDataSource({ feeTxForAnchor: () => null }) }));
    expect(r.accepted).toBe(false);
    expect(stepOk(r, "gate-fee")).toBe(false);
    expect(reached(r, "availability")).toBe(false);
  });

  it("a throwing committedBatchForRoot seam fails closed at gate-fee (never an exception)", () => {
    const throwing = batchDataSource({ committedBatchForRoot: () => { throw new Error("committed-batch source down"); } });
    expect(() => run(claim(), sources({ batch: throwing }))).not.toThrow();
    const r = run(claim(), sources({ batch: throwing }));
    expect(r.accepted).toBe(false);
    expect(stepOk(r, "gate-fee")).toBe(false);
    expect(reached(r, "availability")).toBe(false);
    expect(r.nameStateDelta).toBeUndefined();
  });

  it("a throwing feeTxForAnchor seam fails closed at gate-fee (never an exception)", () => {
    const throwing = batchDataSource({ feeTxForAnchor: () => { throw new Error("fee-tx source down"); } });
    expect(() => run(claim(), sources({ batch: throwing }))).not.toThrow();
    const r = run(claim(), sources({ batch: throwing }));
    expect(r.accepted).toBe(false);
    expect(stepOk(r, "gate-fee")).toBe(false);
    expect(reached(r, "availability")).toBe(false);
    expect(reached(r, "completeness")).toBe(false);
    expect(r.nameStateDelta).toBeUndefined();
  });

  it("a fake low schedule riding on the fee seam is IGNORED — the trusted policy schedule decides", () => {
    // The seam object carries a tiny `schedule` that WOULD pass if used; the orchestrator injects the
    // trusted UNDERPAY_POLICY schedule instead, so the batch is still underpaid and rejects.
    const sneaky = batchDataSource({
      feeTxForAnchor: () => ({ ...FEE_TX_PARTS, schedule: { gateOneByteSats: 1n, gateLongNameFloorSats: 1n } }),
    });
    const r = run(claim(), sources({ batch: sneaky }), UNDERPAY_POLICY);
    expect(r.accepted).toBe(false);
    expect(stepOk(r, "gate-fee")).toBe(false);
    expect(r.trace.find((e) => e.step === "gate-fee")?.reason).toContain("gf-underpaid");
  });
});
