#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createAuctionBidPackage } from "@ont/protocol";

import {
  cliJson,
  fetchJson,
  formatDescriptor,
  fundAddress,
  getBlockCount,
  localRpcUrl,
  matureSaleTransferName,
  mineBlocks,
  postValueRecord,
  publishScenarioSummary,
  resolverUrl,
  rpcCall,
  satsToBtcString,
  scenarioArtifactsDir,
  waitForResolverHeight,
  withPrivateSignetSession,
  writeScenarioSummary
} from "./private-signet-smoke-lib.mjs";

const BID_FEE_SATS = 1_000n;
const EARLY_SPEND_FEE_SATS = 1_000n;
const FUNDING_PADDING_SATS = 20_000n;
const REMOTE_STATUS_PATH =
  process.env.ONT_PRIVATE_SIGNET_AUCTION_SMOKE_REMOTE_STATUS_PATH
  ?? "/var/lib/ont/private-auction-smoke-summary.json";
const PUBLISH_REMOTE_STATUS =
  (process.env.ONT_PRIVATE_SIGNET_AUCTION_SMOKE_PUBLISH_REMOTE_STATUS ?? "1") !== "0";
const BIDDING_SMOKE_AUCTION_ID_PREFIXES = ["10-", "11-", "12-", "14-", "15-", "16-", "18-"];

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});

async function main() {
  const summary = {
    kind: "ont-private-signet-auction-smoke-summary",
    status: "running",
    message: "Starting private signet experimental auction smoke flow.",
    startedAt: new Date().toISOString()
  };

  await withPrivateSignetSession(async ({
    owner,
    recipient,
    pendingOwner,
    rpcPassword,
    resolverUrl: privateResolverUrl,
    rpcUrl
  }) => {
    const outDir = scenarioArtifactsDir("auction-smoke");
    await mkdir(outDir, { recursive: true });

    try {
      const beforeFeed = await fetchExperimentalAuctionFeed();
      const targetAuction = await ensureAuctionReadyForOpeningBid(
        selectAvailableBiddingSmokeAuction(beforeFeed.auctions)
      );

      logStep(targetAuction.auctionId, "building and broadcasting the opening bid");
      const alphaBidderId = `${targetAuction.normalizedName}-alpha`;
      const alphaBidAmountSats = BigInt(targetAuction.currentRequiredMinimumBidSats ?? targetAuction.openingMinimumBidSats);
      const alphaBid = await buildAndMaybeBroadcastAuctionBid({
        outDir,
        fileStem: "alpha",
        auctionState: targetAuction,
        bidderId: alphaBidderId,
        ownerPubkey: owner.ownerPubkey,
        bidAmountSats: alphaBidAmountSats,
        fundingAddress: owner.fundingAddress,
        fundingWif: owner.fundingWif,
        rpcPassword
      });

      const afterAlphaBlock = await getBlockCount();
      await mineBlocks(1);
      await waitForResolverHeight(afterAlphaBlock + 1);

      const alphaState = await fetchExperimentalAuctionById(targetAuction.auctionId);
      if (!alphaState || alphaState.acceptedBidCount < 1) {
        throw new Error(`expected ${targetAuction.auctionId} to record the opening bid`);
      }

      logStep(targetAuction.auctionId, "building and broadcasting the higher bid");
      const betaBidderId = `${targetAuction.normalizedName}-beta`;
      const betaBidAmountSats = BigInt(alphaState.currentRequiredMinimumBidSats ?? alphaState.openingMinimumBidSats);
      const betaBid = await buildAndMaybeBroadcastAuctionBid({
        outDir,
        fileStem: "beta",
        auctionState: alphaState,
        bidderId: betaBidderId,
        ownerPubkey: recipient.ownerPubkey,
        bidAmountSats: betaBidAmountSats,
        fundingAddress: recipient.fundingAddress,
        fundingWif: recipient.fundingWif,
        rpcPassword
      });

      const afterBetaBlock = await getBlockCount();
      await mineBlocks(1);
      await waitForResolverHeight(afterBetaBlock + 1);

      const betaState = await fetchExperimentalAuctionById(targetAuction.auctionId);
      if (!betaState || betaState.acceptedBidCount < 2) {
        throw new Error(`expected ${targetAuction.auctionId} to record the higher bid`);
      }

      logStep(targetAuction.auctionId, "spending the losing bond early to verify enforcement reporting");
      const earlySpendTxid = await spendBidBondWithRpc({
        bidTxid: alphaBid.bidTxid,
        bidBondVout: alphaBid.bondVout,
        bidBondValueSats: alphaBidAmountSats,
        destinationAddress: owner.fundingAddress,
        signingWif: owner.fundingWif
      });

      const afterSpendBlock = await getBlockCount();
      await mineBlocks(1);
      await waitForResolverHeight(afterSpendBlock + 1);

      const postEarlySpendState = await fetchExperimentalAuctionById(targetAuction.auctionId);
      if (!postEarlySpendState) {
        throw new Error(`missing final state for ${targetAuction.auctionId}`);
      }

      const alphaOutcome =
        postEarlySpendState.visibleBidOutcomes.find((outcome) => outcome.txid === alphaBid.bidTxid) ?? null;
      const betaOutcome =
        postEarlySpendState.visibleBidOutcomes.find((outcome) => outcome.txid === betaBid.bidTxid) ?? null;

      if (!alphaOutcome || alphaOutcome.bondSpendStatus !== "spent_before_allowed_release") {
        throw new Error(`expected ${targetAuction.auctionId} to flag the first bid bond as spent_before_allowed_release`);
      }

      if (!betaOutcome || betaOutcome.status !== "accepted") {
        throw new Error(`expected ${targetAuction.auctionId} to keep the higher bid accepted`);
      }

      const settledState = await ensureAuctionSettled(postEarlySpendState);
      const settledNameRecord = await fetchNameRecordByName(targetAuction.normalizedName);
      if (!settledNameRecord) {
        throw new Error(`expected ${targetAuction.normalizedName} to materialize as a live name after auction settlement`);
      }

      if (settledNameRecord.currentOwnerPubkey !== recipient.ownerPubkey) {
        throw new Error(`expected ${targetAuction.normalizedName} to be owned by the winning bidder pubkey`);
      }

      if (String(settledNameRecord.acquisitionKind ?? "") !== "auction") {
        throw new Error(`expected ${targetAuction.normalizedName} to be marked as auction-acquired`);
      }

      if (settledNameRecord.currentBondTxid !== betaBid.bidTxid) {
        throw new Error(`expected ${targetAuction.normalizedName} to anchor its live bond to the winning bid`);
      }

      logStep(targetAuction.auctionId, "publishing a value record from the settled winning owner");
      const winnerValueRecord = await cliJson([
        "sign-value-record",
        "--name",
        targetAuction.normalizedName,
        "--owner-private-key-hex",
        recipient.ownerPrivateKeyHex,
        "--resolver-url",
        resolverUrl(),
        "--sequence",
        "1",
        "--value-type",
        "2",
        "--payload-utf8",
        `https://example.com/private-auction/${targetAuction.normalizedName}/winner`,
        "--write",
        join(outDir, "winner-value-record.json")
      ]);
      const winnerValuePublish = await postValueRecord(winnerValueRecord);
      if (winnerValuePublish.status !== 201 || winnerValuePublish.payload?.ok !== true) {
        throw new Error(`expected ${targetAuction.normalizedName} winner value publish to succeed`);
      }

      const currentWinnerValue = await cliJson([
        "get-value",
        targetAuction.normalizedName,
        "--resolver-url",
        resolverUrl()
      ]);
      if (currentWinnerValue.sequence !== 1) {
        throw new Error(`expected ${targetAuction.normalizedName} winner value record to publish at sequence 1`);
      }

      const winnerReleaseBlocks = Math.max(
        0,
        Number(settledState.winnerBondReleaseBlock ?? 0) - Number(settledState.currentBlockHeight ?? 0)
      );
      if (winnerReleaseBlocks > 0) {
        logStep(
          targetAuction.auctionId,
          `mining ${winnerReleaseBlocks} block${winnerReleaseBlocks === 1 ? "" : "s"} until the winner bond lock clears`
        );
        const currentHeight = await getBlockCount();
        await mineBlocks(winnerReleaseBlocks);
        await waitForResolverHeight(currentHeight + winnerReleaseBlocks);
      }

      const releasableState = await fetchExperimentalAuctionById(targetAuction.auctionId);
      if (!releasableState || releasableState.phase !== "settled") {
        throw new Error(`expected ${targetAuction.auctionId} to remain settled at winner release height`);
      }

      const releasableNameRecord = await fetchNameRecordByName(targetAuction.normalizedName);
      if (!releasableNameRecord || releasableNameRecord.status !== "mature") {
        throw new Error(`expected ${targetAuction.normalizedName} to become mature after the winner bond lock cleared`);
      }

      logStep(targetAuction.auctionId, "transferring the auction-owned name after release");
      const matureTransfer = await matureSaleTransferName({
        nameRecord: releasableNameRecord,
        sellerAccount: recipient,
        buyerAccount: pendingOwner,
        rpcPassword,
        outDir: join(outDir, "winner-mature-transfer")
      });

      if (matureTransfer.record.currentOwnerPubkey !== pendingOwner.ownerPubkey) {
        throw new Error(`expected ${targetAuction.normalizedName} to transfer to the pending owner after maturity`);
      }

      logStep(targetAuction.auctionId, "publishing a value record from the post-transfer owner");
      const transferredValueRecord = await cliJson([
        "sign-value-record",
        "--name",
        targetAuction.normalizedName,
        "--owner-private-key-hex",
        pendingOwner.ownerPrivateKeyHex,
        "--resolver-url",
        resolverUrl(),
        "--sequence",
        "1",
        "--value-type",
        "2",
        "--payload-utf8",
        `https://example.com/private-auction/${targetAuction.normalizedName}/recipient`,
        "--write",
        join(outDir, "transferred-value-record.json")
      ]);
      const transferredValuePublish = await postValueRecord(transferredValueRecord);
      if (transferredValuePublish.status !== 201 || transferredValuePublish.payload?.ok !== true) {
        throw new Error(`expected ${targetAuction.normalizedName} post-transfer value publish to succeed`);
      }

      const currentTransferredValue = await cliJson([
        "get-value",
        targetAuction.normalizedName,
        "--resolver-url",
        resolverUrl()
      ]);
      if (currentTransferredValue.sequence !== 1) {
        throw new Error(`expected ${targetAuction.normalizedName} post-transfer value record to publish at sequence 1`);
      }

      logStep(targetAuction.auctionId, "spending the winning bond after allowed release");
      const winnerSpendTxid = await spendBidBondWithRpc({
        bidTxid: betaBid.bidTxid,
        bidBondVout: betaBid.bondVout,
        bidBondValueSats: BigInt(betaBid.bidAmountSats),
        destinationAddress: recipient.fundingAddress,
        signingWif: recipient.fundingWif
      });

      const afterWinnerSpendBlock = await getBlockCount();
      await mineBlocks(1);
      await waitForResolverHeight(afterWinnerSpendBlock + 1);

      const finalState = await fetchExperimentalAuctionById(targetAuction.auctionId);
      if (!finalState) {
        throw new Error(`missing final state for ${targetAuction.auctionId}`);
      }

      const finalTransferredRecord = await fetchNameRecordByName(targetAuction.normalizedName);
      if (!finalTransferredRecord || finalTransferredRecord.currentOwnerPubkey !== pendingOwner.ownerPubkey) {
        throw new Error(`expected ${targetAuction.normalizedName} to remain owned by the post-transfer recipient after winning bond release`);
      }

      summary.status = "complete";
      summary.message =
        "Private signet experimental auction smoke succeeded with opening bid, higher bid, settlement, winner value publication, post-release transfer, and losing-bond violation checks.";
      summary.completedAt = new Date().toISOString();
      summary.resolverUrl = privateResolverUrl;
      summary.rpcUrl = rpcUrl;
      summary.auction = {
        auctionId: targetAuction.auctionId,
        title: targetAuction.title,
        normalizedName: targetAuction.normalizedName,
        auctionClassId: targetAuction.auctionClassId,
        unlockBlock: targetAuction.unlockBlock
      };
      summary.alphaBid = alphaBid;
      summary.betaBid = betaBid;
      summary.earlySpendTxid = earlySpendTxid;
      summary.finalState = finalState;
      summary.settledState = settledState;
      summary.settledNameRecord = settledNameRecord;
      summary.winnerValue = {
        publish: winnerValuePublish,
        currentValue: currentWinnerValue
      };
      summary.transfer = {
        transferTxid: matureTransfer.transferResult.transferTxid,
        record: matureTransfer.record
      };
      summary.transferredValue = {
        publish: transferredValuePublish,
        currentValue: currentTransferredValue
      };
      summary.highlight = {
        alphaBondSpendStatus: alphaOutcome.bondSpendStatus,
        alphaBondSpentTxid: alphaOutcome.bondSpentTxid,
        betaBondStatus: betaOutcome.bondStatus,
        betaBondSpendStatus: betaOutcome.bondSpendStatus,
        winnerBondSpentTxid: winnerSpendTxid,
        settledOwnerPubkey: settledNameRecord.currentOwnerPubkey,
        transferredOwnerPubkey: finalTransferredRecord.currentOwnerPubkey
      };
    } catch (error) {
      summary.status = "error";
      summary.message = error instanceof Error ? error.message : String(error);
      summary.completedAt = new Date().toISOString();
      throw error;
    } finally {
      await writeScenarioSummary("auction-smoke", summary);
      if (PUBLISH_REMOTE_STATUS) {
        try {
          await publishScenarioSummary("auction-smoke", REMOTE_STATUS_PATH);
        } catch (error) {
          console.warn(
            error instanceof Error
              ? `warning: unable to publish private auction smoke summary to ${REMOTE_STATUS_PATH}: ${error.message}`
              : `warning: unable to publish private auction smoke summary to ${REMOTE_STATUS_PATH}`
          );
        }
      }
      console.log(JSON.stringify(summary, null, 2));
    }
  });
}

async function fetchExperimentalAuctionFeed() {
  return await fetchJson(`${resolverUrl()}/experimental-auctions`);
}

async function fetchExperimentalAuctionById(auctionId) {
  const feed = await fetchExperimentalAuctionFeed();
  return feed.auctions.find((entry) => entry.auctionId === auctionId) ?? null;
}

function selectAvailableBiddingSmokeAuction(auctions) {
  if (!Array.isArray(auctions)) {
    throw new Error("experimental auction feed is missing auctions");
  }

  const candidate = auctions.find((entry) => {
    if (!entry || typeof entry !== "object") {
      return false;
    }

    if (!BIDDING_SMOKE_AUCTION_ID_PREFIXES.some((prefix) => String(entry.auctionId ?? "").startsWith(prefix))) {
      return false;
    }

    if (entry.phase !== "awaiting_opening_bid" && entry.phase !== "pending_unlock") {
      return false;
    }

    return Number(entry.totalObservedBidCount ?? 0) === 0;
  });

  if (!candidate) {
    throw new Error(
      "no empty private auction smoke fixture is available; rerun the canonical private signet reseed to free dedicated smoke fixtures"
    );
  }

  return candidate;
}

async function ensureAuctionReadyForOpeningBid(auctionState) {
  if (auctionState.phase === "awaiting_opening_bid") {
    return auctionState;
  }

  if (auctionState.phase !== "pending_unlock") {
    throw new Error(`expected ${auctionState.auctionId} to be pre-eligibility or eligible to open`);
  }

  const blocksToMine = Math.max(1, auctionState.unlockBlock - auctionState.currentBlockHeight);
  logStep(auctionState.auctionId, `mining ${blocksToMine} block${blocksToMine === 1 ? "" : "s"} until auction opening`);
  const currentHeight = await getBlockCount();
  await mineBlocks(blocksToMine);
  await waitForResolverHeight(currentHeight + blocksToMine);

  const refreshed = await fetchExperimentalAuctionById(auctionState.auctionId);
  if (!refreshed || refreshed.phase !== "awaiting_opening_bid") {
    throw new Error(`expected ${auctionState.auctionId} to reach awaiting_opening_bid after auction opening`);
  }

  return refreshed;
}

async function ensureAuctionSettled(auctionState) {
  if (auctionState.phase === "settled") {
    return auctionState;
  }

  if (auctionState.auctionCloseBlockAfter === null) {
    throw new Error(`expected ${auctionState.auctionId} to expose an auction close height`);
  }

  const blocksToMine = Math.max(1, auctionState.auctionCloseBlockAfter - auctionState.currentBlockHeight + 1);
  logStep(
    auctionState.auctionId,
    `mining ${blocksToMine} block${blocksToMine === 1 ? "" : "s"} to cross auction settlement`
  );
  const currentHeight = await getBlockCount();
  await mineBlocks(blocksToMine);
  await waitForResolverHeight(currentHeight + blocksToMine);

  const refreshed = await fetchExperimentalAuctionById(auctionState.auctionId);
  if (!refreshed || refreshed.phase !== "settled") {
    throw new Error(`expected ${auctionState.auctionId} to settle after the close window`);
  }

  return refreshed;
}

async function fetchNameRecordByName(name) {
  try {
    return await fetchJson(`${resolverUrl()}/name/${encodeURIComponent(name)}`);
  } catch (error) {
    if (error instanceof Error && /404/.test(error.message)) {
      return null;
    }

    throw error;
  }
}

async function buildAndMaybeBroadcastAuctionBid({
  outDir,
  fileStem,
  auctionState,
  bidderId,
  ownerPubkey,
  bidAmountSats,
  fundingAddress,
  fundingWif,
  rpcPassword,
  broadcastNow = true
}) {
  const packagePath = join(outDir, `${fileStem}-auction-bid-package.json`);
  const artifactsPath = join(outDir, `${fileStem}-auction-bid-artifacts.json`);
  const signedPath = join(outDir, `${fileStem}-signed-auction-bid-artifacts.json`);
  const bidPackage = createAuctionBidPackage({
    auctionId: auctionState.auctionId,
    name: auctionState.normalizedName,
    auctionClassId: auctionState.auctionClassId,
    classLabel: auctionState.classLabel,
    currentBlockHeight: auctionState.currentBlockHeight,
    phase: auctionState.phase,
    unlockBlock: auctionState.unlockBlock,
    auctionCloseBlockAfter: auctionState.auctionCloseBlockAfter,
    openingMinimumBidSats: auctionState.openingMinimumBidSats,
    currentLeaderBidderCommitment: auctionState.currentLeaderBidderCommitment,
    currentHighestBidSats: auctionState.currentHighestBidSats,
    currentRequiredMinimumBidSats: auctionState.currentRequiredMinimumBidSats,
    settlementLockBlocks: auctionState.settlementLockBlocks,
    blocksUntilUnlock: auctionState.blocksUntilUnlock,
    blocksUntilClose: auctionState.blocksUntilClose,
    bidderId,
    ownerPubkey,
    bidAmountSats
  });
  await writeJsonFile(packagePath, bidPackage);

  const fundingInput = await fundAddress(
    fundingAddress,
    bidAmountSats + BID_FEE_SATS + FUNDING_PADDING_SATS
  );
  const artifacts = await cliJson([
    "build-auction-bid-artifacts",
    packagePath,
    "--input",
    formatDescriptor(fundingInput),
    "--fee-sats",
    BID_FEE_SATS.toString(),
    "--network",
    "signet",
    "--bond-address",
    fundingAddress,
    "--change-address",
    fundingAddress,
    "--write",
    artifactsPath
  ]);
  const signed = await cliJson([
    "sign-artifacts",
    artifactsPath,
    "--wif",
    fundingWif,
    "--write",
    signedPath
  ]);

  if (signed.signedTransactionId !== artifacts.bidTxid) {
    throw new Error(`signed auction bid txid mismatch for ${auctionState.auctionId}`);
  }

  if (broadcastNow) {
    await broadcastSignedAuctionBid({
      signedPath,
      rpcPassword,
      expectedTxid: artifacts.bidTxid
    });
  }

  return {
    bidderId,
    bidAmountSats: bidAmountSats.toString(),
    bidTxid: artifacts.bidTxid,
    bondVout: artifacts.bondVout,
    auctionStateCommitment: bidPackage.auctionStateCommitment,
    bidderCommitment: bidPackage.bidderCommitment,
    packagePath,
    artifactsPath,
    signedPath
  };
}

async function broadcastSignedAuctionBid({
  signedPath,
  rpcPassword,
  expectedTxid
}) {
  const broadcast = await cliJson([
    "broadcast-transaction",
    signedPath,
    "--rpc-url",
    localRpcUrl(),
    "--rpc-username",
    "ontrpcprivate",
    "--rpc-password",
    rpcPassword,
    "--expected-chain",
    "signet"
  ]);

  if (broadcast.broadcastedTxid !== expectedTxid) {
    throw new Error(`broadcast auction bid txid mismatch for ${expectedTxid}`);
  }

  return broadcast.broadcastedTxid;
}

async function spendBidBondWithRpc({
  bidTxid,
  bidBondVout,
  bidBondValueSats,
  destinationAddress,
  signingWif
}) {
  if (bidBondValueSats <= EARLY_SPEND_FEE_SATS) {
    throw new Error("bid bond value is too small to spend after fee");
  }

  const transaction = await rpcCall("getrawtransaction", [bidTxid, true]);
  const output = Array.isArray(transaction?.vout)
    ? transaction.vout.find((entry) => entry?.n === bidBondVout)
    : null;

  if (!output?.scriptPubKey?.hex) {
    throw new Error(`missing scriptPubKey for bid bond ${bidTxid}:${bidBondVout}`);
  }

  const rawTransactionHex = await rpcCall("createrawtransaction", [
    [
      {
        txid: bidTxid,
        vout: bidBondVout
      }
    ],
    {
      [destinationAddress]: Number(satsToBtcString(bidBondValueSats - EARLY_SPEND_FEE_SATS))
    }
  ]);

  const signed = await rpcCall("signrawtransactionwithkey", [
    rawTransactionHex,
    [signingWif],
    [
      {
        txid: bidTxid,
        vout: bidBondVout,
        scriptPubKey: output.scriptPubKey.hex,
        amount: Number(satsToBtcString(bidBondValueSats))
      }
    ]
  ]);

  if (signed.complete !== true || typeof signed.hex !== "string" || signed.hex.length === 0) {
    throw new Error(`unable to sign early-spend transaction for ${bidTxid}:${bidBondVout}`);
  }

  return await rpcCall("sendrawtransaction", [signed.hex]);
}

async function writeJsonFile(path, value) {
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function logStep(auctionId, message) {
  console.error(`[private-auction-smoke:${auctionId}] ${message}`);
}
