// @ont/web live — env selector for the resolver name-state source.
//
// Mirrors selectResolverTxSource's ONT_RESOLVER_URL law:
//   - unset -> undefined (hermetic default)
//   - present nonempty -> createResolverNameStateSource(url)
//   - present empty/blank -> throw /ONT_RESOLVER_URL/ (fail closed)
import { createResolverNameStateSource, type ResolverNameStateSource } from "./resolver-name-state-source.js";

export function selectResolverNameStateSource(env: Record<string, string | undefined>): ResolverNameStateSource | undefined {
  const raw = env.ONT_RESOLVER_URL;
  if (raw === undefined) return undefined;
  const url = raw.trim();
  if (url === "") throw new Error("ONT_RESOLVER_URL is set but empty - set a resolver base URL or unset it");
  return createResolverNameStateSource(url);
}
