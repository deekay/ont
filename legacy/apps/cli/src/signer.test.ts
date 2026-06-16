import { describe, expect, it } from "vitest";
import ECPairFactory from "ecpair";
import { initEccLib, networks, payments, Transaction } from "bitcoinjs-lib";
import * as tinysecp from "tiny-secp256k1";

import { createAuctionBidPackage } from "@ont/protocol";

import {
  buildAuctionBidArtifacts,
  buildTransferArtifacts
} from "./builder.js";
import { signArtifacts } from "./signer.js";

initEccLib(tinysecp);
const ECPair = ECPairFactory(tinysecp);

function createFundingFixture(seed = 7) {
  const fundingKey = ECPair.fromPrivateKey(Buffer.alloc(32, seed), {
    network: networks.testnet,
    compressed: true
  });
  const fundingAddress = payments.p2wpkh({
    pubkey: fundingKey.publicKey,
    network: networks.testnet
  }).address;

  if (!fundingAddress) {
    throw new Error("unable to derive funding address");
  }

  return { fundingKey, fundingAddress };
}

function createTestAddress(seed: number): string {
  const address = payments.p2wpkh({
    hash: Buffer.alloc(20, seed),
    network: networks.testnet
  }).address;

  if (!address) {
    throw new Error("unable to derive test address");
  }

  return address;
}

function createAuctionBidPackageFixture() {
  return createAuctionBidPackage({
    auctionId: "04-soft-close-marble",
    name: "marble",
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

describe("signArtifacts", () => {
  it("signs witnesspubkeyhash transfer artifacts and preserves txid", () => {
    const { fundingKey, fundingAddress } = createFundingFixture();
    const artifacts = buildTransferArtifacts({
      prevStateTxid: "44".repeat(32),
      ownerPrivateKeyHex: Buffer.from(fundingKey.privateKey ?? []).toString("hex"),
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
      bondAddress: createTestAddress(3),
      changeAddress: createTestAddress(4)
    });

    const signed = signArtifacts({
      artifacts,
      wifs: [fundingKey.toWIF()]
    });

    expect(signed.kind).toBe("ont-signed-transfer-artifacts");
    expect(signed.signedTransactionId).toBe(artifacts.transferTxid);

    const transaction = Transaction.fromHex(signed.signedTransactionHex);
    expect(transaction.ins[0]?.witness.length).toBeGreaterThan(0);
  });

  it("signs witnesspubkeyhash auction bid artifacts and preserves txid", () => {
    const { fundingKey, fundingAddress } = createFundingFixture();
    const artifacts = buildAuctionBidArtifacts({
      bidPackage: createAuctionBidPackageFixture(),
      fundingInputs: [
        {
          txid: "cc".repeat(32),
          vout: 0,
          valueSats: 1_340_100_000n,
          address: fundingAddress
        }
      ],
      feeSats: 100_000n,
      network: "signet",
      bondAddress: createTestAddress(8),
      changeAddress: fundingAddress
    });

    const signed = signArtifacts({
      artifacts,
      wifs: [fundingKey.toWIF()]
    });

    expect(signed.kind).toBe("ont-signed-auction-bid-artifacts");
    expect(signed.signedTransactionId).toBe(artifacts.bidTxid);

    const transaction = Transaction.fromHex(signed.signedTransactionHex);
    expect(transaction.ins[0]?.witness.length).toBeGreaterThan(0);
  });

  it("signs replacement-style auction bid artifacts with multiple inputs", () => {
    const { fundingKey, fundingAddress } = createFundingFixture();
    const artifacts = buildAuctionBidArtifacts({
      bidPackage: createAuctionBidPackageFixture(),
      fundingInputs: [
        {
          txid: "aa".repeat(32),
          vout: 0,
          valueSats: 1_210_000_000n,
          address: fundingAddress
        },
        {
          txid: "bb".repeat(32),
          vout: 1,
          valueSats: 130_100_000n,
          address: fundingAddress
        }
      ],
      feeSats: 100_000n,
      network: "signet",
      bondAddress: createTestAddress(9),
      changeAddress: fundingAddress
    });

    const signed = signArtifacts({
      artifacts,
      wifs: [fundingKey.toWIF()]
    });

    expect(signed.kind).toBe("ont-signed-auction-bid-artifacts");
    expect(signed.signedTransactionId).toBe(artifacts.bidTxid);

    const transaction = Transaction.fromHex(signed.signedTransactionHex);
    expect(transaction.ins).toHaveLength(2);
    expect(transaction.ins[0]?.witness.length).toBeGreaterThan(0);
    expect(transaction.ins[1]?.witness.length).toBeGreaterThan(0);
  });
});
