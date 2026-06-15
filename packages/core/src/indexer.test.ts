import { describe, expect, it } from "vitest";
import * as secp256k1 from "tiny-secp256k1";

import type { BitcoinBlock, BitcoinTransactionOutput } from "@ont/bitcoin";
import {
  computeAuctionBidderCommitment,
  computeAuctionBidStateCommitment,
  computeAuctionLotCommitment,
  encodeAuctionBidPayload,
  encodeRecoverOwnerPayload,
  encodeTransferPayload,
  RECOVER_OWNER_FLAG_CANCEL,
  signRecoverOwnerCancelAuthorization,
  signTransferAuthorization
} from "@ont/protocol";

import { createDefaultLaunchAuctionPolicy, getLaunchAuctionOpeningRequirements, type LaunchAuctionPolicy } from "./auction-policy.js";
import { getExperimentalLaunchAuctionId } from "./experimental-auction.js";
import { InMemoryOntIndexer } from "./indexer.js";

const OWNER_PRIVATE_KEY_HEX = "07".repeat(32);
const OWNER_PUBKEY = deriveXOnlyPubkey(OWNER_PRIVATE_KEY_HEX);
const NEW_OWNER_PUBKEY = deriveXOnlyPubkey("08".repeat(32));
const RECOVERY_DESCRIPTOR_HASH = "dd".repeat(32);

describe("InMemoryOntIndexer auction observations", () => {
  it("discovers named auction bids from chain-derived records", () => {
    const policy = createFastAuctionPolicy();
    const name = "satoshi";
    const currentBlockHeight = 790;
    const unlockBlock = 0;
    const auctionId = `opening-${name}`;
    const bidderCommitment = computeAuctionBidderCommitment("operator_satoshi");
    const openingRequirements = getLaunchAuctionOpeningRequirements({
      policy,
      name
    });
    const auctionLotCommitment = computeAuctionLotCommitment({
      auctionId,
      name,
      unlockBlock
    });
    const bidAmountSats = openingRequirements.openingMinimumBidSats;
    const auctionCommitment = computeAuctionBidStateCommitment({
      auctionId,
      name,
      currentBlockHeight,
      phase: "awaiting_opening_bid",
      unlockBlock,
      auctionCloseBlockAfter: null,
      openingMinimumBidSats: openingRequirements.openingMinimumBidSats,
      currentLeaderBidderCommitment: null,
      currentHighestBidSats: null,
      currentRequiredMinimumBidSats: openingRequirements.openingMinimumBidSats,
      settlementLockBlocks: openingRequirements.settlementLockBlocks
    });
    const payload = encodeAuctionBidPayload({
      flags: 0,
      bondVout: 0,
      settlementLockBlocks: openingRequirements.settlementLockBlocks,
      bidAmountSats,
      ownerPubkey: "ab".repeat(32),
      auctionLotCommitment,
      auctionCommitment,
      bidderCommitment,
      name,
      unlockBlock
    });
    const block: BitcoinBlock = {
      hash: "11".repeat(32),
      height: currentBlockHeight,
      transactions: [
        {
          txid: "22".repeat(32),
          inputs: [{ txid: "33".repeat(32), vout: 0, coinbase: false }],
          outputs: [
            { valueSats: bidAmountSats, scriptType: "payment" },
            { valueSats: 0n, scriptType: "op_return", dataHex: Buffer.from(payload).toString("hex") }
          ]
        }
      ]
    };
    const indexer = new InMemoryOntIndexer({ launchHeight: 0, experimentalLaunchAuctionPolicy: policy });

    indexer.ingestBlock(block);

    const auction = indexer.listExperimentalAuctions().find((entry) => entry.normalizedName === name);
    expect(auction).toMatchObject({
      auctionId,
      normalizedName: name,
      acceptedBidCount: 1,
      currentHighestBidSats: bidAmountSats.toString()
    });
    expect(indexer.listRecentActivityForName(name, 1)[0]?.events[0]?.affectedName).toBe(name);
  });

  it("ignores malformed auction bids whose bond output is missing, non-payment, or value-mismatched", () => {
    const policy = createFastAuctionPolicy();
    const cases = [
      {
        label: "missing bond output",
        name: "missingbond",
        txid: hexByte(0x23),
        block: createOpeningBidBlock({
          policy,
          name: "missingbond",
          height: 10,
          txid: hexByte(0x23),
          ownerPubkey: OWNER_PUBKEY,
          payloadBondVout: 2
        }).block,
        reason: "auction_bid_missing_bond_output"
      },
      {
        label: "non-payment bond output",
        name: "opreturnbond",
        txid: hexByte(0x24),
        block: createOpeningBidBlock({
          policy,
          name: "opreturnbond",
          height: 11,
          txid: hexByte(0x24),
          ownerPubkey: OWNER_PUBKEY,
          bondOutputScriptType: "op_return"
        }).block,
        reason: "auction_bid_bond_output_not_payment"
      },
      {
        label: "value-mismatched bond output",
        name: "shortbond",
        txid: hexByte(0x25),
        block: createOpeningBidBlock({
          policy,
          name: "shortbond",
          height: 12,
          txid: hexByte(0x25),
          ownerPubkey: OWNER_PUBKEY,
          bondOutputValueSats: getLaunchAuctionOpeningRequirements({
            policy,
            name: "shortbond"
          }).openingMinimumBidSats - 1n
        }).block,
        reason: "auction_bid_bond_value_mismatch"
      }
    ] as const;
    const indexer = new InMemoryOntIndexer({ launchHeight: 0, experimentalLaunchAuctionPolicy: policy });

    for (const entry of cases) {
      indexer.ingestBlock(entry.block);

      expect(indexer.getTransactionProvenance(entry.txid)?.events[0]).toMatchObject({
        typeName: "AUCTION_BID",
        validationStatus: "ignored",
        reason: entry.reason,
        affectedName: null
      });
      expect(indexer.listExperimentalAuctions().some((auction) => auction.normalizedName === entry.name)).toBe(false);
    }
  });

  it("materializes a settled winning auction bid into an immature owned name", () => {
    const policy = createFastAuctionPolicy();
    const name = "orchard";
    const openingBid = createOpeningBidBlock({
      policy,
      name,
      height: 10,
      txid: hexByte(0x22),
      ownerPubkey: OWNER_PUBKEY
    });
    const indexer = new InMemoryOntIndexer({ launchHeight: 0, experimentalLaunchAuctionPolicy: policy });

    indexer.ingestBlocks([
      openingBid.block,
      emptyBlock(13, 0x33)
    ]);

    expect(indexer.getName(name)).toMatchObject({
      name,
      status: "immature",
      acquisitionKind: "auction",
      currentOwnerPubkey: OWNER_PUBKEY,
      currentBondTxid: openingBid.txid,
      currentBondVout: 0,
      requiredBondSats: openingBid.bidAmountSats,
      maturityHeight: 15
    });
  });

  it("releases an auction-owned name when the winning bond is spent before maturity without a successor bond", () => {
    const policy = createFastAuctionPolicy();
    const name = "orchard";
    const openingBid = createOpeningBidBlock({
      policy,
      name,
      height: 10,
      txid: hexByte(0x22),
      ownerPubkey: OWNER_PUBKEY
    });
    const indexer = new InMemoryOntIndexer({ launchHeight: 0, experimentalLaunchAuctionPolicy: policy });

    indexer.ingestBlocks([
      openingBid.block,
      emptyBlock(13, 0x33),
      spendBondBlock({
        height: 14,
        txid: hexByte(0x44),
        spentTxid: openingBid.txid,
        spentVout: 0
      })
    ]);

    expect(indexer.getName(name)).toMatchObject({
      name,
      status: "invalid",
      currentBondTxid: openingBid.txid
    });
    expect(indexer.getTransactionProvenance(hexByte(0x44))?.invalidatedNames).toEqual([name]);
  });

  it("does not materialize live ownership if the winning bond was already spent before auction settlement", () => {
    const policy = createFastAuctionPolicy();
    const name = "orchard";
    const openingBid = createOpeningBidBlock({
      policy,
      name,
      height: 10,
      txid: hexByte(0x22),
      ownerPubkey: OWNER_PUBKEY
    });
    const indexer = new InMemoryOntIndexer({ launchHeight: 0, experimentalLaunchAuctionPolicy: policy });

    indexer.ingestBlocks([
      openingBid.block,
      spendBondBlock({
        height: 11,
        txid: hexByte(0x44),
        spentTxid: openingBid.txid,
        spentVout: 0
      }),
      emptyBlock(13, 0x33)
    ]);

    const auction = indexer.getExperimentalAuction(`opening-${name}`);
    expect(indexer.getName(name)).toBeNull();
    expect(auction?.phase).toBe("settled");
    expect(auction?.visibleBidOutcomes[0]).toMatchObject({
      bondSpendStatus: "spent_before_allowed_release"
    });
  });

  it("preserves an immature auction-owned name when transfer spends the old bond and creates a successor bond", () => {
    const policy = createFastAuctionPolicy();
    const name = "orchard";
    const openingBid = createOpeningBidBlock({
      policy,
      name,
      height: 10,
      txid: hexByte(0x22),
      ownerPubkey: OWNER_PUBKEY
    });
    const transferTxid = hexByte(0x44);
    const indexer = new InMemoryOntIndexer({ launchHeight: 0, experimentalLaunchAuctionPolicy: policy });

    indexer.ingestBlocks([
      openingBid.block,
      emptyBlock(13, 0x33),
      transferBlock({
        height: 14,
        txid: transferTxid,
        prevStateTxid: openingBid.txid,
        spentBondTxid: openingBid.txid,
        spentBondVout: 0,
        successorBondSats: openingBid.bidAmountSats
      })
    ]);

    expect(indexer.getName(name)).toMatchObject({
      name,
      status: "immature",
      currentOwnerPubkey: NEW_OWNER_PUBKEY,
      currentBondTxid: transferTxid,
      currentBondVout: 0,
      currentBondValueSats: openingBid.bidAmountSats,
      maturityHeight: 15
    });
    expect(indexer.getTransactionProvenance(transferTxid)).toMatchObject({
      invalidatedNames: [],
      events: [
        {
          typeName: "TRANSFER",
          validationStatus: "applied",
          reason: "transfer_applied_immature",
          affectedName: name
        }
      ]
    });
  });

  it("transfers a MATURE name and rewrites the owner without bond continuity", () => {
    const policy = createFastAuctionPolicy();
    const name = "orchard";
    const openingBid = createOpeningBidBlock({
      policy,
      name,
      height: 10,
      txid: hexByte(0x22),
      ownerPubkey: OWNER_PUBKEY
    });
    const transferTxid = hexByte(0x55);
    const indexer = new InMemoryOntIndexer({ launchHeight: 0, experimentalLaunchAuctionPolicy: policy });

    indexer.ingestBlocks([
      openingBid.block,
      emptyBlock(13, 0x33),
      emptyBlock(16, 0x34),
      transferBlock({
        height: 17,
        txid: transferTxid,
        prevStateTxid: openingBid.txid,
        spentBondTxid: openingBid.txid,
        spentBondVout: 0,
        successorBondSats: openingBid.bidAmountSats
      })
    ]);

    // A mature transfer rewrites ownership without requiring bond continuity.
    expect(indexer.getName(name)).toMatchObject({
      name,
      currentOwnerPubkey: NEW_OWNER_PUBKEY,
      lastStateTxid: transferTxid,
      lastStateHeight: 17
    });
    expect(indexer.getTransactionProvenance(transferTxid)).toMatchObject({
      events: [
        {
          typeName: "TRANSFER",
          validationStatus: "applied",
          reason: "transfer_applied_mature",
          affectedName: name
        }
      ]
    });
  });

  it("rejects a transfer signed by a key other than the current owner", () => {
    const policy = createFastAuctionPolicy();
    const name = "orchard";
    const openingBid = createOpeningBidBlock({
      policy,
      name,
      height: 10,
      txid: hexByte(0x22),
      ownerPubkey: OWNER_PUBKEY
    });
    const transferTxid = hexByte(0x44);
    const indexer = new InMemoryOntIndexer({ launchHeight: 0, experimentalLaunchAuctionPolicy: policy });

    indexer.ingestBlocks([
      openingBid.block,
      emptyBlock(13, 0x33),
      transferBlock({
        height: 14,
        txid: transferTxid,
        prevStateTxid: openingBid.txid,
        spentBondTxid: openingBid.txid,
        spentBondVout: 0,
        successorBondSats: openingBid.bidAmountSats,
        signingPrivateKeyHex: "09".repeat(32)
      })
    ]);

    expect(indexer.getName(name)?.currentOwnerPubkey).toBe(OWNER_PUBKEY);
    expect(indexer.getTransactionProvenance(transferTxid)).toMatchObject({
      events: [
        {
          typeName: "TRANSFER",
          validationStatus: "ignored",
          reason: "transfer_invalid_signature",
          affectedName: name
        }
      ]
    });
  });

  it("ignores a transfer whose prevStateTxid matches no name record", () => {
    const policy = createFastAuctionPolicy();
    const name = "orchard";
    const openingBid = createOpeningBidBlock({
      policy,
      name,
      height: 10,
      txid: hexByte(0x22),
      ownerPubkey: OWNER_PUBKEY
    });
    const transferTxid = hexByte(0x44);
    const indexer = new InMemoryOntIndexer({ launchHeight: 0, experimentalLaunchAuctionPolicy: policy });

    indexer.ingestBlocks([
      openingBid.block,
      emptyBlock(13, 0x33),
      transferBlock({
        height: 14,
        txid: transferTxid,
        prevStateTxid: hexByte(0xee), // no record has this lastStateTxid
        spentBondTxid: openingBid.txid,
        spentBondVout: 0,
        successorBondSats: openingBid.bidAmountSats
      })
    ]);

    expect(indexer.getName(name)?.currentOwnerPubkey).toBe(OWNER_PUBKEY);
    expect(indexer.getTransactionProvenance(transferTxid)).toMatchObject({
      events: [
        {
          typeName: "TRANSFER",
          validationStatus: "ignored",
          reason: "transfer_name_not_found_or_invalid",
          affectedName: null
        }
      ]
    });
  });

  it("rejects an immature transfer that does not spend the current bond", () => {
    const policy = createFastAuctionPolicy();
    const name = "orchard";
    const openingBid = createOpeningBidBlock({
      policy,
      name,
      height: 10,
      txid: hexByte(0x22),
      ownerPubkey: OWNER_PUBKEY
    });
    const transferTxid = hexByte(0x44);
    const indexer = new InMemoryOntIndexer({ launchHeight: 0, experimentalLaunchAuctionPolicy: policy });

    indexer.ingestBlocks([
      openingBid.block,
      emptyBlock(13, 0x33),
      transferBlock({
        height: 14,
        txid: transferTxid,
        prevStateTxid: openingBid.txid,
        spentBondTxid: hexByte(0xab), // spends some other outpoint, not the current bond
        spentBondVout: 0,
        successorBondSats: openingBid.bidAmountSats
      })
    ]);

    expect(indexer.getName(name)?.currentOwnerPubkey).toBe(OWNER_PUBKEY);
    expect(indexer.getTransactionProvenance(transferTxid)).toMatchObject({
      events: [
        {
          typeName: "TRANSFER",
          validationStatus: "ignored",
          reason: "transfer_missing_bond_spend",
          affectedName: name
        }
      ]
    });
  });

  it("rejects an immature transfer whose successor bond is below the required bond", () => {
    const policy = createFastAuctionPolicy();
    const name = "orchard";
    const openingBid = createOpeningBidBlock({
      policy,
      name,
      height: 10,
      txid: hexByte(0x22),
      ownerPubkey: OWNER_PUBKEY
    });
    const transferTxid = hexByte(0x44);
    const indexer = new InMemoryOntIndexer({ launchHeight: 0, experimentalLaunchAuctionPolicy: policy });

    indexer.ingestBlocks([
      openingBid.block,
      emptyBlock(13, 0x33),
      transferBlock({
        height: 14,
        txid: transferTxid,
        prevStateTxid: openingBid.txid,
        spentBondTxid: openingBid.txid,
        spentBondVout: 0,
        successorBondSats: 1n // far below the required bond
      })
    ]);

    expect(indexer.getName(name)?.currentOwnerPubkey).toBe(OWNER_PUBKEY);
    expect(indexer.getTransactionProvenance(transferTxid)).toMatchObject({
      events: [
        {
          typeName: "TRANSFER",
          validationStatus: "ignored",
          reason: "transfer_invalid_successor_bond",
          affectedName: name
        }
      ]
    });
  });

  it.skip("[B3] finalizes bond-authorized owner recovery after the challenge window", () => {
    const policy = createFastAuctionPolicy();
    const name = "orchard";
    const openingBid = createOpeningBidBlock({
      policy,
      name,
      height: 10,
      txid: hexByte(0x22),
      ownerPubkey: OWNER_PUBKEY
    });
    const recoveryTxid = hexByte(0x44);
    const indexer = createRecoveryProofAwareIndexer(policy);

    indexer.ingestBlocks([
      openingBid.block,
      emptyBlock(13, 0x33),
      recoverOwnerRequestBlock({
        height: 14,
        txid: recoveryTxid,
        prevStateTxid: openingBid.txid,
        spentBondTxid: openingBid.txid,
        spentBondVout: 0,
        successorBondSats: openingBid.bidAmountSats,
        challengeWindowBlocks: 2
      }),
      emptyBlock(15, 0x55)
    ]);

    expect(indexer.getName(name)).toMatchObject({
      currentOwnerPubkey: OWNER_PUBKEY,
      currentBondTxid: recoveryTxid,
      pendingRecovery: {
        requestedTxid: recoveryTxid,
        finalizeHeight: 16,
        proposedOwnerPubkey: NEW_OWNER_PUBKEY
      }
    });

    indexer.ingestBlock(emptyBlock(16, 0x66));

    expect(indexer.getName(name)).toMatchObject({
      currentOwnerPubkey: NEW_OWNER_PUBKEY,
      currentBondTxid: recoveryTxid,
      currentBondValueSats: openingBid.bidAmountSats,
      lastStateTxid: recoveryTxid,
      lastStateHeight: 16
    });
    expect(indexer.getName(name)?.pendingRecovery).toBeUndefined();
    expect(indexer.getTransactionProvenance(recoveryTxid)).toMatchObject({
      events: [
        {
          typeName: "RECOVER_OWNER",
          validationStatus: "applied",
          reason: "recovery_requested",
          affectedName: name
        }
      ]
    });
  });

  it.skip("[B3 / OBSOLETE] does not enter pending recovery without the matching wallet proof", () => {
    const policy = createFastAuctionPolicy();
    const name = "orchard";
    const openingBid = createOpeningBidBlock({
      policy,
      name,
      height: 10,
      txid: hexByte(0x22),
      ownerPubkey: OWNER_PUBKEY
    });
    const recoveryTxid = hexByte(0x44);
    const indexer = new InMemoryOntIndexer({ launchHeight: 0, experimentalLaunchAuctionPolicy: policy });

    indexer.ingestBlocks([
      openingBid.block,
      emptyBlock(13, 0x33),
      recoverOwnerRequestBlock({
        height: 14,
        txid: recoveryTxid,
        prevStateTxid: openingBid.txid,
        spentBondTxid: openingBid.txid,
        spentBondVout: 0,
        successorBondSats: openingBid.bidAmountSats,
        challengeWindowBlocks: 2
      })
    ]);

    expect(indexer.getName(name)).toMatchObject({
      status: "invalid",
      currentOwnerPubkey: OWNER_PUBKEY
    });
    expect(indexer.getName(name)?.pendingRecovery).toBeUndefined();
    expect(indexer.getTransactionProvenance(recoveryTxid)).toMatchObject({
      invalidatedNames: [name],
      events: [
        {
          typeName: "RECOVER_OWNER",
          validationStatus: "ignored",
          reason: "recovery_wallet_proof_unavailable",
          affectedName: name
        }
      ]
    });
  });

  it.skip("[B3] lets the current owner key cancel a pending recovery before finalization", () => {
    const policy = createFastAuctionPolicy();
    const name = "orchard";
    const openingBid = createOpeningBidBlock({
      policy,
      name,
      height: 10,
      txid: hexByte(0x22),
      ownerPubkey: OWNER_PUBKEY
    });
    const recoveryTxid = hexByte(0x44);
    const cancelTxid = hexByte(0x55);
    const indexer = createRecoveryProofAwareIndexer(policy);

    indexer.ingestBlocks([
      openingBid.block,
      emptyBlock(13, 0x33),
      recoverOwnerRequestBlock({
        height: 14,
        txid: recoveryTxid,
        prevStateTxid: openingBid.txid,
        spentBondTxid: openingBid.txid,
        spentBondVout: 0,
        successorBondSats: openingBid.bidAmountSats,
        challengeWindowBlocks: 3
      }),
      recoverOwnerCancelBlock({
        height: 15,
        txid: cancelTxid,
        recoveryTxid,
        challengeWindowBlocks: 3
      }),
      emptyBlock(17, 0x66)
    ]);

    expect(indexer.getName(name)).toMatchObject({
      currentOwnerPubkey: OWNER_PUBKEY,
      currentBondTxid: recoveryTxid,
      lastStateTxid: cancelTxid,
      lastStateHeight: 15
    });
    expect(indexer.getName(name)?.pendingRecovery).toBeUndefined();
    expect(indexer.getTransactionProvenance(cancelTxid)).toMatchObject({
      events: [
        {
          typeName: "RECOVER_OWNER",
          validationStatus: "applied",
          reason: "recovery_cancelled_by_owner",
          affectedName: name
        }
      ]
    });
  });

  it.skip("[B3 / REWRITE for PR-35] ignores owner-key recovery cancellation at the finalization height", () => {
    const policy = createFastAuctionPolicy();
    const name = "orchard";
    const openingBid = createOpeningBidBlock({
      policy,
      name,
      height: 10,
      txid: hexByte(0x22),
      ownerPubkey: OWNER_PUBKEY
    });
    const recoveryTxid = hexByte(0x44);
    const cancelTxid = hexByte(0x55);
    const indexer = createRecoveryProofAwareIndexer(policy);

    indexer.ingestBlocks([
      openingBid.block,
      emptyBlock(13, 0x33),
      recoverOwnerRequestBlock({
        height: 14,
        txid: recoveryTxid,
        prevStateTxid: openingBid.txid,
        spentBondTxid: openingBid.txid,
        spentBondVout: 0,
        successorBondSats: openingBid.bidAmountSats,
        challengeWindowBlocks: 2
      }),
      recoverOwnerCancelBlock({
        height: 16,
        txid: cancelTxid,
        recoveryTxid,
        challengeWindowBlocks: 2
      })
    ]);

    expect(indexer.getName(name)).toMatchObject({
      currentOwnerPubkey: NEW_OWNER_PUBKEY,
      lastStateTxid: recoveryTxid
    });
    expect(indexer.getTransactionProvenance(cancelTxid)).toMatchObject({
      events: [
        {
          typeName: "RECOVER_OWNER",
          validationStatus: "ignored",
          reason: "recovery_cancel_too_late",
          affectedName: name
        }
      ]
    });
  });

  it.skip("[B3] invalidates an immature name when a malformed recovery request spends the bond", () => {
    const policy = createFastAuctionPolicy();
    const name = "orchard";
    const openingBid = createOpeningBidBlock({
      policy,
      name,
      height: 10,
      txid: hexByte(0x22),
      ownerPubkey: OWNER_PUBKEY
    });
    const recoveryTxid = hexByte(0x44);
    const indexer = new InMemoryOntIndexer({ launchHeight: 0, experimentalLaunchAuctionPolicy: policy });

    indexer.ingestBlocks([
      openingBid.block,
      emptyBlock(13, 0x33),
      recoverOwnerRequestBlock({
        height: 14,
        txid: recoveryTxid,
        prevStateTxid: openingBid.txid,
        spentBondTxid: openingBid.txid,
        spentBondVout: 0,
        successorBondSats: openingBid.bidAmountSats - 1n,
        challengeWindowBlocks: 2
      })
    ]);

    expect(indexer.getName(name)).toMatchObject({
      status: "invalid",
      currentOwnerPubkey: OWNER_PUBKEY
    });
    expect(indexer.getTransactionProvenance(recoveryTxid)).toMatchObject({
      invalidatedNames: [name],
      events: [
        {
          typeName: "RECOVER_OWNER",
          validationStatus: "ignored",
          reason: "recovery_invalid_successor_bond",
          affectedName: name
        }
      ]
    });
  });

  it.skip("[B3] restores pending recovery state from a recent checkpoint after finalization", () => {
    const policy = createFastAuctionPolicy();
    const name = "orchard";
    const openingBid = createOpeningBidBlock({
      policy,
      name,
      height: 10,
      txid: hexByte(0x22),
      ownerPubkey: OWNER_PUBKEY
    });
    const recoveryTxid = hexByte(0x44);
    const indexer = new InMemoryOntIndexer({
      launchHeight: 0,
      recentCheckpointLimit: 10,
      experimentalLaunchAuctionPolicy: policy
    });

    indexer.ingestBlocks([
      openingBid.block,
      emptyBlock(13, 0x33),
      recoverOwnerRequestBlock({
        height: 14,
        txid: recoveryTxid,
        prevStateTxid: openingBid.txid,
        spentBondTxid: openingBid.txid,
        spentBondVout: 0,
        successorBondSats: openingBid.bidAmountSats,
        challengeWindowBlocks: 2
      }),
      emptyBlock(16, 0x66)
    ]);

    expect(indexer.getName(name)?.currentOwnerPubkey).toBe(NEW_OWNER_PUBKEY);
    expect(indexer.restoreRecentCheckpoint(14, hexByte(14))).toBe(true);
    expect(indexer.getName(name)).toMatchObject({
      currentOwnerPubkey: OWNER_PUBKEY,
      pendingRecovery: {
        requestedTxid: recoveryTxid,
        finalizeHeight: 16
      }
    });
  });

  it("keeps an auction-owned name valid when the winning bond is spent after maturity", () => {
    const policy = createFastAuctionPolicy();
    const name = "orchard";
    const openingBid = createOpeningBidBlock({
      policy,
      name,
      height: 10,
      txid: hexByte(0x22),
      ownerPubkey: OWNER_PUBKEY
    });
    const indexer = new InMemoryOntIndexer({ launchHeight: 0, experimentalLaunchAuctionPolicy: policy });

    indexer.ingestBlocks([
      openingBid.block,
      emptyBlock(13, 0x33),
      spendBondBlock({
        height: 15,
        txid: hexByte(0x44),
        spentTxid: openingBid.txid,
        spentVout: 0
      })
    ]);

    expect(indexer.getName(name)).toMatchObject({
      name,
      status: "mature",
      currentBondTxid: openingBid.txid
    });
    expect(indexer.getTransactionProvenance(hexByte(0x44))).toBeNull();
  });

  it("treats maturity height as the first safe height to spend the winning bond", () => {
    const policy = createFastAuctionPolicy();
    const name = "orchard";
    const openingBid = createOpeningBidBlock({
      policy,
      name,
      height: 10,
      txid: hexByte(0x22),
      ownerPubkey: OWNER_PUBKEY
    });
    const beforeMaturity = new InMemoryOntIndexer({ launchHeight: 0, experimentalLaunchAuctionPolicy: policy });
    const atMaturity = new InMemoryOntIndexer({ launchHeight: 0, experimentalLaunchAuctionPolicy: policy });

    beforeMaturity.ingestBlocks([
      openingBid.block,
      emptyBlock(13, 0x33),
      spendBondBlock({
        height: 14,
        txid: hexByte(0x44),
        spentTxid: openingBid.txid,
        spentVout: 0
      })
    ]);
    atMaturity.ingestBlocks([
      openingBid.block,
      emptyBlock(13, 0x33),
      spendBondBlock({
        height: 15,
        txid: hexByte(0x55),
        spentTxid: openingBid.txid,
        spentVout: 0
      })
    ]);

    expect(beforeMaturity.getName(name)).toMatchObject({
      status: "invalid"
    });
    expect(atMaturity.getName(name)).toMatchObject({
      status: "mature"
    });
  });

  it("lets a released auction-owned name settle through a new release-anchored auction", () => {
    const policy = createFastAuctionPolicy();
    const name = "orchard";
    const openingBid = createOpeningBidBlock({
      policy,
      name,
      height: 10,
      txid: hexByte(0x22),
      ownerPubkey: OWNER_PUBKEY
    });
    const releaseHeight = 14;
    const reopeningBid = createOpeningBidBlock({
      policy,
      name,
      height: 15,
      txid: hexByte(0x55),
      ownerPubkey: NEW_OWNER_PUBKEY,
      unlockBlock: releaseHeight
    });
    const indexer = new InMemoryOntIndexer({ launchHeight: 0, experimentalLaunchAuctionPolicy: policy });

    indexer.ingestBlocks([
      openingBid.block,
      emptyBlock(13, 0x33),
      spendBondBlock({
        height: releaseHeight,
        txid: hexByte(0x44),
        spentTxid: openingBid.txid,
        spentVout: 0
      }),
      reopeningBid.block,
      emptyBlock(18, 0x66)
    ]);

    const reauctionId = getExperimentalLaunchAuctionId({ name, unlockBlock: releaseHeight });

    expect(indexer.getExperimentalAuction(reauctionId)).toMatchObject({
      auctionId: reauctionId,
      normalizedName: name,
      phase: "settled",
      winnerBidTxid: reopeningBid.txid
    });
    expect(indexer.getName(name)).toMatchObject({
      name,
      status: "immature",
      acquisitionKind: "auction",
      acquisitionAuctionId: reauctionId,
      currentOwnerPubkey: NEW_OWNER_PUBKEY,
      currentBondTxid: reopeningBid.txid,
      currentBondVout: 0,
      maturityHeight: 20
    });
  });

  it("ignores a reauction bid whose generation anchor is not the release height", () => {
    const policy = createFastAuctionPolicy();
    const name = "orchard";
    const openingBid = createOpeningBidBlock({
      policy,
      name,
      height: 10,
      txid: hexByte(0x22),
      ownerPubkey: OWNER_PUBKEY
    });
    const wrongAnchorBid = createOpeningBidBlock({
      policy,
      name,
      height: 15,
      txid: hexByte(0x55),
      ownerPubkey: NEW_OWNER_PUBKEY,
      unlockBlock: 15
    });
    const indexer = new InMemoryOntIndexer({ launchHeight: 0, experimentalLaunchAuctionPolicy: policy });

    indexer.ingestBlocks([
      openingBid.block,
      emptyBlock(13, 0x33),
      spendBondBlock({
        height: 14,
        txid: hexByte(0x44),
        spentTxid: openingBid.txid,
        spentVout: 0
      }),
      wrongAnchorBid.block,
      emptyBlock(18, 0x66)
    ]);

    expect(indexer.getExperimentalAuction(getExperimentalLaunchAuctionId({ name, unlockBlock: 15 }))).toBeNull();
    expect(indexer.getName(name)).toMatchObject({
      status: "invalid",
      currentBondTxid: openingBid.txid
    });
  });
});

function createFastAuctionPolicy(): LaunchAuctionPolicy {
  const policy = createDefaultLaunchAuctionPolicy();

  return {
    ...policy,
    defaultSettlementLockBlocks: 5,
    auction: {
      ...policy.auction,
      baseWindowBlocks: 2,
      softCloseExtensionBlocks: 0
    }
  };
}

// DEFERRED TO B3: this helper built an indexer that drove recovery-invoke END-TO-END through chain
// ingestion via the pre-#50 wallet-proof callback. Engine B replaced that path with acceptRecoverOwner
// over WITNESSED descriptor evidence (data-only options) — but the indexer RESOLVING that evidence from
// on-chain W15 posts is a B3 evidence-layer deliverable. The #50-b1 engine logic (admission, PR-34
// bond-address, PR-35 in-window cancel, X13, R18, §3c) is fully covered in @ont/consensus
// engine.recovery.test.ts + the R/T conformance bindings; the indexer recovery E2E tests below are
// it.skip pending the B3 evidence resolver.
function createRecoveryProofAwareIndexer(policy: LaunchAuctionPolicy): InMemoryOntIndexer {
  return new InMemoryOntIndexer({
    launchHeight: 0,
    experimentalLaunchAuctionPolicy: policy
  });
}

function createOpeningBidBlock(input: {
  readonly policy: LaunchAuctionPolicy;
  readonly name: string;
  readonly height: number;
  readonly txid: string;
  readonly ownerPubkey: string;
  readonly unlockBlock?: number;
  readonly payloadBondVout?: number;
  readonly bondOutputValueSats?: bigint;
  readonly bondOutputScriptType?: BitcoinTransactionOutput["scriptType"];
}): {
  readonly block: BitcoinBlock;
  readonly txid: string;
  readonly bidAmountSats: bigint;
} {
  const unlockBlock = input.unlockBlock ?? 0;
  const bondVout = input.payloadBondVout ?? 0;
  const auctionId = getExperimentalLaunchAuctionId({
    name: input.name,
    unlockBlock
  });
  const openingRequirements = getLaunchAuctionOpeningRequirements({
    policy: input.policy,
    name: input.name
  });
  const auctionLotCommitment = computeAuctionLotCommitment({
    auctionId,
    name: input.name,
    unlockBlock
  });
  const bidAmountSats = openingRequirements.openingMinimumBidSats;
  const auctionCommitment = computeAuctionBidStateCommitment({
    auctionId,
    name: input.name,
    currentBlockHeight: input.height,
    phase: "awaiting_opening_bid",
    unlockBlock,
    auctionCloseBlockAfter: null,
    openingMinimumBidSats: openingRequirements.openingMinimumBidSats,
    currentLeaderBidderCommitment: null,
    currentHighestBidSats: null,
    currentRequiredMinimumBidSats: openingRequirements.openingMinimumBidSats,
    settlementLockBlocks: openingRequirements.settlementLockBlocks
  });
  const payload = encodeAuctionBidPayload({
    flags: 0,
    bondVout,
    settlementLockBlocks: openingRequirements.settlementLockBlocks,
    bidAmountSats,
    ownerPubkey: input.ownerPubkey,
    auctionLotCommitment,
    auctionCommitment,
    bidderCommitment: computeAuctionBidderCommitment(`${input.name}-operator`),
    name: input.name,
    unlockBlock
  });
  const bondOutputScriptType = input.bondOutputScriptType ?? "payment";
  const bondOutput: BitcoinTransactionOutput = {
    valueSats:
      bondOutputScriptType === "op_return"
        ? 0n
        : input.bondOutputValueSats ?? bidAmountSats,
    scriptType: bondOutputScriptType,
    ...(bondOutputScriptType === "op_return" ? { dataHex: "aa" } : {})
  };

  return {
    txid: input.txid,
    bidAmountSats,
    block: {
      hash: hexByte(input.height),
      height: input.height,
      transactions: [
        {
          txid: input.txid,
          inputs: [{ txid: hexByte(0x11), vout: 0, coinbase: false }],
          outputs: [
            bondOutput,
            { valueSats: 0n, scriptType: "op_return", dataHex: Buffer.from(payload).toString("hex") }
          ]
        }
      ]
    }
  };
}

function emptyBlock(height: number, byte: number): BitcoinBlock {
  return {
    hash: hexByte(byte),
    height,
    transactions: []
  };
}

function spendBondBlock(input: {
  readonly height: number;
  readonly txid: string;
  readonly spentTxid: string;
  readonly spentVout: number;
}): BitcoinBlock {
  return {
    hash: hexByte(input.height),
    height: input.height,
    transactions: [
      {
        txid: input.txid,
        inputs: [{ txid: input.spentTxid, vout: input.spentVout, coinbase: false }],
        outputs: [{ valueSats: 1_000n, scriptType: "payment" }]
      }
    ]
  };
}

function transferBlock(input: {
  readonly height: number;
  readonly txid: string;
  readonly prevStateTxid: string;
  readonly spentBondTxid: string;
  readonly spentBondVout: number;
  readonly successorBondSats: bigint;
  readonly signingPrivateKeyHex?: string;
}): BitcoinBlock {
  const signature = signTransferAuthorization({
    prevStateTxid: input.prevStateTxid,
    newOwnerPubkey: NEW_OWNER_PUBKEY,
    flags: 0,
    successorBondVout: 0,
    ownerPrivateKeyHex: input.signingPrivateKeyHex ?? OWNER_PRIVATE_KEY_HEX
  });
  const payload = encodeTransferPayload({
    prevStateTxid: input.prevStateTxid,
    newOwnerPubkey: NEW_OWNER_PUBKEY,
    flags: 0,
    successorBondVout: 0,
    signature
  });

  return {
    hash: hexByte(input.height),
    height: input.height,
    transactions: [
      {
        txid: input.txid,
        inputs: [{ txid: input.spentBondTxid, vout: input.spentBondVout, coinbase: false }],
        outputs: [
          { valueSats: input.successorBondSats, scriptType: "payment" },
          { valueSats: 0n, scriptType: "op_return", dataHex: Buffer.from(payload).toString("hex") }
        ]
      }
    ]
  };
}

function recoverOwnerRequestBlock(input: {
  readonly height: number;
  readonly txid: string;
  readonly prevStateTxid: string;
  readonly spentBondTxid: string;
  readonly spentBondVout: number;
  readonly successorBondSats: bigint;
  readonly challengeWindowBlocks: number;
}): BitcoinBlock {
  const payload = encodeRecoverOwnerPayload({
    prevStateTxid: input.prevStateTxid,
    newOwnerPubkey: NEW_OWNER_PUBKEY,
    flags: 0,
    successorBondVout: 0,
    challengeWindowBlocks: input.challengeWindowBlocks,
    recoveryDescriptorHash: RECOVERY_DESCRIPTOR_HASH,
    signature: "00".repeat(64)
  });

  return {
    hash: hexByte(input.height),
    height: input.height,
    transactions: [
      {
        txid: input.txid,
        inputs: [{ txid: input.spentBondTxid, vout: input.spentBondVout, coinbase: false }],
        outputs: [
          { valueSats: input.successorBondSats, scriptType: "payment" },
          { valueSats: 0n, scriptType: "op_return", dataHex: Buffer.from(payload).toString("hex") }
        ]
      }
    ]
  };
}

function recoverOwnerCancelBlock(input: {
  readonly height: number;
  readonly txid: string;
  readonly recoveryTxid: string;
  readonly challengeWindowBlocks: number;
}): BitcoinBlock {
  const fields = {
    prevStateTxid: input.recoveryTxid,
    newOwnerPubkey: NEW_OWNER_PUBKEY,
    flags: RECOVER_OWNER_FLAG_CANCEL,
    successorBondVout: 0,
    challengeWindowBlocks: input.challengeWindowBlocks,
    recoveryDescriptorHash: RECOVERY_DESCRIPTOR_HASH
  };
  const signature = signRecoverOwnerCancelAuthorization({
    ...fields,
    ownerPrivateKeyHex: OWNER_PRIVATE_KEY_HEX
  });
  const payload = encodeRecoverOwnerPayload({
    ...fields,
    signature
  });

  return {
    hash: hexByte(input.height),
    height: input.height,
    transactions: [
      {
        txid: input.txid,
        inputs: [{ txid: hexByte(0x99), vout: 0, coinbase: false }],
        outputs: [
          { valueSats: 0n, scriptType: "op_return", dataHex: Buffer.from(payload).toString("hex") }
        ]
      }
    ]
  };
}

function deriveXOnlyPubkey(privateKeyHex: string): string {
  const publicKeyBytes = secp256k1.xOnlyPointFromScalar(Buffer.from(privateKeyHex, "hex"));

  if (!publicKeyBytes) {
    throw new Error("unable to derive test public key");
  }

  return Buffer.from(publicKeyBytes).toString("hex");
}

function hexByte(byte: number): string {
  return byte.toString(16).padStart(2, "0").repeat(32);
}
