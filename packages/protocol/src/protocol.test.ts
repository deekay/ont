import { describe, expect, it } from "vitest";
import { Signer } from "bip322-js";
import * as secp256k1 from "tiny-secp256k1";

import {
  ACCUMULATOR_DEFAULTS,
  AUCTION_BOND_FLOOR_SATS,
  BOND_MATURITY_BLOCKS,
  accumulatorRootOf,
  bytesToHex,
  computeRecoveryDescriptorHash,
  computeRecoveryWalletProofHash,
  computeRecoverOwnerAuthorizationHash,
  computeTransferAuthorizationHash,
  createRecoveryWalletProof,
  createRecoveryWalletProofCommitment,
  createRecoveryWalletProofMessage,
  createTransferPackage,
  getBondSats,
  normalizeName,
  parseSignedRecoveryDescriptor,
  parseRecoveryWalletProof,
  parseSignedValueRecord,
  parseTransferPackage,
  PROTOCOL_NAME,
  RECOVERY_DESCRIPTOR_FORMAT,
  RECOVERY_DESCRIPTOR_VERSION,
  RECOVER_OWNER_FLAG_CANCEL,
  signRecoverOwnerCancelAuthorization,
  signRecoveryDescriptor,
  signTransferAuthorization,
  signValueRecord,
  TRANSFER_PACKAGE_FORMAT,
  TRANSFER_PACKAGE_VERSION,
  VALUE_RECORD_FORMAT,
  VALUE_RECORD_VERSION,
  verifyRecoverOwnerCancelAuthorization,
  verifyRecoveryWalletProof,
  verifyRecoveryDescriptor,
  verifyTransferAuthorization,
  verifyValueRecord
} from "./index.js";

describe("normalizeName", () => {
  it("canonicalizes names to lowercase", () => {
    expect(normalizeName("Alice123")).toBe("alice123");
  });

  it("rejects characters outside the v1 alphabet", () => {
    expect(() => normalizeName("alice-123")).toThrow(/invalid ONT name/);
  });
});

describe("accumulatorRootOf", () => {
  it("computes the canonical root for an exact leaf set", () => {
    const emptyRoot = bytesToHex(ACCUMULATOR_DEFAULTS[0] ?? new Uint8Array(32));
    const key = "aa".repeat(32);
    const value = "11".repeat(32);

    expect(accumulatorRootOf(new Map())).toBe(emptyRoot);
    expect(accumulatorRootOf(new Map([[key, value]]))).not.toBe(emptyRoot);
    expect(accumulatorRootOf(new Map([[key.toUpperCase(), value.toUpperCase()]]))).toBe(accumulatorRootOf(new Map([[key, value]])));
    expect(() => accumulatorRootOf(new Map([["zz".repeat(32), value]]))).toThrow();
  });
});

describe("bond and maturity helpers", () => {
  it("halves per added character only across the scarce short set (≤4 chars)", () => {
    expect(getBondSats(1)).toBe(100_000_000n);
    expect(getBondSats(2)).toBe(50_000_000n);
    expect(getBondSats(3)).toBe(25_000_000n);
    expect(getBondSats(4)).toBe(12_500_000n);
  });

  it("clamps to the flat floor at 5+ chars (not length-scaled past the short set)", () => {
    // The boundary the docs promise: a 5-char name is NOT scarce — flat floor,
    // not ₿6,250,000. Guards against the halving curve leaking into the long tail.
    expect(getBondSats(5)).toBe(AUCTION_BOND_FLOOR_SATS);
    expect(getBondSats(11)).toBe(AUCTION_BOND_FLOOR_SATS);
    expect(getBondSats(12)).toBe(AUCTION_BOND_FLOOR_SATS);
    expect(getBondSats(32)).toBe(AUCTION_BOND_FLOOR_SATS);
  });

  it("exposes the fixed current bonded-name maturity", () => {
    expect(BOND_MATURITY_BLOCKS).toBe(52_560);
  });
});

describe("authorization and recovery proof helpers", () => {
  it("signs and verifies transfer authorizations against the owner key", () => {
    const ownerPrivateKeyHex = "07".repeat(32);
    const publicKeyBytes = secp256k1.xOnlyPointFromScalar(Buffer.from(ownerPrivateKeyHex, "hex"));

    if (!publicKeyBytes) {
      throw new Error("unable to derive test public key");
    }

    const ownerPubkey = Buffer.from(publicKeyBytes).toString("hex");
    const fields = {
      prevStateTxid: "44".repeat(32),
      newOwnerPubkey: "55".repeat(32),
      flags: 0x00,
      successorBondVout: 0x02
    };
    const signature = signTransferAuthorization({
      ...fields,
      ownerPrivateKeyHex
    });

    expect(computeTransferAuthorizationHash(fields)).toHaveLength(64);
    expect(
      verifyTransferAuthorization({
        ...fields,
        ownerPubkey,
        signature
      })
    ).toBe(true);
  });

  it("verifies owner-key recovery cancellation authorizations", () => {
    const ownerPrivateKeyHex = "09".repeat(32);
    const publicKeyBytes = secp256k1.xOnlyPointFromScalar(Buffer.from(ownerPrivateKeyHex, "hex"));

    if (!publicKeyBytes) {
      throw new Error("unable to derive test public key");
    }

    const ownerPubkey = Buffer.from(publicKeyBytes).toString("hex");
    const fields = {
      prevStateTxid: "77".repeat(32),
      newOwnerPubkey: "88".repeat(32),
      flags: RECOVER_OWNER_FLAG_CANCEL,
      successorBondVout: 0,
      challengeWindowBlocks: 144,
      recoveryDescriptorHash: "99".repeat(32)
    };
    const signature = signRecoverOwnerCancelAuthorization({
      ...fields,
      ownerPrivateKeyHex
    });
    expect(computeRecoverOwnerAuthorizationHash(fields)).toHaveLength(64);
    expect(
      verifyRecoverOwnerCancelAuthorization({
        ...fields,
        ownerPubkey,
        signature
      })
    ).toBe(true);
  });

  it("builds the BIP322-shaped recovery wallet proof message", () => {
    const message = createRecoveryWalletProofMessage({
      name: "Alice",
      prevStateTxid: "77".repeat(32),
      recoveryDescriptorHash: "99".repeat(32),
      newOwnerPubkey: "88".repeat(32),
      successorBondVout: 0,
      challengeWindowBlocks: 144,
      chainTipBlockHash: "aa".repeat(32),
      chainTipHeight: 840_100
    });

    expect(message).toContain("profile: bip322");
    expect(message).toContain("name: alice");
    expect(message).toContain(`recoveryDescriptorHash: ${"99".repeat(32)}`);
    expect(message).toContain(`chainTip: ${"aa".repeat(32)}@840100`);
  });

  it("verifies BIP322 recovery wallet proofs against recovery descriptors", () => {
    const recoveryAddress = "tb1q9vza2e8x573nczrlzms0wvx3gsqjx7vaxwd45v";
    const recoveryWalletWif = "L3VFeEujGtevx9w18HD1fhRbCH67Az2dpCymeRE1SoPK6XQtaN2k";
    const descriptor = signRecoveryDescriptor({
      name: "Alice",
      ownerPrivateKeyHex: "0a".repeat(32),
      ownershipRef: "77".repeat(32),
      sequence: 1,
      previousDescriptorHash: null,
      recoveryAddress,
      signingProfile: "bip322",
      challengeWindowBlocks: 144,
      issuedAt: "2026-05-08T12:00:00.000Z"
    });
    const recoveryDescriptorHash = computeRecoveryDescriptorHash(descriptor);
    const proofFields = {
      name: descriptor.name,
      prevStateTxid: descriptor.ownershipRef,
      recoveryDescriptorHash,
      newOwnerPubkey: "88".repeat(32),
      successorBondVout: 0,
      challengeWindowBlocks: descriptor.challengeWindowBlocks
    };
    const signatureBase64 = Signer.sign(
      recoveryWalletWif,
      recoveryAddress,
      createRecoveryWalletProofMessage(proofFields)
    );
    const proof = createRecoveryWalletProof({
      ...proofFields,
      recoveryAddress,
      signingProfile: descriptor.signingProfile,
      signatureBase64
    });

    expect(parseRecoveryWalletProof(proof)).toEqual(proof);
    expect(computeRecoveryWalletProofHash(proof)).toHaveLength(64);
    expect(createRecoveryWalletProofCommitment(proof)).toHaveLength(128);
    expect(
      verifyRecoveryWalletProof({
        descriptor,
        proof,
        expected: {
          prevStateTxid: descriptor.ownershipRef,
          newOwnerPubkey: "88".repeat(32),
          successorBondVout: 0
        }
      })
    ).toMatchObject({
      ok: true,
      reason: "valid"
    });

    expect(
      verifyRecoveryWalletProof({
        descriptor,
        proof: {
          ...proof,
          newOwnerPubkey: "89".repeat(32),
          message: createRecoveryWalletProofMessage({
            ...proofFields,
            newOwnerPubkey: "89".repeat(32)
          })
        }
      })
    ).toMatchObject({
      ok: false,
      reason: "wallet_signature_invalid"
    });
  });
});

describe("transfer packages", () => {
  it("creates a valid transfer package", () => {
    const created = createTransferPackage({
      name: "Psal16sn0m",
      currentStatus: "mature",
      currentOwnerPubkey: "11".repeat(32),
      newOwnerPubkey: "22".repeat(32),
      lastStateTxid: "33".repeat(32),
      currentBondTxid: "44".repeat(32),
      currentBondVout: 0,
      currentBondValueSats: "195312",
      requiredBondSats: "195312",
      recommendedMode: "sale",
      sellerPayoutAddress: " bc1qsellerexample ",
      successorBondAddress: " bc1qbonddestexample ",
      exportedAt: "2026-03-23T14:00:00.000Z",
      modes: [
        {
          key: "gift",
          title: "Gift",
          suitability: "Available",
          summary: "Simple owner handoff.",
          command: "npm run dev:cli -- submit-transfer ..."
        },
        {
          key: "sale",
          title: "Sale",
          suitability: "Selected",
          summary: "Cooperative payment and transfer.",
          command: "npm run dev:cli -- submit-sale-transfer ..."
        }
      ]
    });

    expect(created).toMatchObject({
      format: TRANSFER_PACKAGE_FORMAT,
      packageVersion: TRANSFER_PACKAGE_VERSION,
      protocol: PROTOCOL_NAME,
      name: "psal16sn0m",
      currentStatus: "mature",
      recommendedMode: "sale",
      sellerPayoutAddress: "bc1qsellerexample",
      successorBondAddress: "bc1qbonddestexample"
    });
  });

  it("rejects transfer packages whose recommended mode is not present", () => {
    expect(() =>
      parseTransferPackage({
        format: TRANSFER_PACKAGE_FORMAT,
        packageVersion: TRANSFER_PACKAGE_VERSION,
        protocol: PROTOCOL_NAME,
        exportedAt: "2026-03-23T14:00:00.000Z",
        name: "psal16sn0m",
        currentStatus: "mature",
        currentOwnerPubkey: "11".repeat(32),
        newOwnerPubkey: "22".repeat(32),
        lastStateTxid: "33".repeat(32),
        currentBondTxid: "44".repeat(32),
        currentBondVout: 0,
        currentBondValueSats: "195312",
        requiredBondSats: "195312",
        recommendedMode: "sale",
        sellerPayoutAddress: null,
        successorBondAddress: null,
        modes: [
          {
            key: "gift",
            title: "Gift",
            suitability: "Available",
            summary: "Simple owner handoff.",
            command: "npm run dev:cli -- submit-transfer ..."
          }
        ]
      })
    ).toThrow(/recommendedMode must match/);
  });
});

describe("value records", () => {
  it("signs and verifies owner-authenticated off-chain value records", () => {
    const record = signValueRecord({
      name: "Alice",
      ownerPrivateKeyHex: "0c".repeat(32),
      ownershipRef: "aa".repeat(32),
      sequence: 1,
      previousRecordHash: null,
      valueType: 0x02,
      payloadHex: Buffer.from("https://example.com/alice", "utf8").toString("hex"),
      issuedAt: "2026-04-15T12:00:00.000Z"
    });

    expect(record.format).toBe(VALUE_RECORD_FORMAT);
    expect(record.recordVersion).toBe(VALUE_RECORD_VERSION);
    expect(record.name).toBe("alice");
    expect(record.signature).toHaveLength(128);
    expect(record.ownerPubkey).toHaveLength(64);
    expect(verifyValueRecord(record)).toBe(true);
  });

  it("parses and verifies signed value records", () => {
    const record = signValueRecord({
      name: "bob",
      ownerPrivateKeyHex: "0d".repeat(32),
      ownershipRef: "bb".repeat(32),
      sequence: 3,
      previousRecordHash: "cc".repeat(32),
      valueType: 0x01,
      payloadHex: "001122",
      issuedAt: "2026-04-15T12:01:00.000Z"
    });

    const parsed = parseSignedValueRecord(record);

    expect(parsed).toEqual(record);
    expect(verifyValueRecord(parsed)).toBe(true);
  });
});

describe("recovery descriptors", () => {
  it("signs and verifies owner-authenticated recovery descriptors", () => {
    const descriptor = signRecoveryDescriptor({
      name: "Alice",
      ownerPrivateKeyHex: "0e".repeat(32),
      ownershipRef: "cc".repeat(32),
      sequence: 1,
      previousDescriptorHash: null,
      recoveryAddress: "tb1qexampleexampleexampleexampleexample0l7k7f",
      signingProfile: "bip322",
      challengeWindowBlocks: 144,
      issuedAt: "2026-05-07T12:00:00.000Z"
    });

    expect(descriptor.format).toBe(RECOVERY_DESCRIPTOR_FORMAT);
    expect(descriptor.descriptorVersion).toBe(RECOVERY_DESCRIPTOR_VERSION);
    expect(descriptor.name).toBe("alice");
    expect(descriptor.signingProfile).toBe("bip322");
    expect(descriptor.challengeWindowBlocks).toBe(144);
    expect(descriptor.signature).toHaveLength(128);
    expect(verifyRecoveryDescriptor(descriptor)).toBe(true);
    expect(computeRecoveryDescriptorHash(descriptor)).toMatch(/^[0-9a-f]{64}$/);
    expect(parseSignedRecoveryDescriptor(descriptor)).toEqual(descriptor);
  });

  it("rejects tampered recovery descriptors", () => {
    const descriptor = signRecoveryDescriptor({
      name: "alice",
      ownerPrivateKeyHex: "0f".repeat(32),
      ownershipRef: "dd".repeat(32),
      sequence: 1,
      previousDescriptorHash: null,
      recoveryAddress: "tb1qexampleexampleexampleexampleexample0l7k7f",
      issuedAt: "2026-05-07T12:00:00.000Z"
    });

    expect(verifyRecoveryDescriptor({
      ...descriptor,
      recoveryAddress: "tb1qtamperedexampleexampleexampleexamplev3c4t"
    })).toBe(false);
  });
});
