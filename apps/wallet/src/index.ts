// ONT reference client (work in progress).
//
// Today this wires up the two genuinely-new pieces — an on-device encrypted
// owner keystore and the Lexe sidecar Lightning adapter. The full claim flow
// (which assembles the existing @ont/* packages for build → sign → broadcast →
// verify) is the next step.

import { existsSync } from "node:fs";
import { argv, env, exit } from "node:process";

import { WalletKeystore } from "./keystore.js";
import { LexeSidecarLightningPayer } from "./lightning.js";

const DEFAULT_KEYSTORE_PATH = "ont-wallet.json";

async function main(): Promise<void> {
  const [command, ...rest] = argv.slice(2);

  switch (command) {
    case "init":
      runInit(rest[0] ?? DEFAULT_KEYSTORE_PATH);
      return;
    case "status":
      runStatus(rest[0] ?? DEFAULT_KEYSTORE_PATH);
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
  const keystore = WalletKeystore.createNew();
  keystore.save(path, requirePassword());
  console.log(`created ONT wallet keystore at ${path}`);
  console.log(`owner pubkey: ${keystore.ownerPubkey}`);
}

function runStatus(path: string): void {
  const keystore = WalletKeystore.load(path, requirePassword());
  console.log(`keystore:     ${path}`);
  console.log(`owner pubkey: ${keystore.ownerPubkey}`);
}

async function runLnInfo(baseUrl: string | undefined): Promise<void> {
  const payer = new LexeSidecarLightningPayer(baseUrl);
  const info = await payer.nodeInfo();
  console.log(JSON.stringify(info, null, 2));
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
  console.log("  init [path]        create an encrypted keystore (password via ONT_WALLET_PASSWORD)");
  console.log("  status [path]      show the owner pubkey from a keystore");
  console.log("  ln-info [baseUrl]  query a Lexe sidecar (default http://localhost:5393)");
}

main().catch((error: unknown) => {
  console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
  exit(1);
});
