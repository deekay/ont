import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  runOntCli,
  selectCliVerifyHeaderProvider,
  selectCliVerifyResolverUrl,
  verifyNameAgainstResolver,
} from "./live-verify.js";

interface SignetHeaderFixture {
  readonly anchorHeight: number;
  readonly headers: readonly { readonly headerHex: string }[];
}

describe("ont verify <name>", () => {
  it("fetches proof bundle + exact resolver header range and prints Bitcoin-verified only after depth coverage", async () => {
    const fixture = await loadSignetHeaderRange();
    const proofBundle = await loadSignetAnchoredBundle();
    const requests: string[] = [];
    const stdout: string[] = [];
    const stderr: string[] = [];
    const fetchImpl: typeof fetch = async (url) => {
      requests.push(String(url));
      if (String(url) === "http://resolver.test/names/alice/state") {
        return new Response(JSON.stringify({ ok: true, proofBundle }), { status: 200 });
      }
      if (String(url) === "http://resolver.test/bitcoin/header-range?startHeight=311446&count=7") {
        return new Response(JSON.stringify({
          startHeight: 311_446,
          headersHex: fixture.headers.map((header) => header.headerHex),
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    };

    const exit = await runOntCli(
      ["verify", "alice"],
      { ONT_BITCOIN_HEADER_SOURCE: "resolver:http://resolver.test" },
      { stdout: (text) => stdout.push(text), stderr: (text) => stderr.push(text) },
      fetchImpl,
    );

    expect(exit).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join("\n")).toContain("Bitcoin-verified: alice");
    expect(stdout.join("\n")).toContain("signetHeaderAuthenticity=provider-trusted");
    expect(requests).toEqual([
      "http://resolver.test/names/alice/state",
      "http://resolver.test/bitcoin/header-range?startHeight=311446&count=7",
    ]);
  });

  it("keeps missing header source non-authoritative and never prints Bitcoin-verified", async () => {
    const proofBundle = await loadSignetAnchoredBundle();
    const stdout: string[] = [];
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ ok: true, proofBundle }), { status: 200 });

    const exit = await runOntCli(
      ["verify", "alice"],
      { ONT_RESOLVER_URL: "http://resolver.test" },
      { stdout: (text) => stdout.push(text), stderr: () => undefined },
      fetchImpl,
    );

    expect(exit).toBe(1);
    expect(stdout.join("\n")).toContain("resolver-mirror: alice");
    expect(stdout.join("\n")).toContain("reason=missing-header-source");
    expect(stdout.join("\n")).not.toContain("Bitcoin-verified:");
  });

  it("sources the live header range from Esplora when ONT_HEADER_PROVIDER=esplora", async () => {
    const fixture = await loadSignetHeaderRange();
    const proofBundle = await loadSignetAnchoredBundle();
    const hashes = fixture.headers.map((_, index) => headerHash(index));
    const requests: string[] = [];
    const stdout: string[] = [];
    const stderr: string[] = [];
    const fetchImpl: typeof fetch = async (url) => {
      const href = String(url);
      requests.push(href);
      if (href === "http://resolver.test/names/alice/state") {
        return new Response(JSON.stringify({ ok: true, proofBundle }), { status: 200 });
      }
      const u = new URL(href);
      const heightMatch = u.pathname.match(/\/block-height\/([0-9]+)$/);
      if (heightMatch) {
        const height = Number.parseInt(heightMatch[1]!, 10);
        const index = fixture.headers.findIndex((header) => header.height === height);
        return index === -1 ? new Response("", { status: 404 }) : new Response(`${hashes[index]!}\n`, { status: 200 });
      }
      const headerMatch = u.pathname.match(/\/block\/([0-9a-f]{64})\/header$/);
      if (headerMatch) {
        const index = hashes.indexOf(headerMatch[1]!);
        return index === -1 ? new Response("", { status: 404 }) : new Response(`${fixture.headers[index]!.headerHex}\n`, { status: 200 });
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    };

    const exit = await runOntCli(
      ["verify", "alice"],
      {
        ONT_RESOLVER_URL: "http://resolver.test",
        ONT_HEADER_PROVIDER: "esplora",
        ONT_ESPLORA_URL: "https://esplora.test/signet/api",
      },
      { stdout: (text) => stdout.push(text), stderr: (text) => stderr.push(text) },
      fetchImpl,
    );

    expect(exit).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join("\n")).toContain("Bitcoin-verified: alice");
    expect(stdout.join("\n")).toContain("signetHeaderAuthenticity=provider-trusted");
    expect(requests).toEqual([
      "http://resolver.test/names/alice/state",
      ...fixture.headers.flatMap((header, index) => [
        `https://esplora.test/signet/api/block-height/${header.height}`,
        `https://esplora.test/signet/api/block/${hashes[index]!}/header`,
      ]),
    ]);
  });

  it("rejects the old block-170 fixture id as an unsupported live source", async () => {
    const stderr: string[] = [];
    const exit = await runOntCli(
      ["verify", "alice"],
      { ONT_BITCOIN_HEADER_SOURCE: "fixture:block-170", ONT_RESOLVER_URL: "http://resolver.test" },
      { stdout: () => undefined, stderr: (text) => stderr.push(text) },
      async () => new Response("{}", { status: 500 }),
    );

    expect(exit).toBe(2);
    expect(stderr.join("\n")).toContain("ONT_BITCOIN_HEADER_SOURCE must be resolver:<url>");
  });
});

describe("verifyNameAgainstResolver", () => {
  it("maps resolver 404 to unavailable rather than a verifier result", async () => {
    await expect(verifyNameAgainstResolver({
      name: "alice",
      proofBundleSource: async () => null,
      headerProvider: null,
    })).resolves.toEqual({ ok: false, state: "unavailable", name: "alice", reason: "name-not-served" });
  });

  it("selects resolver URL from ONT_RESOLVER_URL or resolver header source", () => {
    expect(selectCliVerifyResolverUrl({ ONT_RESOLVER_URL: " http://resolver-a.test " })).toBe("http://resolver-a.test");
    expect(selectCliVerifyResolverUrl({ ONT_BITCOIN_HEADER_SOURCE: "resolver:http://resolver-b.test" })).toBe("http://resolver-b.test");
    expect(selectCliVerifyHeaderProvider({})).toBeNull();
    expect(selectCliVerifyHeaderProvider({ ONT_HEADER_PROVIDER: "resolver", ONT_RESOLVER_URL: "http://resolver.test" })).not.toBeNull();
    expect(() => selectCliVerifyHeaderProvider({ ONT_HEADER_PROVIDER: "esplora" })).toThrow(/ONT_ESPLORA_URL/);
    expect(() => selectCliVerifyHeaderProvider({ ONT_HEADER_PROVIDER: "unknown" })).toThrow(/ONT_HEADER_PROVIDER/);
    expect(() => selectCliVerifyHeaderProvider({ ONT_HEADER_PROVIDER: "node" })).toThrow(/deferred/);
  });
});

async function loadSignetHeaderRange(): Promise<SignetHeaderFixture> {
  const raw = await readFile(new URL("../../../fixtures/bitcoin/signet-launch-header-range-311446-311452.json", import.meta.url), "utf8");
  return JSON.parse(raw) as SignetHeaderFixture;
}

async function loadSignetAnchoredBundle(): Promise<Record<string, unknown>> {
  const raw = await readFile(new URL("../../../fixtures/proof-bundles/signet-anchored-claim-proof.json", import.meta.url), "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

function headerHash(index: number): string {
  return index.toString(16).padStart(64, "0");
}
