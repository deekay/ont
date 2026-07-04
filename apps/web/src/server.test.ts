import { describe, expect, it } from "vitest";
import { handleWebRequest, type WebServiceOptions } from "./server.js";
import type { WebReadPort, ServedNameStateResult } from "./web-read-port.js";
import type { HeaderRangeProvider } from "@ont/light-client";
import { PRIVATE_SIGNET_GENESIS_DIFFICULTY_CHECKPOINT } from "@ont/launch-config";

// Clean runnable web-server red battery. The server is an HTTP shell around existing SSR renderers. It owns no
// resolver/indexer rules: it only maps GET routes to renderLanding/route/renderNameView/renderTxView and consumes
// a mocked WebReadPort. Tests are in-process and hermetic.

const TXID = "33".repeat(32);

const nullPort: WebReadPort = {
  valueHistory: () => null,
  recoveryHistory: () => null,
  tx: () => null,
};

const servedTxPort: WebReadPort = {
  valueHistory: () => null,
  recoveryHistory: () => null,
  tx: (txid) =>
    txid === TXID
      ? {
          txid,
          blockHash: "44".repeat(32),
          blockHeight: 800000,
          outputs: [{ valueSats: "1000", scriptHex: "0014abcd", address: "bc1qexample" }],
          carrierPayloadHex: null,
        }
      : null,
};

const throwingPort: WebReadPort = {
  valueHistory() {
    throw new Error("port touched");
  },
  recoveryHistory() {
    throw new Error("port touched");
  },
  tx() {
    throw new Error("port touched");
  },
};

async function request(path: string, options: WebServiceOptions = { port: nullPort }, method = "GET") {
  const res = await handleWebRequest(new Request(`http://web.test${path}`, { method }), options);
  return { status: res.status, contentType: res.headers.get("content-type") ?? "", text: await res.text() };
}

describe("web server — health and landing", () => {
  it("GET /health returns running JSON", async () => {
    const r = await request("/health");
    expect(r.status).toBe(200);
    expect(r.contentType).toContain("application/json");
    expect(JSON.parse(r.text)).toMatchObject({ ok: true, service: "@ont/web" });
  });

  it("GET / renders the pure landing page without touching the port", async () => {
    const r = await request("/", { port: throwingPort });
    expect(r.status).toBe(200);
    expect(r.contentType).toContain("text/html");
    expect(r.text).toContain("Open Name Tags Explorer");
    expect(r.text).toContain("resolver-indexed-mirror");
    expect(r.text).toContain("not-ownership-authority");
  });
});

describe("web server — route dispatch", () => {
  it("GET /?q=alice dispatches to the name view", async () => {
    const r = await request("/?q=alice");
    expect(r.status).toBe(200);
    expect(r.text).toContain("Name: alice");
    expect(r.text).toContain("not currently served");
  });

  it("GET /names/:name dispatches directly to the name view", async () => {
    const r = await request("/names/alice");
    expect(r.status).toBe(200);
    expect(r.text).toContain("Name: alice");
  });

  it("GET /?q=<txid> and /tx/:txid dispatch to the tx view", async () => {
    const search = await request(`/?q=${TXID}`, { port: servedTxPort });
    const direct = await request(`/tx/${TXID}`, { port: servedTxPort });
    expect(search.text).toContain("Transaction:");
    expect(search.text).toContain("800000");
    expect(direct.text).toContain("Transaction:");
    expect(direct.text).toContain("800000");
  });

  it("invalid query renders landing-with-error and never touches the read port", async () => {
    const r = await request("/?q=Not%20A%20Query!", { port: throwingPort });
    expect(r.status).toBe(200);
    expect(r.text).toContain("Query not recognized");
    expect(r.text).not.toContain("Name:");
    expect(r.text).not.toContain("Transaction:");
  });

  it("uses an injected launch checkpoint when deriving the live name header range", async () => {
    const calls: Array<readonly [number, number]> = [];
    const provider: HeaderRangeProvider = {
      fetchHeaderHex: async (startHeight, count) => {
        calls.push([startHeight, count]);
        return null;
      },
    };

    const r = await request("/names/alice", {
      port: nullPort,
      nameStateSource: async () => privateSignetServedNameState(),
      bitcoinHeaderProvider: provider,
      bitcoinLaunchCheckpoint: PRIVATE_SIGNET_GENESIS_DIFFICULTY_CHECKPOINT,
    });

    expect(r.status).toBe(200);
    expect(r.text).toContain("Resolver mirror - not yet Bitcoin-verified");
    expect(calls).toEqual([[1, 147]]);
  });
});

describe("web server — HTTP shell totality", () => {
  it("unsupported methods and unknown routes return explicit JSON errors", async () => {
    const method = await request("/health", { port: nullPort }, "POST");
    expect(method.status).toBe(405);
    expect(method.contentType).toContain("application/json");
    expect(JSON.parse(method.text)).toMatchObject({ ok: false, reason: "method-not-allowed" });

    const unknown = await request("/unknown");
    expect(unknown.status).toBe(404);
    expect(JSON.parse(unknown.text)).toMatchObject({ ok: false, reason: "not-found" });
  });

  it("renderer fail-closed behavior is preserved for throwing ports", async () => {
    const name = await request("/names/alice", { port: throwingPort });
    const tx = await request(`/tx/${TXID}`, { port: throwingPort });
    expect(name.status).toBe(200);
    expect(name.text).toContain("not currently served");
    expect(tx.status).toBe(200);
    expect(tx.text).toContain("not currently served");
  });
});

function privateSignetServedNameState(): Extract<ServedNameStateResult, { readonly ok: true }> {
  const txid = "c8".repeat(32);
  return {
    ok: true,
    canonicalName: "alice",
    owner: { kind: "owner-key", ownerPubkeyHex: "11".repeat(32) },
    leafKeyHex: "22".repeat(32),
    batchLocalIndex: 0,
    anchoredRoot: "33".repeat(32),
    anchor: { txid, minedHeight: 141, txIndex: 0, vout: 0 },
    firstServableHeight: 141,
    trace: [],
    proofBundle: { bitcoinInclusion: { anchors: [{ txid, height: 141, pos: 0 }] } } as Extract<
      ServedNameStateResult,
      { readonly ok: true }
    >["proofBundle"],
    provenance: "resolver-indexed-mirror",
    authority: "not-ownership-authority",
  };
}
