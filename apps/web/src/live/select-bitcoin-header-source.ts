import {
  SIGNET_LAUNCH_HEADER_SOURCE_ID,
  createResolverHeaderRangeProvider,
  type HeaderRangeProvider,
  type ResolverHeaderRangeProviderOptions,
} from "@ont/light-client";

export { SIGNET_LAUNCH_HEADER_SOURCE_ID };

export const ONT_WEB_BITCOIN_HEADER_SOURCE_ENV = "ONT_WEB_BITCOIN_HEADER_SOURCE";

export type BitcoinHeaderProviderFactory = (input: ResolverHeaderRangeProviderOptions) => HeaderRangeProvider;

/**
 * Env-selected live header provider seam for the web. The default suite remains network-free: unset ->
 * undefined, empty/blank -> throw, and the only live form is resolver:<base-url>. The provider is consumed
 * request-time after the served proof bundle is known; this selector never returns a prevalidated source.
 */
export function selectBitcoinHeaderProvider(
  env: Record<string, string | undefined>,
  providerFactory: BitcoinHeaderProviderFactory = createResolverHeaderRangeProvider,
): HeaderRangeProvider | undefined {
  const raw = env[ONT_WEB_BITCOIN_HEADER_SOURCE_ENV];
  if (raw === undefined) return undefined;
  const id = raw.trim();
  if (id === "") throw new Error(`${ONT_WEB_BITCOIN_HEADER_SOURCE_ENV} is set but empty - set a header source id or unset it`);
  const prefix = "resolver:";
  if (id.startsWith(prefix)) {
    const resolverUrl = id.slice(prefix.length).trim();
    if (resolverUrl === "") throw new Error(`${ONT_WEB_BITCOIN_HEADER_SOURCE_ENV} resolver source is missing a URL`);
    return providerFactory({ resolverUrl });
  }
  throw new Error(`${ONT_WEB_BITCOIN_HEADER_SOURCE_ENV} references unsupported header source '${id}'`);
}
