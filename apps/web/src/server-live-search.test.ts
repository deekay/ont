// @ont/web — G2 slice 5c RED battery: live resolver tx semantics on the landing/search routes.
//
// 5b-2 made DIRECT /tx/:txid live. 5c brings the landing/search txid queries onto the SAME live tx semantics
// when `txSource` is configured — closing the production UX footgun: index.ts runs createEmptyWebReadPort()
// + txSource, so /?q=<txid> and /search?q=<txid> currently route a txid through the EMPTY sync port. Contract
// (CL 5c concur, event aa569097):
//   With txSource configured, /?q=<txid> and /search?q=<txid> (trimmed as `route` already trims):
//     - valid ServedTx -> the rendered tx page (200); the live source wins over the sync port
//     - source null     -> the unavailable page (200); absence wins over a port that WOULD serve
//     - source throw    -> the SAME generic 502 (status + body) as direct /tx/:txid; no resolver-exception leak
//   Non-txid queries stay PURE SYNC: names -> renderNameView; empty/malformed -> landing / landing-with-error;
//   the source is NEVER called for them. With no txSource, route(q, port) stays byte-stable.
//
// RED until the handler routes txid queries through the live source — it currently sends /?q= and /search
// straight to the sync route(q, port), so the five live-query cases fail; the four sync guards already hold.
import { describe, expect, it, vi } from "vitest";
import { handleWebRequest, type WebServiceOptions } from "./server.js";
import type { WebReadPort, ServedTx } from "./web-read-port.js";

const TXID = "ab".repeat(32);

const liveTx: ServedTx = {
  txid: TXID,
  blockHash: "44".repeat(32),
  blockHeight: 800123, // the LIVE source's value
  outputs: [{ valueSats: "1000", scriptHex: "0014abcd", address: "bc1qexample" }],
  carrierPayloadHex: null,
};

const portServing = (s: ServedTx | null): WebReadPort => ({
  valueHistory: () => null,
  recoveryHistory: () => null,
  tx: () => s,
});

async function get(path: string, options: WebServiceOptions) {
  const res = await handleWebRequest(new Request(`http://web.test${path}`, { method: "GET" }), options);
  return { status: res.status, text: await res.text() };
}

describe("web server — live resolver tx via the search routes (G2 slice 5c)", () => {
  it("/?q=<txid> with txSource -> live tx page; live source wins over the sync port", async () => {
    const portTx: ServedTx = { ...liveTx, blockHeight: 111111 }; // the port would serve a DIFFERENT height
    const txSource = vi.fn(async (_txid: string): Promise<ServedTx | null> => liveTx);
    const r = await get(`/?q=${TXID}`, { port: portServing(portTx), txSource });
    expect(r.status).toBe(200);
    expect(r.text).toContain("Transaction:");
    expect(r.text).toContain("800123"); // live source's value...
    expect(r.text).not.toContain("111111"); // ...not the sync port's
    expect(txSource).toHaveBeenCalledTimes(1);
    expect(txSource).toHaveBeenCalledWith(TXID);
  });

  it("/search?q=<txid> with txSource -> live tx page (same semantics as direct /tx/:txid)", async () => {
    const txSource = vi.fn(async (_txid: string): Promise<ServedTx | null> => liveTx);
    const r = await get(`/search?q=${TXID}`, { port: portServing(null), txSource });
    expect(r.status).toBe(200);
    expect(r.text).toContain("Transaction:");
    expect(r.text).toContain("800123");
    expect(txSource).toHaveBeenCalledTimes(1);
  });

  it("/?q=<txid> with txSource, source null -> unavailable 200; absence wins over a port that WOULD serve", async () => {
    const txSource = vi.fn(async (_txid: string): Promise<ServedTx | null> => null);
    const r = await get(`/?q=${TXID}`, { port: portServing(liveTx), txSource });
    expect(r.status).toBe(200);
    expect(r.text).toContain("not currently served");
    expect(r.text).not.toContain("block height"); // the tx-fields section never rendered
    expect(txSource).toHaveBeenCalledTimes(1);
  });

  it("/?q=<txid> with txSource, source throw -> generic 502, no resolver-exception leak", async () => {
    const leak = "SECRET-resolver-stacktrace-0xdeadbeef";
    const txSource = vi.fn(async (_txid: string): Promise<ServedTx | null> => {
      throw new Error(leak);
    });
    const r = await get(`/?q=${TXID}`, { port: portServing(liveTx), txSource });
    expect(r.status).toBe(502);
    expect(r.text).not.toContain(leak);
    expect(r.text).not.toContain("SECRET");
    expect(r.text).not.toContain("not currently served"); // broken read != absent
  });

  it("/search?q=<txid> with txSource, source throw -> the same generic 502", async () => {
    const txSource = vi.fn(async (_txid: string): Promise<ServedTx | null> => {
      throw new Error("boom");
    });
    const r = await get(`/search?q=${TXID}`, { port: portServing(liveTx), txSource });
    expect(r.status).toBe(502);
    expect(r.text).not.toContain("not currently served");
  });

  // --- Guards: non-txid queries stay pure sync; the source is never called (green at red AND green) ---

  it("guard: /?q=<name> with txSource -> sync name view; source NEVER called", async () => {
    const txSource = vi.fn(async (_txid: string): Promise<ServedTx | null> => liveTx);
    const r = await get(`/?q=alice`, { port: portServing(null), txSource });
    expect(r.status).toBe(200);
    expect(r.text).toContain("Name: alice");
    expect(txSource).not.toHaveBeenCalled();
  });

  it("guard: /?q= (empty) with txSource -> landing; source NEVER called", async () => {
    const txSource = vi.fn(async (_txid: string): Promise<ServedTx | null> => liveTx);
    const r = await get(`/?q=`, { port: portServing(null), txSource });
    expect(r.status).toBe(200);
    expect(r.text).toContain("Open Name Tags Explorer");
    expect(txSource).not.toHaveBeenCalled();
  });

  it("guard: malformed query with txSource -> landing-with-error; source NEVER called", async () => {
    const txSource = vi.fn(async (_txid: string): Promise<ServedTx | null> => liveTx);
    const r = await get(`/?q=Not%20A%20Query!`, { port: portServing(null), txSource });
    expect(r.status).toBe(200);
    expect(r.text).toContain("Query not recognized");
    expect(txSource).not.toHaveBeenCalled();
  });

  it("guard: no txSource -> /?q=<txid> stays sync renderTxView({ txid, port }) byte-stable", async () => {
    const r = await get(`/?q=${TXID}`, { port: portServing(liveTx) });
    expect(r.status).toBe(200);
    expect(r.text).toContain("Transaction:");
    expect(r.text).toContain("800123");
  });
});
