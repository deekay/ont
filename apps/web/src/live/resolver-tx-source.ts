// @ont/web live — G2 slice 5a: the live resolver tx read source (web → resolver GET /tx/:txid over HTTP).
//
// An async (txid) → Promise<ServedTx | null> the web request handler prefetches per request (request-scoped —
// NO process-global snapshot, so the restart gate proves a real HTTP read). Semantics (CL, event e0a40c38):
//   - 200 + valid ServedTx JSON → the ServedTx
//   - 404 → null (the resolver says the tx is absent)
//   - network error / non-404 non-2xx / malformed 200 → THROW (the live read path is broken — surfaced as a
//     handler 5xx, never confused with "absent").
// WebReadPort.tx stays SYNC; this is the async edge the handler awaits. Injected fetch for tests; global fetch
// in prod. TESTS: ./resolver-tx-source.test.ts.
import type { ServedTx, ServedTxOutput } from "@ont/adapter-resolver";

export type ResolverTxSource = (txid: string) => Promise<ServedTx | null>;

function isServedTxOutput(value: unknown): value is ServedTxOutput {
  if (typeof value !== "object" || value === null) return false;
  const o = value as Record<string, unknown>;
  return typeof o.valueSats === "string" && typeof o.scriptHex === "string" && (o.address === null || typeof o.address === "string");
}

function isServedTx(value: unknown): value is ServedTx {
  if (typeof value !== "object" || value === null) return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.txid === "string" &&
    (o.blockHash === null || typeof o.blockHash === "string") &&
    (o.blockHeight === null || typeof o.blockHeight === "number") &&
    (o.carrierPayloadHex === null || typeof o.carrierPayloadHex === "string") &&
    Array.isArray(o.outputs) &&
    o.outputs.every(isServedTxOutput)
  );
}

/**
 * A transport adapter only — no rendering / web-port coupling. Normalizes the base URL by stripping ONLY
 * trailing slashes (a configured base path is preserved), requests `/tx/${encodeURIComponent(txid)}`, and
 * maps the response: 200 + valid ServedTx → the ServedTx; 404 → null; everything else (network error /
 * non-404 non-2xx / malformed 200) → throw, so a broken live read is never confused with "absent".
 */
export function createResolverTxSource(baseUrl: string, fetchImpl: typeof fetch = fetch): ResolverTxSource {
  const base = baseUrl.replace(/\/+$/, "");
  return async (txid) => {
    const res = await fetchImpl(`${base}/tx/${encodeURIComponent(txid)}`); // network error propagates
    if (res.status === 404) return null;
    if (res.status !== 200) throw new Error(`resolver tx read failed: status ${res.status}`);
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new Error("resolver tx read failed: malformed JSON body");
    }
    if (!isServedTx(body)) throw new Error("resolver tx read failed: malformed ServedTx body");
    return body;
  };
}
