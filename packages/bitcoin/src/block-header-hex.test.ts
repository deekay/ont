// G1 sub-slice 3b-4b red battery — assertBlockHeaderHex (go-live phase).
// The live binding feeds a block header hex to the audited buildConfirmedBatchAnchor, which reads
// bytes 36..68 as the committed Merkle root — a wrong-length/garbage header must fail closed at the
// RPC edge, not silently produce a bad root. Pins: exactly 80 bytes = 160 lowercase hex; reject wrong
// length, non-hex, uppercase, and non-strings. Negatives assert the specific reason so the
// not-implemented stub cannot spuriously satisfy them. RED until implemented.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertBlockHeaderHex,
  getBitcoinRpcBlockHeaderHex,
  getBitcoinRpcRawTransactionHex,
  parseBitcoinRpcBlock,
} from "./index.js";

const valid = "00".repeat(36) + "ab".repeat(32) + "00".repeat(12); // 80 bytes, lowercase

describe("assertBlockHeaderHex (G1 3b-4b)", () => {
  it("accepts and returns an 80-byte (160-hex) lowercase header unchanged", () => {
    expect(assertBlockHeaderHex(valid)).toBe(valid);
  });

  it("rejects wrong-length hex with a header reason", () => {
    for (const bad of ["", "ab", "00".repeat(79), "00".repeat(81), valid + "00"]) {
      expect(() => assertBlockHeaderHex(bad)).toThrow(/header|160|80/);
    }
  });

  it("rejects non-hex and uppercase hex", () => {
    expect(() => assertBlockHeaderHex("zz".repeat(80))).toThrow(/header|hex/);
    expect(() => assertBlockHeaderHex("AB".repeat(80))).toThrow(/header|hex|lowercase/); // 160 chars but uppercase
  });

  it("rejects non-string inputs", () => {
    for (const bad of [undefined, null, 80, {}, []]) {
      expect(() => assertBlockHeaderHex(bad)).toThrow(/header|hex|string/);
    }
  });
});

describe("getBitcoinRpc{BlockHeaderHex,RawTransactionHex} (G1 3b-4b)", () => {
  const rpc = { url: "http://127.0.0.1:18443" };
  const ORIGINAL_FETCH = globalThis.fetch;
  let lastCall: { method: string; params: unknown[] } | undefined;

  const mockRpc = (result: unknown): void => {
    globalThis.fetch = vi.fn(async (_input, init) => {
      const body = JSON.parse(String((init as RequestInit).body)) as { method: string; params: unknown[] };
      lastCall = { method: body.method, params: body.params };
      return new Response(JSON.stringify({ result, error: null, id: "ont" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
  };

  beforeEach(() => {
    lastCall = undefined;
  });
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it("getBitcoinRpcBlockHeaderHex calls getblockheader [hash,false] and passes the result through assertBlockHeaderHex", async () => {
    mockRpc(valid);
    const out = await getBitcoinRpcBlockHeaderHex(rpc, "blockhash");
    expect(lastCall).toEqual({ method: "getblockheader", params: ["blockhash", false] });
    expect(out).toBe(valid);
  });

  it("getBitcoinRpcBlockHeaderHex rejects a wrong-length header result", async () => {
    mockRpc("00".repeat(79));
    await expect(getBitcoinRpcBlockHeaderHex(rpc, "blockhash")).rejects.toThrow(/header|160|80/);
  });

  it("getBitcoinRpcRawTransactionHex calls getrawtransaction [txid,false] and returns the raw hex", async () => {
    mockRpc("0100000001abcd");
    const out = await getBitcoinRpcRawTransactionHex(rpc, "thetxid");
    expect(lastCall).toEqual({ method: "getrawtransaction", params: ["thetxid", false] });
    expect(out).toBe("0100000001abcd");
  });

  it("getBitcoinRpcRawTransactionHex rejects a non-string / empty result (no silent coerce)", async () => {
    mockRpc("");
    await expect(getBitcoinRpcRawTransactionHex(rpc, "t")).rejects.toThrow(/non-string|empty/);
    mockRpc({ hex: "00" });
    await expect(getBitcoinRpcRawTransactionHex(rpc, "t")).rejects.toThrow(/non-string|empty/);
  });
});

describe("parseBitcoinRpcBlock txid-not-hash regression (G1 3b-4b)", () => {
  it("orders txids from tx[].txid, ignoring a differing tx[].hash (wtxid)", () => {
    const block = parseBitcoinRpcBlock({
      hash: "blockhash",
      height: 5,
      tx: [{ txid: "a".repeat(64), hash: "b".repeat(64), vin: [], vout: [] }],
    });
    expect(block.transactions[0]!.txid).toBe("a".repeat(64));
  });
});
