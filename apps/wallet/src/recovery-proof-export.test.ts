import { describe, expect, it } from "vitest";
import { Signer } from "bip322-js";
import {
  signRecoveryDescriptor,
  computeRecoveryDescriptorHash,
  createRecoveryWalletProofMessage,
  verifyRecoveryWalletProof,
  type SignedRecoveryDescriptor,
} from "@ont/protocol";
import {
  recoveryWalletProofMessage,
  assembleRecoveryWalletProof,
  type RecoveryProofExportInput,
} from "./recovery-proof-export.js";

// B5-WALLET recovery-proof-export red battery (CL design-concur event ef02ab2d). KEY-FREE: the wallet builds the
// message + assembles the proof; the RECOVERY wallet (external/cold) BIP322-signs. The hermetic test signs with
// bip322-js directly (a fixed WIF + its P2WPKH testnet address) to prove the round trip.

const MNEMONIC = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const OWNER0_PRIVATE = "a4711cdd2c0e159b58098da37369ae84c2e626a25f7f641a75741c1e225c3d50"; // owner signs the descriptor
const RECOVERY_WIF = "L3VFeEujGtevx9w18HD1fhRbCH67Az2dpCymeRE1SoPK6XQtaN2k"; // the recovery wallet (external)
const RECOVERY_ADDRESS = "tb1q9vza2e8x573nczrlzms0wvx3gsqjx7vaxwd45v";
const NEW_OWNER = "88".repeat(32);
const PREV_STATE = "dd".repeat(32);

function descriptor(): SignedRecoveryDescriptor {
  return signRecoveryDescriptor({
    name: "carol",
    ownerPrivateKeyHex: OWNER0_PRIVATE,
    ownershipRef: "dd".repeat(32),
    sequence: 1,
    previousDescriptorHash: null,
    recoveryAddress: RECOVERY_ADDRESS,
    challengeWindowBlocks: 144,
    issuedAt: "2026-05-08T12:00:00.000Z",
  });
}
function baseInput(d: SignedRecoveryDescriptor): RecoveryProofExportInput {
  return { descriptor: d, prevStateTxid: PREV_STATE, newOwnerPubkey: NEW_OWNER, successorBondVout: 0 };
}
function expectedMessage(d: SignedRecoveryDescriptor): string {
  return createRecoveryWalletProofMessage({
    name: d.name,
    prevStateTxid: PREV_STATE,
    recoveryDescriptorHash: computeRecoveryDescriptorHash(d),
    newOwnerPubkey: NEW_OWNER,
    successorBondVout: 0,
    challengeWindowBlocks: d.challengeWindowBlocks,
  });
}
function bip322Sign(message: string): string {
  return Signer.sign(RECOVERY_WIF, RECOVERY_ADDRESS, message) as string;
}

describe("recoveryWalletProofMessage — build for the recovery wallet to sign", () => {
  it("matches @ont/protocol's createRecoveryWalletProofMessage for the descriptor", () => {
    const d = descriptor();
    const r = recoveryWalletProofMessage(baseInput(d));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.message).toBe(expectedMessage(d));
  });
});

describe("assembleRecoveryWalletProof — round-trips through verifyRecoveryWalletProof", () => {
  it("assembles a proof from the recovery wallet's BIP322 signature that verifies against the descriptor", () => {
    const d = descriptor();
    const signatureBase64 = bip322Sign(expectedMessage(d));
    const r = assembleRecoveryWalletProof({ ...baseInput(d), signatureBase64 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(verifyRecoveryWalletProof({ descriptor: d, proof: r.proof }).ok).toBe(true);
  });
});

describe("recovery proof — no key material in the artifact", () => {
  it("the assembled proof carries no recovery/owner private key or mnemonic", () => {
    const d = descriptor();
    const signatureBase64 = bip322Sign(expectedMessage(d));
    const r = assembleRecoveryWalletProof({ ...baseInput(d), signatureBase64 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const dump = JSON.stringify(r.proof);
    for (const secret of [RECOVERY_WIF, OWNER0_PRIVATE, MNEMONIC]) expect(dump).not.toContain(secret);
  });
});

describe("recovery proof — fail-closed", () => {
  it("malformed signatureBase64 → invalid-input (never throws)", () => {
    const d = descriptor();
    let r: ReturnType<typeof assembleRecoveryWalletProof> | undefined;
    expect(() => {
      r = assembleRecoveryWalletProof({ ...baseInput(d), signatureBase64: "!!!not-base64!!!" });
    }).not.toThrow();
    expect(r?.ok).toBe(false);
    if (r && !r.ok) expect(r.reason).toBe("invalid-input");
  });
  it("malformed chainTip hash → invalid-input (never throws)", () => {
    const d = descriptor();
    let r: ReturnType<typeof recoveryWalletProofMessage> | undefined;
    expect(() => {
      r = recoveryWalletProofMessage({ ...baseInput(d), chainTipBlockHash: "zz", chainTipHeight: 100 });
    }).not.toThrow();
    expect(r?.ok).toBe(false);
    if (r && !r.ok) expect(r.reason).toBe("invalid-input");
  });
});
