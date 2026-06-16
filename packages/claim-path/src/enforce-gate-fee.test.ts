import { describe, expect, it } from "vitest";
import { legacyTxidOf, type LegacyTransaction } from "@ont/bitcoin";
import type { CommittedBatchContents, GateFeeSchedule, GateFeeWitness } from "@ont/consensus";
import {
  enforceGateFee,
  type ConfirmedBatchAnchor,
  type GateFeeInput,
} from "./enforce-gate-fee.js";

// I-FEE-A red battery (B3_INTEGRATION_PLAN §9). Fixtures mirror the kernel gate-fee.test.ts recipe:
// synthetic prevout txs + an anchor tx whose inputs reference legacyTxidOf(prevout), so the kernel
// recomputes paidFee = Σ(spent) − Σ(outputs) by construction. I-FEE feeds gateFeeValidation a CHAIN-
// BOUND ConfirmedBatchAnchor and emits an admission verdict — it never re-checks the fee math.

const DUMMY_TXID = "00".repeat(32);
const ROOT = "ab".repeat(32);
const OTHER_ROOT = "cd".repeat(32);

function makeTx(
  outputs: readonly { valueSats: bigint; scriptPubKeyHex: string }[],
  salt: number,
): LegacyTransaction {
  return {
    version: 1,
    inputs: [{ prevoutTxid: DUMMY_TXID, prevoutVout: salt, scriptSigHex: "", sequence: 0xffffffff }],
    outputs,
    locktime: 0,
  };
}

function buildAnchor(
  prevouts: readonly LegacyTransaction[],
  outputValues: readonly bigint[],
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

// prevouts 5_000_000 + 3_000_000 spent; anchor output 7_000_000 ⇒ paidFee = 1_000_000.
const prevoutA = makeTx([{ valueSats: 5_000_000n, scriptPubKeyHex: "51" }], 0);
const prevoutB = makeTx([{ valueSats: 3_000_000n, scriptPubKeyHex: "51" }], 1);
const baseline = buildAnchor([prevoutA, prevoutB], [7_000_000n]);

const SCHEDULE: GateFeeSchedule = { gateOneByteSats: 1_000_000n, gateLongNameFloorSats: 100_000n };

function validInput(): GateFeeInput {
  return {
    confirmedAnchor: {
      anchorTxid: baseline.anchorTxid,
      minedHeight: 800_000,
      anchoredRoot: ROOT,
      batchSize: 2,
    },
    // Two ≥5-byte names ⇒ Σ g = 100_000 + 100_000 = 200_000 ≤ paidFee 1_000_000.
    committedBatch: {
      anchoredRoot: ROOT,
      batchSize: 2,
      leaves: [
        { leafKeyHex: "cd".repeat(32), canonicalNameByteLength: 7 },
        { leafKeyHex: "ef".repeat(32), canonicalNameByteLength: 9 },
      ],
    },
    feeWitness: { anchorTx: baseline.anchorTx, prevoutTxs: [prevoutA, prevoutB], schedule: SCHEDULE },
  };
}

describe("enforceGateFee — happy path (admission, no mutation)", () => {
  it("admits an adequate, anchor-bound fee", () => {
    const { trace, verdict } = enforceGateFee(validInput());
    expect(verdict.adequate).toBe(true);
    if (!verdict.adequate) return;
    expect(verdict.kind).toBe("gate-fee-adequate");
    expect(trace.map((s) => `${s.stage}:${s.ok}`)).toEqual(["gate-fee:true"]);
  });

  it("emits NO mutation (admission verdict only)", () => {
    const { verdict, ...rest } = enforceGateFee(validInput());
    expect(verdict.adequate).toBe(true);
    expect(Object.keys(verdict).sort()).toEqual(["adequate", "kind"]);
    expect(Object.keys(rest)).toEqual(["trace"]);
  });

  it("is deterministic", () => {
    expect(enforceGateFee(validInput())).toEqual(enforceGateFee(validInput()));
  });
});

describe("enforceGateFee — gateFeeValidation reasons surfaced", () => {
  it("rejects a hostile fee tx (anchorTx != confirmed txid) → gf-anchor-txid-mismatch", () => {
    const other = buildAnchor([prevoutA, prevoutB], [6_900_000n]); // different outputs → different txid
    const input: GateFeeInput = {
      ...validInput(),
      feeWitness: { anchorTx: other.anchorTx, prevoutTxs: [prevoutA, prevoutB], schedule: SCHEDULE },
    };
    const { verdict } = enforceGateFee(input);
    expect(verdict.adequate).toBe(false);
    if (verdict.adequate) return;
    expect(verdict.reason).toBe("gf-anchor-txid-mismatch");
  });

  it("rejects a hostile committed batch (root != confirmed) → gf-batch-not-bound-to-anchor", () => {
    const b = validInput();
    const input: GateFeeInput = { ...b, committedBatch: { ...b.committedBatch, anchoredRoot: OTHER_ROOT } };
    const { verdict } = enforceGateFee(input);
    expect(verdict.adequate).toBe(false);
    if (verdict.adequate) return;
    expect(verdict.reason).toBe("gf-batch-not-bound-to-anchor");
  });

  it("rejects underpayment (Σ g > paidFee) → gf-underpaid", () => {
    const b = validInput();
    const sched: GateFeeSchedule = { gateOneByteSats: 1_000_000n, gateLongNameFloorSats: 600_000n };
    const input: GateFeeInput = { ...b, feeWitness: { ...b.feeWitness, schedule: sched } };
    const { verdict } = enforceGateFee(input);
    expect(verdict.adequate).toBe(false);
    if (verdict.adequate) return;
    expect(verdict.reason).toBe("gf-underpaid");
  });

  it("#52: Σ g is over the FULL committed set — a droppable 3rd leaf still counts (gf-underpaid)", () => {
    // floor 400_000 × 3 = 1_200_000 > paidFee 1_000_000; dropping the 3rd (× 2 = 800_000) would
    // falsely accept, so the kernel must reject.
    const b = validInput();
    const sched: GateFeeSchedule = { gateOneByteSats: 1_000_000n, gateLongNameFloorSats: 400_000n };
    const committedBatch: CommittedBatchContents = {
      anchoredRoot: ROOT,
      batchSize: 3,
      leaves: [...b.committedBatch.leaves, { leafKeyHex: "11".repeat(32), canonicalNameByteLength: 6 }],
    };
    const input: GateFeeInput = {
      confirmedAnchor: { ...b.confirmedAnchor, batchSize: 3 },
      committedBatch,
      feeWitness: { ...b.feeWitness, schedule: sched },
    };
    const { verdict } = enforceGateFee(input);
    expect(verdict.adequate).toBe(false);
    if (verdict.adequate) return;
    expect(verdict.reason).toBe("gf-underpaid");
  });
});

describe("enforceGateFee — input validation + totality", () => {
  it("rejects a malformed confirmed anchor (missing key) → gf-input-malformed", () => {
    const b = validInput();
    const { anchoredRoot, ...partial } = b.confirmedAnchor;
    void anchoredRoot;
    const input = { ...b, confirmedAnchor: partial } as unknown as GateFeeInput;
    const { verdict } = enforceGateFee(input);
    expect(verdict.adequate).toBe(false);
    if (verdict.adequate) return;
    expect(verdict.reason).toBe("gf-input-malformed");
  });

  it("rejects a non-object confirmed anchor → gf-input-malformed", () => {
    const input = { ...validInput(), confirmedAnchor: 1 } as unknown as GateFeeInput;
    const { verdict } = enforceGateFee(input);
    expect(verdict.adequate).toBe(false);
    if (verdict.adequate) return;
    expect(verdict.reason).toBe("gf-input-malformed");
  });

  it("rejects an extra field on the confirmed anchor (closed-shape, no producer side channel) → gf-input-malformed", () => {
    const b = validInput();
    const input = {
      ...b,
      confirmedAnchor: { ...b.confirmedAnchor, source: "indexer-x", timestamp: 123 },
    } as unknown as GateFeeInput;
    const { verdict } = enforceGateFee(input);
    expect(verdict.adequate).toBe(false);
    if (verdict.adequate) return;
    expect(verdict.reason).toBe("gf-input-malformed");
  });

  it("rejects a malformed anchorTxid / anchoredRoot (non-hex) → gf-input-malformed", () => {
    const b = validInput();
    const badTxid = enforceGateFee({ ...b, confirmedAnchor: { ...b.confirmedAnchor, anchorTxid: "xyz" } });
    const badRoot = enforceGateFee({ ...b, confirmedAnchor: { ...b.confirmedAnchor, anchoredRoot: "nothex" } });
    expect(badTxid.verdict.adequate).toBe(false);
    expect(badRoot.verdict.adequate).toBe(false);
    if (!badTxid.verdict.adequate) expect(badTxid.verdict.reason).toBe("gf-input-malformed");
    if (!badRoot.verdict.adequate) expect(badRoot.verdict.reason).toBe("gf-input-malformed");
  });

  it("rejects a non-u32 minedHeight / batchSize → gf-input-malformed", () => {
    const b = validInput();
    const badHeight = enforceGateFee({ ...b, confirmedAnchor: { ...b.confirmedAnchor, minedHeight: -1 } });
    const badSize = enforceGateFee({ ...b, confirmedAnchor: { ...b.confirmedAnchor, batchSize: 2.5 } });
    expect(badHeight.verdict.adequate).toBe(false);
    expect(badSize.verdict.adequate).toBe(false);
    if (!badHeight.verdict.adequate) expect(badHeight.verdict.reason).toBe("gf-input-malformed");
    if (!badSize.verdict.adequate) expect(badSize.verdict.reason).toBe("gf-input-malformed");
  });

  it("never throws on bogus input", () => {
    expect(() => enforceGateFee(null as unknown as GateFeeInput)).not.toThrow();
    expect(() => enforceGateFee({ confirmedAnchor: 1 } as unknown as GateFeeInput)).not.toThrow();
  });
});
