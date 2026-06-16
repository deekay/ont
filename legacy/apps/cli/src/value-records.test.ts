import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createSignedValueRecord,
  publishValueRecord,
  publishValueRecordToResolvers
} from "./value-records.js";

const ORIGINAL_FETCH = globalThis.fetch;

describe("destination record helpers", () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it("creates signed destination records from UTF-8 payloads", () => {
    const record = createSignedValueRecord({
      name: "Alice",
      ownerPrivateKeyHex: "0e".repeat(32),
      ownershipRef: "aa".repeat(32),
      sequence: 1,
      previousRecordHash: null,
      valueType: 0x02,
      issuedAt: "2026-04-15T12:00:00.000Z",
      payloadUtf8: "https://example.com/alice"
    });

    expect(record.name).toBe("alice");
    expect(record.payloadHex).toBe(Buffer.from("https://example.com/alice", "utf8").toString("hex"));
    expect(record.signature).toHaveLength(128);
  });

  it("publishes signed destination records to the resolver", async () => {
    const record = createSignedValueRecord({
      name: "bob",
      ownerPrivateKeyHex: "0f".repeat(32),
      ownershipRef: "bb".repeat(32),
      sequence: 2,
      previousRecordHash: "cc".repeat(32),
      valueType: 0x01,
      issuedAt: "2026-04-15T12:01:00.000Z",
      payloadHex: "001122"
    });

    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          name: record.name,
          sequence: record.sequence
        }),
        {
          status: 201,
          headers: {
            "content-type": "application/json"
          }
        }
      )
    ) as typeof fetch;

    await expect(
      publishValueRecord({
        resolverUrl: "http://127.0.0.1:8787",
        valueRecord: record
      })
    ).resolves.toMatchObject({
      ok: true,
      name: "bob",
      sequence: 2
    });
  });

  it("publishes the same signed destination record to multiple resolvers", async () => {
    const record = createSignedValueRecord({
      name: "carol",
      ownerPrivateKeyHex: "10".repeat(32),
      ownershipRef: "dd".repeat(32),
      sequence: 3,
      previousRecordHash: "ee".repeat(32),
      valueType: 0x01,
      issuedAt: "2026-04-15T12:02:00.000Z",
      payloadUtf8: "lnurl1example"
    });

    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);

      if (url.startsWith("http://resolver-a.test")) {
        return new Response(
          JSON.stringify({
            ok: true,
            name: record.name,
            sequence: record.sequence
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

    await expect(
      publishValueRecordToResolvers({
        resolverUrls: ["http://resolver-a.test", "http://resolver-b.test"],
        valueRecord: record
      })
    ).resolves.toMatchObject({
      kind: "ont-multi-resolver-value-publish",
      name: "carol",
      sequence: 3,
      resolverCount: 2,
      successCount: 1,
      failureCount: 1
    });
  });
});
