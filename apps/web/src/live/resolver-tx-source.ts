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
import type { ServedTx } from "@ont/adapter-resolver";

export type ResolverTxSource = (txid: string) => Promise<ServedTx | null>;

export function createResolverTxSource(baseUrl: string, fetchImpl: typeof fetch = fetch): ResolverTxSource {
  void baseUrl;
  void fetchImpl;
  return () => Promise.reject(new Error("resolver tx source not implemented"));
}
