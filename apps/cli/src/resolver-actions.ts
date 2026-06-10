import {
  computeValueRecordHash,
  normalizeName,
  type SignedValueRecord,
  VALUE_RECORD_FORMAT,
  VALUE_RECORD_VERSION,
  verifyValueRecord
} from "@ont/protocol";

export interface ResolverNameRecord {
  readonly name: string;
  readonly status: "pending" | "immature" | "mature" | "invalid";
  readonly currentOwnerPubkey: string;
  readonly claimCommitTxid: string;
  readonly claimRevealTxid: string;
  readonly claimHeight: number;
  readonly maturityHeight: number;
  readonly requiredBondSats: string;
  readonly currentBondTxid: string;
  readonly currentBondVout: number;
  readonly currentBondValueSats: string;
  readonly lastStateTxid: string;
  readonly lastStateHeight?: number;
  readonly winningCommitBlockHeight: number;
  readonly winningCommitTxIndex: number;
}

export interface ResolverValueRecord {
  readonly format: string;
  readonly recordVersion: number;
  readonly name: string;
  readonly ownerPubkey: string;
  readonly ownershipRef: string;
  readonly sequence: number;
  readonly previousRecordHash: string | null;
  readonly valueType: number;
  readonly payloadHex: string;
  readonly issuedAt: string;
  readonly signature: string;
  readonly recordHash: string;
}

export interface ResolverValueHistory {
  readonly name: string;
  readonly ownershipRef: string;
  readonly currentRecordHash: string;
  readonly completeFromSequence: number;
  readonly completeToSequence: number;
  readonly hasGaps: boolean;
  readonly hasForks: boolean;
  readonly records: readonly ResolverValueRecord[];
}

export interface ResolverRecoveryDescriptor {
  readonly format: string;
  readonly descriptorVersion: number;
  readonly name: string;
  readonly ownerPubkey: string;
  readonly ownershipRef: string;
  readonly sequence: number;
  readonly previousDescriptorHash: string | null;
  readonly recoveryAddress: string;
  readonly signingProfile: string;
  readonly challengeWindowBlocks: number;
  readonly issuedAt: string;
  readonly signature: string;
  readonly descriptorHash: string;
}

export interface ResolverRecoveryDescriptorHistory {
  readonly name: string;
  readonly ownershipRef: string;
  readonly currentDescriptorHash: string;
  readonly completeFromSequence: number;
  readonly completeToSequence: number;
  readonly hasGaps: boolean;
  readonly hasForks: boolean;
  readonly descriptors: readonly ResolverRecoveryDescriptor[];
}

export interface MultiResolverValueHistoryResult {
  readonly resolverUrl: string;
  readonly outcome: "ok" | "missing" | "error";
  readonly history: ResolverValueHistory | null;
  readonly status: number | null;
  readonly code: string | null;
  readonly message: string | null;
}

export interface MultiResolverValueHistorySummary {
  readonly kind: "ont-multi-resolver-value-history";
  readonly name: string;
  readonly resolverCount: number;
  readonly status: "all_missing" | "consistent" | "lagging" | "conflict";
  readonly canonicalResolverUrl: string | null;
  readonly canonicalHistory: ResolverValueHistory | null;
  readonly canonicalValueRecord: ResolverValueRecord | null;
  readonly ownershipRef: string | null;
  readonly currentRecordHash: string | null;
  readonly currentSequence: number | null;
  readonly laggingResolverUrls: readonly string[];
  readonly missingResolverUrls: readonly string[];
  readonly conflictingResolverUrls: readonly string[];
  /** Resolvers whose history failed cryptographic verification — never canonical. */
  readonly rejectedResolverUrls: readonly string[];
  readonly failedResolverUrls: readonly string[];
  readonly resolverResults: readonly MultiResolverValueHistoryResult[];
}

/**
 * Verify a resolver-served value history end-to-end (recomputed recordHash, owner
 * signature, one owner + ownershipRef, gap-free linked sequence) so a forged
 * chain cannot be trusted just for being the longest. (MR1.) Disclosed limit:
 * proves self-consistency + owner-signing, not that the key is the on-chain owner.
 */
export function verifyResolverValueHistory(history: ResolverValueHistory): boolean {
  const records = history.records;
  if (records.length === 0) {
    return false;
  }
  const owner = records[0]!.ownerPubkey;
  const ownershipRef = records[0]!.ownershipRef;
  let previousHash: string | null = null;
  let previousSequence: number | null = null;

  for (const record of records) {
    if (record.ownerPubkey !== owner || record.ownershipRef !== ownershipRef) {
      return false;
    }
    if (previousSequence !== null && record.sequence !== previousSequence + 1) {
      return false;
    }
    if (record.previousRecordHash !== previousHash) {
      return false;
    }
    const fields = {
      name: record.name,
      ownerPubkey: record.ownerPubkey,
      ownershipRef: record.ownershipRef,
      sequence: record.sequence,
      previousRecordHash: record.previousRecordHash,
      valueType: record.valueType,
      payloadHex: record.payloadHex,
      issuedAt: record.issuedAt
    };
    if (computeValueRecordHash(fields) !== record.recordHash) {
      return false;
    }
    const signed: SignedValueRecord = {
      ...fields,
      format: VALUE_RECORD_FORMAT,
      recordVersion: VALUE_RECORD_VERSION,
      signature: record.signature
    };
    try {
      if (!verifyValueRecord(signed)) {
        return false;
      }
    } catch {
      return false;
    }
    previousHash = record.recordHash;
    previousSequence = record.sequence;
  }
  return true;
}

export interface ResolverNameActivityResponse {
  readonly name: string;
  readonly activity: readonly ResolverRecentActivityRecord[];
}

export interface ResolverTransactionProvenance {
  readonly txid: string;
  readonly blockHeight: number;
  readonly txIndex: number;
  readonly inputs: ReadonlyArray<{
    readonly txid: string | null;
    readonly vout: number | null;
    readonly coinbase: boolean;
  }>;
  readonly outputs: ReadonlyArray<{
    readonly valueSats: string;
    readonly scriptType: "op_return" | "payment" | "unknown";
    readonly dataHex?: string;
  }>;
  readonly events: ReadonlyArray<{
    readonly vout: number;
    readonly type: number;
    readonly typeName: "AUCTION_BID" | "TRANSFER" | "RECOVER_OWNER";
    readonly payload:
      | {
          readonly flags: number;
          readonly ownerPubkey: string;
          readonly bondVout: number;
          readonly settlementLockBlocks: number;
          readonly bidAmountSats: string;
          readonly auctionLotCommitment: string;
          readonly auctionCommitment: string;
          readonly bidderCommitment: string;
        }
      | {
          readonly prevStateTxid: string;
          readonly newOwnerPubkey: string;
          readonly flags: number;
          readonly successorBondVout: number;
          readonly signature: string;
        }
      | {
          readonly prevStateTxid: string;
          readonly newOwnerPubkey: string;
          readonly flags: number;
          readonly successorBondVout: number;
          readonly challengeWindowBlocks: number;
          readonly recoveryDescriptorHash: string;
          readonly signature: string;
        };
    readonly validationStatus: "applied" | "ignored";
    readonly reason: string;
    readonly affectedName: string | null;
  }>;
  readonly invalidatedNames: readonly string[];
}

export type ResolverRecentActivityRecord = ResolverTransactionProvenance;

export class ResolverHttpError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly payload: unknown;

  public constructor(input: {
    readonly status: number;
    readonly code: string;
    readonly message: string;
    readonly payload: unknown;
  }) {
    super(input.message);
    this.name = "ResolverHttpError";
    this.status = input.status;
    this.code = input.code;
    this.payload = input.payload;
  }
}

export function resolveResolverUrl(explicitResolverUrl: string | undefined): string {
  return resolveResolverUrls(
    explicitResolverUrl === undefined ? undefined : [explicitResolverUrl]
  )[0] as string;
}

export function resolveResolverUrls(explicitResolverUrls?: readonly string[]): readonly string[] {
  const fromExplicit = normalizeResolverUrls(explicitResolverUrls);
  if (fromExplicit.length > 0) {
    return fromExplicit;
  }

  const fromEnvList = normalizeResolverUrls(parseResolverUrlList(process.env.ONT_RESOLVER_URLS));
  if (fromEnvList.length > 0) {
    return fromEnvList;
  }

  if (process.env.ONT_RESOLVER_URL) {
    return [process.env.ONT_RESOLVER_URL];
  }

  const port = process.env.ONT_RESOLVER_PORT ?? "8787";
  return [`http://127.0.0.1:${port}`];
}

export async function fetchNameRecord(options: {
  readonly name: string;
  readonly resolverUrl?: string;
}): Promise<ResolverNameRecord> {
  const normalized = normalizeName(options.name);
  return fetchResolverJson<ResolverNameRecord>({
    ...(options.resolverUrl ? { resolverUrl: options.resolverUrl } : {}),
    path: `/name/${encodeURIComponent(normalized)}`
  });
}

export async function fetchNameValueRecord(options: {
  readonly name: string;
  readonly resolverUrl?: string;
}): Promise<ResolverValueRecord> {
  const normalized = normalizeName(options.name);
  return fetchResolverJson<ResolverValueRecord>({
    ...(options.resolverUrl ? { resolverUrl: options.resolverUrl } : {}),
    path: `/name/${encodeURIComponent(normalized)}/value`
  });
}

export async function fetchNameValueHistory(options: {
  readonly name: string;
  readonly resolverUrl?: string;
}): Promise<ResolverValueHistory> {
  const normalized = normalizeName(options.name);
  return fetchResolverJson<ResolverValueHistory>({
    ...(options.resolverUrl ? { resolverUrl: options.resolverUrl } : {}),
    path: `/name/${encodeURIComponent(normalized)}/value/history`
  });
}

export async function fetchNameRecoveryDescriptor(options: {
  readonly name: string;
  readonly resolverUrl?: string;
}): Promise<ResolverRecoveryDescriptor> {
  const normalized = normalizeName(options.name);
  return fetchResolverJson<ResolverRecoveryDescriptor>({
    ...(options.resolverUrl ? { resolverUrl: options.resolverUrl } : {}),
    path: `/name/${encodeURIComponent(normalized)}/recovery`
  });
}

export async function fetchNameRecoveryDescriptorHistory(options: {
  readonly name: string;
  readonly resolverUrl?: string;
}): Promise<ResolverRecoveryDescriptorHistory> {
  const normalized = normalizeName(options.name);
  return fetchResolverJson<ResolverRecoveryDescriptorHistory>({
    ...(options.resolverUrl ? { resolverUrl: options.resolverUrl } : {}),
    path: `/name/${encodeURIComponent(normalized)}/recovery/history`
  });
}

export async function fetchNameValueHistoryFromResolvers(options: {
  readonly name: string;
  readonly resolverUrls?: readonly string[];
}): Promise<MultiResolverValueHistorySummary> {
  const normalized = normalizeName(options.name);
  const resolverUrls = resolveResolverUrls(options.resolverUrls);
  const resolverResults = await Promise.all(
    resolverUrls.map(async (resolverUrl): Promise<MultiResolverValueHistoryResult> => {
      try {
        return {
          resolverUrl,
          outcome: "ok",
          history: await fetchNameValueHistory({
            name: normalized,
            resolverUrl
          }),
          status: 200,
          code: null,
          message: null
        };
      } catch (error) {
        if (error instanceof ResolverHttpError && error.code === "value_not_found") {
          return {
            resolverUrl,
            outcome: "missing",
            history: null,
            status: error.status,
            code: error.code,
            message: error.message
          };
        }

        return {
          resolverUrl,
          outcome: "error",
          history: null,
          status: error instanceof ResolverHttpError ? error.status : null,
          code: error instanceof ResolverHttpError ? error.code : "resolver_request_failed",
          message: error instanceof Error ? error.message : "Unable to load value history."
        };
      }
    })
  );

  const missingResolverUrls = resolverResults
    .filter((result) => result.outcome === "missing")
    .map((result) => result.resolverUrl);
  const failedResolverUrls = resolverResults
    .filter((result) => result.outcome === "error")
    .map((result) => result.resolverUrl);
  const okResults = resolverResults.filter(
    (result): result is MultiResolverValueHistoryResult & { readonly outcome: "ok"; readonly history: ResolverValueHistory } =>
      result.outcome === "ok" && result.history !== null
  );

  // MR1: only a cryptographically verified history may become canonical, so a
  // single malicious resolver can't win by serving a forged-but-longer chain.
  const verifiedResults = okResults.filter((result) => verifyResolverValueHistory(result.history));
  const rejectedResolverUrls = okResults
    .filter((result) => !verifyResolverValueHistory(result.history))
    .map((result) => result.resolverUrl);

  if (verifiedResults.length === 0) {
    return {
      kind: "ont-multi-resolver-value-history",
      name: normalized,
      resolverCount: resolverUrls.length,
      status: rejectedResolverUrls.length > 0 ? "conflict" : "all_missing",
      canonicalResolverUrl: null,
      canonicalHistory: null,
      canonicalValueRecord: null,
      ownershipRef: null,
      currentRecordHash: null,
      currentSequence: null,
      laggingResolverUrls: [],
      missingResolverUrls,
      conflictingResolverUrls: [],
      rejectedResolverUrls,
      failedResolverUrls,
      resolverResults
    };
  }

  const canonicalResult = [...verifiedResults].sort(compareValueHistoryResults)[0] as MultiResolverValueHistoryResult & {
    readonly outcome: "ok";
    readonly history: ResolverValueHistory;
  };
  const canonicalHistory = canonicalResult.history;
  const canonicalValueRecord = getCurrentValueRecordFromHistory(canonicalHistory);
  const laggingResolverUrls: string[] = [];
  const conflictingResolverUrls: string[] = [];

  if (canonicalHistory.hasGaps || canonicalHistory.hasForks) {
    conflictingResolverUrls.push(canonicalResult.resolverUrl);
  }

  for (const result of verifiedResults) {
    if (result.resolverUrl === canonicalResult.resolverUrl) {
      continue;
    }

    const compatibility = classifyValueHistoryCompatibility(result.history, canonicalHistory);
    if (compatibility === "lagging") {
      laggingResolverUrls.push(result.resolverUrl);
      continue;
    }

    if (compatibility === "conflict") {
      conflictingResolverUrls.push(result.resolverUrl);
    }
  }

  return {
    kind: "ont-multi-resolver-value-history",
    name: normalized,
    resolverCount: resolverUrls.length,
    status:
      conflictingResolverUrls.length > 0 || rejectedResolverUrls.length > 0
        ? "conflict"
        : laggingResolverUrls.length > 0 || missingResolverUrls.length > 0
          ? "lagging"
          : "consistent",
    canonicalResolverUrl: canonicalResult.resolverUrl,
    canonicalHistory,
    canonicalValueRecord,
    ownershipRef: canonicalHistory.ownershipRef,
    currentRecordHash: canonicalHistory.currentRecordHash,
    currentSequence: canonicalValueRecord?.sequence ?? null,
    laggingResolverUrls,
    missingResolverUrls,
    conflictingResolverUrls,
    rejectedResolverUrls,
    failedResolverUrls,
    resolverResults
  };
}

export async function fetchNameActivity(options: {
  readonly name: string;
  readonly resolverUrl?: string;
  readonly limit?: number;
}): Promise<ResolverNameActivityResponse> {
  const normalized = normalizeName(options.name);
  const search = new URLSearchParams();

  if (options.limit !== undefined) {
    if (!Number.isSafeInteger(options.limit) || options.limit < 0) {
      throw new Error("limit must be a non-negative safe integer");
    }

    search.set("limit", String(options.limit));
  }

  return fetchResolverJson<ResolverNameActivityResponse>({
    ...(options.resolverUrl ? { resolverUrl: options.resolverUrl } : {}),
    path: `/name/${encodeURIComponent(normalized)}/activity${search.size > 0 ? `?${search.toString()}` : ""}`
  });
}

export async function fetchTransactionProvenance(options: {
  readonly txid: string;
  readonly resolverUrl?: string;
}): Promise<ResolverTransactionProvenance> {
  const normalized = options.txid.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error("txid must be 64 hex characters");
  }

  return fetchResolverJson<ResolverTransactionProvenance>({
    ...(options.resolverUrl ? { resolverUrl: options.resolverUrl } : {}),
    path: `/tx/${normalized}`
  });
}

export async function fetchRecentActivity(options?: {
  readonly resolverUrl?: string;
  readonly limit?: number;
}): Promise<readonly ResolverRecentActivityRecord[]> {
  const search = new URLSearchParams();

  if (options?.limit !== undefined) {
    if (!Number.isSafeInteger(options.limit) || options.limit < 0) {
      throw new Error("limit must be a non-negative safe integer");
    }

    search.set("limit", String(options.limit));
  }

  const path = search.size > 0 ? `/activity?${search.toString()}` : "/activity";
  const result = await fetchResolverJson<{ readonly activity: readonly ResolverRecentActivityRecord[] }>({
    ...(options?.resolverUrl ? { resolverUrl: options.resolverUrl } : {}),
    path
  });

  return Array.isArray(result.activity) ? result.activity : [];
}

async function fetchResolverJson<T>(input: {
  readonly resolverUrl?: string;
  readonly path: string;
}): Promise<T> {
  const resolverUrl = resolveResolverUrl(input.resolverUrl).replace(/\/$/, "");
  const response = await fetch(`${resolverUrl}${input.path}`);
  const raw = await response.text();
  const parsed = raw.length === 0 ? null : JSON.parse(raw);

  if (!response.ok) {
    const code =
      parsed !== null &&
      typeof parsed === "object" &&
      "error" in parsed &&
      typeof parsed.error === "string"
        ? parsed.error
        : "resolver_http_error";
    const message =
      parsed !== null &&
      typeof parsed === "object" &&
      "message" in parsed &&
      typeof parsed.message === "string"
        ? parsed.message
        : `resolver returned HTTP ${response.status}`;

    throw new ResolverHttpError({
      status: response.status,
      code,
      message,
      payload: parsed
    });
  }

  return parsed as T;
}

function parseResolverUrlList(raw: string | undefined): readonly string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(/[\s,]+/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeResolverUrls(input: readonly string[] | undefined): readonly string[] {
  if (!input || input.length === 0) {
    return [];
  }

  return [...new Set(input.map((entry) => entry.trim()).filter((entry) => entry.length > 0))];
}

function compareValueHistoryResults(
  left: MultiResolverValueHistoryResult & { readonly outcome: "ok"; readonly history: ResolverValueHistory },
  right: MultiResolverValueHistoryResult & { readonly outcome: "ok"; readonly history: ResolverValueHistory }
): number {
  if (left.history.completeToSequence !== right.history.completeToSequence) {
    return right.history.completeToSequence - left.history.completeToSequence;
  }

  if (left.history.completeFromSequence !== right.history.completeFromSequence) {
    return left.history.completeFromSequence - right.history.completeFromSequence;
  }

  return left.resolverUrl.localeCompare(right.resolverUrl);
}

function classifyValueHistoryCompatibility(
  candidate: ResolverValueHistory,
  canonical: ResolverValueHistory
): "equal" | "lagging" | "conflict" {
  if (candidate.hasGaps || candidate.hasForks || canonical.hasGaps || canonical.hasForks) {
    return "conflict";
  }

  if (candidate.ownershipRef !== canonical.ownershipRef) {
    return "conflict";
  }

  const canonicalRecordsBySequence = new Map(
    canonical.records.map((record) => [record.sequence, record.recordHash])
  );

  for (const record of candidate.records) {
    if (canonicalRecordsBySequence.get(record.sequence) !== record.recordHash) {
      return "conflict";
    }
  }

  const hasSameVisibleRange =
    candidate.completeFromSequence === canonical.completeFromSequence
    && candidate.completeToSequence === canonical.completeToSequence
    && candidate.currentRecordHash === canonical.currentRecordHash
    && candidate.records.length === canonical.records.length;

  return hasSameVisibleRange ? "equal" : "lagging";
}

function getCurrentValueRecordFromHistory(history: ResolverValueHistory): ResolverValueRecord | null {
  return history.records.at(-1) ?? null;
}
