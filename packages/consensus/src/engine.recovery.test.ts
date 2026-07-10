// Recovery-authority (R*) hardening for the audited engine — CANCEL path only.
//
// engine.ts was extracted wholesale from the prototype (commit a7821cc). This is
// the tests-first hardening of its recovery CANCEL path, driven through the public
// API (applyBlockTransactionsWithProvenance) over real OP_RETURN-encoded
// RecoverOwner (CANCEL-flagged) events. (Two test files for one module mirrors
// proof-bundle.test.ts + proof-bundle.soundness-gaps.test.ts.)
//
// REQUIRED GREEN GATE (cited, ChatLunatique-ruled events 6fe4bb96 → 38acccbc):
//   - R15: the current owner key is the defined cancel signer, plus the §5
//     ont-recover-owner cancel-digest equivalence pin.
//   - R17: a valid cancel is abort-only.
//   - R19: the cancel branch is a pure predicate (never consults the invoke
//     availability callback).
//
// INVOKE PATH — now hardened to #50-b1 (engine B, this file's "recovery invoke" section
// below): `applyRecoverOwnerRequest` no longer gates on a `recoveryWalletProofAvailable`
// callback or a proof-commitment-in-sig-slot. It assembles the four `acceptRecoverOwner`
// inputs from the event + witnessed descriptor evidence (data-only options) and admits only
// on an accepted verdict (§3c evidence-gated admission). It also enforces the PR-34
// successor-bond-address binding, the PR-35 exact-height CANCEL/finalize boundary, and the
// X13 transfer-block. The R15/R17 CANCEL tests below still SEED pendingRecovery directly (the
// cancel predicate is pure over (cancel digest, prior state)); the invoke tests drive a full
// admit through the public API.
//
// PARKED — explicitly OUT of the ratified gate:
//   - R16 binding/timeliness (prevStateTxid=request-txid overloading, the
//     field-equality set, the strict-before-deadline boundary): used here only as
//     the fixture mechanics needed to reach a valid cancel; NOT asserted as ratified.
//   - R14 (invoke) remains future spec work.
//   - The CANCEL flag bit (RECOVER_OWNER_FLAG_CANCEL = 0x01) is code-only — normative
//     WIRE §4.2 flags(1) has no bit registry. Used here ONLY as the legacy fixture
//     selector to reach the cancel branch; NOT asserted as ratified wire law, and no
//     standalone bit-registry conformance.
//
// #40 CARVE-OUT (R15): owner-key cancel is the DEFINED veto signer today (invoke
// spec + WIRE §5) UNTIL Decision #40's delegable, non-custodial, abort-only watcher
// credential is specified. The non-owner-signer negatives below assert only that
// under the CURRENT defined signer those keys do not cancel — NOT that "any other
// signer is forever rejected" (that clause relaxes by named amendment when the
// watcher credential lands).

import { describe, expect, it } from "vitest";

import {
  type RecoverOwnerAuthorizationFields,
  RECOVER_OWNER_FLAG_CANCEL,
  bytesToHex,
  computeRecoverOwnerAuthorizationHash,
  deriveOwnerPubkey,
  signRecoverOwnerCancelAuthorization,
  signTransferAuthorization,
} from "@ont/protocol";
import type { BitcoinTransactionInBlock } from "@ont/bitcoin";
import { schnorr } from "@noble/curves/secp256k1.js";
import {
  EventType,
  RECOVERY_DESCRIPTOR_FORMAT,
  RECOVERY_DESCRIPTOR_VERSION_V2,
  encodeEvent,
  hexToBytes,
  recoverAuthDigest,
  recoveryDescriptorDigest,
  type RecoverOwnerEvent,
  type TransferEvent,
} from "@ont/wire";

import {
  applyBlockTransactionsWithProvenance,
  createEmptyState,
  refreshDerivedState,
  type BondBackedNameRecord,
  type NameRecord,
  type OntEventApplicationOptions,
  type OntState,
  type ResolvedRecoveryDescriptorState,
} from "./engine.js";

// ---------------------------------------------------------------------------
// Keys + fixture constants (deterministic; valid secp256k1 scalars).
// ---------------------------------------------------------------------------
const OWNER_PRIV = "01".repeat(32);
const OWNER_PUB = deriveOwnerPubkey(OWNER_PRIV); // the pre-request owner / veto key
const PROPOSED_PRIV = "02".repeat(32);
const PROPOSED_PUB = deriveOwnerPubkey(PROPOSED_PRIV); // recovery wallet / proposed new owner
const STRANGER_PRIV = "03".repeat(32);

const PRE_INVOKE_HEAD = "dd".repeat(32);
const REQUEST_TXID = "a0".repeat(32); // the pending request's txid (cancel binds here — R16, fixture only)
const DESC_HASH = "d1".repeat(32);
const CHALLENGE_WINDOW = 144;
const REQUEST_HEIGHT = 500;
const FINALIZE_HEIGHT = REQUEST_HEIGHT + CHALLENGE_WINDOW; // 644

// Seed a name that already holds a pendingRecovery — the cancel predicate is a pure
// function of (event, prior state), so the pending state is an INPUT, exactly as the
// X-transfer tests seeded owned names. This deliberately avoids the parked legacy
// invoke path.
function seedNameWithPendingRecovery(
  state: OntState,
  overrides: Partial<BondBackedNameRecord> = {}
): BondBackedNameRecord {
  const record: BondBackedNameRecord = {
    name: "alice",
    status: "immature",
    currentOwnerPubkey: OWNER_PUB,
    acquisitionKind: "bonded",
    claimCommitTxid: "a1".repeat(32),
    claimRevealTxid: "b1".repeat(32),
    claimHeight: 100,
    maturityHeight: 1000,
    requiredBondSats: 50_000n,
    currentBondTxid: REQUEST_TXID, // bond rotated to the request at invoke time (realistic post-invoke)
    currentBondVout: 0,
    currentBondValueSats: 50_000n,
    lastStateTxid: PRE_INVOKE_HEAD, // invoke does not advance the head; cancel-head bookkeeping is parked
    lastStateHeight: REQUEST_HEIGHT,
    winningCommitBlockHeight: 100,
    winningCommitTxIndex: 0,
    pendingRecovery: {
      requestedTxid: REQUEST_TXID,
      requestedHeight: REQUEST_HEIGHT,
      finalizeHeight: FINALIZE_HEIGHT,
      proposedOwnerPubkey: PROPOSED_PUB,
      predecessorStateTxid: PRE_INVOKE_HEAD,
      recoveryDescriptorHash: DESC_HASH,
      challengeWindowBlocks: CHALLENGE_WINDOW,
    },
    ...overrides,
  };
  state.names.set(record.name, record);
  return record;
}

// A cancel's fields. Defaults match the seeded pendingRecovery so the R16 binding /
// field-equality checks pass (fixture mechanics, not asserted as ratified). flags
// carries the CANCEL bit only as the selector that routes the event to the cancel
// branch.
function cancelFields(overrides: Partial<RecoverOwnerAuthorizationFields> = {}): RecoverOwnerAuthorizationFields {
  return {
    prevStateTxid: REQUEST_TXID,
    newOwnerPubkey: PROPOSED_PUB,
    flags: RECOVER_OWNER_FLAG_CANCEL,
    successorBondVout: 0,
    challengeWindowBlocks: CHALLENGE_WINDOW,
    recoveryDescriptorHash: DESC_HASH,
    ...overrides,
  };
}

// Build a CANCEL-flagged RecoverOwner transaction. `signFields` lets a negative sign
// over different fields than the event carries (e.g. the CANCEL-bit-clear digest).
function cancelTx(input: {
  txid: string;
  blockHeight: number;
  fields: RecoverOwnerAuthorizationFields;
  signerPrivateKeyHex: string;
  signFields?: RecoverOwnerAuthorizationFields;
}): BitcoinTransactionInBlock {
  const signOver = input.signFields ?? input.fields;
  const signature = signRecoverOwnerCancelAuthorization({ ...signOver, ownerPrivateKeyHex: input.signerPrivateKeyHex });
  const payload: RecoverOwnerEvent = { type: EventType.RecoverOwner, ...input.fields, signature };
  const dataHex = bytesToHex(encodeEvent(payload));
  return {
    tx: { txid: input.txid, inputs: [], outputs: [{ valueSats: 0n, scriptType: "op_return", dataHex }] },
    blockHeight: input.blockHeight,
    txIndex: 0,
  };
}

function apply(state: OntState, tx: BitcoinTransactionInBlock, options: OntEventApplicationOptions = {}) {
  const provenance = applyBlockTransactionsWithProvenance(state, [tx], 0, options);
  const events = provenance.flatMap((record) => record.events);
  return { provenance, events };
}

// ===========================================================================
// R15 — §5 ont-recover-owner cancel-digest equivalence pin
// ===========================================================================
describe("R15 §5 recover-owner cancel-digest equivalence pin (@ont/protocol ⟷ @ont/wire)", () => {
  const battery: ReadonlyArray<{ label: string; fields: RecoverOwnerAuthorizationFields }> = [
    { label: "min window, zero fields", fields: { prevStateTxid: "00".repeat(32), newOwnerPubkey: "00".repeat(32), flags: 0, successorBondVout: 0, challengeWindowBlocks: 1, recoveryDescriptorHash: "00".repeat(32) } },
    { label: "max flags/vout/window", fields: { prevStateTxid: "ff".repeat(32), newOwnerPubkey: "ff".repeat(32), flags: 255, successorBondVout: 255, challengeWindowBlocks: 4294967295, recoveryDescriptorHash: "ff".repeat(32) } },
    { label: "CANCEL flag bit set", fields: cancelFields() },
    { label: "mixed/asymmetric", fields: { prevStateTxid: "ab".repeat(32), newOwnerPubkey: "cd".repeat(32), flags: 1, successorBondVout: 7, challengeWindowBlocks: 1000, recoveryDescriptorHash: "12".repeat(32) } },
  ];

  for (const { label, fields } of battery) {
    it(`computeRecoverOwnerAuthorizationHash === bytesToHex(recoverAuthDigest) — ${label}`, () => {
      expect(computeRecoverOwnerAuthorizationHash(fields)).toBe(bytesToHex(recoverAuthDigest(fields)));
    });
  }
});

// ===========================================================================
// R15 — owner-key cancel signer (Decision #40 carve-out applies)
// ===========================================================================
describe("R15 — the current owner key is the defined cancel signer (until the #40 watcher credential lands)", () => {
  it("(+) a current-owner-signed cancel inside the window clears pendingRecovery", () => {
    const state = createEmptyState();
    seedNameWithPendingRecovery(state);
    const { events } = apply(state, cancelTx({ txid: "c0".repeat(32), blockHeight: 600, fields: cancelFields(), signerPrivateKeyHex: OWNER_PRIV }));
    expect(events[0]?.validationStatus).toBe("applied");
    expect(events[0]?.reason).toBe("recovery_cancelled_by_owner");
    expect(state.names.get("alice")?.pendingRecovery).toBeUndefined();
  });

  it("(−) a cancel signed by the proposed new owner (recovery wallet) does not cancel under the current defined signer", () => {
    const state = createEmptyState();
    seedNameWithPendingRecovery(state);
    const { events } = apply(state, cancelTx({ txid: "c1".repeat(32), blockHeight: 600, fields: cancelFields(), signerPrivateKeyHex: PROPOSED_PRIV }));
    expect(events[0]?.validationStatus).toBe("ignored");
    expect(events[0]?.reason).toBe("recovery_cancel_invalid_signature");
    expect(state.names.get("alice")?.pendingRecovery).toBeDefined();
  });

  it("(−) a cancel signed by an unrelated key does not cancel under the current defined signer", () => {
    const state = createEmptyState();
    seedNameWithPendingRecovery(state);
    const { events } = apply(state, cancelTx({ txid: "c2".repeat(32), blockHeight: 600, fields: cancelFields(), signerPrivateKeyHex: STRANGER_PRIV }));
    expect(events[0]?.reason).toBe("recovery_cancel_invalid_signature");
    expect(state.names.get("alice")?.pendingRecovery).toBeDefined();
  });

  it("(−) a signature over the CANCEL-bit-clear digest does not authorize a CANCEL-flagged event (flags is digest material)", () => {
    const state = createEmptyState();
    seedNameWithPendingRecovery(state);
    // Owner signs over flags = 0; the event carries the CANCEL flag. The cancel
    // verifier recomputes over the event's actual flags, so the digests differ.
    const { events } = apply(state, cancelTx({
      txid: "c3".repeat(32),
      blockHeight: 600,
      fields: cancelFields(), // event carries flags = CANCEL
      signFields: cancelFields({ flags: 0 }), // signed over flags = 0
      signerPrivateKeyHex: OWNER_PRIV,
    }));
    expect(events[0]?.reason).toBe("recovery_cancel_invalid_signature");
    expect(state.names.get("alice")?.pendingRecovery).toBeDefined();
  });
});

// ===========================================================================
// R17 — a valid cancel is abort-only
// ===========================================================================
describe("R17 — a valid cancel is abort-only", () => {
  it("(+) clears pendingRecovery, leaves the current owner as the pre-request owner, and never installs the proposed owner", () => {
    const state = createEmptyState();
    const before = seedNameWithPendingRecovery(state);
    expect(before.currentOwnerPubkey).toBe(OWNER_PUB);

    const { events } = apply(state, cancelTx({ txid: "c4".repeat(32), blockHeight: 643, fields: cancelFields(), signerPrivateKeyHex: OWNER_PRIV }));

    expect(events[0]?.validationStatus).toBe("applied");
    const after = state.names.get("alice");
    expect(after?.pendingRecovery).toBeUndefined(); // abort: pending cleared
    expect(after?.currentOwnerPubkey).toBe(OWNER_PUB); // owner unchanged (the pre-request key)
    expect(after?.currentOwnerPubkey).not.toBe(PROPOSED_PUB); // proposed owner never installed
    // NOTE: deliberately not asserting a whole-record "sole effect" — lastStateTxid /
    // head bookkeeping is X4/R5-adjacent and parked, and post-cancel bond custody is
    // the known R17/S* conflict.
  });
});

// ===========================================================================
// PR-35 — a valid CANCEL at the EXACT finalize height is in-window
// ===========================================================================
describe("PR-35 — CANCEL/finalize boundary is inclusive at the exact finalize height", () => {
  it("(+) an owner cancel AT the finalize height is in-window and clears pendingRecovery", () => {
    const state = createEmptyState();
    seedNameWithPendingRecovery(state); // finalizeHeight = 644
    const { events } = apply(state, cancelTx({ txid: "c6".repeat(32), blockHeight: FINALIZE_HEIGHT, fields: cancelFields(), signerPrivateKeyHex: OWNER_PRIV }));
    expect(events[0]?.validationStatus).toBe("applied");
    expect(events[0]?.reason).toBe("recovery_cancelled_by_owner");
    expect(state.names.get("alice")?.pendingRecovery).toBeUndefined();
  });

  it("(−) an owner cancel strictly AFTER the finalize height is too late", () => {
    const state = createEmptyState();
    seedNameWithPendingRecovery(state);
    const { events } = apply(state, cancelTx({ txid: "c7".repeat(32), blockHeight: FINALIZE_HEIGHT + 1, fields: cancelFields(), signerPrivateKeyHex: OWNER_PRIV }));
    expect(events[0]?.validationStatus).toBe("ignored");
    expect(events[0]?.reason).toBe("recovery_cancel_too_late");
    expect(state.names.get("alice")?.pendingRecovery).toBeDefined();
  });
});

// ===========================================================================
// R18 — recovery completion is deterministic over chain height (finalize)
// ===========================================================================
describe("R18 — completion is a deterministic function of (prior pendingRecovery, chain height)", () => {
  it("(+) at the finalize height the proposed owner is installed and pendingRecovery clears", () => {
    const state = createEmptyState();
    seedNameWithPendingRecovery(state);
    refreshDerivedState(state, FINALIZE_HEIGHT);
    const after = state.names.get("alice");
    expect(after?.pendingRecovery).toBeUndefined();
    expect(after?.currentOwnerPubkey).toBe(PROPOSED_PUB); // recovery completes -> proposed owner installed
  });

  it("(−) one block before the finalize height nothing finalizes (deterministic over height)", () => {
    const state = createEmptyState();
    seedNameWithPendingRecovery(state);
    refreshDerivedState(state, FINALIZE_HEIGHT - 1);
    const after = state.names.get("alice");
    expect(after?.pendingRecovery).toBeDefined();
    expect(after?.currentOwnerPubkey).toBe(OWNER_PUB); // not yet finalized
  });

  it("a same-height CANCEL then finalize: the cancel clears pending first, so finalization is a no-op (ordering)", () => {
    const state = createEmptyState();
    seedNameWithPendingRecovery(state);
    // CANCEL at the finalize height applies first (block events before refreshDerivedState),
    // clearing pendingRecovery; the subsequent finalize finds nothing and the owner is unchanged.
    apply(state, cancelTx({ txid: "c8".repeat(32), blockHeight: FINALIZE_HEIGHT, fields: cancelFields(), signerPrivateKeyHex: OWNER_PRIV }));
    refreshDerivedState(state, FINALIZE_HEIGHT);
    const after = state.names.get("alice");
    expect(after?.pendingRecovery).toBeUndefined();
    expect(after?.currentOwnerPubkey).toBe(OWNER_PUB); // cancel won; proposed owner never installed
  });
});

// ===========================================================================
// R19 — the cancel branch is a pure predicate (no invoke availability callback)
// ===========================================================================
describe("R19 — the cancel branch is pure (independent of the invoke evidence gate)", () => {
  it("a valid cancel succeeds with NO recovery evidence supplied (cancel never consults the invoke gate)", () => {
    const state = createEmptyState();
    seedNameWithPendingRecovery(state);
    // No recoveryEvidence in options — the invoke evidence gate (acceptRecoverOwner) is irrelevant
    // to a CANCEL. A valid owner cancel still clears pendingRecovery; the cancel branch is a pure
    // predicate over (cancel digest, prior state), never the witnessed-descriptor evidence path.
    // (The legacy availability callback that this test once proved unused no longer exists.)
    const { events } = apply(
      state,
      cancelTx({ txid: "c5".repeat(32), blockHeight: 600, fields: cancelFields(), signerPrivateKeyHex: OWNER_PRIV }),
      {}
    );
    expect(events[0]?.validationStatus).toBe("applied");
    expect(state.names.get("alice")?.pendingRecovery).toBeUndefined();
  });
});

// ===========================================================================
// Recovery INVOKE path (#50-b1, engine B) — acceptRecoverOwner admission + the
// PR-34 successor-bond-address binding + §3c evidence-gated admission, driven through
// the public API. (acceptRecoverOwner's own conjunct battery lives in
// recovery-invoke-authority.test.ts + the R/T conformance bindings; here we prove the
// ENGINE wiring: it assembles the inputs, consults the gate, binds the bond address,
// and opens pendingRecovery only on an accepted verdict.)
// ===========================================================================
const RECOVERY_PRIV = "05".repeat(32);
const RECOVERY_PUB = deriveOwnerPubkey(RECOVERY_PRIV);
const INVOKE_HEAD = "ee".repeat(32);
const SEEDED_BOND_TXID = "bb".repeat(32);
const DESC_REF = "aa".repeat(32);
const DESC_SEQ = 3;
const RECOVERY_ADDR = "bc1qrecoveryexampleaddr0000000000000000";
const DESC_T0 = "2026-01-01T00:00:00Z";
const INVOKE_HEIGHT = 600; // immature (< maturityHeight 1000), so recovery is permitted (R12)
const W_R = 20;
const AUX = new Uint8Array(32);

function seedInvokableName(state: OntState): void {
  state.names.set("alice", {
    name: "alice",
    status: "immature",
    currentOwnerPubkey: OWNER_PUB,
    acquisitionKind: "bonded",
    claimCommitTxid: "a1".repeat(32),
    claimRevealTxid: "b1".repeat(32),
    claimHeight: 100,
    maturityHeight: 1000,
    requiredBondSats: 50_000n,
    currentBondTxid: SEEDED_BOND_TXID,
    currentBondVout: 0,
    currentBondValueSats: 50_000n,
    lastStateTxid: INVOKE_HEAD,
    lastStateHeight: 400,
    winningCommitBlockHeight: 100,
    winningCommitTxIndex: 0,
  });
}

// The name's current armed descriptor head (v2), owner-armed by OWNER_PRIV. Deterministic.
function armedDescriptor(): Record<string, unknown> {
  const unsigned: Record<string, unknown> = {
    format: RECOVERY_DESCRIPTOR_FORMAT,
    descriptorVersion: RECOVERY_DESCRIPTOR_VERSION_V2,
    name: "alice",
    ownerPubkey: OWNER_PUB,
    ownershipRef: DESC_REF,
    sequence: DESC_SEQ,
    previousDescriptorHash: null,
    recoveryAddress: RECOVERY_ADDR,
    signingProfile: "bip322",
    challengeWindowBlocks: CHALLENGE_WINDOW,
    issuedAt: DESC_T0,
    recoveryPubkey: RECOVERY_PUB,
    signature: "00".repeat(64),
  };
  return { ...unsigned, signature: bytesToHex(schnorr.sign(recoveryDescriptorDigest(unsigned), hexToBytes(OWNER_PRIV), AUX)) };
}

function recoveryOptions(witnessedByHeight: number): OntEventApplicationOptions {
  const descriptor = armedDescriptor();
  const resolved: ResolvedRecoveryDescriptorState = {
    descriptorEvidence: { descriptor, witness: { kind: "b3-verified-recovery-descriptor-witness", witnessedByHeight } },
    recoveryDescriptorHeadHash: bytesToHex(recoveryDescriptorDigest(descriptor)),
    recoveryDescriptorHeadSequence: DESC_SEQ,
    currentOwnershipRef: DESC_REF,
  };
  return { recoveryEvidence: { byName: new Map([["alice", resolved]]), params: { recoveryEvidenceWindowBlocks: W_R } } };
}

// A non-cancel RecoverOwner invoke: spends the seeded bond outpoint, pays a successor bond output
// (vout 0) to `successorAddress`, and posts the OP_RETURN payload (vout 1). The 64-byte slot holds a
// real BIP340 signature over the W13 recoverAuthDigest by `invokeSignerPriv` (default the recovery key).
function invokeTx(opts: { txid: string; blockHeight: number; successorAddress?: string; invokeSignerPriv?: string }): BitcoinTransactionInBlock {
  const descHash = bytesToHex(recoveryDescriptorDigest(armedDescriptor()));
  const fields = { prevStateTxid: INVOKE_HEAD, newOwnerPubkey: PROPOSED_PUB, flags: 0, successorBondVout: 0, challengeWindowBlocks: CHALLENGE_WINDOW, recoveryDescriptorHash: descHash };
  const signature = bytesToHex(schnorr.sign(recoverAuthDigest(fields), hexToBytes(opts.invokeSignerPriv ?? RECOVERY_PRIV), AUX));
  const payload: RecoverOwnerEvent = { type: EventType.RecoverOwner, ...fields, signature };
  const dataHex = bytesToHex(encodeEvent(payload));
  return {
    tx: {
      txid: opts.txid,
      inputs: [{ txid: SEEDED_BOND_TXID, vout: 0, coinbase: false }],
      outputs: [
        { valueSats: 50_000n, scriptType: "payment", ...(opts.successorAddress === undefined ? {} : { address: opts.successorAddress }) },
        { valueSats: 0n, scriptType: "op_return", dataHex },
      ],
    },
    blockHeight: opts.blockHeight,
    txIndex: 0,
  };
}

describe("recovery invoke (engine B) — acceptRecoverOwner admission + PR-34 bond-address binding", () => {
  it("(+) a fully-armed invoke whose successor bond pays the descriptor recoveryAddress opens pendingRecovery", () => {
    const state = createEmptyState();
    seedInvokableName(state);
    const { events } = apply(state, invokeTx({ txid: "f0".repeat(32), blockHeight: INVOKE_HEIGHT, successorAddress: RECOVERY_ADDR }), recoveryOptions(INVOKE_HEIGHT + W_R));
    expect(events[0]?.validationStatus).toBe("applied");
    expect(events[0]?.reason).toBe("recovery_requested");
    expect(state.names.get("alice")?.pendingRecovery?.proposedOwnerPubkey).toBe(PROPOSED_PUB);
  });

  it("(−) PR-34: a successor bond paying a DIFFERENT address is rejected (bond not provably controlled by the recovery address)", () => {
    const state = createEmptyState();
    seedInvokableName(state);
    const { events } = apply(state, invokeTx({ txid: "f1".repeat(32), blockHeight: INVOKE_HEIGHT, successorAddress: "bc1qattackercontrolledaddr0000000000000" }), recoveryOptions(INVOKE_HEIGHT + W_R));
    expect(events[0]?.validationStatus).toBe("ignored");
    expect(events[0]?.reason).toBe("recovery_successor_bond_address_mismatch");
    expect(state.names.get("alice")?.pendingRecovery).toBeUndefined();
  });

  it("(−) PR-34: a successor bond with NO destination field is rejected (the model cannot prove control)", () => {
    const state = createEmptyState();
    seedInvokableName(state);
    const { events } = apply(state, invokeTx({ txid: "f2".repeat(32), blockHeight: INVOKE_HEIGHT }), recoveryOptions(INVOKE_HEIGHT + W_R));
    expect(events[0]?.reason).toBe("recovery_successor_bond_address_mismatch");
    expect(state.names.get("alice")?.pendingRecovery).toBeUndefined();
  });

  it("(−) no witnessed descriptor evidence supplied → fail closed (opens nothing)", () => {
    const state = createEmptyState();
    seedInvokableName(state);
    const { events } = apply(state, invokeTx({ txid: "f3".repeat(32), blockHeight: INVOKE_HEIGHT, successorAddress: RECOVERY_ADDR }), {});
    expect(events[0]?.reason).toBe("recovery_no_witnessed_descriptor_evidence");
    expect(state.names.get("alice")?.pendingRecovery).toBeUndefined();
  });

  it("(−) the acceptRecoverOwner gate is consulted: an invoke signed by the wrong key is unauthorized (no state opens)", () => {
    const state = createEmptyState();
    seedInvokableName(state);
    const { events } = apply(state, invokeTx({ txid: "f4".repeat(32), blockHeight: INVOKE_HEIGHT, successorAddress: RECOVERY_ADDR, invokeSignerPriv: STRANGER_PRIV }), recoveryOptions(INVOKE_HEIGHT + W_R));
    expect(events[0]?.validationStatus).toBe("ignored");
    expect(events[0]?.reason).toBe("recovery_unauthorized");
    expect(state.names.get("alice")?.pendingRecovery).toBeUndefined();
  });

  it("(−) §3c: descriptor evidence witnessed past h_r + W_r forfeits (no state opens)", () => {
    const state = createEmptyState();
    seedInvokableName(state);
    const { events } = apply(state, invokeTx({ txid: "f5".repeat(32), blockHeight: INVOKE_HEIGHT, successorAddress: RECOVERY_ADDR }), recoveryOptions(INVOKE_HEIGHT + W_R + 1));
    expect(events[0]?.reason).toBe("recovery_unauthorized");
    expect(state.names.get("alice")?.pendingRecovery).toBeUndefined();
  });

  it("(−) §2.1: RecoverOwner invoke aimed at an accumulator-batched record is typed-inapplicable before maturity or bond checks", () => {
    const state = createEmptyState();
    const accumulatorRecord: NameRecord = {
      name: "alice",
      status: "mature",
      currentOwnerPubkey: OWNER_PUB,
      acquisitionKind: "accumulator-batched",
      firstServableHeight: 100,
      anchoredRoot: "aa".repeat(32),
      leafKeyHex: "bb".repeat(32),
      assuranceProvenance: {
        tier: "accumulator-batched",
        availabilityMode: "O1-collapsed",
        priorityBearing: false,
        finalizedAtHeight: 100,
        anchorHeight: 100,
      },
      lastStateTxid: INVOKE_HEAD,
      lastStateHeight: 100,
      winningCommitBlockHeight: 100,
      winningCommitTxIndex: 0,
    };
    state.names.set("alice", accumulatorRecord);

    const { events } = apply(
      state,
      invokeTx({ txid: "f7".repeat(32), blockHeight: INVOKE_HEIGHT, successorAddress: RECOVERY_ADDR }),
      recoveryOptions(INVOKE_HEIGHT + W_R)
    );

    expect("maturityHeight" in accumulatorRecord).toBe(false);
    expect(events[0]?.validationStatus).toBe("ignored");
    expect(events[0]?.reason).toBe("recovery_inapplicable_for_accumulator");
    expect(events[0]?.reason).not.toBe("recovery_name_not_found_or_invalid");
    expect(state.names.get("alice")).toEqual(accumulatorRecord);
  });
});

// ===========================================================================
// X13 — owner-key Transfer is BLOCKED while a recovery is pending (PR-34)
// ===========================================================================
describe("X13 — owner-key Transfer is blocked while a recovery is pending", () => {
  it("a transfer referencing a name with an open pendingRecovery mutates nothing", () => {
    const state = createEmptyState();
    seedNameWithPendingRecovery(state); // pendingRecovery open; head = PRE_INVOKE_HEAD, current owner = OWNER_PUB
    const transferFields = { prevStateTxid: PRE_INVOKE_HEAD, newOwnerPubkey: PROPOSED_PUB, flags: 0, successorBondVout: 0 };
    const signature = signTransferAuthorization({ ...transferFields, ownerPrivateKeyHex: OWNER_PRIV });
    const payload: TransferEvent = { type: EventType.Transfer, ...transferFields, signature };
    const dataHex = bytesToHex(encodeEvent(payload));
    const tx: BitcoinTransactionInBlock = {
      tx: { txid: "f6".repeat(32), inputs: [], outputs: [{ valueSats: 0n, scriptType: "op_return", dataHex }] },
      blockHeight: 600,
      txIndex: 0,
    };
    const { events } = apply(state, tx, {});
    expect(events[0]?.validationStatus).toBe("ignored");
    expect(events[0]?.reason).toBe("transfer_blocked_pending_recovery");
    expect(state.names.get("alice")?.pendingRecovery).toBeDefined();
    expect(state.names.get("alice")?.currentOwnerPubkey).toBe(OWNER_PUB); // unchanged
  });
});
