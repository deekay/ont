import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ECPairFactory from "ecpair";
import { initEccLib, networks, payments, Transaction } from "bitcoinjs-lib";
import * as tinysecp from "tiny-secp256k1";

import { createBitcoinRpcConfig } from "@ont/bitcoin";

import { submitTransfer } from "./submit-transfer.js";

initEccLib(tinysecp);
const ECPair = ECPairFactory(tinysecp);
const ORIGINAL_FETCH = globalThis.fetch;

function createFundingAddress(seed: number): {
  readonly key: ReturnType<typeof ECPair.fromPrivateKey>;
  readonly address: string;
} {
  const key = ECPair.fromPrivateKey(Buffer.alloc(32, seed), {
    network: networks.testnet,
    compressed: true
  });
  const address = payments.p2wpkh({
    pubkey: key.publicKey,
    network: networks.testnet
  }).address;

  if (!address) {
    throw new Error("unable to derive funding address");
  }

  return {
    key,
    address
  };
}

function createOwnerPrivateKeyHex(seed: number): string {
  const key = ECPair.fromPrivateKey(Buffer.alloc(32, seed), {
    network: networks.testnet,
    compressed: true
  });

  return Buffer.from(key.privateKey ?? []).toString("hex");
}

describe("submitTransfer", () => {
  let sandboxDir: string;

  beforeEach(async () => {
    sandboxDir = await mkdtemp(join(tmpdir(), "ont-submit-transfer-"));
  });

  afterEach(async () => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
    await rm(sandboxDir, { recursive: true, force: true });
  });

  it("builds, signs, broadcasts, and persists prototype gift-transfer artifacts", async () => {
    const funding = createFundingAddress(7);
    const bondAddress = createFundingAddress(8).address;
    const changeAddress = createFundingAddress(9).address;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    globalThis.fetch = vi.fn(async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as {
        method: string;
        params: unknown[];
      };

      if (request.method === "getblockchaininfo") {
        return new Response(
          JSON.stringify({
            result: {
              chain: "signet",
              blocks: 100,
              headers: 100,
              bestblockhash: "hash100"
            },
            error: null,
            id: "ont"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

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
        const transactionHex = String((request.params[0] as unknown[] | undefined)?.[0] ?? "");
        const txid = Transaction.fromHex(transactionHex).getId();

        return new Response(
          JSON.stringify({
            result: [
              {
                txid,
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
        const transactionHex = String(request.params[0] ?? "");
        const txid = Transaction.fromHex(transactionHex).getId();

        return new Response(
          JSON.stringify({
            result: txid,
            error: null,
            id: "ont"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      throw new Error(`unexpected rpc method ${request.method}`);
    }) as typeof fetch;

    const outDir = join(sandboxDir, "artifacts");
    const result = await submitTransfer({
      prevStateTxid: "44".repeat(32),
      ownerPrivateKeyHex: createOwnerPrivateKeyHex(11),
      newOwnerPubkey: "55".repeat(32),
      successorBondVout: 0,
      successorBondSats: 25_000_000n,
      currentBondInput: {
        txid: "aa".repeat(32),
        vout: 0,
        valueSats: 25_000_000n,
        address: funding.address
      },
      additionalFundingInputs: [
        {
          txid: "bb".repeat(32),
          vout: 1,
          valueSats: 10_000n,
          address: funding.address
        }
      ],
      feeSats: 1_000n,
      network: "signet",
      expectedChain: "signet",
      rpc: createBitcoinRpcConfig("http://127.0.0.1:38332"),
      esplora: undefined,
      wifs: [funding.key.toWIF()],
      bondAddress,
      changeAddress,
      outDir
    });

    expect(result.kind).toBe("ont-submit-transfer-result");
    expect(result.mode).toBe("gift");
    expect(result.outDir).toBe(outDir);
    expect(result.transferTxid).toHaveLength(64);

    await access(join(outDir, "transfer-artifacts.json"));
    await access(join(outDir, "signed-transfer-artifacts.json"));

    const signedTransferArtifacts = JSON.parse(
      await readFile(join(outDir, "signed-transfer-artifacts.json"), "utf8")
    ) as { signedTransactionId: string };
    expect(signedTransferArtifacts.signedTransactionId).toBe(result.transferTxid);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Modern Bitcoin Core defaults may relay it")
    );
  });
});
