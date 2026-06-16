import { afterEach, describe, expect, it, vi } from "vitest";

import { LexeSidecarLightningPayer, StubLightningPayer } from "./lightning.js";

describe("StubLightningPayer", () => {
  it("records payments and reports success", async () => {
    const stub = new StubLightningPayer();
    const result = await stub.pay({ payable: "publisher@lexe.app", amountSats: 1000 });

    expect(result.status).toBe("succeeded");
    expect(result.paymentId).toBe("stub-1");
    expect(stub.payments).toHaveLength(1);
    expect(stub.payments[0]).toMatchObject({ payable: "publisher@lexe.app", amountSats: 1000 });
  });
});

describe("LexeSidecarLightningPayer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs the pay request to the sidecar and parses the result", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ status: "succeeded", index: "abc123" }))
    });
    vi.stubGlobal("fetch", fetchMock);

    const payer = new LexeSidecarLightningPayer("http://localhost:5393/");
    const result = await payer.pay({ payable: "lnbc1...", amountSats: 1000, note: "claim alice" });

    const firstCall = fetchMock.mock.calls[0];
    if (!firstCall) {
      throw new Error("fetch was not called");
    }
    const [url, init] = firstCall;
    expect(url).toBe("http://localhost:5393/v2/node/pay");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toMatchObject({
      payable: "lnbc1...",
      amount_sats: 1000,
      note: "claim alice"
    });

    expect(result.status).toBe("succeeded");
    expect(result.paymentId).toBe("abc123");
  });

  it("throws on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve("bad request")
      })
    );

    const payer = new LexeSidecarLightningPayer();
    await expect(payer.pay({ payable: "x" })).rejects.toThrow(/pay failed \(400\)/);
  });
});
