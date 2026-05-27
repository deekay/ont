import { buildAuctionBidArtifacts, parseFundingInputDescriptor } from "@ont/architect";
import { createAuctionBidPackage } from "@ont/protocol";
import { describe, expect, it } from "vitest";

import { generateFundingKey, generateOwnerKey, type OntNetwork } from "./keys.js";
import { signAuctionBidArtifacts, SignerError } from "./signer.js";

const NETWORK: OntNetwork = "regtest";

function buildArtifacts(fundingAddress: string, ownerPubkey: string) {
  const bidPackage = createAuctionBidPackage({
    auctionId: "auction-test",
    name: "satoshi",
    auctionClassId: "class-a",
    classLabel: "Class A",
    currentBlockHeight: 200,
    phase: "awaiting_opening_bid",
    unlockBlock: 100,
    openingMinimumBidSats: 10_000,
    currentRequiredMinimumBidSats: 10_000,
    settlementLockBlocks: 144,
    bidderId: "bidder-1",
    ownerPubkey,
    bidAmountSats: 20_000
  });

  return buildAuctionBidArtifacts({
    bidPackage,
    fundingInputs: [parseFundingInputDescriptor(`${"11".repeat(32)}:0:50000:${fundingAddress}`)],
    feeSats: 500n,
    network: NETWORK,
    bondAddress: fundingAddress,
    changeAddress: fundingAddress
  });
}

describe("signAuctionBidArtifacts", () => {
  it("signs the funding input and extracts a transaction matching the unsigned txid", () => {
    const owner = generateOwnerKey();
    const funding = generateFundingKey(NETWORK);
    const artifacts = buildArtifacts(funding.fundingAddress, owner.ownerPubkey);

    const signed = signAuctionBidArtifacts({
      artifacts,
      fundingWif: funding.fundingWif,
      network: NETWORK
    });

    expect(signed.signedInputCount).toBe(1);
    expect(signed.signedTransactionId).toBe(artifacts.bidTxid);
    expect(signed.signedTransactionHex).toMatch(/^[0-9a-f]+$/);
  });

  it("throws when the funding key does not match the input", () => {
    const owner = generateOwnerKey();
    const funding = generateFundingKey(NETWORK);
    const otherFunding = generateFundingKey(NETWORK);
    const artifacts = buildArtifacts(funding.fundingAddress, owner.ownerPubkey);

    expect(() =>
      signAuctionBidArtifacts({
        artifacts,
        fundingWif: otherFunding.fundingWif,
        network: NETWORK
      })
    ).toThrow(SignerError);
  });
});
