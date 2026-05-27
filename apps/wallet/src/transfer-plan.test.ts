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
    const { currentBondValueSats: _omit, ...withoutValue } = RECORD;
    // keep the outpoint so it doesn't throw, but drop the value
    const record = { ...withoutValue, currentBondValueSats: undefined } as ResolverNameRecord;
    // provide an explicit bond input since the value is needed to build one
    const plan = transferBondPlanFromRecord(record, {
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
    const record = {
      ...RECORD,
      currentBondTxid: undefined,
      currentBondVout: undefined,
      currentBondValueSats: undefined
    } as ResolverNameRecord;
    expect(() => transferBondPlanFromRecord(record, { bondInputAddress: "x" })).toThrow(TransferPlanError);
  });
});
