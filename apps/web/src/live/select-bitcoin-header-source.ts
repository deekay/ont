import {
  SIGNET_LAUNCH_HEADER_SOURCE_ID,
  createEsploraHeaderRangeProvider,
  createResolverHeaderRangeProvider,
  type EsploraHeaderRangeProviderOptions,
  type HeaderRangeProvider,
  type ResolverHeaderRangeProviderOptions,
} from "@ont/light-client";

export { SIGNET_LAUNCH_HEADER_SOURCE_ID };

export const ONT_WEB_BITCOIN_HEADER_SOURCE_ENV = "ONT_WEB_BITCOIN_HEADER_SOURCE";
export const ONT_HEADER_PROVIDER_ENV = "ONT_HEADER_PROVIDER";
export const ONT_ESPLORA_URL_ENV = "ONT_ESPLORA_URL";
export const ONT_RESOLVER_URL_ENV = "ONT_RESOLVER_URL";

export type BitcoinHeaderProviderFactory = (input: ResolverHeaderRangeProviderOptions) => HeaderRangeProvider;
export interface BitcoinHeaderProviderFactories {
  readonly resolver?: ((input: ResolverHeaderRangeProviderOptions) => HeaderRangeProvider) | undefined;
  readonly esplora?: ((input: EsploraHeaderRangeProviderOptions) => HeaderRangeProvider) | undefined;
}
interface NormalizedBitcoinHeaderProviderFactories {
  readonly resolver: (input: ResolverHeaderRangeProviderOptions) => HeaderRangeProvider;
  readonly esplora: (input: EsploraHeaderRangeProviderOptions) => HeaderRangeProvider;
}

/**
 * Env-selected live header provider seam for the web. The default suite remains network-free: unset ->
 * undefined, empty/blank -> throw, and the only live form is resolver:<base-url>. The provider is consumed
 * request-time after the served proof bundle is known; this selector never returns a prevalidated source.
 */
export function selectBitcoinHeaderProvider(
  env: Record<string, string | undefined>,
  providerFactory: BitcoinHeaderProviderFactory | BitcoinHeaderProviderFactories = createResolverHeaderRangeProvider,
): HeaderRangeProvider | undefined {
  const factories = normalizeFactories(providerFactory);
  const provider = parseHeaderProvider(env[ONT_HEADER_PROVIDER_ENV]);
  if (provider !== null) {
    if (provider === "resolver") {
      return factories.resolver({ resolverUrl: requiredEnv(env, ONT_RESOLVER_URL_ENV) });
    }
    if (provider === "esplora") {
      return factories.esplora({ esploraBaseUrl: requiredEnv(env, ONT_ESPLORA_URL_ENV) });
    }
    throw new Error(`${ONT_HEADER_PROVIDER_ENV}=node is deferred for slice 8; use resolver or esplora`);
  }

  const raw = env[ONT_WEB_BITCOIN_HEADER_SOURCE_ENV];
  if (raw === undefined) return undefined;
  const id = raw.trim();
  if (id === "") throw new Error(`${ONT_WEB_BITCOIN_HEADER_SOURCE_ENV} is set but empty - set a header source id or unset it`);
  const prefix = "resolver:";
  if (id.startsWith(prefix)) {
    const resolverUrl = id.slice(prefix.length).trim();
    if (resolverUrl === "") throw new Error(`${ONT_WEB_BITCOIN_HEADER_SOURCE_ENV} resolver source is missing a URL`);
    return factories.resolver({ resolverUrl });
  }
  throw new Error(`${ONT_WEB_BITCOIN_HEADER_SOURCE_ENV} references unsupported header source '${id}'`);
}

function normalizeFactories(input: BitcoinHeaderProviderFactory | BitcoinHeaderProviderFactories): NormalizedBitcoinHeaderProviderFactories {
  if (typeof input === "function") {
    return { resolver: input, esplora: createEsploraHeaderRangeProvider };
  }
  return {
    resolver: input.resolver ?? createResolverHeaderRangeProvider,
    esplora: input.esplora ?? createEsploraHeaderRangeProvider,
  };
}

function parseHeaderProvider(raw: string | undefined): "resolver" | "esplora" | "node" | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === "") throw new Error(`${ONT_HEADER_PROVIDER_ENV} is set but empty`);
  if (trimmed === "resolver" || trimmed === "esplora" || trimmed === "node") return trimmed;
  throw new Error(`${ONT_HEADER_PROVIDER_ENV} must be resolver, esplora, or node`);
}

function requiredEnv(env: Record<string, string | undefined>, key: string): string {
  const raw = env[key];
  if (raw === undefined) throw new Error(`${key} is required`);
  const value = raw.trim();
  if (value === "") throw new Error(`${key} is set but empty`);
  return value;
}
