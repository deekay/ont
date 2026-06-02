import { afterEach, describe, expect, it, vi } from "vitest";

import { PublisherClient, PublisherError } from "./publisher-client.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(handler: (url: string, init?: { method?: string; body?: string }) => Response): ReturnType<typeof vi.fn> {
  const mock = vi.fn(async (url: string, init?: { method?: string; body?: string }) => handler(url, init));
  vi.stubGlobal("fetch", mock);
  return mock;
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body)
  } as unknown as Response;
}

function errorResponse(text: string, status: number): Response {
  return {
    ok: false,
    status,
    text: async () => text
  } as unknown as Response;
}

describe("PublisherClient", () => {
  it("GETs /info", async () => {
    const mock = stubFetch(() => jsonResponse({ kind: "ont-publisher-info", network: "regtest" }));
    const info = await new PublisherClient("http://p/").info();
    expect(info.network).toBe("regtest");
    expect(mock.mock.calls[0]?.[0]).toBe("http://p/info");
  });

  it("POSTs /claim/quote and parses the response", async () => {
    const mock = stubFetch(() =>
      jsonResponse({
        kind: "ont-publisher-quote",
        quoteId: "Q1",
        name: "alice",
        available: true,
        gateBaseSats: "1000",
        serviceBaseSats: "200",
        totalBaseSats: "1200",
        expiresAt: "2030-01-01T00:00:00Z",
        paymentRail: "lightning",
        lightningInvoice: "lnbcrt:Q1",
        ownerCommitment: "ab".repeat(32),
        leaf: "ee".repeat(32)
      })
    );
    const quote = await new PublisherClient("http://p").quote({
      name: "alice",
      ownerPubkey: "ab".repeat(32),
      paymentRail: "lightning"
    });
    expect(quote.quoteId).toBe("Q1");
    expect(quote.available).toBe(true);
    const call = mock.mock.calls[0];
    expect(call?.[0]).toBe("http://p/claim/quote");
    expect(call?.[1]?.method).toBe("POST");
  });

  it("POSTs /claim/submit", async () => {
    const mock = stubFetch(() =>
      jsonResponse({
        kind: "ont-publisher-claim-receipt",
        quoteId: "Q1",
        status: "confirmed",
        name: "alice",
        batchId: "B1",
        anchorTxid: "11".repeat(32),
        anchorHeight: 1000001,
        inclusionProof: { root: "ff".repeat(32), leaf: "ee".repeat(32), value: "ab".repeat(32), siblings: [] }
      })
    );
    const receipt = await new PublisherClient("http://p").submit({
      quoteId: "Q1",
      paymentProof: { rail: "lightning", paymentHash: "deadbeef" }
    });
    expect(receipt.status).toBe("confirmed");
    expect(receipt.inclusionProof?.leaf).toBe("ee".repeat(32));
    expect(mock.mock.calls[0]?.[0]).toBe("http://p/claim/submit");
  });

  it("GETs /claim/{id} for idempotent status", async () => {
    const mock = stubFetch(() =>
      jsonResponse({ kind: "ont-publisher-claim-receipt", quoteId: "Q1", status: "paid", name: "alice" })
    );
    const receipt = await new PublisherClient("http://p").status("Q1");
    expect(receipt.status).toBe("paid");
    expect(mock.mock.calls[0]?.[0]).toBe("http://p/claim/Q1");
  });

  it("throws PublisherError on HTTP failures", async () => {
    stubFetch(() => errorResponse("nope", 404));
    await expect(new PublisherClient("http://p").info()).rejects.toThrow(PublisherError);
  });

  it("throws PublisherError when fetch itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );
    await expect(new PublisherClient("http://p").info()).rejects.toThrow(/could not reach publisher/);
  });
});
