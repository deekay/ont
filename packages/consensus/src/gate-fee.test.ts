// D-GF gate-fee adequacy + completeness red battery (B3 §14 update 2). Recompute-don't-trust:
// the kernel derives paidFee from txid-bound transactions and requiredFee from the FULL committed
// leaf set (#52), so neither a self-declared fee nor an over-stated prevout nor an omitted output
// can buy a false accept. Every fixture is built so its txids match by CONSTRUCTION (we compute
// legacyTxidOf of the prevout txs and feed them as the anchor's input prevoutTxids, then compute
// the anchor's own txid) — an attack mutates exactly one fact and the recompute catches it.
//
// RED PHASE: gateFeeValidation is stubbed to reject("gf-pending-green-impl"); every assertion below
// (the accept path AND each specific reject reason) is therefore red until the green impl lands.
import { describe, expect, it } from "vitest";

import { legacyTxidOf, type LegacyTransaction } from "@ont/bitcoin";

import {
  gateFeeValidation,
  type CommittedBatchContents,
  type GateFeeAnchorFacts,
  type GateFeeSchedule,
  type GateFeeWitness,
} from "./gate-fee.js";

const DUMMY_TXID = "00".repeat(32);
const ROOT = "ab".repeat(32);

// A minimal well-formed tx with the given outputs; `salt` varies the dummy input's vout so distinct
// prevout txs get distinct txids.
function makeTx(outputs: readonly { valueSats: bigint; scriptPubKeyHex: string }[], salt: number): LegacyTransaction {
  return {
    version: 1,
    inputs: [{ prevoutTxid: DUMMY_TXID, prevoutVout: salt, scriptSigHex: "", sequence: 0xffffffff }],
    outputs,
    locktime: 0,
  };
}

// Build an anchor tx spending vout 0 of each prevout tx (by recomputing each prevout's txid), with
// the given OP_RETURN-style outputs. Returns the anchor tx plus its computed txid.
function buildAnchor(
  prevouts: readonly LegacyTransaction[],
  outputValues: readonly bigint[]
): { anchorTx: LegacyTransaction; anchorTxid: string } {
  const anchorTx: LegacyTransaction = {
    version: 1,
    inputs: prevouts.map((p) => ({
      prevoutTxid: legacyTxidOf(p)!,
      prevoutVout: 0,
      scriptSigHex: "",
      sequence: 0xffffffff,
    })),
    outputs: outputValues.map((v) => ({ valueSats: v, scriptPubKeyHex: "6a04deadbeef" })),
    locktime: 0,
  };
  return { anchorTx, anchorTxid: legacyTxidOf(anchorTx)! };
}

// ---- The adequate, anchor-bound baseline ----
// prevouts: 5_000_000 + 3_000_000 = 8_000_000 spent; anchor output 7_000_000 ⇒ paidFee = 1_000_000.
const prevoutA = makeTx([{ valueSats: 5_000_000n, scriptPubKeyHex: "51" }], 0);
const prevoutB = makeTx([{ valueSats: 3_000_000n, scriptPubKeyHex: "51" }], 1);
const baseline = buildAnchor([prevoutA, prevoutB], [7_000_000n]);

const SCHEDULE: GateFeeSchedule = { gateOneByteSats: 1_000_000n, gateLongNameFloorSats: 100_000n };

const ANCHOR: GateFeeAnchorFacts = {
  minedHeight: 800_000,
  anchoredRoot: ROOT,
  batchSize: 2,
  anchorTxid: baseline.anchorTxid,
};

// Two ≥5-byte names ⇒ requiredFee = 100_000 + 100_000 = 200_000 ≤ paidFee 1_000_000.
const BATCH: CommittedBatchContents = {
  anchoredRoot: ROOT,
  batchSize: 2,
  leaves: [
    { leafKeyHex: "cd".repeat(32), canonicalNameByteLength: 7 },
    { leafKeyHex: "ef".repeat(32), canonicalNameByteLength: 9 },
  ],
};

const FEE: GateFeeWitness = { anchorTx: baseline.anchorTx, prevoutTxs: [prevoutA, prevoutB], schedule: SCHEDULE };

describe("D-GF gate-fee adequacy + completeness (gateFeeValidation)", () => {
  it("accepts an adequate, anchor-bound, completeness-pinned fee", () => {
    expect(gateFeeValidation(ANCHOR, BATCH, FEE)).toEqual({ accepted: true, reason: "gate-fee-adequate" });
  });

  it("is a pure 3-input predicate with no publisher/source channel (I5) and is deterministic", () => {
    expect(gateFeeValidation.length).toBe(3);
    expect(gateFeeValidation(ANCHOR, BATCH, FEE)).toEqual(gateFeeValidation(ANCHOR, BATCH, FEE));
  });

  it("accepts exactly at the boundary (paidFee === requiredFee)", () => {
    // floor 500_000 × 2 long names = 1_000_000 === paidFee.
    const sched: GateFeeSchedule = { gateOneByteSats: 1_000_000n, gateLongNameFloorSats: 500_000n };
    const fee: GateFeeWitness = { ...FEE, schedule: sched };
    expect(gateFeeValidation(ANCHOR, BATCH, fee).accepted).toBe(true);
  });

  it("rejects underpay-by-1 (paidFee < requiredFee)", () => {
    // floor 500_001 × 2 = 1_000_002 > paidFee 1_000_000.
    const sched: GateFeeSchedule = { gateOneByteSats: 1_000_000n, gateLongNameFloorSats: 500_001n };
    const fee: GateFeeWitness = { ...FEE, schedule: sched };
    expect(gateFeeValidation(ANCHOR, BATCH, fee)).toEqual({ accepted: false, reason: "gf-underpaid" });
  });

  it("#52: a later-droppable / DA-excluded leaf STILL counts in Σ g (the Σ is over the full set)", () => {
    // 3 committed leaves; the third would be adequate to omit but MUST be summed. floor 400_000 ×
    // 3 = 1_200_000 > paidFee 1_000_000 ⇒ underpaid. Dropping the 3rd (×2 = 800_000) would falsely
    // accept — the kernel must NOT, so it rejects. Proves Σ g is regardless of drops.
    const sched: GateFeeSchedule = { gateOneByteSats: 1_000_000n, gateLongNameFloorSats: 400_000n };
    const batch3: CommittedBatchContents = {
      anchoredRoot: ROOT,
      batchSize: 3,
      leaves: [...BATCH.leaves, { leafKeyHex: "11".repeat(32), canonicalNameByteLength: 6 }],
    };
    const anchor3: GateFeeAnchorFacts = { ...ANCHOR, batchSize: 3 };
    const fee: GateFeeWitness = { ...FEE, schedule: sched };
    expect(gateFeeValidation(anchor3, batch3, fee)).toEqual({ accepted: false, reason: "gf-underpaid" });
  });

  it("rejects an anchor-txid mismatch (the witnessed anchor tx is not the on-chain anchor)", () => {
    const badAnchor: GateFeeAnchorFacts = { ...ANCHOR, anchorTxid: "12".repeat(32) };
    expect(gateFeeValidation(badAnchor, BATCH, FEE)).toEqual({ accepted: false, reason: "gf-anchor-txid-mismatch" });
  });

  it("rejects an over-stated / mismatched prevout (inflating a spent value breaks its txid)", () => {
    // Attacker swaps in a prevout tx claiming 9_000_000 (vs the real 5_000_000) to inflate paidFee;
    // its txid no longer matches anchorTx.inputs[0].prevoutTxid ⇒ fail closed.
    const lyingPrevout = makeTx([{ valueSats: 9_000_000n, scriptPubKeyHex: "51" }], 0);
    const fee: GateFeeWitness = { ...FEE, prevoutTxs: [lyingPrevout, prevoutB] };
    expect(gateFeeValidation(ANCHOR, BATCH, fee)).toEqual({ accepted: false, reason: "gf-prevout-txid-mismatch" });
  });

  it("rejects an omitted anchor output (dropping an output to inflate the fee breaks the anchor txid)", () => {
    // The witnessed anchorTx has no outputs ⇒ Σout=0 inflates paidFee, but legacyTxidOf ≠ anchor.anchorTxid.
    const trimmed: LegacyTransaction = { ...baseline.anchorTx, outputs: [] };
    const fee: GateFeeWitness = { ...FEE, anchorTx: trimmed };
    expect(gateFeeValidation(ANCHOR, BATCH, fee)).toEqual({ accepted: false, reason: "gf-anchor-txid-mismatch" });
  });

  it("rejects a fake anchor input (adding an input to inflate the fee breaks the anchor txid)", () => {
    const prevoutC = makeTx([{ valueSats: 4_000_000n, scriptPubKeyHex: "51" }], 2);
    const inflated: LegacyTransaction = {
      ...baseline.anchorTx,
      inputs: [...baseline.anchorTx.inputs, { prevoutTxid: legacyTxidOf(prevoutC)!, prevoutVout: 0, scriptSigHex: "", sequence: 0xffffffff }],
    };
    const fee: GateFeeWitness = { ...FEE, anchorTx: inflated, prevoutTxs: [prevoutA, prevoutB, prevoutC] };
    expect(gateFeeValidation(ANCHOR, BATCH, fee)).toEqual({ accepted: false, reason: "gf-anchor-txid-mismatch" });
  });

  it("rejects two anchor inputs that spend the SAME exact outpoint (no double-counting a spent output)", () => {
    // The real duplicate-input hole: an anchor whose two inputs reference the identical
    // (prevoutTxid, prevoutVout). prevoutTxs length matches (the shared prevout tx supplied twice),
    // every txid recomputes/binds, and the fee is adequate ONLY if that one 1_000_000 output is
    // double-counted (2_000_000 − 1_700_000 = 300_000 ≥ requiredFee 200_000). A naive impl that
    // sums per-input would accept; the kernel must reject the duplicate outpoint structurally.
    // NOTE: same prevoutTxid with DIFFERENT vout is legitimate (a tx may spend two of one tx's
    // outputs) and is NOT what this bans — only the identical (txid, vout) pair.
    const shared = makeTx([{ valueSats: 1_000_000n, scriptPubKeyHex: "51" }], 7);
    const sharedTxid = legacyTxidOf(shared)!;
    const dupAnchorTx: LegacyTransaction = {
      version: 1,
      inputs: [
        { prevoutTxid: sharedTxid, prevoutVout: 0, scriptSigHex: "", sequence: 0xffffffff },
        { prevoutTxid: sharedTxid, prevoutVout: 0, scriptSigHex: "", sequence: 0xffffffff },
      ],
      outputs: [{ valueSats: 1_700_000n, scriptPubKeyHex: "6a04deadbeef" }],
      locktime: 0,
    };
    const anchor: GateFeeAnchorFacts = { ...ANCHOR, anchorTxid: legacyTxidOf(dupAnchorTx)! };
    const fee: GateFeeWitness = { anchorTx: dupAnchorTx, prevoutTxs: [shared, shared], schedule: SCHEDULE };
    expect(gateFeeValidation(anchor, BATCH, fee)).toEqual({ accepted: false, reason: "gf-duplicate-prevout-spend" });
  });

  it("rejects prevoutVout out of range (input points past the prevout tx's outputs)", () => {
    // A dedicated anchor whose input vout is 5 against a single-output prevout; its txid is recomputed
    // so the anchor-txid bind PASSES and the out-of-range vout is the isolated failure.
    const onePrev = makeTx([{ valueSats: 8_000_000n, scriptPubKeyHex: "51" }], 0);
    const oorAnchorTx: LegacyTransaction = {
      version: 1,
      inputs: [{ prevoutTxid: legacyTxidOf(onePrev)!, prevoutVout: 5, scriptSigHex: "", sequence: 0xffffffff }],
      outputs: [{ valueSats: 7_000_000n, scriptPubKeyHex: "6a04deadbeef" }],
      locktime: 0,
    };
    const anchor: GateFeeAnchorFacts = { ...ANCHOR, anchorTxid: legacyTxidOf(oorAnchorTx)! };
    const fee: GateFeeWitness = { anchorTx: oorAnchorTx, prevoutTxs: [onePrev], schedule: SCHEDULE };
    expect(gateFeeValidation(anchor, BATCH, fee)).toEqual({ accepted: false, reason: "gf-prevout-vout-out-of-range" });
  });

  it("rejects prevoutTxs.length !== anchorTx.inputs.length in BOTH directions (missing AND extra)", () => {
    // missing: 1 prevout for a 2-input anchor.
    expect(gateFeeValidation(ANCHOR, BATCH, { ...FEE, prevoutTxs: [prevoutA] })).toEqual({ accepted: false, reason: "gf-prevout-count-mismatch" });
    // extra: 3 prevouts for a 2-input anchor — catches an impl that sums all supplied prevout txs
    // instead of zipping one-for-one to the anchor's inputs.
    const prevoutC = makeTx([{ valueSats: 4_000_000n, scriptPubKeyHex: "51" }], 3);
    expect(gateFeeValidation(ANCHOR, BATCH, { ...FEE, prevoutTxs: [prevoutA, prevoutB, prevoutC] })).toEqual({ accepted: false, reason: "gf-prevout-count-mismatch" });
  });

  it("rejects paidFee < 0 (outputs exceed spent inputs)", () => {
    // anchor outputs 9_000_000 > spent 8_000_000 ⇒ paidFee = -1_000_000.
    const overspend = buildAnchor([prevoutA, prevoutB], [9_000_000n]);
    const anchor: GateFeeAnchorFacts = { ...ANCHOR, anchorTxid: overspend.anchorTxid };
    const fee: GateFeeWitness = { anchorTx: overspend.anchorTx, prevoutTxs: [prevoutA, prevoutB], schedule: SCHEDULE };
    expect(gateFeeValidation(anchor, BATCH, fee)).toEqual({ accepted: false, reason: "gf-paid-fee-negative" });
  });

  it("rejects a batch not bound to the anchor (root, batchSize, or leaves.length mismatch)", () => {
    expect(gateFeeValidation(ANCHOR, { ...BATCH, anchoredRoot: "ff".repeat(32) }, FEE).reason).toBe("gf-batch-not-bound-to-anchor");
    expect(gateFeeValidation(ANCHOR, { ...BATCH, batchSize: 3 }, FEE).reason).toBe("gf-batch-not-bound-to-anchor");
    expect(gateFeeValidation(ANCHOR, { ...BATCH, leaves: [BATCH.leaves[0]!] }, FEE).reason).toBe("gf-batch-not-bound-to-anchor");
  });

  it("rejects a malformed committed leaf (a malformed committed-set witness, NOT a fee discount)", () => {
    const badBatch: CommittedBatchContents = {
      ...BATCH,
      leaves: [BATCH.leaves[0]!, { leafKeyHex: "ef".repeat(32), canonicalNameByteLength: 0 }],
    };
    expect(gateFeeValidation(ANCHOR, badBatch, FEE)).toEqual({ accepted: false, reason: "gf-committed-leaf-malformed" });
  });

  it("rejects a duplicate committed leaf KEY (duplicate length is fine; duplicate H(name) is not)", () => {
    // Two leaves carrying the same leafKeyHex (= duplicate committed name) — a malformed committed
    // set, not a Σ g discount. Distinct lengths confirm it is the KEY, not the length, that is banned.
    const dupKeyBatch: CommittedBatchContents = {
      anchoredRoot: ROOT,
      batchSize: 2,
      leaves: [
        { leafKeyHex: "cd".repeat(32), canonicalNameByteLength: 7 },
        { leafKeyHex: "cd".repeat(32), canonicalNameByteLength: 9 },
      ],
    };
    expect(gateFeeValidation(ANCHOR, dupKeyBatch, FEE)).toEqual({ accepted: false, reason: "gf-duplicate-committed-leaf-key" });
  });

  it("rejects a malformed schedule (non-positive / wrong-type / extra-field / satoshi-overflow) — closed shape", () => {
    const sched = (over: Record<string, unknown>): GateFeeSchedule => ({ gateOneByteSats: 1_000_000n, gateLongNameFloorSats: 100_000n, ...over }) as never;
    expect(gateFeeValidation(ANCHOR, BATCH, { ...FEE, schedule: sched({ gateOneByteSats: 0n }) }).reason).toBe("gf-schedule-malformed"); // non-positive
    expect(gateFeeValidation(ANCHOR, BATCH, { ...FEE, schedule: sched({ gateLongNameFloorSats: -1n }) }).reason).toBe("gf-schedule-malformed"); // negative
    expect(gateFeeValidation(ANCHOR, BATCH, { ...FEE, schedule: sched({ gateOneByteSats: 1_000_000 }) }).reason).toBe("gf-schedule-malformed"); // wrong type (number, not bigint)
    expect(gateFeeValidation(ANCHOR, BATCH, { ...FEE, schedule: sched({ evil: 1n }) }).reason).toBe("gf-schedule-malformed"); // extra field
    expect(gateFeeValidation(ANCHOR, BATCH, { ...FEE, schedule: sched({ gateOneByteSats: 1n << 64n }) }).reason).toBe("gf-schedule-malformed"); // > U64 satoshi bound
  });

  it("rejects a malformed tx witness (a tx that does not serialize) — fail closed, never throws", () => {
    const broken: LegacyTransaction = { ...baseline.anchorTx, version: -1 };
    expect(gateFeeValidation(ANCHOR, BATCH, { ...FEE, anchorTx: broken })).toEqual({ accepted: false, reason: "gf-tx-malformed" });
  });

  it("is total on malformed top-level envelopes (null anchor / batch / fee) — never throws", () => {
    // gateFeeValidation is an exported kernel boundary: a malformed top-level envelope must fail
    // closed with a stable reason, never throw (Stage 1 totality, §14 update 4).
    expect(gateFeeValidation(null as never, BATCH, FEE)).toEqual({ accepted: false, reason: "gf-input-malformed" });
    expect(gateFeeValidation(ANCHOR, null as never, FEE)).toEqual({ accepted: false, reason: "gf-input-malformed" });
    expect(gateFeeValidation(ANCHOR, BATCH, null as never)).toEqual({ accepted: false, reason: "gf-input-malformed" });
  });

  it("rejects a malformed prevout tx with gf-tx-malformed (serialize failure precedes txid mismatch)", () => {
    // A prevout tx that does not serialize must fail closed at gf-tx-malformed, NOT fall through the
    // legacyTxidOf(...) === null comparison to gf-prevout-txid-mismatch (§14 update-3 order).
    const brokenPrevout: LegacyTransaction = { ...prevoutA, version: -1 };
    const fee: GateFeeWitness = { ...FEE, prevoutTxs: [brokenPrevout, prevoutB] };
    expect(gateFeeValidation(ANCHOR, BATCH, fee)).toEqual({ accepted: false, reason: "gf-tx-malformed" });
  });

  it("pins the short-name g() curve (lengths 1..4: full / halving / floor clamp)", () => {
    // schedule oneByte 800_000, floor 150_000 ⇒ g(1)=800_000, g(2)=max(150_000,400_000)=400_000,
    // g(3)=max(150_000,200_000)=200_000, g(4)=max(150_000,100_000)=150_000 (CLAMP: 800_000/8 < floor).
    // Σ over lengths 1,2,3,4 = 1_550_000. A wrong curve value would shift Σ and break the exact boundary.
    const sched: GateFeeSchedule = { gateOneByteSats: 800_000n, gateLongNameFloorSats: 150_000n };
    const shortBatch: CommittedBatchContents = {
      anchoredRoot: ROOT,
      batchSize: 4,
      leaves: [
        { leafKeyHex: "a1".repeat(32), canonicalNameByteLength: 1 },
        { leafKeyHex: "a2".repeat(32), canonicalNameByteLength: 2 },
        { leafKeyHex: "a3".repeat(32), canonicalNameByteLength: 3 },
        { leafKeyHex: "a4".repeat(32), canonicalNameByteLength: 4 },
      ],
    };
    // An anchor paying EXACTLY 1_550_000 (8_000_000 spent − 6_450_000 out) ⇒ boundary accept.
    const exact = buildAnchor([prevoutA, prevoutB], [6_450_000n]);
    const anchor4: GateFeeAnchorFacts = { ...ANCHOR, batchSize: 4, anchorTxid: exact.anchorTxid };
    const exactFee: GateFeeWitness = { anchorTx: exact.anchorTx, prevoutTxs: [prevoutA, prevoutB], schedule: sched };
    expect(gateFeeValidation(anchor4, shortBatch, exactFee)).toEqual({ accepted: true, reason: "gate-fee-adequate" });
    // floor+1 lifts ONLY the clamped g(4) term ⇒ requiredFee 1_550_001 > paidFee 1_550_000 ⇒ underpaid.
    const sched1: GateFeeSchedule = { gateOneByteSats: 800_000n, gateLongNameFloorSats: 150_001n };
    expect(gateFeeValidation(anchor4, shortBatch, { ...exactFee, schedule: sched1 })).toEqual({ accepted: false, reason: "gf-underpaid" });
  });
});
