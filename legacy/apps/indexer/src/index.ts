import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  assertBitcoinRpcChain,
  type BitcoinRpcBlockchainInfo,
  type BitcoinRpcChain,
  BitcoinEsploraBlockPoller,
  BitcoinRpcBlockPoller,
  findBitcoinEsploraMatchingCheckpoint,
  findBitcoinRpcMatchingCheckpoint,
  createBitcoinEsploraConfig,
  createBitcoinRpcConfig,
  isBitcoinEsploraHeadCurrent,
  isBitcoinRpcHeadCurrent,
  loadBitcoinBlocksFromSource
} from "@ont/bitcoin";
import { InMemoryOntIndexer } from "@ont/core";
import {
  createDatabaseConfig,
  ensureDatabaseSchema,
  loadIndexerSnapshotDatabase,
  loadIndexerSnapshotFile,
  saveIndexerSnapshotDatabase,
  saveIndexerSnapshotFile,
  type DatabaseConfig
} from "@ont/db";
import { PRODUCT_NAME, PROTOCOL_NAME } from "@ont/protocol";

const currentDir = dirname(fileURLToPath(import.meta.url));

void main();

async function main(): Promise<void> {
  const sourceMode = parseSourceMode(process.env.ONT_SOURCE_MODE);
  const fixturePath =
    (process.env.ONT_FIXTURE_PATH) === undefined
      ? resolve(currentDir, "../../../fixtures/demo-chain.json")
      : resolve(process.cwd(), process.env.ONT_FIXTURE_PATH ?? "");
  const launchHeight = parseOptionalInteger(process.env.ONT_LAUNCH_HEIGHT);
  const endHeight = parseOptionalInteger(process.env.ONT_RPC_END_HEIGHT);
  const expectedChain = parseExpectedChain(process.env.ONT_EXPECT_CHAIN ?? "signet");
  const snapshotPath =
    (process.env.ONT_SNAPSHOT_PATH) === undefined
      ? resolve(process.cwd(), ".data/indexer-snapshot.json")
      : resolve(process.cwd(), process.env.ONT_SNAPSHOT_PATH ?? "");
  const database = resolveDatabaseConfig();
  const snapshotDocumentKey =
    process.env.ONT_SNAPSHOT_KEY?.trim() || "indexer";
  const configuredRpcUrl = resolveConfiguredEndpoint(
    process.env.ONT_BITCOIN_RPC_URL,
    "ONT_BITCOIN_RPC_URL"
  );
  const configuredEsploraBaseUrl = resolveConfiguredEndpoint(
    process.env.ONT_ESPLORA_BASE_URL,
    "ONT_ESPLORA_BASE_URL"
  );
  const rpc =
    sourceMode === "fixture" || sourceMode === "esplora" || configuredRpcUrl === undefined
      ? undefined
      : createBitcoinRpcConfig(
        configuredRpcUrl,
          process.env.ONT_BITCOIN_RPC_USERNAME,
          process.env.ONT_BITCOIN_RPC_PASSWORD
        );
  const esplora =
    sourceMode === "fixture" || sourceMode === "rpc" || configuredEsploraBaseUrl === undefined
      ? undefined
      : createBitcoinEsploraConfig(configuredEsploraBaseUrl);

  if (sourceMode === "rpc" && rpc === undefined) {
    throw new Error(
      "ONT_SOURCE_MODE=rpc requires a real ONT_BITCOIN_RPC_URL"
    );
  }

  if (sourceMode === "esplora" && esplora === undefined) {
    throw new Error(
      "ONT_SOURCE_MODE=esplora requires a real ONT_ESPLORA_BASE_URL"
    );
  }

  if (database !== null) {
    await ensureDatabaseSchema(database);
  }

  let restoredFromSnapshot = false;
  let indexer: InMemoryOntIndexer;
  let source: "fixture" | "rpc" | "esplora";
  let descriptor: string;
  let syncMode: "fixture" | "rpc-oneshot" | "esplora-oneshot";
  let rpcChainInfo: BitcoinRpcBlockchainInfo | null = null;

  if (rpc !== undefined) {
    source = "rpc";
    descriptor = rpc.url;
    syncMode = "rpc-oneshot";
    rpcChainInfo = await assertBitcoinRpcChain(rpc, expectedChain);

    try {
      indexer = InMemoryOntIndexer.fromSnapshot(await loadSnapshot(database, snapshotPath, snapshotDocumentKey));
      restoredFromSnapshot = true;
    } catch {
      if (launchHeight === undefined) {
        throw new Error(
          "ONT_LAUNCH_HEIGHT is required for rpc mode when no snapshot is available"
        );
      }

      indexer = new InMemoryOntIndexer({ launchHeight });
    }

    if (
      restoredFromSnapshot &&
      !(await isBitcoinRpcHeadCurrent(
        rpc,
        indexer.getStats().currentHeight,
        indexer.getStats().currentBlockHash
      ))
    ) {
      const matchingCheckpoint = await findBitcoinRpcMatchingCheckpoint(rpc, indexer.listRecentCheckpoints());

      if (matchingCheckpoint !== null) {
        restoredFromSnapshot = true;
        indexer.restoreRecentCheckpoint(matchingCheckpoint.height, matchingCheckpoint.hash);
      } else {
        if (launchHeight === undefined) {
          throw new Error(
            "ONT_LAUNCH_HEIGHT is required to rebuild after a reorg mismatch"
          );
        }

        restoredFromSnapshot = false;
        indexer = new InMemoryOntIndexer({ launchHeight });
      }
    }

    const poller = new BitcoinRpcBlockPoller({
      rpc,
      launchHeight: (indexer.getStats().currentHeight ?? indexer.getLaunchHeight() - 1) + 1
    });
    const blocks = await poller.bootstrap(endHeight);
    if (blocks.length > 0) {
      indexer.ingestBlocks(blocks);
    }
  } else if (esplora !== undefined) {
    source = "esplora";
    descriptor = esplora.baseUrl;
    syncMode = "esplora-oneshot";

    try {
      indexer = InMemoryOntIndexer.fromSnapshot(await loadSnapshot(database, snapshotPath, snapshotDocumentKey));
      restoredFromSnapshot = true;
    } catch {
      if (launchHeight === undefined) {
        throw new Error(
          "ONT_LAUNCH_HEIGHT is required for esplora mode when no snapshot is available"
        );
      }

      indexer = new InMemoryOntIndexer({ launchHeight });
    }

    if (
      restoredFromSnapshot &&
      !(await isBitcoinEsploraHeadCurrent(
        esplora,
        indexer.getStats().currentHeight,
        indexer.getStats().currentBlockHash
      ))
    ) {
      const matchingCheckpoint = await findBitcoinEsploraMatchingCheckpoint(
        esplora,
        indexer.listRecentCheckpoints()
      );

      if (matchingCheckpoint !== null) {
        restoredFromSnapshot = true;
        indexer.restoreRecentCheckpoint(matchingCheckpoint.height, matchingCheckpoint.hash);
      } else {
        if (launchHeight === undefined) {
          throw new Error(
            "ONT_LAUNCH_HEIGHT is required to rebuild after an esplora reorg mismatch"
          );
        }

        restoredFromSnapshot = false;
        indexer = new InMemoryOntIndexer({ launchHeight });
      }
    }

    const poller = new BitcoinEsploraBlockPoller({
      esplora,
      launchHeight: (indexer.getStats().currentHeight ?? indexer.getLaunchHeight() - 1) + 1
    });
    const blocks = await poller.bootstrap(endHeight);
    if (blocks.length > 0) {
      indexer.ingestBlocks(blocks);
    }
  } else {
    const loaded = await loadBitcoinBlocksFromSource({
      fixturePath,
      ...(launchHeight === undefined ? {} : { launchHeight }),
      ...(endHeight === undefined ? {} : { endHeight })
    });

    source = loaded.source;
    descriptor = loaded.descriptor;
    syncMode = "fixture";
    indexer = new InMemoryOntIndexer({ launchHeight: loaded.launchHeight });
    indexer.ingestBlocks(loaded.blocks);
  }

  if (rpc !== undefined || esplora !== undefined) {
    await saveSnapshot(database, snapshotPath, snapshotDocumentKey, indexer);
  }

  console.log(
    JSON.stringify(
      {
        product: PRODUCT_NAME,
        protocol: PROTOCOL_NAME,
        syncMode,
        source,
        descriptor,
        restoredFromSnapshot,
        snapshotPath:
          rpc === undefined && esplora === undefined
            ? null
            : database === null
              ? snapshotPath
              : `${database.schema}:indexer_snapshot/${snapshotDocumentKey}`,
        expectedChain: rpc === undefined && esplora === undefined ? null : expectedChain,
        rpcChainInfo,
        stats: indexer.getStats(),
        names: indexer.listNames()
      },
      (_key, value) => (typeof value === "bigint" ? value.toString() : value),
      2
    )
  );
}

function parseOptionalInteger(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    throw new Error(`invalid integer value: ${value}`);
  }

  return parsed;
}

function parseExpectedChain(value: string): BitcoinRpcChain {
  if (value !== "main" && value !== "test" && value !== "signet" && value !== "regtest") {
    throw new Error(`invalid ONT_EXPECT_CHAIN value: ${value}`);
  }

  return value;
}

function parseSourceMode(value: string | undefined): "auto" | "fixture" | "rpc" | "esplora" {
  if (value === undefined || value.trim() === "") {
    return "auto";
  }

  if (value === "auto" || value === "fixture" || value === "rpc" || value === "esplora") {
    return value;
  }

  throw new Error("ONT_SOURCE_MODE must be one of auto, fixture, rpc, esplora");
}

function resolveConfiguredEndpoint(value: string | undefined, envName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  if (looksLikePlaceholderEndpoint(trimmed)) {
    console.warn(`${PRODUCT_NAME} indexer ignoring placeholder ${envName}: ${trimmed}`);
    return undefined;
  }

  return trimmed;
}

function looksLikePlaceholderEndpoint(value: string): boolean {
  if (value.includes("your-remote-signet-node.example")) {
    return true;
  }

  try {
    const parsed = new URL(value);
    return parsed.hostname === "example" || parsed.hostname.endsWith(".example");
  } catch {
    return value.includes(".example");
  }
}

function resolveDatabaseConfig(): DatabaseConfig | null {
  const connectionString = process.env.ONT_DATABASE_URL?.trim() ?? "";
  if (connectionString === "") {
    return null;
  }

  return createDatabaseConfig(connectionString, {
    schema:
      process.env.ONT_DATABASE_SCHEMA?.trim()
      || "public"
  });
}

async function loadSnapshot(
  database: DatabaseConfig | null,
  snapshotPath: string,
  documentKey: string
) {
  if (database === null) {
    return loadIndexerSnapshotFile(snapshotPath);
  }

  const snapshot = await loadIndexerSnapshotDatabase(database, documentKey);
  if (snapshot === null) {
    throw new Error(`indexer snapshot document not found: ${documentKey}`);
  }

  return snapshot;
}

async function saveSnapshot(
  database: DatabaseConfig | null,
  snapshotPath: string,
  documentKey: string,
  indexer: InMemoryOntIndexer
): Promise<void> {
  const snapshot = indexer.exportSnapshot();

  if (database === null) {
    saveIndexerSnapshotFile(snapshotPath, snapshot);
    return;
  }

  await saveIndexerSnapshotDatabase(database, documentKey, snapshot);
}
