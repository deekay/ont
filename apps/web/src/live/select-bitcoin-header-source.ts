import type { BitcoinHeaderSource } from "@ont/light-client";
import { LAUNCH_CONFIRMATION_DEPTH } from "@ont/launch-config";

export type BitcoinHeaderSourceRegistry = Readonly<Record<string, BitcoinHeaderSource>>;

export const ONT_WEB_BITCOIN_HEADER_SOURCE_ENV = "ONT_WEB_BITCOIN_HEADER_SOURCE";
export const FIXTURE_BLOCK_170_HEADER_SOURCE_ID = "fixture:block-170";

const BLOCK_170_HEADER =
  "0100000055bd840a78798ad0da853f68974f3d183e2bd1db6a842c1feecf222a00000000ff104ccb05421ab93e63f8c3ce5c2c2e9dbb37de2764b3a3175c8166562cac7d51b96a49ffff001d283e9e70";

const BUILT_IN_HEADER_SOURCES: BitcoinHeaderSourceRegistry = {
  [FIXTURE_BLOCK_170_HEADER_SOURCE_ID]: {
    headerHexAtHeight: (height) => (height === 170 || height === 170 + LAUNCH_CONFIRMATION_DEPTH ? BLOCK_170_HEADER : null),
  },
};

/**
 * Env-selected header source seam for the web. The default suite passes no registry and remains network-free:
 * unset -> undefined, empty/blank -> throw, unknown nonempty id -> throw. Tests and future live wiring can inject
 * a registry entry without rewriting the web render path.
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
