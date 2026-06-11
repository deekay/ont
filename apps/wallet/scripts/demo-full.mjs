#!/usr/bin/env node
// Full ONT demo: walks both acquisition rails end-to-end.
//
// 1. Starts the publisher in the background (stub payment + anchor)
// 2. Inits a wallet on regtest
// 3. Cheap rail: claim a name via the publisher (LN payment over stub, real
//    inclusion proof verified locally against @ont/core's accumulator)
// 4. On-chain auction rail: build + sign an opening-bid PSBT from a synthetic
//    bid package and a synthetic funding UTXO
// 5. Show the wallet's tracked state (both names + the pending bid bond)
// 6. Tear down, cleanup
//
// Run with: npm run demo:full -w @ont/wallet

import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createAuctionBidPackage } from "@ont/protocol";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const walletCli = join(here, "..", "src", "index.ts");
const publisherCli = join(repoRoot, "apps", "publisher", "src", "index.ts");
const workdir = mkdtempSync(join(tmpdir(), "ont-demo-full-"));

const publisherPort = "7898";
const publisherUrl = `http://127.0.0.1:${publisherPort}`;
const env = {
  ...process.env,
  ONT_WALLET_KEYSTORE: join(workdir, "keystore.json"),
  ONT_WALLET_STATE: join(workdir, "state.json"),
  ONT_WALLET_PASSWORD: "demo-password",
  ONT_WALLET_NETWORK: "regtest",
  ONT_PUBLISHER_URL: publisherUrl
};

function bold(s) {
  return `\x1b[1m${s}\x1b[0m`;
}
function step(title) {
  console.log(`\n${bold(`=== ${title} ===`)}`);
}
function wallet(...args) {
  const out = execFileSync("npx", ["tsx", walletCli, ...args], { env, encoding: "utf8" });
  process.stdout.write(out);
  return out;
}

async function startPublisher() {
  const proc = spawn(
    "npx",
    ["tsx", publisherCli],
    {
      env: {
        ...process.env,
        ONT_PUBLISHER_PORT: publisherPort,
        ONT_PUBLISHER_NETWORK: "regtest"
      },
      // Detached so the publisher becomes a process-group leader: `npx tsx`
      // forks a node grandchild that a bare kill on the wrapper would orphan,
      // leaving a publisher bound to the port for the next run.
      detached: true,
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  // wait for /health to respond
  for (let i = 0; i < 30; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const res = await fetch(`${publisherUrl}/health`);
      if (res.ok) {
        return proc;
      }
    } catch {
      // not up yet
    }
  }
  killPublisher(proc);
  throw new Error("publisher did not start within 15s");
}

// Kill the publisher's whole process group (it was spawned detached), falling
// back to a plain kill if the group signal isn't available.
function killPublisher(proc) {
  if (!proc || proc.pid === undefined) return;
  try {
    process.kill(-proc.pid, "SIGTERM");
  } catch {
    try {
      proc.kill();
    } catch {
      // already gone
    }
  }
}

let publisher;
try {
  step("starting publisher (stub payment + anchor)");
  publisher = await startPublisher();
  console.log(`publisher up at ${publisherUrl}`);

  step("init — create an encrypted keystore (owner key + funding key)");
  wallet("init");

  step("info — what the wallet holds");
  wallet("info");

  // ---- Rail 1: cheap (publisher-backed) ----
  step("claim alice via the cheap rail (publisher + stub Lightning)");
  wallet("claim", "alice", "--rail", "cheap");

  step("names — alice is now a provisional cheap-rail claim (final once its notice window closes)");
  wallet("names");

  // ---- Rail 2: on-chain auction (synthetic funding) ----
  const keystore = JSON.parse(readFileSync(env.ONT_WALLET_KEYSTORE, "utf8"));

  step("build a canonical auction bid package committing this owner key");
  const bidPackage = createAuctionBidPackage({
    auctionId: "demo-auction",
    name: "satoshi",
    currentBlockHeight: 200,
    phase: "awaiting_opening_bid",
    unlockBlock: 100,
    openingMinimumBidSats: 10_000,
    currentRequiredMinimumBidSats: 10_000,
    settlementLockBlocks: 144,
    bidderId: "demo-bidder",
    ownerPubkey: keystore.ownerPubkey,
    bidAmountSats: 20_000
  });
  const bidPath = join(workdir, "bid.json");
  writeFileSync(bidPath, JSON.stringify(bidPackage, null, 2));
  console.log(`wrote ${bidPath} for name "${bidPackage.name}"`);

  step("claim satoshi via the on-chain auction rail (synthetic funding UTXO)");
  const fundingUtxo = `${"11".repeat(32)}:0:50000:${keystore.fundingAddress}`;
  wallet("claim", "--bid-package", bidPath, "--input", fundingUtxo, "--fee-sats", "500");

  step("names — both names tracked");
  wallet("names");

  step("bids — the auction bid bond is locked until sync confirms its release");
  wallet("bids");

  step("done");
  console.log(
    [
      "Both rails walked end-to-end.",
      "  - alice was claimed via the cheap rail (publisher-backed Lightning payment, accumulator inclusion proof).",
      "  - satoshi was claimed via the on-chain auction rail (signed PSBT, ready to broadcast).",
      "",
      "Next:",
      "  - the on-chain claim's signed tx is ready to broadcast (--broadcast).",
      "  - the cheap-rail claim is provisional: it finalizes only if its notice window closes",
      "    uncontested (a qualifying bond escalates it to the bonded auction; bare competing",
      "    claims with no bond nullify it — no owner, and the name reopens). Run `sync`",
      "    after the window to confirm.",
      "  - run `export-proof <name>` to produce a portable ownership proof anyone can verify."
    ].join("\n")
  );
} finally {
  if (publisher) {
    killPublisher(publisher);
  }
  rmSync(workdir, { recursive: true, force: true });
}
