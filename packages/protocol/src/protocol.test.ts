import { describe, expect, it } from "vitest";
import * as secp256k1 from "tiny-secp256k1";

import {
  AUCTION_BID_FIXED_PAYLOAD_LENGTH,
  BOND_FLOOR_SATS,
  computeAuctionBidderCommitment,
  computeAuctionBidStateCommitment,
  computeAuctionLotCommitment,
  computeTransferAuthorizationHash,
  createTransferPackage,
  decodeAuctionBidPayload,
  decodeOntPayload,
  decodeTransferBody,
  encodeAuctionBidPayload,
  encodeTransferBody,
  encodeTransferPayload,
  getBondSats,
  getEpochIndex,
  getMaturityBlocks,
  INITIAL_MATURITY_BLOCKS,
  MIN_MATURITY_BLOCKS,
  normalizeName,
  OntEventType,
  parseSignedValueRecord,
  parseTransferPackage,
  PROTOCOL_NAME,
  signTransferAuthorization,
  signValueRecord,
  TRANSFER_PACKAGE_FORMAT,
  TRANSFER_PACKAGE_VERSION,
  VALUE_RECORD_FORMAT,
  VALUE_RECORD_VERSION,
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

describe("bond and maturity helpers", () => {
  it("halves per additional character before reaching the floor", () => {
    expect(getBondSats(1)).toBe(100_000_000n);
    expect(getBondSats(2)).toBe(50_000_000n);
    expect(getBondSats(3)).toBe(25_000_000n);
  });

  it("holds the configured floor for long names", () => {
    expect(getBondSats(12)).toBe(BOND_FLOOR_SATS);
    expect(getBondSats(32)).toBe(BOND_FLOOR_SATS);
  });

  it("derives maturity from the launch epoch", () => {
    expect(getMaturityBlocks(0)).toBe(INITIAL_MATURITY_BLOCKS);
    expect(getMaturityBlocks(1)).toBe(26_000);
    expect(getMaturityBlocks(4)).toBe(MIN_MATURITY_BLOCKS);
    expect(getEpochIndex(552_000, 500_000)).toBe(1);
  });
});

describe("auction and transfer wire payloads", () => {
  it("round-trips auction bid payloads", () => {
    const payload = {
      flags: 0,
      bondVout: 0,
      settlementLockBlocks: 262_800,
      bidAmountSats: 200_000_000n,
      ownerPubkey: "ab".repeat(32),
      auctionLotCommitment: computeAuctionLotCommitment({
        auctionId: "meadow-soft-close",
        name: "meadow",
        auctionClassId: "launch_name",
        unlockBlock: 840_000
      }),
      auctionCommitment: computeAuctionBidStateCommitment({
        auctionId: "meadow-soft-close",
        name: "meadow",
        auctionClassId: "launch_name",
        currentBlockHeight: 844_360,
        phase: "soft_close",
        unlockBlock: 840_000,
        auctionCloseBlockAfter: 844_497,
        openingMinimumBidSats: 200_000_000n,
        currentLeaderBidderCommitment: computeAuctionBidderCommitment("gamma"),
        currentHighestBidSats: 210_000_000n,
        currentRequiredMinimumBidSats: 231_000_000n,
        settlementLockBlocks: 262_800
      }),
      bidderCommitment: computeAuctionBidderCommitment("operator_alpha"),
      name: "Meadow",
      unlockBlock: 840_000
    };
    const expectedPayload = {
      ...payload,
      flags: 1,
      name: "meadow"
    };

    const encoded = encodeAuctionBidPayload(payload);

    expect(encoded.length).toBeGreaterThan(AUCTION_BID_FIXED_PAYLOAD_LENGTH);
    expect(decodeAuctionBidPayload(encoded)).toEqual(expectedPayload);
    expect(decodeOntPayload(encoded)).toEqual({
      type: OntEventType.AuctionBid,
      payload: expectedPayload
    });
  });

  it("rejects legacy commitment-only auction bid payloads", () => {
    const legacyPayload = Uint8Array.from([
      ...Buffer.from("ONT", "utf8"),
      1,
      OntEventType.AuctionBid,
      ...new Uint8Array(AUCTION_BID_FIXED_PAYLOAD_LENGTH - 5)
    ]);

    expect(() => decodeAuctionBidPayload(legacyPayload)).toThrow(/name context/i);
  });

  it("round-trips transfer payloads", () => {
    const payload = {
      prevStateTxid: "44".repeat(32),
      newOwnerPubkey: "55".repeat(32),
      flags: 0x00,
      successorBondVout: 0x02,
      signature: "66".repeat(64)
    };

    expect(decodeTransferBody(encodeTransferBody(payload))).toEqual(payload);
    expect(decodeOntPayload(encodeTransferPayload(payload))).toEqual({
      type: OntEventType.Transfer,
      payload
    });
  });

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
