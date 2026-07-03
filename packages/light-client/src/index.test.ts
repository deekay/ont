import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";
import { verifyProofBundleAgainstBitcoin, verifyProofBundleStructure } from "@ont/consensus";
import type { BitcoinHeaderSource } from "@ont/consensus";
import {
  buildSignetLaunchHeaderSourceFromHeaders,
  checkProofBundleHeaderDepthCoverage,
  createEsploraHeaderRangeProvider,
  fetchSignetLaunchHeaderSource,
  createResolverHeaderRangeProvider,
  proofBundleMaxAnchorHeight,
  runInspectProofBundle,
  runVerifyProofBundleAgainstBitcoin,
  signetLaunchHeaderRange,
  type VerifyProofBundleAgainstBitcoinInput,
} from "./index.js";

const BLOCK_170_HEADER =
  "0100000055bd840a78798ad0da853f68974f3d183e2bd1db6a842c1feecf222a00000000ff104ccb05421ab93e63f8c3ce5c2c2e9dbb37de2764b3a3175c8166562cac7d51b96a49ffff001d283e9e70";
const BLOCK_176_HEADER =
  "01000000089d2d7196d00f737762fe82cfd86820c6e44bb2a9dd0f5fc1fc4afd000000005c3de10cb7cb6934b0050360980f9a37a95a8bf705edfbcbd3541591ad95c16466c96a49ffff001d09338966";
const MAINNET_HEADER_AT_311446 =
  "0200000040c79de67514e818f7d4868c58a5a41693a05d696e7a7a1c00000000000000006387626ac34066fef724cf097f23bcbfdaab1a5701f4edd0e5fb2418ae24db7e7cf9c953e66b3f181aeab162";
const GOOD_HEADER_SOURCE: BitcoinHeaderSource = {
  headerHexAtHeight: (height) => {
    if (height === 170) return BLOCK_170_HEADER;
    if (height === 176) return BLOCK_176_HEADER;
    return null;
  },
};

interface SignetHeaderFixture {
  readonly anchorHeight: number;
  readonly confirmationDepth: number;
  readonly requiredHeight: number;
  readonly headers: readonly { readonly height: number; readonly headerHex: string }[];
}

describe("@ont/light-client proof-bundle core", () => {
  it("surfaces the audited structural report verbatim", () => {
    const bundle = { proofSource: "accumulator_batch_claim", name: "alice" };
    const r = runInspectProofBundle(bundle);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.report).toEqual(verifyProofBundleStructure(bundle));
  });

  it("requires a header source instead of falling back to Merkle/PoW-only verification", async () => {
    const bundle = await loadBitcoinAnchoredBundle();
    expect(verifyProofBundleAgainstBitcoin(bundle).valid).toBe(true);

    const r = runVerifyProofBundleAgainstBitcoin({ bundle });

    expect(r).toEqual({ ok: false, reason: "missing-header-source" });
  });

  it("accepts a verified bundle and surfaces the audited Bitcoin report verbatim", async () => {
    const bundle = await loadBitcoinAnchoredBundle();
    const r = runVerifyProofBundleAgainstBitcoin({ bundle, headerSource: GOOD_HEADER_SOURCE });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.report).toEqual(verifyProofBundleAgainstBitcoin(bundle, { headerSource: GOOD_HEADER_SOURCE }));
  });

  it("rejects malformed input without throwing", () => {
    let r: ReturnType<typeof runVerifyProofBundleAgainstBitcoin> | undefined;
    expect(() => {
      r = runVerifyProofBundleAgainstBitcoin(null as unknown as VerifyProofBundleAgainstBitcoinInput);
    }).not.toThrow();
    expect(r).toEqual({ ok: false, reason: "malformed" });
  });
});

describe("checkProofBundleHeaderDepthCoverage", () => {
  it("passes only when the header source can answer anchor height + confirmation depth", async () => {
    const bundle = await loadBitcoinAnchoredBundle();
    expect(checkProofBundleHeaderDepthCoverage({ bundle, headerSource: GOOD_HEADER_SOURCE, confirmationDepth: 6 })).toEqual({
      ok: true,
      anchorHeight: 170,
      requiredHeight: 176,
    });
  });

  it("fails closed when the source stops at the anchor height", async () => {
    const bundle = await loadBitcoinAnchoredBundle();
    const short: BitcoinHeaderSource = { headerHexAtHeight: (height) => (height === 170 ? BLOCK_170_HEADER : null) };

    expect(checkProofBundleHeaderDepthCoverage({ bundle, headerSource: short, confirmationDepth: 6 })).toEqual({
      ok: false,
      reason: "short-header-range",
      anchorHeight: 170,
      requiredHeight: 176,
    });
  });

  it("surfaces the max proof-bundle anchor height for live range derivation", async () => {
    const bundle = await loadSignetAnchoredBundle();
    expect(proofBundleMaxAnchorHeight(bundle)).toBe(311_446);
    expect(proofBundleMaxAnchorHeight({ proofSource: "accumulator_batch_claim" })).toBeNull();
  });
});

describe("signet launch header source", () => {
  it("computes the checkpoint-forward range through anchor + launch depth", () => {
    expect(signetLaunchHeaderRange({ anchorHeight: 311_446 })).toEqual({
      ok: true,
      checkpointHeight: 311_445,
      startHeight: 311_446,
      count: 7,
      anchorHeight: 311_446,
      requiredHeight: 311_452,
      confirmationDepth: 6,
    });
  });

  it("validates a real signet range and verifies a real signet inclusion bundle", async () => {
    const fixture = await loadSignetHeaderRange();
    const headersHex = fixture.headers.map((header) => header.headerHex);
    const source = buildSignetLaunchHeaderSourceFromHeaders({ headersHex, anchorHeight: fixture.anchorHeight });
    expect(source.ok).toBe(true);
    if (!source.ok) return;

    const anchorHeader = fixture.headers[0]!;
    const coverageHeader = fixture.headers[fixture.headers.length - 1]!;
    expect(source.tipHeight).toBe(fixture.requiredHeight);
    expect(source.headerSource.headerHexAtHeight(anchorHeader.height)).toBe(anchorHeader.headerHex);
    expect(source.headerSource.headerHexAtHeight(coverageHeader.height)).toBe(coverageHeader.headerHex);
    expect(source.headerSource.headerHexAtHeight(coverageHeader.height + 1)).toBeNull();
    expect(source.headerSource.headerHexAtHeight(anchorHeader.height)).not.toBe(source.headerSource.headerHexAtHeight(coverageHeader.height));

    const bundle = await loadSignetAnchoredBundle();
    const verification = runVerifyProofBundleAgainstBitcoin({ bundle, headerSource: source.headerSource });
    expect(verification.ok).toBe(true);
    expect(checkProofBundleHeaderDepthCoverage({ bundle, headerSource: source.headerSource, confirmationDepth: fixture.confirmationDepth })).toEqual({
      ok: true,
      anchorHeight: fixture.anchorHeight,
      requiredHeight: fixture.requiredHeight,
    });
  });

  it("uses the injected header-range provider seam without live network I/O", async () => {
    const fixture = await loadSignetHeaderRange();
    const headersHex = fixture.headers.map((header) => header.headerHex);
    const source = await fetchSignetLaunchHeaderSource({
      anchorHeight: fixture.anchorHeight,
      provider: {
        fetchHeaderHex: async (startHeight, count) => {
          expect(startHeight).toBe(311_446);
          expect(count).toBe(7);
          return headersHex;
        },
      },
    });

    expect(source.ok).toBe(true);
    if (source.ok) expect(source.headerSource.headerHexAtHeight(fixture.requiredHeight)).toBe(fixture.headers.at(-1)?.headerHex);
  });

  it("HTTP resolver provider fetches the exact startHeight/count and validates the echoed range", async () => {
    const fixture = await loadSignetHeaderRange();
    const headersHex = fixture.headers.map((header) => header.headerHex);
    const calls: string[] = [];
    const provider = createResolverHeaderRangeProvider({
      resolverUrl: "http://resolver.test/",
      fetchImpl: async (url) => {
        calls.push(String(url));
        return new Response(JSON.stringify({ startHeight: 311_446, headersHex }), { status: 200 });
      },
    });

    const result = await fetchSignetLaunchHeaderSource({ anchorHeight: fixture.anchorHeight, provider });

    expect(calls).toEqual(["http://resolver.test/bitcoin/header-range?startHeight=311446&count=7"]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.headerSource.headerHexAtHeight(fixture.requiredHeight)).toBe(fixture.headers.at(-1)?.headerHex);
  });

  it("HTTP resolver provider maps malformed, mismatched, and unavailable responses to null", async () => {
    const cases: Array<readonly [string, Response | Error]> = [
      ["non-200", new Response(JSON.stringify({ ok: false }), { status: 404 })],
      ["bad-json", new Response("{", { status: 200 })],
      ["start-mismatch", new Response(JSON.stringify({ startHeight: 1, headersHex: ["aa"] }), { status: 200 })],
      ["short", new Response(JSON.stringify({ startHeight: 311_446, headersHex: [] }), { status: 200 })],
      ["throw", new Error("network down")],
    ];

    for (const [, response] of cases) {
      const provider = createResolverHeaderRangeProvider({
        resolverUrl: "http://resolver.test",
        fetchImpl: async () => {
          if (response instanceof Error) throw response;
          return response;
        },
      });
      await expect(provider.fetchHeaderHex(311_446, 1)).resolves.toBeNull();
    }
  });

  it("Esplora provider resolves block-height then block header in ascending order", async () => {
    const fixture = await loadSignetHeaderRange();
    const headersHex = fixture.headers.map((header) => header.headerHex);
    const hashes = fixture.headers.map((header) => headerHash(header.height));
    const calls: string[] = [];
    const provider = createEsploraHeaderRangeProvider({
      esploraBaseUrl: "https://esplora.test/signet/api",
      fetchImpl: esploraFetch(calls, fixture, hashes),
    });

    await expect(provider.fetchHeaderHex(fixture.anchorHeight, fixture.headers.length)).resolves.toEqual(headersHex);
    expect(calls).toEqual(fixture.headers.flatMap((header, index) => [
      `https://esplora.test/signet/api/block-height/${header.height}`,
      `https://esplora.test/signet/api/block/${hashes[index]!}/header`,
    ]));
  });

  it("Esplora provider returns null on malformed ranges before any fetch", async () => {
    const calls: string[] = [];
    const provider = createEsploraHeaderRangeProvider({
      esploraBaseUrl: "https://esplora.test/signet/api",
      fetchImpl: async (url) => {
        calls.push(String(url));
        return new Response("", { status: 500 });
      },
    });

    await expect(provider.fetchHeaderHex(-1, 1)).resolves.toBeNull();
    await expect(provider.fetchHeaderHex(311_446, 0)).resolves.toBeNull();
    await expect(provider.fetchHeaderHex(311_446.5, 1)).resolves.toBeNull();
    expect(calls).toEqual([]);
  });

  it("Esplora provider maps per-height 404, network throw, missing interior height, and malformed header to null", async () => {
    const fixture = await loadSignetHeaderRange();
    const hashes = fixture.headers.map((header) => headerHash(header.height));
    const cases: Array<readonly [string, typeof fetch]> = [
      ["height-404", async () => new Response("", { status: 404 })],
      ["throw", async () => { throw new Error("network down"); }],
      ["missing-interior", esploraFetch([], fixture, hashes, { missingHeight: fixture.headers[1]!.height })],
      ["bad-header", esploraFetch([], fixture, hashes, { malformedHeaderHeight: fixture.headers[1]!.height })],
    ];

    for (const [, fetchImpl] of cases) {
      const provider = createEsploraHeaderRangeProvider({ esploraBaseUrl: "https://esplora.test/signet/api", fetchImpl });
      await expect(provider.fetchHeaderHex(fixture.anchorHeight, fixture.headers.length)).resolves.toBeNull();
    }
  });

  it("Esplora provider inherits the same forged-child firewall as direct header arrays", async () => {
    const fixture = await loadSignetHeaderRange();
    const headersHex = fixture.headers.map((header) => header.headerHex);
    const forged = [overwriteNonce(headersHex[0]!, 0), ...headersHex.slice(1)];
    const direct = buildSignetLaunchHeaderSourceFromHeaders({ headersHex: forged, anchorHeight: fixture.anchorHeight });
    const provider = createEsploraHeaderRangeProvider({
      esploraBaseUrl: "https://esplora.test/signet/api",
      fetchImpl: esploraFetch([], fixture, fixture.headers.map((header) => headerHash(header.height)), { headersHex: forged }),
    });

    const fetched = await fetchSignetLaunchHeaderSource({ anchorHeight: fixture.anchorHeight, provider });

    expect(direct.ok).toBe(false);
    expect(fetched).toEqual(direct);
  });

  it("fails closed for forged child, short tail, and wrong-network ranges", async () => {
    const fixture = await loadSignetHeaderRange();
    const headersHex = fixture.headers.map((header) => header.headerHex);
    const forged = [overwriteNonce(headersHex[0]!, 0), ...headersHex.slice(1)];
    const forgedResult = buildSignetLaunchHeaderSourceFromHeaders({ headersHex: forged, anchorHeight: fixture.anchorHeight });
    const shortResult = buildSignetLaunchHeaderSourceFromHeaders({ headersHex: headersHex.slice(0, -1), anchorHeight: fixture.anchorHeight });
    const wrongNetworkResult = buildSignetLaunchHeaderSourceFromHeaders({
      headersHex: [MAINNET_HEADER_AT_311446, ...headersHex.slice(1)],
      anchorHeight: fixture.anchorHeight,
    });

    expect(forgedResult.ok).toBe(false);
    if (!forgedResult.ok) expect(forgedResult.reason).toBe("spv-pow-insufficient");
    expect(shortResult.ok).toBe(false);
    if (!shortResult.ok) expect(shortResult.reason).toBe("header-range-count-mismatch");
    expect(wrongNetworkResult.ok).toBe(false);
    if (!wrongNetworkResult.ok) expect(wrongNetworkResult.reason).toBe("spv-broken-linkage");
  });
});

async function loadBitcoinAnchoredBundle(): Promise<Record<string, unknown>> {
  const fixtureUrl = new URL("../../../fixtures/proof-bundles/bitcoin-anchored-claim-proof.json", import.meta.url);
  const raw = await readFile(fixtureUrl, "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

async function loadSignetAnchoredBundle(): Promise<Record<string, unknown>> {
  const fixtureUrl = new URL("../../../fixtures/proof-bundles/signet-anchored-claim-proof.json", import.meta.url);
  const raw = await readFile(fixtureUrl, "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

async function loadSignetHeaderRange(): Promise<SignetHeaderFixture> {
  const fixtureUrl = new URL("../../../fixtures/bitcoin/signet-launch-header-range-311446-311452.json", import.meta.url);
  const raw = await readFile(fixtureUrl, "utf8");
  return JSON.parse(raw) as SignetHeaderFixture;
}

function overwriteNonce(headerHex: string, nonce: number): string {
  const bytes = hexToBytes(headerHex);
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(76, nonce >>> 0, true);
  return bytesToHex(bytes);
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

function headerHash(height: number): string {
  return height.toString(16).padStart(64, "0");
}

function esploraFetch(
  calls: string[],
  fixture: SignetHeaderFixture,
  hashes: readonly string[],
  opts: {
    readonly headersHex?: readonly string[] | undefined;
    readonly missingHeight?: number | undefined;
    readonly malformedHeaderHeight?: number | undefined;
  } = {},
): typeof fetch {
  const hashByHeight = new Map<number, string>();
  const headerByHash = new Map<string, string>();
  for (const [index, header] of fixture.headers.entries()) {
    const hash = hashes[index]!;
    hashByHeight.set(header.height, hash);
    headerByHash.set(hash, opts.headersHex?.[index] ?? header.headerHex);
  }
  return async (url) => {
    const u = new URL(String(url));
    calls.push(u.toString());
    const heightMatch = u.pathname.match(/\/block-height\/([0-9]+)$/);
    if (heightMatch) {
      const height = Number.parseInt(heightMatch[1]!, 10);
      if (height === opts.missingHeight) return new Response("", { status: 404 });
      const hash = hashByHeight.get(height);
      return hash === undefined ? new Response("", { status: 404 }) : new Response(`${hash}\n`, { status: 200 });
    }
    const headerMatch = u.pathname.match(/\/block\/([0-9a-f]{64})\/header$/);
    if (headerMatch) {
      const hash = headerMatch[1]!;
      const header = headerByHash.get(hash);
      const height = [...hashByHeight.entries()].find(([, h]) => h === hash)?.[0];
      if (height === opts.malformedHeaderHeight) return new Response("zz", { status: 200 });
      return header === undefined ? new Response("", { status: 404 }) : new Response(`${header}\n`, { status: 200 });
    }
    return new Response("", { status: 404 });
  };
}
