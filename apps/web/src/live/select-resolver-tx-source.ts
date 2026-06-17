// @ont/web live — G2 slice 5b-2: the web `main` env selector for the live resolver tx source.
//
// Maps ONT_RESOLVER_URL to a ResolverTxSource | undefined for the web `main`:
//   - unset            -> undefined (hermetic default — the server runs with no live source, sync port only)
//   - present nonempty -> createResolverTxSource(url)
//   - present empty/blank -> THROW /ONT_RESOLVER_URL/ (fail closed — never normalize "" to absent, and never
//     let an empty base slip a relative `/tx/...` fetch through; CL guardrail, event e0a40c38 / 5b-2 concur).
// The web `main` passes the result as `txSource` into createWebHttpServer / handleWebRequest.
// RED stub — slice 5b-2 green implements the mapping below. TESTS: ./select-resolver-tx-source.test.ts.
import type { ResolverTxSource } from "./resolver-tx-source.js";

export function selectResolverTxSource(env: Record<string, string | undefined>): ResolverTxSource | undefined {
  void env;
  throw new Error("selectResolverTxSource: not implemented (G2 slice 5b-2 RED)");
}
