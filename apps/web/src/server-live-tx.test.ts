// @ont/web — G2 slice 5b-2 RED battery: the live resolver tx handler path.
//
// With a `txSource` configured, the /tx/:txid handler reads the LIVE resolver (the async edge), not the sync
// `port`. Contract (my 5b-2 plan + CL concur):
//   - valid ServedTx  -> the rendered tx page (200), through the same renderServedTx as the sync path; the live
//                        source's value wins over the sync port (proves the source was actually consulted)
//   - source null     -> the unavailable page (200) — source absence wins over a port that WOULD serve
//   - bad txid        -> the error view (200); the source is NEVER called (validate before fetch)
//   - source throw    -> 502 BEFORE rendering, with a GENERIC body that does NOT leak the resolver exception,
//                        and does NOT silently degrade to the unavailable page (broken read != absent)
// With no `txSource`, the existing sync renderTxView({ txid, port }) path is unchanged.
//
// RED until handleWebRequest consults options.txSource — it currently ignores the field, so the three
// live-path behavior cases fail (the sync port answer / status 200 stands in for the not-yet-wired live path);
// the bad-txid and no-txSource cases are guards that hold across red->green.
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

// A sync port that WOULD serve a *different* answer (or any answer) than the live source — so a handler that
// ignores the source and falls back to the port is detectable.
const portServing = (s: ServedTx | null): WebReadPort => ({
  valueHistory: () => null,
  recoveryHistory: () => null,
  tx: () => s,
});

async function getTx(path: string, options: WebServiceOptions) {
  const res = await handleWebRequest(new Request(`http://web.test${path}`, { method: "GET" }), options);
  return { status: res.status, text: await res.text() };
}

describe("web server — live resolver tx handler path (G2 slice 5b-2)", () => {
  it("valid ServedTx from txSource -> rendered tx page; live source wins over the sync port", async () => {
    const portTx: ServedTx = { ...liveTx, blockHeight: 111111 }; // the port would serve a DIFFERENT height
    const txSource = vi.fn(async (_txid: string): Promise<ServedTx | null> => liveTx);
    const r = await getTx(`/tx/${TXID}`, { port: portServing(portTx), txSource });
    expect(r.status).toBe(200);
    expect(r.text).toContain("Transaction:");
    expect(r.text).toContain("800123"); // the live source's value rendered...
    expect(r.text).not.toContain("111111"); // ...not the sync port's
    expect(txSource).toHaveBeenCalledTimes(1);
    expect(txSource).toHaveBeenCalledWith(TXID); // the shaped txid
  });

  it("txSource null -> unavailable page (200); source absence wins over a port that WOULD serve", async () => {
    const txSource = vi.fn(async (_txid: string): Promise<ServedTx | null> => null);
    const r = await getTx(`/tx/${TXID}`, { port: portServing(liveTx), txSource });
    expect(r.status).toBe(200);
    expect(r.text).toContain("not currently served");
    expect(r.text).not.toContain("block height"); // the tx-fields section never rendered
    expect(txSource).toHaveBeenCalledTimes(1);
  });

  it("bad txid -> error view (200); txSource is NEVER called (validate before fetch)", async () => {
    const txSource = vi.fn(async (_txid: string): Promise<ServedTx | null> => liveTx);
    const r = await getTx(`/tx/not-a-hex32`, { port: portServing(null), txSource });
    expect(r.status).toBe(200);
    expect(r.text).toContain("Invalid txid");
    expect(txSource).not.toHaveBeenCalled();
  });

  it("txSource throw -> 502 before rendering; body does NOT leak the resolver exception", async () => {
    const leak = "SECRET-resolver-stacktrace-0xdeadbeef";
    const txSource = vi.fn(async (_txid: string): Promise<ServedTx | null> => {
      throw new Error(leak);
    });
    const r = await getTx(`/tx/${TXID}`, { port: portServing(liveTx), txSource });
    expect(r.status).toBe(502);
    expect(r.text).not.toContain(leak);
    expect(r.text).not.toContain("SECRET");
    expect(r.text).not.toContain("not currently served"); // a broken read must NOT degrade to "absent"
    expect(txSource).toHaveBeenCalledTimes(1);
  });

  it("no txSource -> the existing sync renderTxView({ txid, port }) path is unchanged", async () => {
    const r = await getTx(`/tx/${TXID}`, { port: portServing(liveTx) });
    expect(r.status).toBe(200);
    expect(r.text).toContain("Transaction:");
    expect(r.text).toContain("800123");
  });
});
