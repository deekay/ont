import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Publisher } from "./publisher.js";
import { startPublisherServer, type PublisherServer } from "./server.js";

const OWNER = "ab".repeat(32);

describe("publisher HTTP server", () => {
  let server: PublisherServer;

  beforeEach(async () => {
    server = await startPublisherServer({ publisher: new Publisher({ network: "regtest" }) });
  });

  afterEach(async () => {
    await server.close();
  });

  it("walks the full HTTP flow: info → quote → submit → status → batch", async () => {
    const info = await getJson(server.url + "/info");
    expect(info.network).toBe("regtest");
    expect(info.paymentRails).toContain("lightning");

    const quote = await postJson(server.url + "/claim/quote", {
      name: "alice",
      ownerPubkey: OWNER,
      paymentRail: "lightning"
    });
    expect(quote.available).toBe(true);
    expect(quote.quoteId).toMatch(/^[0-9a-f]{32}$/);

    const receipt = await postJson(server.url + "/claim/submit", {
      quoteId: quote.quoteId,
      paymentProof: { rail: "lightning", paymentHash: "feed" }
    });
    expect(receipt.status).toBe("confirmed");
    expect(receipt.inclusionProof.leaf).toBe(quote.leaf);

    const status = await getJson(`${server.url}/claim/${quote.quoteId}`);
    expect(status.status).toBe("confirmed");
    expect(status.anchorTxid).toBe(receipt.anchorTxid);

    const batch = await getJson(`${server.url}/batch/${receipt.batchId}`);
    expect(batch.leaves[0].name).toBe("alice");
    expect(batch.leaves[0].ownerPubkey).toBe(OWNER);
  });

  it("returns 404 with a JSON error for unknown routes", async () => {
    const res = await fetch(`${server.url}/nope`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("no route");
  });

  it("returns 400 on a malformed body", async () => {
    const res = await fetch(`${server.url}/claim/quote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-json"
    });
    expect(res.status).toBe(400);
  });
});

async function getJson(url: string): Promise<Record<string, unknown> & { [k: string]: any }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET ${url} → ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as Record<string, unknown> & { [k: string]: any };
}

async function postJson(url: string, body: unknown): Promise<Record<string, unknown> & { [k: string]: any }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    throw new Error(`POST ${url} → ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as Record<string, unknown> & { [k: string]: any };
}
