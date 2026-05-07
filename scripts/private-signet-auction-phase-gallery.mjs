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
  mineBlocks,
  resolverUrl,
  runRemote,
  scenarioArtifactsDir,
  waitForResolverHeight,
  withPrivateSignetSession
} from "./private-signet-smoke-lib.mjs";

const BID_FEE_SATS = 1_000n;
const FUNDING_PADDING_SATS = 20_000n;
const PHASE_GALLERY_IDS = {
  pending: "19-private-phase-pending",
  awaiting: "20-private-phase-awaiting",
  live: "21-private-phase-live",
  softClose: "22-private-phase-soft-close"
};

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});

async function main() {
  await withPrivateSignetSession(async ({ owner, rpcPassword }) => {
    const outDir = scenarioArtifactsDir("auction-phase-gallery");
    await mkdir(outDir, { recursive: true });

    const initialHeight = await getBlockCount();
    await preparePhaseFixtureOpenings(initialHeight);

    const beforeFeed = await fetchExperimentalAuctionFeed();
    const pendingState = requireAuction(beforeFeed.auctions, PHASE_GALLERY_IDS.pending);
    const awaitingState = requireAuction(beforeFeed.auctions, PHASE_GALLERY_IDS.awaiting);
    const liveState = requireAuction(beforeFeed.auctions, PHASE_GALLERY_IDS.live);
    const softCloseState = requireAuction(beforeFeed.auctions, PHASE_GALLERY_IDS.softClose);

    await ensurePendingPhase(pendingState);
    await ensureAwaitingPhase(awaitingState);
    const preparedSoftClose = await ensureSoftClosePhase({
      outDir,
      auctionState: softCloseState,
      bidderId: `${softCloseState.normalizedName}-gallery-alpha`,
      ownerPubkey: owner.ownerPubkey,
      fundingAddress: owner.fundingAddress,
      fundingWif: owner.fundingWif,
      rpcPassword
    });
    const preparedLive = await ensureLivePhase({
      outDir,
      auctionState: liveState,
      bidderId: `${liveState.normalizedName}-gallery-alpha`,
      ownerPubkey: owner.ownerPubkey,
      fundingAddress: owner.fundingAddress,
      fundingWif: owner.fundingWif,
      rpcPassword
    });

    const finalFeed = await fetchExperimentalAuctionFeed();
    const summary = {
      kind: "ont-private-signet-auction-phase-gallery-summary",
      status: "complete",
      generatedAt: new Date().toISOString(),
      currentBlockHeight: finalFeed.currentBlockHeight,
      parked: {
        pending: summarizeAuction(requireAuction(finalFeed.auctions, PHASE_GALLERY_IDS.pending)),
        awaiting: summarizeAuction(requireAuction(finalFeed.auctions, PHASE_GALLERY_IDS.awaiting)),
        live: summarizeAuction(requireAuction(finalFeed.auctions, PHASE_GALLERY_IDS.live)),
        softClose: summarizeAuction(requireAuction(finalFeed.auctions, PHASE_GALLERY_IDS.softClose))
      },
      actions: {
        liveBidTxid: preparedLive.bidTxid,
        softCloseBidTxid: preparedSoftClose.bidTxid
      }
    };

    await writeFile(join(outDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n", "utf8");
    console.log(JSON.stringify(summary, null, 2));
  });
}

async function preparePhaseFixtureOpenings(currentHeight) {
  const schedule = {
    "19-private-phase-pending.json": currentHeight + 80,
    "20-private-phase-awaiting.json": currentHeight + 5,
    "21-private-phase-live.json": currentHeight + 15,
    "22-private-phase-soft-close.json": currentHeight + 6
  };

  await runRemote(`node <<'NODE'
const { readFileSync, writeFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");

const appRoot = "/opt/ont/app";
const fixtureDir = join(appRoot, "fixtures/auction/private-signet-lab");
const schedule = ${JSON.stringify(schedule)};

for (const [fileName, openingBlock] of Object.entries(schedule)) {
  const fixturePath = join(fixtureDir, fileName);
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  fixture.currentBlockHeight = Math.max(0, openingBlock - 1);
  fixture.scenario.unlockBlock = openingBlock;
  fixture.scenario.bidAttempts = [];
  writeFileSync(fixturePath, JSON.stringify(fixture, null, 2) + "\\n");
}

console.log(JSON.stringify({ fixtureDir, schedule }));
NODE`);

  await runRemote("systemctl restart ont-private-resolver.service");
  await waitForExperimentalAuctionFeed();
}

async function fetchExperimentalAuctionFeed() {
  return await fetchJson(`${resolverUrl()}/experimental-auctions`);
}

async function waitForExperimentalAuctionFeed() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await fetchExperimentalAuctionFeed();
      return;
    } catch {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));
    }
  }

  throw new Error("experimental auction feed did not recover after phase fixture refresh");
}

function requireAuction(auctions, auctionId) {
  if (!Array.isArray(auctions)) {
    throw new Error("experimental auction feed is missing auctions");
  }

  const auction = auctions.find((entry) => entry?.auctionId === auctionId);
  if (!auction) {
    throw new Error(`missing dedicated private phase fixture ${auctionId}`);
  }

  return auction;
}

function summarizeAuction(auction) {
  return {
    auctionId: auction.auctionId,
    normalizedName: auction.normalizedName,
    phase: auction.phase,
    currentBlockHeight: auction.currentBlockHeight,
    unlockBlock: auction.unlockBlock,
    acceptedBidCount: auction.acceptedBidCount,
    currentHighestBidSats: auction.currentHighestBidSats,
    auctionCloseBlockAfter: auction.auctionCloseBlockAfter
  };
}

async function ensurePendingPhase(auctionState) {
  if (auctionState.phase !== "pending_unlock") {
    throw new Error(
      `expected ${auctionState.auctionId} to remain in pre-eligibility; current phase is ${auctionState.phase}`
    );
  }
}

async function ensureAwaitingPhase(auctionState) {
  const ready = await ensureAuctionReadyForOpeningBid(auctionState);
  if (ready.phase !== "awaiting_opening_bid") {
    throw new Error(`expected ${auctionState.auctionId} to be eligible to open`);
  }
}

async function ensureLivePhase(input) {
  const ready = await ensureAuctionReadyForOpeningBid(input.auctionState);
  if (ready.phase === "live_bidding") {
    return { bidTxid: null };
  }

  if (ready.phase !== "awaiting_opening_bid") {
    throw new Error(`expected ${ready.auctionId} to be awaiting_opening_bid before live bid setup`);
  }

  const bidAmountSats = BigInt(ready.currentRequiredMinimumBidSats ?? ready.openingMinimumBidSats);
  const bid = await buildAndBroadcastAuctionBid({
    outDir: input.outDir,
    fileStem: "phase-live",
    auctionState: ready,
    bidderId: input.bidderId,
    ownerPubkey: input.ownerPubkey,
    bidAmountSats,
    fundingAddress: input.fundingAddress,
    fundingWif: input.fundingWif,
    rpcPassword: input.rpcPassword
  });

  const currentHeight = await getBlockCount();
  await mineBlocks(1);
  await waitForResolverHeight(currentHeight + 1);

  const refreshed = requireAuction((await fetchExperimentalAuctionFeed()).auctions, ready.auctionId);
  if (refreshed.phase !== "live_bidding") {
    throw new Error(`expected ${ready.auctionId} to reach live_bidding after the parked opening bid`);
  }

  return bid;
}

async function ensureSoftClosePhase(input) {
  const ready = await ensureAuctionReadyForOpeningBid(input.auctionState);
  if (ready.phase === "soft_close") {
    return { bidTxid: null };
  }

  if (ready.phase !== "awaiting_opening_bid") {
    throw new Error(`expected ${ready.auctionId} to be awaiting_opening_bid before soft-close setup`);
  }

  const bidAmountSats = BigInt(ready.currentRequiredMinimumBidSats ?? ready.openingMinimumBidSats);
  const bid = await buildAndBroadcastAuctionBid({
    outDir: input.outDir,
    fileStem: "phase-soft-close",
    auctionState: ready,
    bidderId: input.bidderId,
    ownerPubkey: input.ownerPubkey,
    bidAmountSats,
    fundingAddress: input.fundingAddress,
    fundingWif: input.fundingWif,
    rpcPassword: input.rpcPassword
  });

  const afterBidFeed = await fetchExperimentalAuctionFeed();
  const afterBid = requireAuction(afterBidFeed.auctions, ready.auctionId);
  const softCloseExtensionBlocks = Number(afterBidFeed.policy?.auction?.softCloseExtensionBlocks ?? 0);
  if (afterBid.auctionCloseBlockAfter === null) {
    throw new Error(`expected ${ready.auctionId} to expose an auction close height after the parked opening bid`);
  }

  if (!Number.isInteger(softCloseExtensionBlocks) || softCloseExtensionBlocks <= 0) {
    throw new Error("experimental auction feed is missing a valid soft-close extension window");
  }

  const blocksToMine = Math.max(
    1,
    afterBid.auctionCloseBlockAfter - afterBid.currentBlockHeight - softCloseExtensionBlocks + 1
  );
  const currentHeight = await getBlockCount();
  await mineBlocks(blocksToMine);
  await waitForResolverHeight(currentHeight + blocksToMine);

  const refreshed = requireAuction((await fetchExperimentalAuctionFeed()).auctions, ready.auctionId);
  if (refreshed.phase !== "soft_close") {
    throw new Error(`expected ${ready.auctionId} to reach soft_close after mining into the late window`);
  }

  return bid;
}

async function ensureAuctionReadyForOpeningBid(auctionState) {
  if (auctionState.phase === "awaiting_opening_bid") {
    return auctionState;
  }

  if (auctionState.phase === "pending_unlock") {
    const blocksToMine = Math.max(1, auctionState.unlockBlock - auctionState.currentBlockHeight);
    const currentHeight = await getBlockCount();
    await mineBlocks(blocksToMine);
    await waitForResolverHeight(currentHeight + blocksToMine);

    return requireAuction((await fetchExperimentalAuctionFeed()).auctions, auctionState.auctionId);
  }

  if (auctionState.phase === "live_bidding" || auctionState.phase === "soft_close") {
    return auctionState;
  }

  throw new Error(
    `expected ${auctionState.auctionId} to be pre-eligibility or eligible to open; current phase is ${auctionState.phase}`
  );
}

async function buildAndBroadcastAuctionBid({
  outDir,
  fileStem,
  auctionState,
  bidderId,
  ownerPubkey,
  bidAmountSats,
  fundingAddress,
  fundingWif,
  rpcPassword
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

  if (broadcast.broadcastedTxid !== artifacts.bidTxid) {
    throw new Error(`broadcast auction bid txid mismatch for ${auctionState.auctionId}`);
  }

  const currentHeight = await getBlockCount();
  await mineBlocks(1);
  await waitForResolverHeight(currentHeight + 1);

  return {
    bidTxid: artifacts.bidTxid,
    bidAmountSats: bidAmountSats.toString(),
    bondVout: artifacts.bondVout
  };
}

async function writeJsonFile(path, value) {
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}
