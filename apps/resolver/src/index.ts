import { createServer } from "node:http";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { dirname } from "node:path";

import {
  assertBitcoinRpcChain,
  type BitcoinRpcBlockchainInfo,
  type BitcoinRpcChain,
  BitcoinEsploraBlockPoller,
  BitcoinRpcBlockPoller,
  findBitcoinEsploraMatchingCheckpoint,
  findBitcoinRpcMatchingCheckpoint,
  type BitcoinRpcSyncStatus,
  getBitcoinRpcBlockchainInfo,
  getBitcoinRpcUnspentTransactionOutput,
  createBitcoinEsploraConfig,
  createBitcoinRpcConfig,
  isBitcoinEsploraHeadCurrent,
  isBitcoinRpcHeadCurrent,
  loadBitcoinBlocksFromSource
} from "@ont/bitcoin";
import {
  createDefaultLaunchAuctionPolicy,
  createExperimentalLaunchAuctionCatalogEntry,
  type AccumulatorBatchLeaf,
  InMemoryOntIndexer,
  parseLaunchAuctionScenario,
  serializeLaunchAuctionPolicy,
  type ExperimentalLaunchAuctionCatalogEntry,
  type NameRecord,
  type LaunchAuctionPolicy,
  type RecoveryWalletProofAvailabilityChecker
} from "@ont/core";
import {
  createDatabaseConfig,
  ensureDatabaseSchema,
  loadIndexerSnapshotDatabase,
  loadIndexerSnapshotFile,
  saveIndexerSnapshotDatabase,
  saveIndexerSnapshotFile,
  type DatabaseConfig
} from "@ont/db";
import {
  computeRecoveryDescriptorHash,
  computeRecoveryWalletProofHash,
  createRecoveryWalletProofCommitment,
  computeValueRecordHash,
  normalizeName,
  parseRecoveryWalletProof,
  parseSignedRecoveryDescriptor,
  parseSignedValueRecord,
  PRODUCT_NAME,
  PROTOCOL_NAME,
  type RecoveryWalletProof,
  type SignedRecoveryDescriptor,
  type SignedValueRecord,
  verifyRecoveryWalletProof
} from "@ont/protocol";
import {
  validateRecoveryDescriptorSubmission,
  validateValueRecordSubmission
} from "./validation.js";
import {
  appendRecoveryDescriptor,
  countRecoveryDescriptors,
  getRecoveryDescriptorChain,
  loadRecoveryDescriptorStoreDatabase,
  loadRecoveryDescriptorStoreFile,
  saveRecoveryDescriptorStoreDatabase,
  saveRecoveryDescriptorStoreFile,
  type RecoveryDescriptorChain,
  type RecoveryDescriptorStore
} from "./recovery-store.js";
import {
  appendRecoveryWalletProof,
  countRecoveryWalletProofs,
  getRecoveryWalletProof,
  loadRecoveryWalletProofStoreDatabase,
  loadRecoveryWalletProofStoreFile,
  saveRecoveryWalletProofStoreDatabase,
  saveRecoveryWalletProofStoreFile,
  type RecoveryWalletProofStore
} from "./recovery-proof-store.js";
import {
  appendValueRecord,
  countValueRecords,
  getValueRecordChain,
  loadValueRecordStoreDatabase,
  loadValueRecordStoreFile,
  saveValueRecordStoreDatabase,
  saveValueRecordStoreFile,
  type ValueRecordChain,
  type ValueRecordStore
} from "./value-store.js";

const port = parsePort(
  process.env.ONT_RESOLVER_PORT ?? "8787",
  "ONT_RESOLVER_PORT"
);
const defaultPollIntervalMs = Number.parseInt(
  process.env.ONT_RPC_POLL_INTERVAL_MS ?? "10000",
  10
);
// Optional cheap-rail DA source: a publisher's /da/{root} endpoint. When set, the
// resolver fetches batch leaves for each observed-but-unresolved anchor and merges
// the ones that verify against the on-chain root — making accumulator-claimed names
// (e.g. from the claim site) resolvable here. Unset → L1-only, as before.
const publisherDaUrl = (process.env.ONT_RESOLVER_PUBLISHER_DA_URL ?? "").replace(/\/$/, "");
const currentDir = dirname(fileURLToPath(import.meta.url));
const auctionFixtureDir =
  normalizeOptionalText(process.env.ONT_EXPERIMENTAL_AUCTION_FIXTURE_DIR)
  ?? resolve(currentDir, "../../../fixtures/auction/lab");
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
      ? resolve(process.cwd(), ".data/resolver-snapshot.json")
      : resolve(process.cwd(), process.env.ONT_SNAPSHOT_PATH ?? "");
  const valueStorePath =
    (process.env.ONT_VALUE_STORE_PATH) === undefined
      ? resolve(process.cwd(), ".data/value-records.json")
      : resolve(process.cwd(), process.env.ONT_VALUE_STORE_PATH ?? "");
  const recoveryStorePath =
    (process.env.ONT_RECOVERY_DESCRIPTOR_STORE_PATH) === undefined
      ? resolve(process.cwd(), ".data/recovery-descriptors.json")
      : resolve(process.cwd(), process.env.ONT_RECOVERY_DESCRIPTOR_STORE_PATH ?? "");
  const recoveryProofStorePath =
    (process.env.ONT_RECOVERY_WALLET_PROOF_STORE_PATH) === undefined
      ? resolve(process.cwd(), ".data/recovery-wallet-proofs.json")
      : resolve(process.cwd(), process.env.ONT_RECOVERY_WALLET_PROOF_STORE_PATH ?? "");
  const database = resolveDatabaseConfig();
  const snapshotDocumentKey = process.env.ONT_SNAPSHOT_KEY?.trim() || "resolver";
  const valueStoreDocumentKey = process.env.ONT_VALUE_STORE_KEY?.trim() || "resolver";
  const recoveryStoreDocumentKey = process.env.ONT_RECOVERY_DESCRIPTOR_STORE_KEY?.trim() || "resolver";
  const recoveryProofStoreDocumentKey = process.env.ONT_RECOVERY_WALLET_PROOF_STORE_KEY?.trim() || "resolver";
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
  const experimentalLaunchAuctionPolicy = resolveExperimentalLaunchAuctionPolicy();
  const experimentalLaunchAuctionCatalog = await loadExperimentalLaunchAuctionCatalog(
    auctionFixtureDir,
    experimentalLaunchAuctionPolicy
  );
  let indexer: InMemoryOntIndexer;
  const valueRecords =
    database === null
      ? await loadValueRecordStoreFile(valueStorePath)
      : await loadValueRecordStoreDatabase(database, valueStoreDocumentKey);
  const recoveryDescriptors =
    database === null
      ? await loadRecoveryDescriptorStoreFile(recoveryStorePath)
      : await loadRecoveryDescriptorStoreDatabase(database, recoveryStoreDocumentKey);
  const recoveryProofs =
    database === null
      ? await loadRecoveryWalletProofStoreFile(recoveryProofStorePath)
      : await loadRecoveryWalletProofStoreDatabase(database, recoveryProofStoreDocumentKey);
  const recoveryWalletProofAvailable = createRecoveryWalletProofAvailabilityChecker(
    recoveryDescriptors,
    recoveryProofs
  );
  let source: "fixture" | "rpc" | "esplora";
  let descriptor: string;
  let syncMode: "fixture" | "rpc-oneshot" | "rpc-polling" | "esplora-oneshot" | "esplora-polling";
  let rpcStatus: BitcoinRpcSyncStatus | null = null;
  let rpcChainInfo: BitcoinRpcBlockchainInfo | null = null;

  if (rpc !== undefined) {
    source = "rpc";
    descriptor = rpc.url;
    rpcChainInfo = await assertBitcoinRpcChain(rpc, expectedChain);

    try {
      indexer = InMemoryOntIndexer.fromSnapshot(
        await loadSnapshot(database, snapshotPath, snapshotDocumentKey),
        {
          experimentalLaunchAuctionPolicy,
          experimentalLaunchAuctionCatalog,
          recoveryWalletProofAvailable
        }
      );
      restoredFromSnapshot = true;
    } catch {
      if (launchHeight === undefined) {
        throw new Error(
          "ONT_LAUNCH_HEIGHT is required for rpc mode when no snapshot is available"
        );
      }

      indexer = new InMemoryOntIndexer({
        launchHeight,
        experimentalLaunchAuctionPolicy,
        experimentalLaunchAuctionCatalog,
        recoveryWalletProofAvailable
      });
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
        indexer = new InMemoryOntIndexer({
          launchHeight,
          experimentalLaunchAuctionPolicy,
          experimentalLaunchAuctionCatalog,
          recoveryWalletProofAvailable
        });
      }
    }

    syncMode = Number.isFinite(defaultPollIntervalMs) && defaultPollIntervalMs > 0 ? "rpc-polling" : "rpc-oneshot";

    const startHeight = (indexer.getStats().currentHeight ?? indexer.getLaunchHeight() - 1) + 1;
    const poller = new BitcoinRpcBlockPoller({
      rpc,
      launchHeight: startHeight
    });

    const initialBlocks = await poller.bootstrap(endHeight);
    if (initialBlocks.length > 0) {
      indexer.ingestBlocks(initialBlocks);
    }
    rpcStatus = poller.getStatus();
    await saveSnapshot(database, snapshotPath, snapshotDocumentKey, indexer);

    if (syncMode === "rpc-polling") {
      let syncInFlight = false;
      const pollOnce = async (): Promise<void> => {
        if (syncInFlight) {
          return;
        }

        syncInFlight = true;

        try {
          if (
            !(await isBitcoinRpcHeadCurrent(
              rpc,
              indexer.getStats().currentHeight,
              indexer.getStats().currentBlockHash
            ))
          ) {
            const matchingCheckpoint = await findBitcoinRpcMatchingCheckpoint(rpc, indexer.listRecentCheckpoints());

            if (matchingCheckpoint !== null && indexer.restoreRecentCheckpoint(matchingCheckpoint.height, matchingCheckpoint.hash)) {
              const checkpointPoller = new BitcoinRpcBlockPoller({
                rpc,
                launchHeight: matchingCheckpoint.height + 1
              });
              const replayedBlocks = await checkpointPoller.bootstrap(endHeight);
              indexer.ingestBlocks(replayedBlocks);
              rpcStatus = checkpointPoller.getStatus();
              await saveSnapshot(database, snapshotPath, snapshotDocumentKey, indexer);
              return;
            }

            indexer = new InMemoryOntIndexer({
              launchHeight: indexer.getLaunchHeight(),
              experimentalLaunchAuctionPolicy,
              experimentalLaunchAuctionCatalog,
              recoveryWalletProofAvailable
            });
            const rebuildPoller = new BitcoinRpcBlockPoller({
              rpc,
              launchHeight: indexer.getLaunchHeight()
            });
            const rebuiltBlocks = await rebuildPoller.bootstrap(endHeight);
            indexer.ingestBlocks(rebuiltBlocks);
            rpcStatus = rebuildPoller.getStatus();
            await saveSnapshot(database, snapshotPath, snapshotDocumentKey, indexer);
            return;
          }

          const newBlocks = await poller.poll(endHeight);
          if (newBlocks.length > 0) {
            indexer.ingestBlocks(newBlocks);
            await saveSnapshot(database, snapshotPath, snapshotDocumentKey, indexer);
          }
          rpcStatus = poller.getStatus();
        } catch (error) {
          console.error(`${PRODUCT_NAME} resolver RPC poll failed:`, error);
        } finally {
          syncInFlight = false;
        }
      };

      setInterval(() => {
        void pollOnce();
      }, defaultPollIntervalMs);
    }
  } else if (esplora !== undefined) {
    source = "esplora";
    descriptor = esplora.baseUrl;

    try {
      indexer = InMemoryOntIndexer.fromSnapshot(
        await loadSnapshot(database, snapshotPath, snapshotDocumentKey),
        {
          experimentalLaunchAuctionPolicy,
          experimentalLaunchAuctionCatalog,
          recoveryWalletProofAvailable
        }
      );
      restoredFromSnapshot = true;
    } catch {
      if (launchHeight === undefined) {
        throw new Error(
          "ONT_LAUNCH_HEIGHT is required for esplora mode when no snapshot is available"
        );
      }

      indexer = new InMemoryOntIndexer({
        launchHeight,
        experimentalLaunchAuctionPolicy,
        experimentalLaunchAuctionCatalog,
        recoveryWalletProofAvailable
      });
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
        indexer = new InMemoryOntIndexer({
          launchHeight,
          experimentalLaunchAuctionPolicy,
          experimentalLaunchAuctionCatalog,
          recoveryWalletProofAvailable
        });
      }
    }

    syncMode =
      Number.isFinite(defaultPollIntervalMs) && defaultPollIntervalMs > 0
        ? "esplora-polling"
        : "esplora-oneshot";

    const startHeight = (indexer.getStats().currentHeight ?? indexer.getLaunchHeight() - 1) + 1;
    const poller = new BitcoinEsploraBlockPoller({
      esplora,
      launchHeight: startHeight
    });

    const initialBlocks = await poller.bootstrap(endHeight);
    if (initialBlocks.length > 0) {
      indexer.ingestBlocks(initialBlocks);
    }
    rpcStatus = poller.getStatus();
    await saveSnapshot(database, snapshotPath, snapshotDocumentKey, indexer);

    if (syncMode === "esplora-polling") {
      let syncInFlight = false;
      const pollOnce = async (): Promise<void> => {
        if (syncInFlight) {
          return;
        }

        syncInFlight = true;

        try {
          if (
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

            if (matchingCheckpoint !== null && indexer.restoreRecentCheckpoint(matchingCheckpoint.height, matchingCheckpoint.hash)) {
              const checkpointPoller = new BitcoinEsploraBlockPoller({
                esplora,
                launchHeight: matchingCheckpoint.height + 1
              });
              const replayedBlocks = await checkpointPoller.bootstrap(endHeight);
              indexer.ingestBlocks(replayedBlocks);
              rpcStatus = checkpointPoller.getStatus();
              await saveSnapshot(database, snapshotPath, snapshotDocumentKey, indexer);
              return;
            }

            indexer = new InMemoryOntIndexer({
              launchHeight: indexer.getLaunchHeight(),
              experimentalLaunchAuctionPolicy,
              experimentalLaunchAuctionCatalog,
              recoveryWalletProofAvailable
            });
            const rebuildPoller = new BitcoinEsploraBlockPoller({
              esplora,
              launchHeight: indexer.getLaunchHeight()
            });
            const rebuiltBlocks = await rebuildPoller.bootstrap(endHeight);
            indexer.ingestBlocks(rebuiltBlocks);
            rpcStatus = rebuildPoller.getStatus();
            await saveSnapshot(database, snapshotPath, snapshotDocumentKey, indexer);
            return;
          }

          const newBlocks = await poller.poll(endHeight);
          if (newBlocks.length > 0) {
            indexer.ingestBlocks(newBlocks);
            await saveSnapshot(database, snapshotPath, snapshotDocumentKey, indexer);
          }
          rpcStatus = poller.getStatus();
        } catch (error) {
          console.error(`${PRODUCT_NAME} resolver Esplora poll failed:`, error);
        } finally {
          syncInFlight = false;
        }
      };

      setInterval(() => {
        void pollOnce();
      }, defaultPollIntervalMs);
    }
  } else {
    const loaded = await loadBitcoinBlocksFromSource({
      fixturePath,
      ...(esplora === undefined ? {} : { esplora }),
      ...(launchHeight === undefined ? {} : { launchHeight }),
      ...(endHeight === undefined ? {} : { endHeight })
    });

    source = loaded.source;
    descriptor = loaded.descriptor;
    syncMode = "fixture";
    indexer = new InMemoryOntIndexer({
      launchHeight: loaded.launchHeight,
      experimentalLaunchAuctionPolicy,
      experimentalLaunchAuctionCatalog,
      recoveryWalletProofAvailable
    });
    indexer.ingestBlocks(loaded.blocks);
  }

  const server = createServer((request, response) => {
    void handleRequest(request, response);
  });

  async function handleRequest(
    request: import("node:http").IncomingMessage,
    response: import("node:http").ServerResponse
  ): Promise<void> {
    const method = request.method ?? "GET";
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    if (method === "POST" && url.pathname === "/values") {
      try {
        const parsedRecord = parseSignedValueRecord(await readJsonBody(request));

        const currentNameRecord = indexer.getName(parsedRecord.name);
        const existingChain = getValueRecordChain(valueRecords, parsedRecord.name, parsedRecord.ownershipRef);
        const verdict = validateValueRecordSubmission(
          parsedRecord,
          currentNameRecord,
          getChainHead(existingChain)
        );
        if (!verdict.ok) {
          return writeJson(response, verdict.status, verdict.body);
        }

        appendValueRecord(valueRecords, parsedRecord);
        if (database === null) {
          await saveValueRecordStoreFile(valueStorePath, valueRecords);
        } else {
          await saveValueRecordStoreDatabase(database, valueStoreDocumentKey, valueRecords);
        }

        return writeJson(response, 201, {
          ok: true,
          name: parsedRecord.name,
          ownershipRef: parsedRecord.ownershipRef,
          sequence: parsedRecord.sequence,
          previousRecordHash: parsedRecord.previousRecordHash,
          recordHash: computeValueRecordHash(parsedRecord),
          valueType: parsedRecord.valueType,
          valueStorePath
        });
      } catch (error) {
        return writeJson(response, 400, {
          error: "invalid_value_record",
          message: error instanceof Error ? error.message : "Invalid value record"
        });
      }
    }

    if (method === "POST" && url.pathname === "/recovery-descriptors") {
      try {
        const parsedDescriptor = parseSignedRecoveryDescriptor(await readJsonBody(request));

        const currentNameRecord = indexer.getName(parsedDescriptor.name);
        const existingChain = getRecoveryDescriptorChain(
          recoveryDescriptors,
          parsedDescriptor.name,
          parsedDescriptor.ownershipRef
        );
        const verdict = validateRecoveryDescriptorSubmission(
          parsedDescriptor,
          currentNameRecord,
          getRecoveryChainHead(existingChain)
        );
        if (!verdict.ok) {
          return writeJson(response, verdict.status, verdict.body);
        }

        appendRecoveryDescriptor(recoveryDescriptors, parsedDescriptor);
        if (database === null) {
          await saveRecoveryDescriptorStoreFile(recoveryStorePath, recoveryDescriptors);
        } else {
          await saveRecoveryDescriptorStoreDatabase(database, recoveryStoreDocumentKey, recoveryDescriptors);
        }

        return writeJson(response, 201, {
          ok: true,
          name: parsedDescriptor.name,
          ownershipRef: parsedDescriptor.ownershipRef,
          sequence: parsedDescriptor.sequence,
          previousDescriptorHash: parsedDescriptor.previousDescriptorHash,
          descriptorHash: computeRecoveryDescriptorHash(parsedDescriptor),
          recoveryAddress: parsedDescriptor.recoveryAddress,
          signingProfile: parsedDescriptor.signingProfile,
          challengeWindowBlocks: parsedDescriptor.challengeWindowBlocks,
          recoveryStorePath
        });
      } catch (error) {
        return writeJson(response, 400, {
          error: "invalid_recovery_descriptor",
          message: error instanceof Error ? error.message : "Invalid recovery descriptor"
        });
      }
    }

    if (method === "POST" && url.pathname === "/recovery-proofs") {
      try {
        const parsedProof = parseRecoveryWalletProof(await readJsonBody(request));
        const proofHash = computeRecoveryWalletProofHash(parsedProof);
        const descriptor = getRecoveryDescriptorByHash(recoveryDescriptors, parsedProof.recoveryDescriptorHash);

        if (descriptor === null) {
          return writeJson(response, 404, {
            error: "recovery_descriptor_not_found",
            message: "Cannot publish a recovery proof before the matching recovery descriptor is available.",
            name: parsedProof.name,
            recoveryDescriptorHash: parsedProof.recoveryDescriptorHash
          });
        }

        const verification = verifyRecoveryWalletProof({
          descriptor,
          proof: parsedProof
        });

        if (!verification.ok || verification.proofHash !== proofHash) {
          return writeJson(response, 400, {
            error: "invalid_recovery_wallet_proof",
            message: "Recovery wallet proof did not verify.",
            reason: verification.reason,
            proofHash
          });
        }

        const currentNameRecord = indexer.getName(parsedProof.name);

        if (currentNameRecord === null || currentNameRecord.status === "invalid") {
          return writeJson(response, 404, {
            error: "name_not_found",
            message: "Cannot publish a recovery proof for an unclaimed or invalid name.",
            name: parsedProof.name
          });
        }

        if (currentNameRecord.currentOwnerPubkey !== descriptor.ownerPubkey) {
          return writeJson(response, 409, {
            error: "owner_mismatch",
            message: "Recovery proof descriptor owner pubkey does not match the resolver's current owner.",
            name: parsedProof.name,
            currentOwnerPubkey: currentNameRecord.currentOwnerPubkey
          });
        }

        const currentOwnershipRef = getOwnershipRef(currentNameRecord);

        if (descriptor.ownershipRef !== currentOwnershipRef) {
          return writeJson(response, 409, {
            error: "ownership_ref_mismatch",
            message: "Recovery proof descriptor ownershipRef must match the resolver's current ownership interval.",
            name: parsedProof.name,
            currentOwnershipRef
          });
        }

        if (parsedProof.prevStateTxid !== currentOwnershipRef) {
          return writeJson(response, 409, {
            error: "predecessor_state_mismatch",
            message: "Recovery proof prevStateTxid must match the resolver's current ownership interval.",
            name: parsedProof.name,
            currentOwnershipRef
          });
        }

        appendRecoveryWalletProof(recoveryProofs, parsedProof);
        if (database === null) {
          await saveRecoveryWalletProofStoreFile(recoveryProofStorePath, recoveryProofs);
        } else {
          await saveRecoveryWalletProofStoreDatabase(database, recoveryProofStoreDocumentKey, recoveryProofs);
        }

        return writeJson(response, 201, {
          ok: true,
          name: parsedProof.name,
          recoveryDescriptorHash: parsedProof.recoveryDescriptorHash,
          proofHash,
          proofCommitment: createRecoveryWalletProofCommitment(parsedProof),
          recoveryProofStorePath
        });
      } catch (error) {
        return writeJson(response, 400, {
          error: "invalid_recovery_wallet_proof",
          message: error instanceof Error ? error.message : "Invalid recovery wallet proof"
        });
      }
    }

    if (method !== "GET") {
      return writeJson(response, 405, {
        error: "method_not_allowed",
        message: "Only GET plus POST /values, POST /recovery-descriptors, and POST /recovery-proofs are supported in the prototype resolver."
      });
    }

    if (url.pathname === "/health") {
      // rpcChainInfo is seeded once at startup; refresh it live per request so it
      // tracks the chain tip alongside rpcStatus instead of reporting a stale
      // mid-resync height. Keep the last-known-good value if the live query fails.
      if (rpc !== undefined) {
        try {
          rpcChainInfo = await getBitcoinRpcBlockchainInfo(rpc);
        } catch {
          // Preserve the previous rpcChainInfo when bitcoind RPC is briefly unreachable.
        }
      }

      return writeJson(response, 200, {
        ok: true,
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
        rpcStatus,
        valueChainsTracked: valueRecords.size,
        valueRecordsTracked: countValueRecords(valueRecords),
        valueStorePath:
          database === null ? valueStorePath : `${database.schema}:value_record_store/${valueStoreDocumentKey}`,
        recoveryDescriptorChainsTracked: recoveryDescriptors.size,
        recoveryDescriptorsTracked: countRecoveryDescriptors(recoveryDescriptors),
        recoveryStorePath:
          database === null
            ? recoveryStorePath
            : `${database.schema}:recovery_descriptor_store/${recoveryStoreDocumentKey}`,
        recoveryWalletProofsTracked: countRecoveryWalletProofs(recoveryProofs),
        recoveryProofStorePath:
          database === null
            ? recoveryProofStorePath
            : `${database.schema}:recovery_wallet_proof_store/${recoveryProofStoreDocumentKey}`,
        stats: indexer.getStats()
      });
    }

    if (url.pathname === "/stats") {
      return writeJson(response, 200, indexer.getStats());
    }

    const recoveryProofPathMatch = url.pathname.match(/^\/recovery-proofs\/([^/]+)$/);

    if (recoveryProofPathMatch) {
      const proofHash = decodeURIComponent(recoveryProofPathMatch[1] ?? "").trim().toLowerCase();

      if (!/^[0-9a-f]{64}$/.test(proofHash)) {
        return writeJson(response, 400, {
          error: "invalid_recovery_wallet_proof_hash",
          message: "Recovery wallet proof hash must be 32 bytes of hex."
        });
      }

      const proof = getRecoveryWalletProof(recoveryProofs, proofHash);

      if (proof === null) {
        return writeJson(response, 404, {
          error: "recovery_wallet_proof_not_found",
          proofHash
        });
      }

      return writeJson(response, 200, serializeRecoveryWalletProof(proof));
    }

    if (url.pathname === "/names") {
      return writeJson(response, 200, {
        names: indexer.listNames(),
        // Cheap-rail names (claim site / batched), surfaced separately so they aren't
        // mistaken for L1-bonded records. Empty until a DA source is configured.
        accumulatorNames: indexer.listAccumulatorNames()
      });
    }

    // Reverse lookup: all names (both rails) this node resolves to an owner pubkey.
    // Lets a wallet rediscover its HD key indices from the seed alone (gap-scan),
    // chain-derived and cross-publisher — the authoritative counterpart to a single
    // publisher's view.
    const ownerMatch = url.pathname.match(/^\/owner\/([0-9a-fA-F]{64})$/);
    if (ownerMatch && ownerMatch[1]) {
      const ownerPubkey = ownerMatch[1].toLowerCase();
      return writeJson(response, 200, {
        kind: "ont-owner-names",
        ownerPubkey,
        names: indexer.namesOwnedBy(ownerPubkey)
      });
    }

    if (url.pathname === "/experimental-auctions") {
      return writeJson(response, 200, {
        kind: "experimental_auctions",
        policy: serializeLaunchAuctionPolicy(experimentalLaunchAuctionPolicy),
        currentBlockHeight: indexer.getStats().currentHeight,
        auctions: indexer.listExperimentalAuctions()
      });
    }

    if (url.pathname === "/activity") {
      try {
        const requestedLimit = url.searchParams.get("limit");
        const limit = requestedLimit === null ? 12 : parseNonNegativeInteger(requestedLimit, "limit");

        return writeJson(response, 200, {
          activity: indexer.listRecentActivity(limit)
        });
      } catch (error) {
        return writeJson(response, 400, {
          error: "invalid_limit",
          message: error instanceof Error ? error.message : "Invalid activity limit"
        });
      }
    }

    const utxoPathMatch = url.pathname.match(/^\/utxo\/([0-9a-fA-F]{64})\/([0-9]+)$/);
    if (utxoPathMatch) {
      if (rpc === undefined) {
        return writeJson(response, 501, {
          error: "utxo_lookup_unavailable",
          message: "UTXO lookup requires an RPC-backed resolver."
        });
      }

      const txid = (utxoPathMatch[1] ?? "").toLowerCase();
      const vout = Number.parseInt(utxoPathMatch[2] ?? "", 10);
      if (!Number.isSafeInteger(vout) || vout < 0) {
        return writeJson(response, 400, {
          error: "invalid_vout",
          message: "UTXO vout must be a non-negative safe integer."
        });
      }

      try {
        const utxo = await getBitcoinRpcUnspentTransactionOutput(rpc, txid, vout, true);
        if (utxo === null) {
          return writeJson(response, 404, {
            error: "utxo_not_found_or_spent",
            txid,
            vout,
            message: "That funding output is missing or already spent."
          });
        }

        return writeJson(response, 200, {
          txid,
          vout,
          unspent: true,
          valueSats: utxo.valueSats.toString(),
          confirmations: utxo.confirmations,
          ...(utxo.bestblock === undefined ? {} : { bestblock: utxo.bestblock }),
          ...(utxo.address === undefined ? {} : { address: utxo.address })
        });
      } catch (error) {
        return writeJson(response, 502, {
          error: "utxo_lookup_failed",
          message: error instanceof Error ? error.message : "Unable to check the funding output."
        });
      }
    }

    if (url.pathname.startsWith("/tx/")) {
      const requestedTxid = decodeURIComponent(url.pathname.slice("/tx/".length)).trim().toLowerCase();

      if (!/^[0-9a-f]{64}$/.test(requestedTxid)) {
        return writeJson(response, 400, {
          error: "invalid_txid",
          message: "Transaction ids must be 64 lowercase or uppercase hex characters."
        });
      }

      const record = indexer.getTransactionProvenance(requestedTxid);

      if (record === null) {
        return writeJson(response, 404, {
          error: "tx_not_found",
          txid: requestedTxid
        });
      }

      return writeJson(response, 200, record);
    }

    if (url.pathname.startsWith("/name/")) {
      const activityPathMatch = url.pathname.match(/^\/name\/(.+)\/activity$/);

      if (activityPathMatch) {
        const requested = decodeURIComponent(activityPathMatch[1] ?? "");

        try {
          const normalized = normalizeName(requested);
          const currentNameRecord = indexer.getName(normalized);

          if (currentNameRecord === null) {
            return writeJson(response, 404, {
              error: "name_not_found",
              name: normalized
            });
          }

          const requestedLimit = url.searchParams.get("limit");
          const limit = requestedLimit === null ? 8 : parseNonNegativeInteger(requestedLimit, "limit");

          return writeJson(response, 200, {
            name: normalized,
            activity: indexer.listRecentActivityForName(normalized, limit)
          });
        } catch (error) {
          return writeJson(response, 400, {
            error: "invalid_name",
            message: error instanceof Error ? error.message : "Invalid name"
          });
        }
      }

      const recoveryHistoryPathMatch = url.pathname.match(/^\/name\/(.+)\/recovery\/history$/);

      if (recoveryHistoryPathMatch) {
        const requested = decodeURIComponent(recoveryHistoryPathMatch[1] ?? "");

        try {
          const normalized = normalizeName(requested);
          const currentNameRecord = indexer.getName(normalized);

          if (currentNameRecord === null) {
            return writeJson(response, 404, {
              error: "name_not_found",
              name: normalized
            });
          }

          const history = getCurrentRecoveryDescriptorHistory(recoveryDescriptors, indexer, normalized);
          if (history === null) {
            return writeJson(response, 404, {
              error: "recovery_descriptor_not_found",
              name: normalized
            });
          }

          return writeJson(response, 200, history);
        } catch (error) {
          return writeJson(response, 400, {
            error: "invalid_name",
            message: error instanceof Error ? error.message : "Invalid name"
          });
        }
      }

      const recoveryPathMatch = url.pathname.match(/^\/name\/(.+)\/recovery$/);

      if (recoveryPathMatch) {
        const requested = decodeURIComponent(recoveryPathMatch[1] ?? "");

        try {
          const normalized = normalizeName(requested);
          const currentNameRecord = indexer.getName(normalized);

          if (currentNameRecord === null) {
            return writeJson(response, 404, {
              error: "name_not_found",
              name: normalized
            });
          }

          const recoveryDescriptor = getCurrentRecoveryDescriptor(recoveryDescriptors, indexer, normalized);
          if (recoveryDescriptor === null) {
            return writeJson(response, 404, {
              error: "recovery_descriptor_not_found",
              name: normalized
            });
          }

          return writeJson(response, 200, serializeRecoveryDescriptor(recoveryDescriptor));
        } catch (error) {
          return writeJson(response, 400, {
            error: "invalid_name",
            message: error instanceof Error ? error.message : "Invalid name"
          });
        }
      }

      const valueHistoryPathMatch = url.pathname.match(/^\/name\/(.+)\/value\/history$/);

      if (valueHistoryPathMatch) {
        const requested = decodeURIComponent(valueHistoryPathMatch[1] ?? "");

        try {
          const normalized = normalizeName(requested);
          const currentNameRecord = indexer.getName(normalized);

          if (currentNameRecord === null) {
            return writeJson(response, 404, {
              error: "name_not_found",
              name: normalized
            });
          }

          const history = getCurrentValueRecordHistory(valueRecords, indexer, normalized);
          if (history === null) {
            return writeJson(response, 404, {
              error: "value_not_found",
              name: normalized
            });
          }

          return writeJson(response, 200, history);
        } catch (error) {
          return writeJson(response, 400, {
            error: "invalid_name",
            message: error instanceof Error ? error.message : "Invalid name"
          });
        }
      }

      const valuePathMatch = url.pathname.match(/^\/name\/(.+)\/value$/);

      if (valuePathMatch) {
        const requested = decodeURIComponent(valuePathMatch[1] ?? "");

        try {
          const normalized = normalizeName(requested);
          const currentNameRecord = indexer.getName(normalized);

          if (currentNameRecord === null) {
            return writeJson(response, 404, {
              error: "name_not_found",
              name: normalized
            });
          }

          const valueRecord = getCurrentValueRecord(valueRecords, indexer, normalized);
          if (valueRecord === null) {
            return writeJson(response, 404, {
              error: "value_not_found",
              name: normalized
            });
          }

          return writeJson(response, 200, serializeValueRecord(valueRecord));
        } catch (error) {
          return writeJson(response, 400, {
            error: "invalid_name",
            message: error instanceof Error ? error.message : "Invalid name"
          });
        }
      }

      const requested = decodeURIComponent(url.pathname.slice("/name/".length));

      try {
        const normalized = normalizeName(requested);
        const record = indexer.getName(normalized);

        if (record === null) {
          // Fall back to the cheap rail: a name claimed via the accumulator (e.g. the
          // claim site) resolves here once its batch DA has been fetched + verified.
          const accumulator = indexer.getAccumulatorName(normalized);
          if (accumulator !== null) {
            return writeJson(response, 200, { ...accumulator, source: "accumulator" });
          }
          return writeJson(response, 404, {
            error: "name_not_found",
            name: normalized
          });
        }

        return writeJson(response, 200, record);
      } catch (error) {
        return writeJson(response, 400, {
          error: "invalid_name",
          message: error instanceof Error ? error.message : "Invalid name"
        });
      }
    }

    return writeJson(response, 404, {
      error: "not_found",
      message:
        "Supported prototype endpoints: /health, /stats, /names, /experimental-auctions, /activity, /tx/{txid}, /utxo/{txid}/{vout}, /recovery-proofs/{proof_hash}, /name/{normalized_name}, /name/{normalized_name}/activity, /name/{normalized_name}/value, /name/{normalized_name}/value/history, /name/{normalized_name}/recovery, /name/{normalized_name}/recovery/history, POST /values, POST /recovery-descriptors, POST /recovery-proofs"
    });
  }

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(
        [
          `${PRODUCT_NAME} resolver could not start because port ${port} is already in use.`,
          "Try: ONT_RESOLVER_PORT=8788 npm run dev:resolver",
          "Or run both together with: ONT_RESOLVER_PORT=8788 ONT_WEB_PORT=3001 npm run dev:all"
        ].join("\n")
      );
      process.exit(1);
    }

    throw error;
  });

  server.listen(port, () => {
    console.log(
      `${PRODUCT_NAME} resolver listening on http://127.0.0.1:${port} (${source}/${syncMode}: ${descriptor})`
    );
  });

  // Cheap-rail DA loop: periodically fetch batch leaves for any observed-but-
  // unresolved anchor and merge the verified ones, so accumulator-claimed names
  // become resolvable. applyBatchData re-verifies every proof against the on-chain
  // root, so trusting the publisher's bytes is unnecessary (verify-don't-trust).
  if (publisherDaUrl !== "") {
    // Per-root exponential backoff so a missing batch (publisher restarted before
    // serving it, bytes never published) doesn't make the resolver hammer the
    // publisher forever: 1×, 2×, 4×… the poll interval, capped at 30 minutes.
    // A root's backoff resets the moment its fetch succeeds; brand-new anchors
    // are always tried immediately.
    const MAX_BACKOFF_MS = 30 * 60 * 1000;
    const daFailures = new Map<string, { failures: number; nextAttemptAt: number }>();
    const resolveBatchData = async (): Promise<void> => {
      const now = Date.now();
      const roots = indexer.unresolvedAnchorRoots();
      let mergedAny = false;
      for (const root of roots) {
        const failure = daFailures.get(root);
        if (failure !== undefined && now < failure.nextAttemptAt) continue;
        let fetched = false;
        try {
          const res = await fetch(`${publisherDaUrl}/da/${root}`);
          if (res.ok) {
            fetched = true;
            const bundle = (await res.json()) as { leaves?: readonly AccumulatorBatchLeaf[] };
            if (indexer.applyBatchData(root, bundle.leaves ?? []) > 0) mergedAny = true;
          }
        } catch {
          // publisher unreachable — backed off below
        }
        if (fetched) {
          daFailures.delete(root);
        } else {
          const failures = (failure?.failures ?? 0) + 1;
          const delay = Math.min(defaultPollIntervalMs * 2 ** (failures - 1), MAX_BACKOFF_MS);
          daFailures.set(root, { failures, nextAttemptAt: now + delay });
        }
      }
      // Drop bookkeeping for roots that resolved (or vanished via reorg restore).
      const live = new Set(indexer.unresolvedAnchorRoots());
      for (const root of daFailures.keys()) {
        if (!live.has(root)) daFailures.delete(root);
      }
      if (mergedAny) await saveSnapshot(database, snapshotPath, snapshotDocumentKey, indexer);
    };
    setInterval(() => void resolveBatchData(), defaultPollIntervalMs);
    void resolveBatchData();
    console.log(`cheap-rail DA: resolving batch leaves from ${publisherDaUrl}`);
  }
}

interface AuctionLabFixtureFile {
  readonly title: string;
  readonly description: string;
  readonly currentBlockHeight: number;
  readonly scenario: unknown;
}

async function loadExperimentalLaunchAuctionCatalog(
  fixtureDir: string,
  policy: LaunchAuctionPolicy
): Promise<ExperimentalLaunchAuctionCatalogEntry[]> {
  const fileNames = (await readdir(fixtureDir))
    .filter((name) => name.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(
    fileNames.map(async (fileName) => {
      const raw = await readFile(resolve(fixtureDir, fileName), "utf8");
      const fixture = JSON.parse(raw) as AuctionLabFixtureFile;
      const scenario = parseLaunchAuctionScenario(fixture.scenario);

      return createExperimentalLaunchAuctionCatalogEntry(
        {
          auctionId: fileName.replace(/\.json$/u, ""),
          title: fixture.title,
          description: fixture.description,
          name: scenario.name,
          unlockBlock: scenario.unlockBlock
        },
        policy
      );
    })
  );
}

function writeJson(
  response: import("node:http").ServerResponse,
  statusCode: number,
  body: unknown
): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body, bigintJsonReplacer));
}

function bigintJsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
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

function parsePort(value: string, envName: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`invalid ${envName} value: ${value}`);
  }

  return parsed;
}

function normalizeOptionalText(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    return null;
  }

  return resolve(process.cwd(), normalized);
}

function parseNonNegativeInteger(value: string, label: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }

  return parsed;
}

function resolveExperimentalLaunchAuctionPolicy(): LaunchAuctionPolicy {
  const basePolicy = createDefaultLaunchAuctionPolicy();
  const baseWindowBlocks = readOptionalExperimentalAuctionInteger("ONT_EXPERIMENTAL_AUCTION_BASE_WINDOW_BLOCKS");
  const softCloseExtensionBlocks = readOptionalExperimentalAuctionInteger(
    "ONT_EXPERIMENTAL_AUCTION_SOFT_CLOSE_EXTENSION_BLOCKS"
  );
  const minimumIncrementAbsoluteSats = readOptionalExperimentalAuctionBigInt(
    "ONT_EXPERIMENTAL_AUCTION_MINIMUM_INCREMENT_ABSOLUTE_SATS"
  );
  const minimumIncrementBasisPoints = readOptionalExperimentalAuctionInteger(
    "ONT_EXPERIMENTAL_AUCTION_MINIMUM_INCREMENT_BASIS_POINTS"
  );
  const softCloseMinimumIncrementAbsoluteSats = readOptionalExperimentalAuctionBigInt(
    "ONT_EXPERIMENTAL_AUCTION_SOFT_CLOSE_MINIMUM_INCREMENT_ABSOLUTE_SATS"
  );
  const softCloseMinimumIncrementBasisPoints = readOptionalExperimentalAuctionInteger(
    "ONT_EXPERIMENTAL_AUCTION_SOFT_CLOSE_MINIMUM_INCREMENT_BASIS_POINTS"
  );
  const settlementLockBlocks = readOptionalExperimentalAuctionInteger(
    "ONT_EXPERIMENTAL_AUCTION_LAUNCH_NAME_LOCK_BLOCKS"
  );

  return {
    ...basePolicy,
    ...(settlementLockBlocks === undefined ? {} : { defaultSettlementLockBlocks: settlementLockBlocks }),
    auction: {
      ...basePolicy.auction,
      ...(baseWindowBlocks === undefined ? {} : { baseWindowBlocks }),
      ...(softCloseExtensionBlocks === undefined ? {} : { softCloseExtensionBlocks }),
      ...(minimumIncrementAbsoluteSats === undefined ? {} : { minimumIncrementAbsoluteSats }),
      ...(minimumIncrementBasisPoints === undefined ? {} : { minimumIncrementBasisPoints }),
      ...(softCloseMinimumIncrementAbsoluteSats === undefined
        ? {}
        : { softCloseMinimumIncrementAbsoluteSats }),
      ...(softCloseMinimumIncrementBasisPoints === undefined
        ? {}
        : { softCloseMinimumIncrementBasisPoints })
    }
  };
}

function readOptionalExperimentalAuctionInteger(envName: string): number | undefined {
  const value = process.env[envName];

  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  return parseNonNegativeInteger(value, envName);
}

function readOptionalExperimentalAuctionBigInt(envName: string): bigint | undefined {
  const value = process.env[envName];

  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  return parseNonNegativeBigInt(value, envName);
}

function parseNonNegativeBigInt(value: string, label: string): bigint {
  const parsed = BigInt(value);

  if (parsed < 0n) {
    throw new Error(`${label} must be a non-negative integer`);
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
    console.warn(`${PRODUCT_NAME} resolver ignoring placeholder ${envName}: ${trimmed}`);
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

async function readJsonBody(
  request: import("node:http").IncomingMessage
): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8");

  if (raw.trim().length === 0) {
    throw new Error("request body must be valid JSON");
  }

  return JSON.parse(raw);
}

function getCurrentValueRecord(
  valueRecords: ValueRecordStore,
  indexer: InMemoryOntIndexer,
  name: string
): SignedValueRecord | null {
  const normalized = normalizeName(name);
  const currentNameRecord = indexer.getName(normalized);

  if (currentNameRecord === null || currentNameRecord.status === "invalid") {
    return null;
  }

  const chain = getValueRecordChain(valueRecords, normalized, getOwnershipRef(currentNameRecord));
  const valueRecord = getChainHead(chain);

  if (valueRecord === null || currentNameRecord.currentOwnerPubkey !== valueRecord.ownerPubkey) {
    return null;
  }

  return valueRecord;
}

function getCurrentValueRecordHistory(
  valueRecords: ValueRecordStore,
  indexer: InMemoryOntIndexer,
  name: string
): {
  readonly name: string;
  readonly ownershipRef: string;
  readonly currentRecordHash: string;
  readonly completeFromSequence: number;
  readonly completeToSequence: number;
  readonly hasGaps: boolean;
  readonly hasForks: boolean;
  readonly records: readonly ReturnType<typeof serializeValueRecord>[];
} | null {
  const normalized = normalizeName(name);
  const currentNameRecord = indexer.getName(normalized);

  if (currentNameRecord === null || currentNameRecord.status === "invalid") {
    return null;
  }

  const ownershipRef = getOwnershipRef(currentNameRecord);
  const chain = getValueRecordChain(valueRecords, normalized, ownershipRef);
  const head = getChainHead(chain);

  if (chain === null || head === null || head.ownerPubkey !== currentNameRecord.currentOwnerPubkey) {
    return null;
  }

  const records = chain.records.map(serializeValueRecord);

  return {
    name: normalized,
    ownershipRef,
    currentRecordHash: computeValueRecordHash(head),
    completeFromSequence: records[0]?.sequence ?? 0,
    completeToSequence: records.at(-1)?.sequence ?? 0,
    hasGaps: hasSequenceGaps(chain),
    hasForks: false,
    records
  };
}

function getCurrentRecoveryDescriptor(
  recoveryDescriptors: RecoveryDescriptorStore,
  indexer: InMemoryOntIndexer,
  name: string
): SignedRecoveryDescriptor | null {
  const normalized = normalizeName(name);
  const currentNameRecord = indexer.getName(normalized);

  if (currentNameRecord === null || currentNameRecord.status === "invalid") {
    return null;
  }

  const chain = getRecoveryDescriptorChain(recoveryDescriptors, normalized, getOwnershipRef(currentNameRecord));
  const descriptor = getRecoveryChainHead(chain);

  if (descriptor === null || currentNameRecord.currentOwnerPubkey !== descriptor.ownerPubkey) {
    return null;
  }

  return descriptor;
}

function getCurrentRecoveryDescriptorHistory(
  recoveryDescriptors: RecoveryDescriptorStore,
  indexer: InMemoryOntIndexer,
  name: string
): {
  readonly name: string;
  readonly ownershipRef: string;
  readonly currentDescriptorHash: string;
  readonly completeFromSequence: number;
  readonly completeToSequence: number;
  readonly hasGaps: boolean;
  readonly hasForks: boolean;
  readonly descriptors: readonly ReturnType<typeof serializeRecoveryDescriptor>[];
} | null {
  const normalized = normalizeName(name);
  const currentNameRecord = indexer.getName(normalized);

  if (currentNameRecord === null || currentNameRecord.status === "invalid") {
    return null;
  }

  const ownershipRef = getOwnershipRef(currentNameRecord);
  const chain = getRecoveryDescriptorChain(recoveryDescriptors, normalized, ownershipRef);
  const head = getRecoveryChainHead(chain);

  if (chain === null || head === null || head.ownerPubkey !== currentNameRecord.currentOwnerPubkey) {
    return null;
  }

  const descriptors = chain.descriptors.map(serializeRecoveryDescriptor);

  return {
    name: normalized,
    ownershipRef,
    currentDescriptorHash: computeRecoveryDescriptorHash(head),
    completeFromSequence: descriptors[0]?.sequence ?? 0,
    completeToSequence: descriptors.at(-1)?.sequence ?? 0,
    hasGaps: hasRecoverySequenceGaps(chain),
    hasForks: false,
    descriptors
  };
}

function createRecoveryWalletProofAvailabilityChecker(
  recoveryDescriptors: RecoveryDescriptorStore,
  recoveryProofs: RecoveryWalletProofStore
): RecoveryWalletProofAvailabilityChecker {
  return (request) => {
    const proof = getRecoveryWalletProof(recoveryProofs, request.proofHash);
    const descriptor = getRecoveryDescriptorByHash(
      recoveryDescriptors,
      request.recoveryDescriptorHash
    );

    if (proof === null || descriptor === null) {
      return false;
    }

    const verification = verifyRecoveryWalletProof({
      descriptor,
      proof,
      expected: {
        name: request.name,
        prevStateTxid: request.prevStateTxid,
        recoveryDescriptorHash: request.recoveryDescriptorHash,
        newOwnerPubkey: request.newOwnerPubkey,
        successorBondVout: request.successorBondVout,
        challengeWindowBlocks: request.challengeWindowBlocks
      }
    });

    return verification.ok && verification.proofHash === request.proofHash;
  };
}

function getRecoveryDescriptorByHash(
  recoveryDescriptors: RecoveryDescriptorStore,
  descriptorHash: string
): SignedRecoveryDescriptor | null {
  const normalizedHash = descriptorHash.trim().toLowerCase();

  for (const chain of recoveryDescriptors.values()) {
    for (const descriptor of chain.descriptors) {
      if (computeRecoveryDescriptorHash(descriptor) === normalizedHash) {
        return descriptor;
      }
    }
  }

  return null;
}

function getChainHead(chain: ValueRecordChain | null): SignedValueRecord | null {
  if (chain === null || chain.records.length === 0) {
    return null;
  }

  return [...chain.records].sort((left, right) => left.sequence - right.sequence).at(-1) ?? null;
}

function getRecoveryChainHead(chain: RecoveryDescriptorChain | null): SignedRecoveryDescriptor | null {
  if (chain === null || chain.descriptors.length === 0) {
    return null;
  }

  return [...chain.descriptors].sort((left, right) => left.sequence - right.sequence).at(-1) ?? null;
}

function serializeValueRecord(record: SignedValueRecord): SignedValueRecord & {
  readonly recordHash: string;
} {
  return {
    ...record,
    recordHash: computeValueRecordHash(record)
  };
}

function serializeRecoveryDescriptor(descriptor: SignedRecoveryDescriptor): SignedRecoveryDescriptor & {
  readonly descriptorHash: string;
} {
  return {
    ...descriptor,
    descriptorHash: computeRecoveryDescriptorHash(descriptor)
  };
}

function serializeRecoveryWalletProof(proof: RecoveryWalletProof): RecoveryWalletProof & {
  readonly proofHash: string;
  readonly proofCommitment: string;
} {
  return {
    ...proof,
    proofHash: computeRecoveryWalletProofHash(proof),
    proofCommitment: createRecoveryWalletProofCommitment(proof)
  };
}

function getOwnershipRef(record: NameRecord): string {
  return record.lastStateTxid;
}

function hasSequenceGaps(chain: ValueRecordChain): boolean {
  return chain.records.some((record, index) => record.sequence !== index + 1);
}

function hasRecoverySequenceGaps(chain: RecoveryDescriptorChain): boolean {
  return chain.descriptors.some((descriptor, index) => descriptor.sequence !== index + 1);
}
