// @ont/web live — G2 slice 5a RED battery: the live resolver tx read source.
//
// Pins CL's crisp source semantics (event e0a40c38): 200 + valid ServedTx → the ServedTx; 404 → null;
// network error / non-404 non-2xx / malformed 200 → THROW (broken live path, not "absent"). The throw cases
// assert specific reason strings so the generic not-implemented stub (which rejects with a different message)
// stays red. RED until createResolverTxSource is real.
import { describe, expect, it } from "vitest";
import type { ServedTx } from "@ont/adapter-resolver";
import { createResolverTxSource } from "./resolver-tx-source.js";

const BASE = "http://resolver:8787";
const served: ServedTx = {
  txid: "ab".repeat(32),
  blockHash: null,
  blockHeight: 101,
  outputs: [{ valueSats: "0", scriptHex: "6a", address: null }],
  carrierPayloadHex: "7a".repeat(36),
};

const fetchOf = (handler: (input: RequestInfo | URL) => Promise<Response>): typeof fetch =>
  handler as unknown as typeof fetch;

describe("createResolverTxSource (G2 slice 5a)", () => {
  it("200 + valid ServedTx → returns the ServedTx, hitting ${baseUrl}/tx/${txid}", async () => {
    let url = "";
    const f = fetchOf(async (input) => {
      url = String(input);
      return new Response(JSON.stringify(served), { status: 200 });
    });
    await expect(createResolverTxSource(BASE, f)(served.txid)).resolves.toEqual(served);
    expect(url).toBe(`${BASE}/tx/${served.txid}`);
  });

  it("404 → null (the resolver says the tx is absent)", async () => {
    const f = fetchOf(async () => new Response("", { status: 404 }));
    await expect(createResolverTxSource(BASE, f)("cd".repeat(32))).resolves.toBeNull();
  });

  it("non-404 non-2xx (500) → throws (live read path broken, not absent)", async () => {
    const f = fetchOf(async () => new Response("oops", { status: 500 }));
    await expect(createResolverTxSource(BASE, f)(served.txid)).rejects.toThrow(/resolver tx read failed/i);
  });

  it("network error → throws (propagates, never null)", async () => {
    const f = fetchOf(async () => {
      throw new Error("simulated network failure");
    });
    await expect(createResolverTxSource(BASE, f)(served.txid)).rejects.toThrow(
      /simulated network failure|resolver tx read failed/i,
    );
  });

  it("malformed 200 (not JSON) → throws", async () => {
    const f = fetchOf(async () => new Response("not json {{{", { status: 200 }));
    await expect(createResolverTxSource(BASE, f)(served.txid)).rejects.toThrow(/malformed|resolver tx read failed/i);
  });

  it("malformed 200 (wrong ServedTx shape) → throws", async () => {
    const f = fetchOf(async () => new Response(JSON.stringify({ nope: 1 }), { status: 200 }));
    await expect(createResolverTxSource(BASE, f)(served.txid)).rejects.toThrow(/malformed|resolver tx read failed/i);
  });
});
