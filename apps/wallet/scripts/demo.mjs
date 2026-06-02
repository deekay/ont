#!/usr/bin/env node
// End-to-end demo of the ONT reference client's self-contained lifecycle.
//
// Walks the part of the lifecycle that needs no external services: create an
// encrypted keystore, build a canonical auction bid package committing the
// wallet's owner key, build + sign an on-chain opening-bid claim, and show the
// wallet's tracked state. Runs entirely on regtest with synthetic funding, so
// it's safe and repeatable.
//
// The resolver-backed commands (lookup, set-destination, arm-recovery) need a
// running resolver — see the note printed at the end.
//
// Run with: npm run demo -w @ont/wallet

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createAuctionBidPackage } from "@ont/protocol";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "..", "src", "index.ts");
const workdir = mkdtempSync(join(tmpdir(), "ont-wallet-demo-"));

const env = {
  ...process.env,
  ONT_WALLET_KEYSTORE: join(workdir, "keystore.json"),
  ONT_WALLET_STATE: join(workdir, "state.json"),
  ONT_WALLET_PASSWORD: "demo-password",
  ONT_WALLET_NETWORK: "regtest"
};

function step(title) {
  console.log(`\n\x1b[1m=== ${title} ===\x1b[0m`);
}

function wallet(...args) {
  const out = execFileSync("npx", ["tsx", cli, ...args], { env, encoding: "utf8" });
  process.stdout.write(out);
  return out;
}

try {
  step("init — create an encrypted keystore (owner key + funding key)");
  wallet("init");

  step("info — what the wallet holds");
  wallet("info");

  // Read the public material the keystore stores in the clear.
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
  console.log(`wrote ${bidPath} (name "${bidPackage.name}", bid ${bidPackage.bidAmountSats} base units)`);

  step("claim — build + sign an on-chain opening-bid from that package");
  // Synthetic funding UTXO at the wallet's funding address (50,000 base units).
  const fundingUtxo = `${"11".repeat(32)}:0:50000:${keystore.fundingAddress}`;
  wallet("claim", "--bid-package", bidPath, "--input", fundingUtxo, "--fee-sats", "500");

  step("names — the wallet now tracks a pending claim");
  wallet("names");

  step("done");
  console.log(
    "self-contained lifecycle complete. The signed transaction above is ready to broadcast.\n" +
      "Resolver-backed commands (lookup, set-destination, arm-recovery) need a running resolver:\n" +
      "  npm run dev:resolver   # then: npm run dev -w @ont/wallet -- lookup <name>"
  );
} finally {
  rmSync(workdir, { recursive: true, force: true });
}
