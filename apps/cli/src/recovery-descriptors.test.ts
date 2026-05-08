import { afterEach, describe, expect, it, vi } from "vitest";
import { Signer } from "bip322-js";

import {
  createRecoveryWalletProofEnvelope,
  createRecoveryWalletProofMessageForDescriptor,
  createSignedRecoveryDescriptor,
  publishRecoveryDescriptor,
  verifyRecoveryWalletProofEnvelope
} from "./recovery-descriptors.js";

const ORIGINAL_FETCH = globalThis.fetch;

describe("recovery descriptor helpers", () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it("creates signed recovery descriptors", () => {
    const descriptor = createSignedRecoveryDescriptor({
      name: "Alice",
      ownerPrivateKeyHex: "12".repeat(32),
      ownershipRef: "aa".repeat(32),
      sequence: 1,
      previousDescriptorHash: null,
      recoveryAddress: "tb1qrecoveryexample000000000000000000000000v",
      issuedAt: "2026-05-07T12:00:00.000Z"
    });

    expect(descriptor.name).toBe("alice");
    expect(descriptor.signingProfile).toBe("bip322");
    expect(descriptor.challengeWindowBlocks).toBe(144);
    expect(descriptor.signature).toHaveLength(128);
  });

  it("publishes signed recovery descriptors to the resolver", async () => {
    const descriptor = createSignedRecoveryDescriptor({
      name: "bob",
      ownerPrivateKeyHex: "13".repeat(32),
      ownershipRef: "bb".repeat(32),
      sequence: 2,
      previousDescriptorHash: "cc".repeat(32),
      recoveryAddress: "tb1qrecoveryexample111111111111111111111111j",
      challengeWindowBlocks: 288,
      issuedAt: "2026-05-07T12:01:00.000Z"
    });

    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          name: descriptor.name,
          sequence: descriptor.sequence
        }),
        {
          status: 201,
          headers: {
            "content-type": "application/json"
          }
        }
      )
    ) as typeof fetch;

    await expect(
      publishRecoveryDescriptor({
        resolverUrl: "http://127.0.0.1:8787",
        recoveryDescriptor: descriptor
      })
    ).resolves.toMatchObject({
      ok: true,
      name: "bob",
      sequence: 2
    });
  });

  it("builds and verifies recovery wallet proof envelopes", () => {
    const recoveryAddress = "tb1q9vza2e8x573nczrlzms0wvx3gsqjx7vaxwd45v";
    const descriptor = createSignedRecoveryDescriptor({
      name: "carol",
      ownerPrivateKeyHex: "14".repeat(32),
      ownershipRef: "dd".repeat(32),
      sequence: 1,
      previousDescriptorHash: null,
      recoveryAddress,
      challengeWindowBlocks: 144,
      issuedAt: "2026-05-08T12:00:00.000Z"
    });
    const message = createRecoveryWalletProofMessageForDescriptor({
      descriptor,
      prevStateTxid: descriptor.ownershipRef,
      newOwnerPubkey: "88".repeat(32),
      successorBondVout: 0
    });
    const signatureBase64 = Signer.sign(
      "L3VFeEujGtevx9w18HD1fhRbCH67Az2dpCymeRE1SoPK6XQtaN2k",
      recoveryAddress,
      message
    );
    const proof = createRecoveryWalletProofEnvelope({
      descriptor,
      prevStateTxid: descriptor.ownershipRef,
      newOwnerPubkey: "88".repeat(32),
      successorBondVout: 0,
      signatureBase64
    });

    expect(proof.proofHash).toHaveLength(64);
    expect(proof.proofCommitment).toHaveLength(128);
    expect(
      verifyRecoveryWalletProofEnvelope({
        descriptor,
        proof,
        prevStateTxid: descriptor.ownershipRef,
        newOwnerPubkey: "88".repeat(32),
        successorBondVout: 0
      })
    ).toMatchObject({
      ok: true,
      reason: "valid"
    });
  });
});
