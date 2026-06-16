import { readFileSync } from "node:fs";

export {
  serializeLegacyTransaction,
  legacyTxidOf,
  type LegacyTransaction,
  type LegacyTransactionInput,
  type LegacyTransactionOutput,
} from "./legacy-tx.js";

export { bitsToTarget, headerMeetsTarget } from "./block-header.js";

export {
  validateHeaderChain,
  type BitcoinHeaderSource,
  type BitcoinDifficultyCheckpoint,
  type BitcoinNetworkParams,
  type ValidatedHeaderChain,
  type RejectedHeaderChain,
  type HeaderChainRejectReason,
  type HeaderChainResult,
} from "./validate-header-chain.js";

export interface BitcoinNetworkConfig {
  readonly network: "regtest" | "signet" | "testnet" | "mainnet";
  readonly rpcUrl?: string;
}

export interface BitcoinTransactionOutput {
  readonly valueSats: bigint;
  readonly scriptType: "op_return" | "payment" | "unknown";
  readonly dataHex?: string;
  /**
   * The parsed destination of a payment output (RPC `scriptPubKey.address`, Esplora
   * `scriptpubkey_address`), when the source exposes one. Consumed by the recovery-invoke
   * successor-bond binding (PR-34): the kernel requires the rotated bond output to pay the
   * descriptor's `recoveryAddress`, and a missing destination fails that check closed. B3 may
   * refine address→script derivation; B2 binds on this parsed destination.
   */
  readonly address?: string;
}

export interface BitcoinTransactionInput {
  readonly txid: string | null;
  readonly vout: number | null;
  readonly coinbase: boolean;
}

export interface BitcoinTransaction {
  readonly txid: string;
  readonly inputs: readonly BitcoinTransactionInput[];
  readonly outputs: readonly BitcoinTransactionOutput[];
}

export interface BitcoinBlock {
  readonly hash: string;
  readonly height: number;
  readonly transactions: readonly BitcoinTransaction[];
}

export interface BitcoinTransactionInBlock {
  readonly tx: BitcoinTransaction;
  readonly blockHeight: number;
  readonly txIndex: number;
}

export interface BitcoinRpcConfig {
  readonly url: string;
  readonly username?: string;
  readonly password?: string;
}

export interface BitcoinEsploraConfig {
  readonly baseUrl: string;
}

export type BitcoinRpcChain = "main" | "test" | "signet" | "regtest";

export interface BitcoinRpcBlockchainInfo {
  readonly chain: BitcoinRpcChain;
  readonly blocks: number;
  readonly headers: number;
  readonly bestblockhash: string;
  readonly initialblockdownload?: boolean;
}

export interface BitcoinRpcRawTransactionInfo {
  readonly txid: string;
  readonly confirmations?: number;
  readonly blockhash?: string;
  readonly in_active_chain?: boolean;
}

export interface BitcoinRpcUnspentTransactionOutput {
  readonly valueSats: bigint;
  readonly confirmations: number;
  readonly bestblock?: string;
  readonly address?: string;
}

export interface BitcoinRpcMempoolInfo {
  readonly loaded: boolean;
  readonly size: number;
  readonly bytes: number;
  readonly usage?: number;
  readonly maxmempool?: number;
  readonly mempoolminfee?: number;
  readonly minrelaytxfee?: number;
  readonly incrementalrelayfee?: number;
  readonly fullrbf?: boolean;
  readonly maxdatacarriersize?: number;
}

export interface BitcoinRpcTestMempoolAcceptResult {
  readonly txid?: string;
  readonly wtxid?: string;
  readonly allowed: boolean;
  readonly rejectReason?: string;
  readonly rejectCode?: number;
  readonly packageError?: string;
  readonly vsize?: number;
}

export interface BitcoinEsploraTransactionStatus {
  readonly confirmed: boolean;
  readonly block_height?: number;
  readonly block_hash?: string;
  readonly block_time?: number;
}

export interface BitcoinEsploraAddressStats {
  readonly funded_txo_count: number;
  readonly funded_txo_sum: number;
  readonly spent_txo_count: number;
  readonly spent_txo_sum: number;
  readonly tx_count: number;
}

export interface BitcoinEsploraAddressSummary {
  readonly address: string;
  readonly chain_stats: BitcoinEsploraAddressStats;
  readonly mempool_stats: BitcoinEsploraAddressStats;
}

export interface BitcoinEsploraUtxo {
  readonly txid: string;
  readonly vout: number;
  readonly value: number;
  readonly status: BitcoinEsploraTransactionStatus;
}

export interface BitcoinBlockFixtureFile {
  readonly blocks: readonly BitcoinBlockFixture[];
}

export interface BitcoinBlockFixture {
  readonly hash: string;
  readonly height: number;
  readonly transactions: readonly BitcoinTransactionFixture[];
}

export interface BitcoinTransactionFixture {
  readonly txid: string;
  readonly inputs?: readonly BitcoinTransactionInputFixture[];
  readonly outputs: readonly BitcoinTransactionOutputFixture[];
}

export interface BitcoinTransactionInputFixture {
  readonly txid?: string;
  readonly vout?: number;
  readonly coinbase?: boolean;
}

export interface BitcoinTransactionOutputFixture {
  readonly valueSats: string | number;
  readonly scriptType: BitcoinTransactionOutput["scriptType"];
  readonly dataHex?: string;
  readonly address?: string;
}

export interface BitcoinBlockSourceInput {
  readonly fixturePath?: string;
  readonly rpc?: BitcoinRpcConfig;
  readonly esplora?: BitcoinEsploraConfig;
  readonly launchHeight?: number;
  readonly endHeight?: number;
}

export interface LoadedBitcoinBlockSource {
  readonly source: "fixture" | "rpc" | "esplora";
  readonly descriptor: string;
  readonly launchHeight: number;
  readonly blocks: readonly BitcoinBlock[];
}

export interface BitcoinRpcSyncStatus {
  readonly nextHeight: number;
  readonly lastTipHeight: number | null;
}

export interface BitcoinChainCheckpoint {
  readonly height: number;
  readonly hash: string;
}

export function createBitcoinNetworkConfig(
  network: BitcoinNetworkConfig["network"],
  rpcUrl?: string
): BitcoinNetworkConfig {
  if (rpcUrl === undefined) {
    return { network };
  }

  return { network, rpcUrl };
}

export function createBitcoinRpcConfig(
  url: string,
  username?: string,
  password?: string
): BitcoinRpcConfig {
  if (url.length === 0) {
    throw new Error("rpc url must not be empty");
  }

  if (username === undefined && password !== undefined) {
    throw new Error("rpc password requires rpc username");
  }

  return {
    url,
    ...(username === undefined ? {} : { username }),
    ...(password === undefined ? {} : { password })
  };
}

export function createBitcoinEsploraConfig(baseUrl: string): BitcoinEsploraConfig {
  if (baseUrl.length === 0) {
    throw new Error("esplora baseUrl must not be empty");
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, "")
  };
}

export class BitcoinRpcBlockPoller {
  private readonly rpc: BitcoinRpcConfig;
  private nextHeight: number;
  private lastTipHeight: number | null;

  public constructor(input: { rpc: BitcoinRpcConfig; launchHeight: number }) {
    this.rpc = input.rpc;
    this.nextHeight = input.launchHeight;
    this.lastTipHeight = null;
  }

  public async bootstrap(endHeight?: number): Promise<BitcoinBlock[]> {
    return this.syncToTip(endHeight);
  }

  public async poll(endHeight?: number): Promise<BitcoinBlock[]> {
    return this.syncToTip(endHeight);
  }

  public getStatus(): BitcoinRpcSyncStatus {
    return {
      nextHeight: this.nextHeight,
      lastTipHeight: this.lastTipHeight
    };
  }

  private async syncToTip(endHeight?: number): Promise<BitcoinBlock[]> {
    const tipHeight =
      endHeight ?? (await callBitcoinRpc<number>(this.rpc, "getblockcount", []));

    this.lastTipHeight = tipHeight;

    if (tipHeight < this.nextHeight) {
      return [];
    }

    const blocks = await loadBitcoinBlocksFromRpc({
      rpc: this.rpc,
      startHeight: this.nextHeight,
      endHeight: tipHeight
    });

    this.nextHeight = tipHeight + 1;
    return blocks;
  }
}

export class BitcoinEsploraBlockPoller {
  private readonly esplora: BitcoinEsploraConfig;
  private nextHeight: number;
  private lastTipHeight: number | null;

  public constructor(input: { esplora: BitcoinEsploraConfig; launchHeight: number }) {
    this.esplora = input.esplora;
    this.nextHeight = input.launchHeight;
    this.lastTipHeight = null;
  }

  public async bootstrap(endHeight?: number): Promise<BitcoinBlock[]> {
    return this.syncToTip(endHeight);
  }

  public async poll(endHeight?: number): Promise<BitcoinBlock[]> {
    return this.syncToTip(endHeight);
  }

  public getStatus(): BitcoinRpcSyncStatus {
    return {
      nextHeight: this.nextHeight,
      lastTipHeight: this.lastTipHeight
    };
  }

  private async syncToTip(endHeight?: number): Promise<BitcoinBlock[]> {
    const tipHeight = endHeight ?? (await getBitcoinEsploraTipHeight(this.esplora));

    this.lastTipHeight = tipHeight;

    if (tipHeight < this.nextHeight) {
      return [];
    }

    const blocks = await loadBitcoinBlocksFromEsplora({
      esplora: this.esplora,
      startHeight: this.nextHeight,
      endHeight: tipHeight
    });

    this.nextHeight = tipHeight + 1;
    return blocks;
  }
}

export function loadBitcoinBlocksFixture(filePath: string): BitcoinBlock[] {
  const raw = readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  return parseBitcoinBlocksFixture(parsed);
}

export async function loadBitcoinBlocksFromSource(
  input: BitcoinBlockSourceInput
): Promise<LoadedBitcoinBlockSource> {
  if (input.rpc !== undefined && input.esplora !== undefined) {
    throw new Error("configure either rpc or esplora, not both");
  }

  if (input.rpc !== undefined) {
    if (input.launchHeight === undefined) {
      throw new Error("rpc block source requires launchHeight to avoid accidental full-chain scans");
    }

    const rpcLoadInput = {
      rpc: input.rpc,
      startHeight: input.launchHeight,
      ...(input.endHeight === undefined ? {} : { endHeight: input.endHeight })
    };
    const blocks = await loadBitcoinBlocksFromRpc(rpcLoadInput);

    return {
      source: "rpc",
      descriptor: input.rpc.url,
      launchHeight: input.launchHeight,
      blocks
    };
  }

  if (input.esplora !== undefined) {
    if (input.launchHeight === undefined) {
      throw new Error("esplora block source requires launchHeight to avoid accidental full-chain scans");
    }

    const blocks = await loadBitcoinBlocksFromEsplora({
      esplora: input.esplora,
      startHeight: input.launchHeight,
      ...(input.endHeight === undefined ? {} : { endHeight: input.endHeight })
    });

    return {
      source: "esplora",
      descriptor: input.esplora.baseUrl,
      launchHeight: input.launchHeight,
      blocks
    };
  }

  if (input.fixturePath === undefined) {
    throw new Error("fixturePath is required when rpc and esplora are not configured");
  }

  const blocks = loadBitcoinBlocksFixture(input.fixturePath);
  const launchHeight = input.launchHeight ?? blocks[0]?.height ?? 0;

  return {
    source: "fixture",
    descriptor: input.fixturePath,
    launchHeight,
    blocks
  };
}

export async function loadBitcoinBlocksFromEsplora(input: {
  readonly esplora: BitcoinEsploraConfig;
  readonly startHeight: number;
  readonly endHeight?: number;
}): Promise<BitcoinBlock[]> {
  const tipHeight = input.endHeight ?? (await getBitcoinEsploraTipHeight(input.esplora));

  if (tipHeight < input.startHeight) {
    return [];
  }

  const blocks: BitcoinBlock[] = [];

  for (let height = input.startHeight; height <= tipHeight; height += 1) {
    const blockHash = await getBitcoinEsploraBlockHash(input.esplora, height);
    const [blockSummary, txids] = await Promise.all([
      fetchBitcoinEsploraJson<unknown>(input.esplora, `/block/${blockHash}`),
      fetchBitcoinEsploraJson<unknown>(input.esplora, `/block/${blockHash}/txids`)
    ]);

    const parsedSummary = parseBitcoinEsploraBlockSummary(blockSummary);
    const parsedTxids = parseBitcoinEsploraTransactionIds(txids);
    const transactions: BitcoinTransaction[] = [];

    for (const txid of parsedTxids) {
      const transaction = parseBitcoinEsploraTransaction(
        await fetchBitcoinEsploraJson<unknown>(input.esplora, `/tx/${txid}`)
      );
      transactions.push(transaction);
    }

    blocks.push({
      hash: parsedSummary.hash,
      height: parsedSummary.height,
      transactions
    });
  }

  return blocks;
}

export async function loadBitcoinBlocksFromRpc(input: {
  readonly rpc: BitcoinRpcConfig;
  readonly startHeight: number;
  readonly endHeight?: number;
}): Promise<BitcoinBlock[]> {
  const tipHeight =
    input.endHeight ?? (await callBitcoinRpc<number>(input.rpc, "getblockcount", []));

  if (tipHeight < input.startHeight) {
    return [];
  }

  const blocks: BitcoinBlock[] = [];

  for (let height = input.startHeight; height <= tipHeight; height += 1) {
    const blockHash = await callBitcoinRpc<string>(input.rpc, "getblockhash", [height]);
    const rpcBlock = await callBitcoinRpc<unknown>(input.rpc, "getblock", [blockHash, 2]);
    blocks.push(parseBitcoinRpcBlock(rpcBlock));
  }

  return blocks;
}

export function parseBitcoinBlocksFixture(input: unknown): BitcoinBlock[] {
  if (!isRecord(input)) {
    throw new Error("fixture root must be an object");
  }

  const { blocks } = input;
  if (!Array.isArray(blocks)) {
    throw new Error("fixture root must contain a blocks array");
  }

  return blocks.map(parseBitcoinBlockFixture);
}

export function parseBitcoinRpcBlock(input: unknown): BitcoinBlock {
  if (!isRecord(input)) {
    throw new Error("rpc block must be an object");
  }

  const hash = getRequiredString(input, "hash");
  const height = getRequiredInteger(input, "height");
  const tx = getRequiredArray(input, "tx");

  return {
    hash,
    height,
    transactions: tx.map(parseBitcoinRpcTransaction)
  };
}

export function getOpReturnPayloads(
  transaction: BitcoinTransaction
): ReadonlyArray<{ readonly vout: number; readonly payload: Uint8Array }> {
  return transaction.outputs.flatMap((output, vout) => {
    if (output.scriptType !== "op_return" || output.dataHex === undefined) {
      return [];
    }

    try {
      return [
        {
          vout,
          payload: hexToBytes(output.dataHex)
        }
      ];
    } catch {
      return [];
    }
  });
}

export async function getBitcoinRpcBlockCount(rpc: BitcoinRpcConfig): Promise<number> {
  return callBitcoinRpc<number>(rpc, "getblockcount", []);
}

export async function getBitcoinEsploraTipHeight(esplora: BitcoinEsploraConfig): Promise<number> {
  const raw = await fetchBitcoinEsploraText(esplora, "/blocks/tip/height");
  const parsed = Number.parseInt(raw, 10);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`esplora tip height at ${esplora.baseUrl} was not a non-negative integer`);
  }

  return parsed;
}

export async function getBitcoinEsploraBlockHash(
  esplora: BitcoinEsploraConfig,
  height: number
): Promise<string> {
  const raw = await fetchBitcoinEsploraText(esplora, `/block-height/${height}`);

  if (raw.length === 0) {
    throw new Error(`esplora block-height lookup for ${height} at ${esplora.baseUrl} returned an empty hash`);
  }

  return raw;
}

export async function getBitcoinEsploraTransactionStatus(
  esplora: BitcoinEsploraConfig,
  txid: string
): Promise<BitcoinEsploraTransactionStatus> {
  const result = await fetchBitcoinEsploraJson<unknown>(esplora, `/tx/${txid}/status`);
  return parseBitcoinEsploraTransactionStatus(result);
}

export async function getBitcoinEsploraAddressSummary(
  esplora: BitcoinEsploraConfig,
  address: string
): Promise<BitcoinEsploraAddressSummary> {
  const result = await fetchBitcoinEsploraJson<unknown>(esplora, `/address/${address}`);
  return parseBitcoinEsploraAddressSummary(result);
}

export async function getBitcoinEsploraAddressUtxos(
  esplora: BitcoinEsploraConfig,
  address: string
): Promise<readonly BitcoinEsploraUtxo[]> {
  const result = await fetchBitcoinEsploraJson<unknown>(esplora, `/address/${address}/utxo`);
  return parseBitcoinEsploraAddressUtxos(result);
}

export async function getBitcoinRpcBlockchainInfo(
  rpc: BitcoinRpcConfig
): Promise<BitcoinRpcBlockchainInfo> {
  const result = await callBitcoinRpc<unknown>(rpc, "getblockchaininfo", []);
  return parseBitcoinRpcBlockchainInfo(result);
}

export async function getBitcoinRpcBlockHash(
  rpc: BitcoinRpcConfig,
  height: number
): Promise<string> {
  return callBitcoinRpc<string>(rpc, "getblockhash", [height]);
}

export async function getBitcoinRpcRawTransactionInfo(
  rpc: BitcoinRpcConfig,
  txid: string
): Promise<BitcoinRpcRawTransactionInfo> {
  const result = await callBitcoinRpc<unknown>(rpc, "getrawtransaction", [txid, true]);
  return parseBitcoinRpcRawTransactionInfo(result);
}

export async function getBitcoinRpcUnspentTransactionOutput(
  rpc: BitcoinRpcConfig,
  txid: string,
  vout: number,
  includeMempool = true
): Promise<BitcoinRpcUnspentTransactionOutput | null> {
  const result = await callBitcoinRpc<unknown>(rpc, "gettxout", [txid, vout, includeMempool]);
  if (result === null) {
    return null;
  }

  return parseBitcoinRpcUnspentTransactionOutput(result);
}

export async function getBitcoinRpcMempoolInfo(
  rpc: BitcoinRpcConfig
): Promise<BitcoinRpcMempoolInfo> {
  const result = await callBitcoinRpc<unknown>(rpc, "getmempoolinfo", []);
  return parseBitcoinRpcMempoolInfo(result);
}

export async function testBitcoinRpcMempoolAccept(
  rpc: BitcoinRpcConfig,
  transactionHex: string
): Promise<BitcoinRpcTestMempoolAcceptResult> {
  const result = await callBitcoinRpc<unknown>(rpc, "testmempoolaccept", [[transactionHex]]);
  return parseBitcoinRpcTestMempoolAcceptResult(result);
}

export async function sendBitcoinRpcRawTransaction(
  rpc: BitcoinRpcConfig,
  transactionHex: string
): Promise<string> {
  return callBitcoinRpc<string>(rpc, "sendrawtransaction", [transactionHex]);
}

export async function sendBitcoinEsploraRawTransaction(
  esplora: BitcoinEsploraConfig,
  transactionHex: string
): Promise<string> {
  return (await postBitcoinEsploraText(esplora, "/tx", transactionHex)).trim();
}

export async function isBitcoinRpcHeadCurrent(
  rpc: BitcoinRpcConfig,
  height: number | null,
  expectedHash: string | null
): Promise<boolean> {
  if (height === null || expectedHash === null) {
    return false;
  }

  try {
    const actualHash = await getBitcoinRpcBlockHash(rpc, height);
    return actualHash === expectedHash;
  } catch {
    return false;
  }
}

export async function isBitcoinEsploraHeadCurrent(
  esplora: BitcoinEsploraConfig,
  height: number | null,
  expectedHash: string | null
): Promise<boolean> {
  if (height === null || expectedHash === null) {
    return false;
  }

  try {
    const actualHash = await getBitcoinEsploraBlockHash(esplora, height);
    return actualHash === expectedHash;
  } catch {
    return false;
  }
}

export async function findBitcoinRpcMatchingCheckpoint(
  rpc: BitcoinRpcConfig,
  checkpoints: readonly BitcoinChainCheckpoint[]
): Promise<BitcoinChainCheckpoint | null> {
  const ordered = [...checkpoints].sort((left, right) => right.height - left.height);

  for (const checkpoint of ordered) {
    try {
      const actualHash = await getBitcoinRpcBlockHash(rpc, checkpoint.height);
      if (actualHash === checkpoint.hash) {
        return checkpoint;
      }
    } catch {
      continue;
    }
  }

  return null;
}

export async function findBitcoinEsploraMatchingCheckpoint(
  esplora: BitcoinEsploraConfig,
  checkpoints: readonly BitcoinChainCheckpoint[]
): Promise<BitcoinChainCheckpoint | null> {
  const ordered = [...checkpoints].sort((left, right) => right.height - left.height);

  for (const checkpoint of ordered) {
    try {
      const actualHash = await getBitcoinEsploraBlockHash(esplora, checkpoint.height);
      if (actualHash === checkpoint.hash) {
        return checkpoint;
      }
    } catch {
      continue;
    }
  }

  return null;
}

export async function assertBitcoinRpcChain(
  rpc: BitcoinRpcConfig,
  expectedChain: BitcoinRpcChain
): Promise<BitcoinRpcBlockchainInfo> {
  const info = await getBitcoinRpcBlockchainInfo(rpc);

  if (info.chain !== expectedChain) {
    throw new Error(`bitcoin rpc chain mismatch: expected ${expectedChain}, got ${info.chain}`);
  }

  return info;
}

async function callBitcoinRpc<T>(
  rpc: BitcoinRpcConfig,
  method: string,
  params: readonly unknown[]
): Promise<T> {
  const headers = new Headers({
    "content-type": "application/json"
  });

  if (rpc.username !== undefined) {
    const secret = `${rpc.username}:${rpc.password ?? ""}`;
    headers.set("authorization", `Basic ${Buffer.from(secret).toString("base64")}`);
  }

  let response: Response;

  try {
    response = await fetch(rpc.url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "1.0",
        id: "ont",
        method,
        params
      })
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`bitcoin rpc ${method} request to ${rpc.url} failed: ${message}`);
  }

  if (!response.ok) {
    throw new Error(`bitcoin rpc ${method} at ${rpc.url} failed with HTTP ${response.status}`);
  }

  const body = (await response.json()) as unknown;

  if (!isRecord(body)) {
    throw new Error(`bitcoin rpc ${method} returned a non-object response`);
  }

  if (body.error !== null && body.error !== undefined) {
    throw new Error(`bitcoin rpc ${method} returned an error: ${JSON.stringify(body.error)}`);
  }

  return body.result as T;
}

async function fetchBitcoinEsploraText(
  esplora: BitcoinEsploraConfig,
  path: string
): Promise<string> {
  const url = `${esplora.baseUrl}${path}`;
  return (await fetchBitcoinEsploraResponse(url)).text().then((value) => value.trim());
}

async function postBitcoinEsploraText(
  esplora: BitcoinEsploraConfig,
  path: string,
  body: string
): Promise<string> {
  const url = `${esplora.baseUrl}${path}`;
  return (
    await fetchBitcoinEsploraResponse(url, {
      method: "POST",
      headers: {
        "content-type": "text/plain"
      },
      body
    })
  )
    .text()
    .then((value) => value.trim());
}

async function fetchBitcoinEsploraJson<T>(
  esplora: BitcoinEsploraConfig,
  path: string
): Promise<T> {
  const url = `${esplora.baseUrl}${path}`;
  return (await fetchBitcoinEsploraResponse(url)).json() as Promise<T>;
}

async function fetchBitcoinEsploraResponse(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const maxAttempts = 10;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response;

    try {
      response = await fetch(url, init);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = new Error(`bitcoin esplora request to ${url} failed: ${message}`);

      if (attempt < maxAttempts) {
        await delay(Math.min(5000, 250 * 2 ** (attempt - 1)));
        continue;
      }

      throw lastError;
    }

    if (response.status === 429 && attempt < maxAttempts) {
      await delay(Math.min(10000, 500 * 2 ** (attempt - 1)));
      continue;
    }

    if (!response.ok) {
      throw new Error(`bitcoin esplora request to ${url} failed with HTTP ${response.status}`);
    }

    return response;
  }

  throw lastError ?? new Error(`bitcoin esplora request to ${url} failed`);
}

function parseBitcoinBlockFixture(input: unknown): BitcoinBlock {
  if (!isRecord(input)) {
    throw new Error("block fixture must be an object");
  }

  const { hash, height, transactions } = input;

  if (typeof hash !== "string" || hash.length === 0) {
    throw new Error("block fixture hash must be a non-empty string");
  }

  if (typeof height !== "number" || !Number.isInteger(height) || height < 0) {
    throw new Error("block fixture height must be a non-negative integer");
  }

  if (!Array.isArray(transactions)) {
    throw new Error("block fixture transactions must be an array");
  }

  return {
    hash,
    height,
    transactions: transactions.map(parseBitcoinTransactionFixture)
  };
}

function parseBitcoinTransactionFixture(input: unknown): BitcoinTransaction {
  if (!isRecord(input)) {
    throw new Error("transaction fixture must be an object");
  }

  const { txid, outputs } = input;
  const inputs = Array.isArray(input.inputs) ? input.inputs : [];

  if (typeof txid !== "string" || txid.length === 0) {
    throw new Error("transaction fixture txid must be a non-empty string");
  }

  if (!Array.isArray(outputs)) {
    throw new Error("transaction fixture outputs must be an array");
  }

  return {
    txid,
    inputs: inputs.map(parseBitcoinTransactionInputFixture),
    outputs: outputs.map(parseBitcoinTransactionOutputFixture)
  };
}

function parseBitcoinRpcTransaction(input: unknown): BitcoinTransaction {
  if (!isRecord(input)) {
    throw new Error("rpc transaction must be an object");
  }

  const txid = getRequiredString(input, "txid");
  const vin = getRequiredArray(input, "vin");
  const vout = getRequiredArray(input, "vout");

  return {
    txid,
    inputs: vin.map(parseBitcoinRpcTransactionInput),
    outputs: vout.map(parseBitcoinRpcTransactionOutput)
  };
}

function parseBitcoinEsploraBlockSummary(input: unknown): {
  readonly hash: string;
  readonly height: number;
} {
  if (!isRecord(input)) {
    throw new Error("esplora block summary must be an object");
  }

  return {
    hash: getRequiredString(input, "id"),
    height: getRequiredInteger(input, "height")
  };
}

function parseBitcoinEsploraTransactionIds(input: unknown): string[] {
  if (!Array.isArray(input)) {
    throw new Error("esplora transaction id list must be an array");
  }

  return input.map((value, index) => {
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`esplora transaction id at index ${index} must be a non-empty string`);
    }

    return value;
  });
}

function parseBitcoinEsploraTransaction(input: unknown): BitcoinTransaction {
  if (!isRecord(input)) {
    throw new Error("esplora transaction must be an object");
  }

  const txid = getRequiredString(input, "txid");
  const vin = getRequiredArray(input, "vin");
  const vout = getRequiredArray(input, "vout");

  return {
    txid,
    inputs: vin.map(parseBitcoinEsploraTransactionInput),
    outputs: vout.map(parseBitcoinEsploraTransactionOutput)
  };
}

function parseBitcoinEsploraTransactionStatus(input: unknown): BitcoinEsploraTransactionStatus {
  if (!isRecord(input)) {
    throw new Error("esplora transaction status must be an object");
  }

  const confirmed = getRequiredBoolean(input, "confirmed");
  const blockHeight = getOptionalInteger(input, "block_height");
  const blockHash = getOptionalString(input, "block_hash");
  const blockTime = getOptionalInteger(input, "block_time");

  return {
    confirmed,
    ...(blockHeight === undefined ? {} : { block_height: blockHeight }),
    ...(blockHash === undefined ? {} : { block_hash: blockHash }),
    ...(blockTime === undefined ? {} : { block_time: blockTime })
  };
}

function parseBitcoinEsploraAddressSummary(input: unknown): BitcoinEsploraAddressSummary {
  if (!isRecord(input)) {
    throw new Error("esplora address summary must be an object");
  }

  return {
    address: getRequiredString(input, "address"),
    chain_stats: parseBitcoinEsploraAddressStats(getRequiredRecord(input, "chain_stats")),
    mempool_stats: parseBitcoinEsploraAddressStats(getRequiredRecord(input, "mempool_stats"))
  };
}

function parseBitcoinEsploraAddressStats(input: Record<string, unknown>): BitcoinEsploraAddressStats {
  return {
    funded_txo_count: getRequiredInteger(input, "funded_txo_count"),
    funded_txo_sum: getRequiredInteger(input, "funded_txo_sum"),
    spent_txo_count: getRequiredInteger(input, "spent_txo_count"),
    spent_txo_sum: getRequiredInteger(input, "spent_txo_sum"),
    tx_count: getRequiredInteger(input, "tx_count")
  };
}

function parseBitcoinEsploraAddressUtxos(input: unknown): readonly BitcoinEsploraUtxo[] {
  if (!Array.isArray(input)) {
    throw new Error("esplora address utxos must be an array");
  }

  return input.map((entry) => {
    if (!isRecord(entry)) {
      throw new Error("esplora address utxo must be an object");
    }

    return {
      txid: getRequiredString(entry, "txid"),
      vout: getRequiredInteger(entry, "vout"),
      value: getRequiredInteger(entry, "value"),
      status: parseBitcoinEsploraTransactionStatus(getRequiredRecord(entry, "status"))
    };
  });
}

function parseBitcoinRpcBlockchainInfo(input: unknown): BitcoinRpcBlockchainInfo {
  if (!isRecord(input)) {
    throw new Error("rpc blockchain info must be an object");
  }

  const chain = getRequiredChain(input, "chain");
  const blocks = getRequiredInteger(input, "blocks");
  const headers = getRequiredInteger(input, "headers");
  const bestblockhash = getRequiredString(input, "bestblockhash");
  const initialblockdownload = getOptionalBoolean(input, "initialblockdownload");

  return {
    chain,
    blocks,
    headers,
    bestblockhash,
    ...(initialblockdownload === undefined ? {} : { initialblockdownload })
  };
}

function parseBitcoinRpcRawTransactionInfo(input: unknown): BitcoinRpcRawTransactionInfo {
  if (!isRecord(input)) {
    throw new Error("rpc raw transaction info must be an object");
  }

  const txid = getRequiredString(input, "txid");
  const confirmations = getOptionalInteger(input, "confirmations");
  const blockhash = getOptionalString(input, "blockhash");
  const in_active_chain = getOptionalBoolean(input, "in_active_chain");

  return {
    txid,
    ...(confirmations === undefined ? {} : { confirmations }),
    ...(blockhash === undefined ? {} : { blockhash }),
    ...(in_active_chain === undefined ? {} : { in_active_chain })
  };
}

function parseBitcoinRpcUnspentTransactionOutput(input: unknown): BitcoinRpcUnspentTransactionOutput {
  if (!isRecord(input)) {
    throw new Error("rpc gettxout result must be an object");
  }

  const value = getRequiredNumber(input, "value");
  const confirmations = getRequiredInteger(input, "confirmations");
  const bestblock = getOptionalString(input, "bestblock");
  const scriptPubKey = getRequiredRecord(input, "scriptPubKey");
  const address = getOptionalString(scriptPubKey, "address");

  return {
    valueSats: btcToSats(value),
    confirmations,
    ...(bestblock === undefined ? {} : { bestblock }),
    ...(address === undefined ? {} : { address })
  };
}

function parseBitcoinRpcMempoolInfo(input: unknown): BitcoinRpcMempoolInfo {
  if (!isRecord(input)) {
    throw new Error("rpc mempool info must be an object");
  }

  const loaded = getOptionalBoolean(input, "loaded") ?? true;
  const size = getRequiredInteger(input, "size");
  const bytes = getRequiredInteger(input, "bytes");
  const usage = getOptionalInteger(input, "usage");
  const maxmempool = getOptionalInteger(input, "maxmempool");
  const mempoolminfee = getOptionalNumber(input, "mempoolminfee");
  const minrelaytxfee = getOptionalNumber(input, "minrelaytxfee");
  const incrementalrelayfee = getOptionalNumber(input, "incrementalrelayfee");
  const fullrbf = getOptionalBoolean(input, "fullrbf");
  const maxdatacarriersize = getOptionalInteger(input, "maxdatacarriersize");

  return {
    loaded,
    size,
    bytes,
    ...(usage === undefined ? {} : { usage }),
    ...(maxmempool === undefined ? {} : { maxmempool }),
    ...(mempoolminfee === undefined ? {} : { mempoolminfee }),
    ...(minrelaytxfee === undefined ? {} : { minrelaytxfee }),
    ...(incrementalrelayfee === undefined ? {} : { incrementalrelayfee }),
    ...(fullrbf === undefined ? {} : { fullrbf }),
    ...(maxdatacarriersize === undefined ? {} : { maxdatacarriersize })
  };
}

function parseBitcoinRpcTestMempoolAcceptResult(
  input: unknown
): BitcoinRpcTestMempoolAcceptResult {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("rpc testmempoolaccept result must be a non-empty array");
  }

  const first = input[0];

  if (!isRecord(first)) {
    throw new Error("rpc testmempoolaccept entry must be an object");
  }

  const txid = getOptionalString(first, "txid");
  const wtxid = getOptionalString(first, "wtxid");
  const allowed = getRequiredBoolean(first, "allowed");
  const rejectReason = getOptionalString(first, "reject-reason");
  const rejectCode = getOptionalInteger(first, "reject-code");
  const packageError = getOptionalString(first, "package-error");
  const vsize = getOptionalInteger(first, "vsize");

  return {
    allowed,
    ...(txid === undefined ? {} : { txid }),
    ...(wtxid === undefined ? {} : { wtxid }),
    ...(rejectReason === undefined ? {} : { rejectReason }),
    ...(rejectCode === undefined ? {} : { rejectCode }),
    ...(packageError === undefined ? {} : { packageError }),
    ...(vsize === undefined ? {} : { vsize })
  };
}

function parseBitcoinTransactionOutputFixture(input: unknown): BitcoinTransactionOutput {
  if (!isRecord(input)) {
    throw new Error("transaction output fixture must be an object");
  }

  const { valueSats, scriptType, dataHex, address } = input;

  if (
    scriptType !== "op_return" &&
    scriptType !== "payment" &&
    scriptType !== "unknown"
  ) {
    throw new Error("transaction output fixture scriptType is invalid");
  }

  if (address !== undefined && typeof address !== "string") {
    throw new Error("transaction output fixture address must be a string when present");
  }

  if (
    typeof valueSats !== "string" &&
    (typeof valueSats !== "number" || !Number.isInteger(valueSats))
  ) {
    throw new Error("transaction output fixture valueSats must be an integer-like string or integer");
  }

  if (dataHex !== undefined && typeof dataHex !== "string") {
    throw new Error("transaction output fixture dataHex must be a string when present");
  }

  return {
    valueSats: BigInt(valueSats),
    scriptType,
    ...(dataHex === undefined ? {} : { dataHex }),
    ...(address === undefined ? {} : { address })
  };
}

function parseBitcoinTransactionInputFixture(input: unknown): BitcoinTransactionInput {
  if (!isRecord(input)) {
    throw new Error("transaction input fixture must be an object");
  }

  const coinbase = getOptionalBoolean(input, "coinbase") ?? false;

  if (coinbase) {
    return {
      txid: null,
      vout: null,
      coinbase: true
    };
  }

  const txid = getRequiredString(input, "txid");
  const vout = getRequiredInteger(input, "vout");

  return {
    txid,
    vout,
    coinbase: false
  };
}

function parseBitcoinRpcTransactionOutput(input: unknown): BitcoinTransactionOutput {
  if (!isRecord(input)) {
    throw new Error("rpc transaction output must be an object");
  }

  const value = getRequiredNumber(input, "value");
  const scriptPubKey = getRequiredRecord(input, "scriptPubKey");
  const scriptType = mapScriptType(scriptPubKey.type);
  const asm = typeof scriptPubKey.asm === "string" ? scriptPubKey.asm : undefined;
  const dataHex = scriptType === "op_return" ? parseOpReturnDataHex(asm) : undefined;
  const address = getOptionalString(scriptPubKey, "address");

  return {
    valueSats: btcToSats(value),
    scriptType,
    ...(dataHex === undefined ? {} : { dataHex }),
    ...(address === undefined ? {} : { address })
  };
}

function parseBitcoinEsploraTransactionOutput(input: unknown): BitcoinTransactionOutput {
  if (!isRecord(input)) {
    throw new Error("esplora transaction output must be an object");
  }

  const value = getRequiredInteger(input, "value");
  const scriptType = mapScriptType(input.scriptpubkey_type);
  const asm = getOptionalString(input, "scriptpubkey_asm");
  const dataHex = scriptType === "op_return" ? parseOpReturnDataHex(asm) : undefined;
  const address = getOptionalString(input, "scriptpubkey_address");

  return {
    valueSats: BigInt(value),
    scriptType,
    ...(dataHex === undefined ? {} : { dataHex }),
    ...(address === undefined ? {} : { address })
  };
}

function parseBitcoinRpcTransactionInput(input: unknown): BitcoinTransactionInput {
  if (!isRecord(input)) {
    throw new Error("rpc transaction input must be an object");
  }

  if (typeof input.coinbase === "string") {
    return {
      txid: null,
      vout: null,
      coinbase: true
    };
  }

  return {
    txid: getRequiredString(input, "txid"),
    vout: getRequiredInteger(input, "vout"),
    coinbase: false
  };
}

function parseBitcoinEsploraTransactionInput(input: unknown): BitcoinTransactionInput {
  if (!isRecord(input)) {
    throw new Error("esplora transaction input must be an object");
  }

  if (input.is_coinbase === true) {
    return {
      txid: null,
      vout: null,
      coinbase: true
    };
  }

  return {
    txid: getRequiredString(input, "txid"),
    vout: getRequiredInteger(input, "vout"),
    coinbase: false
  };
}

function parseOpReturnDataHex(asm: string | undefined): string | undefined {
  if (asm === undefined) {
    return undefined;
  }

  const parts = asm
    .split(/\s+/)
    .slice(1)
    .filter((token) => /^[0-9a-f]+$/i.test(token));

  if (parts.length === 0) {
    return undefined;
  }

  return parts.join("").toLowerCase();
}

function mapScriptType(type: unknown): BitcoinTransactionOutput["scriptType"] {
  if (type === "nulldata" || type === "op_return") {
    return "op_return";
  }

  if (typeof type === "string" && type.length > 0) {
    return "payment";
  }

  return "unknown";
}

function btcToSats(value: number): bigint {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("bitcoin value must be a finite non-negative number");
  }

  const [whole = "0", fractional = ""] = value.toFixed(8).split(".");
  const normalizedFractional = fractional.padEnd(8, "0");

  return BigInt(whole) * 100_000_000n + BigInt(normalizedFractional);
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}

function getRequiredRecord(input: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = input[key];

  if (!isRecord(value)) {
    throw new Error(`${key} must be an object`);
  }

  return value;
}

function getRequiredArray(input: Record<string, unknown>, key: string): unknown[] {
  const value = input[key];

  if (!Array.isArray(value)) {
    throw new Error(`${key} must be an array`);
  }

  return value;
}

function getRequiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];

  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${key} must be a non-empty string`);
  }

  return value;
}

function getRequiredInteger(input: Record<string, unknown>, key: string): number {
  const value = input[key];

  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${key} must be an integer`);
  }

  return value;
}

function getRequiredNumber(input: Record<string, unknown>, key: string): number {
  const value = input[key];

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${key} must be a finite number`);
  }

  return value;
}

function getOptionalBoolean(input: Record<string, unknown>, key: string): boolean | undefined {
  const value = input[key];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new Error(`${key} must be a boolean when present`);
  }

  return value;
}

function getRequiredBoolean(input: Record<string, unknown>, key: string): boolean {
  const value = input[key];

  if (typeof value !== "boolean") {
    throw new Error(`${key} must be a boolean`);
  }

  return value;
}

function getOptionalInteger(input: Record<string, unknown>, key: string): number | undefined {
  const value = input[key];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${key} must be an integer when present`);
  }

  return value;
}

function getOptionalNumber(input: Record<string, unknown>, key: string): number | undefined {
  const value = input[key];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${key} must be a finite number when present`);
  }

  return value;
}

function getOptionalString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${key} must be a non-empty string when present`);
  }

  return value;
}

function getRequiredChain(input: Record<string, unknown>, key: string): BitcoinRpcChain {
  const value = input[key];

  if (value !== "main" && value !== "test" && value !== "signet" && value !== "regtest") {
    throw new Error(`${key} must be one of main, test, signet, regtest`);
  }

  return value;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error("hex payload must have an even number of characters");
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < hex.length; index += 2) {
    const value = Number.parseInt(hex.slice(index, index + 2), 16);

    if (Number.isNaN(value)) {
      throw new Error("hex payload must contain only hexadecimal characters");
    }

    bytes[index / 2] = value;
  }

  return bytes;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
