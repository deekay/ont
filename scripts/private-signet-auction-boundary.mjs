#!/usr/bin/env node

// Live adversarial / boundary harness for the experimental launch auction.
//
// Drives REAL AUCTION_BID transactions over the private-signet tunnel against a
// single spare smoke fixture and asserts that every resolver rejection reason
// surfaces in `visibleBidOutcomes`:
//
//   settlement_lock_mismatch  (reason 1) — bid commits a non-policy lock
//   before_unlock             (reason 2) — bid confirms before the unlock height
//   auction_closed            (reason 3) — bid confirms after settlement
//   stale_state_commitment    (reason 4) — bid commits a now-stale (no-leader) snapshot
//   prior_bid_not_replaced    (reason 5) — same bidder re-bids without spending its bond
//   below_opening_minimum     (reason 6) — first bid below the opening floor
//   below_minimum_increment   (reason 8) — second bid below the required increment
//
// Commitments cannot be forged: createAuctionBidPackage -> parseAuctionBidPackage
// recomputes and self-verifies the auction-state commitment from the package's own
// declared fields, so each rejection here is produced by genuine timing/sequencing
// plus internally-consistent state-field overrides (a wrong lock, a held stale
// snapshot, a held pre-close snapshot, a same-bidder re-bid).

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
  publishScenarioSummary,
  resolverUrl,
  scenarioArtifactsDir,
  waitForResolverHeight,
  withPrivateSignetSession,
  writeScenarioSummary
} from "./private-signet-smoke-lib.mjs";

const BID_FEE_SATS = 1_000n;
const FUNDING_PADDING_SATS = 20_000n;
const WRONG_SETTLEMENT_LOCK_BLOCKS = 25; // private signet auction policy lock is 24
const SCENARIO = "auction-boundary";
const REMOTE_STATUS_PATH =
  process.env.ONT_PRIVATE_SIGNET_AUCTION_BOUNDARY_REMOTE_STATUS_PATH
  ?? "/var/lib/ont/private-auction-boundary-summary.json";
const PUBLISH_REMOTE_STATUS =
  (process.env.ONT_PRIVATE_SIGNET_AUCTION_BOUNDARY_PUBLISH_REMOTE_STATUS ?? "1") !== "0";
const BOUNDARY_FIXTURE_ID_PREFIXES = ["15-", "16-", "18-", "12-", "14-"];

const EXPECTED_REJECTION_REASONS = [
  "settlement_lock_mismatch",
  "before_unlock",
  "auction_closed",
  "stale_state_commitment",
  "prior_bid_not_replaced",
  "below_opening_minimum",
  "below_minimum_increment"
];

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});

async function main() {
  const summary = {
    kind: "ont-private-signet-auction-boundary-summary",
    status: "running",
    message: "Starting private signet adversarial auction boundary flow.",
    startedAt: new Date().toISOString(),
    scenarios: []
  };

  await withPrivateSignetSession(async ({ owner, rpcUsername, rpcPassword, resolverUrl: privateResolverUrl, rpcUrl }) => {
    const outDir = scenarioArtifactsDir(SCENARIO);
    await mkdir(outDir, { recursive: true });

    const record = (entry) => {
      summary.scenarios.push(entry);
      const note = entry.bidTxid ? ` txid=${entry.bidTxid}` : "";
      console.error(`[${SCENARIO}] ${entry.outcome === "pass" ? "PASS" : "FAIL"} ${entry.reason}${note} :: ${entry.detail}`);
    };

    try {
      const fixture = await selectBoundaryFixture();
      summary.fixture = {
        auctionId: fixture.auctionId,
        normalizedName: fixture.normalizedName,
        unlockBlock: fixture.unlockBlock,
        openingMinimumBidSats: fixture.openingMinimumBidSats,
        settlementLockBlocks: fixture.settlementLockBlocks
      };
      console.error(`[${SCENARIO}] selected fixture ${fixture.auctionId} (${fixture.normalizedName}) unlock=${fixture.unlockBlock} openMin=${fixture.openingMinimumBidSats}`);

      const auctionId = fixture.auctionId;
      const openingMinimumBidSats = BigInt(fixture.openingMinimumBidSats);

      // --- (1) before_unlock -------------------------------------------------
      // Build against the live pending_unlock snapshot and confirm before unlock.
      {
        const snapshot = await fetchAuction(auctionId);
        assertPhase(snapshot, "pending_unlock");
        const bid = await buildBid({
          outDir,
          fileStem: "before-unlock",
          snapshot,
          bidderId: `${fixture.normalizedName}-before-unlock`,
          ownerPubkey: owner.ownerPubkey,
          bidAmountSats: openingMinimumBidSats,
          fundingAddress: owner.fundingAddress,
          fundingWif: owner.fundingWif,
          rpcUsername,
          rpcPassword,
          broadcastNow: true
        });
        await mineAndSync(1);
        const state = await fetchAuction(auctionId);
        const confirmHeight = outcomeHeight(state, bid.bidTxid);
        record(assertOutcome(state, bid.bidTxid, "rejected", "before_unlock", {
          extra: `confirmHeight=${confirmHeight} < unlock=${fixture.unlockBlock}`
        }));
      }

      // --- advance to awaiting_opening_bid ----------------------------------
      await mineUntilHeight(fixture.unlockBlock);
      {
        const awaiting = await fetchAuction(auctionId);
        assertPhase(awaiting, "awaiting_opening_bid");
      }

      // --- (2) below_opening_minimum (no leader) -----------------------------
      {
        const snapshot = await fetchAuction(auctionId);
        const bid = await buildBid({
          outDir,
          fileStem: "below-opening-minimum",
          snapshot,
          bidderId: `${fixture.normalizedName}-below-open`,
          ownerPubkey: owner.ownerPubkey,
          bidAmountSats: openingMinimumBidSats / 2n, // clearly below the opening floor
          fundingAddress: owner.fundingAddress,
          fundingWif: owner.fundingWif,
          rpcUsername,
          rpcPassword,
          broadcastNow: true
        });
        await mineAndSync(1);
        const state = await fetchAuction(auctionId);
        record(assertOutcome(state, bid.bidTxid, "rejected", "below_opening_minimum", {
          extra: `amount=${openingMinimumBidSats / 2n} < openMin=${openingMinimumBidSats}`
        }));
      }

      // --- (3) settlement_lock_mismatch (no leader, wrong lock) --------------
      {
        const snapshot = await fetchAuction(auctionId);
        const bid = await buildBid({
          outDir,
          fileStem: "settlement-lock-mismatch",
          snapshot,
          bidderId: `${fixture.normalizedName}-lock-mismatch`,
          ownerPubkey: owner.ownerPubkey,
          bidAmountSats: openingMinimumBidSats,
          settlementLockBlocksOverride: WRONG_SETTLEMENT_LOCK_BLOCKS,
          fundingAddress: owner.fundingAddress,
          fundingWif: owner.fundingWif,
          rpcUsername,
          rpcPassword,
          broadcastNow: true
        });
        await mineAndSync(1);
        const state = await fetchAuction(auctionId);
        record(assertOutcome(state, bid.bidTxid, "rejected", "settlement_lock_mismatch", {
          extra: `lock=${WRONG_SETTLEMENT_LOCK_BLOCKS}!=${fixture.settlementLockBlocks}`
        }));
      }

      // --- pre-fund every live-window UTXO up front --------------------------
      // ont-private-signet-fund mines a block per call, so funding inline would
      // cost 2 blocks per bid and push the commitment-sensitive bids past the
      // soft-close boundary (close - softCloseExtensionBlocks), where they would
      // be mis-flagged as stale. Pre-funding makes each live bid cost 1 block,
      // keeping below_minimum_increment / prior_bid_not_replaced safely inside
      // the live_bidding window.
      // Size each pre-funded UTXO to cover the largest bid we place: the
      // required increment (opening + up to the soft-close 10% step). Use a 20%
      // headroom over the opening floor so increment + fee always fits.
      const fundUnit = openingMinimumBidSats + openingMinimumBidSats / 5n + BID_FEE_SATS + FUNDING_PADDING_SATS;
      const staleFunding = await fundAddress(owner.fundingAddress, fundUnit);
      const belowIncrementFunding = await fundAddress(owner.fundingAddress, fundUnit);
      const priorRebidFunding = await fundAddress(owner.fundingAddress, fundUnit);
      const closedFunding = await fundAddress(owner.fundingAddress, fundUnit);
      const openingFunding = await fundAddress(owner.fundingAddress, fundUnit);

      // Build the stale bid against the still-leaderless snapshot, then hold it.
      const staleSnapshot = await fetchAuction(auctionId);
      assertPhase(staleSnapshot, "awaiting_opening_bid");
      const staleBid = await buildBid({
        outDir,
        fileStem: "stale-state-commitment",
        snapshot: staleSnapshot,
        bidderId: `${fixture.normalizedName}-stale`,
        ownerPubkey: owner.ownerPubkey,
        bidAmountSats: openingMinimumBidSats,
        fundingInput: staleFunding,
        fundingAddress: owner.fundingAddress,
        fundingWif: owner.fundingWif,
        rpcUsername,
        rpcPassword,
        broadcastNow: false
      });

      // --- (4) valid opening bid -> accepted leader --------------------------
      const openingBidderId = `${fixture.normalizedName}-opening`;
      {
        const snapshot = await fetchAuction(auctionId);
        assertPhase(snapshot, "awaiting_opening_bid");
        const bid = await buildBid({
          outDir,
          fileStem: "opening-bid",
          snapshot,
          bidderId: openingBidderId,
          ownerPubkey: owner.ownerPubkey,
          bidAmountSats: openingMinimumBidSats,
          fundingInput: openingFunding,
          fundingAddress: owner.fundingAddress,
          fundingWif: owner.fundingWif,
          rpcUsername,
          rpcPassword,
          broadcastNow: true
        });
        summary.openingBid = bid;
        await mineAndSync(1);
        const state = await fetchAuction(auctionId);
        record(assertOutcome(state, bid.bidTxid, "accepted", "opening_bid", {
          extra: `leader set, close=${state.auctionCloseBlockAfter}`
        }));
        summary.openingBidTxid = bid.bidTxid;
        summary.openingBondVout = bid.bondVout;
        summary.softCloseStartBlock = Number(state.auctionCloseBlockAfter) - 4;
      }

      // --- (5) below_minimum_increment (leader present, live_bidding) --------
      {
        const snapshot = await fetchAuction(auctionId);
        assertPhase(snapshot, "live_bidding");
        const required = BigInt(snapshot.currentRequiredMinimumBidSats);
        const bid = await buildBid({
          outDir,
          fileStem: "below-minimum-increment",
          snapshot,
          bidderId: `${fixture.normalizedName}-low-increment`,
          ownerPubkey: owner.ownerPubkey,
          bidAmountSats: openingMinimumBidSats + 1_000n, // > openMin, < required
          fundingInput: belowIncrementFunding,
          fundingAddress: owner.fundingAddress,
          fundingWif: owner.fundingWif,
          rpcUsername,
          rpcPassword,
          broadcastNow: true
        });
        await mineAndSync(1);
        const state = await fetchAuction(auctionId);
        record(assertOutcome(state, bid.bidTxid, "rejected", "below_minimum_increment", {
          extra: `amount=${openingMinimumBidSats + 1_000n} < required=${required}`
        }));
      }

      // --- (6) prior_bid_not_replaced (same bidder re-bids, fresh utxo) ------
      {
        const snapshot = await fetchAuction(auctionId);
        assertPhase(snapshot, "live_bidding");
        const required = BigInt(snapshot.currentRequiredMinimumBidSats);
        const bid = await buildBid({
          outDir,
          fileStem: "prior-bid-not-replaced",
          snapshot,
          bidderId: openingBidderId, // same bidder as the standing leader
          ownerPubkey: owner.ownerPubkey,
          bidAmountSats: required, // a valid increment, but does not spend the prior bond
          fundingInput: priorRebidFunding,
          fundingAddress: owner.fundingAddress,
          fundingWif: owner.fundingWif,
          rpcUsername,
          rpcPassword,
          broadcastNow: true
        });
        await mineAndSync(1);
        const state = await fetchAuction(auctionId);
        record(assertOutcome(state, bid.bidTxid, "rejected", "prior_bid_not_replaced", {
          extra: `same bidder, fresh utxo, amount=${required}`
        }));
      }

      // --- (7) stale_state_commitment (broadcast the held no-leader bid) -----
      {
        await broadcast(staleBid.signedPath, staleBid.bidTxid, rpcUsername, rpcPassword);
        await mineAndSync(1);
        const state = await fetchAuction(auctionId);
        record(assertOutcome(state, staleBid.bidTxid, "rejected", "stale_state_commitment", {
          extra: "committed no-leader snapshot, leader now present"
        }));
      }

      // --- build the auction_closed bid against the still-open snapshot ------
      const liveSnapshot = await fetchAuction(auctionId);
      if (liveSnapshot.phase !== "live_bidding" && liveSnapshot.phase !== "soft_close") {
        throw new Error(`expected ${auctionId} to still be open for the held auction_closed bid, saw ${liveSnapshot.phase}`);
      }
      const closedBid = await buildBid({
        outDir,
        fileStem: "auction-closed",
        snapshot: liveSnapshot,
        bidderId: `${fixture.normalizedName}-late`,
        ownerPubkey: owner.ownerPubkey,
        bidAmountSats: BigInt(liveSnapshot.currentRequiredMinimumBidSats),
        fundingInput: closedFunding,
        fundingAddress: owner.fundingAddress,
        fundingWif: owner.fundingWif,
        rpcUsername,
        rpcPassword,
        broadcastNow: false
      });

      // --- settle the auction ------------------------------------------------
      const closeBlock = Number(liveSnapshot.auctionCloseBlockAfter);
      await mineUntilHeight(closeBlock + 1);
      {
        const settled = await fetchAuction(auctionId);
        assertPhase(settled, "settled");
      }

      // --- (8) auction_closed (broadcast the held pre-close bid) -------------
      {
        await broadcast(closedBid.signedPath, closedBid.bidTxid, rpcUsername, rpcPassword);
        await mineAndSync(1);
        const state = await fetchAuction(auctionId);
        const confirmHeight = outcomeHeight(state, closedBid.bidTxid);
        record(assertOutcome(state, closedBid.bidTxid, "rejected", "auction_closed", {
          extra: `confirmHeight=${confirmHeight} > close=${closeBlock}`
        }));
      }

      // --- final assertions --------------------------------------------------
      const finalState = await fetchAuction(auctionId);
      const observedReasons = new Set(
        finalState.visibleBidOutcomes.filter((o) => o.status === "rejected").map((o) => o.reason)
      );
      const missing = EXPECTED_REJECTION_REASONS.filter((reason) => !observedReasons.has(reason));
      if (missing.length > 0) {
        throw new Error(`missing rejection reasons in visibleBidOutcomes: ${missing.join(", ")}`);
      }

      const failures = summary.scenarios.filter((entry) => entry.outcome !== "pass");
      if (failures.length > 0) {
        throw new Error(`scenario failures: ${failures.map((f) => f.reason).join(", ")}`);
      }

      summary.status = "complete";
      summary.message =
        "Private signet adversarial auction boundary flow surfaced all seven rejection reasons on a single fixture via real AUCTION_BID transactions.";
      summary.completedAt = new Date().toISOString();
      summary.resolverUrl = privateResolverUrl;
      summary.rpcUrl = rpcUrl;
      summary.observedRejectionReasons = [...observedReasons].sort();
      summary.finalState = finalState;
    } catch (error) {
      summary.status = "error";
      summary.message = error instanceof Error ? error.message : String(error);
      summary.completedAt = new Date().toISOString();
      throw error;
    } finally {
      await writeScenarioSummary(SCENARIO, summary);
      if (PUBLISH_REMOTE_STATUS) {
        try {
          await publishScenarioSummary(SCENARIO, REMOTE_STATUS_PATH);
        } catch (error) {
          console.warn(
            error instanceof Error
              ? `warning: unable to publish boundary summary to ${REMOTE_STATUS_PATH}: ${error.message}`
              : `warning: unable to publish boundary summary to ${REMOTE_STATUS_PATH}`
          );
        }
      }
      console.log(JSON.stringify(summary, null, 2));
    }
  });
}

async function selectBoundaryFixture() {
  const feed = await fetchJson(`${resolverUrl()}/experimental-auctions`);
  const currentHeight = Number(feed.currentBlockHeight);
  const candidate = (feed.auctions ?? []).find((entry) => {
    if (!entry || typeof entry !== "object") {
      return false;
    }
    if (!BOUNDARY_FIXTURE_ID_PREFIXES.some((prefix) => String(entry.auctionId ?? "").startsWith(prefix))) {
      return false;
    }
    if (entry.phase !== "pending_unlock") {
      return false;
    }
    if (Number(entry.totalObservedBidCount ?? 0) !== 0) {
      return false;
    }
    // Need enough headroom before unlock to confirm a before_unlock bid (fund + mine = 2 blocks).
    return Number(entry.unlockBlock) >= currentHeight + 3;
  });

  if (!candidate) {
    throw new Error(
      "no empty pending_unlock auction fixture with unlock headroom is available; rerun the private signet reseed to free a boundary fixture"
    );
  }

  return candidate;
}

async function fetchAuction(auctionId) {
  const feed = await fetchJson(`${resolverUrl()}/experimental-auctions`);
  const entry = (feed.auctions ?? []).find((a) => a.auctionId === auctionId);
  if (!entry) {
    throw new Error(`auction ${auctionId} disappeared from the resolver feed`);
  }
  return entry;
}

function assertPhase(snapshot, expectedPhase) {
  if (snapshot.phase !== expectedPhase) {
    throw new Error(`expected ${snapshot.auctionId} phase ${expectedPhase}, saw ${snapshot.phase}`);
  }
}

function assertOutcome(state, txid, expectedStatus, expectedReason, { extra } = {}) {
  const outcome = state.visibleBidOutcomes.find((o) => o.txid === txid) ?? null;
  if (!outcome) {
    return {
      reason: expectedReason,
      outcome: "fail",
      bidTxid: txid,
      detail: `no visible outcome found for ${txid} (extra: ${extra ?? "n/a"})`
    };
  }
  if (outcome.status !== expectedStatus || outcome.reason !== expectedReason) {
    return {
      reason: expectedReason,
      outcome: "fail",
      bidTxid: txid,
      observedStatus: outcome.status,
      observedReason: outcome.reason,
      detail: `expected ${expectedStatus}/${expectedReason}, saw ${outcome.status}/${outcome.reason} (extra: ${extra ?? "n/a"})`
    };
  }
  return {
    reason: expectedReason,
    outcome: "pass",
    bidTxid: txid,
    observedStatus: outcome.status,
    observedReason: outcome.reason,
    blockHeight: outcome.blockHeight,
    stateCommitmentMatched: outcome.stateCommitmentMatched,
    bondStatus: outcome.bondStatus,
    detail: extra ?? "matched expected outcome"
  };
}

async function buildBid({
  outDir,
  fileStem,
  snapshot,
  bidderId,
  ownerPubkey,
  bidAmountSats,
  settlementLockBlocksOverride,
  fundingInput,
  fundingAddress,
  fundingWif,
  rpcUsername,
  rpcPassword,
  broadcastNow
}) {
  const packagePath = join(outDir, `${fileStem}-package.json`);
  const artifactsPath = join(outDir, `${fileStem}-artifacts.json`);
  const signedPath = join(outDir, `${fileStem}-signed.json`);

  const bidPackage = createAuctionBidPackage({
    auctionId: snapshot.auctionId,
    name: snapshot.normalizedName,
    currentBlockHeight: Number(snapshot.currentBlockHeight),
    phase: snapshot.phase,
    unlockBlock: Number(snapshot.unlockBlock),
    auctionCloseBlockAfter: snapshot.auctionCloseBlockAfter,
    openingMinimumBidSats: snapshot.openingMinimumBidSats,
    currentLeaderBidderCommitment: snapshot.currentLeaderBidderCommitment ?? null,
    currentHighestBidSats: snapshot.currentHighestBidSats ?? null,
    currentRequiredMinimumBidSats: snapshot.currentRequiredMinimumBidSats ?? null,
    settlementLockBlocks: settlementLockBlocksOverride ?? Number(snapshot.settlementLockBlocks),
    bidderId,
    ownerPubkey,
    bidAmountSats
  });
  await writeJsonFile(packagePath, bidPackage);

  const input = fundingInput
    ?? (await fundAddress(fundingAddress, bidAmountSats + BID_FEE_SATS + FUNDING_PADDING_SATS));

  const artifacts = await cliJson([
    "build-auction-bid-artifacts",
    packagePath,
    "--input",
    formatDescriptor(input),
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

  const signed = await cliJson(["sign-artifacts", artifactsPath, "--wif", fundingWif, "--write", signedPath]);
  if (signed.signedTransactionId !== artifacts.bidTxid) {
    throw new Error(`signed auction bid txid mismatch for ${snapshot.auctionId} (${fileStem})`);
  }

  if (broadcastNow) {
    await broadcast(signedPath, artifacts.bidTxid, rpcUsername, rpcPassword);
  }

  return {
    bidderId,
    fileStem,
    bidAmountSats: bidAmountSats.toString(),
    bidTxid: artifacts.bidTxid,
    bondVout: artifacts.bondVout,
    auctionStateCommitment: bidPackage.auctionStateCommitment,
    bidderCommitment: bidPackage.bidderCommitment,
    settlementLockBlocks: settlementLockBlocksOverride ?? Number(snapshot.settlementLockBlocks),
    packagePath,
    artifactsPath,
    signedPath
  };
}

async function broadcast(signedPath, expectedTxid, rpcUsername, rpcPassword) {
  const result = await cliJson([
    "broadcast-transaction",
    signedPath,
    "--rpc-url",
    localRpcUrl(),
    "--rpc-username",
    rpcUsername,
    "--rpc-password",
    rpcPassword,
    "--expected-chain",
    "signet"
  ]);
  if (result.broadcastedTxid !== expectedTxid) {
    throw new Error(`broadcast txid mismatch for ${expectedTxid}`);
  }
  return result.broadcastedTxid;
}

async function mineAndSync(blocks) {
  const before = await getBlockCount();
  await mineBlocks(blocks);
  await waitForResolverHeight(before + blocks);
}

async function mineUntilHeight(targetHeight) {
  const current = await getBlockCount();
  const blocksToMine = targetHeight - current;
  if (blocksToMine <= 0) {
    await waitForResolverHeight(current);
    return;
  }
  await mineBlocks(blocksToMine);
  await waitForResolverHeight(targetHeight);
}

function outcomeHeight(state, txid) {
  const outcome = state.visibleBidOutcomes.find((o) => o.txid === txid) ?? null;
  return outcome?.blockHeight ?? null;
}

async function writeJsonFile(path, value) {
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}
