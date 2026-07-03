import { isCanonicalName } from "@ont/wire";
import {
  LAUNCH_CONFIRMATION_DEPTH,
  SIGNET_LAUNCH_CHECKPOINT_ID,
} from "@ont/launch-config";
import {
  checkProofBundleHeaderDepthCoverage,
  createEsploraHeaderRangeProvider,
  createResolverHeaderRangeProvider,
  fetchSignetLaunchHeaderSource,
  proofBundleMaxAnchorHeight,
  runVerifyProofBundleAgainstBitcoin,
  type HeaderRangeProvider,
} from "@ont/light-client";

export const ONT_BITCOIN_HEADER_SOURCE_ENV = "ONT_BITCOIN_HEADER_SOURCE";
export const ONT_HEADER_PROVIDER_ENV = "ONT_HEADER_PROVIDER";
export const ONT_ESPLORA_URL_ENV = "ONT_ESPLORA_URL";
export const ONT_RESOLVER_URL_ENV = "ONT_RESOLVER_URL";

export type ResolverNameProofBundleSource = (name: string) => Promise<unknown | null>;

export type CliVerifyNameResult =
  | {
      readonly ok: true;
      readonly state: "bitcoin-verified";
      readonly name: string;
      readonly anchorHeight: number;
      readonly requiredHeight: number;
      readonly checkpointId: string;
      readonly network: "signet";
      readonly signetHeaderAuthenticity: "provider-trusted";
    }
  | {
      readonly ok: false;
      readonly state: "resolver-mirror";
      readonly name: string;
      readonly reason: string;
    }
  | {
      readonly ok: false;
      readonly state: "unavailable";
      readonly name: string;
      readonly reason: "invalid-name" | "name-not-served" | "resolver-unavailable";
    };

export interface VerifyNameAgainstResolverInput {
  readonly name: string;
  readonly proofBundleSource: ResolverNameProofBundleSource;
  readonly headerProvider?: HeaderRangeProvider | null | undefined;
}

export function selectCliVerifyResolverUrl(env: Record<string, string | undefined>): string | null {
  const resolverRaw = env[ONT_RESOLVER_URL_ENV];
  if (resolverRaw !== undefined) {
    const resolverUrl = resolverRaw.trim();
    if (resolverUrl === "") throw new Error(`${ONT_RESOLVER_URL_ENV} is set but empty`);
    return resolverUrl;
  }
  const source = parseResolverHeaderSource(env[ONT_BITCOIN_HEADER_SOURCE_ENV]);
  return source?.resolverUrl ?? null;
}

export function selectCliVerifyHeaderProvider(
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
): HeaderRangeProvider | null {
  const provider = parseHeaderProvider(env[ONT_HEADER_PROVIDER_ENV]);
  if (provider !== null) {
    if (provider === "resolver") {
      const resolverUrl = selectCliVerifyResolverUrl(env);
      if (resolverUrl === null) throw new Error(`${ONT_HEADER_PROVIDER_ENV}=resolver requires ${ONT_RESOLVER_URL_ENV} or ${ONT_BITCOIN_HEADER_SOURCE_ENV}=resolver:<url>`);
      return createResolverHeaderRangeProvider({ resolverUrl, fetchImpl });
    }
    if (provider === "esplora") {
      return createEsploraHeaderRangeProvider({ esploraBaseUrl: requiredEnv(env, ONT_ESPLORA_URL_ENV), fetchImpl });
    }
    throw new Error(`${ONT_HEADER_PROVIDER_ENV}=node is deferred for slice 8; use resolver or esplora`);
  }

  const source = parseResolverHeaderSource(env[ONT_BITCOIN_HEADER_SOURCE_ENV]);
  return source === null ? null : createResolverHeaderRangeProvider({ resolverUrl: source.resolverUrl, fetchImpl });
}

export function createResolverNameProofBundleSource(
  resolverUrl: string,
  fetchImpl: typeof fetch = fetch,
): ResolverNameProofBundleSource {
  const base = resolverUrl.replace(/\/+$/, "");
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
    if (!isRecord(body) || body.ok !== true || !isRecord(body.proofBundle)) {
      throw new Error("resolver name-state read failed: malformed ServedNameStateResult body");
    }
    return body.proofBundle;
  };
}

export async function verifyNameAgainstResolver(input: VerifyNameAgainstResolverInput): Promise<CliVerifyNameResult> {
  const { name } = input;
  if (!isCanonicalName(name)) return { ok: false, state: "unavailable", name, reason: "invalid-name" };
  let proofBundle: unknown | null;
  try {
    proofBundle = await input.proofBundleSource(name);
  } catch {
    return { ok: false, state: "unavailable", name, reason: "resolver-unavailable" };
  }
  if (proofBundle === null) return { ok: false, state: "unavailable", name, reason: "name-not-served" };

  const headerSource = await fetchHeaderSourceForProofBundle(proofBundle, input.headerProvider ?? null);
  const verification = runVerifyProofBundleAgainstBitcoin({ bundle: proofBundle, headerSource });
  if (!verification.ok) return { ok: false, state: "resolver-mirror", name, reason: verification.reason };

  const coverage = checkProofBundleHeaderDepthCoverage({
    bundle: proofBundle,
    headerSource,
    confirmationDepth: LAUNCH_CONFIRMATION_DEPTH,
  });
  if (!coverage.ok) return { ok: false, state: "resolver-mirror", name, reason: coverage.reason };

  return {
    ok: true,
    state: "bitcoin-verified",
    name,
    anchorHeight: coverage.anchorHeight,
    requiredHeight: coverage.requiredHeight,
    checkpointId: SIGNET_LAUNCH_CHECKPOINT_ID,
    network: "signet",
    signetHeaderAuthenticity: "provider-trusted",
  };
}

export function renderCliVerifyNameResult(result: CliVerifyNameResult): string {
  if (result.ok) {
    return [
      `Bitcoin-verified: ${result.name}`,
      `anchorHeight=${result.anchorHeight}`,
      `requiredHeight=${result.requiredHeight}`,
      `checkpoint=${result.checkpointId}`,
      `network=${result.network}`,
      `signetHeaderAuthenticity=${result.signetHeaderAuthenticity}`,
    ].join("\n");
  }
  if (result.state === "resolver-mirror") {
    return [
      `resolver-mirror: ${result.name}`,
      "not Bitcoin-verified",
      `reason=${result.reason}`,
    ].join("\n");
  }
  return [`unavailable: ${result.name}`, `reason=${result.reason}`].join("\n");
}

export async function runOntCli(
  argv: readonly string[],
  env: Record<string, string | undefined> = process.env,
  io: { readonly stdout: (text: string) => void; readonly stderr: (text: string) => void } = {
    stdout: (text) => console.log(text),
    stderr: (text) => console.error(text),
  },
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  if (argv.length !== 2 || argv[0] !== "verify") {
    io.stderr("Usage: ont verify <name>");
    return 2;
  }
  const name = argv[1]!;
  let resolverUrl: string | null;
  let headerProvider: HeaderRangeProvider | null;
  try {
    resolverUrl = selectCliVerifyResolverUrl(env);
    headerProvider = selectCliVerifyHeaderProvider(env, fetchImpl);
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
    return 2;
  }
  if (resolverUrl === null) {
    io.stderr(`Set ${ONT_RESOLVER_URL_ENV} or ${ONT_BITCOIN_HEADER_SOURCE_ENV}=resolver:<url>`);
    return 2;
  }

  const result = await verifyNameAgainstResolver({
    name,
    proofBundleSource: createResolverNameProofBundleSource(resolverUrl, fetchImpl),
    headerProvider,
  });
  io.stdout(renderCliVerifyNameResult(result));
  return result.ok ? 0 : 1;
}

async function fetchHeaderSourceForProofBundle(
  proofBundle: unknown,
  provider: HeaderRangeProvider | null,
) {
  if (provider === null) return null;
  const anchorHeight = proofBundleMaxAnchorHeight(proofBundle);
  if (anchorHeight === null) return null;
  const source = await fetchSignetLaunchHeaderSource({ anchorHeight, provider });
  return source.ok ? source.headerSource : null;
}

function parseResolverHeaderSource(raw: string | undefined): { readonly resolverUrl: string } | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === "") throw new Error(`${ONT_BITCOIN_HEADER_SOURCE_ENV} is set but empty`);
  const prefix = "resolver:";
  if (!trimmed.startsWith(prefix)) {
    throw new Error(`${ONT_BITCOIN_HEADER_SOURCE_ENV} must be resolver:<url>`);
  }
  const resolverUrl = trimmed.slice(prefix.length).trim();
  if (resolverUrl === "") throw new Error(`${ONT_BITCOIN_HEADER_SOURCE_ENV} resolver source is missing a URL`);
  return { resolverUrl };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
