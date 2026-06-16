import { afterEach, describe, expect, it, vi } from "vitest";
import { Transaction, payments } from "bitcoinjs-lib";

import { createBitcoinRpcConfig } from "@ont/bitcoin";

import {
  broadcastSignedArtifacts,
  checkEsploraAddress,
  checkEsploraConnection,
  checkRpcConnection
} from "./rpc-actions.js";

const ORIGINAL_FETCH = globalThis.fetch;

function createTransferTransactionHex(opReturnPayloadBytes: number): string {
  const transaction = new Transaction();
  const prevoutHash = Buffer.alloc(32, 1);
  const opReturnScript = payments.embed({
    data: [Buffer.alloc(opReturnPayloadBytes, 7)]
  }).output;

  if (!opReturnScript) {
    throw new Error("unable to create OP_RETURN script");
  }

  transaction.version = 2;
  transaction.addInput(prevoutHash, 0);
  transaction.addOutput(opReturnScript, 0n);
  transaction.addOutput(Buffer.from(`0014${"11".repeat(20)}`, "hex"), 10_000n);
  return transaction.toHex();
}

describe("checkRpcConnection", () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it("verifies a reachable signet RPC endpoint and reports chain/tip info", async () => {
    globalThis.fetch = vi.fn(async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as {
        method: string;
      };

      if (request.method === "getblockchaininfo") {
        return new Response(
          JSON.stringify({
            result: {
              chain: "signet",
              blocks: 2345,
              headers: 2345,
              bestblockhash: "00".repeat(32),
              initialblockdownload: false
            },
            error: null,
            id: "ont"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (request.method === "getblockcount") {
        return new Response(
          JSON.stringify({
            result: 2345,
            error: null,
            id: "ont"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      throw new Error(`unexpected rpc method ${request.method}`);
    }) as typeof fetch;

    await expect(
      checkRpcConnection({
        rpc: createBitcoinRpcConfig("https://remote-signet.example/rpc", "user", "pass"),
        expectedChain: "signet"
      })
    ).resolves.toMatchObject({
      kind: "ont-rpc-check-result",
      expectedChain: "signet",
      rpcUrl: "https://remote-signet.example/rpc",
      chain: "signet",
      blocks: 2345,
      blockCount: 2345
    });
  });
});

describe("checkEsploraConnection", () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it("verifies a reachable signet esplora endpoint and reports tip info", async () => {
    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);

      if (url.endsWith("/blocks/tip/height")) {
        return new Response("2345", { status: 200 });
      }

      if (url.endsWith("/block-height/2345")) {
        return new Response("00".repeat(32), { status: 200 });
      }

      throw new Error(`unexpected esplora url ${url}`);
    }) as typeof fetch;

    await expect(
      checkEsploraConnection({
        esplora: { baseUrl: "https://mempool.space/signet/api" },
        expectedChain: "signet"
      })
    ).resolves.toMatchObject({
      kind: "ont-esplora-check-result",
      expectedChain: "signet",
      baseUrl: "https://mempool.space/signet/api",
      tipHeight: 2345,
      tipHash: "00".repeat(32)
    });
  });

  it("loads address summaries and utxos from a signet esplora endpoint", async () => {
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
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/address/tb1qexample/utxo")) {
        return new Response(
          JSON.stringify([
            {
              txid: "11".repeat(32),
              vout: 1,
              value: 50000,
              status: {
                confirmed: true,
                block_height: 123
              }
            }
          ]),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      throw new Error(`unexpected esplora url ${url}`);
    }) as typeof fetch;

    await expect(
      checkEsploraAddress({
        esplora: { baseUrl: "https://mempool.space/signet/api" },
        address: "tb1qexample"
      })
    ).resolves.toMatchObject({
      kind: "ont-esplora-address-check-result",
      address: "tb1qexample",
      chainStats: {
        fundedSats: 50000
      },
      utxos: [
        {
          txid: "11".repeat(32),
          vout: 1,
          value: 50000,
          confirmed: true,
          blockHeight: 123
        }
      ]
    });
  });
});

describe("broadcastSignedArtifacts", () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it("warns when a transfer exceeds legacy conservative OP_RETURN sizing but the node allows it", async () => {
    const transactionHex = createTransferTransactionHex(135);
    const transactionId = Transaction.fromHex(transactionHex).getId();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    globalThis.fetch = vi.fn(async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as {
        method: string;
        params: unknown[];
      };

      if (request.method === "getmempoolinfo") {
        return new Response(
          JSON.stringify({
            result: {
              loaded: true,
              size: 1,
              bytes: 300,
              maxdatacarriersize: 100000
            },
            error: null,
            id: "ont"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (request.method === "testmempoolaccept") {
        return new Response(
          JSON.stringify({
            result: [
              {
                txid: transactionId,
                allowed: true,
                vsize: 180
              }
            ],
            error: null,
            id: "ont"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (request.method === "sendrawtransaction") {
        return new Response(
          JSON.stringify({
            result: transactionId,
            error: null,
            id: "ont"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      throw new Error(`unexpected rpc method ${request.method}`);
    }) as typeof fetch;

    await expect(
      broadcastSignedArtifacts({
        rpc: createBitcoinRpcConfig("http://127.0.0.1:38332"),
        esplora: undefined,
        expectedChain: "signet",
        signedArtifacts: {
          kind: "ont-signed-transfer-artifacts",
          network: "signet",
          signedTransactionHex: transactionHex,
          signedTransactionId: transactionId,
          signedPsbtBase64: "signed-psbt",
          signedInputCount: 1
        }
      })
    ).resolves.toEqual({
      broadcastedTxid: transactionId
    });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Modern Bitcoin Core defaults may relay it")
    );
  });

  it("stops before broadcast when the connected node rejects the transfer relay policy", async () => {
    const transactionHex = createTransferTransactionHex(135);
    const transactionId = Transaction.fromHex(transactionHex).getId();

    globalThis.fetch = vi.fn(async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as {
        method: string;
      };

      if (request.method === "getmempoolinfo") {
        return new Response(
          JSON.stringify({
            result: {
              loaded: true,
              size: 1,
              bytes: 300,
              maxdatacarriersize: 100000
            },
            error: null,
            id: "ont"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (request.method === "testmempoolaccept") {
        return new Response(
          JSON.stringify({
            result: [
              {
                txid: transactionId,
                allowed: false,
                "reject-reason": "scriptpubkey"
              }
            ],
            error: null,
            id: "ont"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (request.method === "sendrawtransaction") {
        throw new Error("sendrawtransaction should not run when testmempoolaccept rejects");
      }

      throw new Error(`unexpected rpc method ${request.method}`);
    }) as typeof fetch;

    await expect(
      broadcastSignedArtifacts({
        rpc: createBitcoinRpcConfig("http://127.0.0.1:38332"),
        esplora: undefined,
        expectedChain: "signet",
        signedArtifacts: {
          kind: "ont-signed-transfer-artifacts",
          network: "signet",
          signedTransactionHex: transactionHex,
          signedTransactionId: transactionId,
          signedPsbtBase64: "signed-psbt",
          signedInputCount: 1
        }
      })
    ).rejects.toThrow(
      "connected node rejected the transfer during testmempoolaccept: scriptpubkey"
    );
  });
});
