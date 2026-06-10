import { afterEach, describe, expect, it, vi } from "vitest";

import { computeValueRecordHash, signValueRecord } from "@ont/protocol";

import {
  fetchNameActivity,
  fetchRecentActivity,
  fetchNameRecord,
  fetchNameValueHistoryFromResolvers,
  fetchTransactionProvenance,
  fetchNameValueRecord,
  ResolverHttpError
} from "./resolver-actions.js";

const ORIGINAL_FETCH = globalThis.fetch;

// Real signed value records — the multi-resolver fanout now gates canonical
// selection on cryptographic verification (MR1), so test histories must carry
// genuine signatures + recomputable hashes, not placeholders.
const VR_OWNER_PRIV = "11".repeat(32);
const VR_OWNERSHIP_REF = "aa".repeat(32);

function signedValueRecord(over: {
  readonly sequence: number;
  readonly previousRecordHash: string | null;
  readonly payloadHex?: string;
  readonly issuedAt?: string;
}): Record<string, unknown> {
  const fields = {
    name: "example123456",
    ownershipRef: VR_OWNERSHIP_REF,
    sequence: over.sequence,
    previousRecordHash: over.previousRecordHash,
    valueType: 1,
    payloadHex: over.payloadHex ?? "01",
    issuedAt: over.issuedAt ?? "2026-04-15T12:00:00.000Z"
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
      name: "example123456",
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

describe("resolver actions", () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it("fetches name records from the resolver", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          name: "example123456",
          status: "immature",
          currentOwnerPubkey: "11".repeat(32),
          claimCommitTxid: "aa".repeat(32),
          claimRevealTxid: "bb".repeat(32),
          claimHeight: 100,
          maturityHeight: 4100,
          requiredBondSats: "50000",
          currentBondTxid: "cc".repeat(32),
          currentBondVout: 0,
          currentBondValueSats: "50000",
          lastStateTxid: "bb".repeat(32),
          lastStateHeight: 100,
          winningCommitBlockHeight: 100,
          winningCommitTxIndex: 1
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      )
    ) as typeof fetch;

    const result = await fetchNameRecord({
      name: "Example123456",
      resolverUrl: "http://127.0.0.1:8787/"
    });

    expect(result.status).toBe("immature");
    expect(globalThis.fetch).toHaveBeenCalledWith("http://127.0.0.1:8787/name/example123456");
  });

  it("surfaces resolver HTTP errors with structured payloads", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
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
      )
    ) as typeof fetch;

    await expect(
      fetchNameValueRecord({
        name: "example123456",
        resolverUrl: "http://127.0.0.1:8787"
      })
    ).rejects.toMatchObject({
      status: 404,
      code: "value_not_found",
      message: "No destination record yet."
    } satisfies Partial<ResolverHttpError>);
  });

  it("fetches transaction provenance from the resolver", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          txid: "aa".repeat(32),
          blockHeight: 100,
          txIndex: 0,
          inputs: [],
          outputs: [
            {
              valueSats: "6250000",
              scriptType: "payment"
            }
          ],
          events: [
            {
              vout: 1,
              type: 7,
              typeName: "AUCTION_BID",
              payload: {
                flags: 0,
                bondVout: 0,
                ownerPubkey: "11".repeat(32),
                settlementLockBlocks: 525600,
                bidAmountSats: "100000000",
                auctionLotCommitment: "22".repeat(32),
                auctionCommitment: "33".repeat(32),
                bidderCommitment: "44".repeat(32)
              },
              validationStatus: "applied",
              reason: "auction_bid_recorded",
              affectedName: "example123456"
            }
          ],
          invalidatedNames: []
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      )
    ) as typeof fetch;

    const result = await fetchTransactionProvenance({
      txid: "AA".repeat(32),
      resolverUrl: "http://127.0.0.1:8787"
    });

    expect(result.txid).toBe("aa".repeat(32));
    expect(result.events[0]?.typeName).toBe("AUCTION_BID");
    expect(globalThis.fetch).toHaveBeenCalledWith(`http://127.0.0.1:8787/tx/${"aa".repeat(32)}`);
  });

  it("fetches recent activity from the resolver", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          activity: [
            {
              txid: "bb".repeat(32),
              blockHeight: 101,
              txIndex: 0,
              inputs: [],
              outputs: [],
              events: [],
              invalidatedNames: []
            }
          ]
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      )
    ) as typeof fetch;

    const result = await fetchRecentActivity({
      resolverUrl: "http://127.0.0.1:8787",
      limit: 5
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.txid).toBe("bb".repeat(32));
    expect(globalThis.fetch).toHaveBeenCalledWith("http://127.0.0.1:8787/activity?limit=5");
  });

  it("fetches name-specific activity from the resolver", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          name: "example123456",
          activity: [
            {
              txid: "cc".repeat(32),
              blockHeight: 102,
              txIndex: 0,
              inputs: [],
              outputs: [],
              events: [],
              invalidatedNames: []
            }
          ]
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      )
    ) as typeof fetch;

    const result = await fetchNameActivity({
      name: "Example123456",
      resolverUrl: "http://127.0.0.1:8787",
      limit: 4
    });

    expect(result.name).toBe("example123456");
    expect(result.activity[0]?.txid).toBe("cc".repeat(32));
    expect(globalThis.fetch).toHaveBeenCalledWith("http://127.0.0.1:8787/name/example123456/activity?limit=4");
  });

  it("summarizes multi-resolver value history agreement and lag", async () => {
    const rec1 = signedValueRecord({ sequence: 1, previousRecordHash: null });
    const rec2 = signedValueRecord({
      sequence: 2,
      previousRecordHash: rec1.recordHash as string,
      payloadHex: "02",
      issuedAt: "2026-04-15T12:01:00.000Z"
    });

    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);
      // resolver-a is ahead (seq 1+2); resolver-b lags (seq 1 only); resolver-c missing.
      if (url === "http://resolver-a.test/name/example123456/value/history") {
        return valueHistoryResponse([rec1, rec2]);
      }
      if (url === "http://resolver-b.test/name/example123456/value/history") {
        return valueHistoryResponse([rec1]);
      }
      return new Response(
        JSON.stringify({ error: "value_not_found", message: "No destination record yet." }),
        { status: 404, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const result = await fetchNameValueHistoryFromResolvers({
      name: "Example123456",
      resolverUrls: [
        "http://resolver-a.test",
        "http://resolver-b.test",
        "http://resolver-c.test"
      ]
    });

    expect(result.status).toBe("lagging");
    expect(result.canonicalResolverUrl).toBe("http://resolver-a.test");
    expect(result.currentSequence).toBe(2);
    expect(result.laggingResolverUrls).toEqual(["http://resolver-b.test"]);
    expect(result.missingResolverUrls).toEqual(["http://resolver-c.test"]);
    expect(result.rejectedResolverUrls).toEqual([]);
  });

  it("rejects a forged longer chain — it cannot be promoted to canonical (MR1)", async () => {
    // Honest resolver-a serves the real single-record chain. Malicious resolver-b
    // serves a LONGER chain (seq 1+2) with garbage signatures — exactly the MR1
    // attack. The forged chain must be rejected, not promoted for being longer.
    const real = signedValueRecord({ sequence: 1, previousRecordHash: null });
    const forged1 = { ...real, signature: "44".repeat(64), recordHash: "22".repeat(32) };
    const forged2 = {
      ...real,
      sequence: 2,
      previousRecordHash: "22".repeat(32),
      payloadHex: "deadbeef", // points the name at an attacker destination
      signature: "55".repeat(64),
      recordHash: "33".repeat(32)
    };

    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url === "http://resolver-a.test/name/example123456/value/history") {
        return valueHistoryResponse([real]);
      }
      return valueHistoryResponse([forged1, forged2]); // resolver-b, longer but forged
    }) as typeof fetch;

    const result = await fetchNameValueHistoryFromResolvers({
      name: "Example123456",
      resolverUrls: ["http://resolver-a.test", "http://resolver-b.test"]
    });

    // The honest (shorter) chain wins; the forged longer chain is rejected, never canonical.
    expect(result.canonicalResolverUrl).toBe("http://resolver-a.test");
    expect(result.currentSequence).toBe(1);
    expect(result.rejectedResolverUrls).toEqual(["http://resolver-b.test"]);
    expect(result.status).toBe("conflict");
  });

  it("marks divergent successors in the same ownership interval as a conflict", async () => {
    // Both chains are validly signed by the owner and share seq 1, but their seq-2
    // successors differ — a genuine fork the owner shouldn't have produced.
    const rec1 = signedValueRecord({ sequence: 1, previousRecordHash: null });
    const rec2a = signedValueRecord({
      sequence: 2,
      previousRecordHash: rec1.recordHash as string,
      payloadHex: "02",
      issuedAt: "2026-04-15T12:01:00.000Z"
    });
    const rec2b = signedValueRecord({
      sequence: 2,
      previousRecordHash: rec1.recordHash as string,
      payloadHex: "ff",
      issuedAt: "2026-04-15T12:01:30.000Z"
    });

    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url === "http://resolver-a.test/name/example123456/value/history") {
        return valueHistoryResponse([rec1, rec2a]);
      }
      return valueHistoryResponse([rec1, rec2b]); // resolver-b: divergent seq-2
    }) as typeof fetch;

    const result = await fetchNameValueHistoryFromResolvers({
      name: "Example123456",
      resolverUrls: [
        "http://resolver-a.test",
        "http://resolver-b.test"
      ]
    });

    expect(result.status).toBe("conflict");
    expect(result.currentSequence).toBe(2);
    expect(result.conflictingResolverUrls).toEqual(["http://resolver-b.test"]);
  });
});
