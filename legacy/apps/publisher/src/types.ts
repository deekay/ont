// Wire types for the publisher's HTTP API. See ONT_PUBLISHER_PROTOCOL_SPEC.md
// for the full contract.

export type PaymentRail = "lightning" | "l1";

export type ClaimStatus =
  | "quoted" // quote issued, not yet paid
  | "paid" // payment confirmed, waiting for batch
  | "batched" // included in a batch, awaiting anchor broadcast
  | "anchored" // anchor tx broadcast, awaiting confirmation
  | "confirmed" // anchor tx confirmed; inclusion proof available
  | "rejected" // unavailable, payment failed, or batch invalidated
  | "expired"; // quote not paid in time

export interface PublisherInfo {
  readonly kind: "ont-publisher-info";
  readonly version: string;
  readonly operatorName: string;
  readonly contact: string;
  readonly paymentRails: readonly PaymentRail[];
  readonly serviceBaseSats: string;
  readonly batching: {
    readonly maxBatchAgeSeconds: number;
    readonly maxBatchSize: number;
    readonly expectedAnchorIntervalSeconds: number;
  };
  readonly network: "main" | "signet" | "testnet" | "regtest";
  readonly termsUrl: string;
}

export interface QuoteRequest {
  readonly name: string;
  readonly ownerPubkey: string; // 32B hex
  readonly paymentRail: PaymentRail;
}

export interface Quote {
  readonly kind: "ont-publisher-quote";
  readonly quoteId: string;
  readonly name: string;
  readonly available: boolean;
  readonly reason?: "taken" | "reserved" | "auction_pending";
  readonly gateBaseSats: string;
  readonly serviceBaseSats: string;
  readonly totalBaseSats: string;
  readonly expiresAt: string;
  readonly paymentRail: PaymentRail;
  readonly lightningInvoice?: string;
  readonly l1Address?: string;
  readonly ownerCommitment: string;
  readonly leaf: string;
}

export interface ClaimSubmission {
  readonly quoteId: string;
  readonly paymentProof?: {
    readonly rail: PaymentRail;
    readonly paymentHash?: string;
    readonly txid?: string;
  };
}

export interface InclusionProof {
  readonly root: string;
  readonly leaf: string;
  readonly value: string;
  readonly siblings: readonly { readonly level: number; readonly hash: string }[];
}

export interface ClaimReceipt {
  readonly kind: "ont-publisher-claim-receipt";
  readonly quoteId: string;
  readonly status: ClaimStatus;
  readonly name: string;
  readonly reason?: string;
  readonly batchId?: string;
  readonly anchorTxid?: string;
  readonly anchorHeight?: number;
  readonly inclusionProof?: InclusionProof;
}

export interface BatchData {
  readonly kind: "ont-publisher-batch";
  readonly batchId: string;
  readonly anchorTxid: string | null;
  readonly anchorHeight: number | null;
  readonly prevRoot: string;
  readonly newRoot: string;
  readonly leaves: readonly {
    readonly name: string;
    readonly ownerPubkey: string;
    readonly leaf: string;
    readonly value: string;
  }[];
}

export interface HealthResponse {
  readonly status: "ok" | "degraded";
  readonly anchorBacklog: number;
  readonly lastAnchorAt: string | null;
}
