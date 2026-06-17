// Thin HTTP client for a publisher's API (see
// docs/spec/ONT_PUBLISHER_PROTOCOL_SPEC.md). A publisher is a batching
// service the wallet uses for the cheap-claim rail — pay a small Lightning
// invoice, receive an inclusion proof anchored to Bitcoin. The wallet doesn't
// grant the publisher any authority over the name; the publisher's response is
// verified locally against @ont/core's accumulator before we record state.

export type PaymentRail = "lightning" | "l1";

export interface PublisherQuote {
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

export interface PublisherInclusionProof {
  readonly root: string;
  readonly leaf: string;
  readonly value: string;
  readonly siblings: readonly { readonly level: number; readonly hash: string }[];
}

export interface PublisherClaimReceipt {
  readonly kind: "ont-publisher-claim-receipt";
  readonly quoteId: string;
  readonly status: "quoted" | "paid" | "batched" | "anchored" | "confirmed" | "rejected" | "expired";
  readonly name: string;
  readonly reason?: string;
  readonly batchId?: string;
  readonly anchorTxid?: string;
  readonly anchorHeight?: number;
  readonly inclusionProof?: PublisherInclusionProof;
}

export class PublisherError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = "PublisherError";
    this.status = status;
  }
}

interface HttpResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}

export class PublisherClient {
  readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async info(): Promise<Record<string, unknown>> {
    return this.getJson<Record<string, unknown>>("/info");
  }

  async quote(input: { name: string; ownerPubkey: string; paymentRail: PaymentRail }): Promise<PublisherQuote> {
    return this.postJson<PublisherQuote>("/claim/quote", input);
  }

  async submit(input: {
    quoteId: string;
    paymentProof: { rail: PaymentRail; paymentHash?: string; txid?: string };
  }): Promise<PublisherClaimReceipt> {
    return this.postJson<PublisherClaimReceipt>("/claim/submit", input);
  }

  async status(quoteId: string): Promise<PublisherClaimReceipt> {
    return this.getJson<PublisherClaimReceipt>(`/claim/${encodeURIComponent(quoteId)}`);
  }

  private async getJson<T>(path: string): Promise<T> {
    let response: HttpResponse;
    try {
      response = (await fetch(`${this.baseUrl}${path}`)) as HttpResponse;
    } catch (error) {
      throw new PublisherError(
        `could not reach publisher at ${this.baseUrl} — ${error instanceof Error ? error.message : String(error)}`,
        null
      );
    }
    return this.parse<T>(response, `GET ${path}`);
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    let response: HttpResponse;
    try {
      response = (await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      })) as HttpResponse;
    } catch (error) {
      throw new PublisherError(
        `could not reach publisher at ${this.baseUrl} — ${error instanceof Error ? error.message : String(error)}`,
        null
      );
    }
    return this.parse<T>(response, `POST ${path}`);
  }

  private async parse<T>(response: HttpResponse, label: string): Promise<T> {
    const text = await response.text();
    if (!response.ok) {
      throw new PublisherError(`publisher ${label} returned HTTP ${response.status}: ${text}`, response.status);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new PublisherError(`publisher ${label} returned non-JSON: ${text.slice(0, 120)}`, response.status);
    }
  }
}
