import {
  type BitcoinTransactionInBlock,
  type BitcoinTransactionInput,
  type BitcoinTransactionOutput,
  getOpReturnPayloads
} from "@ont/bitcoin";
import {
  sha256Hex,
  utf8ToBytes,
} from "@ont/protocol";
import {
  type AuctionBidEvent,
  EventType,
  type RecoverOwnerEvent,
  type RootAnchorEvent,
  type TransferEvent,
  decodeEvent,
  recoverAuthDigest,
  transferAuthDigest,
  verifySchnorr
} from "@ont/wire";

import { getClaimedNameStatus } from "./state.js";
import { evidenceBindsToAnchor, type ServedEvidence } from "./da-verdict.js";
import { modeAt, type AvailabilityMode, type LaunchParams } from "./params.js";
import {
  acceptRecoverOwner,
  type RecoveryDescriptorEvidence,
  type RecoveryParams,
} from "./recovery-invoke-authority.js";

const RECOVER_OWNER_FLAG_CANCEL = 0x01;
const RAW_BATCH_MATERIAL_KEYS = ["baseLeaves", "servedLeaves"] as const;

export type AcquisitionKind = "accumulator-batched" | "bonded" | "auction";
export const ASSURANCE_TIERS = [
  "receipt-only",
  "accumulator-batched",
  "checkpointed",
  "bitcoin-anchored-priority",
] as const;
export type AssuranceTier = (typeof ASSURANCE_TIERS)[number];

export interface AccumulatorBatchedAssuranceProvenance {
  readonly tier: "accumulator-batched";
  readonly availabilityMode: AvailabilityMode;
  readonly priorityBearing: false;
  readonly finalizedAtHeight: number | null;
  readonly anchorHeight: number;
}
export type AssuranceProvenance =
  | AccumulatorBatchedAssuranceProvenance;

interface BaseNameRecord {
  readonly name: string;
  readonly status: "pending" | "immature" | "mature" | "invalid";
  readonly currentOwnerPubkey: string;
  readonly pendingRecovery?: PendingRecoveryRecord;
  readonly acquisitionKind: AcquisitionKind;
  readonly lastStateTxid: string;
  readonly lastStateHeight: number;
  readonly winningCommitBlockHeight: number;
  readonly winningCommitTxIndex: number;
}

export interface AccumulatorBatchedNameRecord extends BaseNameRecord {
  readonly acquisitionKind: "accumulator-batched";
  readonly firstServableHeight: number;
  readonly anchoredRoot: string;
  readonly leafKeyHex: string;
  readonly assuranceProvenance: AccumulatorBatchedAssuranceProvenance;
}

export interface BondBackedNameRecord extends BaseNameRecord {
  readonly acquisitionKind: "bonded" | "auction";
  readonly acquisitionAuctionId?: string;
  readonly acquisitionAuctionLotCommitment?: string;
  readonly acquisitionAuctionBidTxid?: string;
  readonly acquisitionAuctionBidderCommitment?: string;
  readonly acquisitionBondReleaseHeight?: number;
  readonly claimCommitTxid: string;
  readonly claimRevealTxid: string;
  readonly claimHeight: number;
  readonly maturityHeight: number;
  readonly requiredBondSats: bigint;
  readonly currentBondTxid: string;
  readonly currentBondVout: number;
  readonly currentBondValueSats: bigint;
}

export type NameRecord = AccumulatorBatchedNameRecord | BondBackedNameRecord;

export interface PendingRecoveryRecord {
  readonly requestedTxid: string;
  readonly requestedHeight: number;
  readonly finalizeHeight: number;
  readonly proposedOwnerPubkey: string;
  readonly predecessorStateTxid: string;
  readonly recoveryDescriptorHash: string;
  readonly challengeWindowBlocks: number;
}

export interface ParsedOntEvent {
  readonly txid: string;
  readonly blockHeight: number;
  readonly txIndex: number;
  readonly vout: number;
  readonly inputs: readonly BitcoinTransactionInput[];
  readonly outputs: readonly BitcoinTransactionOutput[];
  readonly type: EventType.Transfer | EventType.AuctionBid | EventType.RecoverOwner | EventType.RootAnchor;
  readonly payload:
    | TransferEvent
    | AuctionBidEvent
    | RecoverOwnerEvent
    | RootAnchorEvent;
}

export interface ProvenanceEventRecord {
  vout: number;
  type: EventType.Transfer | EventType.AuctionBid | EventType.RecoverOwner | EventType.RootAnchor;
  typeName:
    | "TRANSFER"
    | "AUCTION_BID"
    | "RECOVER_OWNER"
    | "ROOT_ANCHOR";
  payload:
    | TransferEvent
    | AuctionBidEvent
    | RecoverOwnerEvent
    | RootAnchorEvent;
  validationStatus: "applied" | "ignored";
  reason: string;
  affectedName: string | null;
}

export interface TransactionProvenanceRecord {
  readonly txid: string;
  readonly blockHeight: number;
  readonly txIndex: number;
  readonly inputs: readonly BitcoinTransactionInput[];
  readonly outputs: readonly BitcoinTransactionOutput[];
  readonly events: readonly ProvenanceEventRecord[];
  readonly invalidatedNames: readonly string[];
}

export interface OntState {
  readonly names: Map<string, NameRecord>;
}

export interface ResolvedBatchEntry {
  readonly name: string;
  readonly ownerPubkey: string;
}

export interface ResolvedBatchMaterial {
  readonly committedEntries: readonly ResolvedBatchEntry[];
}

export interface ResolvedBlockEvidence {
  readonly batchMaterialByAnchor: ReadonlyMap<string, ResolvedBatchMaterial>;
  readonly availabilityByAnchor: ReadonlyMap<string, ServedEvidence>;
  readonly recovery?: {
    readonly byName: ReadonlyMap<string, ResolvedRecoveryDescriptorState>;
    readonly params: RecoveryParams;
  };
}

export interface ConfirmedBlock {
  readonly height: number;
  readonly txs: readonly BitcoinTransactionInBlock[];
}

export interface ReduceResult {
  readonly state: OntState;
  readonly provenance: readonly TransactionProvenanceRecord[];
}

/**
 * Verifier-resolved recovery descriptor-chain facts for a name — descriptor-chain EVIDENCE, NOT
 * kernel state (the kernel never tracks an armed head / interval; #50-b1 + §3c). The evidence layer
 * (indexer / @ont/evidence) resolves the current armed descriptor head and ownership interval from
 * witnessed W15 posts; the kernel checks the invoke's referenced descriptor against these via
 * acceptRecoverOwner (R3 head hash, R3' head sequence, R4 current-interval ownershipRef). Absence
 * or mismatch makes the invoke an ignored no-op (fail closed).
 */
export interface ResolvedRecoveryDescriptorState {
  /** The candidate descriptor the invoke references (its §8.2a record) + the §3c witness. */
  readonly descriptorEvidence: RecoveryDescriptorEvidence;
  /** Digest of the name's CURRENT armed descriptor head (R3). */
  readonly recoveryDescriptorHeadHash: string;
  /** Sequence of the current armed descriptor head (R3' companion). */
  readonly recoveryDescriptorHeadSequence: number;
  /** The name's current ownership-interval ref (R4 anti old-interval-replay). */
  readonly currentOwnershipRef: string;
}

export interface OntEventApplicationOptions {
  /**
   * Witnessed recovery descriptor evidence keyed by name, plus the launch-freeze recovery params
   * (W_r). The caller (indexer / evidence layer) PRE-RESOLVES this as DATA; the kernel consumes it
   * purely — no evaluation-time availability callback (G6 / R19). Absent name = ignored invoke.
   */
  readonly recoveryEvidence?: {
    readonly byName: ReadonlyMap<string, ResolvedRecoveryDescriptorState>;
    readonly params: RecoveryParams;
  };
  /**
   * Reducer-only RootAnchor evidence seam. The evidence/indexer layer has already
   * accepted the batch and resolved it to deltas; the reducer consumes that data
   * and never reaches back to raw BatchMaterial leaf maps.
   */
  readonly rootAnchorEvidence?: ResolvedBlockEvidence;
  /**
   * The consensus availability mode resolved for the block being reduced. Direct
   * apply callers that do not provide it cannot mint RootAnchor name state.
   */
  readonly availabilityMode?: AvailabilityMode;
}

export function createEmptyState(): OntState {
  return {
    names: new Map()
  };
}

export function reduceBlock(
  prior: OntState,
  block: ConfirmedBlock,
  evidence: ResolvedBlockEvidence,
  params: LaunchParams
): ReduceResult {
  const availabilityMode = modeAt(block.height, params);
  return reduceBlockAtMode(prior, block, evidence, params, availabilityMode);
}

function reduceBlockAtMode(
  prior: OntState,
  block: ConfirmedBlock,
  evidence: ResolvedBlockEvidence,
  params: LaunchParams,
  _availabilityMode: AvailabilityMode
): ReduceResult {
  const options: OntEventApplicationOptions = evidence.recovery === undefined
    ? { rootAnchorEvidence: evidence, availabilityMode: _availabilityMode }
    : { recoveryEvidence: evidence.recovery, rootAnchorEvidence: evidence, availabilityMode: _availabilityMode };
  const provenance = applyBlockTransactionsWithProvenance(prior, block.txs, params.launchHeight, options);
  refreshDerivedState(prior, block.height);
  return { state: prior, provenance };
}

export function extractOntEvents(
  transaction: BitcoinTransactionInBlock,
  options: { readonly includeRootAnchors?: boolean } = {}
): ParsedOntEvent[] {
  return getOpReturnPayloads(transaction.tx).flatMap(({ vout, payload }) => {
    try {
      const decoded = decodeEvent(payload);

      if (decoded.type === EventType.RootAnchor && options.includeRootAnchors !== true) {
        return [];
      }

      return [
        {
          txid: transaction.tx.txid,
          blockHeight: transaction.blockHeight,
          txIndex: transaction.txIndex,
          vout,
          inputs: transaction.tx.inputs,
          outputs: transaction.tx.outputs,
          type: decoded.type as ParsedOntEvent["type"],
          payload: decoded
        }
      ];
    } catch {
      return [];
    }
  });
}

export function applyBlockTransactions(
  state: OntState,
  transactions: readonly BitcoinTransactionInBlock[],
  launchHeight: number,
  options: OntEventApplicationOptions = {}
): OntState {
  applyBlockTransactionsWithProvenance(state, transactions, launchHeight, options);
  return state;
}

export function applyBlockTransactionsWithProvenance(
  state: OntState,
  transactions: readonly BitcoinTransactionInBlock[],
  _launchHeight: number,
  options: OntEventApplicationOptions = {}
): TransactionProvenanceRecord[] {
  let currentBlockHeight: number | null = null;
  let blockTransactions: BitcoinTransactionInBlock[] = [];
  const provenance: TransactionProvenanceRecord[] = [];

  for (const transaction of transactions) {
    if (currentBlockHeight !== null && transaction.blockHeight !== currentBlockHeight) {
      provenance.push(...applySingleBlockTransactions(state, blockTransactions, options));
      blockTransactions = [];
    }

    currentBlockHeight = transaction.blockHeight;
    blockTransactions.push(transaction);
  }

  if (blockTransactions.length > 0) {
    provenance.push(...applySingleBlockTransactions(state, blockTransactions, options));
  }

  return provenance;
}

export function refreshDerivedState(state: OntState, currentHeight: number): OntState {
  for (const [name, record] of state.names.entries()) {
    if (!isBondBackedRecord(record)) {
      const finalizedAtHeight = currentHeight >= record.firstServableHeight
        ? record.firstServableHeight
        : null;
      state.names.set(name, {
        ...record,
        status: record.status === "invalid"
          ? "invalid"
          : finalizedAtHeight !== null ? "mature" : "pending",
        assuranceProvenance: {
          ...record.assuranceProvenance,
          finalizedAtHeight,
        },
      });
      continue;
    }

    const continuityIntact = record.status !== "invalid";
    const finalizedRecovery =
      continuityIntact && record.pendingRecovery !== undefined && currentHeight >= record.pendingRecovery.finalizeHeight
        ? record.pendingRecovery
        : null;

    const refreshed = {
      ...record,
      status: getClaimedNameStatus({
        isRevealConfirmed: true,
        currentHeight,
        maturityHeight: record.maturityHeight,
        continuityIntact
      })
    };

    if (finalizedRecovery === null) {
      state.names.set(name, refreshed);
      continue;
    }

    state.names.set(name, {
      ...withoutPendingRecovery(refreshed),
      currentOwnerPubkey: finalizedRecovery.proposedOwnerPubkey,
      lastStateTxid: finalizedRecovery.requestedTxid,
      lastStateHeight: finalizedRecovery.finalizeHeight
    });
  }

  return state;
}

interface EventApplicationResult {
  readonly validationStatus: "applied" | "ignored";
  readonly reason: string;
  readonly affectedName: string | null;
}

function applyEvent(
  state: OntState,
  event: ParsedOntEvent,
  options: OntEventApplicationOptions
): EventApplicationResult {
  switch (event.type) {
    case EventType.Transfer:
      return applyTransfer(state, event);
    case EventType.AuctionBid:
      return applyAuctionBid(
        state,
        event as ParsedOntEvent & {
          readonly type: EventType.AuctionBid;
          readonly payload: AuctionBidEvent;
        }
      );
    case EventType.RecoverOwner:
      return applyRecoverOwner(
        state,
        event as ParsedOntEvent & {
          readonly type: EventType.RecoverOwner;
          readonly payload: RecoverOwnerEvent;
        },
        options
      );
    case EventType.RootAnchor:
      return applyRootAnchorCandidate(
        state,
        event as ParsedOntEvent & {
          readonly type: EventType.RootAnchor;
          readonly payload: RootAnchorEvent;
        },
        options.rootAnchorEvidence,
        options.availabilityMode
      );
  }

  throw new Error("unreachable event type");
}

function applySingleBlockTransactions(
  state: OntState,
  transactions: readonly BitcoinTransactionInBlock[],
  options: OntEventApplicationOptions
): TransactionProvenanceRecord[] {
  if (transactions.length === 0) {
    return [];
  }

  const blockHeight = transactions[0]?.blockHeight;

  if (blockHeight === undefined) {
    return [];
  }

  const provenanceRecords = transactions.map(createTransactionProvenanceRecord);
  const provenanceByTxid = new Map(provenanceRecords.map((record) => [record.txid, record]));

  for (const transaction of transactions) {
    const txProvenance = provenanceByTxid.get(transaction.tx.txid);

    if (txProvenance === undefined) {
      throw new Error(`missing provenance record for transaction ${transaction.tx.txid}`);
    }

    const spentImmatureBonds = collectSpentImmatureBonds(state, transaction);

    for (const event of extractOntEvents(transaction, { includeRootAnchors: options.rootAnchorEvidence !== undefined })) {
      txProvenance.events.push(createProvenanceEventRecord(event, applyEvent(state, event, options)));
    }

    txProvenance.invalidatedNames.push(
      ...invalidateBrokenBondContinuity(state, transaction, spentImmatureBonds)
    );
  }

  return provenanceRecords.filter(
    (record) => record.events.length > 0 || record.invalidatedNames.length > 0
  );
}

function hasForbiddenRawLeafField(value: unknown): boolean {
  if (value === null || typeof value !== "object") {
    return false;
  }

  return RAW_BATCH_MATERIAL_KEYS.some((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function evidenceCarriesRawBatchMaterial(evidence: ResolvedBlockEvidence): boolean {
  if (hasForbiddenRawLeafField(evidence)) {
    return true;
  }

  for (const material of evidence.batchMaterialByAnchor.values()) {
    if (hasForbiddenRawLeafField(material)) {
      return true;
    }
  }

  return false;
}

function applyRootAnchorCandidate(
  state: OntState,
  event: ParsedOntEvent & { readonly type: EventType.RootAnchor; readonly payload: RootAnchorEvent },
  evidence: ResolvedBlockEvidence | undefined,
  availabilityMode: AvailabilityMode | undefined
): EventApplicationResult {
  if (evidence === undefined) {
    return {
      validationStatus: "ignored",
      reason: "root_anchor_no_resolved_evidence",
      affectedName: null
    };
  }

  if (availabilityMode === undefined) {
    return {
      validationStatus: "ignored",
      reason: "root_anchor_no_availability_mode",
      affectedName: null
    };
  }

  if (availabilityMode !== "O1-collapsed") {
    return {
      validationStatus: "ignored",
      reason: "root_anchor_availability_mode_unimplemented",
      affectedName: null
    };
  }

  if (evidenceCarriesRawBatchMaterial(evidence)) {
    return {
      validationStatus: "ignored",
      reason: "root_anchor_raw_material_rejected",
      affectedName: null
    };
  }

  const anchor = {
    minedHeight: event.blockHeight,
    anchoredRoot: event.payload.newRoot,
    batchSize: event.payload.batchSize
  };
  const material = evidence.batchMaterialByAnchor.get(anchor.anchoredRoot);

  if (material === undefined) {
    return {
      validationStatus: "ignored",
      reason: "root_anchor_no_resolved_material",
      affectedName: null
    };
  }

  if (event.payload.batchSize === 0 || material.committedEntries.length === 0) {
    return {
      validationStatus: "ignored",
      reason: "root_anchor_empty_committed_set",
      affectedName: null
    };
  }

  if (material.committedEntries.length !== event.payload.batchSize) {
    return {
      validationStatus: "ignored",
      reason: "root_anchor_batch_size_mismatch",
      affectedName: null
    };
  }

  const availability = evidence.availabilityByAnchor.get(anchor.anchoredRoot);
  if (availability === undefined) {
    return {
      validationStatus: "ignored",
      reason: "root_anchor_no_availability_evidence",
      affectedName: null
    };
  }

  if (!evidenceBindsToAnchor(anchor, availability)) {
    return {
      validationStatus: "ignored",
      reason: "root_anchor_availability_mismatch",
      affectedName: null
    };
  }

  if (availability.firstServableHeight !== anchor.minedHeight) {
    return {
      validationStatus: "ignored",
      reason: "root_anchor_o1_first_servable_height_mismatch",
      affectedName: null
    };
  }

  const records = material.committedEntries.map((entry) => {
    const leafKeyHex = sha256Hex(utf8ToBytes(entry.name));
    return {
      name: entry.name,
      status: "pending" as const,
      currentOwnerPubkey: entry.ownerPubkey,
      acquisitionKind: "accumulator-batched" as const,
      firstServableHeight: availability.firstServableHeight,
      anchoredRoot: anchor.anchoredRoot,
      leafKeyHex,
      assuranceProvenance: {
        tier: "accumulator-batched",
        availabilityMode,
        priorityBearing: false,
        finalizedAtHeight: null,
        anchorHeight: anchor.minedHeight,
      },
      lastStateTxid: initialAccumulatorHeadTxid(event.txid, leafKeyHex),
      lastStateHeight: event.blockHeight,
      winningCommitBlockHeight: event.blockHeight,
      winningCommitTxIndex: event.txIndex,
    } satisfies AccumulatorBatchedNameRecord;
  });
  const seenNames = new Set<string>();
  for (const record of records) {
    if (seenNames.has(record.name)) {
      return {
        validationStatus: "ignored",
        reason: "root_anchor_duplicate_committed_name",
        affectedName: record.name
      };
    }
    seenNames.add(record.name);

    if (state.names.has(record.name)) {
      return {
        validationStatus: "ignored",
        reason: "root_anchor_name_already_claimed",
        affectedName: record.name
      };
    }
  }

  for (const record of records) {
    state.names.set(record.name, record);
  }

  return {
    validationStatus: "applied",
    reason: "root_anchor_batch_minted",
    affectedName: null
  };
}

function initialAccumulatorHeadTxid(anchorTxid: string, leafKeyHex: string): string {
  return sha256Hex(utf8ToBytes(`${anchorTxid}:${leafKeyHex}`));
}

function applyAuctionBid(
  _state: OntState,
  event: ParsedOntEvent & { readonly type: EventType.AuctionBid; readonly payload: AuctionBidEvent }
): EventApplicationResult {
  const bondOutput = event.outputs[event.payload.bondVout] ?? null;

  if (bondOutput === null) {
    return {
      validationStatus: "ignored",
      reason: "auction_bid_missing_bond_output",
      affectedName: null
    };
  }

  if (bondOutput.scriptType !== "payment") {
    return {
      validationStatus: "ignored",
      reason: "auction_bid_bond_output_not_payment",
      affectedName: null
    };
  }

  if (bondOutput.valueSats !== event.payload.bidAmountSats) {
    return {
      validationStatus: "ignored",
      reason: "auction_bid_bond_value_mismatch",
      affectedName: null
    };
  }

  return {
    validationStatus: "applied",
    reason: "auction_bid_recorded",
    affectedName: event.payload.name ?? null
  };
}

// B1 §5 owner-key signature verification, ridden directly off the @ont/wire normative
// digests (b2-core-deciders-wire-auth-digests (#61), amending #59/#60). Fail closed: a
// malformed field that makes the wire digest/verify throw yields a rejecting verdict,
// never an exception (preserves the X3/R15 no-throw guarantee). The §5 equivalence pins
// (engine.test.ts, engine.recovery.test.ts) prove these match the legacy @ont/protocol
// digests byte-for-byte, so the migration is behavior-preserving.
function verifyTransferSignature(input: {
  readonly prevStateTxid: string;
  readonly newOwnerPubkey: string;
  readonly flags: number;
  readonly successorBondVout: number;
  readonly ownerPubkey: string;
  readonly signature: string;
}): boolean {
  try {
    return verifySchnorr(
      input.signature,
      transferAuthDigest({
        prevStateTxid: input.prevStateTxid,
        newOwnerPubkey: input.newOwnerPubkey,
        flags: input.flags,
        successorBondVout: input.successorBondVout
      }),
      input.ownerPubkey
    );
  } catch {
    return false;
  }
}

function verifyRecoverOwnerCancelSignature(input: {
  readonly prevStateTxid: string;
  readonly newOwnerPubkey: string;
  readonly flags: number;
  readonly successorBondVout: number;
  readonly challengeWindowBlocks: number;
  readonly recoveryDescriptorHash: string;
  readonly ownerPubkey: string;
  readonly signature: string;
}): boolean {
  try {
    return verifySchnorr(
      input.signature,
      recoverAuthDigest({
        prevStateTxid: input.prevStateTxid,
        newOwnerPubkey: input.newOwnerPubkey,
        flags: input.flags,
        successorBondVout: input.successorBondVout,
        challengeWindowBlocks: input.challengeWindowBlocks,
        recoveryDescriptorHash: input.recoveryDescriptorHash
      }),
      input.ownerPubkey
    );
  } catch {
    return false;
  }
}

function applyTransfer(state: OntState, event: ParsedOntEvent): EventApplicationResult {
  const payload = event.payload as TransferEvent;
  const record = findNameRecordByLastStateTxid(state, payload.prevStateTxid);

  if (record === null || record.status === "invalid") {
    return {
      validationStatus: "ignored",
      reason: "transfer_name_not_found_or_invalid",
      affectedName: null
    };
  }

  if (!isBondBackedRecord(record)) {
    return {
      validationStatus: "ignored",
      reason: "transfer_inapplicable_for_accumulator",
      affectedName: record.name
    };
  }

  // X13 (PR-34): while a recovery is pending, an owner-key Transfer is BLOCKED — it mutates
  // nothing. The owner's only in-window veto is the explicit RecoverOwner CANCEL bit. This fires
  // on pendingRecovery presence regardless of transfer signature validity (prevents a stolen owner
  // key from exfiltrating the name beyond the recovery descriptor during the challenge window).
  if (record.pendingRecovery !== undefined) {
    return {
      validationStatus: "ignored",
      reason: "transfer_blocked_pending_recovery",
      affectedName: record.name
    };
  }

  if (
    !verifyTransferSignature({
      prevStateTxid: payload.prevStateTxid,
      newOwnerPubkey: payload.newOwnerPubkey,
      flags: payload.flags,
      successorBondVout: payload.successorBondVout,
      ownerPubkey: record.currentOwnerPubkey,
      signature: payload.signature
    })
  ) {
    return {
      validationStatus: "ignored",
      reason: "transfer_invalid_signature",
      affectedName: record.name
    };
  }

  const requiresBondContinuity = event.blockHeight < record.maturityHeight;

  if (requiresBondContinuity) {
    if (!spendsOutpoint(event.inputs, record.currentBondTxid, record.currentBondVout)) {
      return {
        validationStatus: "ignored",
        reason: "transfer_missing_bond_spend",
        affectedName: record.name
      };
    }

    const successorBondOutput = event.outputs[payload.successorBondVout];
    if (
      successorBondOutput === undefined ||
      successorBondOutput.scriptType !== "payment" ||
      successorBondOutput.valueSats < record.requiredBondSats
    ) {
      return {
        validationStatus: "ignored",
        reason: "transfer_invalid_successor_bond",
        affectedName: record.name
      };
    }

    if (bondOutpointIsReserved(state, event.txid, payload.successorBondVout, {
      ignoredName: record.name
    })) {
      return {
        validationStatus: "ignored",
        reason: "transfer_successor_bond_conflict",
        affectedName: record.name
      };
    }

    state.names.set(record.name, {
      ...withoutPendingRecovery(record),
      status: getClaimedNameStatus({
        isRevealConfirmed: true,
        currentHeight: event.blockHeight,
        maturityHeight: record.maturityHeight,
        continuityIntact: true
      }),
      currentOwnerPubkey: payload.newOwnerPubkey,
      currentBondTxid: event.txid,
      currentBondVout: payload.successorBondVout,
      currentBondValueSats: successorBondOutput.valueSats,
      lastStateTxid: event.txid,
      lastStateHeight: event.blockHeight
    });
    return {
      validationStatus: "applied",
      reason: "transfer_applied_immature",
      affectedName: record.name
    };
  }

  state.names.set(record.name, {
    ...withoutPendingRecovery(record),
    status: getClaimedNameStatus({
      isRevealConfirmed: true,
      currentHeight: event.blockHeight,
      maturityHeight: record.maturityHeight,
      continuityIntact: true
    }),
    currentOwnerPubkey: payload.newOwnerPubkey,
    lastStateTxid: event.txid,
    lastStateHeight: event.blockHeight
  });

  return {
    validationStatus: "applied",
    reason: "transfer_applied_mature",
    affectedName: record.name
  };
}

function applyRecoverOwner(
  state: OntState,
  event: ParsedOntEvent & { readonly type: EventType.RecoverOwner; readonly payload: RecoverOwnerEvent },
  options: OntEventApplicationOptions
): EventApplicationResult {
  if ((event.payload.flags & RECOVER_OWNER_FLAG_CANCEL) !== 0) {
    return applyRecoverOwnerCancel(state, event);
  }

  return applyRecoverOwnerRequest(state, event, options);
}

function applyRecoverOwnerRequest(
  state: OntState,
  event: ParsedOntEvent & { readonly type: EventType.RecoverOwner; readonly payload: RecoverOwnerEvent },
  options: OntEventApplicationOptions
): EventApplicationResult {
  const payload = event.payload;
  const record = findNameRecordByLastStateTxid(state, payload.prevStateTxid);

  if (record === null || record.status === "invalid") {
    return {
      validationStatus: "ignored",
      reason: "recovery_name_not_found_or_invalid",
      affectedName: null
    };
  }

  if (!isBondBackedRecord(record)) {
    return {
      validationStatus: "ignored",
      reason: "recovery_inapplicable_for_accumulator",
      affectedName: record.name
    };
  }

  if (record.pendingRecovery !== undefined) {
    return {
      validationStatus: "ignored",
      reason: "recovery_already_pending",
      affectedName: record.name
    };
  }

  if (event.blockHeight >= record.maturityHeight) {
    return {
      validationStatus: "ignored",
      reason: "recovery_requires_immature_bond",
      affectedName: record.name
    };
  }

  if (!spendsOutpoint(event.inputs, record.currentBondTxid, record.currentBondVout)) {
    return {
      validationStatus: "ignored",
      reason: "recovery_missing_bond_spend",
      affectedName: record.name
    };
  }

  // Witnessed recovery descriptor evidence, pre-resolved by the evidence layer (indexer). Fail
  // closed if absent (R1: no witnessed descriptor head for this name => the invoke opens nothing).
  const resolved = options.recoveryEvidence?.byName.get(record.name);
  if (options.recoveryEvidence === undefined || resolved === undefined) {
    return {
      validationStatus: "ignored",
      reason: "recovery_no_witnessed_descriptor_evidence",
      affectedName: record.name
    };
  }
  const recoveryAddress = resolved.descriptorEvidence.descriptor.recoveryAddress;

  const successorBondOutput = event.outputs[payload.successorBondVout];
  if (
    successorBondOutput === undefined ||
    successorBondOutput.scriptType !== "payment" ||
    successorBondOutput.valueSats < record.requiredBondSats
  ) {
    return {
      validationStatus: "ignored",
      reason: "recovery_invalid_successor_bond",
      affectedName: record.name
    };
  }

  // PR-34 successor-bond-script binding: the rotated bond output must pay the descriptor's
  // recoveryAddress, so the recovered name's new bond is actually controlled by the recovery key.
  // A missing destination (the model cannot prove control) fails closed, same as a mismatch.
  if (typeof recoveryAddress !== "string" || successorBondOutput.address !== recoveryAddress) {
    return {
      validationStatus: "ignored",
      reason: "recovery_successor_bond_address_mismatch",
      affectedName: record.name
    };
  }

  if (bondOutpointIsReserved(state, event.txid, payload.successorBondVout, {
    ignoredName: record.name
  })) {
    return {
      validationStatus: "ignored",
      reason: "recovery_successor_bond_conflict",
      affectedName: record.name
    };
  }

  // Authorization + §3c evidence-gated admission. The bond/lifecycle mechanics above (R11/R12/R13)
  // stay in the engine; acceptRecoverOwner is the pure authorization/evidence gate. Until it
  // accepts, NO pendingRecovery opens, NO bond rotates, NO transfer block or finalization starts
  // (an unauthorized/unwitnessed invoke mutates no consensus state — forfeit is a no-op).
  const verdict = acceptRecoverOwner(
    {
      prevStateTxid: payload.prevStateTxid,
      newOwnerPubkey: payload.newOwnerPubkey,
      flags: payload.flags,
      successorBondVout: payload.successorBondVout,
      challengeWindowBlocks: payload.challengeWindowBlocks,
      recoveryDescriptorHash: payload.recoveryDescriptorHash,
      signature: payload.signature,
      minedHeight: event.blockHeight
    },
    resolved.descriptorEvidence,
    {
      ownerPubkey: record.currentOwnerPubkey,
      headTxid: record.lastStateTxid,
      currentOwnershipRef: resolved.currentOwnershipRef,
      recoveryDescriptorHeadHash: resolved.recoveryDescriptorHeadHash,
      recoveryDescriptorHeadSequence: resolved.recoveryDescriptorHeadSequence
    },
    options.recoveryEvidence.params
  );
  if (!verdict.accepted) {
    return {
      validationStatus: "ignored",
      reason: "recovery_unauthorized",
      affectedName: record.name
    };
  }

  state.names.set(record.name, {
    ...record,
    status: getClaimedNameStatus({
      isRevealConfirmed: true,
      currentHeight: event.blockHeight,
      maturityHeight: record.maturityHeight,
      continuityIntact: true
    }),
    pendingRecovery: {
      requestedTxid: event.txid,
      requestedHeight: event.blockHeight,
      finalizeHeight: event.blockHeight + payload.challengeWindowBlocks,
      proposedOwnerPubkey: payload.newOwnerPubkey,
      predecessorStateTxid: record.lastStateTxid,
      recoveryDescriptorHash: payload.recoveryDescriptorHash,
      challengeWindowBlocks: payload.challengeWindowBlocks
    },
    currentBondTxid: event.txid,
    currentBondVout: payload.successorBondVout,
    currentBondValueSats: successorBondOutput.valueSats
  });

  return {
    validationStatus: "applied",
    reason: "recovery_requested",
    affectedName: record.name
  };
}

function applyRecoverOwnerCancel(
  state: OntState,
  event: ParsedOntEvent & { readonly type: EventType.RecoverOwner; readonly payload: RecoverOwnerEvent }
): EventApplicationResult {
  const payload = event.payload;
  const record = findNameRecordByPendingRecoveryTxid(state, payload.prevStateTxid);

  if (record === null || record.status === "invalid" || record.pendingRecovery === undefined) {
    return {
      validationStatus: "ignored",
      reason: "recovery_cancel_not_found",
      affectedName: null
    };
  }

  if (!isBondBackedRecord(record)) {
    return {
      validationStatus: "ignored",
      reason: "recovery_inapplicable_for_accumulator",
      affectedName: record.name
    };
  }

  // PR-35: a valid CANCEL at the EXACT finalize height is IN-WINDOW (finalization is evaluated
  // after all events in the finalize-height block apply — refreshDerivedState runs after the
  // block's transactions, so a same-height CANCEL clears pendingRecovery before finalization
  // fires). Only a cancel strictly AFTER the finalize height is too late.
  if (event.blockHeight > record.pendingRecovery.finalizeHeight) {
    return {
      validationStatus: "ignored",
      reason: "recovery_cancel_too_late",
      affectedName: record.name
    };
  }

  if (
    payload.newOwnerPubkey !== record.pendingRecovery.proposedOwnerPubkey ||
    payload.challengeWindowBlocks !== record.pendingRecovery.challengeWindowBlocks ||
    payload.recoveryDescriptorHash !== record.pendingRecovery.recoveryDescriptorHash
  ) {
    return {
      validationStatus: "ignored",
      reason: "recovery_cancel_mismatched_request",
      affectedName: record.name
    };
  }

  if (
    !verifyRecoverOwnerCancelSignature({
      prevStateTxid: payload.prevStateTxid,
      newOwnerPubkey: payload.newOwnerPubkey,
      flags: payload.flags,
      successorBondVout: payload.successorBondVout,
      challengeWindowBlocks: payload.challengeWindowBlocks,
      recoveryDescriptorHash: payload.recoveryDescriptorHash,
      ownerPubkey: record.currentOwnerPubkey,
      signature: payload.signature
    })
  ) {
    return {
      validationStatus: "ignored",
      reason: "recovery_cancel_invalid_signature",
      affectedName: record.name
    };
  }

  state.names.set(record.name, {
    ...withoutPendingRecovery(record),
    lastStateTxid: event.txid,
    lastStateHeight: event.blockHeight
  });

  return {
    validationStatus: "applied",
    reason: "recovery_cancelled_by_owner",
    affectedName: record.name
  };
}

function collectSpentImmatureBonds(
  state: OntState,
  transaction: BitcoinTransactionInBlock
): BondBackedNameRecord[] {
  return [...state.names.values()].filter(
    (record): record is BondBackedNameRecord =>
      isBondBackedRecord(record) &&
      record.status !== "invalid" &&
      transaction.blockHeight < record.maturityHeight &&
      spendsOutpoint(transaction.tx.inputs, record.currentBondTxid, record.currentBondVout)
  );
}

function invalidateBrokenBondContinuity(
  state: OntState,
  transaction: BitcoinTransactionInBlock,
  spentRecords: readonly BondBackedNameRecord[]
): string[] {
  const invalidatedNames: string[] = [];

  for (const spentRecord of spentRecords) {
    const currentRecord = state.names.get(spentRecord.name);

    if (
      currentRecord === undefined ||
      !isBondBackedRecord(currentRecord) ||
      transaction.blockHeight >= spentRecord.maturityHeight
    ) {
      continue;
    }

    if (currentRecord.currentBondTxid === transaction.tx.txid) {
      const successorOutput = transaction.tx.outputs[currentRecord.currentBondVout];

      if (
        successorOutput !== undefined &&
        successorOutput.scriptType === "payment" &&
        successorOutput.valueSats >= currentRecord.requiredBondSats
      ) {
        continue;
      }
    }

    state.names.set(spentRecord.name, {
      ...currentRecord,
      status: "invalid"
    });
    invalidatedNames.push(spentRecord.name);
  }

  return invalidatedNames;
}

function findNameRecordByLastStateTxid(state: OntState, txid: string): NameRecord | null {
  for (const record of state.names.values()) {
    if (record.lastStateTxid === txid) {
      return record;
    }
  }

  return null;
}

function findNameRecordByPendingRecoveryTxid(state: OntState, txid: string): NameRecord | null {
  for (const record of state.names.values()) {
    if (record.pendingRecovery?.requestedTxid === txid) {
      return record;
    }
  }

  return null;
}

function withoutPendingRecovery<T extends NameRecord>(record: T): Omit<T, "pendingRecovery"> {
  const { pendingRecovery: _pendingRecovery, ...rest } = record;
  return rest;
}

function isBondBackedRecord(record: NameRecord): record is BondBackedNameRecord {
  return record.acquisitionKind === "bonded" || record.acquisitionKind === "auction";
}

function bondOutpointIsReserved(
  state: OntState,
  txid: string,
  vout: number,
  options: {
    ignoredName?: string;
  } = {}
): boolean {
  for (const record of state.names.values()) {
    if (
      isBondBackedRecord(record) &&
      record.status !== "invalid" &&
      record.name !== options.ignoredName &&
      record.currentBondTxid === txid &&
      record.currentBondVout === vout
    ) {
      return true;
    }
  }

  return false;
}

function spendsOutpoint(
  inputs: readonly BitcoinTransactionInput[],
  txid: string,
  vout: number
): boolean {
  return inputs.some((input) => input.txid === txid && input.vout === vout);
}

function createTransactionProvenanceRecord(
  transaction: BitcoinTransactionInBlock
): {
  txid: string;
  blockHeight: number;
  txIndex: number;
  inputs: readonly BitcoinTransactionInput[];
  outputs: readonly BitcoinTransactionOutput[];
  events: ProvenanceEventRecord[];
  invalidatedNames: string[];
} {
  return {
    txid: transaction.tx.txid,
    blockHeight: transaction.blockHeight,
    txIndex: transaction.txIndex,
    inputs: transaction.tx.inputs,
    outputs: transaction.tx.outputs,
    events: [],
    invalidatedNames: []
  };
}

function createProvenanceEventRecord(
  event: ParsedOntEvent,
  outcome: EventApplicationResult
): ProvenanceEventRecord {
  return {
    vout: event.vout,
    type: event.type,
    typeName: getEventTypeName(event.type),
    payload: event.payload,
    validationStatus: outcome.validationStatus,
    reason: outcome.reason,
    affectedName: outcome.affectedName
  };
}

function getEventTypeName(
  type: EventType.Transfer | EventType.AuctionBid | EventType.RecoverOwner | EventType.RootAnchor
): "TRANSFER" | "AUCTION_BID" | "RECOVER_OWNER" | "ROOT_ANCHOR" {
  switch (type) {
    case EventType.Transfer:
      return "TRANSFER";
    case EventType.AuctionBid:
      return "AUCTION_BID";
    case EventType.RecoverOwner:
      return "RECOVER_OWNER";
    case EventType.RootAnchor:
      return "ROOT_ANCHOR";
  }

  throw new Error("unreachable event type");
}
