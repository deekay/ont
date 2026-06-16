// D-BC bond-continuity / release-fact witness red battery (B3 §15). Two stages: (1) evidence —
// verify a confirmed bond-outpoint SPEND fact, recompute-don't-trust (txid binds via legacyTxidOf,
// an input spends the bond outpoint, D-BI-confirmed height); (2) bridge — reduce released spends
// (#79: pre-maturity + no valid successor) into the kernel's BondContinuityWitness.breaks. Stage 3
// (resolveReopen) stays the kernel: latest-release-height + same-height tiebreak (fails closed).
//
// RED PHASE: verifyBondSpendFact / buildBondContinuityWitness are stubbed to reject
// ("bc-pending-green-impl"); every assertion below is therefore red until the green impl lands.
import { describe, expect, it } from "vitest";

import { legacyTxidOf, type LegacyTransaction } from "@ont/bitcoin";
import { resolveReopen } from "@ont/consensus";

import {
  buildBondContinuityWitness,
  verifyBondSpendFact,
  type BondSpendClassification,
  type BondSpendObservation,
} from "./bond-continuity-witness.js";

const BOND_TXID = "bb".repeat(32);
const BOND_VOUT = 2;
const OTHER_TXID = "cc".repeat(32);

// A minimal well-formed tx spending (prevTxid, prevVout); `salt` varies the output so distinct txs
// get distinct txids.
function makeSpendTx(prevTxid: string, prevVout: number, salt: number): LegacyTransaction {
  return {
    version: 1,
    inputs: [{ prevoutTxid: prevTxid, prevoutVout: prevVout, scriptSigHex: "", sequence: 0xffffffff }],
    outputs: [{ valueSats: BigInt(salt + 1) * 1000n, scriptPubKeyHex: "51" }],
    locktime: 0,
  };
}

// An observation whose tx spends the bond outpoint, confirmed at `height`. Txid binds by construction.
function obsSpending(height: number, salt: number): BondSpendObservation {
  const spendTx = makeSpendTx(BOND_TXID, BOND_VOUT, salt);
  return {
    bondOutpoint: { txid: BOND_TXID, vout: BOND_VOUT },
    spendTx,
    inclusion: { txid: legacyTxidOf(spendTx)!, height },
  };
}

// A released classification: pre-maturity spend, no valid same-tx successor (#79 → released).
const releasedClass = (obs: BondSpendObservation): BondSpendClassification => ({
  observation: obs,
  preMaturity: true,
  sameTxValidSuccessorBond: false,
});

describe("D-BC evidence stage — verifyBondSpendFact (confirmed bond-outpoint spend)", () => {
  it("verifies a txid-bound confirmed spend as a spend fact (spendHeight + spendTxid, NOT a break)", () => {
    const obs = obsSpending(800_000, 0);
    expect(verifyBondSpendFact(obs)).toEqual({
      ok: true,
      spendFact: { spendHeight: 800_000, spendTxid: obs.inclusion.txid },
    });
  });

  it("is total on a malformed/null observation — never throws", () => {
    expect(verifyBondSpendFact(null as never)).toEqual({ ok: false, reason: "bc-observation-malformed" });
  });

  it("rejects a txid mismatch (the presented tx is not the confirmed one)", () => {
    const obs = obsSpending(800_000, 0);
    const bad: BondSpendObservation = { ...obs, inclusion: { txid: "12".repeat(32), height: 800_000 } };
    expect(verifyBondSpendFact(bad)).toEqual({ ok: false, reason: "bc-spend-txid-mismatch" });
  });

  it("rejects a malformed spend tx (does not serialize) before the txid comparison", () => {
    const obs = obsSpending(800_000, 0);
    const bad: BondSpendObservation = { ...obs, spendTx: { ...obs.spendTx, version: -1 } };
    expect(verifyBondSpendFact(bad)).toEqual({ ok: false, reason: "bc-spend-tx-malformed" });
  });

  it("rejects a tx that does not spend the bond outpoint (wrong prevout txid)", () => {
    const spendTx = makeSpendTx(OTHER_TXID, BOND_VOUT, 0);
    const obs: BondSpendObservation = {
      bondOutpoint: { txid: BOND_TXID, vout: BOND_VOUT },
      spendTx,
      inclusion: { txid: legacyTxidOf(spendTx)!, height: 800_000 },
    };
    expect(verifyBondSpendFact(obs)).toEqual({ ok: false, reason: "bc-outpoint-not-spent" });
  });

  it("rejects the right txid but wrong vout (a different output of the same prevout tx)", () => {
    const spendTx = makeSpendTx(BOND_TXID, 9, 0); // vout 9 != BOND_VOUT 2
    const obs: BondSpendObservation = {
      bondOutpoint: { txid: BOND_TXID, vout: BOND_VOUT },
      spendTx,
      inclusion: { txid: legacyTxidOf(spendTx)!, height: 800_000 },
    };
    expect(verifyBondSpendFact(obs)).toEqual({ ok: false, reason: "bc-outpoint-not-spent" });
  });

  it("rejects a malformed inclusion height (zero / negative / non-integer)", () => {
    const obs = obsSpending(800_000, 0);
    expect(verifyBondSpendFact({ ...obs, inclusion: { ...obs.inclusion, height: 0 } }).reason).toBe("bc-observation-malformed");
    expect(verifyBondSpendFact({ ...obs, inclusion: { ...obs.inclusion, height: -1 } }).reason).toBe("bc-observation-malformed");
  });

  it("rejects a non-32-byte bond outpoint txid (malformed shape)", () => {
    const obs = obsSpending(800_000, 0);
    expect(verifyBondSpendFact({ ...obs, bondOutpoint: { txid: "bb", vout: BOND_VOUT } }).reason).toBe("bc-observation-malformed");
  });

  it("rejects an extra source/timestamp channel on the observation (closed shape)", () => {
    const obs = obsSpending(800_000, 0);
    expect(verifyBondSpendFact({ ...obs, servedAt: 12_345 } as never).reason).toBe("bc-observation-malformed");
  });

  it("rejects nested-shape faults before any txid check (malformed/missing/extra inclusion, extra bondOutpoint, non-int height)", () => {
    const obs = obsSpending(800_000, 0);
    // malformed inclusion.txid (non-hex)
    expect(verifyBondSpendFact({ ...obs, inclusion: { txid: "gg".repeat(32), height: 800_000 } }).reason).toBe("bc-observation-malformed");
    // missing inclusion entirely
    expect(verifyBondSpendFact({ bondOutpoint: obs.bondOutpoint, spendTx: obs.spendTx } as never).reason).toBe("bc-observation-malformed");
    // extra field on inclusion (closed shape)
    expect(verifyBondSpendFact({ ...obs, inclusion: { ...obs.inclusion, evil: 1 } } as never).reason).toBe("bc-observation-malformed");
    // extra field on bondOutpoint (closed shape)
    expect(verifyBondSpendFact({ ...obs, bondOutpoint: { ...obs.bondOutpoint, evil: 1 } } as never).reason).toBe("bc-observation-malformed");
    // non-integer height
    expect(verifyBondSpendFact({ ...obs, inclusion: { ...obs.inclusion, height: 1.5 } }).reason).toBe("bc-observation-malformed");
  });
});

describe("D-BC bridge stage — buildBondContinuityWitness (#79 reduction)", () => {
  it("reduces a pre-maturity spend with no valid same-tx successor into a release break", () => {
    const built = buildBondContinuityWitness({
      witnessComplete: true,
      spends: [releasedClass(obsSpending(800_000, 0))],
    });
    expect(built).toEqual({ ok: true, witness: { witnessComplete: true, breaks: [{ releaseHeight: 800_000 }] } });
  });

  it("emits no break for a mature spend (no continuity requirement)", () => {
    const built = buildBondContinuityWitness({
      witnessComplete: true,
      spends: [{ observation: obsSpending(800_000, 0), preMaturity: false, sameTxValidSuccessorBond: false }],
    });
    expect(built).toEqual({ ok: true, witness: { witnessComplete: true, breaks: [] } });
  });

  it("emits no break for a pre-maturity spend WITH a valid same-tx successor (rotated, continuous)", () => {
    const built = buildBondContinuityWitness({
      witnessComplete: true,
      spends: [{ observation: obsSpending(800_000, 0), preMaturity: true, sameTxValidSuccessorBond: true }],
    });
    expect(built).toEqual({ ok: true, witness: { witnessComplete: true, breaks: [] } });
  });

  it("fails the whole build closed on a fabricated spend (no on-chain spend of the outpoint)", () => {
    const spendTx = makeSpendTx(OTHER_TXID, BOND_VOUT, 0);
    const fabricated: BondSpendClassification = {
      observation: {
        bondOutpoint: { txid: BOND_TXID, vout: BOND_VOUT },
        spendTx,
        inclusion: { txid: legacyTxidOf(spendTx)!, height: 800_000 },
      },
      preMaturity: true,
      sameTxValidSuccessorBond: false,
    };
    expect(buildBondContinuityWitness({ witnessComplete: true, spends: [fabricated] })).toEqual({
      ok: false,
      reason: "bc-outpoint-not-spent",
    });
  });

  it("is total on a malformed/null build input — never throws", () => {
    expect(buildBondContinuityWitness(null as never)).toEqual({ ok: false, reason: "bc-input-malformed" });
  });

  it("rejects malformed top-level input (wrong-type witnessComplete, non-array spends, extra field) — no truthiness", () => {
    expect(buildBondContinuityWitness({ witnessComplete: "true", spends: [] } as never)).toEqual({ ok: false, reason: "bc-input-malformed" });
    expect(buildBondContinuityWitness({ witnessComplete: true, spends: "x" } as never)).toEqual({ ok: false, reason: "bc-input-malformed" });
    expect(buildBondContinuityWitness({ witnessComplete: true, spends: [], evil: 1 } as never)).toEqual({ ok: false, reason: "bc-input-malformed" });
  });

  it("rejects a malformed classification (non-object, non-boolean flags, extra signer/source field) — no truthiness", () => {
    const obs = obsSpending(800_000, 0);
    expect(buildBondContinuityWitness({ witnessComplete: true, spends: [null] } as never).reason).toBe("bc-classification-malformed");
    expect(buildBondContinuityWitness({ witnessComplete: true, spends: [{ observation: obs, preMaturity: 1, sameTxValidSuccessorBond: false }] } as never).reason).toBe("bc-classification-malformed");
    expect(buildBondContinuityWitness({ witnessComplete: true, spends: [{ observation: obs, preMaturity: true, sameTxValidSuccessorBond: "false" }] } as never).reason).toBe("bc-classification-malformed");
    expect(buildBondContinuityWitness({ witnessComplete: true, spends: [{ observation: obs, preMaturity: true, sameTxValidSuccessorBond: false, signer: "x" }] } as never).reason).toBe("bc-classification-malformed");
  });

  it("rejects the same spend fact presented twice — no manufactured same-height tiebreak", () => {
    const obs = obsSpending(800_000, 0); // same observation ⇒ same spendTxid
    expect(buildBondContinuityWitness({ witnessComplete: true, spends: [releasedClass(obs), releasedClass(obs)] })).toEqual({
      ok: false,
      reason: "bc-duplicate-spend-fact",
    });
  });
});

describe("D-BC reopen composition — the built witness feeds resolveReopen (kernel keeps derivation/tiebreak)", () => {
  it("an incomplete witness makes the kernel fail closed (T22-02)", () => {
    const built = buildBondContinuityWitness({
      witnessComplete: false,
      spends: [releasedClass(obsSpending(800_000, 0))],
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const verdict = resolveReopen({ reopenLot: { kind: "reopen", releaseAnchor: 800_000 }, bondContinuity: built.witness });
    expect(verdict.reason).toBe("reopen-incomplete-bond-continuity-witness");
  });

  it("two released breaks at distinct heights → kernel derives the latest (max)", () => {
    const built = buildBondContinuityWitness({
      witnessComplete: true,
      spends: [releasedClass(obsSpending(800_000, 0)), releasedClass(obsSpending(800_010, 1))],
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const verdict = resolveReopen({ reopenLot: { kind: "reopen", releaseAnchor: 800_010 }, bondContinuity: built.witness });
    expect(verdict.derivedLatestReleaseHeight).toBe(800_010);
  });

  it("two released breaks at the SAME height → kernel fails closed (D-BC surfaces both, picks neither)", () => {
    const built = buildBondContinuityWitness({
      witnessComplete: true,
      spends: [releasedClass(obsSpending(800_000, 0)), releasedClass(obsSpending(800_000, 1))],
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const verdict = resolveReopen({ reopenLot: { kind: "reopen", releaseAnchor: 800_000 }, bondContinuity: built.witness });
    expect(verdict.reason).toBe("reopen-same-height-break-tiebreak-unspecified");
  });
});
