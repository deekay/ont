/**
 * Wire types mirroring the live ONT resolver/web read API (/api/*).
 * Field names match the JSON exactly; optional fields are marked where the
 * resolver only emits them for certain lifecycle states.
 */

export interface HealthResponse {
  ok: boolean;
  product: string;
  protocol: string;
  syncMode: string;
  source: string;
  descriptor?: string;
  expectedChain?: string | null;
  rpcChainInfo?: {
    chain: string;
    blocks: number;
    headers: number;
    bestblockhash: string;
    initialblockdownload: boolean;
  } | null;
  rpcStatus?: { nextHeight: number; lastTipHeight: number } | null;
  valueChainsTracked?: number;
  valueRecordsTracked?: number;
  recoveryDescriptorChainsTracked?: number;
  recoveryWalletProofsTracked?: number;
  [key: string]: unknown;
}

export interface NameRecord {
  name: string;
  status: string; // "mature" | "claimed" | "pending" | "contested" | ...
  currentOwnerPubkey?: string;
  acquisitionKind?: string; // "auction" | "claim" | "cheap" | ...
  acquisitionAuctionId?: string;
  claimHeight?: number;
  maturityHeight?: number;
  requiredBondSats?: string;
  currentBondTxid?: string;
  currentBondVout?: number;
  currentBondValueSats?: string;
  lastStateTxid?: string;
  lastStateHeight?: number;
  claimCommitTxid?: string;
  claimRevealTxid?: string;
  winningCommitBlockHeight?: number;
  [key: string]: unknown;
}

export interface NamesResponse {
  names: NameRecord[];
}

export interface TxInput {
  txid: string;
  vout: number;
  coinbase: boolean;
}

export interface TxOutput {
  valueSats: string;
  scriptType: string; // "payment" | "op_return" | ...
  dataHex?: string;
}

export interface ActivityEvent {
  vout: number;
  type: number;
  typeName: string; // "AUCTION_BID" | "CLAIM" | "TRANSFER" | "VALUE_RECORD" | ...
  payload?: Record<string, unknown>;
  validationStatus?: string; // "applied" | "rejected" | ...
  reason?: string;
  affectedName?: string;
}

export interface ActivityEntry {
  txid: string;
  blockHeight: number;
  txIndex: number;
  inputs: TxInput[];
  outputs: TxOutput[];
  events?: ActivityEvent[];
  invalidatedNames?: string[];
}

export interface ActivityResponse {
  activity: ActivityEntry[];
}

export interface NameActivityResponse {
  name: string;
  activity: ActivityEntry[];
}

export interface ValueRecord {
  format: string;
  recordVersion: number;
  name: string;
  ownerPubkey: string;
  ownershipRef: string;
  sequence: number;
  previousRecordHash: string | null;
  valueType: number;
  payloadHex: string;
  issuedAt: string;
  signature: string;
  recordHash: string;
}

export interface ValueRecordPublishResponse {
  ok: boolean;
  name: string;
  ownershipRef: string;
  sequence: number;
  previousRecordHash: string | null;
  recordHash: string;
  valueType: number;
  valueStorePath?: string;
}

export interface ValueHistoryResponse {
  name: string;
  ownershipRef: string;
  currentRecordHash: string;
  completeFromSequence: number;
  completeToSequence: number;
  hasGaps: boolean;
  hasForks: boolean;
  records: ValueRecord[];
}

export interface RecoveryDescriptor {
  format: string;
  recordVersion: number;
  name: string;
  ownerPubkey: string;
  ownershipRef: string;
  sequence: number;
  previousDescriptorHash: string | null;
  recoveryAddress?: string;
  issuedAt: string;
  signature: string;
  descriptorHash: string;
  [key: string]: unknown;
}

export interface AuctionEntry {
  auctionId: string;
  title: string;
  description?: string;
  auctionLotCommitment?: string;
  currentBlockHeight: number;
  phase: string; // pending_unlock | awaiting_opening_bid | live_bidding | soft_close | settled
  phaseLabel: string;
  normalizedName: string;
  auctionClassId: string;
  classLabel: string;
  unlockBlock: number;
  baseMinimumBidSats?: string;
  openingMinimumBidSats?: string;
  settlementLockBlocks?: number;
  auctionStartBlock?: number | null;
  auctionCloseBlockAfter?: number | null;
  blocksUntilUnlock?: number | null;
  blocksUntilClose?: number | null;
  currentLeaderBidderCommitment?: string | null;
  currentHighestBidSats?: string | null;
  currentRequiredMinimumBidSats?: string | null;
  winnerBidTxid?: string | null;
  winnerOwnerPubkey?: string | null;
  settlementHeight?: number | null;
  acceptedBidCount?: number;
  rejectedBidCount?: number;
  totalObservedBidCount?: number;
  visibleBidOutcomes?: BidOutcome[];
}

export interface BidOutcome {
  outcome?: string; // "accepted" | "rejected"
  reason?: string;
  bidAmountSats?: string;
  blockHeight?: number;
  [key: string]: unknown;
}

export interface AuctionPolicy {
  defaultSettlementLockBlocks?: number;
  auction?: Record<string, unknown>;
  auctionClasses?: Record<string, { label: string; floorSats: string; lockBlocks: number }>;
}

export interface ExperimentalAuctionsResponse {
  kind: string;
  policy: AuctionPolicy;
  currentBlockHeight: number;
  auctions: AuctionEntry[];
}

export interface ConfigResponse {
  product: string;
  protocol: string;
  networkLabel?: string;
  privateDemoBasePath?: string;
  privateFunding?: {
    enabled: boolean;
    amountSats?: string;
    amountBtc?: string;
    maxAmountSats?: string;
    electrumEndpoint?: string;
  };
  [key: string]: unknown;
}
