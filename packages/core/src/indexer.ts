import {
  type BitcoinBlock,
  type BitcoinTransactionInBlock,
  type BitcoinTransactionInput,
  type BitcoinTransactionOutput
} from "@ont/bitcoin";
import {
  type AuctionBidEventPayload,
  OntEventType,
  normalizeName,
  type TransferEventPayload
} from "@ont/protocol";

import {
  applyBlockTransactionsWithProvenance,
  createEmptyState,
  type OntState,
  type NameRecord,
  type ProvenanceEventRecord,
  refreshDerivedState
} from "./engine.js";
import { getClaimedNameStatus } from "./state.js";
import {
  createExperimentalLaunchAuctionCatalogEntry,
  deriveExperimentalLaunchAuctionStates,
  getExperimentalLaunchAuctionId,
  type ExperimentalSpentOutpointObservation,
  serializeExperimentalLaunchAuctionState,
  type ExperimentalLaunchAuctionBidObservation,
  type ExperimentalLaunchAuctionCatalogEntry,
  type SerializedExperimentalLaunchAuctionState
} from "./experimental-auction.js";
import { createDefaultLaunchAuctionPolicy, type LaunchAuctionPolicy } from "./auction-policy.js";

export interface IndexerStats {
  readonly currentHeight: number | null;
  readonly currentBlockHash: string | null;
  readonly processedBlocks: number;
  readonly trackedNames: number;
}

export interface ExperimentalAuctionBidPayloadSnapshot {
  readonly flags: number;
  readonly bondVout: number;
  readonly settlementLockBlocks: number;
  readonly bidAmountSats: string;
  readonly ownerPubkey: string;
  readonly auctionLotCommitment: string;
  readonly auctionCommitment: string;
  readonly bidderCommitment: string;
  readonly name: string;
  readonly unlockBlock: number;
}

export interface InMemoryOntIndexerPersistedState {
  readonly launchHeight: number;
  readonly currentHeight: number | null;
  readonly currentBlockHash: string | null;
  readonly processedBlocks: number;
  readonly names: readonly NameRecordSnapshot[];
  readonly spentOutpoints?: readonly ExperimentalSpentOutpointObservation[];
  readonly transactionProvenance: readonly TransactionProvenanceSnapshot[];
}

export interface NameRecordSnapshot extends Omit<NameRecord, "requiredBondSats" | "currentBondValueSats" | "lastStateHeight"> {
  readonly requiredBondSats: string;
  readonly currentBondValueSats: string;
  readonly lastStateHeight?: number;
}

export interface InMemoryOntIndexerSnapshot extends InMemoryOntIndexerPersistedState {
  readonly recentCheckpoints?: readonly InMemoryOntIndexerPersistedState[];
}

export interface TransactionOutputSnapshot extends Omit<BitcoinTransactionOutput, "valueSats"> {
  readonly valueSats: string;
}

export type TransactionProvenanceEventPayloadSnapshot =
  | TransferEventPayload
  | ExperimentalAuctionBidPayloadSnapshot;

export interface TransactionProvenanceEventSnapshot {
  readonly vout: number;
  readonly type: OntEventType;
  readonly typeName:
    | "TRANSFER"
    | "AUCTION_BID";
  readonly payload: TransactionProvenanceEventPayloadSnapshot;
  readonly validationStatus: "applied" | "ignored";
  readonly reason: string;
  readonly affectedName: string | null;
}

export interface TransactionProvenanceSnapshot {
  readonly txid: string;
  readonly blockHeight: number;
  readonly txIndex: number;
  readonly inputs: readonly BitcoinTransactionInput[];
  readonly outputs: readonly TransactionOutputSnapshot[];
  readonly events: readonly TransactionProvenanceEventSnapshot[];
  readonly invalidatedNames: readonly string[];
}

export class InMemoryOntIndexer {
  private readonly launchHeight: number;
  private readonly recentCheckpointLimit: number;
  private readonly experimentalLaunchAuctionCatalog: readonly ExperimentalLaunchAuctionCatalogEntry[];
  private readonly experimentalLaunchAuctionPolicy: LaunchAuctionPolicy;
  private readonly state: OntState;
  private readonly spentOutpoints: Map<string, ExperimentalSpentOutpointObservation>;
  private readonly transactionProvenance: Map<string, TransactionProvenanceSnapshot>;
  private recentCheckpoints: InMemoryOntIndexerPersistedState[];
  private currentHeight: number | null;
  private currentBlockHash: string | null;
  private processedBlocks: number;

  public constructor(input: {
    launchHeight: number;
    recentCheckpointLimit?: number;
    experimentalLaunchAuctionCatalog?: readonly ExperimentalLaunchAuctionCatalogEntry[];
    experimentalLaunchAuctionPolicy?: LaunchAuctionPolicy;
  }) {
    this.launchHeight = input.launchHeight;
    this.recentCheckpointLimit = Math.max(1, input.recentCheckpointLimit ?? 100);
    this.experimentalLaunchAuctionCatalog = [...(input.experimentalLaunchAuctionCatalog ?? [])];
    this.experimentalLaunchAuctionPolicy =
      input.experimentalLaunchAuctionPolicy ?? createDefaultLaunchAuctionPolicy();
    this.state = createEmptyState();
    this.spentOutpoints = new Map();
    this.transactionProvenance = new Map();
    this.recentCheckpoints = [];
    this.currentHeight = null;
    this.currentBlockHash = null;
    this.processedBlocks = 0;
  }

  public static fromSnapshot(
    snapshot: InMemoryOntIndexerSnapshot,
    options?: {
      readonly experimentalLaunchAuctionCatalog?: readonly ExperimentalLaunchAuctionCatalogEntry[];
      readonly experimentalLaunchAuctionPolicy?: LaunchAuctionPolicy;
    }
  ): InMemoryOntIndexer {
    const indexer = new InMemoryOntIndexer({
      launchHeight: snapshot.launchHeight,
      recentCheckpointLimit: Math.max(1, snapshot.recentCheckpoints?.length ?? 100),
      ...(options?.experimentalLaunchAuctionCatalog === undefined
        ? {}
        : { experimentalLaunchAuctionCatalog: options.experimentalLaunchAuctionCatalog }),
      ...(options?.experimentalLaunchAuctionPolicy === undefined
        ? {}
        : { experimentalLaunchAuctionPolicy: options.experimentalLaunchAuctionPolicy })
    });
    indexer.hydrate(snapshot);

    return indexer;
  }

  public ingestBlock(block: BitcoinBlock): void {
    this.reconcileExperimentalAuctionOwnedNames(block.height);
    const transactions = block.transactions.map<BitcoinTransactionInBlock>((tx, txIndex) => ({
      tx,
      blockHeight: block.height,
      txIndex
    }));

    const provenance = applyBlockTransactionsWithProvenance(this.state, transactions, this.launchHeight);
    refreshDerivedState(this.state, block.height);
    this.recordSpentOutpoints(block);

    for (const transaction of provenance) {
      this.transactionProvenance.set(transaction.txid, serializeTransactionProvenanceRecord(transaction));
    }

    this.currentHeight = block.height;
    this.currentBlockHash = block.hash;
    this.processedBlocks += 1;
    this.reconcileExperimentalAuctionOwnedNames(block.height);
    this.pushRecentCheckpoint();
  }

  public ingestBlocks(blocks: readonly BitcoinBlock[]): void {
    for (const block of blocks) {
      this.ingestBlock(block);
    }
  }

  public getName(name: string): NameRecord | null {
    const normalized = normalizeName(name);
    const record = this.state.names.get(normalized);

    return record ?? null;
  }

  public listNames(): NameRecord[] {
    return [...this.state.names.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  public getTransactionProvenance(txid: string): TransactionProvenanceSnapshot | null {
    return this.transactionProvenance.get(txid) ?? null;
  }

  public listExperimentalAuctions(): SerializedExperimentalLaunchAuctionState[] {
    const currentBlockHeight = this.currentHeight ?? (this.launchHeight - 1);

    return this.deriveExperimentalAuctionStatesAtHeight(currentBlockHeight)
      .map((state) => serializeExperimentalLaunchAuctionState(state));
  }

  public getExperimentalAuction(auctionId: string): SerializedExperimentalLaunchAuctionState | null {
    return this.listExperimentalAuctions().find((auction) => auction.auctionId === auctionId) ?? null;
  }

  public listRecentActivity(limit = 12): TransactionProvenanceSnapshot[] {
    const normalizedLimit = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : 12;

    return [...this.transactionProvenance.values()]
      .sort((left, right) => {
        if (left.blockHeight !== right.blockHeight) {
          return right.blockHeight - left.blockHeight;
        }

        if (left.txIndex !== right.txIndex) {
          return right.txIndex - left.txIndex;
        }

        return right.txid.localeCompare(left.txid);
      })
      .slice(0, normalizedLimit);
  }

  public listRecentActivityForName(name: string, limit = 12): TransactionProvenanceSnapshot[] {
    const normalizedName = normalizeName(name);
    const normalizedLimit = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : 12;
    const record = this.state.names.get(normalizedName) ?? null;
    const relatedTxids =
      record === null
        ? new Set<string>()
        : new Set(
            [
              record.claimCommitTxid,
              record.claimRevealTxid,
              record.lastStateTxid,
              record.currentBondTxid
            ].filter((txid) => txid !== "")
          );

    return this.listRecentActivity(Number.MAX_SAFE_INTEGER)
      .filter((transaction) => {
        if (relatedTxids.has(transaction.txid)) {
          return true;
        }

        if (transaction.invalidatedNames.includes(normalizedName)) {
          return true;
        }

        if (
          record?.acquisitionKind === "auction"
          && record.acquisitionAuctionLotCommitment
          && transaction.events.some(
            (event) =>
              event.typeName === "AUCTION_BID"
              && "auctionLotCommitment" in event.payload
              && event.payload.auctionLotCommitment === record.acquisitionAuctionLotCommitment
          )
        ) {
          return true;
        }

        return transaction.events.some((event) => event.affectedName === normalizedName);
      })
      .slice(0, normalizedLimit);
  }

  public listRecentCheckpoints(): ReadonlyArray<{ readonly height: number; readonly hash: string }> {
    return this.recentCheckpoints
      .filter(
        (checkpoint): checkpoint is InMemoryOntIndexerPersistedState & {
          readonly currentHeight: number;
          readonly currentBlockHash: string;
        } => checkpoint.currentHeight !== null && checkpoint.currentBlockHash !== null
      )
      .map((checkpoint) => ({
        height: checkpoint.currentHeight,
        hash: checkpoint.currentBlockHash
      }))
      .sort((left, right) => right.height - left.height);
  }

  public restoreRecentCheckpoint(height: number, blockHash: string): boolean {
    const checkpointIndex = this.recentCheckpoints.findIndex(
      (checkpoint) => checkpoint.currentHeight === height && checkpoint.currentBlockHash === blockHash
    );

    if (checkpointIndex === -1) {
      return false;
    }

    const checkpoint = this.recentCheckpoints[checkpointIndex];
    if (!checkpoint) {
      return false;
    }

    this.hydrate({
      ...checkpoint,
      recentCheckpoints: this.recentCheckpoints.slice(0, checkpointIndex + 1)
    });
    return true;
  }

  public getStats(): IndexerStats {
    return {
      currentHeight: this.currentHeight,
      currentBlockHash: this.currentBlockHash,
      processedBlocks: this.processedBlocks,
      trackedNames: this.state.names.size
    };
  }

  public getLaunchHeight(): number {
    return this.launchHeight;
  }

  public exportSnapshot(): InMemoryOntIndexerSnapshot {
    return {
      ...this.createPersistedStateSnapshot(),
      recentCheckpoints: this.recentCheckpoints.map((checkpoint) => structuredClone(checkpoint))
    };
  }

  private hydrate(snapshot: InMemoryOntIndexerSnapshot | InMemoryOntIndexerPersistedState): void {
    this.state.names.clear();
    this.spentOutpoints.clear();
    this.transactionProvenance.clear();

    for (const record of snapshot.names) {
      this.state.names.set(record.name, {
        ...record,
        lastStateHeight:
          typeof record.lastStateHeight === "number" && Number.isFinite(record.lastStateHeight)
            ? record.lastStateHeight
            : record.claimHeight,
        requiredBondSats: BigInt(record.requiredBondSats),
        currentBondValueSats: BigInt(record.currentBondValueSats)
      });
    }

    for (const transaction of snapshot.transactionProvenance) {
      const sanitized = sanitizeTransactionProvenanceSnapshot(transaction);

      if (sanitized.events.length > 0 || sanitized.invalidatedNames.length > 0) {
        this.transactionProvenance.set(sanitized.txid, sanitized);
      }
    }

    for (const spentOutpoint of snapshot.spentOutpoints ?? []) {
      this.spentOutpoints.set(
        `${spentOutpoint.outpointTxid}:${spentOutpoint.outpointVout}`,
        structuredClone(spentOutpoint)
      );
    }

    this.currentHeight = snapshot.currentHeight;
    this.currentBlockHash = snapshot.currentBlockHash;
    this.processedBlocks = snapshot.processedBlocks;
    this.recentCheckpoints = "recentCheckpoints" in snapshot
      ? (snapshot.recentCheckpoints ?? []).map((checkpoint) => structuredClone(checkpoint))
      : [];

    if (snapshot.currentHeight !== null) {
      refreshDerivedState(this.state, snapshot.currentHeight);
      this.reconcileExperimentalAuctionOwnedNames(snapshot.currentHeight);
    }
  }

  private createPersistedStateSnapshot(): InMemoryOntIndexerPersistedState {
    return {
      launchHeight: this.launchHeight,
      currentHeight: this.currentHeight,
      currentBlockHash: this.currentBlockHash,
      processedBlocks: this.processedBlocks,
      names: this.listNames().map((record) => ({
        ...record,
        requiredBondSats: record.requiredBondSats.toString(),
        currentBondValueSats: record.currentBondValueSats.toString()
      })),
      spentOutpoints: [...this.spentOutpoints.values()].sort((left, right) => {
        if (left.spentBlockHeight !== right.spentBlockHeight) {
          return left.spentBlockHeight - right.spentBlockHeight;
        }

        if (left.spentTxIndex !== right.spentTxIndex) {
          return left.spentTxIndex - right.spentTxIndex;
        }

        if (left.spendingInputIndex !== right.spendingInputIndex) {
          return left.spendingInputIndex - right.spendingInputIndex;
        }

        if (left.outpointTxid !== right.outpointTxid) {
          return left.outpointTxid.localeCompare(right.outpointTxid);
        }

        return left.outpointVout - right.outpointVout;
      }),
      transactionProvenance: [...this.transactionProvenance.values()].sort((left, right) => {
        if (left.blockHeight !== right.blockHeight) {
          return left.blockHeight - right.blockHeight;
        }

        if (left.txIndex !== right.txIndex) {
          return left.txIndex - right.txIndex;
        }

        return left.txid.localeCompare(right.txid);
      })
    };
  }

  private pushRecentCheckpoint(): void {
    if (this.currentHeight === null || this.currentBlockHash === null) {
      return;
    }

    const snapshot = this.createPersistedStateSnapshot();
    this.recentCheckpoints = [
      snapshot,
      ...this.recentCheckpoints.filter(
        (checkpoint) =>
          checkpoint.currentHeight !== snapshot.currentHeight || checkpoint.currentBlockHash !== snapshot.currentBlockHash
      )
    ].slice(0, this.recentCheckpointLimit);
  }

  private recordSpentOutpoints(block: BitcoinBlock): void {
    for (const [txIndex, transaction] of block.transactions.entries()) {
      for (const [inputIndex, input] of transaction.inputs.entries()) {
        if (input.coinbase || input.txid === null || input.vout === null) {
          continue;
        }

        const key = `${input.txid}:${input.vout}`;
        if (this.spentOutpoints.has(key)) {
          continue;
        }

        this.spentOutpoints.set(key, {
          outpointTxid: input.txid,
          outpointVout: input.vout,
          spentTxid: transaction.txid,
          spentBlockHeight: block.height,
          spentTxIndex: txIndex,
          spendingInputIndex: inputIndex
        });
      }
    }
  }

  private listAppliedAuctionBidObservations(): ExperimentalLaunchAuctionBidObservation[] {
    return [...this.transactionProvenance.values()]
      .flatMap((transaction) =>
        transaction.events
          .filter(
            (event): event is TransactionProvenanceSnapshot["events"][number] & {
              readonly typeName: "AUCTION_BID";
              readonly validationStatus: "applied";
              readonly payload: ExperimentalAuctionBidPayloadSnapshot;
            } => event.typeName === "AUCTION_BID" && event.validationStatus === "applied"
          )
          .map((event) => ({
            txid: transaction.txid,
            blockHeight: transaction.blockHeight,
            txIndex: transaction.txIndex,
            vout: event.vout,
            normalizedName: event.payload.name,
            unlockBlock: event.payload.unlockBlock,
            bondVout: event.payload.bondVout,
            bidderCommitment: event.payload.bidderCommitment,
            ownerPubkey: event.payload.ownerPubkey,
            bidAmountSats: BigInt(event.payload.bidAmountSats),
            settlementLockBlocks: event.payload.settlementLockBlocks,
            auctionLotCommitment: event.payload.auctionLotCommitment,
            auctionCommitment: event.payload.auctionCommitment,
            spentOutpoints: transaction.inputs
              .filter(
                (input): input is typeof input & { readonly txid: string; readonly vout: number } =>
                  input.coinbase !== true && input.txid !== null && input.vout !== null
              )
              .map((input) => ({
                txid: input.txid,
                vout: input.vout
              }))
          }))
      )
      .sort((left, right) => {
        if (left.blockHeight !== right.blockHeight) {
          return left.blockHeight - right.blockHeight;
        }

        if (left.txIndex !== right.txIndex) {
          return left.txIndex - right.txIndex;
        }

        if (left.vout !== right.vout) {
          return left.vout - right.vout;
        }

        return left.txid.localeCompare(right.txid);
      });
  }

  private deriveExperimentalAuctionStatesAtHeight(currentBlockHeight: number) {
    const bidObservations = this.listAppliedAuctionBidObservations();

    return deriveExperimentalLaunchAuctionStates({
      policy: this.experimentalLaunchAuctionPolicy,
      currentBlockHeight,
      catalog: this.createObservedExperimentalAuctionCatalog(bidObservations),
      bidObservations,
      spentOutpoints: [...this.spentOutpoints.values()]
    });
  }

  private createObservedExperimentalAuctionCatalog(
    bidObservations: readonly ExperimentalLaunchAuctionBidObservation[]
  ): ExperimentalLaunchAuctionCatalogEntry[] {
    const catalog: ExperimentalLaunchAuctionCatalogEntry[] = [...this.experimentalLaunchAuctionCatalog];
    const seenCommitments = new Set(catalog.map((entry) => entry.auctionLotCommitment));
    const latestReleaseHeightByName = this.getLatestReleaseHeightByName();

    for (const observation of bidObservations) {
      if (
        observation.normalizedName === undefined ||
        observation.unlockBlock === undefined ||
        seenCommitments.has(observation.auctionLotCommitment)
      ) {
        continue;
      }

      if (observation.unlockBlock > 0) {
        const latestReleaseHeight = latestReleaseHeightByName.get(observation.normalizedName) ?? null;

        if (latestReleaseHeight !== observation.unlockBlock) {
          continue;
        }
      }

      try {
        const auctionId = getExperimentalLaunchAuctionId({
          name: observation.normalizedName,
          unlockBlock: observation.unlockBlock
        });
        const entry = createExperimentalLaunchAuctionCatalogEntry(
          {
            auctionId,
            title: `Auction · ${observation.normalizedName}`,
            description: "Live auction opened from on-chain bid activity.",
            name: observation.normalizedName,
            auctionClassId: "launch_name",
            unlockBlock: observation.unlockBlock
          },
          this.experimentalLaunchAuctionPolicy
        );

        if (entry.auctionLotCommitment !== observation.auctionLotCommitment) {
          continue;
        }

        catalog.push(entry);
        seenCommitments.add(entry.auctionLotCommitment);
      } catch {
        continue;
      }
    }

    return catalog;
  }

  private getLatestReleaseHeightByName(): Map<string, number> {
    const latestReleaseHeightByName = new Map<string, number>();

    for (const transaction of this.transactionProvenance.values()) {
      for (const name of transaction.invalidatedNames) {
        const normalizedName = normalizeName(name);
        const existing = latestReleaseHeightByName.get(normalizedName) ?? -1;

        if (transaction.blockHeight > existing) {
          latestReleaseHeightByName.set(normalizedName, transaction.blockHeight);
        }
      }
    }

    return latestReleaseHeightByName;
  }

  private reconcileExperimentalAuctionOwnedNames(currentBlockHeight: number): void {
    for (const auctionState of this.deriveExperimentalAuctionStatesAtHeight(currentBlockHeight)) {
      if (
        auctionState.phase !== "settled"
        || auctionState.winnerBidTxid === null
        || auctionState.winnerOwnerPubkey === null
        || auctionState.winnerBidderCommitment === null
        || auctionState.winnerBondVout === null
        || auctionState.settlementHeight === null
        || auctionState.winnerBondReleaseBlock === null
        || auctionState.currentHighestBidSats === null
      ) {
        continue;
      }

      const existingName = this.state.names.get(auctionState.normalizedName) ?? null;
      if (existingName !== null && existingName.status !== "invalid") {
        continue;
      }

      const winningOutcome = [...auctionState.visibleBidOutcomes]
        .reverse()
        .find(
          (outcome) =>
            outcome.status === "accepted"
            && outcome.txid === auctionState.winnerBidTxid
            && outcome.bondVout === auctionState.winnerBondVout
        );

      if (!winningOutcome) {
        continue;
      }

      if (winningOutcome.bondSpendStatus === "spent_before_allowed_release") {
        continue;
      }

      this.state.names.set(auctionState.normalizedName, {
        name: auctionState.normalizedName,
        status: getClaimedNameStatus({
          isRevealConfirmed: true,
          currentHeight: currentBlockHeight,
          maturityHeight: auctionState.winnerBondReleaseBlock,
          continuityIntact: true
        }),
        acquisitionKind: "auction",
        acquisitionAuctionId: auctionState.auctionId,
        acquisitionAuctionLotCommitment: auctionState.auctionLotCommitment,
        acquisitionAuctionBidTxid: auctionState.winnerBidTxid,
        acquisitionAuctionBidderCommitment: auctionState.winnerBidderCommitment,
        acquisitionBondReleaseHeight: auctionState.winnerBondReleaseBlock,
        currentOwnerPubkey: auctionState.winnerOwnerPubkey,
        claimCommitTxid: auctionState.winnerBidTxid,
        claimRevealTxid: auctionState.winnerBidTxid,
        claimHeight: auctionState.settlementHeight,
        maturityHeight: auctionState.winnerBondReleaseBlock,
        requiredBondSats: auctionState.currentHighestBidSats,
        currentBondTxid: auctionState.winnerBidTxid,
        currentBondVout: auctionState.winnerBondVout,
        currentBondValueSats: auctionState.currentHighestBidSats,
        lastStateTxid: auctionState.winnerBidTxid,
        lastStateHeight: auctionState.settlementHeight,
        winningCommitBlockHeight: winningOutcome.blockHeight,
        winningCommitTxIndex: winningOutcome.txIndex
      });
    }
  }
}

function sanitizeTransactionProvenanceSnapshot(
  transaction: TransactionProvenanceSnapshot
): TransactionProvenanceSnapshot {
  const events = transaction.events.filter((event) => {
    if (event.typeName !== "AUCTION_BID") {
      return true;
    }

    const payload = event.payload;
    return (
      "auctionCommitment" in payload
      && typeof payload.name === "string"
      && typeof payload.unlockBlock === "number"
    );
  });

  return events.length === transaction.events.length
    ? transaction
    : {
        ...transaction,
        events
      };
}

function serializeTransactionProvenanceRecord(input: {
  readonly txid: string;
  readonly blockHeight: number;
  readonly txIndex: number;
  readonly inputs: readonly BitcoinTransactionInput[];
  readonly outputs: readonly BitcoinTransactionOutput[];
  readonly events: readonly ProvenanceEventRecord[];
  readonly invalidatedNames: readonly string[];
}): TransactionProvenanceSnapshot {
  return {
    txid: input.txid,
    blockHeight: input.blockHeight,
    txIndex: input.txIndex,
    inputs: input.inputs,
    outputs: input.outputs.map((output) => ({
      ...output,
      valueSats: output.valueSats.toString()
    })),
    events: input.events.map((event) => ({
      ...event,
      payload: serializeProvenancePayload(event.payload)
    })),
    invalidatedNames: [...input.invalidatedNames]
  };
}

function serializeProvenancePayload(
  payload:
    | TransferEventPayload
    | AuctionBidEventPayload
): TransactionProvenanceEventPayloadSnapshot {
  if ("auctionCommitment" in payload) {
    return {
      ...payload,
      bidAmountSats: payload.bidAmountSats.toString()
    };
  }

  return payload;
}
