import { SIGNET_LAUNCH_HEADER_SOURCE_ID, type BitcoinHeaderSource } from "@ont/light-client";

export { SIGNET_LAUNCH_HEADER_SOURCE_ID };

export type BitcoinHeaderSourceRegistry = Readonly<Record<string, BitcoinHeaderSource>>;

export const ONT_WEB_BITCOIN_HEADER_SOURCE_ENV = "ONT_WEB_BITCOIN_HEADER_SOURCE";

const BUILT_IN_HEADER_SOURCES: BitcoinHeaderSourceRegistry = {};

/**
 * Env-selected header source seam for the web. The default suite remains network-free: unset -> undefined,
 * empty/blank -> throw, unknown nonempty id -> throw. Tests and future live wiring inject a registry entry
 * (for example SIGNET_LAUNCH_HEADER_SOURCE_ID after the resolver-served range has been fetched and validated)
 * without rewriting the web render path.
 */
export function selectBitcoinHeaderSource(
  env: Record<string, string | undefined>,
  registry: BitcoinHeaderSourceRegistry = BUILT_IN_HEADER_SOURCES,
): BitcoinHeaderSource | undefined {
  const raw = env[ONT_WEB_BITCOIN_HEADER_SOURCE_ENV];
  if (raw === undefined) return undefined;
  const id = raw.trim();
  if (id === "") throw new Error(`${ONT_WEB_BITCOIN_HEADER_SOURCE_ENV} is set but empty - set a header source id or unset it`);
  const source = registry[id];
  if (source === undefined) throw new Error(`${ONT_WEB_BITCOIN_HEADER_SOURCE_ENV} references unsupported header source '${id}'`);
  return source;
}
