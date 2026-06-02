import {
  type BitcoinTransactionInBlock,
  type BitcoinTransactionInput,
  type BitcoinTransactionOutput,
  getOpReturnPayloads
} from "@ont/bitcoin";
import {
  type AuctionBidEventPayload,
  OntEventType,
  RECOVER_OWNER_FLAG_CANCEL,
  type RecoverOwnerEventPayload,
  decodeOntPayload,
  extractRecoveryWalletProofHashFromCommitment,
  getEventTypeName,
  type TransferEventPayload,
  verifyRecoverOwnerCancelAuthorization,
  verifyTransferAuthorization
} from "@ont/protocol";

import { getClaimedNameStatus } from "./state.js";

export interface NameRecord {
  readonly name: string;
  readonly status: "pending" | "immature" | "mature" | "invalid";
  readonly currentOwnerPubkey: string;
  readonly pendingRecovery?: PendingRecoveryRecord;
  readonly acquisitionKind?: "auction";
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
  readonly lastStateTxid: string;
  readonly lastStateHeight: number;
  readonly winningCommitBlockHeight: number;
  readonly winningCommitTxIndex: number;
}

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
  readonly type: OntEventType;
  readonly payload:
    | TransferEventPayload
    | AuctionBidEventPayload
    | RecoverOwnerEventPayload;
}

export interface ProvenanceEventRecord {
  vout: number;
  type: OntEventType;
  typeName:
    | "TRANSFER"
    | "AUCTION_BID"
    | "RECOVER_OWNER";
  payload:
    | TransferEventPayload
    | AuctionBidEventPayload
    | RecoverOwnerEventPayload;
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

export interface RecoveryWalletProofAvailabilityRequest {
  readonly name: string;
  readonly recoveryTxid: string;
  readonly blockHeight: number;
  readonly proofCommitment: string;
  readonly proofHash: string;
  readonly prevStateTxid: string;
  readonly recoveryDescriptorHash: string;
  readonly newOwnerPubkey: string;
  readonly successorBondVout: number;
  readonly challengeWindowBlocks: number;
}

export interface OntEventApplicationOptions {
  readonly recoveryWalletProofAvailable?: (
    request: RecoveryWalletProofAvailabilityRequest
  ) => boolean;
}

export function createEmptyState(): OntState {
  return {
    names: new Map()
  };
}

export function extractOntEvents(transaction: BitcoinTransactionInBlock): ParsedOntEvent[] {
  return getOpReturnPayloads(transaction.tx).flatMap(({ vout, payload }) => {
    try {
      const decoded = decodeOntPayload(payload);

      return [
        {
          txid: transaction.tx.txid,
          blockHeight: transaction.blockHeight,
          txIndex: transaction.txIndex,
          vout,
          inputs: transaction.tx.inputs,
          outputs: transaction.tx.outputs,
          type: decoded.type,
          payload: decoded.payload
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
    case OntEventType.Transfer:
      return applyTransfer(state, event);
    case OntEventType.AuctionBid:
      return applyAuctionBid(
        state,
        event as ParsedOntEvent & {
          readonly type: OntEventType.AuctionBid;
          readonly payload: AuctionBidEventPayload;
        }
      );
    case OntEventType.RecoverOwner:
      return applyRecoverOwner(
        state,
        event as ParsedOntEvent & {
          readonly type: OntEventType.RecoverOwner;
          readonly payload: RecoverOwnerEventPayload;
        },
        options
      );
    default:
      // Scaling-rail messages (RootAnchor / AvailabilityMarker) are not v1 events; ignore them here.
      return { validationStatus: "ignored", reason: "unsupported_event_type", affectedName: null };
  }
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

    for (const event of extractOntEvents(transaction)) {
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

function applyAuctionBid(
  _state: OntState,
  event: ParsedOntEvent & { readonly type: OntEventType.AuctionBid; readonly payload: AuctionBidEventPayload }
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

function applyTransfer(state: OntState, event: ParsedOntEvent): EventApplicationResult {
  const payload = event.payload as TransferEventPayload;
  const record = findNameRecordByLastStateTxid(state, payload.prevStateTxid);

  if (record === null || record.status === "invalid") {
    return {
      validationStatus: "ignored",
      reason: "transfer_name_not_found_or_invalid",
      affectedName: null
    };
  }

  if (
    !verifyTransferAuthorization({
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
  event: ParsedOntEvent & { readonly type: OntEventType.RecoverOwner; readonly payload: RecoverOwnerEventPayload },
  options: OntEventApplicationOptions
): EventApplicationResult {
  if ((event.payload.flags & RECOVER_OWNER_FLAG_CANCEL) !== 0) {
    return applyRecoverOwnerCancel(state, event);
  }

  return applyRecoverOwnerRequest(state, event, options);
}

function applyRecoverOwnerRequest(
  state: OntState,
  event: ParsedOntEvent & { readonly type: OntEventType.RecoverOwner; readonly payload: RecoverOwnerEventPayload },
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

  if (bondOutpointIsReserved(state, event.txid, payload.successorBondVout, {
    ignoredName: record.name
  })) {
    return {
      validationStatus: "ignored",
      reason: "recovery_successor_bond_conflict",
      affectedName: record.name
    };
  }

  let proofHash: string;
  try {
    proofHash = extractRecoveryWalletProofHashFromCommitment(payload.signature);
  } catch {
    return {
      validationStatus: "ignored",
      reason: "recovery_invalid_wallet_proof_commitment",
      affectedName: record.name
    };
  }

  const proofAvailable = options.recoveryWalletProofAvailable?.({
    name: record.name,
    recoveryTxid: event.txid,
    blockHeight: event.blockHeight,
    proofCommitment: payload.signature,
    proofHash,
    prevStateTxid: payload.prevStateTxid,
    recoveryDescriptorHash: payload.recoveryDescriptorHash,
    newOwnerPubkey: payload.newOwnerPubkey,
    successorBondVout: payload.successorBondVout,
    challengeWindowBlocks: payload.challengeWindowBlocks
  }) ?? false;

  if (!proofAvailable) {
    return {
      validationStatus: "ignored",
      reason: "recovery_wallet_proof_unavailable",
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
  event: ParsedOntEvent & { readonly type: OntEventType.RecoverOwner; readonly payload: RecoverOwnerEventPayload }
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

  if (event.blockHeight >= record.pendingRecovery.finalizeHeight) {
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
    !verifyRecoverOwnerCancelAuthorization({
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
): NameRecord[] {
  return [...state.names.values()].filter(
    (record) =>
      record.status !== "invalid" &&
      transaction.blockHeight < record.maturityHeight &&
      spendsOutpoint(transaction.tx.inputs, record.currentBondTxid, record.currentBondVout)
  );
}

function invalidateBrokenBondContinuity(
  state: OntState,
  transaction: BitcoinTransactionInBlock,
  spentRecords: readonly NameRecord[]
): string[] {
  const invalidatedNames: string[] = [];

  for (const spentRecord of spentRecords) {
    const currentRecord = state.names.get(spentRecord.name);

    if (currentRecord === undefined || transaction.blockHeight >= spentRecord.maturityHeight) {
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

function withoutPendingRecovery(record: NameRecord): Omit<NameRecord, "pendingRecovery"> {
  const { pendingRecovery: _pendingRecovery, ...rest } = record;
  return rest;
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
      record.status !== "invalid"
      && record.name !== options.ignoredName
      && record.currentBondTxid === txid
      && record.currentBondVout === vout
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
