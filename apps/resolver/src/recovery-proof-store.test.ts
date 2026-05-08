import { describe, expect, it } from "vitest";

import {
  computeRecoveryWalletProofHash,
  createRecoveryWalletProof,
  type RecoveryWalletProof
} from "@ont/protocol";

import {
  appendRecoveryWalletProof,
  countRecoveryWalletProofs,
  getRecoveryWalletProof,
  parseRecoveryWalletProofStoreSnapshot
} from "./recovery-proof-store.js";

describe("recovery wallet proof store", () => {
  it("loads and indexes stored proof envelopes by proof hash", () => {
    const proof = createRecoveryWalletProof({
      name: "Alice",
      prevStateTxid: "aa".repeat(32),
      recoveryDescriptorHash: "bb".repeat(32),
      newOwnerPubkey: "cc".repeat(32),
      successorBondVout: 0,
      challengeWindowBlocks: 144,
      recoveryAddress: "tb1qrecoveryexample000000000000000000000000v",
      signingProfile: "bip322",
      signatureBase64: "dummy-signature"
    });
    const proofHash = computeRecoveryWalletProofHash(proof);
    const store = parseRecoveryWalletProofStoreSnapshot({
      proofs: [proof]
    });

    expect(countRecoveryWalletProofs(store)).toBe(1);
    expect(getRecoveryWalletProof(store, proofHash)).toMatchObject({
      name: "alice",
      recoveryDescriptorHash: "bb".repeat(32)
    });
  });

  it("upserts proof envelopes", () => {
    const proof = createRecoveryWalletProof({
      name: "Bob",
      prevStateTxid: "dd".repeat(32),
      recoveryDescriptorHash: "ee".repeat(32),
      newOwnerPubkey: "ff".repeat(32),
      successorBondVout: 1,
      challengeWindowBlocks: 288,
      recoveryAddress: "tb1qrecoveryexample111111111111111111111111j",
      signingProfile: "bip322",
      signatureBase64: "dummy-signature"
    });
    const store = new Map<string, RecoveryWalletProof>();
    const proofHash = appendRecoveryWalletProof(store, proof);

    expect(proofHash).toBe(computeRecoveryWalletProofHash(proof));
    expect(getRecoveryWalletProof(store, proofHash)).toEqual(proof);
  });
});
