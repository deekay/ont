// ONT reference client (work in progress).
//
// Wires the wallet's building blocks into a CLI: an on-device encrypted keystore
// (owner + funding keys), and the Lexe sidecar Lightning adapter. The full claim
// flow (assembling the @ont/* packages for build → sign → broadcast → verify) is
// being added incrementally.

import { existsSync } from "node:fs";
import { argv, env, exit } from "node:process";

import { isOntNetwork, type OntNetwork } from "./keys.js";
import { WalletKeystore } from "./keystore.js";
import { LexeSidecarLightningPayer } from "./lightning.js";

const DEFAULT_KEYSTORE_PATH = "ont-wallet.json";

async function main(): Promise<void> {
  const [command, ...rest] = argv.slice(2);

  switch (command) {
    case "init":
      runInit(rest[0] ?? DEFAULT_KEYSTORE_PATH);
      return;
    case "info":
    case "status":
      runInfo(rest[0] ?? DEFAULT_KEYSTORE_PATH);
      return;
    case "address":
      runAddress(rest[0] ?? DEFAULT_KEYSTORE_PATH);
      return;
    case "ln-info":
      await runLnInfo(rest[0]);
      return;
    default:
      printUsage();
      return;
  }
}

function runInit(path: string): void {
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

function runInfo(path: string): void {
  const keystore = WalletKeystore.load(path, requirePassword());
  console.log(`keystore:        ${path}`);
  console.log(`network:         ${keystore.network}`);
  console.log(`owner pubkey:    ${keystore.ownerPubkey}`);
  console.log(`funding address: ${keystore.fundingAddress}`);
}

function runAddress(path: string): void {
  const keystore = WalletKeystore.load(path, requirePassword());
  console.log(keystore.fundingAddress);
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

function printUsage(): void {
  console.log("ONT wallet — reference client (work in progress)");
  console.log("");
  console.log("commands:");
  console.log("  init [path]        create an encrypted keystore (ONT_WALLET_PASSWORD, ONT_WALLET_NETWORK)");
  console.log("  info [path]        show network, owner pubkey, and funding address");
  console.log("  address [path]     print the funding address (to receive coins)");
  console.log("  ln-info [baseUrl]  query a Lexe sidecar (default http://localhost:5393)");
}

main().catch((error: unknown) => {
  console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
  exit(1);
});
