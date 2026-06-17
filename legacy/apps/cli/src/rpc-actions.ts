import {
  assertBitcoinRpcChain,
  createBitcoinEsploraConfig,
  createBitcoinRpcConfig,
  getBitcoinEsploraAddressSummary,
  getBitcoinEsploraAddressUtxos,
  getBitcoinEsploraBlockHash,
  getBitcoinEsploraTipHeight,
  getBitcoinEsploraTransactionStatus,
  getBitcoinRpcBlockCount,
  getBitcoinRpcBlockchainInfo,
  getBitcoinRpcMempoolInfo,
  getBitcoinRpcRawTransactionInfo,
  sendBitcoinEsploraRawTransaction,
  sendBitcoinRpcRawTransaction,
  testBitcoinRpcMempoolAccept,
  type BitcoinEsploraConfig,
  type BitcoinRpcConfig
} from "@ont/bitcoin";
import { Transaction } from "bitcoinjs-lib";

import { parseSignedArtifactsEnvelope, type SignedArtifactsEnvelope } from "./signer.js";

const LEGACY_CONSERVATIVE_OP_RETURN_SCRIPT_BYTES = 83;

export interface RpcConnectionOptions {
  readonly url: string | undefined;
  readonly username: string | undefined;
  readonly password: string | undefined;
  readonly expectedChain: "main" | "signet" | "testnet" | "regtest";
}

export interface TransactionConfirmationInfo {
  readonly confirmations: number;
  readonly found: boolean;
}

export interface RemoteChainTarget {
  readonly kind: "rpc" | "esplora";
  readonly rpc: BitcoinRpcConfig | undefined;
  readonly esplora: BitcoinEsploraConfig | undefined;
}

export interface RpcCheckResult {
  readonly kind: "ont-rpc-check-result";
  readonly expectedChain: RpcConnectionOptions["expectedChain"];
  readonly rpcUrl: string;
  readonly chain: string;
  readonly blocks: number;
  readonly headers: number;
  readonly bestblockhash: string;
  readonly initialblockdownload: boolean | null;
  readonly blockCount: number;
}

export interface EsploraConnectionOptions {
  readonly baseUrl: string | undefined;
  readonly expectedChain: "main" | "signet" | "testnet" | "regtest";
}

export interface EsploraCheckResult {
  readonly kind: "ont-esplora-check-result";
  readonly expectedChain: EsploraConnectionOptions["expectedChain"];
  readonly baseUrl: string;
  readonly tipHeight: number;
  readonly tipHash: string;
}

export interface EsploraAddressCheckResult {
  readonly kind: "ont-esplora-address-check-result";
  readonly baseUrl: string;
  readonly address: string;
  readonly chainStats: {
    readonly fundedTxoCount: number;
    readonly fundedSats: number;
    readonly spentTxoCount: number;
    readonly spentSats: number;
    readonly txCount: number;
  };
  readonly mempoolStats: {
    readonly fundedTxoCount: number;
    readonly fundedSats: number;
    readonly spentTxoCount: number;
    readonly spentSats: number;
    readonly txCount: number;
  };
  readonly utxos: ReadonlyArray<{
    readonly txid: string;
    readonly vout: number;
    readonly value: number;
    readonly confirmed: boolean;
    readonly blockHeight: number | null;
  }>;
}

export function resolveRpcConfig(options: RpcConnectionOptions): BitcoinRpcConfig {
  const url = options.url ?? process.env.ONT_BITCOIN_RPC_URL;
  const username =
    options.username ?? process.env.ONT_BITCOIN_RPC_USERNAME;
  const password =
    options.password ?? process.env.ONT_BITCOIN_RPC_PASSWORD;

  if (!url) {
    throw new Error(
      "bitcoin rpc url is required via --rpc-url or ONT_BITCOIN_RPC_URL"
    );
  }

  return createBitcoinRpcConfig(url, username, password);
}

export function resolveEsploraConfig(options: EsploraConnectionOptions): BitcoinEsploraConfig {
  const baseUrl = options.baseUrl ?? process.env.ONT_ESPLORA_BASE_URL;

  if (!baseUrl) {
    throw new Error(
      "bitcoin esplora base url is required via --base-url or ONT_ESPLORA_BASE_URL"
    );
  }

  return createBitcoinEsploraConfig(baseUrl);
}

export function resolveRemoteChainTarget(options: {
  readonly rpcUrl: string | undefined;
  readonly rpcUsername: string | undefined;
  readonly rpcPassword: string | undefined;
  readonly esploraBaseUrl: string | undefined;
  readonly expectedChain: RpcConnectionOptions["expectedChain"];
}): RemoteChainTarget {
  if (options.rpcUrl ?? process.env.ONT_BITCOIN_RPC_URL) {
    return {
      kind: "rpc",
      rpc: resolveRpcConfig({
        url: options.rpcUrl,
        username: options.rpcUsername,
        password: options.rpcPassword,
        expectedChain: options.expectedChain
      }),
      esplora: undefined
    };
  }

  if (options.esploraBaseUrl ?? process.env.ONT_ESPLORA_BASE_URL) {
    return {
      kind: "esplora",
      rpc: undefined,
      esplora: resolveEsploraConfig({
        baseUrl: options.esploraBaseUrl,
        expectedChain: options.expectedChain
      })
    };
  }

  throw new Error(
    "either Bitcoin Core RPC (--rpc-url or ONT_BITCOIN_RPC_URL) or Esplora (--base-url or ONT_ESPLORA_BASE_URL) is required"
  );
}

export async function checkRpcConnection(options: {
  readonly rpc: BitcoinRpcConfig;
  readonly expectedChain: RpcConnectionOptions["expectedChain"];
}): Promise<RpcCheckResult> {
  const info = await assertBitcoinRpcChain(options.rpc, toBitcoinRpcChain(options.expectedChain));
  const blockCount = await getBitcoinRpcBlockCount(options.rpc);

  return {
    kind: "ont-rpc-check-result",
    expectedChain: options.expectedChain,
    rpcUrl: options.rpc.url,
    chain: info.chain,
    blocks: info.blocks,
    headers: info.headers,
    bestblockhash: info.bestblockhash,
    initialblockdownload: info.initialblockdownload ?? null,
    blockCount
  };
}

export async function checkEsploraConnection(options: {
  readonly esplora: BitcoinEsploraConfig;
  readonly expectedChain: EsploraConnectionOptions["expectedChain"];
}): Promise<EsploraCheckResult> {
  if (options.expectedChain !== "signet") {
    throw new Error("prototype esplora validation currently only supports signet");
  }

  const tipHeight = await getBitcoinEsploraTipHeight(options.esplora);
  const tipHash = await getBitcoinEsploraBlockHash(options.esplora, tipHeight);

  return {
    kind: "ont-esplora-check-result",
    expectedChain: options.expectedChain,
    baseUrl: options.esplora.baseUrl,
    tipHeight,
    tipHash
  };
}

export async function checkEsploraAddress(options: {
  readonly esplora: BitcoinEsploraConfig;
  readonly address: string;
}): Promise<EsploraAddressCheckResult> {
  const [summary, utxos] = await Promise.all([
    getBitcoinEsploraAddressSummary(options.esplora, options.address),
    getBitcoinEsploraAddressUtxos(options.esplora, options.address)
  ]);

  return {
    kind: "ont-esplora-address-check-result",
    baseUrl: options.esplora.baseUrl,
    address: summary.address,
    chainStats: summarizeAddressStats(summary.chain_stats),
    mempoolStats: summarizeAddressStats(summary.mempool_stats),
    utxos: utxos.map((utxo) => ({
      txid: utxo.txid,
      vout: utxo.vout,
      value: utxo.value,
      confirmed: utxo.status.confirmed,
      blockHeight: utxo.status.block_height ?? null
    }))
  };
}

export async function broadcastSignedArtifacts(options: {
  readonly rpc: BitcoinRpcConfig | undefined;
  readonly esplora: BitcoinEsploraConfig | undefined;
  readonly expectedChain: RpcConnectionOptions["expectedChain"];
  readonly signedArtifacts: SignedArtifactsEnvelope;
}): Promise<{ readonly broadcastedTxid: string }> {
  await maybeInspectTransferRelayCompatibility(options);

  const { broadcastedTxid } = await broadcastSignedTransactionHex({
    rpc: options.rpc,
    esplora: options.esplora,
    transactionHex: options.signedArtifacts.signedTransactionHex
  });

  return {
    broadcastedTxid
  };
}

export async function getTransactionConfirmationInfo(options: {
  readonly rpc: BitcoinRpcConfig | undefined;
  readonly esplora: BitcoinEsploraConfig | undefined;
  readonly txid: string;
}): Promise<TransactionConfirmationInfo> {
  if (options.rpc !== undefined) {
    const txInfo = await tryGetRawTransactionInfo(options.rpc, options.txid);

    return {
      confirmations: txInfo?.confirmations ?? 0,
      found: txInfo !== null
    };
  }

  if (options.esplora !== undefined) {
    const txInfo = await tryGetEsploraTransactionStatus(options.esplora, options.txid);

    if (txInfo === null) {
      return {
        confirmations: 0,
        found: false
      };
    }

    if (!txInfo.confirmed || txInfo.block_height === undefined) {
      return {
        confirmations: 0,
        found: true
      };
    }

    const tipHeight = await getBitcoinEsploraTipHeight(options.esplora);

    return {
      confirmations: Math.max(0, tipHeight - txInfo.block_height + 1),
      found: true
    };
  }

  throw new Error("either rpc or esplora config is required");
}

export async function broadcastSignedTransactionHex(options: {
  readonly rpc: BitcoinRpcConfig | undefined;
  readonly esplora: BitcoinEsploraConfig | undefined;
  readonly transactionHex: string;
}): Promise<{ readonly broadcastedTxid: string }> {
  let broadcastedTxid: string;

  if (options.rpc !== undefined) {
    broadcastedTxid = await sendBitcoinRpcRawTransaction(options.rpc, options.transactionHex);
  } else if (options.esplora !== undefined) {
    broadcastedTxid = await sendBitcoinEsploraRawTransaction(options.esplora, options.transactionHex);
  } else {
    throw new Error("either rpc or esplora config is required");
  }

  return {
    broadcastedTxid
  };
}

export function parseSignedArtifactsFile(input: unknown): SignedArtifactsEnvelope {
  return parseSignedArtifactsEnvelope(input);
}

async function tryGetRawTransactionInfo(
  rpc: BitcoinRpcConfig,
  txid: string
) {
  try {
    return await getBitcoinRpcRawTransactionInfo(rpc, txid);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("No such mempool transaction") || message.includes("Invalid or non-wallet transaction id")) {
      return null;
    }

    throw error;
  }
}

async function tryGetEsploraTransactionStatus(
  esplora: BitcoinEsploraConfig,
  txid: string
) {
  try {
    return await getBitcoinEsploraTransactionStatus(esplora, txid);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("HTTP 404")) {
      return null;
    }

    throw error;
  }
}

function toBitcoinRpcChain(chain: RpcConnectionOptions["expectedChain"]) {
  switch (chain) {
    case "main":
      return "main";
    case "signet":
      return "signet";
    case "testnet":
      return "test";
    case "regtest":
      return "regtest";
  }
}

function summarizeAddressStats(stats: {
  readonly funded_txo_count: number;
  readonly funded_txo_sum: number;
  readonly spent_txo_count: number;
  readonly spent_txo_sum: number;
  readonly tx_count: number;
}) {
  return {
    fundedTxoCount: stats.funded_txo_count,
    fundedSats: stats.funded_txo_sum,
    spentTxoCount: stats.spent_txo_count,
    spentSats: stats.spent_txo_sum,
    txCount: stats.tx_count
  };
}

async function maybeInspectTransferRelayCompatibility(options: {
  readonly rpc: BitcoinRpcConfig | undefined;
  readonly esplora: BitcoinEsploraConfig | undefined;
  readonly signedArtifacts: SignedArtifactsEnvelope;
}): Promise<void> {
  if (options.signedArtifacts.kind !== "ont-signed-transfer-artifacts") {
    return;
  }

  const transaction = Transaction.fromHex(options.signedArtifacts.signedTransactionHex);
  const largestOpReturnScriptBytes = getLargestOpReturnScriptBytes(transaction);

  if (largestOpReturnScriptBytes === 0) {
    return;
  }

  if (options.rpc !== undefined) {
    await maybeInspectTransferRelayCompatibilityWithRpc({
      rpc: options.rpc,
      transactionHex: options.signedArtifacts.signedTransactionHex,
      largestOpReturnScriptBytes
    });
    return;
  }

  if (
    options.esplora !== undefined &&
    largestOpReturnScriptBytes > LEGACY_CONSERVATIVE_OP_RETURN_SCRIPT_BYTES
  ) {
    console.warn(
      `warning: transfer OP_RETURN script is ${largestOpReturnScriptBytes} bytes. ` +
        "Esplora cannot report the upstream node relay policy before broadcast, so " +
        "older or stricter nodes may still reject this transfer."
    );
  }
}

async function maybeInspectTransferRelayCompatibilityWithRpc(options: {
  readonly rpc: BitcoinRpcConfig;
  readonly transactionHex: string;
  readonly largestOpReturnScriptBytes: number;
}): Promise<void> {
  let mempoolInfo: Awaited<ReturnType<typeof getBitcoinRpcMempoolInfo>> | null = null;

  try {
    mempoolInfo = await getBitcoinRpcMempoolInfo(options.rpc);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      "warning: unable to inspect Bitcoin Core mempool policy before broadcasting transfer: " +
        message
    );
  }

  if (
    mempoolInfo?.maxdatacarriersize !== undefined &&
    options.largestOpReturnScriptBytes > mempoolInfo.maxdatacarriersize
  ) {
    throw new Error(
      `transfer OP_RETURN script is ${options.largestOpReturnScriptBytes} bytes, ` +
        `but connected node reports maxdatacarriersize=${mempoolInfo.maxdatacarriersize}; ` +
        "broadcast is unlikely to relay from this node"
    );
  }

  let acceptance: Awaited<ReturnType<typeof testBitcoinRpcMempoolAccept>> | null = null;

  try {
    acceptance = await testBitcoinRpcMempoolAccept(options.rpc, options.transactionHex);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      "warning: unable to run Bitcoin Core testmempoolaccept before broadcasting transfer: " +
        message
    );
  }

  if (acceptance !== null && !acceptance.allowed) {
    const reasons = [
      acceptance.rejectReason,
      acceptance.packageError
    ].filter((value): value is string => value !== undefined);
    const suffix = reasons.length === 0 ? "" : `: ${reasons.join(" / ")}`;

    throw new Error(
      "connected node rejected the transfer during testmempoolaccept" +
        suffix +
        ". This transfer is unlikely to relay from this node."
    );
  }

  if (options.largestOpReturnScriptBytes > LEGACY_CONSERVATIVE_OP_RETURN_SCRIPT_BYTES) {
    console.warn(
      `warning: transfer OP_RETURN script is ${options.largestOpReturnScriptBytes} bytes. ` +
        "Modern Bitcoin Core defaults may relay it, but older or stricter nodes may not. " +
        "Direct-node broadcast or self-hosted relay remains the safest path."
    );
  }
}

function getLargestOpReturnScriptBytes(transaction: Transaction): number {
  let largest = 0;

  for (const output of transaction.outs) {
    const firstOpcode = output.script[0];

    if (firstOpcode !== 0x6a) {
      continue;
    }

    largest = Math.max(largest, output.script.length);
  }

  return largest;
}
