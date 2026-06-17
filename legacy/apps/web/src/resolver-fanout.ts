import { normalizeName, type SignedValueRecord } from "@ont/protocol";

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
  readonly failedResolverUrls: readonly string[];
  readonly resolverResults: readonly MultiResolverValueHistoryResult[];
}

export interface MultiResolverValuePublishResult {
  readonly resolverUrl: string;
  readonly ok: boolean;
  readonly status: number | null;
  readonly code: string | null;
  readonly message: string | null;
  readonly payload: unknown;
}

export interface MultiResolverValuePublishSummary {
  readonly kind: "ont-multi-resolver-value-publish";
  readonly name: string;
  readonly sequence: number;
  readonly resolverCount: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly results: readonly MultiResolverValuePublishResult[];
}

export function resolveConfiguredResolverUrls(
  primaryResolverUrl: string,
  rawResolverUrls?: string | null
): readonly string[] {
  return [
    primaryResolverUrl,
    ...parseResolverUrlList(rawResolverUrls ?? "")
  ].filter((entry, index, array) => array.indexOf(entry) === index);
}

export async function fetchNameValueHistoryFromResolvers(options: {
  readonly name: string;
  readonly resolverUrls: readonly string[];
}): Promise<MultiResolverValueHistorySummary> {
  const normalized = normalizeName(options.name);
  const resolverResults = await Promise.all(
    options.resolverUrls.map(async (resolverUrl): Promise<MultiResolverValueHistoryResult> => {
      try {
        return {
          resolverUrl,
          outcome: "ok",
          history: await fetchResolverValueHistory(normalized, resolverUrl),
          status: 200,
          code: null,
          message: null
        };
      } catch (error) {
        const resolved = resolveResolverError(error);

        if (resolved.status === 404 && resolved.code === "value_not_found") {
          return {
            resolverUrl,
            outcome: "missing",
            history: null,
            status: resolved.status,
            code: resolved.code,
            message: resolved.message
          };
        }

        return {
          resolverUrl,
          outcome: "error",
          history: null,
          status: resolved.status,
          code: resolved.code,
          message: resolved.message
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
    (result): result is MultiResolverValueHistoryResult & {
      readonly outcome: "ok";
      readonly history: ResolverValueHistory;
    } => result.outcome === "ok" && result.history !== null
  );

  if (okResults.length === 0) {
    return {
      kind: "ont-multi-resolver-value-history",
      name: normalized,
      resolverCount: options.resolverUrls.length,
      status: "all_missing",
      canonicalResolverUrl: null,
      canonicalHistory: null,
      canonicalValueRecord: null,
      ownershipRef: null,
      currentRecordHash: null,
      currentSequence: null,
      laggingResolverUrls: [],
      missingResolverUrls,
      conflictingResolverUrls: [],
      failedResolverUrls,
      resolverResults
    };
  }

  const canonicalResult = [...okResults].sort(compareValueHistoryResults)[0] as MultiResolverValueHistoryResult & {
    readonly outcome: "ok";
    readonly history: ResolverValueHistory;
  };
  const canonicalHistory = canonicalResult.history;
  const canonicalValueRecord = canonicalHistory.records.at(-1) ?? null;
  const laggingResolverUrls: string[] = [];
  const conflictingResolverUrls: string[] = [];

  if (canonicalHistory.hasGaps || canonicalHistory.hasForks) {
    conflictingResolverUrls.push(canonicalResult.resolverUrl);
  }

  for (const result of okResults) {
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
    resolverCount: options.resolverUrls.length,
    status:
      conflictingResolverUrls.length > 0
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
    failedResolverUrls,
    resolverResults
  };
}

export async function publishValueRecordToResolvers(options: {
  readonly resolverUrls: readonly string[];
  readonly valueRecord: SignedValueRecord;
}): Promise<MultiResolverValuePublishSummary> {
  const results = await Promise.all(
    options.resolverUrls.map(async (resolverUrl): Promise<MultiResolverValuePublishResult> => {
      try {
        const response = await fetch(`${resolverUrl.replace(/\/$/, "")}/values`, {
          method: "POST",
          headers: {
            "content-type": "application/json; charset=utf-8"
          },
          body: JSON.stringify(options.valueRecord)
        });
        const raw = await response.text();
        const payload = raw.length === 0 ? null : JSON.parse(raw);

        if (!response.ok) {
          return {
            resolverUrl,
            ok: false,
            status: response.status,
            code: extractErrorCode(payload),
            message: extractErrorMessage(payload, response.status),
            payload
          };
        }

        return {
          resolverUrl,
          ok: true,
          status: response.status,
          code: null,
          message: null,
          payload
        };
      } catch (error) {
        const resolved = resolveResolverError(error);
        return {
          resolverUrl,
          ok: false,
          status: resolved.status,
          code: resolved.code,
          message: resolved.message,
          payload: null
        };
      }
    })
  );

  const successCount = results.filter((result) => result.ok).length;

  return {
    kind: "ont-multi-resolver-value-publish",
    name: options.valueRecord.name,
    sequence: options.valueRecord.sequence,
    resolverCount: options.resolverUrls.length,
    successCount,
    failureCount: options.resolverUrls.length - successCount,
    results
  };
}

async function fetchResolverValueHistory(
  normalizedName: string,
  resolverUrl: string
): Promise<ResolverValueHistory> {
  const response = await fetch(
    `${resolverUrl.replace(/\/$/, "")}/name/${encodeURIComponent(normalizedName)}/value/history`
  );
  const raw = await response.text();
  const payload = raw.length === 0 ? null : JSON.parse(raw);

  if (!response.ok) {
    throw {
      status: response.status,
      code: extractErrorCode(payload),
      message: extractErrorMessage(payload, response.status)
    };
  }

  return payload as ResolverValueHistory;
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

function parseResolverUrlList(raw: string): readonly string[] {
  return raw
    .split(/[\s,]+/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function extractErrorCode(payload: unknown): string {
  return (
    typeof payload === "object"
    && payload !== null
    && "error" in payload
    && typeof payload.error === "string"
  )
    ? payload.error
    : "resolver_http_error";
}

function extractErrorMessage(payload: unknown, status: number): string {
  return (
    typeof payload === "object"
    && payload !== null
    && "message" in payload
    && typeof payload.message === "string"
  )
    ? payload.message
    : `resolver returned HTTP ${status}`;
}

function resolveResolverError(error: unknown): {
  readonly status: number | null;
  readonly code: string;
  readonly message: string;
} {
  if (typeof error === "object" && error !== null) {
    const status =
      "status" in error && typeof error.status === "number"
        ? error.status
        : null;
    const code =
      "code" in error && typeof error.code === "string"
        ? error.code
        : "resolver_request_failed";
    const message =
      "message" in error && typeof error.message === "string"
        ? error.message
        : "Resolver request failed.";

    return {
      status,
      code,
      message
    };
  }

  return {
    status: null,
    code: "resolver_request_failed",
    message: error instanceof Error ? error.message : "Resolver request failed."
  };
}
