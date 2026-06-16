import { afterEach, describe, expect, it, vi } from "vitest";

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
    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);

      if (url === "http://resolver-a.test/name/example123456/value/history") {
        return new Response(
          JSON.stringify({
            name: "example123456",
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
                name: "example123456",
                ownerPubkey: "11".repeat(32),
                ownershipRef: "aa".repeat(32),
                sequence: 1,
                previousRecordHash: null,
                valueType: 1,
                payloadHex: "01",
                issuedAt: "2026-04-15T12:00:00.000Z",
                signature: "44".repeat(64),
                recordHash: "22".repeat(32)
              },
              {
                format: "ont-value-record",
                recordVersion: 2,
                name: "example123456",
                ownerPubkey: "11".repeat(32),
                ownershipRef: "aa".repeat(32),
                sequence: 2,
                previousRecordHash: "22".repeat(32),
                valueType: 1,
                payloadHex: "02",
                issuedAt: "2026-04-15T12:01:00.000Z",
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

      if (url === "http://resolver-b.test/name/example123456/value/history") {
        return new Response(
          JSON.stringify({
            name: "example123456",
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
                name: "example123456",
                ownerPubkey: "11".repeat(32),
                ownershipRef: "aa".repeat(32),
                sequence: 1,
                previousRecordHash: null,
                valueType: 1,
                payloadHex: "01",
                issuedAt: "2026-04-15T12:00:00.000Z",
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
  });

  it("marks divergent successors in the same ownership interval as a conflict", async () => {
    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);

      if (url === "http://resolver-a.test/name/example123456/value/history") {
        return new Response(
          JSON.stringify({
            name: "example123456",
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
                name: "example123456",
                ownerPubkey: "11".repeat(32),
                ownershipRef: "aa".repeat(32),
                sequence: 1,
                previousRecordHash: null,
                valueType: 1,
                payloadHex: "01",
                issuedAt: "2026-04-15T12:00:00.000Z",
                signature: "44".repeat(64),
                recordHash: "22".repeat(32)
              },
              {
                format: "ont-value-record",
                recordVersion: 2,
                name: "example123456",
                ownerPubkey: "11".repeat(32),
                ownershipRef: "aa".repeat(32),
                sequence: 2,
                previousRecordHash: "22".repeat(32),
                valueType: 1,
                payloadHex: "02",
                issuedAt: "2026-04-15T12:01:00.000Z",
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
          name: "example123456",
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
              name: "example123456",
              ownerPubkey: "11".repeat(32),
              ownershipRef: "aa".repeat(32),
              sequence: 1,
              previousRecordHash: null,
              valueType: 1,
              payloadHex: "01",
              issuedAt: "2026-04-15T12:00:00.000Z",
              signature: "44".repeat(64),
              recordHash: "22".repeat(32)
            },
            {
              format: "ont-value-record",
              recordVersion: 2,
              name: "example123456",
              ownerPubkey: "11".repeat(32),
              ownershipRef: "aa".repeat(32),
              sequence: 2,
              previousRecordHash: "22".repeat(32),
              valueType: 1,
              payloadHex: "ff",
              issuedAt: "2026-04-15T12:01:30.000Z",
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
