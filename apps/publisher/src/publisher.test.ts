import { verifyAccumulatorProof } from "@ont/core";
import { describe, expect, it } from "vitest";

import { Publisher, PublisherError } from "./publisher.js";

const OWNER = "ab".repeat(32);

function fresh(): Publisher {
  return new Publisher({ network: "regtest" });
}

describe("Publisher quote → submit → confirmed flow", () => {
  it("issues a quote for an available name with the right shape", () => {
    const publisher = fresh();
    const quote = publisher.quote({ name: "Satoshi", ownerPubkey: OWNER, paymentRail: "lightning" });
    expect(quote.available).toBe(true);
    expect(quote.name).toBe("satoshi"); // normalized
    expect(quote.leaf).toMatch(/^[0-9a-f]{64}$/);
    expect(quote.ownerCommitment).toBe(OWNER);
    expect(quote.lightningInvoice).toContain(quote.quoteId);
    expect(quote.totalBaseSats).toBe((1000n + 200n).toString());
  });

  it("rejects a non-hex owner pubkey", () => {
    const publisher = fresh();
    expect(() => publisher.quote({ name: "alice", ownerPubkey: "nope", paymentRail: "lightning" }))
      .toThrow(PublisherError);
  });

  it("returns unavailable for a name reserved by a live quote", () => {
    const publisher = fresh();
    publisher.quote({ name: "alice", ownerPubkey: OWNER, paymentRail: "lightning" });
    const second = publisher.quote({ name: "alice", ownerPubkey: OWNER, paymentRail: "lightning" });
    expect(second.available).toBe(false);
    expect(second.reason).toBe("reserved");
  });

  it("walks quoted → confirmed on submit, producing a verifying inclusion proof", async () => {
    const publisher = fresh();
    const quote = publisher.quote({ name: "alice", ownerPubkey: OWNER, paymentRail: "lightning" });
    const receipt = await publisher.submit({
      quoteId: quote.quoteId,
      paymentProof: { rail: "lightning", paymentHash: "deadbeef" }
    });
    expect(receipt.status).toBe("confirmed");
    expect(receipt.anchorTxid).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.inclusionProof).toBeDefined();

    const proof = receipt.inclusionProof!;
    expect(proof.leaf).toBe(quote.leaf);
    expect(proof.value).toBe(OWNER);
    // The proof must verify against its own root using @ont/core's verifier.
    expect(
      verifyAccumulatorProof(proof.root, {
        keyHex: proof.leaf,
        value: proof.value,
        siblings: proof.siblings
      })
    ).toBe(true);
  });

  it("treats the name as taken after a confirmed claim", async () => {
    const publisher = fresh();
    const first = publisher.quote({ name: "alice", ownerPubkey: OWNER, paymentRail: "lightning" });
    await publisher.submit({ quoteId: first.quoteId, paymentProof: { rail: "lightning" } });
    const second = publisher.quote({ name: "alice", ownerPubkey: OWNER, paymentRail: "lightning" });
    expect(second.available).toBe(false);
    expect(second.reason).toBe("taken");
  });

  it("idempotent status lookup", async () => {
    const publisher = fresh();
    const quote = publisher.quote({ name: "alice", ownerPubkey: OWNER, paymentRail: "lightning" });
    await publisher.submit({ quoteId: quote.quoteId, paymentProof: { rail: "lightning" } });
    const first = publisher.status(quote.quoteId);
    const second = publisher.status(quote.quoteId);
    expect(first.status).toBe("confirmed");
    expect(second.status).toBe("confirmed");
    expect(first.anchorTxid).toBe(second.anchorTxid);
  });

  it("exposes batch data for data-availability checks", async () => {
    const publisher = fresh();
    const quote = publisher.quote({ name: "alice", ownerPubkey: OWNER, paymentRail: "lightning" });
    const receipt = await publisher.submit({
      quoteId: quote.quoteId,
      paymentProof: { rail: "lightning" }
    });
    const batch = publisher.batch(receipt.batchId!);
    expect(batch.leaves).toHaveLength(1);
    expect(batch.leaves[0]?.name).toBe("alice");
    expect(batch.leaves[0]?.ownerPubkey).toBe(OWNER);
    expect(batch.anchorTxid).toBe(receipt.anchorTxid);
  });

  it("rejects an unknown quoteId", () => {
    const publisher = fresh();
    expect(() => publisher.status("nope")).toThrow(PublisherError);
  });

  it("refuses an unsupported payment rail in v0", () => {
    const publisher = fresh();
    expect(() =>
      publisher.quote({ name: "alice", ownerPubkey: OWNER, paymentRail: "l1" })
    ).toThrow(PublisherError);
  });

  it("expires a quote whose TTL has passed before submit", async () => {
    let now = new Date("2030-01-01T00:00:00Z").getTime();
    const publisher = new Publisher({
      network: "regtest",
      quoteTtlSeconds: 60,
      clock: () => new Date(now)
    });
    const quote = publisher.quote({ name: "alice", ownerPubkey: OWNER, paymentRail: "lightning" });
    now += 120 * 1000;
    const receipt = await publisher.submit({
      quoteId: quote.quoteId,
      paymentProof: { rail: "lightning" }
    });
    expect(receipt.status).toBe("expired");
    const after = publisher.quote({ name: "alice", ownerPubkey: OWNER, paymentRail: "lightning" });
    expect(after.available).toBe(true); // reservation released
  });
});

describe("Publisher info + health", () => {
  it("reports info and health", () => {
    const publisher = fresh();
    expect(publisher.info().network).toBe("regtest");
    const health = publisher.health();
    expect(health.status).toBe("ok");
    expect(health.anchorBacklog).toBe(0);
  });
});

describe("Publisher batching policy", () => {
  it("seals immediately when maxBatchSize === 1 (default)", async () => {
    const publisher = fresh();
    const quote = publisher.quote({ name: "alice", ownerPubkey: OWNER, paymentRail: "lightning" });
    const receipt = await publisher.submit({ quoteId: quote.quoteId, paymentProof: { rail: "lightning" } });
    expect(receipt.status).toBe("confirmed");
    expect(publisher.pendingCount()).toBe(0);
  });

  it("queues until maxBatchSize is reached, then seals all at once", async () => {
    const publisher = new Publisher({ network: "regtest", maxBatchSize: 3 });
    const q1 = publisher.quote({ name: "a", ownerPubkey: OWNER, paymentRail: "lightning" });
    const q2 = publisher.quote({ name: "b", ownerPubkey: OWNER, paymentRail: "lightning" });
    const q3 = publisher.quote({ name: "c", ownerPubkey: OWNER, paymentRail: "lightning" });

    const r1 = await publisher.submit({ quoteId: q1.quoteId, paymentProof: { rail: "lightning" } });
    expect(r1.status).toBe("paid");
    expect(publisher.pendingCount()).toBe(1);

    const r2 = await publisher.submit({ quoteId: q2.quoteId, paymentProof: { rail: "lightning" } });
    expect(r2.status).toBe("paid");
    expect(publisher.pendingCount()).toBe(2);

    const r3 = await publisher.submit({ quoteId: q3.quoteId, paymentProof: { rail: "lightning" } });
    expect(r3.status).toBe("confirmed");
    expect(publisher.pendingCount()).toBe(0);

    // All three should now show confirmed via status() — same batch.
    expect(publisher.status(q1.quoteId).status).toBe("confirmed");
    expect(publisher.status(q2.quoteId).status).toBe("confirmed");
    expect(publisher.status(q3.quoteId).status).toBe("confirmed");
    expect(publisher.status(q1.quoteId).batchId).toBe(publisher.status(q3.quoteId).batchId);
  });

  it("seals when maxBatchAgeSeconds elapses (via tick)", async () => {
    let now = new Date("2030-01-01T00:00:00Z").getTime();
    const publisher = new Publisher({
      network: "regtest",
      maxBatchSize: 10,
      maxBatchAgeSeconds: 30,
      clock: () => new Date(now)
    });
    const quote = publisher.quote({ name: "alice", ownerPubkey: OWNER, paymentRail: "lightning" });
    const submitted = await publisher.submit({ quoteId: quote.quoteId, paymentProof: { rail: "lightning" } });
    expect(submitted.status).toBe("paid"); // not yet sealed

    // Advance past the age threshold and tick.
    now += 31_000;
    await publisher.tick();
    expect(publisher.status(quote.quoteId).status).toBe("confirmed");
    expect(publisher.pendingCount()).toBe(0);
  });

  it("preserves the pending queue across snapshot/restore", async () => {
    const publisher = new Publisher({ network: "regtest", maxBatchSize: 3 });
    const q = publisher.quote({ name: "alice", ownerPubkey: OWNER, paymentRail: "lightning" });
    await publisher.submit({ quoteId: q.quoteId, paymentProof: { rail: "lightning" } });
    expect(publisher.pendingCount()).toBe(1);

    const restored = new Publisher({ network: "regtest", maxBatchSize: 3 });
    restored.restore(publisher.snapshot());
    expect(restored.pendingCount()).toBe(1);
    expect(restored.status(q.quoteId).status).toBe("paid");
  });
});

describe("Publisher snapshot + restore", () => {
  it("round-trips a confirmed claim through snapshot/restore", async () => {
    const original = fresh();
    const quote = original.quote({ name: "alice", ownerPubkey: OWNER, paymentRail: "lightning" });
    await original.submit({ quoteId: quote.quoteId, paymentProof: { rail: "lightning" } });

    const snapshot = original.snapshot();
    const restored = fresh();
    restored.restore(snapshot);

    // The restored publisher reports the same confirmed status.
    const status = restored.status(quote.quoteId);
    expect(status.status).toBe("confirmed");
    expect(status.inclusionProof?.leaf).toBe(quote.leaf);

    // And it still treats the name as taken.
    const secondQuote = restored.quote({ name: "alice", ownerPubkey: OWNER, paymentRail: "lightning" });
    expect(secondQuote.available).toBe(false);
    expect(secondQuote.reason).toBe("taken");
  });

  it("preserves a live reservation across restore", () => {
    const original = fresh();
    const quote = original.quote({ name: "bob", ownerPubkey: OWNER, paymentRail: "lightning" });

    const restored = fresh();
    restored.restore(original.snapshot());

    const second = restored.quote({ name: "bob", ownerPubkey: OWNER, paymentRail: "lightning" });
    expect(second.available).toBe(false);
    expect(second.reason).toBe("reserved");
    expect(restored.status(quote.quoteId).status).toBe("quoted");
  });

  it("fires onChange after each mutation", async () => {
    let count = 0;
    const publisher = new Publisher({ network: "regtest", onChange: () => (count += 1) });
    const before = count;
    publisher.quote({ name: "alice", ownerPubkey: OWNER, paymentRail: "lightning" });
    expect(count).toBeGreaterThan(before);
    const mid = count;
    const quote = publisher.quote({ name: "bob", ownerPubkey: OWNER, paymentRail: "lightning" });
    expect(count).toBeGreaterThan(mid);
    const beforeSubmit = count;
    await publisher.submit({ quoteId: quote.quoteId, paymentProof: { rail: "lightning" } });
    expect(count).toBeGreaterThan(beforeSubmit);
  });
});
