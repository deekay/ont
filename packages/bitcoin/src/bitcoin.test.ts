import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getOpReturnPayloads } from "./index.js";
import {
  BitcoinEsploraBlockPoller,
  BitcoinRpcBlockPoller,
  assertBitcoinRpcChain,
  createBitcoinEsploraConfig,
  createBitcoinRpcConfig,
  findBitcoinEsploraMatchingCheckpoint,
  findBitcoinRpcMatchingCheckpoint,
  getBitcoinEsploraAddressSummary,
  getBitcoinEsploraAddressUtxos,
  getBitcoinEsploraBlockHash,
  getBitcoinEsploraTipHeight,
  getBitcoinRpcBlockHash,
  getBitcoinRpcBlockchainInfo,
  getBitcoinRpcRawTransactionInfo,
  isBitcoinEsploraHeadCurrent,
  isBitcoinRpcHeadCurrent,
  loadBitcoinBlocksFixture,
  loadBitcoinBlocksFromSource,
  parseBitcoinBlocksFixture,
  parseBitcoinRpcBlock,
  sendBitcoinRpcRawTransaction
} from "./node.js";

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const ORIGINAL_FETCH = globalThis.fetch;

describe("parseBitcoinBlocksFixture", () => {
  it("parses valid fixture data into block structures", () => {
    const blocks = parseBitcoinBlocksFixture({
      blocks: [
        {
          hash: "abc",
          height: 1,
          transactions: [
            {
              txid: "tx1",
              inputs: [
                {
                  txid: "prev1",
                  vout: 0
                }
              ],
              outputs: [
                {
                  valueSats: "42",
                  scriptType: "payment"
                }
              ]
            }
          ]
        }
      ]
    });

    expect(blocks).toEqual([
      {
        hash: "abc",
        height: 1,
        transactions: [
          {
            txid: "tx1",
            inputs: [
              {
                txid: "prev1",
                vout: 0,
                coinbase: false
              }
            ],
            outputs: [
              {
                valueSats: 42n,
                scriptType: "payment"
              }
            ]
          }
        ]
      }
    ]);
  });

  it("carries an optional payment-output address (parsed destination, omitted when absent)", () => {
    const [block] = parseBitcoinBlocksFixture({
      blocks: [
        {
          hash: "abc",
          height: 1,
          transactions: [
            {
              txid: "tx1",
              outputs: [
                { valueSats: "42", scriptType: "payment", address: "bc1qexampledestination000000000000000000" },
                { valueSats: "0", scriptType: "payment" },
              ],
            },
          ],
        },
      ],
    });
    expect(block?.transactions[0]?.outputs[0]?.address).toBe("bc1qexampledestination000000000000000000");
    expect(block?.transactions[0]?.outputs[1]?.address).toBeUndefined();
  });

  it("rejects a non-string fixture output address", () => {
    expect(() =>
      parseBitcoinBlocksFixture({
        blocks: [
          {
            hash: "abc",
            height: 1,
            transactions: [
              { txid: "tx1", outputs: [{ valueSats: "1", scriptType: "payment", address: 5 as unknown as string }] },
            ],
          },
        ],
      })
    ).toThrow(/address must be a string/);
  });

  it("loads the shared demo-chain fixture from disk", () => {
    const fixturePath = resolve(CURRENT_DIR, "../../../fixtures/demo-chain.json");
    const blocks = loadBitcoinBlocksFixture(fixturePath);

    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.height).toBe(100);
    expect(blocks[1]?.transactions[0]?.txid).toBe("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  });
});

describe("parseBitcoinRpcBlock", () => {
  it("maps verbosity-2 rpc blocks into the shared block shape", () => {
    const block = parseBitcoinRpcBlock({
      hash: "blockhash",
      height: 123,
      tx: [
        {
          txid: "txid1",
          vin: [
            {
              txid: "prevtxid1",
              vout: 2
            }
          ],
          vout: [
            {
              value: 0,
              scriptPubKey: {
                type: "nulldata",
                asm: "OP_RETURN 4f4e540102aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa000000000000002a05616c696365"
              }
            },
            {
              value: 0.125,
              scriptPubKey: {
                type: "witness_v0_keyhash"
              }
            }
          ]
        }
      ]
    });

    expect(block).toEqual({
      hash: "blockhash",
      height: 123,
      transactions: [
        {
          txid: "txid1",
          inputs: [
            {
              txid: "prevtxid1",
              vout: 2,
              coinbase: false
            }
          ],
          outputs: [
            {
              valueSats: 0n,
              scriptType: "op_return",
              dataHex:
                "4f4e540102aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa000000000000002a05616c696365"
            },
            {
              valueSats: 12_500_000n,
              scriptType: "payment"
            }
          ]
        }
      ]
    });
  });
});

describe("getOpReturnPayloads", () => {
  it("ignores malformed op_return payload hex", () => {
    const payloads = getOpReturnPayloads({
      txid: "txid1",
      inputs: [],
      outputs: [
        {
          valueSats: 0n,
          scriptType: "op_return",
          dataHex: "abc"
        },
        {
          valueSats: 0n,
          scriptType: "op_return",
          dataHex: "zz"
        },
        {
          valueSats: 0n,
          scriptType: "op_return",
          dataHex: "4f4e54"
        }
      ]
    });

    expect(payloads).toEqual([
      {
        vout: 2,
        payload: Uint8Array.from([0x4f, 0x4e, 0x54])
      }
    ]);
  });
});

describe("loadBitcoinBlocksFromSource", () => {
  it("loads fixture-backed sources and surfaces the derived launch height", async () => {
    const fixturePath = resolve(CURRENT_DIR, "../../../fixtures/demo-chain.json");
    const loaded = await loadBitcoinBlocksFromSource({ fixturePath });

    expect(loaded.source).toBe("fixture");
    expect(loaded.descriptor).toBe(fixturePath);
    expect(loaded.launchHeight).toBe(100);
    expect(loaded.blocks).toHaveLength(2);
  });

  it("requires launchHeight when rpc is configured", async () => {
    await expect(
      loadBitcoinBlocksFromSource({
        rpc: createBitcoinRpcConfig("http://127.0.0.1:38332")
      })
    ).rejects.toThrow(/launchHeight/);
  });

  it("requires launchHeight when esplora is configured", async () => {
    await expect(
      loadBitcoinBlocksFromSource({
        esplora: createBitcoinEsploraConfig("https://mempool.space/signet/api")
      })
    ).rejects.toThrow(/launchHeight/);
  });
});

describe("Esplora-backed block loading", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);

      if (url.endsWith("/blocks/tip/height")) {
        return new Response("101", { status: 200 });
      }

      if (url.endsWith("/block-height/100")) {
        return new Response("hash100", { status: 200 });
      }

      if (url.endsWith("/block/hash100")) {
        return new Response(JSON.stringify({ id: "hash100", height: 100 }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (url.endsWith("/block/hash100/txids")) {
        return new Response(JSON.stringify(["txid100"]), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (url.endsWith("/tx/txid100")) {
        return new Response(
          JSON.stringify({
            txid: "txid100",
            vin: [{ txid: "prevtxid100", vout: 1, is_coinbase: false }],
            vout: [
              { value: 5000, scriptpubkey_type: "v0_p2wpkh" },
              {
                value: 0,
                scriptpubkey_type: "op_return",
                scriptpubkey_asm: "OP_RETURN 4f4e54"
              }
            ]
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }

      if (url.endsWith("/block-height/101")) {
        return new Response("hash101", { status: 200 });
      }

      if (url.endsWith("/block/hash101")) {
        return new Response(JSON.stringify({ id: "hash101", height: 101 }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (url.endsWith("/block/hash101/txids")) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      throw new Error(`unexpected esplora url ${url}`);
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it("loads blocks from an esplora source", async () => {
    const loaded = await loadBitcoinBlocksFromSource({
      esplora: createBitcoinEsploraConfig("https://mempool.space/signet/api"),
      launchHeight: 100
    });

    expect(loaded.source).toBe("esplora");
    expect(loaded.descriptor).toBe("https://mempool.space/signet/api");
    expect(loaded.blocks).toEqual([
      {
        hash: "hash100",
        height: 100,
        transactions: [
          {
            txid: "txid100",
            inputs: [{ txid: "prevtxid100", vout: 1, coinbase: false }],
            outputs: [
              { valueSats: 5000n, scriptType: "payment" },
              { valueSats: 0n, scriptType: "op_return", dataHex: "4f4e54" }
            ]
          }
        ]
      },
      {
        hash: "hash101",
        height: 101,
        transactions: []
      }
    ]);
  });

  it("polls incrementally from esplora", async () => {
    const poller = new BitcoinEsploraBlockPoller({
      esplora: createBitcoinEsploraConfig("https://mempool.space/signet/api"),
      launchHeight: 100
    });

    const initial = await poller.bootstrap();
    expect(initial.map((block) => block.height)).toEqual([100, 101]);
    expect(poller.getStatus()).toEqual({
      nextHeight: 102,
      lastTipHeight: 101
    });
  });

  it("checks esplora head continuity helpers", async () => {
    const esplora = createBitcoinEsploraConfig("https://mempool.space/signet/api");

    await expect(getBitcoinEsploraTipHeight(esplora)).resolves.toBe(101);
    await expect(getBitcoinEsploraBlockHash(esplora, 101)).resolves.toBe("hash101");
    await expect(isBitcoinEsploraHeadCurrent(esplora, 101, "hash101")).resolves.toBe(true);
    await expect(isBitcoinEsploraHeadCurrent(esplora, 101, "other")).resolves.toBe(false);
    await expect(isBitcoinEsploraHeadCurrent(esplora, null, null)).resolves.toBe(false);
  });

  it("loads esplora address summaries and utxos", async () => {
    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);

      if (url.endsWith("/address/tb1qexample")) {
        return new Response(
          JSON.stringify({
            address: "tb1qexample",
            chain_stats: {
              funded_txo_count: 1,
              funded_txo_sum: 50000,
              spent_txo_count: 0,
              spent_txo_sum: 0,
              tx_count: 1
            },
            mempool_stats: {
              funded_txo_count: 0,
              funded_txo_sum: 0,
              spent_txo_count: 0,
              spent_txo_sum: 0,
              tx_count: 0
            }
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }

      if (url.endsWith("/address/tb1qexample/utxo")) {
        return new Response(
          JSON.stringify([
            {
              txid: "a".repeat(64),
              vout: 0,
              value: 50000,
              status: {
                confirmed: false
              }
            }
          ]),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }

      throw new Error(`unexpected esplora url ${url}`);
    }) as typeof fetch;

    const esplora = createBitcoinEsploraConfig("https://mempool.space/signet/api");

    await expect(getBitcoinEsploraAddressSummary(esplora, "tb1qexample")).resolves.toMatchObject({
      address: "tb1qexample",
      chain_stats: {
        funded_txo_sum: 50000
      }
    });
    await expect(getBitcoinEsploraAddressUtxos(esplora, "tb1qexample")).resolves.toEqual([
      {
        txid: "a".repeat(64),
        vout: 0,
        value: 50000,
        status: {
          confirmed: false
        }
      }
    ]);
  });
});

describe("BitcoinRpcBlockPoller", () => {
  beforeEach(() => {
    const rpcResponses = new Map<string, unknown>([
      ["getblockcount:[]", 101],
      ["getblockhash:[100]", "hash100"],
      [
        "getblock:[\"hash100\",2]",
        {
          hash: "hash100",
          height: 100,
          tx: []
        }
      ],
      ["getblockhash:[101]", "hash101"],
      [
        "getblock:[\"hash101\",2]",
        {
          hash: "hash101",
          height: 101,
          tx: []
        }
      ],
      ["getblockcount-second:[]", 102],
      ["getblockhash:[102]", "hash102"],
      [
        "getblock:[\"hash102\",2]",
        {
          hash: "hash102",
          height: 102,
          tx: []
        }
      ]
    ]);

    let blockCountCalls = 0;

    globalThis.fetch = vi.fn(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };
      const key =
        body.method === "getblockcount"
          ? `${body.method}${blockCountCalls++ === 0 ? "" : "-second"}:${JSON.stringify(body.params)}`
          : `${body.method}:${JSON.stringify(body.params)}`;
      const result = rpcResponses.get(key);

      if (result === undefined) {
        throw new Error(`missing mock RPC response for ${key}`);
      }

      return new Response(
        JSON.stringify({
          result,
          error: null,
          id: "ont"
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      );
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it("bootstraps from launch height and then polls only new blocks", async () => {
    const poller = new BitcoinRpcBlockPoller({
      rpc: createBitcoinRpcConfig("http://127.0.0.1:38332"),
      launchHeight: 100
    });

    const initial = await poller.bootstrap();
    expect(initial.map((block) => block.height)).toEqual([100, 101]);
    expect(poller.getStatus()).toEqual({
      nextHeight: 102,
      lastTipHeight: 101
    });

    const incremental = await poller.poll();
    expect(incremental.map((block) => block.height)).toEqual([102]);
    expect(poller.getStatus()).toEqual({
      nextHeight: 103,
      lastTipHeight: 102
    });
  });
});

describe("isBitcoinRpcHeadCurrent", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };

      if (body.method === "getblockhash" && body.params[0] === 101) {
        return new Response(
          JSON.stringify({
            result: "hash101",
            error: null,
            id: "ont"
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }

      throw new Error(`unexpected method ${body.method}`);
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it("confirms whether the saved head still matches the best chain", async () => {
    const rpc = createBitcoinRpcConfig("http://127.0.0.1:38332");

    await expect(getBitcoinRpcBlockHash(rpc, 101)).resolves.toBe("hash101");
    await expect(isBitcoinRpcHeadCurrent(rpc, 101, "hash101")).resolves.toBe(true);
    await expect(isBitcoinRpcHeadCurrent(rpc, 101, "other")).resolves.toBe(false);
    await expect(isBitcoinRpcHeadCurrent(rpc, null, null)).resolves.toBe(false);
  });
});

describe("findBitcoinRpcMatchingCheckpoint", () => {
  it("returns the newest matching checkpoint", async () => {
    const rpc = createBitcoinRpcConfig("http://127.0.0.1:38332");

    globalThis.fetch = vi.fn(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };
      if (body.method === "getblockhash" && body.params[0] === 105) {
        return jsonRpcResponse("other");
      }
      if (body.method === "getblockhash" && body.params[0] === 104) {
        return jsonRpcResponse("hash104");
      }

      throw new Error("unexpected request");
    }) as typeof fetch;

    await expect(
      findBitcoinRpcMatchingCheckpoint(rpc, [
        { height: 104, hash: "hash104" },
        { height: 105, hash: "hash105" }
      ])
    ).resolves.toEqual({ height: 104, hash: "hash104" });
  });
});

describe("findBitcoinEsploraMatchingCheckpoint", () => {
  it("returns the newest matching checkpoint", async () => {
    const esplora = createBitcoinEsploraConfig("https://mempool.space/signet/api");

    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);

      if (url.endsWith("/block-height/105")) {
        return new Response("other", { status: 200 });
      }
      if (url.endsWith("/block-height/104")) {
        return new Response("hash104", { status: 200 });
      }

      throw new Error("unexpected request");
    }) as typeof fetch;

    await expect(
      findBitcoinEsploraMatchingCheckpoint(esplora, [
        { height: 104, hash: "hash104" },
        { height: 105, hash: "hash105" }
      ])
    ).resolves.toEqual({ height: 104, hash: "hash104" });
  });
});

describe("getBitcoinRpcBlockchainInfo", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };

      if (body.method === "getblockchaininfo") {
        return new Response(
          JSON.stringify({
            result: {
              chain: "signet",
              blocks: 321,
              headers: 321,
              bestblockhash: "besthash",
              initialblockdownload: false
            },
            error: null,
            id: "ont"
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }

      throw new Error(`unexpected method ${body.method}`);
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it("parses blockchain info and enforces the expected chain", async () => {
    const rpc = createBitcoinRpcConfig("http://127.0.0.1:38332");

    await expect(getBitcoinRpcBlockchainInfo(rpc)).resolves.toEqual({
      chain: "signet",
      blocks: 321,
      headers: 321,
      bestblockhash: "besthash",
      initialblockdownload: false
    });

    await expect(assertBitcoinRpcChain(rpc, "signet")).resolves.toEqual({
      chain: "signet",
      blocks: 321,
      headers: 321,
      bestblockhash: "besthash",
      initialblockdownload: false
    });

    await expect(assertBitcoinRpcChain(rpc, "regtest")).rejects.toThrow(/chain mismatch/);
  });
});

describe("raw transaction rpc helpers", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };

      if (body.method === "getrawtransaction") {
        return new Response(
          JSON.stringify({
            result: {
              txid: body.params[0],
              confirmations: 2,
              blockhash: "blockhash",
              in_active_chain: true
            },
            error: null,
            id: "ont"
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }

      if (body.method === "sendrawtransaction") {
        return new Response(
          JSON.stringify({
            result: "broadcast-txid",
            error: null,
            id: "ont"
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }

      throw new Error(`unexpected method ${body.method}`);
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it("loads raw transaction confirmation metadata", async () => {
    const rpc = createBitcoinRpcConfig("http://127.0.0.1:38332");

    await expect(getBitcoinRpcRawTransactionInfo(rpc, "aa".repeat(32))).resolves.toEqual({
      txid: "aa".repeat(32),
      confirmations: 2,
      blockhash: "blockhash",
      in_active_chain: true
    });
  });

  it("broadcasts raw transaction hex", async () => {
    const rpc = createBitcoinRpcConfig("http://127.0.0.1:38332");

    await expect(sendBitcoinRpcRawTransaction(rpc, "deadbeef")).resolves.toBe("broadcast-txid");
  });
});

describe("rpc fetch failures", () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it("surfaces the rpc url and method when fetch fails", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;

    const rpc = createBitcoinRpcConfig("https://your-remote-signet-node.example/rpc");

    await expect(getBitcoinRpcBlockchainInfo(rpc)).rejects.toThrow(
      /bitcoin rpc getblockchaininfo request to https:\/\/your-remote-signet-node\.example\/rpc failed: fetch failed/
    );
  });
});

function jsonRpcResponse(result: unknown): Response {
  return new Response(
    JSON.stringify({
      result,
      error: null,
      id: "ont"
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json"
      }
    }
  );
}
