import { afterEach, describe, expect, it, vi } from "vitest";
import { signValueRecord } from "@ont/protocol";

import {
  fetchNameValueHistoryFromResolvers,
  publishValueRecordToResolvers,
  resolveConfiguredResolverUrls
} from "../src/resolver-fanout.js";

const ORIGINAL_FETCH = globalThis.fetch;

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
    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);

      if (url === "http://resolver-a.test/name/alice/value/history") {
        return new Response(
          JSON.stringify({
            name: "alice",
            ownershipRef: "aa".repeat(32),
            currentRecordHash: "33".repeat(32),
            completeFromSequence: 1,
            completeToSequence: 2,
            hasGaps: false,
            hasForks: false,
            records: [
              {
                format: "ont-value-record",
                recordVersion: 2,
                name: "alice",
                ownerPubkey: "11".repeat(32),
                ownershipRef: "aa".repeat(32),
                sequence: 1,
                previousRecordHash: null,
                valueType: 1,
                payloadHex: "01",
                issuedAt: "2026-04-16T14:00:00.000Z",
                signature: "44".repeat(64),
                recordHash: "22".repeat(32)
              },
              {
                format: "ont-value-record",
                recordVersion: 2,
                name: "alice",
                ownerPubkey: "11".repeat(32),
                ownershipRef: "aa".repeat(32),
                sequence: 2,
                previousRecordHash: "22".repeat(32),
                valueType: 1,
                payloadHex: "02",
                issuedAt: "2026-04-16T14:01:00.000Z",
                signature: "55".repeat(64),
                recordHash: "33".repeat(32)
              }
            ]
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }

      if (url === "http://resolver-b.test/name/alice/value/history") {
        return new Response(
          JSON.stringify({
            name: "alice",
            ownershipRef: "aa".repeat(32),
            currentRecordHash: "22".repeat(32),
            completeFromSequence: 1,
            completeToSequence: 1,
            hasGaps: false,
            hasForks: false,
            records: [
              {
                format: "ont-value-record",
                recordVersion: 2,
                name: "alice",
                ownerPubkey: "11".repeat(32),
                ownershipRef: "aa".repeat(32),
                sequence: 1,
                previousRecordHash: null,
                valueType: 1,
                payloadHex: "01",
                issuedAt: "2026-04-16T14:00:00.000Z",
                signature: "44".repeat(64),
                recordHash: "22".repeat(32)
              }
            ]
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }

      return new Response(
        JSON.stringify({
          error: "value_not_found",
          message: "No destination record yet."
        }),
        {
          status: 404,
          headers: {
            "content-type": "application/json"
          }
        }
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
  });

  it("marks divergent successors in the same ownership interval as a conflict", async () => {
    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);

      if (url === "http://resolver-a.test/name/alice/value/history") {
        return new Response(
          JSON.stringify({
            name: "alice",
            ownershipRef: "aa".repeat(32),
            currentRecordHash: "33".repeat(32),
            completeFromSequence: 1,
            completeToSequence: 2,
            hasGaps: false,
            hasForks: false,
            records: [
              {
                format: "ont-value-record",
                recordVersion: 2,
                name: "alice",
                ownerPubkey: "11".repeat(32),
                ownershipRef: "aa".repeat(32),
                sequence: 1,
                previousRecordHash: null,
                valueType: 1,
                payloadHex: "01",
                issuedAt: "2026-04-16T14:00:00.000Z",
                signature: "44".repeat(64),
                recordHash: "22".repeat(32)
              },
              {
                format: "ont-value-record",
                recordVersion: 2,
                name: "alice",
                ownerPubkey: "11".repeat(32),
                ownershipRef: "aa".repeat(32),
                sequence: 2,
                previousRecordHash: "22".repeat(32),
                valueType: 1,
                payloadHex: "02",
                issuedAt: "2026-04-16T14:01:00.000Z",
                signature: "55".repeat(64),
                recordHash: "33".repeat(32)
              }
            ]
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }

      return new Response(
        JSON.stringify({
          name: "alice",
          ownershipRef: "aa".repeat(32),
          currentRecordHash: "44".repeat(32),
          completeFromSequence: 1,
          completeToSequence: 2,
          hasGaps: false,
          hasForks: false,
          records: [
            {
              format: "ont-value-record",
              recordVersion: 2,
              name: "alice",
              ownerPubkey: "11".repeat(32),
              ownershipRef: "aa".repeat(32),
              sequence: 1,
              previousRecordHash: null,
              valueType: 1,
              payloadHex: "01",
              issuedAt: "2026-04-16T14:00:00.000Z",
              signature: "44".repeat(64),
              recordHash: "22".repeat(32)
            },
            {
              format: "ont-value-record",
              recordVersion: 2,
              name: "alice",
              ownerPubkey: "11".repeat(32),
              ownershipRef: "aa".repeat(32),
              sequence: 2,
              previousRecordHash: "22".repeat(32),
              valueType: 1,
              payloadHex: "ff",
              issuedAt: "2026-04-16T14:01:30.000Z",
              signature: "66".repeat(64),
              recordHash: "44".repeat(32)
            }
          ]
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      );
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
