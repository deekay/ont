// ONT reference client (work in progress).
//
// A CLI that assembles the existing @ont/* packages into a wallet flow:
//  - an on-device encrypted keystore (owner + funding keys)
//  - resolver lookups and owner-signed destination (value) records
//  - portable proof verification
//  - a Lexe sidecar adapter for the (future) cheap-claim Lightning payment
// The on-chain claim flow is being added next.
//
// Keystore path comes from ONT_WALLET_KEYSTORE (default ont-wallet.json),
// password from ONT_WALLET_PASSWORD, network from ONT_WALLET_NETWORK,
// resolver from ONT_RESOLVER_URL (or a trailing arg).

import { existsSync, readFileSync } from "node:fs";
import { argv, env, exit } from "node:process";

import { verifyProofBundle } from "@ont/consensus";
import {
  computeRecoveryDescriptorHash,
  computeValueRecordHash,
  signRecoveryDescriptor,
  signValueRecord
} from "@ont/protocol";

import { isOntNetwork, type OntNetwork } from "./keys.js";
import { WalletKeystore } from "./keystore.js";
import { LexeSidecarLightningPayer } from "./lightning.js";
import { ResolverClient } from "./resolver.js";
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
    case "arm-recovery":
      await runArmRecovery(rest);
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

async function runLookup(args: readonly string[]): Promise<void> {
  const name = required(args[0], "name");
  const client = new ResolverClient(resolverUrl(args[1]));

  const record = await client.getNameRecord(name);
  if (record === null) {
    console.log(`${name}: not found on ${client.baseUrl} (claimable, or unknown to this resolver)`);
    return;
  }

  console.log(`name:        ${record.name}`);
  console.log(`status:      ${record.status}`);
  console.log(`owner:       ${record.currentOwnerPubkey}`);
  console.log(`state txid:  ${record.lastStateTxid}`);

  const value = await client.getValueRecord(name);
  if (value === null) {
    console.log("destination: (none published)");
    return;
  }
  console.log(`destination: type ${value.valueType} -> ${decodePayload(value.payloadHex)} (seq ${value.sequence})`);
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
  const names = loadState(keystore.network).list();
  if (names.length === 0) {
    console.log("no names tracked yet — claim one, then `track <name>`");
    return;
  }
  for (const entry of names) {
    const owned = entry.ownerPubkey === keystore.ownerPubkey ? "" : "  (owner pubkey differs from this keystore)";
    console.log(`${entry.name}${owned}`);
    console.log(`  ownership ref: ${entry.ownershipRef}`);
    if (entry.lastValueSequence !== undefined) {
      console.log(`  destination:   seq ${entry.lastValueSequence} (${entry.lastValueRecordHash ?? "?"})`);
    }
    if (entry.recovery !== undefined) {
      console.log(
        `  recovery:      armed seq ${entry.recovery.sequence} -> ${entry.recovery.recoveryAddress} ` +
          `(${entry.recovery.challengeWindowBlocks}-block window)`
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
  console.log("  lookup <name> [resolver]               show a name's state + destination");
  console.log("  set-destination <name> <type> <value>  publish an owner-signed destination");
  console.log("  names                                  list names this wallet tracks");
  console.log("  track <name> [resolver]                start tracking a name you own");
  console.log("  forget <name>                          stop tracking a name locally");
  console.log("  arm-recovery <name> <address> [resolver]  arm owner recovery to an address");
  console.log("  verify <proof.json>                    verify a portable ownership proof");
  console.log("  ln-info [baseUrl]                      query a Lexe sidecar");
  console.log("");
  console.log("env: ONT_WALLET_KEYSTORE (default ont-wallet.json), ONT_WALLET_STATE");
  console.log("     (default ont-wallet-state.json), ONT_WALLET_PASSWORD,");
  console.log("     ONT_WALLET_NETWORK (default signet), ONT_RESOLVER_URL");
}

main().catch((error: unknown) => {
  console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
  exit(1);
});
