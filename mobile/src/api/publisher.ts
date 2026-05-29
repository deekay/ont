// Thin HTTP client for an ONT publisher's API — the batching service behind the
// cheap-claim rail (see docs/research/ONT_PUBLISHER_PROTOCOL_SPEC.md). Faithful
// port of apps/wallet/src/publisher-client.ts: fetch-based, so it runs unchanged
// under React Native / Hermes.
//
// The wallet grants the publisher NO authority over a name. Every response is
// verified locally — quote commitments against the deterministic leaf, and the
// final inclusion proof against the anchored accumulator root (see wallet/claim.ts)
// — before any claim is recorded.
import { PUBLISHER_BASE } from "../config";

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

/**
 * The surface the claim flow depends on. Implemented by the real
 * {@link PublisherClient} and by the demo {@link MockPublisherClient}, so the UI
 * and {@link fetchVerifiedQuote} work against either without caring which.
 */
export interface PublisherClientLike {
  /** True for the local demo stub; false for a real networked publisher. */
  readonly isDemo: boolean;
  info(): Promise<Record<string, unknown>>;
  quote(input: { name: string; ownerPubkey: string; paymentRail: PaymentRail }): Promise<PublisherQuote>;
  submit(input: {
    quoteId: string;
    paymentProof: { rail: PaymentRail; paymentHash?: string; txid?: string };
  }): Promise<PublisherClaimReceipt>;
  status(quoteId: string): Promise<PublisherClaimReceipt>;
}

export class PublisherError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = "PublisherError";
    this.status = status;
  }
}

const DEFAULT_TIMEOUT_MS = 15000;

export class PublisherClient implements PublisherClientLike {
  readonly isDemo = false;
  readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  info(): Promise<Record<string, unknown>> {
    return this.getJson<Record<string, unknown>>("/info");
  }

  quote(input: { name: string; ownerPubkey: string; paymentRail: PaymentRail }): Promise<PublisherQuote> {
    return this.postJson<PublisherQuote>("/claim/quote", input);
  }

  submit(input: {
    quoteId: string;
    paymentProof: { rail: PaymentRail; paymentHash?: string; txid?: string };
  }): Promise<PublisherClaimReceipt> {
    return this.postJson<PublisherClaimReceipt>("/claim/submit", input);
  }

  status(quoteId: string): Promise<PublisherClaimReceipt> {
    return this.getJson<PublisherClaimReceipt>(`/claim/${encodeURIComponent(quoteId)}`);
  }

  private async getJson<T>(path: string): Promise<T> {
    return this.request<T>(path, `GET ${path}`, undefined);
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, `POST ${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
  }

  private async request<T>(path: string, label: string, init: RequestInit | undefined): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, { ...init, signal: controller.signal });
    } catch (error) {
      throw new PublisherError(
        `could not reach publisher at ${this.baseUrl} — ${error instanceof Error ? error.message : String(error)}`,
        null,
      );
    } finally {
      clearTimeout(timer);
    }
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

/**
 * Build a client for the configured publisher, or null when no reachable
 * publisher is configured. Callers render a "not configured" state on null
 * rather than attempting a request that cannot succeed.
 */
export function getPublisherClient(): PublisherClient | null {
  if (!PUBLISHER_BASE) return null;
  return new PublisherClient(PUBLISHER_BASE);
}
