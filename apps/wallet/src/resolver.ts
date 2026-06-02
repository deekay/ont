// Thin client for an ONT resolver's HTTP API.
//
// A resolver serves data and answers lookups; it holds no authority over names
// (we verify ownership against Bitcoin, not against it). The client only needs a
// few endpoints: read a name's current state, read its current destination
// record, and publish a new owner-signed destination record.

import { normalizeName, type SignedRecoveryDescriptor, type SignedValueRecord } from "@ont/protocol";

export type NameStatus = "pending" | "immature" | "mature" | "invalid";

export interface ResolverNameRecord {
  readonly name: string;
  readonly status: NameStatus;
  readonly currentOwnerPubkey: string;
  readonly lastStateTxid: string;
  readonly maturityHeight: number;
  readonly requiredBondSats: string;
  // The name's current bond outpoint (the UTXO a transfer spends). Optional in
  // case a resolver omits it; transfers need it (or an explicit --bond-input).
  readonly currentBondTxid?: string;
  readonly currentBondVout?: number;
  readonly currentBondValueSats?: string;
}

export interface ResolverValueRecord {
  readonly name: string;
  readonly ownerPubkey: string;
  readonly ownershipRef: string;
  readonly sequence: number;
  readonly valueType: number;
  readonly payloadHex: string;
  readonly recordHash: string;
  readonly issuedAt: string;
}

export interface ResolverValueHistoryRecord {
  readonly recordHash: string;
  readonly sequence: number;
  readonly previousRecordHash: string | null;
  readonly ownerPubkey: string;
  readonly ownershipRef: string;
  readonly valueType?: number;
  readonly payloadHex?: string;
  readonly issuedAt?: string;
}

export interface ResolverValueHistory {
  readonly records: readonly ResolverValueHistoryRecord[];
}

export interface ResolverRecoveryDescriptor {
  readonly name: string;
  readonly ownerPubkey: string;
  readonly ownershipRef: string;
  readonly sequence: number;
  readonly recoveryAddress: string;
  readonly signingProfile: string;
  readonly challengeWindowBlocks: number;
  readonly descriptorHash: string;
  readonly issuedAt: string;
}

/** One observed bid in an auction, as reported by /experimental-auctions. */
export interface ResolverAuctionBidOutcome {
  readonly txid: string;
  readonly ownerPubkey: string | null;
  readonly amountSats: string;
  readonly status: "accepted" | "rejected";
  readonly bondStatus?: string;
  readonly bondReleaseBlock?: number | null;
  readonly bondSpendStatus?: string;
  readonly bondVout?: number;
}

/** A live launch auction as the resolver's /experimental-auctions endpoint reports it. */
export interface ResolverAuctionState {
  readonly auctionId: string;
  readonly normalizedName: string;
  readonly currentBlockHeight: number;
  readonly phase: "pending_unlock" | "awaiting_opening_bid" | "live_bidding" | "soft_close" | "settled";
  readonly unlockBlock: number;
  readonly auctionCloseBlockAfter: number | null;
  readonly openingMinimumBidSats: string;
  readonly currentLeaderBidderCommitment: string | null;
  readonly currentHighestBidSats: string | null;
  readonly currentRequiredMinimumBidSats: string | null;
  readonly settlementLockBlocks: number;
  readonly blocksUntilUnlock: number;
  readonly blocksUntilClose: number | null;
  readonly visibleBidOutcomes?: readonly ResolverAuctionBidOutcome[];
}

export interface ResolverAuctionsResponse {
  readonly currentBlockHeight: number;
  readonly auctions: readonly ResolverAuctionState[];
}

export class ResolverError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.status = status;
  }
}

interface HttpResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}

export class ResolverClient {
  readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  /** Current ownership state for a name, or null if the resolver doesn't know it. */
  async getNameRecord(name: string): Promise<ResolverNameRecord | null> {
    return this.getOrNull<ResolverNameRecord>(`/name/${encodeURIComponent(normalizeName(name))}`);
  }

  /** Current owner-signed destination record, or null if none has been published. */
  async getValueRecord(name: string): Promise<ResolverValueRecord | null> {
    return this.getOrNull<ResolverValueRecord>(
      `/name/${encodeURIComponent(normalizeName(name))}/value`
    );
  }

  /** All live launch auctions this resolver knows about. */
  async getExperimentalAuctions(): Promise<ResolverAuctionsResponse> {
    const result = await this.getOrNull<ResolverAuctionsResponse>("/experimental-auctions");
    if (result === null) {
      throw new ResolverError(`resolver at ${this.baseUrl} has no experimental-auctions endpoint`, 404);
    }
    return result;
  }

  /** The live auction for a name, or null if this resolver isn't running one. */
  async findAuctionForName(name: string): Promise<ResolverAuctionState | null> {
    const normalized = normalizeName(name);
    const { auctions } = await this.getExperimentalAuctions();
    return auctions.find((auction) => auction.normalizedName === normalized) ?? null;
  }

  /** Ordered chain of owner-signed value records for a name, or null if none. */
  async getValueHistory(name: string): Promise<ResolverValueHistory | null> {
    return this.getOrNull<ResolverValueHistory>(
      `/name/${encodeURIComponent(normalizeName(name))}/value/history`
    );
  }

  /** Current owner-armed recovery descriptor, or null if none has been published. */
  async getRecoveryDescriptor(name: string): Promise<ResolverRecoveryDescriptor | null> {
    return this.getOrNull<ResolverRecoveryDescriptor>(
      `/name/${encodeURIComponent(normalizeName(name))}/recovery`
    );
  }

  /** Publish a signed destination record to this resolver. */
  async publishValueRecord(record: SignedValueRecord): Promise<void> {
    await this.post("/values", record, "value record");
  }

  /** Publish a signed recovery descriptor (arm/refresh recovery) to this resolver. */
  async publishRecoveryDescriptor(descriptor: SignedRecoveryDescriptor): Promise<void> {
    await this.post("/recovery-descriptors", descriptor, "recovery descriptor");
  }

  private async post(path: string, body: unknown, label: string): Promise<void> {
    const response = (await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    })) as HttpResponse;
    if (!response.ok) {
      throw new ResolverError(
        `resolver rejected the ${label} (${response.status}): ${describe(await readJson(response))}`,
        response.status
      );
    }
  }

  private async getOrNull<T>(path: string): Promise<T | null> {
    let response: HttpResponse;
    try {
      response = (await fetch(`${this.baseUrl}${path}`)) as HttpResponse;
    } catch (error) {
      throw new ResolverError(
        `could not reach resolver at ${this.baseUrl} — ${error instanceof Error ? error.message : String(error)}`,
        null
      );
    }
    if (response.status === 404) {
      return null;
    }
    const raw = await readJson(response);
    if (!response.ok) {
      throw new ResolverError(`resolver returned HTTP ${response.status}: ${describe(raw)}`, response.status);
    }
    return raw as T;
  }
}

async function readJson(response: HttpResponse): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function describe(raw: unknown): string {
  if (typeof raw === "string") {
    return raw;
  }
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
}
