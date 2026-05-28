import { parseFundingInputDescriptor } from "@ont/architect";
import { describe, expect, it } from "vitest";

import type { ResolverNameRecord } from "./resolver.js";
import { transferBondPlanFromRecord, TransferPlanError } from "./transfer-plan.js";

const RECORD: ResolverNameRecord = {
  name: "satoshi",
  status: "mature",
  currentOwnerPubkey: "ab".repeat(32),
  lastStateTxid: "cd".repeat(32),
  maturityHeight: 100,
  requiredBondSats: "5000",
  currentBondTxid: "ef".repeat(32),
  currentBondVout: 0,
  currentBondValueSats: "10000"
};

describe("transferBondPlanFromRecord", () => {
  it("derives prev-state, bond input, and successor bond from the record", () => {
    const plan = transferBondPlanFromRecord(RECORD, { bondInputAddress: "bcrt1qfunding" });
    expect(plan.prevStateTxid).toBe("cd".repeat(32));
    expect(plan.bondInput).toEqual({
      txid: "ef".repeat(32),
      vout: 0,
      valueSats: 10000n,
      address: "bcrt1qfunding"
    });
    expect(plan.successorBondSats).toBe(10000n); // reuses the current bond value
  });

  it("falls back to requiredBondSats when the bond value is absent", () => {
    // Drop the bond value (omit it, don't set it to undefined) and supply an
    // explicit bond input so the plan can still be built.
    const { currentBondValueSats: _omit, ...withoutValue } = RECORD;
    const plan = transferBondPlanFromRecord(withoutValue, {
      bondInputAddress: "x",
      explicitBondInput: parseFundingInputDescriptor(`${"11".repeat(32)}:0:9000:bcrt1qx`)
    });
    expect(plan.successorBondSats).toBe(5000n);
  });

  it("lets explicit overrides win", () => {
    const plan = transferBondPlanFromRecord(RECORD, {
      bondInputAddress: "bcrt1qfunding",
      explicitPrevStateTxid: "99".repeat(32),
      explicitBondInput: parseFundingInputDescriptor(`${"22".repeat(32)}:1:20000:bcrt1qother`),
      explicitSuccessorBondSats: 7000n
    });
    expect(plan.prevStateTxid).toBe("99".repeat(32));
    expect(plan.bondInput.vout).toBe(1);
    expect(plan.bondInput.valueSats).toBe(20000n);
    expect(plan.successorBondSats).toBe(7000n);
  });

  it("throws when the record has no bond outpoint and none is supplied", () => {
    const { currentBondTxid: _t, currentBondVout: _v, currentBondValueSats: _val, ...withoutBond } = RECORD;
    expect(() => transferBondPlanFromRecord(withoutBond, { bondInputAddress: "x" })).toThrow(TransferPlanError);
  });
});
