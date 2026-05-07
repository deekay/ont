import { describe, expect, it } from "vitest";
import ECPairFactory from "ecpair";
import { initEccLib, networks, payments, Transaction } from "bitcoinjs-lib";
import * as tinysecp from "tiny-secp256k1";

import {
  createAuctionBidPackage,
  decodeAuctionBidPayload,
  decodeOntPayload,
  OntEventType
} from "@ont/protocol";

import {
  buildAuctionBidArtifacts,
  buildImmatureSaleTransferArtifacts,
  buildSaleTransferArtifacts,
  buildTransferArtifacts,
  parseFundingInputDescriptor
} from "./builder.js";

initEccLib(tinysecp);
const ECPair = ECPairFactory(tinysecp);

function createTestAddress(seed: number): string {
  const hash = Buffer.alloc(20, seed);
  const address = payments.p2wpkh({ hash, network: networks.testnet }).address;

  if (!address) {
    throw new Error("unable to derive test address");
  }

  return address;
}

function createAuctionBidPackageFixture() {
  return createAuctionBidPackage({
    auctionId: "04-soft-close-marble",
    name: "marble",
    auctionClassId: "launch_name",
    classLabel: "Public auction",
    currentBlockHeight: 844_360,
    phase: "soft_close",
    unlockBlock: 840_000,
    auctionCloseBlockAfter: 844_497,
    openingMinimumBidSats: 1_000_000_000n,
    currentLeaderBidderId: "gamma",
    currentHighestBidSats: 1_210_000_000n,
    currentRequiredMinimumBidSats: 1_331_000_000n,
    settlementLockBlocks: 525_600,
    bidderId: "operator_alpha",
    ownerPubkey: "33".repeat(32),
    bidAmountSats: 1_340_000_000n,
    exportedAt: "2026-04-11T22:00:00.000Z"
  });
}

describe("parseFundingInputDescriptor", () => {
  it("parses txid:vout:value:address descriptors", () => {
    const descriptor = parseFundingInputDescriptor(
      `${"aa".repeat(32)}:1:50000:${createTestAddress(7)}`
    );

    expect(descriptor).toEqual({
      txid: "aa".repeat(32),
      vout: 1,
      valueSats: 50000n,
      address: createTestAddress(7)
    });
  });

  it("parses descriptors with derivation paths", () => {
    const descriptor = parseFundingInputDescriptor(
      `${"bb".repeat(32)}:2:75000:${createTestAddress(8)}:m/84'/1'/0'/0/5`
    );

    expect(descriptor).toEqual({
      txid: "bb".repeat(32),
      vout: 2,
      valueSats: 75000n,
      address: createTestAddress(8),
      derivationPath: "m/84'/1'/0'/0/5"
    });
  });
});

describe("buildAuctionBidArtifacts", () => {
  it("builds unsigned auction bid artifacts from a bid package", () => {
    const bidPackage = createAuctionBidPackageFixture();
    const artifacts = buildAuctionBidArtifacts({
      bidPackage,
      fundingInputs: [
        {
          txid: "cc".repeat(32),
          vout: 0,
          valueSats: 1_340_100_000n,
          address: createTestAddress(13)
        }
      ],
      feeSats: 100_000n,
      network: "signet",
      bondAddress: createTestAddress(14),
      changeAddress: createTestAddress(15)
    });

    expect(artifacts.kind).toBe("ont-auction-bid-artifacts");
    expect(artifacts.bidTxid).toHaveLength(64);
    expect(artifacts.outputs[0]?.role).toBe("auction_bid_bond");
    expect(artifacts.outputs[0]?.valueSats).toBe("1340000000");
    expect(artifacts.outputs[1]?.role).toBe("ont_auction_bid");

    const transaction = Transaction.fromHex(artifacts.unsignedTransactionHex);
    expect(transaction.outs[0]?.value).toBe(1_340_000_000n);
    const payload = decodeAuctionBidPayload(Buffer.from(artifacts.payloadHex, "hex"));
    expect(payload.bidAmountSats).toBe(1_340_000_000n);
    expect(payload.settlementLockBlocks).toBe(525_600);
    expect(payload.bondVout).toBe(0);
    expect(payload.name).toBe("marble");
    expect(payload.unlockBlock).toBe(840_000);
    expect(decodeOntPayload(Buffer.from(artifacts.payloadHex, "hex"))).toEqual({
      type: OntEventType.AuctionBid,
      payload
    });
  });

  it("supports rebid artifacts that spend a prior bid bond input", () => {
    const bidPackage = createAuctionBidPackageFixture();
    const artifacts = buildAuctionBidArtifacts({
      bidPackage,
      fundingInputs: [
        {
          txid: "aa".repeat(32),
          vout: 0,
          valueSats: 1_210_000_000n,
          address: createTestAddress(16)
        },
        {
          txid: "bb".repeat(32),
          vout: 1,
          valueSats: 131_000_000n,
          address: createTestAddress(17)
        }
      ],
      feeSats: 1_000_000n,
      network: "signet",
      bondAddress: createTestAddress(18),
      changeAddress: createTestAddress(19)
    });

    const transaction = Transaction.fromHex(artifacts.unsignedTransactionHex);
    expect(transaction.ins).toHaveLength(2);
    expect(artifacts.outputs[0]?.role).toBe("auction_bid_bond");
    expect(artifacts.outputs[0]?.valueSats).toBe("1340000000");
    expect(artifacts.changeValueSats).toBe("0");
  });
});

describe("buildTransferArtifacts", () => {
  it("builds unsigned transfer artifacts with a successor bond and embedded transfer payload", () => {
    const ownerKey = ECPair.fromPrivateKey(Buffer.alloc(32, 7), {
      network: networks.testnet,
      compressed: true
    });
    const fundingAddress = payments.p2wpkh({
      pubkey: ownerKey.publicKey,
      network: networks.testnet
    }).address;

    if (!fundingAddress) {
      throw new Error("unable to derive funding address");
    }

    const artifacts = buildTransferArtifacts({
      prevStateTxid: "44".repeat(32),
      ownerPrivateKeyHex: Buffer.from(ownerKey.privateKey ?? []).toString("hex"),
      newOwnerPubkey: "55".repeat(32),
      successorBondVout: 0,
      successorBondSats: 25_000_000n,
      currentBondInput: {
        txid: "aa".repeat(32),
        vout: 0,
        valueSats: 25_000_000n,
        address: fundingAddress
      },
      additionalFundingInputs: [
        {
          txid: "bb".repeat(32),
          vout: 1,
          valueSats: 10_000n,
          address: fundingAddress
        }
      ],
      feeSats: 1_000n,
      network: "signet",
      bondAddress: createTestAddress(9),
      changeAddress: createTestAddress(10)
    });

    expect(artifacts.kind).toBe("ont-transfer-artifacts");
    expect(artifacts.transferTxid).toHaveLength(64);

    const transaction = Transaction.fromHex(artifacts.unsignedTransactionHex);
    expect(transaction.outs[0]?.value).toBe(25_000_000n);
    expect(transaction.outs[1]?.value).toBe(0n);
  });
});

describe("buildSaleTransferArtifacts", () => {
  it("builds unsigned cooperative sale-transfer artifacts with seller payment and buyer/seller change outputs", () => {
    const sellerKey = ECPair.fromPrivateKey(Buffer.alloc(32, 12), {
      network: networks.testnet,
      compressed: true
    });
    const buyerKey = ECPair.fromPrivateKey(Buffer.alloc(32, 13), {
      network: networks.testnet,
      compressed: true
    });
    const sellerAddress = payments.p2wpkh({
      pubkey: sellerKey.publicKey,
      network: networks.testnet
    }).address;
    const buyerAddress = payments.p2wpkh({
      pubkey: buyerKey.publicKey,
      network: networks.testnet
    }).address;
    const sellerPaymentAddress = createTestAddress(14);

    if (!sellerAddress || !buyerAddress) {
      throw new Error("unable to derive sale test addresses");
    }

    const artifacts = buildSaleTransferArtifacts({
      prevStateTxid: "66".repeat(32),
      ownerPrivateKeyHex: Buffer.from(sellerKey.privateKey ?? []).toString("hex"),
      newOwnerPubkey: "77".repeat(32),
      sellerInputs: [
        {
          txid: "aa".repeat(32),
          vout: 0,
          valueSats: 12_000n,
          address: sellerAddress
        }
      ],
      buyerInputs: [
        {
          txid: "bb".repeat(32),
          vout: 1,
          valueSats: 55_000n,
          address: buyerAddress
        }
      ],
      sellerPaymentSats: 40_000n,
      sellerPaymentAddress,
      feeSats: 1_000n,
      network: "signet",
      sellerChangeAddress: sellerAddress,
      buyerChangeAddress: buyerAddress
    });

    expect(artifacts.kind).toBe("ont-transfer-artifacts");
    expect(artifacts.mode).toBe("sale");
    expect(artifacts.transferTxid).toHaveLength(64);

    const transaction = Transaction.fromHex(artifacts.unsignedTransactionHex);
    expect(transaction.outs[0]?.value).toBe(0n);
    expect(transaction.outs[1]?.value).toBe(40_000n);
    expect(transaction.outs[2]?.value).toBe(12_000n);
    expect(transaction.outs[3]?.value).toBe(14_000n);
  });
});

describe("buildImmatureSaleTransferArtifacts", () => {
  it("builds unsigned immature sale-transfer artifacts where the buyer funds the successor bond", () => {
    const sellerKey = ECPair.fromPrivateKey(Buffer.alloc(32, 30), {
      network: networks.testnet,
      compressed: true
    });
    const buyerKey = ECPair.fromPrivateKey(Buffer.alloc(32, 31), {
      network: networks.testnet,
      compressed: true
    });
    const sellerAddress = payments.p2wpkh({
      pubkey: sellerKey.publicKey,
      network: networks.testnet
    }).address;
    const buyerAddress = payments.p2wpkh({
      pubkey: buyerKey.publicKey,
      network: networks.testnet
    }).address;
    const sellerPayoutAddress = createTestAddress(32);

    if (!sellerAddress || !buyerAddress) {
      throw new Error("unable to derive immature sale test addresses");
    }

    const artifacts = buildImmatureSaleTransferArtifacts({
      prevStateTxid: "88".repeat(32),
      ownerPrivateKeyHex: Buffer.from(sellerKey.privateKey ?? []).toString("hex"),
      newOwnerPubkey: "99".repeat(32),
      successorBondVout: 0,
      successorBondSats: 25_000_000n,
      currentBondInput: {
        txid: "aa".repeat(32),
        vout: 0,
        valueSats: 25_000_000n,
        address: sellerAddress
      },
      sellerInputs: [
        {
          txid: "ab".repeat(32),
          vout: 1,
          valueSats: 5_000n,
          address: sellerAddress
        }
      ],
      buyerInputs: [
        {
          txid: "bb".repeat(32),
          vout: 2,
          valueSats: 25_050_000n,
          address: buyerAddress
        }
      ],
      salePriceSats: 40_000n,
      sellerPayoutAddress,
      feeSats: 1_000n,
      network: "signet",
      bondAddress: buyerAddress,
      buyerChangeAddress: buyerAddress
    });

    expect(artifacts.kind).toBe("ont-transfer-artifacts");
    expect(artifacts.mode).toBe("immature-sale");
    expect(artifacts.transferTxid).toHaveLength(64);

    const transaction = Transaction.fromHex(artifacts.unsignedTransactionHex);
    expect(transaction.outs[0]?.value).toBe(25_000_000n);
    expect(transaction.outs[1]?.value).toBe(0n);
    expect(transaction.outs[2]?.value).toBe(25_045_000n);
    expect(transaction.outs[3]?.value).toBe(9_000n);
  });
});
