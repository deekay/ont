// The ONT publisher: a batching service that accepts wallet claim requests,
// confirms payment, bundles them into accumulator batches, and anchors each
// batch to Bitcoin. No custody of user keys; can't forge ownership (consensus
// enforces insertion-uniqueness against the accumulator); can't quietly
// inflate fees (consensus rejects any anchor whose fee is less than Σ gates).
//
// In v0 the payment verifier and anchor broadcaster are stubs — the structure
// is real, the chain effects are not. Plug a real verifier + broadcaster in
// the constructor when wiring against a live network.

import { Accumulator, accumulatorKeyForName, emptyAccumulatorRoot } from "@ont/core";
import { createRootAnchorPayload, normalizeName } from "@ont/protocol";
import { randomBytes } from "node:crypto";

import { type AnchorBroadcaster, StubAnchorBroadcaster } from "./anchor.js";
import { type PaymentVerifier, StubPaymentVerifier } from "./payment.js";
import type {
  BatchData,
  ClaimReceipt,
  ClaimStatus,
  ClaimSubmission,
  HealthResponse,
  InclusionProof,
  PaymentRail,
  PublisherInfo,
  Quote,
  QuoteRequest
} from "./types.js";

export interface PublisherOptions {
  readonly network: PublisherInfo["network"];
  readonly operatorName?: string;
  readonly contact?: string;
  readonly gateBaseSats?: bigint;
  readonly serviceBaseSats?: bigint;
  readonly maxBatchSize?: number;
  readonly maxBatchAgeSeconds?: number;
  readonly expectedAnchorIntervalSeconds?: number;
  readonly quoteTtlSeconds?: number;
  readonly paymentVerifier?: PaymentVerifier;
  readonly anchorBroadcaster?: AnchorBroadcaster;
  readonly clock?: () => Date;
}

interface InternalQuote {
  readonly quoteId: string;
  readonly name: string;
  readonly ownerPubkey: string;
  readonly leaf: string;
  readonly value: string;
  readonly gateBaseSats: bigint;
  readonly serviceBaseSats: bigint;
  readonly paymentRail: PaymentRail;
  readonly paymentReference: string;
  readonly expiresAt: Date;
  status: ClaimStatus;
  rejectionReason?: string;
  batchId?: string;
}

interface InternalBatch {
  readonly batchId: string;
  readonly prevRoot: string;
  readonly newRoot: string;
  readonly leaves: BatchData["leaves"];
  readonly anchorTxid: string;
  readonly anchorHeight: number;
  readonly anchoredAt: Date;
}

export class Publisher {
  readonly network: PublisherInfo["network"];
  private readonly accumulator = new Accumulator();
  private readonly quotes = new Map<string, InternalQuote>();
  private readonly batches = new Map<string, InternalBatch>();
  private readonly leafToQuote = new Map<string, string>(); // active reservations
  private readonly paymentVerifier: PaymentVerifier;
  private readonly anchorBroadcaster: AnchorBroadcaster;
  private readonly clock: () => Date;
  private readonly options: Required<
    Omit<PublisherOptions, "paymentVerifier" | "anchorBroadcaster" | "clock" | "network">
  >;

  constructor(options: PublisherOptions) {
    this.network = options.network;
    this.paymentVerifier = options.paymentVerifier ?? new StubPaymentVerifier();
    this.anchorBroadcaster = options.anchorBroadcaster ?? new StubAnchorBroadcaster();
    this.clock = options.clock ?? (() => new Date());
    this.options = {
      operatorName: options.operatorName ?? "unnamed publisher",
      contact: options.contact ?? "",
      gateBaseSats: options.gateBaseSats ?? 1000n,
      serviceBaseSats: options.serviceBaseSats ?? 200n,
      maxBatchSize: options.maxBatchSize ?? 1024,
      maxBatchAgeSeconds: options.maxBatchAgeSeconds ?? 600,
      expectedAnchorIntervalSeconds: options.expectedAnchorIntervalSeconds ?? 600,
      quoteTtlSeconds: options.quoteTtlSeconds ?? 300
    };
  }

  info(): PublisherInfo {
    return {
      kind: "ont-publisher-info",
      version: "0.1",
      operatorName: this.options.operatorName,
      contact: this.options.contact,
      paymentRails: ["lightning"],
      serviceBaseSats: this.options.serviceBaseSats.toString(),
      batching: {
        maxBatchAgeSeconds: this.options.maxBatchAgeSeconds,
        maxBatchSize: this.options.maxBatchSize,
        expectedAnchorIntervalSeconds: this.options.expectedAnchorIntervalSeconds
      },
      network: this.network,
      termsUrl: ""
    };
  }

  health(): HealthResponse {
    const pending = [...this.quotes.values()].filter((q) => q.status === "paid").length;
    const lastAnchor = [...this.batches.values()].sort((a, b) => b.anchoredAt.getTime() - a.anchoredAt.getTime())[0];
    return {
      status: "ok",
      anchorBacklog: pending,
      lastAnchorAt: lastAnchor?.anchoredAt.toISOString() ?? null
    };
  }

  /**
   * Issue a quote for a name. Reserves the leaf for the quote's TTL so a
   * race between quoting and submitting doesn't double-promise the same name.
   */
  quote(request: QuoteRequest): Quote {
    const name = normalizeName(request.name);
    if (!/^[0-9a-fA-F]{64}$/.test(request.ownerPubkey)) {
      throw new PublisherError("ownerPubkey must be 32-byte hex", 400);
    }
    if (request.paymentRail !== "lightning") {
      // v0: lightning only. L1 mode is documented in the spec but not yet wired.
      throw new PublisherError(`paymentRail "${request.paymentRail}" is not supported in v0`, 400);
    }

    const leaf = accumulatorKeyForName(name);
    const value = request.ownerPubkey.toLowerCase();
    this.expireStaleQuotes();

    const taken = this.accumulator.has(leaf);
    const reserved = this.leafToQuote.has(leaf);
    if (taken || reserved) {
      return {
        kind: "ont-publisher-quote",
        quoteId: "",
        name,
        available: false,
        reason: taken ? "taken" : "reserved",
        gateBaseSats: this.options.gateBaseSats.toString(),
        serviceBaseSats: this.options.serviceBaseSats.toString(),
        totalBaseSats: (this.options.gateBaseSats + this.options.serviceBaseSats).toString(),
        expiresAt: this.clock().toISOString(),
        paymentRail: request.paymentRail,
        ownerCommitment: value,
        leaf
      };
    }

    const quoteId = randomBytes(16).toString("hex");
    const expiresAt = new Date(this.clock().getTime() + this.options.quoteTtlSeconds * 1000);
    const paymentReference = synthInvoice(quoteId);
    const quote: InternalQuote = {
      quoteId,
      name,
      ownerPubkey: request.ownerPubkey.toLowerCase(),
      leaf,
      value,
      gateBaseSats: this.options.gateBaseSats,
      serviceBaseSats: this.options.serviceBaseSats,
      paymentRail: request.paymentRail,
      paymentReference,
      expiresAt,
      status: "quoted"
    };
    this.quotes.set(quoteId, quote);
    this.leafToQuote.set(leaf, quoteId);

    return {
      kind: "ont-publisher-quote",
      quoteId,
      name,
      available: true,
      gateBaseSats: quote.gateBaseSats.toString(),
      serviceBaseSats: quote.serviceBaseSats.toString(),
      totalBaseSats: (quote.gateBaseSats + quote.serviceBaseSats).toString(),
      expiresAt: expiresAt.toISOString(),
      paymentRail: quote.paymentRail,
      lightningInvoice: paymentReference,
      ownerCommitment: value,
      leaf
    };
  }

  /**
   * Submit a paid claim. Verifies the payment proof, marks the quote as paid,
   * and (in v0) immediately seals a batch with just this claim and anchors it.
   * A production publisher would aggregate paid claims into larger batches.
   */
  async submit(submission: ClaimSubmission): Promise<ClaimReceipt> {
    const quote = this.quotes.get(submission.quoteId);
    if (quote === undefined) {
      throw new PublisherError(`unknown quoteId ${submission.quoteId}`, 404);
    }
    if (quote.status === "expired" || quote.expiresAt.getTime() < this.clock().getTime()) {
      quote.status = "expired";
      this.leafToQuote.delete(quote.leaf);
      return this.receiptFor(quote);
    }
    if (quote.status !== "quoted") {
      return this.receiptFor(quote);
    }
    if (submission.paymentProof === undefined) {
      throw new PublisherError("paymentProof is required", 400);
    }

    const verification = await this.paymentVerifier.verify({
      quoteId: quote.quoteId,
      rail: quote.paymentRail,
      expectedSats: quote.gateBaseSats + quote.serviceBaseSats,
      paymentProof: submission.paymentProof,
      expectedReference: quote.paymentReference
    });
    if (!verification.accepted) {
      quote.status = "rejected";
      quote.rejectionReason = verification.reason ?? "payment not accepted";
      this.leafToQuote.delete(quote.leaf);
      return this.receiptFor(quote);
    }

    quote.status = "paid";
    await this.sealBatch([quote]);
    return this.receiptFor(quote);
  }

  /** Idempotent status lookup. */
  status(quoteId: string): ClaimReceipt {
    const quote = this.quotes.get(quoteId);
    if (quote === undefined) {
      throw new PublisherError(`unknown quoteId ${quoteId}`, 404);
    }
    return this.receiptFor(quote);
  }

  /** Batch data — what a data-availability check would pull. */
  batch(batchId: string): BatchData {
    const batch = this.batches.get(batchId);
    if (batch === undefined) {
      throw new PublisherError(`unknown batchId ${batchId}`, 404);
    }
    return {
      kind: "ont-publisher-batch",
      batchId,
      anchorTxid: batch.anchorTxid,
      anchorHeight: batch.anchorHeight,
      prevRoot: batch.prevRoot,
      newRoot: batch.newRoot,
      leaves: batch.leaves
    };
  }

  /** Has this publisher's accumulator seen this name yet? (Best-effort check.) */
  knows(name: string): boolean {
    return this.accumulator.has(accumulatorKeyForName(normalizeName(name)));
  }

  private async sealBatch(claims: InternalQuote[]): Promise<void> {
    const prevRoot = this.accumulator.root();
    for (const claim of claims) {
      this.accumulator.insert(claim.leaf, claim.value);
    }
    const newRoot = this.accumulator.root();
    const batchId = randomBytes(8).toString("hex");
    const payload = createRootAnchorPayload({
      prevRoot: prevRoot === emptyAccumulatorRoot() ? "00".repeat(32) : prevRoot,
      newRoot,
      batchSize: claims.length
    });

    for (const claim of claims) {
      claim.status = "batched";
      claim.batchId = batchId;
    }

    const result = await this.anchorBroadcaster.broadcast({ batchId, payload });
    const leaves = claims.map((claim) => ({
      name: claim.name,
      ownerPubkey: claim.ownerPubkey,
      leaf: claim.leaf,
      value: claim.value
    }));
    this.batches.set(batchId, {
      batchId,
      prevRoot,
      newRoot,
      leaves,
      anchorTxid: result.txid,
      anchorHeight: result.height,
      anchoredAt: this.clock()
    });
    for (const claim of claims) {
      claim.status = "confirmed";
      this.leafToQuote.delete(claim.leaf);
    }
  }

  private receiptFor(quote: InternalQuote): ClaimReceipt {
    const base: ClaimReceipt = {
      kind: "ont-publisher-claim-receipt",
      quoteId: quote.quoteId,
      status: quote.status,
      name: quote.name,
      ...(quote.rejectionReason !== undefined ? { reason: quote.rejectionReason } : {}),
      ...(quote.batchId !== undefined ? { batchId: quote.batchId } : {})
    };
    if (quote.batchId === undefined) {
      return base;
    }
    const batch = this.batches.get(quote.batchId);
    if (batch === undefined) {
      return base;
    }
    const inclusionProof: InclusionProof | undefined =
      quote.status === "confirmed" ? this.inclusionProofFor(quote, batch) : undefined;
    return {
      ...base,
      anchorTxid: batch.anchorTxid,
      anchorHeight: batch.anchorHeight,
      ...(inclusionProof !== undefined ? { inclusionProof } : {})
    };
  }

  private inclusionProofFor(quote: InternalQuote, batch: InternalBatch): InclusionProof {
    const proof = this.accumulator.proveMembership(quote.leaf);
    return {
      root: batch.newRoot,
      leaf: proof.keyHex,
      value: proof.value ?? quote.value,
      siblings: proof.siblings
    };
  }

  private expireStaleQuotes(): void {
    const now = this.clock().getTime();
    for (const quote of this.quotes.values()) {
      if (quote.status === "quoted" && quote.expiresAt.getTime() < now) {
        quote.status = "expired";
        this.leafToQuote.delete(quote.leaf);
      }
    }
  }
}

export class PublisherError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "PublisherError";
    this.status = status;
  }
}

/** Stand-in for a real BOLT11 invoice — deterministic given a quoteId. */
function synthInvoice(quoteId: string): string {
  return `lnbcrt:stub:${quoteId}`;
}
