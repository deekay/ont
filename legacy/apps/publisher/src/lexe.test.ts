import { afterEach, describe, expect, it, vi } from "vitest";

import { LexeSidecarInvoiceProvider } from "./invoice.js";
import { LexeSidecarPaymentVerifier } from "./payment.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(impl: (url: string, init?: { method?: string; body?: string }) => Response): ReturnType<typeof vi.fn> {
  const mock = vi.fn(async (url: string, init?: { method?: string; body?: string }) => impl(url, init));
  vi.stubGlobal("fetch", mock);
  return mock;
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body
  } as unknown as Response;
}

describe("LexeSidecarInvoiceProvider", () => {
  it("POSTs to /v2/node/create_invoice and parses bolt11 + paymentHash", async () => {
    const mock = stubFetch(() =>
      jsonResponse({ bolt11: "lnbc1abc", payment_hash: "deadbeef" })
    );
    const provider = new LexeSidecarInvoiceProvider("http://lexe/");
    const result = await provider.create({ quoteId: "Q1", amountSats: 1200n, description: "x" });
    expect(result).toEqual({ bolt11: "lnbc1abc", paymentHash: "deadbeef" });
    expect(mock.mock.calls[0]?.[0]).toBe("http://lexe/v2/node/create_invoice");
  });

  it("throws when the sidecar omits the bolt11 or payment_hash", async () => {
    stubFetch(() => jsonResponse({ something_else: 1 }));
    await expect(
      new LexeSidecarInvoiceProvider("http://lexe").create({
        quoteId: "Q",
        amountSats: 1000n,
        description: "x"
      })
    ).rejects.toThrow(/missing/);
  });
});

describe("LexeSidecarPaymentVerifier", () => {
  it("accepts a settled payment with sufficient amount", async () => {
    stubFetch(() => jsonResponse({ status: "succeeded", amount_sats: 1300 }));
    const verifier = new LexeSidecarPaymentVerifier("http://lexe");
    const result = await verifier.verify({
      quoteId: "Q",
      rail: "lightning",
      expectedSats: 1200n,
      paymentProof: { rail: "lightning", paymentHash: "abc" },
      expectedReference: "lnbc"
    });
    expect(result.accepted).toBe(true);
  });

  it("rejects when amount is short", async () => {
    stubFetch(() => jsonResponse({ status: "succeeded", amount_sats: 1000 }));
    const result = await new LexeSidecarPaymentVerifier("http://lexe").verify({
      quoteId: "Q",
      rail: "lightning",
      expectedSats: 1200n,
      paymentProof: { rail: "lightning", paymentHash: "abc" },
      expectedReference: ""
    });
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("expected");
  });

  it("rejects when payment is not yet settled", async () => {
    stubFetch(() => jsonResponse({ status: "pending", amount_sats: 1200 }));
    const result = await new LexeSidecarPaymentVerifier("http://lexe").verify({
      quoteId: "Q",
      rail: "lightning",
      expectedSats: 1200n,
      paymentProof: { rail: "lightning", paymentHash: "abc" },
      expectedReference: ""
    });
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("pending");
  });

  it("rejects when paymentHash is missing", async () => {
    const result = await new LexeSidecarPaymentVerifier("http://lexe").verify({
      quoteId: "Q",
      rail: "lightning",
      expectedSats: 1200n,
      paymentProof: { rail: "lightning" },
      expectedReference: ""
    });
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("paymentHash");
  });
});
