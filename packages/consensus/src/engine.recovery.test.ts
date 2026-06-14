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
// PARKED — explicitly OUT of the ratified gate:
//   - The entire INVOKE path (applyRecoverOwnerRequest) is PRE-#50 LEGACY: it gates
//     pendingRecovery on an injected `recoveryWalletProofAvailable` callback plus a
//     proof commitment stuffed in the signature slot — NOT the ratified #50-b1
//     signer (descriptor-v2 recoveryPubkey signing the ont-recover-owner W13 digest
//     with witnessed descriptor evidence). Hardening invoke to ratified law is a B2
//     implementation rewrite (on DK's return docket next to transfer-during-recovery
//     / PR-17/34/35), not a legacy hardening pass. These tests SEED pendingRecovery
//     DIRECTLY and never exercise or bless the legacy invoke path.
//   - R16 binding/timeliness (prevStateTxid=request-txid overloading, the
//     field-equality set, the strict-before-deadline boundary): used here only as
//     the fixture mechanics needed to reach a valid cancel; NOT asserted as ratified.
//   - R18 completion mechanics; R1/R2/R3/R4/R5/R6/R7/R8/R9/R10/R11/R12/R13/R14 (invoke).
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
  createRecoverOwnerPayload,
  deriveOwnerPubkey,
  encodeRecoverOwnerPayload,
  signRecoverOwnerCancelAuthorization,
} from "@ont/protocol";
import type { BitcoinTransactionInBlock } from "@ont/bitcoin";
import { recoverAuthDigest } from "@ont/wire";

import {
  applyBlockTransactionsWithProvenance,
  createEmptyState,
  type NameRecord,
  type OntEventApplicationOptions,
  type OntState,
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
function seedNameWithPendingRecovery(state: OntState, overrides: Partial<NameRecord> = {}): NameRecord {
  const record: NameRecord = {
    name: "alice",
    status: "immature",
    currentOwnerPubkey: OWNER_PUB,
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
  const payload = createRecoverOwnerPayload({ ...input.fields, signature });
  const dataHex = bytesToHex(encodeRecoverOwnerPayload(payload));
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
// R19 — the cancel branch is a pure predicate (no invoke availability callback)
// ===========================================================================
describe("R19 — the cancel branch never consults the invoke availability callback", () => {
  it("a valid cancel succeeds without invoking recoveryWalletProofAvailable (passed a throwing callback)", () => {
    const state = createEmptyState();
    seedNameWithPendingRecovery(state);
    let called = false;
    const options: OntEventApplicationOptions = {
      recoveryWalletProofAvailable: () => {
        called = true;
        throw new Error("the cancel path must not consult the invoke availability callback");
      },
    };
    let events: ReturnType<typeof apply>["events"] = [];
    expect(() => {
      events = apply(state, cancelTx({ txid: "c5".repeat(32), blockHeight: 600, fields: cancelFields(), signerPrivateKeyHex: OWNER_PRIV }), options).events;
    }).not.toThrow();
    expect(called).toBe(false);
    expect(events[0]?.validationStatus).toBe("applied");
    expect(state.names.get("alice")?.pendingRecovery).toBeUndefined();
  });
});
