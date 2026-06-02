import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const DATA_DIR = resolve(ROOT, ".data/private-signet-demo");
const OUT_DIR = resolve(DATA_DIR, "artifacts");
const OWNER_PATH = resolve(DATA_DIR, "owner.json");
const RECIPIENT_PATH = resolve(DATA_DIR, "recipient.json");
const PENDING_OWNER_PATH = resolve(DATA_DIR, "pending-owner.json");

const TSX_BIN = resolve(ROOT, "node_modules/.bin/tsx");
const CLI_ENTRY = "apps/cli/src/index.ts";

const SSH_TARGET =
  process.env.ONT_PRIVATE_SIGNET_SSH_TARGET
  ?? process.env.ONT_SSH_TARGET
  ?? "";
const SSH_KEY =
  process.env.ONT_PRIVATE_SIGNET_SSH_KEY
  ?? process.env.ONT_SSH_KEY
  ?? "";
const SSH_SOCKET =
  process.env.ONT_PRIVATE_SIGNET_SSH_SOCKET
  ?? "/tmp/ont-private-signet.sock";
const REMOTE_RPC_PORT = Number.parseInt(
  process.env.ONT_PRIVATE_SIGNET_REMOTE_RPC_PORT
    ?? "39332",
  10
);
const REMOTE_RESOLVER_PORT = Number.parseInt(
  process.env.ONT_PRIVATE_SIGNET_REMOTE_RESOLVER_PORT
    ?? "8788",
  10
);
const LOCAL_RPC_PORT = Number.parseInt(
  process.env.ONT_PRIVATE_SIGNET_LOCAL_RPC_PORT
    ?? "39342",
  10
);
const LOCAL_RESOLVER_PORT = Number.parseInt(
  process.env.ONT_PRIVATE_SIGNET_LOCAL_RESOLVER_PORT
    ?? "18788",
  10
);
const DEFAULT_RPC_USERNAME =
  process.env.ONT_PRIVATE_SIGNET_RPC_USERNAME
  ?? "ontrpcprivate";

export const TRANSFER_FEE_SATS = 1_000n;

let cachedRpcCredentials = null;

export async function withPrivateSignetSession(callback) {
  ensureSshConfig();
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(OUT_DIR, { recursive: true });

  const owner = await ensureAccount(OWNER_PATH);
  const recipient = await ensureAccount(RECIPIENT_PATH);
  const pendingOwner = await ensureAccount(PENDING_OWNER_PATH);
  const { rpcUsername, rpcPassword } = await getRemotePrivateRpcCredentials();

  await openTunnel();

  try {
    await waitForResolver();

    return await callback({
      owner,
      recipient,
      pendingOwner,
      rpcUsername,
      rpcPassword,
      dataDir: DATA_DIR,
      artifactsRoot: OUT_DIR,
      resolverUrl: resolverUrl(),
      rpcUrl: localRpcUrl()
    });
  } finally {
    await closeTunnel();
  }
}

export function createScenarioName(prefix) {
  return `${prefix}${Date.now().toString(36).slice(-6)}`;
}

export function scenarioArtifactsDir(name) {
  return join(OUT_DIR, name);
}

export function scenarioSummaryPath(name) {
  return resolve(DATA_DIR, `${name}-summary.json`);
}

export async function writeScenarioSummary(name, summary) {
  await writeFile(scenarioSummaryPath(name), JSON.stringify(summary, null, 2) + "\n", "utf8");
}

export async function publishScenarioSummary(name, remotePath) {
  const localPath = scenarioSummaryPath(name);
  const remoteDirectory = remotePath.replace(/\/[^/]+$/, "") || "/";

  await runCommand("ssh", [
    ...sshIdentityArgs(),
    "-S",
    SSH_SOCKET,
    "-o",
    "StrictHostKeyChecking=accept-new",
    SSH_TARGET,
    "mkdir",
    "-p",
    remoteDirectory
  ]);

  await runCommand("scp", [
    ...sshIdentityArgs(),
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-o",
    `ControlPath=${SSH_SOCKET}`,
    localPath,
    `${SSH_TARGET}:${remotePath}`
  ]);
}

export async function giftTransferName({
  nameRecord,
  currentOwnerAccount,
  newOwnerAccount,
  rpcUsername,
  rpcPassword,
  outDir
}) {
  await mkdir(outDir, { recursive: true });
  const username = rpcUsername ?? (await getRemotePrivateRpcUsername());
  const feeUtxo = await fundAddress(currentOwnerAccount.fundingAddress, 20_000n);
  const transferResult = await cliJson([
    "submit-transfer",
    "--prev-state-txid",
    nameRecord.lastStateTxid,
    "--new-owner-pubkey",
    newOwnerAccount.ownerPubkey,
    "--owner-private-key-hex",
    currentOwnerAccount.ownerPrivateKeyHex,
    "--bond-input",
    formatDescriptor({
      txid: nameRecord.currentBondTxid,
      vout: nameRecord.currentBondVout,
      valueSats: BigInt(nameRecord.currentBondValueSats),
      address: currentOwnerAccount.fundingAddress
    }),
    "--input",
    formatDescriptor(feeUtxo),
    "--successor-bond-vout",
    "0",
    "--successor-bond-sats",
    nameRecord.currentBondValueSats,
    "--fee-sats",
    TRANSFER_FEE_SATS.toString(),
    "--bond-address",
    newOwnerAccount.fundingAddress,
    "--change-address",
    currentOwnerAccount.fundingAddress,
    "--wif",
    currentOwnerAccount.fundingWif,
    "--network",
    "signet",
    "--expected-chain",
    "signet",
    "--rpc-url",
    localRpcUrl(),
    "--rpc-username",
    username,
    "--rpc-password",
    rpcPassword,
    "--out-dir",
    outDir
  ]);

  await mineBlocks(1);
  await waitForResolverHeight(await getBlockCount());

  return {
    transferResult,
    record: await cliJson(["get-name", nameRecord.name, "--resolver-url", resolverUrl()])
  };
}

export async function immatureSaleTransferName({
  nameRecord,
  sellerAccount,
  buyerAccount,
  rpcUsername,
  rpcPassword,
  outDir,
  salePriceSats = 20_000n
}) {
  await mkdir(outDir, { recursive: true });
  const username = rpcUsername ?? (await getRemotePrivateRpcUsername());
  const buyerFunding = await fundAddress(
    buyerAccount.fundingAddress,
    BigInt(nameRecord.currentBondValueSats) + salePriceSats + 20_000n
  );

  const transferResult = await cliJson([
    "submit-immature-sale-transfer",
    "--prev-state-txid",
    nameRecord.lastStateTxid,
    "--new-owner-pubkey",
    buyerAccount.ownerPubkey,
    "--owner-private-key-hex",
    sellerAccount.ownerPrivateKeyHex,
    "--bond-input",
    formatDescriptor({
      txid: nameRecord.currentBondTxid,
      vout: nameRecord.currentBondVout,
      valueSats: BigInt(nameRecord.currentBondValueSats),
      address: sellerAccount.fundingAddress
    }),
    "--buyer-input",
    formatDescriptor(buyerFunding),
    "--successor-bond-vout",
    "0",
    "--successor-bond-sats",
    nameRecord.currentBondValueSats,
    "--sale-price-sats",
    salePriceSats.toString(),
    "--seller-payout-address",
    sellerAccount.fundingAddress,
    "--buyer-change-address",
    buyerAccount.fundingAddress,
    "--fee-sats",
    TRANSFER_FEE_SATS.toString(),
    "--bond-address",
    buyerAccount.fundingAddress,
    "--wif",
    sellerAccount.fundingWif,
    "--wif",
    buyerAccount.fundingWif,
    "--network",
    "signet",
    "--expected-chain",
    "signet",
    "--rpc-url",
    localRpcUrl(),
    "--rpc-username",
    username,
    "--rpc-password",
    rpcPassword,
    "--out-dir",
    outDir
  ]);

  await mineBlocks(1);
  await waitForResolverHeight(await getBlockCount());

  return {
    transferResult,
    record: await cliJson(["get-name", nameRecord.name, "--resolver-url", resolverUrl()])
  };
}

export async function matureSaleTransferName({
  nameRecord,
  sellerAccount,
  buyerAccount,
  rpcUsername,
  rpcPassword,
  outDir,
  salePriceSats = 1_000n,
  sellerFundingSats = 20_000n,
  buyerFundingSats = 20_000n
}) {
  await mkdir(outDir, { recursive: true });
  const username = rpcUsername ?? (await getRemotePrivateRpcUsername());
  const sellerFunding = await fundAddress(
    sellerAccount.fundingAddress,
    sellerFundingSats
  );
  const buyerFunding = await fundAddress(
    buyerAccount.fundingAddress,
    buyerFundingSats
  );

  const transferResult = await cliJson([
    "submit-sale-transfer",
    "--prev-state-txid",
    nameRecord.lastStateTxid,
    "--new-owner-pubkey",
    buyerAccount.ownerPubkey,
    "--owner-private-key-hex",
    sellerAccount.ownerPrivateKeyHex,
    "--seller-input",
    formatDescriptor(sellerFunding),
    "--buyer-input",
    formatDescriptor(buyerFunding),
    "--seller-payment-sats",
    salePriceSats.toString(),
    "--seller-payment-address",
    sellerAccount.fundingAddress,
    "--fee-sats",
    TRANSFER_FEE_SATS.toString(),
    "--wif",
    sellerAccount.fundingWif,
    "--wif",
    buyerAccount.fundingWif,
    "--seller-change-address",
    sellerAccount.fundingAddress,
    "--buyer-change-address",
    buyerAccount.fundingAddress,
    "--network",
    "signet",
    "--expected-chain",
    "signet",
    "--rpc-url",
    localRpcUrl(),
    "--rpc-username",
    username,
    "--rpc-password",
    rpcPassword,
    "--out-dir",
    outDir
  ]);

  await mineBlocks(1);
  await waitForResolverHeight(await getBlockCount());

  return {
    transferResult,
    record: await cliJson(["get-name", nameRecord.name, "--resolver-url", resolverUrl()])
  };
}

export async function ensureAccount(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return cliJson(["generate-live-account", "--network", "signet", "--write", path]);
  }
}

export async function fundAddress(address, sats) {
  const amountBtc = satsToBtcString(sats);
  const fundingOutput = (await runRemote(
    `ont-private-signet-fund ${shellEscape(address)} ${shellEscape(amountBtc)}`
  )).trim();
  if (!fundingOutput) {
    throw new Error(`private signet funding did not return a txid for ${address}`);
  }

  await waitForResolverHeight(await getBlockCount());

  const descriptor = parseFundingDescriptor(fundingOutput);
  if (descriptor) {
    if (descriptor.address !== address) {
      throw new Error(`private signet funding returned output for ${descriptor.address}, expected ${address}`);
    }
    return descriptor;
  }

  const txid = fundingOutput.split(/\s+/g).at(-1);
  return await waitForAddressUtxo(txid, address);
}

export async function mineBlocks(blocks) {
  const count = Number.parseInt(String(blocks), 10);
  await runRemote(`ont-private-signet-mine ${count}`);
}

export async function waitForAddressUtxo(txid, address, attempts = 40) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const tx = await rpcCall("getrawtransaction", [txid, true]).catch(() => null);
    if (tx?.vout) {
      const match = tx.vout.find((output) => {
        return output.scriptPubKey?.address === address || output.scriptPubKey?.addresses?.includes(address);
      });
      if (match) {
        return {
          txid,
          vout: match.n,
          valueSats: btcDecimalToSats(match.value),
          address
        };
      }
    }
    await sleep(500);
  }

  throw new Error(`timed out waiting for funded output ${txid} -> ${address}`);
}

export async function getBlockCount() {
  return await rpcCall("getblockcount", []);
}

export async function waitForResolver() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const health = await fetchJson(`${resolverUrl()}/health`);
      if (health.ok === true) {
        return health;
      }
    } catch {
      // keep polling
    }
    await sleep(1_000);
  }

  throw new Error("private resolver did not become ready in time");
}

export async function waitForResolverHeight(targetHeight, attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const health = await fetchJson(`${resolverUrl()}/health`);
    if ((health.stats?.currentHeight ?? -1) >= targetHeight) {
      return health;
    }
    await sleep(1_000);
  }

  throw new Error(`resolver did not reach height ${targetHeight}`);
}

export async function rpcCall(method, params) {
  const { rpcUsername, rpcPassword } = await getRemotePrivateRpcCredentials();
  const response = await fetch(localRpcUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Basic ${Buffer.from(`${rpcUsername}:${rpcPassword}`).toString("base64")}`
    },
    body: JSON.stringify({
      jsonrpc: "1.0",
      id: method,
      method,
      params
    })
  });

  if (!response.ok) {
    throw new Error(`rpc ${method} failed with http ${response.status}`);
  }

  const payload = await response.json();
  if (payload.error) {
    throw new Error(`rpc ${method} failed: ${payload.error.message ?? JSON.stringify(payload.error)}`);
  }

  return payload.result;
}

export async function getRemotePrivateRpcPassword() {
  return (await getRemotePrivateRpcCredentials()).rpcPassword;
}

export async function getRemotePrivateRpcUsername() {
  return (await getRemotePrivateRpcCredentials()).rpcUsername;
}

export async function getRemotePrivateRpcCredentials() {
  if (cachedRpcCredentials) {
    return cachedRpcCredentials;
  }

  const envUsername = process.env.ONT_PRIVATE_SIGNET_RPC_USERNAME;
  const envPassword = process.env.ONT_PRIVATE_SIGNET_RPC_PASSWORD;
  if (envPassword) {
    cachedRpcCredentials = {
      rpcUsername: envUsername ?? DEFAULT_RPC_USERNAME,
      rpcPassword: envPassword
    };
    return cachedRpcCredentials;
  }

  const rawCredentials = (await runRemote(
    `node <<'NODE'
const { existsSync, readFileSync } = require("node:fs");
const files = ["/etc/gns/gns-private.env", "/etc/ont/ont-private.env"];
const env = {};

for (const file of files) {
  if (!existsSync(file)) {
    continue;
  }
  for (const line of readFileSync(file, "utf8").split(/\\r?\\n/g)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && env[match[1]] === undefined) {
      env[match[1]] = match[2];
    }
  }
}

const rpcUsername = env.GNS_BITCOIN_RPC_USERNAME || env.ONT_BITCOIN_RPC_USERNAME || ${JSON.stringify(DEFAULT_RPC_USERNAME)};
const rpcPassword = env.GNS_BITCOIN_RPC_PASSWORD || env.ONT_BITCOIN_RPC_PASSWORD || "";
if (!rpcPassword) {
  process.exit(2);
}
console.log(JSON.stringify({ rpcUsername, rpcPassword }));
NODE`
  )).trim();

  cachedRpcCredentials = JSON.parse(rawCredentials);
  if (!cachedRpcCredentials.rpcUsername || !cachedRpcCredentials.rpcPassword) {
    throw new Error("unable to read private signet RPC password from VPS");
  }

  return cachedRpcCredentials;
}

export async function openTunnel() {
  await closeTunnel().catch(() => {});
  await runCommand("ssh", [
    ...sshIdentityArgs(),
    "-o",
    "ExitOnForwardFailure=yes",
    "-M",
    "-S",
    SSH_SOCKET,
    "-fnNT",
    "-L",
    `${LOCAL_RPC_PORT}:127.0.0.1:${REMOTE_RPC_PORT}`,
    "-L",
    `${LOCAL_RESOLVER_PORT}:127.0.0.1:${REMOTE_RESOLVER_PORT}`,
    SSH_TARGET
  ]);
}

export async function closeTunnel() {
  await runCommand(
    "ssh",
    ["-S", SSH_SOCKET, "-O", "exit", SSH_TARGET],
    { allowFailure: true, timeoutMs: 3_000 }
  ).catch(() => {});

  for (const pid of await findTunnelListenerPids()) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Ignore already-exited listeners.
    }
  }
}

export async function runRemote(command) {
  const { stdout } = await runCommand("ssh", [...sshIdentityArgs(), SSH_TARGET, command]);
  return stdout;
}

export function ensureSshConfig() {
  if (!SSH_TARGET) {
    throw new Error("Set ONT_PRIVATE_SIGNET_SSH_TARGET or ONT_SSH_TARGET before running private-signet smoke checks.");
  }

  if (SSH_KEY && !existsSync(SSH_KEY)) {
    throw new Error(`SSH key not found: ${SSH_KEY}`);
  }
}

export function sshIdentityArgs() {
  return SSH_KEY ? ["-i", SSH_KEY, "-o", "IdentitiesOnly=yes"] : [];
}

export async function cliJson(args) {
  const { stdout } = await runCommand(TSX_BIN, [CLI_ENTRY, ...args], {
    cwd: ROOT
  });

  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`unable to parse CLI JSON for ${args[0]}: ${stdout}\n${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function fetchJson(url) {
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.message ?? `request failed: ${response.status}`);
    error.code = payload.error;
    throw error;
  }
  return payload;
}

export async function postValueRecord(record) {
  const response = await fetch(`${resolverUrl()}/values`, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8"
    },
    body: JSON.stringify(record)
  });
  const raw = await response.text();
  return {
    status: response.status,
    payload: raw.length === 0 ? null : JSON.parse(raw)
  };
}

export async function runCommand(command, args, options = {}) {
  const { cwd = ROOT, allowFailure = false, timeoutMs } = options;

  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env
    });

    let stdout = "";
    let stderr = "";
    let timeoutId = null;

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    if (typeof timeoutMs === "number" && timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        child.kill("SIGTERM");
      }, timeoutMs);
    }

    child.on("error", rejectPromise);
    child.on("close", (code, signal) => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }

      const timedOut = typeof timeoutMs === "number" && timeoutMs > 0 && signal === "SIGTERM";
      if (timedOut && !allowFailure) {
        rejectPromise(
          new Error(`${command} ${args.join(" ")} timed out after ${timeoutMs}ms\nstdout:\n${stdout}\nstderr:\n${stderr}`)
        );
        return;
      }

      if (code !== 0 && !allowFailure) {
        rejectPromise(
          new Error(`${command} ${args.join(" ")} exited with code ${code}\nstdout:\n${stdout}\nstderr:\n${stderr}`)
        );
        return;
      }

      resolvePromise({ code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

async function findTunnelListenerPids() {
  const pidLines = [];

  for (const port of [LOCAL_RPC_PORT, LOCAL_RESOLVER_PORT]) {
    const { stdout } = await runCommand(
      "lsof",
      ["-tiTCP:" + String(port), "-sTCP:LISTEN"],
      { allowFailure: true, timeoutMs: 2_000 }
    ).catch(() => ({ stdout: "" }));

    if (stdout.trim() !== "") {
      pidLines.push(...stdout.trim().split(/\s+/g));
    }
  }

  return [...new Set(pidLines)]
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value > 0);
}

export function satsToBtcString(sats) {
  const whole = sats / 100_000_000n;
  const fractional = sats % 100_000_000n;
  return `${whole}.${fractional.toString().padStart(8, "0")}`;
}

export function btcDecimalToSats(value) {
  const [whole, fractional = ""] = String(value).split(".");
  const padded = (fractional + "00000000").slice(0, 8);
  return BigInt(whole) * 100_000_000n + BigInt(padded);
}

export function formatDescriptor(utxo) {
  return `${utxo.txid}:${utxo.vout}:${utxo.valueSats}:${utxo.address}`;
}

export function parseFundingDescriptor(value) {
  const token = String(value).trim().split(/\s+/g).at(-1) ?? "";
  const [txid, voutRaw, valueSatsRaw, address] = token.split(":");
  if (!/^[0-9a-f]{64}$/i.test(txid ?? "")) {
    return null;
  }
  if (!/^\d+$/.test(voutRaw ?? "") || !/^\d+$/.test(valueSatsRaw ?? "") || !address) {
    return null;
  }

  return {
    txid,
    vout: Number.parseInt(voutRaw, 10),
    valueSats: BigInt(valueSatsRaw),
    address
  };
}

export function localRpcUrl() {
  return `http://127.0.0.1:${LOCAL_RPC_PORT}`;
}

export function resolverUrl() {
  return `http://127.0.0.1:${LOCAL_RESOLVER_PORT}`;
}

export function shellEscape(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

export function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
