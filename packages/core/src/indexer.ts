import {
  type BitcoinBlock,
  type BitcoinTransactionInBlock,
  type BitcoinTransactionInput,
  type BitcoinTransactionOutput
} from "@ont/bitcoin";
import {
  type AuctionBidEventPayload,
  NOTICE_WINDOW_BLOCKS,
  OntEventType,
  type RecoverOwnerEventPayload,
  normalizeName,
  type TransferEventPayload
} from "@ont/protocol";

import {
  applyBlockTransactionsWithProvenance,
  createEmptyState,
  type OntState,
  type OntEventApplicationOptions,
  type NameRecord,
  type ProvenanceEventRecord,
  type RecoveryWalletProofAvailabilityRequest,
  refreshDerivedState,
  getClaimedNameStatus
} from "@ont/consensus";
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
import { RootChain } from "./root-anchor.js";
import { type AccumulatorProof, accumulatorKeyForName, verifyAccumulatorProof } from "./accumulator.js";

export interface IndexerStats {
  readonly currentHeight: number | null;
  readonly currentBlockHash: string | null;
  readonly processedBlocks: number;
  readonly trackedNames: number;
}

export type RecoveryWalletProofAvailabilityChecker = (
  request: RecoveryWalletProofAvailabilityRequest
) => boolean;

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

/**
 * One root anchor observed on-chain, recorded as the indexer walks blocks. The
 * `status` reflects whether the anchored `prevRoot -> newRoot` transition extended
 * the confirmed accumulator chain (`applied`) or was rejected (e.g. built on a
 * stale tip). This is the indexer-side observation log for the cheap rail; the
 * confirmed tip is the head of the applied chain. Phase 1 records the chain — it
 * does not yet merge accumulator-claimed names into name state.
 */
export interface RootAnchorObservation {
  readonly txid: string;
  readonly txIndex: number;
  readonly blockHeight: number;
  readonly prevRoot: string;
  readonly newRoot: string;
  readonly batchSize: number;
  readonly status: "applied" | "rejected";
  readonly reason: string;
}

/**
 * One finalized leaf in an accumulator batch: a `name -> ownerPubkey` binding plus
 * the membership proof that binds it to the batch's accumulator root. The indexer
 * VERIFIES this proof against the Bitcoin-anchored `newRoot` — the provider is never
 * trusted, so a lying batch-data source cannot mint ownership.
 */
export interface AccumulatorBatchLeaf {
  readonly name: string;
  readonly ownerPubkey: string;
  readonly proof: AccumulatorProof;
}

/**
 * Pluggable data-availability seam for the cheap rail. Given a confirmed anchor's
 * `newRoot`, returns the batch's finalized leaves (or null if the batch data is not
 * available to this node). In tests this is an in-memory map; in production it is
 * backed by the availability-marker data store / publisher archive. The transport
 * is swappable precisely because the indexer re-verifies every leaf against the root.
 */
export interface AccumulatorBatchDataProvider {
  leavesForRoot(newRoot: string): readonly AccumulatorBatchLeaf[] | null;
}

/**
 * A name owned via the cheap (accumulator) rail. Deliberately NOT a {@link NameRecord}:
 * an accumulator name has no L1 bond / commit-reveal, so it carries only the fields
 * the rail actually establishes — owner, the anchor that finalized it, and the
 * accumulator root the ownership was proven against.
 */
export interface AccumulatorNameRecord {
  readonly name: string;
  readonly normalizedName: string;
  readonly currentOwnerPubkey: string;
  readonly acquisitionKind: "accumulator";
  /** Height of the anchor transaction that recorded this (earliest) claim. */
  readonly claimHeight: number;
  readonly anchorTxid: string;
  /** The accumulator root the membership proof verified against. */
  readonly accumulatorRoot: string;
  /** Leaf key = H(name). */
  readonly leafKey: string;
  /**
   * Block height at which the notice window closes (`claimHeight + NOTICE_WINDOW_BLOCKS`).
   * Before this height the claim is provisional; at/after it the claim finalizes
   * (or nullifies, if `collided`). Persisted so finality survives restart.
   */
  readonly noticeWindowCloseHeight: number;
  /**
   * A competing distinct-owner claim landed within the notice window. Such a name
   * NULLIFIES at window close (Decision #37: a collision denies, never awards) —
   * it resolves to no owner and reopens. Persisted so a nullified name cannot
   * silently un-nullify on snapshot restore.
   */
  readonly collided?: boolean;
}

/** Lifecycle of a cheap-rail name, computed against the current chain height. */
export type AccumulatorFinalityStatus =
  | "provisional" // notice window open, no collision — claimant has priority, not final
  | "collided" // notice window open, a distinct-owner claim landed — will nullify at close
  | "final" // notice window closed uncontested — owned
  | "nullified"; // notice window closed after a collision — no owner, reopens

export interface AccumulatorFinality {
  readonly status: AccumulatorFinalityStatus;
  readonly currentOwnerPubkey: string;
  readonly claimHeight: number;
  readonly noticeWindowCloseHeight: number;
}

/** A name resolved from either rail; L1 ownership takes precedence over the rail. */
export type ResolvedName =
  | { readonly source: "l1"; readonly record: NameRecord }
  | {
      readonly source: "accumulator";
      readonly record: AccumulatorNameRecord;
      /** Notice-window lifecycle of this claim (provisional | final). Nullified
       *  names do not resolve — `resolveName` returns null for them. */
      readonly finality: AccumulatorFinality;
    };

export interface InMemoryOntIndexerPersistedState {
  readonly launchHeight: number;
  readonly currentHeight: number | null;
  readonly currentBlockHash: string | null;
  readonly processedBlocks: number;
  readonly names: readonly NameRecordSnapshot[];
  readonly spentOutpoints?: readonly ExperimentalSpentOutpointObservation[];
  readonly transactionProvenance: readonly TransactionProvenanceSnapshot[];
  readonly rootAnchorObservations?: readonly RootAnchorObservation[];
  readonly accumulatorNames?: readonly AccumulatorNameRecordSnapshot[];
}

// Snapshot/input form: `noticeWindowCloseHeight` is optional because snapshots
// written before the notice window existed lack it — `hydrate` defaults it from
// the claim height. Runtime records always carry it (required on the record).
export interface AccumulatorNameRecordSnapshot extends Omit<AccumulatorNameRecord, "noticeWindowCloseHeight"> {
  readonly noticeWindowCloseHeight?: number;
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
  | ExperimentalAuctionBidPayloadSnapshot
  | RecoverOwnerEventPayload;

export interface TransactionProvenanceEventSnapshot {
  readonly vout: number;
  readonly type: OntEventType;
  readonly typeName:
    | "TRANSFER"
    | "AUCTION_BID"
    | "RECOVER_OWNER";
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
  private readonly recoveryWalletProofAvailable: RecoveryWalletProofAvailabilityChecker | undefined;
  private readonly state: OntState;
  private readonly spentOutpoints: Map<string, ExperimentalSpentOutpointObservation>;
  private readonly transactionProvenance: Map<string, TransactionProvenanceSnapshot>;
  private recentCheckpoints: InMemoryOntIndexerPersistedState[];
  private currentHeight: number | null;
  private currentBlockHash: string | null;
  private processedBlocks: number;
  private rootChain: RootChain;
  private rootAnchorObservations: RootAnchorObservation[];
  private readonly accumulatorNames: Map<string, AccumulatorNameRecord>;
  // Names a claim tried to take AFTER the incumbent's notice window had already
  // closed (it was final) — refused (first-anchor-wins denial protection; see
  // mergeVerifiedLeaves). Observability only; the consensus-relevant collision
  // state lives on the record's `collided` flag, which is persisted. In-memory.
  private readonly refusedTakeoverNames: Set<string>;
  private readonly batchDataProvider: AccumulatorBatchDataProvider | undefined;

  public constructor(input: {
    launchHeight: number;
    recentCheckpointLimit?: number;
    experimentalLaunchAuctionCatalog?: readonly ExperimentalLaunchAuctionCatalogEntry[];
    experimentalLaunchAuctionPolicy?: LaunchAuctionPolicy;
    recoveryWalletProofAvailable?: RecoveryWalletProofAvailabilityChecker;
    batchDataProvider?: AccumulatorBatchDataProvider;
  }) {
    this.launchHeight = input.launchHeight;
    this.recentCheckpointLimit = Math.max(1, input.recentCheckpointLimit ?? 100);
    this.experimentalLaunchAuctionCatalog = [...(input.experimentalLaunchAuctionCatalog ?? [])];
    this.experimentalLaunchAuctionPolicy =
      input.experimentalLaunchAuctionPolicy ?? createDefaultLaunchAuctionPolicy();
    this.recoveryWalletProofAvailable = input.recoveryWalletProofAvailable;
    this.state = createEmptyState();
    this.spentOutpoints = new Map();
    this.transactionProvenance = new Map();
    this.recentCheckpoints = [];
    this.currentHeight = null;
    this.currentBlockHash = null;
    this.processedBlocks = 0;
    this.rootChain = new RootChain();
    this.rootAnchorObservations = [];
    this.accumulatorNames = new Map();
    this.refusedTakeoverNames = new Set();
    this.batchDataProvider = input.batchDataProvider;
  }

  public static fromSnapshot(
    snapshot: InMemoryOntIndexerSnapshot,
    options?: {
      readonly experimentalLaunchAuctionCatalog?: readonly ExperimentalLaunchAuctionCatalogEntry[];
      readonly experimentalLaunchAuctionPolicy?: LaunchAuctionPolicy;
      readonly recoveryWalletProofAvailable?: RecoveryWalletProofAvailabilityChecker;
      readonly batchDataProvider?: AccumulatorBatchDataProvider;
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
        : { experimentalLaunchAuctionPolicy: options.experimentalLaunchAuctionPolicy }),
      ...(options?.recoveryWalletProofAvailable === undefined
        ? {}
        : { recoveryWalletProofAvailable: options.recoveryWalletProofAvailable }),
      ...(options?.batchDataProvider === undefined
        ? {}
        : { batchDataProvider: options.batchDataProvider })
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

    const applicationOptions: OntEventApplicationOptions =
      this.recoveryWalletProofAvailable === undefined
        ? {}
        : { recoveryWalletProofAvailable: this.recoveryWalletProofAvailable };
    const provenance = applyBlockTransactionsWithProvenance(
      this.state,
      transactions,
      this.launchHeight,
      applicationOptions
    );
    refreshDerivedState(this.state, block.height);
    this.recordSpentOutpoints(block);
    this.applyRootAnchors(block);

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

  /**
   * The current confirmed accumulator root — the head of the anchored root chain
   * after applying every observed root anchor in Bitcoin order. Starts at the
   * empty-accumulator genesis root until the first valid anchor lands.
   */
  public getConfirmedAccumulatorRoot(): string {
    return this.rootChain.currentTip();
  }

  /** Count of root anchors that successfully extended the confirmed chain. */
  public getAppliedRootAnchorCount(): number {
    return this.rootChain.anchorCount();
  }

  /** The full observation log of root anchors seen on-chain (applied and rejected). */
  public listRootAnchorObservations(): readonly RootAnchorObservation[] {
    return this.rootAnchorObservations.map((observation) => ({ ...observation }));
  }

  /**
   * The cheap-rail claim record for a name, if one exists, verified against the
   * anchored root. NOTE: a returned record may be provisional or even nullified —
   * use {@link classifyAccumulatorName} for finality. {@link resolveName} applies
   * that finality (a nullified name resolves to no owner).
   */
  public getAccumulatorName(name: string): AccumulatorNameRecord | null {
    return this.accumulatorNames.get(normalizeName(name)) ?? null;
  }

  /**
   * Where a cheap-rail name sits in its notice-window lifecycle at the current
   * chain height: provisional → final (uncontested) or collided → nullified
   * (a distinct-owner claim landed in the window). Null if the name has no
   * cheap-rail claim. See Decision #37.
   */
  public classifyAccumulatorName(name: string): AccumulatorFinality | null {
    const record = this.accumulatorNames.get(normalizeName(name));
    if (record === undefined) {
      return null;
    }
    return this.accumulatorFinalityOf(record);
  }

  private accumulatorFinalityOf(record: AccumulatorNameRecord): AccumulatorFinality {
    // Window anchored on the claim height; "now" is the highest processed block
    // (or the claim height itself before any later block is processed).
    const height = this.currentHeight ?? record.claimHeight;
    const windowClosed = height >= record.noticeWindowCloseHeight;
    const status: AccumulatorFinalityStatus = record.collided === true
      ? (windowClosed ? "nullified" : "collided")
      : (windowClosed ? "final" : "provisional");
    return {
      status,
      currentOwnerPubkey: record.currentOwnerPubkey,
      claimHeight: record.claimHeight,
      noticeWindowCloseHeight: record.noticeWindowCloseHeight
    };
  }

  /**
   * Names a claim tried to take after the incumbent's notice window had already
   * closed (final) — refused. The incumbent owner is unchanged. Observability.
   */
  public listRefusedTakeoverNames(): string[] {
    return [...this.refusedTakeoverNames].sort();
  }

  public listAccumulatorNames(): AccumulatorNameRecord[] {
    return [...this.accumulatorNames.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  /**
   * Resolve a name across both rails. An L1 record (auction / direct) takes
   * precedence over an accumulator record for the same name — the bonded core wins
   * any collision, so the cheap rail can never override a name settled on L1.
   */
  public resolveName(name: string): ResolvedName | null {
    const l1 = this.getName(name);
    if (l1 !== null) {
      return { source: "l1", record: l1 };
    }
    const accumulator = this.accumulatorNames.get(normalizeName(name));
    if (accumulator !== undefined) {
      const finality = this.accumulatorFinalityOf(accumulator);
      // A nullified name (collision + window closed) resolves to NO owner and
      // reopens — it must not appear owned. Provisional/final both resolve to
      // the claimant; the caller reads `finality.status` to distinguish them.
      if (finality.status === "nullified") {
        return null;
      }
      return { source: "accumulator", record: accumulator, finality };
    }
    return null;
  }

  /**
   * The reverse of {@link resolveName}: all names this node resolves to a given
   * owner pubkey, across BOTH rails (L1 name records + accumulator-claimed names).
   * This is the authoritative, chain-derived, cross-publisher source a wallet uses
   * to rediscover which HD key indices it occupies from the seed alone (gap-scan) —
   * unlike a single publisher's view, which only sees what that operator anchored.
   * L1 precedence holds: a name covered by an L1 record is reported as L1 and not
   * double-listed from the accumulator.
   */
  public namesOwnedBy(ownerPubkey: string): ReadonlyArray<{ readonly name: string; readonly source: "l1" | "accumulator" }> {
    const target = ownerPubkey.toLowerCase();
    const out: { name: string; source: "l1" | "accumulator" }[] = [];
    for (const record of this.state.names.values()) {
      if (record.currentOwnerPubkey.toLowerCase() === target) {
        out.push({ name: record.name, source: "l1" });
      }
    }
    for (const record of this.accumulatorNames.values()) {
      if (record.currentOwnerPubkey.toLowerCase() === target && !this.state.names.has(record.normalizedName)) {
        out.push({ name: record.name, source: "accumulator" });
      }
    }
    return out.sort((left, right) => left.name.localeCompare(right.name));
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

    // Rebuild the root chain by replaying observed anchors in order. apply() is
    // deterministic, so the reconstructed tip/height match the original exactly
    // (rejected anchors re-reject and leave the tip unchanged).
    this.rootChain = new RootChain();
    this.rootAnchorObservations = [];
    for (const observation of snapshot.rootAnchorObservations ?? []) {
      this.rootAnchorObservations.push({ ...observation });
      this.rootChain.apply({
        prevRoot: observation.prevRoot,
        newRoot: observation.newRoot,
        batchSize: observation.batchSize
      });
    }

    // Accumulator names were verified against their anchored root before they were
    // persisted, so restore them directly (same trust model as the L1 `names` map).
    // The notice-window finality fields (noticeWindowCloseHeight, collided) ride
    // ON the record, so finality survives the restore. Older snapshots predating
    // the window default the close height from the claim height.
    this.accumulatorNames.clear();
    // The refused-takeover set is observability only, re-derived as anchors
    // replay; clear it so it can't carry stale entries across a rewind.
    this.refusedTakeoverNames.clear();
    for (const record of snapshot.accumulatorNames ?? []) {
      this.accumulatorNames.set(record.normalizedName, {
        ...record,
        noticeWindowCloseHeight:
          record.noticeWindowCloseHeight ?? record.claimHeight + NOTICE_WINDOW_BLOCKS
      });
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
      }),
      // Already in Bitcoin order (appended as blocks/txs are walked).
      rootAnchorObservations: this.rootAnchorObservations.map((observation) => ({ ...observation })),
      accumulatorNames: this.listAccumulatorNames().map((record) => ({ ...record }))
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

  /**
   * Walk the block's root anchors in transaction order, extend the confirmed root
   * chain where each anchor's `prevRoot` matches the current tip, and append every
   * anchor (applied or rejected) to the observation log. A stale or forged parent
   * link leaves the tip unchanged — the R2 stale-root-chaining hazard.
   */
  private applyRootAnchors(block: BitcoinBlock): void {
    for (const entry of this.rootChain.applyBlock(block)) {
      this.rootAnchorObservations.push({
        txid: entry.txid,
        txIndex: entry.txIndex,
        blockHeight: block.height,
        prevRoot: entry.anchor.prevRoot,
        newRoot: entry.anchor.newRoot,
        batchSize: entry.anchor.batchSize,
        status: entry.result.status,
        reason: entry.result.reason
      });
      if (entry.result.status === "applied") {
        this.mergeAccumulatorBatch(entry.anchor.newRoot, entry.txid, block.height);
      }
    }
  }

  /**
   * For an anchor that just extended the confirmed chain, pull the batch's finalized
   * leaves and merge the ones that VERIFY against the anchored `newRoot` into the
   * accumulator-name map. Each leaf must (1) carry a membership proof whose key is
   * H(name), (2) bind the claimed owner as the proof value, and (3) verify against
   * `newRoot`. The provider is untrusted — a forged or stale leaf simply fails to
   * verify and is dropped. No provider configured → the chain is observed only.
   */
  private mergeAccumulatorBatch(newRoot: string, anchorTxid: string, blockHeight: number): void {
    if (this.batchDataProvider === undefined) {
      return;
    }
    const leaves = this.batchDataProvider.leavesForRoot(newRoot);
    if (leaves === null || leaves === undefined) {
      return;
    }
    this.mergeVerifiedLeaves(newRoot, anchorTxid, blockHeight, leaves);
  }

  /**
   * Merge only the leaves that VERIFY against the anchored root: leaf key = H(name),
   * proof value = claimed owner, and the membership proof checks out against
   * `newRoot`. A forged/mismatched leaf is dropped. Returns the count merged.
   */
  private mergeVerifiedLeaves(
    newRoot: string,
    anchorTxid: string,
    blockHeight: number,
    leaves: readonly AccumulatorBatchLeaf[]
  ): number {
    let merged = 0;
    for (const leaf of leaves) {
      let normalizedName: string;
      try {
        normalizedName = normalizeName(leaf.name);
      } catch {
        continue; // not a valid ONT name
      }
      const leafKey = accumulatorKeyForName(normalizedName);
      const value = leaf.proof.value;
      const ownerMatches =
        typeof value === "string" && value.toLowerCase() === leaf.ownerPubkey.toLowerCase();
      if (
        leaf.proof.keyHex.toLowerCase() !== leafKey
        || !ownerMatches
        || !/^[0-9a-fA-F]{64}$/.test(leaf.ownerPubkey)
        || !verifyAccumulatorProof(newRoot, leaf.proof)
      ) {
        continue; // unverifiable against the anchored root — ignore
      }
      const ownerLower = leaf.ownerPubkey.toLowerCase();
      const existing = this.accumulatorNames.get(normalizedName);

      if (existing !== undefined) {
        // The notice window is OPEN while blockHeight is strictly below the close
        // height and CLOSED at/after it — the exact boundary accumulatorFinalityOf
        // uses (height >= closeHeight ⇒ closed). Using `<` here (not `<=`) keeps
        // the two in lockstep: a claim landing in the close block is too late to
        // collide and meets an already-final name, not a still-open window.
        const windowOpen = blockHeight < existing.noticeWindowCloseHeight;
        const sameOwner = existing.currentOwnerPubkey === ownerLower;

        if (windowOpen) {
          if (sameOwner) {
            // Same owner re-anchoring while provisional (idempotent). Keep the
            // window anchored on the EARLIEST claim so a re-anchor can't reset it.
            if (blockHeight < existing.claimHeight) {
              this.accumulatorNames.set(normalizedName, {
                ...existing,
                claimHeight: blockHeight,
                anchorTxid,
                accumulatorRoot: newRoot.toLowerCase(),
                noticeWindowCloseHeight: blockHeight + NOTICE_WINDOW_BLOCKS
              });
            }
            merged += 1;
            continue;
          }
          // Distinct-owner claim inside the window — a genuine collision. Neither
          // awards; the name NULLIFIES at window close (Decision #37). Persist the
          // flag so finality survives restart.
          if (existing.collided !== true) {
            this.accumulatorNames.set(normalizedName, { ...existing, collided: true });
          }
          continue;
        }

        // Window closed.
        if (existing.collided !== true) {
          // The name is FINAL. A later distinct-owner claim cannot take it
          // (first-anchor-wins denial protection); a same-owner re-anchor is a
          // harmless no-op.
          if (sameOwner) {
            merged += 1;
          } else {
            this.refusedTakeoverNames.add(normalizedName);
          }
          continue;
        }
        // The name NULLIFIED (in-window collision, window now closed) and has
        // REOPENED for claiming (Decision #37). This claim is a fresh start — fall
        // through to replace the dead record with a new provisional claim.
        this.refusedTakeoverNames.delete(normalizedName);
      }

      this.accumulatorNames.set(normalizedName, {
        name: leaf.name,
        normalizedName,
        currentOwnerPubkey: ownerLower,
        acquisitionKind: "accumulator",
        claimHeight: blockHeight,
        anchorTxid,
        accumulatorRoot: newRoot.toLowerCase(),
        leafKey,
        noticeWindowCloseHeight: blockHeight + NOTICE_WINDOW_BLOCKS
      });
      merged += 1;
    }
    return merged;
  }

  /**
   * Apply externally-fetched batch leaves for an anchored root — the production
   * data-availability path: the resolver fetches the bytes from a publisher/mirror
   * and hands them in here. We only accept a root the indexer ALREADY observed as an
   * *applied* on-chain anchor (so a caller can't inject names against an unanchored
   * root), then merge only the leaves that verify against it. Returns the count
   * merged. Consensus-safe regardless of transport — every leaf is checked against
   * Bitcoin-anchored state.
   */
  public applyBatchData(newRoot: string, leaves: readonly AccumulatorBatchLeaf[]): number {
    const root = newRoot.toLowerCase();
    const anchor = this.rootAnchorObservations.find(
      (observation) => observation.status === "applied" && observation.newRoot.toLowerCase() === root
    );
    if (anchor === undefined) {
      return 0; // not an anchored, applied root — refuse
    }
    return this.mergeVerifiedLeaves(root, anchor.txid, anchor.blockHeight, leaves);
  }

  /** Applied-anchor roots with no accumulator names merged yet — the DA fetch work-list. */
  public unresolvedAnchorRoots(): string[] {
    const merged = new Set<string>();
    for (const record of this.accumulatorNames.values()) {
      merged.add(record.accumulatorRoot.toLowerCase());
    }
    const roots: string[] = [];
    const seen = new Set<string>();
    for (const observation of this.rootAnchorObservations) {
      if (observation.status !== "applied") continue;
      const root = observation.newRoot.toLowerCase();
      if (seen.has(root) || merged.has(root)) continue;
      seen.add(root);
      roots.push(root);
    }
    return roots;
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
    | RecoverOwnerEventPayload
): TransactionProvenanceEventPayloadSnapshot {
  if ("auctionCommitment" in payload) {
    return {
      ...payload,
      bidAmountSats: payload.bidAmountSats.toString()
    };
  }

  return payload;
}
