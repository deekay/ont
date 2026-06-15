// Transfer-authority (X*) hardening for the audited engine.
//
// engine.ts was extracted wholesale from the prototype (commit a7821cc) and had
// no test. This is the tests-first hardening of its transfer path against the
// ratified/normative X rows of B2_KERNEL_HARDENING.md, driven through the public
// API (applyBlockTransactions / ...WithProvenance) over real OP_RETURN-encoded
// Transfer events — not white-box calls into applyTransfer.
//
// REQUIRED GREEN GATE (ratified/normative, per ChatLunatique's scope ruling
// event 7c4cd492): X1, X2, X3, X6, X7 (base), X8 (clearly-past-maturity), X9, X10.
//
// PARKED (NOT asserted as ratified here):
//   - X4/X5 state-head linkage + replay immunity + same-head first-wins — needs a
//     named spec PR. prevStateTxid is used only as the input hook that selects the
//     target name; no linkage/replay/ambiguity semantics are claimed ratified.
//   - X12 accumulator-vs-auction predicate identity — downgraded pending the
//     CONFORMANCE F4 / DESIGN §10.13 Q3 reconciling decision.
//   - X13 transfer-clears-pending-recovery — finalizes with Decision #50; the
//     "transfer during recovery_pending" conflict rule is open on DK's docket.
//     Fixtures here carry NO pendingRecovery; the engine's withoutPendingRecovery
//     stripping is not asserted as ratified behavior.
//
// ADVISORY (skipped — documented engine behavior, not enforced CI assertions):
//   - X8 boundary at blockHeight == maturityHeight — the >= vs > comparison is
//     unstated in every doc (X8 attack flag). The engine treats == as mature; we
//     do not assert that as ratified. (candidate)
//   - X11 "transfer only affects owned names" — authority RATIFIED (PR-36, #66).
//     The conformance binding is the X11-neg-01 vector (pending-predicate until the
//     transfer-authority surface lands); this block stays skipped as advisory doc.
//
// X2 TIER (DECISIONS #60/#61, ChatLunatique-ruled): the engine verifies the B1 §5
// owner-key signature via @ont/wire (verifySchnorr over transferAuthDigest) in a local
// fail-closed wrapper — the all-auth-digests-ride-wire migration landed as #61 (engine.ts
// gets a per-file @ont/wire allowance in CORE_DECIDERS). The equivalence pin below is the
// standing guard: it fails the build if the @ont/protocol transfer digest ever drifts from
// the B1 @ont/wire §5 normative transferAuthDigest.

import { describe, expect, it } from "vitest";

import {
  type TransferAuthorizationFields,
  type TransferEventPayload,
  bytesToHex,
  computeTransferAuthorizationHash,
  createTransferPayload,
  deriveOwnerPubkey,
  encodeTransferPayload,
  signRecoverOwnerCancelAuthorization,
  signTransferAuthorization,
} from "@ont/protocol";
import type {
  BitcoinTransactionInBlock,
  BitcoinTransactionInput,
  BitcoinTransactionOutput,
} from "@ont/bitcoin";
import { transferAuthDigest } from "@ont/wire";

import {
  applyBlockTransactionsWithProvenance,
  createEmptyState,
  type NameRecord,
  type OntState,
} from "./engine.js";

// ---------------------------------------------------------------------------
// Keys (deterministic; valid secp256k1 scalars). deriveOwnerPubkey returns the
// 32-byte x-only pubkey the §5 transfer digest verifies against.
// ---------------------------------------------------------------------------
const OWNER_PRIV = "01".repeat(32);
const OWNER_PUB = deriveOwnerPubkey(OWNER_PRIV);
const NEW_OWNER_PRIV = "02".repeat(32);
const NEW_OWNER_PUB = deriveOwnerPubkey(NEW_OWNER_PRIV);
const STRANGER_PRIV = "03".repeat(32);

const OLD_BOND_TXID = "cc".repeat(32);
const OLD_BOND_VOUT = 0;
const OLD_HEAD_TXID = "dd".repeat(32);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function seedOwnedName(state: OntState, overrides: Partial<NameRecord> & { name: string }): NameRecord {
  const record: NameRecord = {
    status: "immature",
    currentOwnerPubkey: OWNER_PUB,
    claimCommitTxid: "a1".repeat(32),
    claimRevealTxid: "b1".repeat(32),
    claimHeight: 100,
    maturityHeight: 1000,
    requiredBondSats: 50_000n,
    currentBondTxid: OLD_BOND_TXID,
    currentBondVout: OLD_BOND_VOUT,
    currentBondValueSats: 50_000n,
    lastStateTxid: OLD_HEAD_TXID,
    lastStateHeight: 100,
    winningCommitBlockHeight: 100,
    winningCommitTxIndex: 0,
    ...overrides,
  };
  state.names.set(record.name, record);
  return record;
}

function opReturn(payload: TransferEventPayload): BitcoinTransactionOutput {
  return { valueSats: 0n, scriptType: "op_return", dataHex: bytesToHex(encodeTransferPayload(payload)) };
}

function payment(valueSats: bigint): BitcoinTransactionOutput {
  return { valueSats, scriptType: "payment" };
}

function bondInput(txid: string, vout: number): BitcoinTransactionInput {
  return { txid, vout, coinbase: false };
}

// A signed Transfer over the exact carried fields. Caller chooses the signing key
// so negatives can sign with the wrong key without touching the carried fields.
function signedTransfer(
  fields: TransferAuthorizationFields,
  signerPrivateKeyHex: string,
): TransferEventPayload {
  const signature = signTransferAuthorization({ ...fields, ownerPrivateKeyHex: signerPrivateKeyHex });
  return createTransferPayload({ ...fields, signature });
}

function block(input: {
  txid: string;
  blockHeight: number;
  txIndex?: number;
  payload: TransferEventPayload;
  inputs?: readonly BitcoinTransactionInput[];
  // outputs[0] is always the OP_RETURN; extra outputs follow at index 1, 2, ...
  extraOutputs?: readonly BitcoinTransactionOutput[];
}): BitcoinTransactionInBlock {
  return {
    tx: {
      txid: input.txid,
      inputs: input.inputs ?? [],
      outputs: [opReturn(input.payload), ...(input.extraOutputs ?? [])],
    },
    blockHeight: input.blockHeight,
    txIndex: input.txIndex ?? 0,
  };
}

function apply(state: OntState, tx: BitcoinTransactionInBlock) {
  // launchHeight is unused by the engine (_launchHeight); pass 0.
  const provenance = applyBlockTransactionsWithProvenance(state, [tx], 0);
  const events = provenance.flatMap((record) => record.events);
  return { provenance, events };
}

// ===========================================================================
// X2 — §5 transfer-digest equivalence pin (the tier justification)
// ===========================================================================
describe("X2 §5 transfer-digest equivalence pin (@ont/protocol decider ⟷ @ont/wire §5)", () => {
  const battery: ReadonlyArray<{ label: string; fields: TransferAuthorizationFields }> = [
    { label: "zeroes", fields: { prevStateTxid: "00".repeat(32), newOwnerPubkey: "00".repeat(32), flags: 0, successorBondVout: 0 } },
    { label: "max flags/vout", fields: { prevStateTxid: "ff".repeat(32), newOwnerPubkey: "ff".repeat(32), flags: 255, successorBondVout: 255 } },
    { label: "mixed/asymmetric", fields: { prevStateTxid: "ab".repeat(32), newOwnerPubkey: "cd".repeat(32), flags: 1, successorBondVout: 7 } },
    { label: "real owner key", fields: { prevStateTxid: OLD_HEAD_TXID, newOwnerPubkey: NEW_OWNER_PUB, flags: 0, successorBondVout: 1 } },
    { label: "high flags, low vout", fields: { prevStateTxid: "12".repeat(32), newOwnerPubkey: "34".repeat(32), flags: 200, successorBondVout: 2 } },
  ];

  for (const { label, fields } of battery) {
    it(`@ont/protocol computeTransferAuthorizationHash === @ont/wire bytesToHex(transferAuthDigest) — ${label}`, () => {
      expect(computeTransferAuthorizationHash(fields)).toBe(bytesToHex(transferAuthDigest(fields)));
    });
  }
});

// ===========================================================================
// X2 — owner-key authorization
// ===========================================================================
describe("X2 — only the current owner key authorizes a transfer", () => {
  const fields: TransferAuthorizationFields = {
    prevStateTxid: OLD_HEAD_TXID,
    newOwnerPubkey: NEW_OWNER_PUB,
    flags: 0,
    successorBondVout: 1,
  };

  it("(+) a transfer signed by the current owner over the carried fields applies (mature path)", () => {
    const state = createEmptyState();
    seedOwnedName(state, { name: "alice", maturityHeight: 1000 });
    const { events } = apply(state, block({
      txid: "10".repeat(32),
      blockHeight: 2000, // clearly past maturity → no bond conjuncts (X8)
      payload: signedTransfer(fields, OWNER_PRIV),
    }));
    expect(events[0]?.validationStatus).toBe("applied");
    expect(state.names.get("alice")?.currentOwnerPubkey).toBe(NEW_OWNER_PUB);
  });

  it("(−) signature by a random key over the same digest: no ownership change", () => {
    const state = createEmptyState();
    seedOwnedName(state, { name: "alice", maturityHeight: 1000 });
    const { events } = apply(state, block({
      txid: "11".repeat(32),
      blockHeight: 2000,
      payload: signedTransfer(fields, STRANGER_PRIV),
    }));
    expect(events[0]?.validationStatus).toBe("ignored");
    expect(events[0]?.reason).toBe("transfer_invalid_signature");
    expect(state.names.get("alice")?.currentOwnerPubkey).toBe(OWNER_PUB);
  });

  it("(−) signature by the incoming newOwnerPubkey (recipient self-authorization): no change", () => {
    const state = createEmptyState();
    seedOwnedName(state, { name: "alice", maturityHeight: 1000 });
    const { events } = apply(state, block({
      txid: "12".repeat(32),
      blockHeight: 2000,
      payload: signedTransfer(fields, NEW_OWNER_PRIV),
    }));
    expect(events[0]?.validationStatus).toBe("ignored");
    expect(state.names.get("alice")?.currentOwnerPubkey).toBe(OWNER_PUB);
  });

  it("(−) owner signature over different field values than carried (mismatched newOwnerPubkey): no change", () => {
    const state = createEmptyState();
    seedOwnedName(state, { name: "alice", maturityHeight: 1000 });
    // Sign over OWNER_PUB as the new owner, but carry NEW_OWNER_PUB.
    const signature = signTransferAuthorization({ ...fields, newOwnerPubkey: OWNER_PUB, ownerPrivateKeyHex: OWNER_PRIV });
    const tampered = createTransferPayload({ ...fields, signature }); // carries NEW_OWNER_PUB
    const { events } = apply(state, block({ txid: "13".repeat(32), blockHeight: 2000, payload: tampered }));
    expect(events[0]?.validationStatus).toBe("ignored");
    expect(state.names.get("alice")?.currentOwnerPubkey).toBe(OWNER_PUB);
  });

  it("(−) cross-context: a valid ont-recover-owner-domain signature presented as a transfer signature authorizes nothing", () => {
    const state = createEmptyState();
    seedOwnedName(state, { name: "alice", maturityHeight: 1000 });
    // Owner signs over the recover-owner digest (extra fields → different domain).
    const recoverSig = signRecoverOwnerCancelAuthorization({
      prevStateTxid: fields.prevStateTxid,
      newOwnerPubkey: fields.newOwnerPubkey,
      flags: fields.flags,
      successorBondVout: fields.successorBondVout,
      challengeWindowBlocks: 144,
      recoveryDescriptorHash: "ee".repeat(32),
      ownerPrivateKeyHex: OWNER_PRIV,
    });
    const payload = createTransferPayload({ ...fields, signature: recoverSig });
    const { events } = apply(state, block({ txid: "14".repeat(32), blockHeight: 2000, payload }));
    expect(events[0]?.validationStatus).toBe("ignored");
    expect(events[0]?.reason).toBe("transfer_invalid_signature");
    expect(state.names.get("alice")?.currentOwnerPubkey).toBe(OWNER_PUB);
  });
});

// ===========================================================================
// X1 — ownership state changes only through on-chain ONT events
// ===========================================================================
describe("X1 — non-event bytes change no ownership", () => {
  it("a transaction whose OP_RETURN is not a decodable ONT event changes nothing", () => {
    const state = createEmptyState();
    const before = { ...seedOwnedName(state, { name: "alice" }) };
    const garbage: BitcoinTransactionInBlock = {
      tx: { txid: "20".repeat(32), inputs: [], outputs: [{ valueSats: 0n, scriptType: "op_return", dataHex: "deadbeef" }] },
      blockHeight: 2000,
      txIndex: 0,
    };
    const { events } = apply(state, garbage);
    expect(events).toHaveLength(0); // undecodable → never reaches the kernel
    expect(state.names.get("alice")).toEqual(before);
  });
});

// ===========================================================================
// X3 — fail closed, no partial effects, never throw on adversarial bytes
// ===========================================================================
describe("X3 — failed conjuncts mutate nothing; adversarial signatures yield false, not a throw", () => {
  const fields: TransferAuthorizationFields = {
    prevStateTxid: OLD_HEAD_TXID, newOwnerPubkey: NEW_OWNER_PUB, flags: 0, successorBondVout: 1,
  };

  it("(−) shape-valid but cryptographically invalid signature: ignored, state byte-identical, no throw", () => {
    const state = createEmptyState();
    const before = { ...seedOwnedName(state, { name: "alice", maturityHeight: 1000 }) };
    // 64-byte all-zero signature — shape-valid (the parser would accept the bytes),
    // not a valid Schnorr signature. The local verifyTransferSignature wrapper (#61)
    // catches internally and returns false (never aborts; verifySchnorr does not catch).
    const payload = createTransferPayload({ ...fields, signature: "00".repeat(64) });
    expect(() => apply(state, block({ txid: "30".repeat(32), blockHeight: 2000, payload }))).not.toThrow();
    expect(state.names.get("alice")).toEqual(before);
  });

  it("(−) all-FF signature (not a valid curve point/scalar): ignored, no throw", () => {
    const state = createEmptyState();
    const before = { ...seedOwnedName(state, { name: "alice", maturityHeight: 1000 }) };
    const payload = createTransferPayload({ ...fields, signature: "ff".repeat(64) });
    let events: ReturnType<typeof apply>["events"] = [];
    expect(() => { events = apply(state, block({ txid: "31".repeat(32), blockHeight: 2000, payload })).events; }).not.toThrow();
    expect(events[0]?.validationStatus).toBe("ignored");
    expect(state.names.get("alice")).toEqual(before);
  });

  it("(−) unknown head (prevStateTxid matches no name): no state change anywhere", () => {
    const state = createEmptyState();
    const before = { ...seedOwnedName(state, { name: "alice", maturityHeight: 1000 }) };
    const unknown: TransferAuthorizationFields = { ...fields, prevStateTxid: "99".repeat(32) };
    const { events } = apply(state, block({ txid: "32".repeat(32), blockHeight: 2000, payload: signedTransfer(unknown, OWNER_PRIV) }));
    expect(events[0]?.reason).toBe("transfer_name_not_found_or_invalid");
    expect(state.names.get("alice")).toEqual(before);
  });
});

// ===========================================================================
// X6 — pre-maturity bond continuity (spend current bond + adequate successor)
// ===========================================================================
describe("X6 — pre-maturity transfer requires a bond spend and an adequate successor bond", () => {
  const fields: TransferAuthorizationFields = {
    prevStateTxid: OLD_HEAD_TXID, newOwnerPubkey: NEW_OWNER_PUB, flags: 0, successorBondVout: 1,
  };
  const TXID = "40".repeat(32);

  it("(+) spending the current bond and creating an adequate successor applies; continuity stays intact", () => {
    const state = createEmptyState();
    seedOwnedName(state, { name: "alice", maturityHeight: 1000, requiredBondSats: 50_000n });
    const { events } = apply(state, block({
      txid: TXID,
      blockHeight: 500, // immature (500 < 1000)
      payload: signedTransfer(fields, OWNER_PRIV),
      inputs: [bondInput(OLD_BOND_TXID, OLD_BOND_VOUT)],
      extraOutputs: [payment(50_000n)], // successor at vout 1
    }));
    expect(events[0]?.validationStatus).toBe("applied");
    expect(events[0]?.reason).toBe("transfer_applied_immature");
    const after = state.names.get("alice");
    expect(after?.status).toBe("immature");
    expect(after?.currentOwnerPubkey).toBe(NEW_OWNER_PUB);
    expect(after?.currentBondTxid).toBe(TXID);
    expect(after?.currentBondVout).toBe(1);
    expect(after?.currentBondValueSats).toBe(50_000n);
    expect(after?.maturityHeight).toBe(1000); // X9: anchor unchanged
  });

  it("(−) carrying transaction does not spend the current bond outpoint: no state change", () => {
    const state = createEmptyState();
    const before = { ...seedOwnedName(state, { name: "alice", maturityHeight: 1000 }) };
    const { events } = apply(state, block({
      txid: "41".repeat(32),
      blockHeight: 500,
      payload: signedTransfer(fields, OWNER_PRIV),
      inputs: [bondInput("7e".repeat(32), 9)], // spends some unrelated outpoint
      extraOutputs: [payment(50_000n)],
    }));
    expect(events[0]?.reason).toBe("transfer_missing_bond_spend");
    expect(state.names.get("alice")).toEqual(before); // not even invalidated — bond untouched
  });

  it("(−) successor output one sat below the required bond amount: transfer rejected (and #5 broken-continuity invalidates the name)", () => {
    const state = createEmptyState();
    seedOwnedName(state, { name: "alice", maturityHeight: 1000, requiredBondSats: 50_000n });
    const { events } = apply(state, block({
      txid: "42".repeat(32),
      blockHeight: 500,
      payload: signedTransfer(fields, OWNER_PRIV),
      inputs: [bondInput(OLD_BOND_TXID, OLD_BOND_VOUT)],
      extraOutputs: [payment(49_999n)], // 1 sat short
    }));
    // X6: the transfer does NOT move ownership.
    expect(events[0]?.validationStatus).toBe("ignored");
    expect(events[0]?.reason).toBe("transfer_invalid_successor_bond");
    expect(state.names.get("alice")?.currentOwnerPubkey).toBe(OWNER_PUB);
    // #5 continuity: an immature bond spent without a valid successor invalidates
    // the name. (Distinct from X6; flagged for review as a related-rule observation.)
    expect(state.names.get("alice")?.status).toBe("invalid");
  });

  it("(−) successorBondVout indexes a nonexistent output: transfer rejected", () => {
    const state = createEmptyState();
    seedOwnedName(state, { name: "alice", maturityHeight: 1000, requiredBondSats: 50_000n });
    const oob: TransferAuthorizationFields = { ...fields, successorBondVout: 9 }; // no output at index 9
    const { events } = apply(state, block({
      txid: "43".repeat(32),
      blockHeight: 500,
      payload: signedTransfer(oob, OWNER_PRIV),
      inputs: [bondInput(OLD_BOND_TXID, OLD_BOND_VOUT)],
      extraOutputs: [payment(50_000n)],
    }));
    expect(events[0]?.validationStatus).toBe("ignored");
    expect(events[0]?.reason).toBe("transfer_invalid_successor_bond");
    expect(state.names.get("alice")?.currentOwnerPubkey).toBe(OWNER_PUB);
    // #5 continuity: the immature bond was spent without a valid successor taking
    // effect → the name is invalidated (same interaction as the one-sat-short case).
    expect(state.names.get("alice")?.status).toBe("invalid");
  });
});

// ===========================================================================
// X7 (base) — no two live names may reference the same bond outpoint
// (same-transaction contention/order is PARKED)
// ===========================================================================
describe("X7 (base) — successor outpoint already reserved by another live name's bond is rejected", () => {
  it("(−) transfer naming a successor outpoint already serving another live name's bond: rejected", () => {
    const state = createEmptyState();
    const TXID = "50".repeat(32);
    seedOwnedName(state, { name: "alice", maturityHeight: 1000, requiredBondSats: 50_000n });
    // bob already references (TXID, 1) as its live bond outpoint.
    seedOwnedName(state, {
      name: "bob",
      lastStateTxid: "be".repeat(32),
      currentBondTxid: TXID,
      currentBondVout: 1,
      maturityHeight: 1000,
    });
    const fields: TransferAuthorizationFields = {
      prevStateTxid: OLD_HEAD_TXID, newOwnerPubkey: NEW_OWNER_PUB, flags: 0, successorBondVout: 1,
    };
    const { events } = apply(state, block({
      txid: TXID,
      blockHeight: 500,
      payload: signedTransfer(fields, OWNER_PRIV),
      inputs: [bondInput(OLD_BOND_TXID, OLD_BOND_VOUT)],
      extraOutputs: [payment(50_000n)],
    }));
    expect(events[0]?.validationStatus).toBe("ignored");
    expect(events[0]?.reason).toBe("transfer_successor_bond_conflict");
    expect(state.names.get("alice")?.currentOwnerPubkey).toBe(OWNER_PUB); // X7 held: ownership unchanged
    // #5 continuity: alice's immature bond was spent but no successor took effect
    // (the outpoint was reserved) → alice is invalidated, same interaction as X6.
    expect(state.names.get("alice")?.status).toBe("invalid");
    expect(state.names.get("bob")?.currentBondTxid).toBe(TXID); // bob's reservation untouched
    expect(state.names.get("bob")?.status).not.toBe("invalid"); // bob's bond was not spent
  });
});

// ===========================================================================
// X8 — at/after maturity, no bond conjuncts; the successorBondVout byte is dead
// ===========================================================================
describe("X8 — mature transfer requires no bond spend or successor bond", () => {
  it("(+) clearly-mature transfer with no bond inputs/outputs applies; bond fields untouched", () => {
    const state = createEmptyState();
    seedOwnedName(state, { name: "alice", maturityHeight: 1000 });
    const fields: TransferAuthorizationFields = {
      prevStateTxid: OLD_HEAD_TXID, newOwnerPubkey: NEW_OWNER_PUB, flags: 0, successorBondVout: 0,
    };
    const TXID = "60".repeat(32);
    const { events } = apply(state, block({ txid: TXID, blockHeight: 2000, payload: signedTransfer(fields, OWNER_PRIV) }));
    expect(events[0]?.validationStatus).toBe("applied");
    expect(events[0]?.reason).toBe("transfer_applied_mature");
    const after = state.names.get("alice");
    expect(after?.currentOwnerPubkey).toBe(NEW_OWNER_PUB);
    expect(after?.lastStateTxid).toBe(TXID); // head advanced to the carrying tx
    expect(after?.currentBondTxid).toBe(OLD_BOND_TXID); // bond fields untouched on the mature path
    expect(after?.currentBondVout).toBe(OLD_BOND_VOUT);
  });

  it("(−) immature transfer (blockHeight < maturityHeight) without a bond spend: rejected", () => {
    const state = createEmptyState();
    const before = { ...seedOwnedName(state, { name: "alice", maturityHeight: 1000 }) };
    const fields: TransferAuthorizationFields = {
      prevStateTxid: OLD_HEAD_TXID, newOwnerPubkey: NEW_OWNER_PUB, flags: 0, successorBondVout: 1,
    };
    const { events } = apply(state, block({ txid: "61".repeat(32), blockHeight: 999, payload: signedTransfer(fields, OWNER_PRIV) }));
    expect(events[0]?.reason).toBe("transfer_missing_bond_spend");
    expect(state.names.get("alice")).toEqual(before);
  });

  // ADVISORY / PARKED: the >= vs > boundary at blockHeight == maturityHeight is
  // unstated in every doc (X8 attack flag). The engine treats == as mature. Not
  // asserted as ratified — pending the spec sentence that pins the comparison.
  it.skip("blockHeight == maturityHeight is mature (engine behavior; boundary spec-unstated — X8 attack flag)", () => {
    // intentionally skipped — do not assert an unspecified boundary as ratified law
  });
});

// ===========================================================================
// X9 — transfers never move the maturity anchor
// ===========================================================================
describe("X9 — a transfer does not reset the maturity clock", () => {
  it("(+) a chain of two pre-maturity transfers leaves maturityHeight unchanged", () => {
    const state = createEmptyState();
    seedOwnedName(state, { name: "alice", maturityHeight: 1000, requiredBondSats: 50_000n });

    const TXID1 = "70".repeat(32);
    const fields1: TransferAuthorizationFields = {
      prevStateTxid: OLD_HEAD_TXID, newOwnerPubkey: NEW_OWNER_PUB, flags: 0, successorBondVout: 1,
    };
    apply(state, block({
      txid: TXID1, blockHeight: 400, payload: signedTransfer(fields1, OWNER_PRIV),
      inputs: [bondInput(OLD_BOND_TXID, OLD_BOND_VOUT)], extraOutputs: [payment(50_000n)],
    }));
    expect(state.names.get("alice")?.maturityHeight).toBe(1000);

    // Second transfer by the new owner against the advanced head (TXID1).
    const TXID2 = "71".repeat(32);
    const fields2: TransferAuthorizationFields = {
      prevStateTxid: TXID1, newOwnerPubkey: OWNER_PUB, flags: 0, successorBondVout: 1,
    };
    apply(state, block({
      txid: TXID2, blockHeight: 800, payload: signedTransfer(fields2, NEW_OWNER_PRIV),
      inputs: [bondInput(TXID1, 1)], extraOutputs: [payment(50_000n)],
    }));
    const after = state.names.get("alice");
    expect(after?.currentOwnerPubkey).toBe(OWNER_PUB);
    expect(after?.maturityHeight).toBe(1000); // still the original anchor after two transfers
  });
});

// ===========================================================================
// X10 — the transfer verdict ignores payment/commercial terms
// ===========================================================================
describe("X10 — transfer acceptance does not depend on payment outputs", () => {
  const fields: TransferAuthorizationFields = {
    prevStateTxid: OLD_HEAD_TXID, newOwnerPubkey: NEW_OWNER_PUB, flags: 0, successorBondVout: 0,
  };

  it("(+) a mature transfer paying the seller nothing still applies", () => {
    const state = createEmptyState();
    seedOwnedName(state, { name: "alice", maturityHeight: 1000 });
    const { events } = apply(state, block({ txid: "80".repeat(32), blockHeight: 2000, payload: signedTransfer(fields, OWNER_PRIV) }));
    expect(events[0]?.validationStatus).toBe("applied");
    expect(state.names.get("alice")?.currentOwnerPubkey).toBe(NEW_OWNER_PUB);
  });

  it("(+) two mature transfers identical except for non-bond payment outputs yield identical verdicts", () => {
    const run = (extraOutputs: readonly BitcoinTransactionOutput[]) => {
      const state = createEmptyState();
      seedOwnedName(state, { name: "alice", maturityHeight: 1000 });
      const { events } = apply(state, block({ txid: "81".repeat(32), blockHeight: 2000, payload: signedTransfer(fields, OWNER_PRIV), extraOutputs }));
      return { status: events[0]?.validationStatus, owner: state.names.get("alice")?.currentOwnerPubkey };
    };
    const noPayment = run([]);
    const bigPayment = run([payment(123_456_789n), payment(7n)]);
    expect(noPayment).toEqual(bigPayment);
    expect(noPayment.status).toBe("applied");
  });
});

// ===========================================================================
// X11 — transfer only affects owned names. Authority RATIFIED (PR-36, #66); the
// conformance binding is the X11-neg-01 vector in the executable suite
// (pending-predicate until the transfer-authority surface lands).
// ===========================================================================
// describe.skip: advisory engine-behavior doc, NOT the conformance binding —
// stays skipped so it does not freeze the transfer_name_not_found_or_invalid
// reason string as required law ahead of the X11-neg-01 vector binding.
describe.skip("X11 (advisory engine-behavior doc — authority ratified, binding is the X11-neg-01 vector)", () => {
  it("a transfer referencing the head of a name invalidated by broken bond continuity does not move it", () => {
    const state = createEmptyState();
    seedOwnedName(state, { name: "alice", status: "invalid", maturityHeight: 1000 });
    const fields: TransferAuthorizationFields = {
      prevStateTxid: OLD_HEAD_TXID, newOwnerPubkey: NEW_OWNER_PUB, flags: 0, successorBondVout: 0,
    };
    const { events } = apply(state, block({ txid: "90".repeat(32), blockHeight: 2000, payload: signedTransfer(fields, OWNER_PRIV) }));
    expect(events[0]?.reason).toBe("transfer_name_not_found_or_invalid");
    expect(state.names.get("alice")?.currentOwnerPubkey).toBe(OWNER_PUB);
  });
});
