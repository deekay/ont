// @ont/web live — the live resolver name-state read source (web -> resolver GET /names/:name/state over HTTP).
//
// Status-specific contract:
//   - 200 + valid ServedNameStateResult ok:true JSON -> the served name state
//   - 404 -> null (the resolver says the name state is absent/not served)
//   - 409 / 503 / any other non-200 / malformed JSON / invalid ok:true body -> THROW
// A corrupt or broken resolver mirror is never confused with "absent".
import type { ServedNameStateResult } from "@ont/adapter-resolver";

export type ResolverNameStateSource = (name: string) => Promise<ServedNameStateResult | null>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string | number> {
  return isRecord(value) && Object.values(value).every((v) => typeof v === "string" || (typeof v === "number" && Number.isFinite(v)));
}

function isOwner(value: unknown): boolean {
  return isRecord(value) && value.kind === "owner-key" && typeof value.ownerPubkeyHex === "string";
}

function isAnchor(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.txid === "string" &&
    Number.isInteger(value.minedHeight) &&
    Number.isInteger(value.txIndex) &&
    Number.isInteger(value.vout)
  );
}

function isTraceStep(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.step === "string" &&
    typeof value.ok === "boolean" &&
    typeof value.reason === "string" &&
    (value.evidence === undefined || isStringRecord(value.evidence))
  );
}

function isServedNameStateOk(value: unknown): value is Extract<ServedNameStateResult, { readonly ok: true }> {
  if (!isRecord(value)) return false;
  return (
    value.ok === true &&
    typeof value.canonicalName === "string" &&
    isOwner(value.owner) &&
    typeof value.leafKeyHex === "string" &&
    Number.isInteger(value.batchLocalIndex) &&
    typeof value.anchoredRoot === "string" &&
    isAnchor(value.anchor) &&
    Number.isInteger(value.firstServableHeight) &&
    Array.isArray(value.trace) &&
    value.trace.every(isTraceStep) &&
    isRecord(value.proofBundle) &&
    value.provenance === "resolver-indexed-mirror" &&
    value.authority === "not-ownership-authority"
  );
}

export function createResolverNameStateSource(baseUrl: string, fetchImpl: typeof fetch = fetch): ResolverNameStateSource {
  const base = baseUrl.replace(/\/+$/, "");
  return async (name) => {
    const res = await fetchImpl(`${base}/names/${encodeURIComponent(name)}/state`);
    if (res.status === 404) return null;
    if (res.status !== 200) throw new Error(`resolver name-state read failed: status ${res.status}`);
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new Error("resolver name-state read failed: malformed JSON body");
    }
    if (!isServedNameStateOk(body)) {
      throw new Error("resolver name-state read failed: malformed ServedNameStateResult body");
    }
    return body;
  };
}
