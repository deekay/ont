// ONT reference client (work in progress).
//
// A CLI that assembles the existing @ont/* packages into a wallet flow:
//  - an on-device encrypted keystore (owner + funding keys)
//  - resolver lookups and owner-signed destination (value) records
//  - on-chain opening-bid claims and transfers (build + sign)
//  - portable proof verification
//  - a Lexe sidecar adapter for the (future) cheap-claim Lightning payment
//
// Keystore path comes from ONT_WALLET_KEYSTORE (default ont-wallet.json),
// password from ONT_WALLET_PASSWORD, network from ONT_WALLET_NETWORK,
// resolver from ONT_RESOLVER_URL (or a trailing arg).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { argv, env, exit } from "node:process";

import {
  buildAuctionBidArtifacts,
  buildTransferArtifacts,
  type FundingInputDescriptor,
  parseFundingInputDescriptor
} from "@ont/architect";
import { verifyProofBundle } from "@ont/consensus";
import { DEFAULT_NOTICE_WINDOW_BLOCKS, accumulatorKeyForName, verifyAccumulatorProof } from "@ont/core";
import {
  type AuctionBidPackage,
  computeRecoveryDescriptorHash,
  computeValueRecordHash,
  parseAuctionBidPackage,
  signRecoveryDescriptor,
  signValueRecord
} from "@ont/protocol";

import { bidPackageFromAuction } from "./bid-package.js";
import { BroadcastClient, resolveBroadcastBaseUrl } from "./broadcast.js";
import { isOntNetwork, type OntNetwork } from "./keys.js";
import { WalletKeystore } from "./keystore.js";
import { LexeSidecarLightningPayer, type LightningPayer, StubLightningPayer } from "./lightning.js";
import { PublisherClient } from "./publisher-client.js";
import { assembleAccumulatorBatchClaimBundle, assembleDirectAuctionProofBundle } from "./proof-export.js";
import { ResolverClient } from "./resolver.js";
import { signAuctionBidArtifacts, signTransferArtifacts } from "./signer.js";
import { transferBondPlanFromRecord } from "./transfer-plan.js";
import { fetchAddressUtxos, sumUtxoValue } from "./utxos.js";
import { WalletState } from "./wallet-state.js";

const DEFAULT_KEYSTORE_PATH = "ont-wallet.json";
const DEFAULT_STATE_PATH = "ont-wallet-state.json";
const DEFAULT_RESOLVER_URL = "http://127.0.0.1:8787";

async function main(): Promise<void> {
  const [command, ...rest] = argv.slice(2);

  switch (command) {
    case "init":
      runInit();
      return;
    case "info":
    case "status":
      runInfo();
      return;
    case "address":
      runAddress();
      return;
    case "balance":
      await runBalance(rest);
      return;
    case "auctions":
      await runAuctions(rest);
      return;
    case "lookup":
      await runLookup(rest);
      return;
    case "set-destination":
      await runSetDestination(rest);
      return;
    case "names":
      runNames();
      return;
    case "track":
      await runTrack(rest);
      return;
    case "forget":
      runForget(rest);
      return;
    case "sync":
      await runSync(rest);
      return;
    case "bids":
      runBids();
      return;
    case "watch":
      await runWatch(rest);
      return;
    case "arm-recovery":
      await runArmRecovery(rest);
      return;
    case "claim":
      await runClaim(rest);
      return;
    case "transfer":
      await runTransfer(rest);
      return;
    case "export-proof":
      await runExportProof(rest);
      return;
    case "verify":
      runVerify(rest[0]);
      return;
    case "ln-info":
      await runLnInfo(rest[0]);
      return;
    default:
      printUsage();
      return;
  }
}

function runInit(): void {
  const path = keystorePath();
  if (existsSync(path)) {
    throw new Error(`refusing to overwrite an existing keystore at ${path}`);
  }
  const network = resolveNetwork();
  const keystore = WalletKeystore.createNew(network);
  keystore.save(path, requirePassword());
  console.log(`created ONT wallet keystore at ${path} (${network})`);
  console.log(`owner pubkey:    ${keystore.ownerPubkey}`);
  console.log(`funding address: ${keystore.fundingAddress}`);
  console.log("");
  console.log(`fund this address with ${network} coins to claim and transfer names.`);
}

function runInfo(): void {
  const keystore = WalletKeystore.load(keystorePath(), requirePassword());
  console.log(`keystore:        ${keystorePath()}`);
  console.log(`network:         ${keystore.network}`);
  console.log(`owner pubkey:    ${keystore.ownerPubkey}`);
  console.log(`funding address: ${keystore.fundingAddress}`);
}

function runAddress(): void {
  console.log(WalletKeystore.load(keystorePath(), requirePassword()).fundingAddress);
}

async function runBalance(args: readonly string[]): Promise<void> {
  const flags = parseFlags(args);
  const keystore = WalletKeystore.load(keystorePath(), requirePassword());
  const esploraBaseUrl = resolveBroadcastBaseUrl(
    keystore.network,
    flags.get("esplora-url") ?? flags.get("broadcast-url"),
    env.ONT_BROADCAST_URL
  );
  const utxos = await fetchAddressUtxos({
    esploraBaseUrl,
    address: keystore.fundingAddress,
    includeUnconfirmed: flags.has("include-unconfirmed")
  });

  console.log(`funding address: ${keystore.fundingAddress}`);
  console.log(`endpoint:        ${esploraBaseUrl}`);
  if (utxos.length === 0) {
    console.log("spendable:       0 base units (no UTXOs — fund this address)");
    return;
  }
  for (const utxo of utxos) {
    console.log(`  ${utxo.valueSats} base units  ${utxo.txid}:${utxo.vout}`);
  }
  console.log(`spendable:       ${sumUtxoValue(utxos)} base units across ${utxos.length} UTXO(s)`);
}

/**
 * List live auctions a resolver knows about. With `--name <n>`, show just that
 * one (or report it's not auctioning). With `--phase <p>`, filter by phase.
 * Read-only — discovery for what's claimable / bidding-eligible.
 */
async function runAuctions(args: readonly string[]): Promise<void> {
  const flags = parseFlags(args);
  const client = new ResolverClient(resolverUrl(flags.get("resolver")));
  const { currentBlockHeight, auctions } = await client.getExperimentalAuctions();

  const nameFilter = flags.get("name") ?? flags.positionals[0];
  const phaseFilter = flags.get("phase");
  const filtered = auctions.filter((auction) => {
    if (nameFilter !== undefined && auction.normalizedName !== nameFilter.toLowerCase()) {
      return false;
    }
    if (phaseFilter !== undefined && auction.phase !== phaseFilter) {
      return false;
    }
    return true;
  });

  console.log(`resolver:        ${client.baseUrl}`);
  console.log(`block height:    ${currentBlockHeight}`);
  console.log(`auctions:        ${filtered.length} of ${auctions.length}`);
  if (filtered.length === 0) {
    if (nameFilter !== undefined) {
      console.log(`  "${nameFilter}" has no live auction at this resolver`);
    }
    return;
  }

  for (const auction of filtered) {
    const minimum = auction.currentRequiredMinimumBidSats ?? auction.openingMinimumBidSats;
    const close = auction.blocksUntilClose !== null ? `${auction.blocksUntilClose} blocks to close` : "no close yet";
    const leader = auction.currentHighestBidSats !== null
      ? ` — leader at ${auction.currentHighestBidSats} base units`
      : "";
    console.log(`  ${auction.normalizedName}  [${auction.phase}]`);
    console.log(`    class:    ${auction.classLabel} (${auction.auctionClassId})`);
    console.log(`    minimum:  ${minimum} base units${leader}`);
    console.log(`    timing:   unlock at ${auction.unlockBlock} (${auction.blocksUntilUnlock} to go), ${close}`);
  }
}

async function runLookup(args: readonly string[]): Promise<void> {
  const name = required(args[0], "name");
  const client = new ResolverClient(resolverUrl(args[1]));

  const record = await client.getNameRecord(name);
  if (record === null) {
    console.log(`${name}: not found on ${client.baseUrl} (claimable, or unknown to this resolver)`);
    return;
  }

  console.log(`name:           ${record.name}`);
  console.log(`status:         ${record.status}`);
  console.log(`owner:          ${record.currentOwnerPubkey}`);
  console.log(`state txid:     ${record.lastStateTxid}`);
  console.log(`maturity:       block ${record.maturityHeight}`);
  console.log(`required bond:  ${record.requiredBondSats} base units`);
  if (record.currentBondTxid !== undefined && record.currentBondVout !== undefined) {
    console.log(
      `current bond:   ${record.currentBondTxid}:${record.currentBondVout}` +
        (record.currentBondValueSats !== undefined ? ` (${record.currentBondValueSats} base units)` : "")
    );
  }

  const value = await client.getValueRecord(name);
  if (value === null) {
    console.log("destination:    (none published)");
    return;
  }
  console.log(`destination:    type ${value.valueType} -> ${decodePayload(value.payloadHex)} (seq ${value.sequence})`);
}

async function runSetDestination(args: readonly string[]): Promise<void> {
  const name = required(args[0], "name");
  const valueType = parseByte(required(args[1], "valueType"), "valueType");
  const value = required(args[2], "value");
  const client = new ResolverClient(resolverUrl(args[3]));

  const keystore = WalletKeystore.load(keystorePath(), requirePassword());
  const record = await client.getNameRecord(name);
  if (record === null) {
    throw new Error(`resolver doesn't know "${name}" yet — claim it first`);
  }
  if (record.currentOwnerPubkey !== keystore.ownerPubkey) {
    throw new Error(`you don't own "${name}" (current owner is ${record.currentOwnerPubkey})`);
  }

  const current = await client.getValueRecord(name);
  const sequence = current === null ? 1 : current.sequence + 1;
  const previousRecordHash = current === null ? null : current.recordHash;

  const signed = signValueRecord({
    name,
    ownerPrivateKeyHex: keystore.ownerPrivateKeyHex(),
    ownershipRef: record.lastStateTxid,
    sequence,
    previousRecordHash,
    valueType,
    payloadHex: Buffer.from(value, "utf8").toString("hex")
  });

  await client.publishValueRecord(signed);
  console.log(`published destination for "${name}" (type ${valueType}, seq ${sequence}) to ${client.baseUrl}`);

  const state = loadState(keystore.network);
  state.track({ name, ownerPubkey: keystore.ownerPubkey, ownershipRef: record.lastStateTxid });
  state.recordValue(name, { sequence, recordHash: computeValueRecordHash(signed) });
  state.save(walletStatePath());
}

function runNames(): void {
  const keystore = WalletKeystore.load(keystorePath(), requirePassword());
  const state = loadState(keystore.network);
  const names = state.list();
  const bids = state.listBids();
  if (names.length === 0 && bids.length === 0) {
    console.log("no names tracked yet — claim one, then `track <name>`");
    return;
  }

  // Summary roll-up so a glance tells you where the wallet stands. A cheap-rail
  // claim that is still provisional (or was contested) is NOT counted as owned —
  // it only finalizes once its notice window closes uncontested.
  const isUnsettledCheap = (n: (typeof names)[number]): boolean =>
    n.cheapClaim?.status === "provisional" || n.cheapClaim?.status === "contested";
  const owned = names.filter(
    (n) => n.ownerPubkey === keystore.ownerPubkey && n.pendingClaim === undefined && !isUnsettledCheap(n)
  ).length;
  const pending = names.filter((n) => n.pendingClaim !== undefined).length;
  const cheapRail = names.filter((n) => n.batchInclusion !== undefined).length;
  const provisional = names.filter((n) => n.cheapClaim?.status === "provisional").length;
  const cheapRailNote = cheapRail > 0 ? `${cheapRail} via cheap rail (${provisional} provisional)` : "0 via cheap rail";
  console.log(
    `tracked: ${names.length} name(s) — ${owned} owned, ${pending} pending, ${cheapRailNote}; ${bids.length} bid(s) in flight`
  );
  console.log("");

  for (const entry of names) {
    const owned = entry.ownerPubkey === keystore.ownerPubkey ? "" : "  (owner pubkey differs from this keystore)";
    console.log(`${entry.name}${owned}`);
    console.log(`  ownership ref: ${entry.ownershipRef}`);
    if (entry.status !== undefined) {
      console.log(`  status:        ${entry.status}${entry.lastSyncedAt ? ` (synced ${entry.lastSyncedAt})` : ""}`);
    }
    if (entry.batchInclusion !== undefined) {
      console.log(
        `  cheap rail:    anchored at ${entry.batchInclusion.anchorTxid}` +
          (entry.batchInclusion.anchorHeight > 0 ? ` (height ${entry.batchInclusion.anchorHeight})` : "")
      );
    }
    if (entry.cheapClaim !== undefined) {
      const c = entry.cheapClaim;
      const detail =
        c.status === "provisional"
          ? c.noticeWindowCloseHeight > 0
            ? ` — notice window closes ~block ${c.noticeWindowCloseHeight}; finalizes if uncontested`
            : ` — notice window ${c.noticeWindowBlocks} blocks; finalizes if uncontested (anchor height pending)`
          : c.status === "contested"
            ? " — contested; escalated to the bonded auction"
            : " — notice window closed uncontested";
      console.log(`  claim status:  ${c.status}${detail}`);
    }
    if (entry.lastValueSequence !== undefined) {
      console.log(`  destination:   seq ${entry.lastValueSequence} (${entry.lastValueRecordHash ?? "?"})`);
    }
    if (entry.recovery !== undefined) {
      console.log(
        `  recovery:      armed seq ${entry.recovery.sequence} -> ${entry.recovery.recoveryAddress} ` +
          `(${entry.recovery.challengeWindowBlocks}-block window)`
      );
    }
    if (entry.pendingClaim !== undefined) {
      console.log(
        `  pending claim: bid ${entry.pendingClaim.bidAmountSats} base units, txid ${entry.pendingClaim.bidTxid}` +
          `${entry.pendingClaim.broadcast ? " (broadcast)" : " (not yet broadcast)"}`
      );
    }
  }
}

async function runTrack(args: readonly string[]): Promise<void> {
  const name = required(args[0], "name");
  const client = new ResolverClient(resolverUrl(args[1]));
  const keystore = WalletKeystore.load(keystorePath(), requirePassword());

  const record = await client.getNameRecord(name);
  if (record === null) {
    throw new Error(`resolver doesn't know "${name}" yet — claim it first`);
  }
  if (record.currentOwnerPubkey !== keystore.ownerPubkey) {
    console.log(
      `warning: "${name}" is owned by ${record.currentOwnerPubkey}, not this keystore (${keystore.ownerPubkey})`
    );
  }

  const state = loadState(keystore.network);
  state.track({ name, ownerPubkey: record.currentOwnerPubkey, ownershipRef: record.lastStateTxid });
  state.save(walletStatePath());
  console.log(`tracking "${name}" (${record.status}) in ${walletStatePath()}`);
}

function runForget(args: readonly string[]): void {
  const name = required(args[0], "name");
  const keystore = WalletKeystore.load(keystorePath(), requirePassword());
  const state = loadState(keystore.network);
  if (state.forget(name)) {
    state.save(walletStatePath());
    console.log(`stopped tracking "${name}" locally (ownership on Bitcoin is unchanged)`);
  } else {
    console.log(`"${name}" was not tracked`);
  }
}

function runBids(): void {
  const keystore = WalletKeystore.load(keystorePath(), requirePassword());
  const bids = loadState(keystore.network).listBids();
  if (bids.length === 0) {
    console.log("no auction bids tracked");
    return;
  }
  for (const bid of bids) {
    const status = bid.bondStatus ?? "unknown (run sync)";
    const release = bid.bondReleaseBlock !== undefined && bid.bondReleaseBlock !== null
      ? `, release ${bid.bondReleaseBlock}`
      : "";
    const spend = bid.bondSpendStatus !== undefined ? `, spend ${bid.bondSpendStatus}` : "";
    const broadcast = bid.broadcast ? "broadcast" : "not broadcast";
    console.log(`${bid.name}  ${bid.bidTxid}:${bid.bondVout}`);
    console.log(`  ${bid.bondAmountSats} base units, ${broadcast}, auction ${bid.auctionId}`);
    console.log(`  bond: ${status}${release}${spend}`);
  }
}

/**
 * Reconcile tracked names against the resolver: for each name (or all tracked),
 * adopt the resolver's confirmed ownership ref + status when this wallet owns
 * it, clearing a provisional pending-claim marker once the claim lands.
 */
async function runSync(args: readonly string[]): Promise<void> {
  const flags = parseFlags(args);
  const keystore = WalletKeystore.load(keystorePath(), requirePassword());
  const client = new ResolverClient(resolverUrl(flags.get("resolver")));
  const state = loadState(keystore.network);

  const onlyName = flags.positionals[0];
  const targets = onlyName !== undefined ? [onlyName] : state.list().map((entry) => entry.name);
  if (targets.length === 0) {
    console.log("no names tracked yet — nothing to sync");
    return;
  }

  let changed = false;
  for (const name of targets) {
    if (!state.has(name)) {
      console.log(`${name}: not tracked locally (skipping)`);
      continue;
    }

    let record;
    try {
      record = await client.getNameRecord(name);
    } catch (error) {
      console.log(`${name}: resolver error — ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    const tracked = state.get(name);
    if (record === null) {
      console.log(`${name}: not yet known to ${client.baseUrl}${tracked?.pendingClaim ? " (claim still pending)" : ""}`);
      continue;
    }

    if (record.currentOwnerPubkey === keystore.ownerPubkey) {
      const refChanged = tracked?.ownershipRef !== record.lastStateTxid;
      const note = tracked?.pendingClaim !== undefined
        ? " — claim confirmed"
        : refChanged
          ? " — ownership ref updated"
          : "";
      state.recordSync(name, { ownershipRef: record.lastStateTxid, status: record.status });
      changed = true;
      console.log(`${name}: you own it (${record.status})${note}`);
      // The resolver is the canonical authority the wallet defers to: if it now
      // reports this wallet as the mature owner, a provisional cheap-rail claim
      // has resolved in our favor (the notice window closed uncontested).
      if (tracked?.cheapClaim?.status === "provisional" && record.status === "mature") {
        const resolved = state.reconcileCheapClaim(name, {
          chainHeight: tracked.cheapClaim.noticeWindowCloseHeight
        });
        if (resolved === "final") {
          console.log(`  cheap-rail claim finalized — notice window closed uncontested`);
        }
      }
    } else if (tracked?.cheapClaim?.status === "provisional") {
      // A different owner on a name we hold a provisional cheap claim for means
      // the name was contested and our claim did not win it.
      state.reconcileCheapClaim(name, { chainHeight: 0, contested: true });
      changed = true;
      console.log(
        `${name}: now owned by ${record.currentOwnerPubkey} — your provisional cheap-rail claim was contested and did not win`
      );
    } else {
      console.log(
        `${name}: now owned by ${record.currentOwnerPubkey} — not this wallet` +
          `${tracked?.pendingClaim ? " (claim did not win)" : ""}`
      );
    }
  }

  // Also reconcile any tracked auction bids against the resolver's auction
  // state — this is what tells the wallet a bond has become releasable and is
  // safe for auto-fund to spend.
  const bidsToSync = state.listBids().filter((bid) => onlyName === undefined || bid.name === onlyName.toLowerCase());
  const auctionCache = new Map<string, Awaited<ReturnType<ResolverClient["findAuctionForName"]>>>();
  for (const bid of bidsToSync) {
    if (!auctionCache.has(bid.name)) {
      try {
        auctionCache.set(bid.name, await client.findAuctionForName(bid.name));
      } catch (error) {
        console.log(`bid ${bid.bidTxid.slice(0, 12)}…: resolver error — ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
    }
    const auction = auctionCache.get(bid.name) ?? null;
    if (auction === null) {
      console.log(`bid ${bid.bidTxid.slice(0, 12)}… for "${bid.name}": no live auction (the bid may have been rejected or settled-out)`);
      continue;
    }
    const outcome = (auction.visibleBidOutcomes ?? []).find((o) => o.txid === bid.bidTxid);
    if (outcome === undefined || outcome.bondStatus === undefined || outcome.bondSpendStatus === undefined) {
      console.log(`bid ${bid.bidTxid.slice(0, 12)}… for "${bid.name}": resolver has no bond status yet`);
      continue;
    }
    state.recordBidSync(bid.bidTxid, {
      bondStatus: outcome.bondStatus,
      bondReleaseBlock: outcome.bondReleaseBlock ?? null,
      bondSpendStatus: outcome.bondSpendStatus
    });
    changed = true;
    console.log(`bid ${bid.bidTxid.slice(0, 12)}… for "${bid.name}": bond ${outcome.bondStatus} (spend: ${outcome.bondSpendStatus})`);
  }

  if (changed) {
    state.save(walletStatePath());
    console.log(`updated ${walletStatePath()}`);
  }
}

/**
 * Long-running watcher: poll the resolver every N seconds for tracked names
 * and bid bonds, logging only when something changes (name status flips,
 * ownership transfers, bond status flips). Useful for live testing — leave
 * it running in a terminal while you bid/claim/transfer from another.
 */
async function runWatch(args: readonly string[]): Promise<void> {
  const flags = parseFlags(args);
  const intervalSeconds = flags.has("interval")
    ? Number(parseBigIntArg(flags.get("interval") as string, "interval"))
    : 60;
  if (intervalSeconds < 1) {
    throw new Error("--interval must be at least 1 second");
  }
  const keystore = WalletKeystore.load(keystorePath(), requirePassword());
  const client = new ResolverClient(resolverUrl(flags.get("resolver")));
  const once = flags.has("once");

  console.log(`watching ${client.baseUrl} every ${intervalSeconds}s (Ctrl+C to stop)`);

  // Track what we last reported per entity, so we only log on changes.
  const lastName = new Map<string, string>();
  const lastBid = new Map<string, string>();

  // Graceful interrupt — finish the in-flight tick, then exit cleanly.
  let stop = false;
  const interrupt = (): void => {
    stop = true;
    console.log("\nstopping after this tick...");
  };
  process.on("SIGINT", interrupt);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    await watchTick(client, keystore, lastName, lastBid);
    if (once || stop) {
      break;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, intervalSeconds * 1000));
  }
  process.off("SIGINT", interrupt);
}

/** A single polling pass; mutates the last-seen maps and the wallet state. */
async function watchTick(
  client: ResolverClient,
  keystore: WalletKeystore,
  lastName: Map<string, string>,
  lastBid: Map<string, string>
): Promise<void> {
  const state = loadState(keystore.network);
  let changed = false;

  for (const tracked of state.list()) {
    let record;
    try {
      record = await client.getNameRecord(tracked.name);
    } catch (error) {
      logIfChanged(`name ${tracked.name}`, lastName, `error: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (record === null) {
      logIfChanged(`name ${tracked.name}`, lastName, "not yet known to resolver");
      continue;
    }
    const fingerprint = `${record.status}|${record.lastStateTxid}|${record.currentOwnerPubkey}`;
    if (record.currentOwnerPubkey === keystore.ownerPubkey) {
      if (lastName.get(tracked.name) !== fingerprint) {
        console.log(
          `[${timestamp()}] ${tracked.name}: owned by you, status ${record.status}, state ${record.lastStateTxid.slice(0, 12)}…`
        );
        lastName.set(tracked.name, fingerprint);
      }
      state.recordSync(tracked.name, { ownershipRef: record.lastStateTxid, status: record.status });
      changed = true;
    } else if (lastName.get(tracked.name) !== fingerprint) {
      console.log(`[${timestamp()}] ${tracked.name}: now owned by ${record.currentOwnerPubkey} (not you)`);
      lastName.set(tracked.name, fingerprint);
    }
  }

  const auctionCache = new Map<string, Awaited<ReturnType<ResolverClient["findAuctionForName"]>>>();
  for (const bid of state.listBids()) {
    if (!auctionCache.has(bid.name)) {
      try {
        auctionCache.set(bid.name, await client.findAuctionForName(bid.name));
      } catch (error) {
        logIfChanged(
          `bid ${bid.bidTxid.slice(0, 12)}…`,
          lastBid,
          `resolver error: ${error instanceof Error ? error.message : String(error)}`
        );
        continue;
      }
    }
    const auction = auctionCache.get(bid.name) ?? null;
    if (auction === null) {
      logIfChanged(`bid ${bid.bidTxid.slice(0, 12)}…`, lastBid, `no live auction for "${bid.name}"`);
      continue;
    }
    const outcome = (auction.visibleBidOutcomes ?? []).find((o) => o.txid === bid.bidTxid);
    if (outcome === undefined || outcome.bondStatus === undefined || outcome.bondSpendStatus === undefined) {
      logIfChanged(`bid ${bid.bidTxid.slice(0, 12)}…`, lastBid, "no bond status from resolver");
      continue;
    }
    const fingerprint = `${outcome.bondStatus}|${outcome.bondSpendStatus}|${outcome.bondReleaseBlock ?? ""}`;
    if (lastBid.get(bid.bidTxid) !== fingerprint) {
      console.log(
        `[${timestamp()}] bid ${bid.bidTxid.slice(0, 12)}… ("${bid.name}"): bond ${outcome.bondStatus}, ` +
          `spend ${outcome.bondSpendStatus}${outcome.bondReleaseBlock ? `, release ${outcome.bondReleaseBlock}` : ""}`
      );
      lastBid.set(bid.bidTxid, fingerprint);
    }
    state.recordBidSync(bid.bidTxid, {
      bondStatus: outcome.bondStatus,
      bondReleaseBlock: outcome.bondReleaseBlock ?? null,
      bondSpendStatus: outcome.bondSpendStatus
    });
    changed = true;
  }

  if (changed) {
    state.save(walletStatePath());
  }
}

function logIfChanged(label: string, last: Map<string, string>, line: string): void {
  if (last.get(label) !== line) {
    console.log(`[${timestamp()}] ${label}: ${line}`);
    last.set(label, line);
  }
}

function timestamp(): string {
  return new Date().toISOString().slice(11, 19); // HH:MM:SSZ-ish
}

async function runArmRecovery(args: readonly string[]): Promise<void> {
  const name = required(args[0], "name");
  const recoveryAddress = required(args[1], "recoveryAddress");
  const client = new ResolverClient(resolverUrl(args[2]));
  const keystore = WalletKeystore.load(keystorePath(), requirePassword());

  const record = await client.getNameRecord(name);
  if (record === null) {
    throw new Error(`resolver doesn't know "${name}" yet — claim it first`);
  }
  if (record.currentOwnerPubkey !== keystore.ownerPubkey) {
    throw new Error(`you don't own "${name}" (current owner is ${record.currentOwnerPubkey})`);
  }

  const current = await client.getRecoveryDescriptor(name);
  const sequence = current === null ? 1 : current.sequence + 1;
  const previousDescriptorHash = current === null ? null : current.descriptorHash;

  const descriptor = signRecoveryDescriptor({
    name,
    ownerPrivateKeyHex: keystore.ownerPrivateKeyHex(),
    ownershipRef: record.lastStateTxid,
    sequence,
    previousDescriptorHash,
    recoveryAddress
  });

  await client.publishRecoveryDescriptor(descriptor);
  const descriptorHash = computeRecoveryDescriptorHash(descriptor);
  console.log(
    `armed recovery for "${name}" (seq ${sequence}) -> ${recoveryAddress} ` +
      `(${descriptor.challengeWindowBlocks}-block challenge window) via ${client.baseUrl}`
  );

  const state = loadState(keystore.network);
  state.track({ name, ownerPubkey: keystore.ownerPubkey, ownershipRef: record.lastStateTxid });
  state.recordRecovery(name, {
    recoveryAddress,
    sequence,
    descriptorHash,
    challengeWindowBlocks: descriptor.challengeWindowBlocks,
    armedAt: descriptor.issuedAt
  });
  state.save(walletStatePath());
}

/**
 * The auction bid package to claim: either a hand-built `--bid-package` JSON
 * (offline path), or one built from a resolver's live auction state for
 * `claim <name> --amount <n>`.
 */
async function resolveBidPackage(flags: ParsedFlags, keystore: WalletKeystore): Promise<AuctionBidPackage> {
  const bidPackagePath = flags.get("bid-package");
  if (bidPackagePath !== undefined) {
    return parseAuctionBidPackage(JSON.parse(readFileSync(bidPackagePath, "utf8")) as Record<string, unknown>);
  }

  const name = required(flags.positionals[0], "name (or --bid-package <path>)");
  const bidAmountSats = parseBigIntArg(required(flags.get("amount"), "--amount"), "amount");
  const client = new ResolverClient(resolverUrl(flags.get("resolver")));
  const auction = await client.findAuctionForName(name);
  if (auction === null) {
    throw new Error(`no live auction for "${name}" at ${client.baseUrl} (check the name, or pass --bid-package)`);
  }
  console.log(`found auction ${auction.auctionId} for "${auction.normalizedName}" (phase ${auction.phase}) at ${client.baseUrl}`);
  return bidPackageFromAuction(auction, {
    ownerPubkey: keystore.ownerPubkey,
    bidderId: flags.get("bidder-id") ?? keystore.ownerPubkey,
    bidAmountSats
  });
}

async function runClaim(args: readonly string[]): Promise<void> {
  const flags = parseFlags(args);
  const rail = flags.get("rail") ?? "auction";
  if (rail === "cheap") {
    await runClaimCheap(flags);
    return;
  }
  if (rail !== "auction") {
    throw new Error(`unknown --rail "${rail}" (use "auction" or "cheap")`);
  }
  const feeSats = parseBigIntArg(required(flags.get("fee-sats"), "--fee-sats"), "fee-sats");

  const keystore = WalletKeystore.load(keystorePath(), requirePassword());
  const bidPackage = await resolveBidPackage(flags, keystore);

  // The bid commits an owner pubkey on-chain; it must be this wallet's owner
  // key, or the wallet won't control the name it's bidding for. (Always true on
  // the resolver path, which sets it; this guards a hand-built --bid-package.)
  if (bidPackage.ownerPubkey !== keystore.ownerPubkey) {
    throw new Error(
      `bid package owner pubkey (${bidPackage.ownerPubkey}) is not this wallet's owner key (${keystore.ownerPubkey})`
    );
  }
  if (bidPackage.previewStatus !== "currently_valid") {
    // Building a bid the auction will reject burns a tx for nothing. Refuse
    // unless the user explicitly opts in (e.g., for testing rejection paths).
    const detail =
      bidPackage.previewRequiredMinimumBidSats !== null
        ? ` (current minimum is ${bidPackage.previewRequiredMinimumBidSats} base units)`
        : "";
    const message = `bid preview is "${bidPackage.previewStatus}" — ${bidPackage.previewSummary}${detail}`;
    if (!flags.has("allow-rejected")) {
      throw new Error(`${message}\n(pass --allow-rejected to build it anyway)`);
    }
    console.log(`warning: ${message}`);
  }

  const fundingInputs = await resolveFundingInputs(flags, keystore);
  const bondAddress = flags.get("bond-address") ?? keystore.fundingAddress;
  const changeAddress = flags.get("change-address") ?? keystore.fundingAddress;

  const artifacts = buildAuctionBidArtifacts({
    bidPackage,
    fundingInputs,
    feeSats,
    network: keystore.network,
    bondAddress,
    changeAddress,
    ...(flags.has("bond-vout") ? { bondVout: parseByte(flags.get("bond-vout") as string, "bond-vout") } : {})
  });

  const signed = signAuctionBidArtifacts({
    artifacts,
    fundingWif: keystore.fundingWif(),
    network: keystore.network
  });

  console.log(`name:         ${bidPackage.name}`);
  console.log(`bid amount:   ${bidPackage.bidAmountSats} base units`);
  console.log(`fee:          ${artifacts.feeSats} base units`);
  console.log(`bond -> ${artifacts.bondAddress} (vout ${artifacts.bondVout})`);
  console.log(`change:       ${artifacts.changeValueSats} base units -> ${changeAddress}`);
  console.log(`bid txid:     ${signed.signedTransactionId}`);
  console.log(`signed ${signed.signedInputCount} input(s); transaction is ready to broadcast.`);
  console.log("");
  console.log("signed transaction (hex):");
  console.log(signed.signedTransactionHex);

  const broadcasted = await maybeBroadcast({
    flags,
    network: keystore.network,
    signedTransactionHex: signed.signedTransactionHex,
    expectedTxid: signed.signedTransactionId
  });

  const state = loadState(keystore.network);
  state.recordPendingClaim(
    { name: bidPackage.name, ownerPubkey: keystore.ownerPubkey },
    {
      bidTxid: signed.signedTransactionId,
      bidAmountSats: bidPackage.bidAmountSats,
      broadcast: broadcasted,
      claimedAt: new Date().toISOString()
    }
  );
  state.recordBid({
    bidTxid: signed.signedTransactionId,
    bondVout: artifacts.bondVout,
    bondAmountSats: bidPackage.bidAmountSats,
    name: bidPackage.name,
    auctionId: bidPackage.auctionId,
    bidderId: bidPackage.bidderId,
    broadcast: broadcasted
  });
  state.save(walletStatePath());
  console.log("");
  console.log(`recorded a pending claim for "${bidPackage.name}" in ${walletStatePath()}`);
  console.log(`bond outpoint ${signed.signedTransactionId}:${artifacts.bondVout} is locked until \`sync\` confirms its release`);
}

/**
 * The cheap batched-claim rail: pay a small Lightning invoice to a publisher,
 * receive an inclusion proof anchored to Bitcoin, verify it locally. No L1
 * auction, no bond, no PSBT — the publisher does the on-chain anchoring on
 * the wallet's behalf. The publisher gets no authority: every promise it
 * makes is verified against @ont/core's accumulator before we trust it.
 */
async function runClaimCheap(flags: ParsedFlags): Promise<void> {
  const name = required(flags.positionals[0], "name");
  const keystore = WalletKeystore.load(keystorePath(), requirePassword());

  const publisherBaseUrl = flags.get("publisher") ?? env.ONT_PUBLISHER_URL ?? "http://127.0.0.1:7878";
  const client = new PublisherClient(publisherBaseUrl);

  console.log(`requesting quote for "${name}" from ${client.baseUrl}`);
  const quote = await client.quote({
    name,
    ownerPubkey: keystore.ownerPubkey,
    paymentRail: "lightning"
  });

  if (!quote.available) {
    throw new Error(`publisher reports "${name}" unavailable (${quote.reason ?? "no reason given"})`);
  }
  // Verify the publisher isn't lying about what leaf/value will be inserted.
  // These are deterministic; the wallet should never pay a quote that promises
  // anything else.
  const expectedLeaf = accumulatorKeyForName(name);
  if (quote.leaf !== expectedLeaf) {
    throw new Error(`publisher quote leaf does not match sha256(name) (got ${quote.leaf}, expected ${expectedLeaf})`);
  }
  if (quote.ownerCommitment.toLowerCase() !== keystore.ownerPubkey.toLowerCase()) {
    throw new Error("publisher quote ownerCommitment does not match this wallet's owner key");
  }
  if (quote.lightningInvoice === undefined || quote.lightningInvoice === "") {
    throw new Error("publisher did not return a lightning invoice");
  }
  console.log(
    `quote ${quote.quoteId}: ${quote.totalBaseSats} base units` +
      ` (gate ${quote.gateBaseSats} + service ${quote.serviceBaseSats}), expires ${quote.expiresAt}`
  );

  const lnUrl = flags.get("ln-url");
  const payer: LightningPayer = lnUrl !== undefined
    ? new LexeSidecarLightningPayer(lnUrl)
    : new StubLightningPayer();
  console.log(`paying via ${lnUrl !== undefined ? `Lexe sidecar at ${lnUrl}` : "stub (offline dry-run — no node was contacted)"}`);

  const payment = await payer.pay({
    payable: quote.lightningInvoice,
    amountSats: Number(quote.totalBaseSats),
    note: `ONT cheap-claim: ${quote.name}`
  });
  if (payment.status !== "succeeded") {
    throw new Error(`payment did not succeed: ${payment.status}`);
  }
  console.log(`payment: ${payment.status}, id ${payment.paymentId ?? "(none)"}`);

  const receipt = await client.submit({
    quoteId: quote.quoteId,
    paymentProof: {
      rail: "lightning",
      ...(payment.paymentId !== null ? { paymentHash: payment.paymentId } : {})
    }
  });

  if (receipt.status !== "confirmed") {
    console.log(`receipt: ${receipt.status} — poll with \`/claim/${quote.quoteId}\` to wait for confirmation`);
    return;
  }
  if (receipt.inclusionProof === undefined || receipt.anchorTxid === undefined) {
    throw new Error("publisher reported confirmed status without an inclusion proof + anchor txid");
  }

  // The whole point of the local verification: we don't trust the publisher's
  // word. The proof must verify against its own committed root.
  const proofOk = verifyAccumulatorProof(receipt.inclusionProof.root, {
    keyHex: receipt.inclusionProof.leaf,
    value: receipt.inclusionProof.value,
    siblings: receipt.inclusionProof.siblings
  });
  if (!proofOk) {
    throw new Error("publisher's inclusion proof does not verify — refusing to record this claim");
  }
  if (receipt.inclusionProof.leaf !== expectedLeaf) {
    throw new Error("publisher's inclusion proof is for a different leaf than the quoted name");
  }
  if (receipt.inclusionProof.value.toLowerCase() !== keystore.ownerPubkey.toLowerCase()) {
    throw new Error("publisher's inclusion proof commits a different owner pubkey than this wallet");
  }
  console.log(`inclusion proof verifies locally; anchored at ${receipt.anchorTxid}` +
    (receipt.anchorHeight !== undefined ? ` (height ${receipt.anchorHeight})` : ""));

  const anchorHeight = receipt.anchorHeight ?? 0;
  const state = loadState(keystore.network);
  state.track({ name: quote.name, ownerPubkey: keystore.ownerPubkey, ownershipRef: receipt.anchorTxid });
  state.recordBatchInclusion(quote.name, {
    root: receipt.inclusionProof.root,
    leaf: receipt.inclusionProof.leaf,
    value: receipt.inclusionProof.value,
    siblings: receipt.inclusionProof.siblings,
    anchorTxid: receipt.anchorTxid,
    anchorHeight,
    claimedAt: new Date().toISOString()
  });
  // A cheap claim is NOT final on the publisher's receipt: anchoring opens a
  // notice window, and the claim only finalizes if no competing claim lands
  // during it (ONT.md, "Claiming a name — one path"). Record it as provisional
  // and let `sync` advance it once canonical state confirms the window closed.
  const noticeWindowCloseHeight = anchorHeight > 0 ? anchorHeight + DEFAULT_NOTICE_WINDOW_BLOCKS : 0;
  state.recordCheapClaim(quote.name, { noticeWindowCloseHeight, noticeWindowBlocks: DEFAULT_NOTICE_WINDOW_BLOCKS });
  state.save(walletStatePath());
  if (noticeWindowCloseHeight > 0) {
    console.log(
      `"${quote.name}" recorded as a provisional cheap-rail claim in ${walletStatePath()} — ` +
        `finalizes if uncontested once its notice window closes (~block ${noticeWindowCloseHeight}); ` +
        `run \`sync\` after that height to confirm`
    );
  } else {
    console.log(
      `"${quote.name}" recorded as a provisional cheap-rail claim in ${walletStatePath()} — ` +
        `finalizes if uncontested after the ${DEFAULT_NOTICE_WINDOW_BLOCKS}-block notice window; ` +
        `run \`sync\` once the anchor confirms to track it`
    );
  }
}

async function runTransfer(args: readonly string[]): Promise<void> {
  const flags = parseFlags(args);
  const name = required(flags.positionals[0], "name");
  const newOwnerPubkey = required(flags.get("to"), "--to (new owner pubkey)");
  const successorBondVout = flags.has("successor-bond-vout")
    ? parseByte(flags.get("successor-bond-vout") as string, "successor-bond-vout")
    : 0;
  const feeSats = parseBigIntArg(required(flags.get("fee-sats"), "--fee-sats"), "fee-sats");

  const keystore = WalletKeystore.load(keystorePath(), requirePassword());
  if (newOwnerPubkey === keystore.ownerPubkey) {
    throw new Error("--to is this wallet's own owner key; a transfer must hand the name to a different key");
  }

  const plan = await resolveTransferPlan(flags, keystore, name);
  const bondAddress = flags.get("bond-address") ?? keystore.fundingAddress;
  const changeAddress = flags.get("change-address") ?? keystore.fundingAddress;

  const artifacts = buildTransferArtifacts({
    prevStateTxid: plan.prevStateTxid,
    ownerPrivateKeyHex: keystore.ownerPrivateKeyHex(),
    newOwnerPubkey,
    successorBondVout,
    successorBondSats: plan.successorBondSats,
    currentBondInput: plan.bondInput,
    additionalFundingInputs: plan.additionalFundingInputs,
    feeSats,
    network: keystore.network,
    bondAddress,
    changeAddress
  });

  const signed = signTransferArtifacts({
    artifacts,
    fundingWif: keystore.fundingWif(),
    network: keystore.network
  });

  console.log(`name:           ${name}`);
  console.log(`new owner:      ${newOwnerPubkey}`);
  console.log(`successor bond: ${plan.successorBondSats} base units -> ${bondAddress} (vout ${successorBondVout})`);
  console.log(`fee:            ${artifacts.feeSats} base units`);
  console.log(`change:         ${artifacts.changeValueSats} base units -> ${changeAddress}`);
  console.log(`transfer txid:  ${signed.signedTransactionId}`);
  console.log(`signed ${signed.signedInputCount} input(s); transaction is ready to broadcast.`);
  console.log("");
  console.log("signed transaction (hex):");
  console.log(signed.signedTransactionHex);

  await maybeBroadcast({
    flags,
    network: keystore.network,
    signedTransactionHex: signed.signedTransactionHex,
    expectedTxid: signed.signedTransactionId
  });

  console.log("");
  console.log(`once this confirms, "${name}" belongs to ${newOwnerPubkey}.`);
  console.log(`this wallet keeps tracking it until you run: forget ${name}`);
}

interface ResolvedTransferPlan {
  readonly prevStateTxid: string;
  readonly bondInput: FundingInputDescriptor;
  readonly successorBondSats: bigint;
  readonly additionalFundingInputs: readonly FundingInputDescriptor[];
}

/**
 * Resolve a transfer's prev-state txid, bond input, successor bond, and fee
 * funding. Fully explicit flags run offline; otherwise the bond details come
 * from the resolver's name record and the fee is auto-funded from the funding
 * address (excluding the bond outpoint).
 */
async function resolveTransferPlan(
  flags: ParsedFlags,
  keystore: WalletKeystore,
  name: string
): Promise<ResolvedTransferPlan> {
  const explicitPrev = flags.get("prev-state-txid");
  const explicitBondSpec = flags.get("bond-input");
  const explicitBond = explicitBondSpec === undefined ? undefined : parseFundingInputDescriptor(explicitBondSpec);
  const explicitSuccessorBond = flags.has("successor-bond-sats")
    ? parseBigIntArg(flags.get("successor-bond-sats") as string, "successor-bond-sats")
    : undefined;
  const explicitInputs = flags.getAll("input");

  // Fully explicit → offline, no resolver call.
  if (explicitPrev !== undefined && explicitBond !== undefined && explicitSuccessorBond !== undefined) {
    return {
      prevStateTxid: explicitPrev,
      bondInput: explicitBond,
      successorBondSats: explicitSuccessorBond,
      additionalFundingInputs: explicitInputs.map(parseFundingInputDescriptor)
    };
  }

  const client = new ResolverClient(resolverUrl(flags.get("resolver")));
  const record = await client.getNameRecord(name);
  if (record === null) {
    throw new Error(
      `resolver doesn't know "${name}" — pass --prev-state-txid, --bond-input and --successor-bond-sats to transfer offline`
    );
  }
  if (record.currentOwnerPubkey !== keystore.ownerPubkey) {
    throw new Error(`you don't own "${name}" (current owner is ${record.currentOwnerPubkey})`);
  }

  const plan = transferBondPlanFromRecord(record, {
    bondInputAddress: flags.get("bond-input-address") ?? keystore.fundingAddress,
    ...(explicitPrev !== undefined ? { explicitPrevStateTxid: explicitPrev } : {}),
    ...(explicitBond !== undefined ? { explicitBondInput: explicitBond } : {}),
    ...(explicitSuccessorBond !== undefined ? { explicitSuccessorBondSats: explicitSuccessorBond } : {})
  });
  console.log(
    `name "${name}": prev state ${plan.prevStateTxid}, bond ${plan.bondInput.txid}:${plan.bondInput.vout} ` +
      `(${plan.bondInput.valueSats} base units) via ${client.baseUrl}`
  );

  let additionalFundingInputs: readonly FundingInputDescriptor[];
  if (explicitInputs.length > 0) {
    additionalFundingInputs = explicitInputs.map(parseFundingInputDescriptor);
  } else if (flags.has("no-extra-funding")) {
    additionalFundingInputs = [];
  } else {
    additionalFundingInputs = await autoFundExcluding(flags, keystore, plan.bondInput);
  }

  return {
    prevStateTxid: plan.prevStateTxid,
    bondInput: plan.bondInput,
    successorBondSats: plan.successorBondSats,
    additionalFundingInputs
  };
}

/**
 * Auto-fund from the funding address, excluding the named outpoint (the bond
 * being spent) and any tracked locked bid bonds (which mustn't be spent yet).
 */
async function autoFundExcluding(
  flags: ParsedFlags,
  keystore: WalletKeystore,
  exclude: FundingInputDescriptor
): Promise<readonly FundingInputDescriptor[]> {
  const esploraBaseUrl = resolveBroadcastBaseUrl(
    keystore.network,
    flags.get("esplora-url") ?? flags.get("broadcast-url"),
    env.ONT_BROADCAST_URL
  );
  const utxos = await fetchAddressUtxos({
    esploraBaseUrl,
    address: keystore.fundingAddress,
    includeUnconfirmed: flags.has("include-unconfirmed")
  });
  const locked = loadState(keystore.network).lockedBondOutpoints();
  const extra = utxos.filter((utxo) => {
    if (utxo.txid === exclude.txid && utxo.vout === exclude.vout) {
      return false;
    }
    return !locked.has(`${utxo.txid}:${utxo.vout}`);
  });
  const skippedLocked = utxos.filter((utxo) => locked.has(`${utxo.txid}:${utxo.vout}`)).length;
  if (extra.length > 0) {
    console.log(
      `auto-funding the fee from ${extra.length} UTXO(s) at ${keystore.fundingAddress} via ${esploraBaseUrl}` +
        (skippedLocked > 0 ? ` — excluded ${skippedLocked} locked bid bond(s)` : "")
    );
  } else {
    console.log(
      `no spendable UTXOs at ${keystore.fundingAddress} beyond the bond` +
        (skippedLocked > 0 ? ` (${skippedLocked} locked bid bond(s) excluded; run \`sync\`)` : "") +
        " — the bond must cover the fee, or pass --input / --successor-bond-sats"
    );
  }
  return extra;
}

/**
 * Assemble a portable ownership proof bundle for a name from resolver data,
 * verify it locally with @ont/consensus, and emit it. The bundle is
 * self-verifying — anyone can check it offline without trusting the resolver.
 */
async function runExportProof(args: readonly string[]): Promise<void> {
  const flags = parseFlags(args);
  const name = required(flags.positionals[0], "name");
  const keystore = WalletKeystore.load(keystorePath(), requirePassword());

  // Cheap-rail names carry their inclusion proof locally — emit that bundle
  // source without going back to a resolver.
  const tracked = loadState(keystore.network).get(name);
  if (tracked?.batchInclusion !== undefined) {
    const bundle = assembleAccumulatorBatchClaimBundle({
      name: tracked.name,
      ownerPubkey: tracked.ownerPubkey,
      inclusion: tracked.batchInclusion,
      ...(flags.has("assurance-tier") ? { assuranceTier: flags.get("assurance-tier") as string } : {}),
      ...(flags.has("goal") ? { verificationGoal: flags.get("goal") as string } : {})
    });
    emitProofBundle(bundle, flags, tracked.name);
    return;
  }

  // Otherwise, go the resolver/auction route.
  const client = new ResolverClient(resolverUrl(flags.get("resolver")));

  const record = await client.getNameRecord(name);
  if (record === null) {
    throw new Error(`resolver doesn't know "${name}" — nothing to prove`);
  }
  const auction = await client.findAuctionForName(name);
  if (auction === null) {
    throw new Error(`no auction found for "${name}" at ${client.baseUrl} — can only export L1-auction proofs for now`);
  }
  // Value history is optional; fold it in if any records exist.
  const valueHistory = flags.has("no-value-chain") ? null : await client.getValueHistory(name);

  const bundle = assembleDirectAuctionProofBundle({
    record,
    auction,
    ...(valueHistory !== null && valueHistory.records.length > 0 ? { valueHistory } : {}),
    ...(flags.has("assurance-tier") ? { assuranceTier: flags.get("assurance-tier") as string } : {}),
    ...(flags.has("goal") ? { verificationGoal: flags.get("goal") as string } : {})
  });

  emitProofBundle(bundle, flags, record.name);
}

/** Verify, write or print, and surface a non-zero exit on an invalid bundle. */
function emitProofBundle(bundle: Record<string, unknown>, flags: ParsedFlags, name: string): void {
  const report = verifyProofBundle(bundle);
  const json = `${JSON.stringify(bundle, null, 2)}\n`;
  const out = flags.get("out");
  if (out !== undefined) {
    writeFileSync(out, json, "utf8");
    console.log(`wrote proof bundle for "${name}" to ${out}`);
  } else {
    process.stdout.write(json);
  }
  console.log(
    `proof: ${report.valid ? "VALID" : "INVALID"} (${report.passedCheckCount} passed, ${report.failedCheckCount} failed)`
  );
  if (!report.valid) {
    for (const check of report.checks) {
      if (check.status === "failed") {
        console.log(`  x ${check.id}: ${check.message}`);
      }
    }
    exit(1);
  }
}

function runVerify(path: string | undefined): void {
  const bundle = JSON.parse(readFileSync(required(path, "proof path"), "utf8")) as Record<string, unknown>;
  const report = verifyProofBundle(bundle);

  console.log(
    `proof: ${report.valid ? "VALID" : "INVALID"} (${report.passedCheckCount} passed, ${report.failedCheckCount} failed)`
  );
  for (const check of report.checks) {
    if (check.status === "failed") {
      console.log(`  x ${check.id}: ${check.message}`);
    }
  }
  if (!report.valid) {
    exit(1);
  }
}

async function runLnInfo(baseUrl: string | undefined): Promise<void> {
  const payer = new LexeSidecarLightningPayer(baseUrl);
  try {
    console.log(JSON.stringify(await payer.nodeInfo(), null, 2));
  } catch {
    throw new Error(
      `could not reach a Lexe sidecar at ${payer.baseUrl} — is it running? (curl -fsSL https://lexe.app/install-sidecar.sh | sh)`
    );
  }
}

function keystorePath(): string {
  return env.ONT_WALLET_KEYSTORE ?? DEFAULT_KEYSTORE_PATH;
}

function walletStatePath(): string {
  return env.ONT_WALLET_STATE ?? DEFAULT_STATE_PATH;
}

function loadState(network: OntNetwork): WalletState {
  return WalletState.loadOrCreate(walletStatePath(), network);
}

function resolverUrl(explicit: string | undefined): string {
  return (explicit ?? env.ONT_RESOLVER_URL ?? DEFAULT_RESOLVER_URL).replace(/\/+$/, "");
}

function resolveNetwork(): OntNetwork {
  const raw = env.ONT_WALLET_NETWORK ?? "signet";
  if (!isOntNetwork(raw)) {
    throw new Error(`unknown ONT_WALLET_NETWORK: ${raw} (use main|testnet|signet|regtest)`);
  }
  return raw;
}

function requirePassword(): string {
  const password = env.ONT_WALLET_PASSWORD;
  if (password === undefined || password.trim() === "") {
    throw new Error("set ONT_WALLET_PASSWORD to encrypt/decrypt the keystore");
  }
  return password;
}

function required(value: string | undefined, label: string): string {
  if (value === undefined || value.trim() === "") {
    throw new Error(`missing required argument: ${label}`);
  }
  return value;
}

function parseByte(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 255) {
    throw new Error(`${label} must be an integer 0-255`);
  }
  return parsed;
}

/**
 * Funding inputs for a claim: the explicit `--input` descriptors if given,
 * otherwise auto-funded from the wallet's funding address via Esplora, with
 * any tracked locked bid bonds filtered out (spending one before its release
 * is a consensus-level slashing condition).
 */
async function resolveFundingInputs(
  flags: ParsedFlags,
  keystore: WalletKeystore
): Promise<readonly FundingInputDescriptor[]> {
  const explicit = flags.getAll("input");
  if (explicit.length > 0) {
    return explicit.map(parseFundingInputDescriptor);
  }

  const esploraBaseUrl = resolveBroadcastBaseUrl(
    keystore.network,
    flags.get("esplora-url") ?? flags.get("broadcast-url"),
    env.ONT_BROADCAST_URL
  );
  const utxos = await fetchAddressUtxos({
    esploraBaseUrl,
    address: keystore.fundingAddress,
    includeUnconfirmed: flags.has("include-unconfirmed")
  });
  const locked = loadState(keystore.network).lockedBondOutpoints();
  const spendable = utxos.filter((utxo) => !locked.has(`${utxo.txid}:${utxo.vout}`));
  const skipped = utxos.length - spendable.length;
  if (spendable.length === 0) {
    throw new Error(
      `no spendable UTXOs at funding address ${keystore.fundingAddress}${skipped > 0 ? ` (${skipped} locked bid bond(s) excluded; run \`sync\`)` : ""} — fund it first, or pass --input descriptors`
    );
  }
  console.log(
    `auto-funding from ${spendable.length} UTXO(s) at ${keystore.fundingAddress} ` +
      `(${sumUtxoValue(spendable)} base units) via ${esploraBaseUrl}` +
      (skipped > 0 ? ` — excluded ${skipped} locked bid bond(s)` : "")
  );
  return spendable;
}

/**
 * Broadcast the signed transaction when --broadcast is given; otherwise print
 * how to send it yourself. Returns true if it was broadcast.
 */
async function maybeBroadcast(input: {
  readonly flags: ParsedFlags;
  readonly network: OntNetwork;
  readonly signedTransactionHex: string;
  readonly expectedTxid: string;
}): Promise<boolean> {
  if (!input.flags.has("broadcast")) {
    console.log("");
    console.log("not broadcast. send it with your own node/explorer, e.g.:");
    console.log(`  curl -s -X POST --data '${input.signedTransactionHex}' <esplora-base>/tx`);
    console.log("or re-run with --broadcast [--broadcast-url <esplora-base>] to send it now.");
    return false;
  }

  const baseUrl = resolveBroadcastBaseUrl(input.network, input.flags.get("broadcast-url"), env.ONT_BROADCAST_URL);
  const client = new BroadcastClient(baseUrl);
  const txid = await client.broadcastTransaction(input.signedTransactionHex);
  console.log("");
  console.log(`broadcast via ${client.baseUrl}: ${txid}`);
  if (txid !== input.expectedTxid) {
    console.log(`warning: endpoint returned txid ${txid}, expected ${input.expectedTxid}`);
  }
  return true;
}

function parseBigIntArg(value: string, label: string): bigint {
  if (!/^[0-9]+$/.test(value)) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return BigInt(value);
}

interface ParsedFlags {
  get(key: string): string | undefined;
  getAll(key: string): readonly string[];
  has(key: string): boolean;
  readonly positionals: readonly string[];
}

/** Minimal `--key value` parser supporting repeated keys (e.g. --input) and bare flags. */
function parseFlags(args: readonly string[]): ParsedFlags {
  const values = new Map<string, string[]>();
  const positionals: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i] as string;
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = args[i + 1];
    if (next === undefined || next.startsWith("--")) {
      // bare flag (e.g. --broadcast)
      values.set(key, [...(values.get(key) ?? []), "true"]);
      continue;
    }
    values.set(key, [...(values.get(key) ?? []), next]);
    i += 1;
  }

  return {
    get: (key) => values.get(key)?.at(-1),
    getAll: (key) => values.get(key) ?? [],
    has: (key) => values.has(key),
    positionals
  };
}

function decodePayload(payloadHex: string): string {
  const text = Buffer.from(payloadHex, "hex").toString("utf8");
  const roundTrips = Buffer.from(text, "utf8").toString("hex") === payloadHex.toLowerCase();
  const printable = [...text].every((ch) => {
    const code = ch.codePointAt(0) ?? 0;
    return code >= 0x20 && code !== 0x7f;
  });
  return roundTrips && printable ? text : `0x${payloadHex}`;
}

function printUsage(): void {
  console.log("ONT wallet — reference client (work in progress)");
  console.log("");
  console.log("commands:");
  console.log("  init                                   create an encrypted keystore");
  console.log("  info                                   show network, owner pubkey, funding address");
  console.log("  address                                print the funding address");
  console.log("  balance [--esplora-url <u>]            show spendable funding UTXOs");
  console.log("  auctions [--name <n>] [--phase <p>] [--resolver <u>]  list live auctions");
  console.log("  lookup <name> [resolver]               show a name's state + destination");
  console.log("  set-destination <name> <type> <value>  publish an owner-signed destination");
  console.log("  names                                  list names this wallet tracks");
  console.log("  track <name> [resolver]                start tracking a name you own");
  console.log("  forget <name>                          stop tracking a name locally");
  console.log("  sync [name] [--resolver <url>]         reconcile names + bid bonds with the resolver");
  console.log("  bids                                   list tracked auction bids + bond status");
  console.log("  watch [--interval <s>] [--once] [--resolver <u>]  poll resolver, log state changes");
  console.log("  arm-recovery <name> <address> [resolver]  arm owner recovery to an address");
  console.log("  claim <name> --amount <n> --fee-sats <n> [--resolver <url>] [--bidder-id <id>]");
  console.log("    or  claim --bid-package <path> --fee-sats <n>");
  console.log("        [--input <utxo>] [--bond-address <a>] [--change-address <a>] [--bond-vout 0|1]");
  console.log("        build+sign an opening-bid claim (auto-funds when --input is omitted)");
  console.log("  claim <name> --rail cheap [--publisher <url>] [--ln-url <u>]");
  console.log("        cheap rail: pay a publisher over Lightning for a batched claim");
  console.log("  transfer <name> --to <pubkey> --fee-sats <n> [--resolver <url>]");
  console.log("        (auto-sources prev-state + bond from the resolver; or pass --prev-state-txid,");
  console.log("         --bond-input <utxo>, --successor-bond-sats <n> to go fully offline)");
  console.log("        (claim/transfer take [--broadcast] [--broadcast-url <esplora-base>] to send)");
  console.log("  export-proof <name> [--out <path>] [--resolver <url>]  build a portable ownership proof");
  console.log("  verify <proof.json>                    verify a portable ownership proof");
  console.log("  ln-info [baseUrl]                      query a Lexe sidecar (cheap-claim rail is WIP)");
  console.log("");
  console.log("env: ONT_WALLET_KEYSTORE (default ont-wallet.json), ONT_WALLET_STATE");
  console.log("     (default ont-wallet-state.json), ONT_WALLET_PASSWORD,");
  console.log("     ONT_WALLET_NETWORK (default signet), ONT_RESOLVER_URL, ONT_BROADCAST_URL");
}

main().catch((error: unknown) => {
  console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
  exit(1);
});
