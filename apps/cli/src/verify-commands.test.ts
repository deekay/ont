import { describe, expect, it } from "vitest";
import {
  createRecoveryWalletProof,
  createRecoveryWalletProofMessage,
  deriveOwnerPubkey,
  signRecoveryDescriptor,
  verifyRecoveryWalletProof,
  computeRecoveryDescriptorHash,
} from "@ont/protocol";
import { verifyProofBundleStructure } from "@ont/consensus";
import {
  renderRecoveryWalletProofMessage,
  runVerifyRecoveryWalletProof,
  runInspectProofBundle,
  type RecoveryWalletProofMessageFields,
} from "./verify-commands.js";

// B5-CLI verify-cores red battery. The cores consume the AUDITED @ont/* APIs and surface the result VERBATIM
// (consume-don't-reimplement, asserted by deep-equal to the audited call); malformed input → {ok:false,
// reason:"malformed"}; total. RED until the cores land (stubs reject).

const OWNER_SK = "11".repeat(32);
const OWNER_PUB = deriveOwnerPubkey(OWNER_SK);
const REF = "ab".repeat(32);
const RECOVERY_ADDRESS = "bc1qexamplerecoveryaddress00000000000000000";
const T0 = "2026-01-01T00:00:00.000Z";

const MESSAGE_FIELDS: RecoveryWalletProofMessageFields = {
  name: "alice",
  prevStateTxid: "0a".repeat(32),
  recoveryDescriptorHash: "cd".repeat(32),
  newOwnerPubkey: "ab".repeat(32),
  successorBondVout: 1,
  challengeWindowBlocks: 144,
};

const DESCRIPTOR = signRecoveryDescriptor({ name: "alice", ownerPrivateKeyHex: OWNER_SK, ownershipRef: REF, sequence: 1, previousDescriptorHash: null, recoveryAddress: RECOVERY_ADDRESS, issuedAt: T0 });
const PROOF = createRecoveryWalletProof({
  name: "alice",
  prevStateTxid: "0a".repeat(32),
  recoveryDescriptorHash: computeRecoveryDescriptorHash(DESCRIPTOR),
  newOwnerPubkey: "ab".repeat(32),
  successorBondVout: 1,
  challengeWindowBlocks: 144,
  recoveryAddress: RECOVERY_ADDRESS,
  signatureBase64: "AAAA", // dummy (wallet-signed externally); verify will surface a failed result verbatim
});

describe("renderRecoveryWalletProofMessage", () => {
  it("valid fields → message equals the audited createRecoveryWalletProofMessage (consume-don't-reimplement)", () => {
    const r = renderRecoveryWalletProofMessage(MESSAGE_FIELDS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.message).toBe(createRecoveryWalletProofMessage(MESSAGE_FIELDS));
  });
  it("bad fields (non-hex) → malformed (never throws)", () => {
    let r: ReturnType<typeof renderRecoveryWalletProofMessage> | undefined;
    expect(() => { r = renderRecoveryWalletProofMessage({ ...MESSAGE_FIELDS, prevStateTxid: "nope" }); }).not.toThrow();
    expect(r?.ok).toBe(false);
  });
});

describe("runVerifyRecoveryWalletProof", () => {
  it("surfaces the audited verifyRecoveryWalletProof result verbatim (ok/reason/proofHash)", () => {
    const r = runVerifyRecoveryWalletProof({ descriptor: DESCRIPTOR, proof: PROOF });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const audited = verifyRecoveryWalletProof({ descriptor: DESCRIPTOR, proof: PROOF });
    expect(r.result).toEqual(audited); // verbatim — no recomputed verdict
    expect(r.result).toHaveProperty("ok");
    expect(r.result).toHaveProperty("reason");
    expect(r.result).toHaveProperty("proofHash");
  });
  it("malformed input → malformed (never throws)", () => {
    let r: ReturnType<typeof runVerifyRecoveryWalletProof> | undefined;
    expect(() => { r = runVerifyRecoveryWalletProof(null as unknown as { descriptor: typeof DESCRIPTOR; proof: typeof PROOF }); }).not.toThrow();
    expect(r?.ok).toBe(false);
  });
});

describe("runInspectProofBundle", () => {
  it("surfaces the audited structural report verbatim (consume-don't-reimplement)", () => {
    const bundle = { proofSource: "accumulator_batch_claim", name: "alice" };
    const r = runInspectProofBundle(bundle);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.report).toEqual(verifyProofBundleStructure(bundle)); // mirrors the audited report exactly
    expect(r.report).toHaveProperty("valid");
    expect(r.report).toHaveProperty("proofSource");
    expect(r.report).toHaveProperty("passedCheckCount");
    expect(r.report).toHaveProperty("failedCheckCount");
    expect(r.report).toHaveProperty("checks");
  });
  it("malformed/garbage bundle → still surfaces a structural report (valid:false), never throws", () => {
    let r: ReturnType<typeof runInspectProofBundle> | undefined;
    expect(() => { r = runInspectProofBundle(null); }).not.toThrow();
    expect(r?.ok).toBe(true);
    if (r?.ok) expect(r.report.valid).toBe(false);
  });
});

describe("verify-cores — determinism", () => {
  it("is deterministic", () => {
    expect(renderRecoveryWalletProofMessage(MESSAGE_FIELDS)).toEqual(renderRecoveryWalletProofMessage(MESSAGE_FIELDS));
    expect(runInspectProofBundle({ proofSource: "accumulator_batch_claim" })).toEqual(runInspectProofBundle({ proofSource: "accumulator_batch_claim" }));
  });
});
