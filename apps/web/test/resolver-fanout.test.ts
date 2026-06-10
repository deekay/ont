import { afterEach, describe, expect, it, vi } from "vitest";
import { computeValueRecordHash, signValueRecord } from "@ont/protocol";

import {
  fetchNameValueHistoryFromResolvers,
  publishValueRecordToResolvers,
  resolveConfiguredResolverUrls,
  verifyResolverValueHistory
} from "../src/resolver-fanout.js";

const ORIGINAL_FETCH = globalThis.fetch;

// Real signed value records — the fanout gates canonical selection on
// cryptographic verification (MR1), so histories must carry genuine signatures.
const VR_OWNER_PRIV = "11".repeat(32);
const VR_OWNERSHIP_REF = "aa".repeat(32);

function signedValueRecord(over: {
  readonly sequence: number;
  readonly previousRecordHash: string | null;
  readonly payloadHex?: string;
  readonly issuedAt?: string;
}): Record<string, unknown> {
  const fields = {
    name: "alice",
    ownershipRef: VR_OWNERSHIP_REF,
    sequence: over.sequence,
    previousRecordHash: over.previousRecordHash,
    valueType: 1,
    payloadHex: over.payloadHex ?? "01",
    issuedAt: over.issuedAt ?? "2026-04-16T14:00:00.000Z"
  };
  const signed = signValueRecord({ ...fields, ownerPrivateKeyHex: VR_OWNER_PRIV });
  return {
    ...signed,
    recordHash: computeValueRecordHash({
      name: signed.name,
      ownerPubkey: signed.ownerPubkey,
      ownershipRef: signed.ownershipRef,
      sequence: signed.sequence,
      previousRecordHash: signed.previousRecordHash,
      valueType: signed.valueType,
      payloadHex: signed.payloadHex,
      issuedAt: signed.issuedAt
    })
  };
}

function valueHistoryResponse(records: ReadonlyArray<Record<string, unknown>>): Response {
  const last = records.at(-1);
  return new Response(
    JSON.stringify({
      name: "alice",
      ownershipRef: VR_OWNERSHIP_REF,
      currentRecordHash: last?.recordHash ?? null,
      completeFromSequence: records[0]?.sequence ?? 0,
      completeToSequence: last?.sequence ?? 0,
      hasGaps: false,
      hasForks: false,
      records
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

describe("resolver fanout helpers", () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it("deduplicates configured resolver URLs while keeping the primary first", () => {
    expect(
      resolveConfiguredResolverUrls("http://resolver-a.test", "http://resolver-b.test http://resolver-a.test")
    ).toEqual(["http://resolver-a.test", "http://resolver-b.test"]);
  });

  it("summarizes lagging and missing value history across resolvers", async () => {
    const rec1 = signedValueRecord({ sequence: 1, previousRecordHash: null });
    const rec2 = signedValueRecord({
      sequence: 2,
      previousRecordHash: rec1.recordHash as string,
      payloadHex: "02",
      issuedAt: "2026-04-16T14:01:00.000Z"
    });

    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url === "http://resolver-a.test/name/alice/value/history") {
        return valueHistoryResponse([rec1, rec2]);
      }
      if (url === "http://resolver-b.test/name/alice/value/history") {
        return valueHistoryResponse([rec1]);
      }
      return new Response(
        JSON.stringify({ error: "value_not_found", message: "No destination record yet." }),
        { status: 404, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const summary = await fetchNameValueHistoryFromResolvers({
      name: "Alice",
      resolverUrls: [
        "http://resolver-a.test",
        "http://resolver-b.test",
        "http://resolver-c.test"
      ]
    });

    expect(summary.status).toBe("lagging");
    expect(summary.canonicalResolverUrl).toBe("http://resolver-a.test");
    expect(summary.currentSequence).toBe(2);
    expect(summary.laggingResolverUrls).toEqual(["http://resolver-b.test"]);
    expect(summary.missingResolverUrls).toEqual(["http://resolver-c.test"]);
    expect(summary.rejectedResolverUrls).toEqual([]);
  });

  it("rejects a forged longer chain — it cannot be promoted to canonical (MR1)", async () => {
    const real = signedValueRecord({ sequence: 1, previousRecordHash: null });
    const forged1 = { ...real, signature: "44".repeat(64), recordHash: "22".repeat(32) };
    const forged2 = {
      ...real,
      sequence: 2,
      previousRecordHash: "22".repeat(32),
      payloadHex: "deadbeef",
      signature: "55".repeat(64),
      recordHash: "33".repeat(32)
    };

    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url === "http://resolver-a.test/name/alice/value/history") {
        return valueHistoryResponse([real]);
      }
      return valueHistoryResponse([forged1, forged2]); // resolver-b: longer but forged
    }) as typeof fetch;

    const summary = await fetchNameValueHistoryFromResolvers({
      name: "Alice",
      resolverUrls: ["http://resolver-a.test", "http://resolver-b.test"]
    });

    expect(summary.canonicalResolverUrl).toBe("http://resolver-a.test"); // honest shorter chain wins
    expect(summary.currentSequence).toBe(1);
    expect(summary.rejectedResolverUrls).toEqual(["http://resolver-b.test"]);
    expect(summary.status).toBe("conflict");
  });

  it("verifyResolverValueHistory accepts a real chain and rejects garbage signatures", () => {
    const rec1 = signedValueRecord({ sequence: 1, previousRecordHash: null });
    expect(verifyResolverValueHistory({
      name: "alice", ownershipRef: VR_OWNERSHIP_REF, currentRecordHash: rec1.recordHash as string,
      completeFromSequence: 1, completeToSequence: 1, hasGaps: false, hasForks: false,
      records: [rec1] as never
    })).toBe(true);
    expect(verifyResolverValueHistory({
      name: "alice", ownershipRef: VR_OWNERSHIP_REF, currentRecordHash: "33".repeat(32),
      completeFromSequence: 1, completeToSequence: 1, hasGaps: false, hasForks: false,
      records: [{ ...rec1, signature: "44".repeat(64) }] as never
    })).toBe(false);
  });

  it("marks divergent successors in the same ownership interval as a conflict", async () => {
    const rec1 = signedValueRecord({ sequence: 1, previousRecordHash: null });
    const rec2a = signedValueRecord({
      sequence: 2,
      previousRecordHash: rec1.recordHash as string,
      payloadHex: "02",
      issuedAt: "2026-04-16T14:01:00.000Z"
    });
    const rec2b = signedValueRecord({
      sequence: 2,
      previousRecordHash: rec1.recordHash as string,
      payloadHex: "ff",
      issuedAt: "2026-04-16T14:01:30.000Z"
    });

    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url === "http://resolver-a.test/name/alice/value/history") {
        return valueHistoryResponse([rec1, rec2a]);
      }
      return valueHistoryResponse([rec1, rec2b]); // resolver-b: divergent seq-2
    }) as typeof fetch;

    const summary = await fetchNameValueHistoryFromResolvers({
      name: "Alice",
      resolverUrls: [
        "http://resolver-a.test",
        "http://resolver-b.test"
      ]
    });

    expect(summary.status).toBe("conflict");
    expect(summary.currentSequence).toBe(2);
    expect(summary.conflictingResolverUrls).toEqual(["http://resolver-b.test"]);
  });

  it("publishes one signed destination record to all configured resolvers", async () => {
    const valueRecord = signValueRecord({
      name: "alice",
      ownerPrivateKeyHex: "01".repeat(32),
      ownershipRef: "aa".repeat(32),
      sequence: 2,
      previousRecordHash: "bb".repeat(32),
      valueType: 2,
      payloadHex: Buffer.from("https://example.com/alice", "utf8").toString("hex"),
      issuedAt: "2026-04-16T14:02:00.000Z"
    });

    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);

      if (url.startsWith("http://resolver-a.test")) {
        return new Response(
          JSON.stringify({
            ok: true,
            name: "alice",
            sequence: 2
          }),
          {
            status: 201,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }

      return new Response(
        JSON.stringify({
          error: "ownership_ref_mismatch",
          message: "Resolver is still indexing the previous ownership interval."
        }),
        {
          status: 409,
          headers: {
            "content-type": "application/json"
          }
        }
      );
    }) as typeof fetch;

    const summary = await publishValueRecordToResolvers({
      resolverUrls: ["http://resolver-a.test", "http://resolver-b.test"],
      valueRecord
    });

    expect(summary.successCount).toBe(1);
    expect(summary.failureCount).toBe(1);
    expect(summary.results[1]).toMatchObject({
      resolverUrl: "http://resolver-b.test",
      ok: false,
      status: 409,
      code: "ownership_ref_mismatch"
    });
  });
});
