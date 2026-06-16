import { afterEach, describe, expect, it, vi } from "vitest";

import { BroadcastClient, BroadcastError, resolveBroadcastBaseUrl } from "./broadcast.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(response: { ok: boolean; status: number; body: string }): ReturnType<typeof vi.fn> {
  const mock = vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    text: () => Promise.resolve(response.body)
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

describe("resolveBroadcastBaseUrl", () => {
  it("prefers explicit, then env, then the network default", () => {
    expect(resolveBroadcastBaseUrl("signet", "http://explicit/", "http://env")).toBe("http://explicit");
    expect(resolveBroadcastBaseUrl("signet", undefined, "http://env/")).toBe("http://env");
    expect(resolveBroadcastBaseUrl("signet", undefined, undefined)).toBe("https://mempool.space/signet/api");
    expect(resolveBroadcastBaseUrl("main", undefined, undefined)).toBe("https://mempool.space/api");
  });

  it("throws for regtest with no endpoint configured", () => {
    expect(() => resolveBroadcastBaseUrl("regtest", undefined, undefined)).toThrow(BroadcastError);
  });
});

describe("BroadcastClient", () => {
  it("POSTs raw hex to /tx and returns the txid", async () => {
    const mock = stubFetch({ ok: true, status: 200, body: "deadbeeftxid\n" });
    const txid = await new BroadcastClient("http://esplora/").broadcastTransaction("0200beef");

    expect(txid).toBe("deadbeeftxid");
    const call = mock.mock.calls[0];
    if (!call) {
      throw new Error("fetch was not called");
    }
    expect(call[0]).toBe("http://esplora/tx");
    expect(call[1].method).toBe("POST");
    expect(call[1].body).toBe("0200beef");
  });

  it("throws BroadcastError on a rejected transaction", async () => {
    stubFetch({ ok: false, status: 400, body: "sendrawtransaction RPC error" });
    await expect(new BroadcastClient("http://esplora").broadcastTransaction("00")).rejects.toThrow(
      BroadcastError
    );
  });
});
