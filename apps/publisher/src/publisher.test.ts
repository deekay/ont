import { encodeRootAnchorPayload, InMemoryOntIndexer, verifyAccumulatorProof } from "@ont/core";
import { bytesToHex } from "@ont/protocol";
import { describe, expect, it } from "vitest";

import { Publisher, PublisherError } from "./publisher.js";

const OWNER = "ab".repeat(32);
const OTHER = "cd".repeat(32);

function fresh(): Publisher {
  return new Publisher({ network: "regtest" });
}

describe("Publisher quote → submit → confirmed flow", () => {
  it("issues a quote for an available name with the right shape", async () => {
    const publisher = fresh();
    const quote = await publisher.quote({ name: "Satoshi", ownerPubkey: OWNER, paymentRail: "lightning" });
    expect(quote.available).toBe(true);
    expect(quote.name).toBe("satoshi"); // normalized
    expect(quote.leaf).toMatch(/^[0-9a-f]{64}$/);
    expect(quote.ownerCommitment).toBe(OWNER);
    expect(quote.lightningInvoice).toContain(quote.quoteId);
    expect(quote.totalBaseSats).toBe((1000n + 200n).toString());
  });

  it("rejects a non-hex owner pubkey", async () => {
    const publisher = fresh();
    await expect(publisher.quote({ name: "alice", ownerPubkey: "nope", paymentRail: "lightning" }))
      .rejects.toThrow(PublisherError);
  });

  it("returns unavailable for a name reserved by a DIFFERENT owner's live quote", async () => {
    const publisher = fresh();
    await publisher.quote({ name: "alice", ownerPubkey: OWNER, paymentRail: "lightning" });
    const second = await publisher.quote({ name: "alice", ownerPubkey: OTHER, paymentRail: "lightning" });
    expect(second.available).toBe(false);
    expect(second.reason).toBe("reserved");
  });

  it("re-quoting your own pending name is idempotent (same quote, still available)", async () => {
    const publisher = fresh();
    const first = await publisher.quote({ name: "alice", ownerPubkey: OWNER, paymentRail: "lightning" });
    const second = await publisher.quote({ name: "alice", ownerPubkey: OWNER, paymentRail: "lightning" });
    expect(second.available).toBe(true);
    expect(second.quoteId).toBe(first.quoteId);
  });

  it("walks quoted → confirmed on submit, producing a verifying inclusion proof", async () => {
    const publisher = fresh();
    const quote = await publisher.quote({ name: "alice", ownerPubkey: OWNER, paymentRail: "lightning" });
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
    const first = await publisher.quote({ name: "alice", ownerPubkey: OWNER, paymentRail: "lightning" });
    await publisher.submit({ quoteId: first.quoteId, paymentProof: { rail: "lightning" } });
    const second = await publisher.quote({ name: "alice", ownerPubkey: OWNER, paymentRail: "lightning" });
    expect(second.available).toBe(false);
    expect(second.reason).toBe("taken");
  });

  it("idempotent status lookup", async () => {
    const publisher = fresh();
    const quote = await publisher.quote({ name: "alice", ownerPubkey: OWNER, paymentRail: "lightning" });
    await publisher.submit({ quoteId: quote.quoteId, paymentProof: { rail: "lightning" } });
    const first = publisher.status(quote.quoteId);
    const second = publisher.status(quote.quoteId);
    expect(first.status).toBe("confirmed");
    expect(second.status).toBe("confirmed");
    expect(first.anchorTxid).toBe(second.anchorTxid);
  });

  it("lists names owned by a pubkey (gap-scan reverse lookup), scoped to confirmed claims", async () => {
    const publisher = fresh();
    const q1 = await publisher.quote({ name: "alice", ownerPubkey: OWNER, paymentRail: "lightning" });
    await publisher.submit({ quoteId: q1.quoteId, paymentProof: { rail: "lightning" } });
    const q2 = await publisher.quote({ name: "bob", ownerPubkey: OTHER, paymentRail: "lightning" });
    await publisher.submit({ quoteId: q2.quoteId, paymentProof: { rail: "lightning" } });

    expect(publisher.namesOwnedBy(OWNER)).toEqual(["alice"]);
    expect(publisher.namesOwnedBy(OTHER)).toEqual(["bob"]);
    // A different (unused) HD index owns nothing → the gap-scan stops there.
    expect(publisher.namesOwnedBy("ef".repeat(32))).toEqual([]);
  });

  it("rejects a non-hex owner pubkey in the reverse lookup", () => {
    const publisher = fresh();
    expect(() => publisher.namesOwnedBy("nope")).toThrow(PublisherError);
  });

  it("exposes batch data for data-availability checks", async () => {
    const publisher = fresh();
    const quote = await publisher.quote({ name: "alice", ownerPubkey: OWNER, paymentRail: "lightning" });
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

  it("serves a DA bundle whose leaf proofs verify against the anchored root", async () => {
    const publisher = fresh();
    const quote = await publisher.quote({ name: "alice", ownerPubkey: OWNER, paymentRail: "lightning" });
    const receipt = await publisher.submit({ quoteId: quote.quoteId, paymentProof: { rail: "lightning" } });
    const root = receipt.inclusionProof!.root;

    const bundle = publisher.daBundle(root);
    expect(bundle.root).toBe(root);
    expect(bundle.leaves).toHaveLength(1);
    const leaf = bundle.leaves[0]!;
    expect(leaf.name).toBe("alice");
    expect(leaf.ownerPubkey).toBe(OWNER);
    // The proof must verify against the anchored root with @ont/core's verifier —
    // this is exactly what the indexer re-checks before merging.
    expect(verifyAccumulatorProof(root, leaf.proof)).toBe(true);
  });

  it("404s a DA bundle for an unknown root", () => {
    const publisher = fresh();
    expect(() => publisher.daBundle("ab".repeat(32))).toThrow(PublisherError);
  });

  it("closes the cheap-rail loop: publisher anchor + DA → indexer resolves the name", async () => {
    // 1. Claim on the publisher (as the claim site does) → it seals + anchors a batch.
    const publisher = fresh();
    const quote = await publisher.quote({ name: "alice", ownerPubkey: OWNER, paymentRail: "lightning" });
    const receipt = await publisher.submit({ quoteId: quote.quoteId, paymentProof: { rail: "lightning" } });
    const batch = publisher.batch(receipt.batchId!);

    // 2. A fresh indexer (the resolver's) sees the publisher's RootAnchor on-chain.
    //    The first batch's prevRoot must equal the indexer's genesis tip — the bug we fixed.
    const indexer = new InMemoryOntIndexer({ launchHeight: 100 });
    const anchorTx = {
      txid: "a1".repeat(32),
      inputs: [{ txid: null, vout: null, coinbase: false }],
      outputs: [
        {
          valueSats: 0n,
          scriptType: "op_return" as const,
          dataHex: bytesToHex(
            encodeRootAnchorPayload({ prevRoot: batch.prevRoot, newRoot: batch.newRoot, batchSize: batch.leaves.length })
          )
        }
      ]
    };
    indexer.ingestBlock({ height: 100, hash: "bb".repeat(32), transactions: [anchorTx] });
    // The anchor was ACCEPTED (genesis prevRoot matched) and is awaiting its data.
    expect(indexer.getConfirmedAccumulatorRoot()).toBe(batch.newRoot);
    expect(indexer.unresolvedAnchorRoots()).toEqual([batch.newRoot.toLowerCase()]);
    expect(indexer.getAccumulatorName("alice")).toBeNull();

    // 3. The resolver fetches the publisher's DA bundle and applies it (re-verifying).
    const bundle = publisher.daBundle(batch.newRoot);
    expect(indexer.applyBatchData(batch.newRoot, bundle.leaves)).toBe(1);

    // 4. The name claimed on the claim site now resolves through the indexer.
    expect(indexer.getAccumulatorName("alice")?.currentOwnerPubkey).toBe(OWNER.toLowerCase());
    expect(indexer.resolveName("alice")?.source).toBe("accumulator");
    expect(indexer.unresolvedAnchorRoots()).toEqual([]);
  });

  it("rejects an unknown quoteId", () => {
    const publisher = fresh();
    expect(() => publisher.status("nope")).toThrow(PublisherError);
  });

  it("refuses an unsupported payment rail in v0", async () => {
    const publisher = fresh();
    await expect(
      publisher.quote({ name: "alice", ownerPubkey: OWNER, paymentRail: "l1" })
    ).rejects.toThrow(PublisherError);
  });

  it("expires a quote whose TTL has passed before submit", async () => {
    let now = new Date("2030-01-01T00:00:00Z").getTime();
    const publisher = new Publisher({
      network: "regtest",
      quoteTtlSeconds: 60,
      clock: () => new Date(now)
    });
    const quote = await publisher.quote({ name: "alice", ownerPubkey: OWNER, paymentRail: "lightning" });
    now += 120 * 1000;
    const receipt = await publisher.submit({
      quoteId: quote.quoteId,
      paymentProof: { rail: "lightning" }
    });
    expect(receipt.status).toBe("expired");
    const after = await publisher.quote({ name: "alice", ownerPubkey: OWNER, paymentRail: "lightning" });
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
    const quote = await publisher.quote({ name: "alice", ownerPubkey: OWNER, paymentRail: "lightning" });
    const receipt = await publisher.submit({ quoteId: quote.quoteId, paymentProof: { rail: "lightning" } });
    expect(receipt.status).toBe("confirmed");
    expect(publisher.pendingCount()).toBe(0);
  });

  it("queues until maxBatchSize is reached, then seals all at once", async () => {
    const publisher = new Publisher({ network: "regtest", maxBatchSize: 3 });
    const q1 = await publisher.quote({ name: "a", ownerPubkey: OWNER, paymentRail: "lightning" });
    const q2 = await publisher.quote({ name: "b", ownerPubkey: OWNER, paymentRail: "lightning" });
    const q3 = await publisher.quote({ name: "c", ownerPubkey: OWNER, paymentRail: "lightning" });

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
    const quote = await publisher.quote({ name: "alice", ownerPubkey: OWNER, paymentRail: "lightning" });
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
    const q = await publisher.quote({ name: "alice", ownerPubkey: OWNER, paymentRail: "lightning" });
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
    const quote = await original.quote({ name: "alice", ownerPubkey: OWNER, paymentRail: "lightning" });
    await original.submit({ quoteId: quote.quoteId, paymentProof: { rail: "lightning" } });

    const snapshot = original.snapshot();
    const restored = fresh();
    restored.restore(snapshot);

    // The restored publisher reports the same confirmed status.
    const status = restored.status(quote.quoteId);
    expect(status.status).toBe("confirmed");
    expect(status.inclusionProof?.leaf).toBe(quote.leaf);

    // And it still treats the name as taken.
    const secondQuote = await restored.quote({ name: "alice", ownerPubkey: OWNER, paymentRail: "lightning" });
    expect(secondQuote.available).toBe(false);
    expect(secondQuote.reason).toBe("taken");
  });

  it("preserves a live reservation across restore", async () => {
    const original = fresh();
    const quote = await original.quote({ name: "bob", ownerPubkey: OWNER, paymentRail: "lightning" });

    const restored = fresh();
    restored.restore(original.snapshot());

    const second = await restored.quote({ name: "bob", ownerPubkey: OTHER, paymentRail: "lightning" });
    expect(second.available).toBe(false);
    expect(second.reason).toBe("reserved");
    expect(restored.status(quote.quoteId).status).toBe("quoted");
  });

  it("fires onChange after each mutation", async () => {
    let count = 0;
    const publisher = new Publisher({ network: "regtest", onChange: () => (count += 1) });
    const before = count;
    await publisher.quote({ name: "alice", ownerPubkey: OWNER, paymentRail: "lightning" });
    expect(count).toBeGreaterThan(before);
    const mid = count;
    const quote = await publisher.quote({ name: "bob", ownerPubkey: OWNER, paymentRail: "lightning" });
    expect(count).toBeGreaterThan(mid);
    const beforeSubmit = count;
    await publisher.submit({ quoteId: quote.quoteId, paymentProof: { rail: "lightning" } });
    expect(count).toBeGreaterThan(beforeSubmit);
  });
});
