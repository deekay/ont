// @ont/web live — G2 slice 5b-2: the web `main` env selector for the live resolver tx source.
//
// Maps ONT_RESOLVER_URL to a ResolverTxSource | undefined for the web `main`:
//   - unset            -> undefined (hermetic default — the server runs with no live source, sync port only)
//   - present nonempty -> createResolverTxSource(url)
//   - present empty/blank -> THROW /ONT_RESOLVER_URL/ (fail closed — never normalize "" to absent, and never
//     let an empty base slip a relative `/tx/...` fetch through; CL guardrail, event e0a40c38 / 5b-2 concur).
// The web `main` passes the result as `txSource` into createWebHttpServer / handleWebRequest.
// TESTS: ./select-resolver-tx-source.test.ts.
import { createResolverTxSource, type ResolverTxSource } from "./resolver-tx-source.js";

export function selectResolverTxSource(env: Record<string, string | undefined>): ResolverTxSource | undefined {
  const raw = env.ONT_RESOLVER_URL;
  if (raw === undefined) return undefined; // unset → hermetic default, no live source (sync port only)
  // Fail closed: empty/blank is NOT normalized to absent, so an empty base can never slip a relative /tx fetch.
  const url = raw.trim();
  if (url === "") throw new Error("ONT_RESOLVER_URL is set but empty — set a resolver base URL or unset it");
  return createResolverTxSource(url);
}
