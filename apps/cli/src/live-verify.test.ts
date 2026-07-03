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
