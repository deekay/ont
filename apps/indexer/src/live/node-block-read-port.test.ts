// G1 sub-slice 3b-4c red battery — requireSingleBlockAtHeight (go-live phase).
// The pure guard the live port leans on: getBlock must yield exactly one block at the
// requested height or fail closed (no Merkle ordering is sound otherwise). Pins all three
// bad cases (empty, multiple, height-mismatch) plus the happy path. Negatives assert the
// specific reason so the not-implemented stub cannot spuriously pass. RED until green.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BitcoinBlock } from "@ont/bitcoin";
import { createNodeBlockReadPort, requireSingleBlockAtHeight } from "./node-block-read-port.js";

const blockAt = (height: number): BitcoinBlock => ({ hash: `h${height}`, height, transactions: [] });

describe("requireSingleBlockAtHeight (G1 3b-4c)", () => {
  it("returns the single block when exactly one matches the height", () => {
    const b = blockAt(808);
    expect(requireSingleBlockAtHeight([b], 808)).toBe(b);
  });

  it("rejects an empty result", () => {
    expect(() => requireSingleBlockAtHeight([], 808)).toThrow(/one block|exactly one|got 0/);
  });

  it("rejects multiple blocks", () => {
    expect(() => requireSingleBlockAtHeight([blockAt(808), blockAt(809)], 808)).toThrow(/one block|exactly one|got 2/);
  });

  it("rejects a single block whose height does not match", () => {
    expect(() => requireSingleBlockAtHeight([blockAt(807)], 808)).toThrow(/height|mismatch/);
  });
});

describe("createNodeBlockReadPort factory smoke (G1 3b-4c, mocked RPC)", () => {
  const rpc = { url: "http://127.0.0.1:18443" };
  const ORIGINAL_FETCH = globalThis.fetch;
  const header = "00".repeat(36) + "ab".repeat(32) + "00".repeat(12); // 80 bytes
  let calls: { method: string; params: unknown[] }[] = [];
  let blockHeightOverride: number | undefined;

  const result = (method: string, params: unknown[]): unknown => {
    if (method === "getblockcount") return 901;
    if (method === "getblockhash") return `hash${String(params[0])}`;
    if (method === "getblock") {
      return { hash: String(params[0]), height: blockHeightOverride ?? 808, tx: [{ txid: "t1", vin: [], vout: [] }] };
    }
    if (method === "getblockheader") return header;
    if (method === "getrawtransaction") return "0100000001ab";
    throw new Error(`unexpected rpc ${method}`);
  };

  beforeEach(() => {
    calls = [];
    blockHeightOverride = undefined;
    globalThis.fetch = vi.fn(async (_input, init) => {
      const body = JSON.parse(String((init as RequestInit).body)) as { method: string; params: unknown[] };
      calls.push({ method: body.method, params: body.params });
      return new Response(JSON.stringify({ result: result(body.method, body.params), error: null, id: "ont" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it("getBlock(h) issues getblockhash[h] + getblock[hash,2], NOT getblockcount", async () => {
    const block = await createNodeBlockReadPort(rpc).getBlock(808);
    expect(block.height).toBe(808);
    expect(block.hash).toBe("hash808");
    const methods = calls.map((c) => c.method);
    expect(methods).toContain("getblockhash");
    expect(methods).toContain("getblock");
    expect(methods).not.toContain("getblockcount"); // endHeight:h supplied
    expect(calls.find((c) => c.method === "getblockhash")?.params).toEqual([808]);
    expect(calls.find((c) => c.method === "getblock")?.params).toEqual(["hash808", 2]);
  });

  it("getBlock(h) fails closed when the node returns a block at the wrong height", async () => {
    blockHeightOverride = 807;
    await expect(createNodeBlockReadPort(rpc).getBlock(808)).rejects.toThrow(/height|mismatch/);
  });

  it("getTipHeight() passes through getblockcount", async () => {
    expect(await createNodeBlockReadPort(rpc).getTipHeight()).toBe(901);
    expect(calls.map((c) => c.method)).toEqual(["getblockcount"]);
  });

  it("getBlockHeaderHex / getRawTxHex call the right methods and validate the result", async () => {
    const port = createNodeBlockReadPort(rpc);
    expect(await port.getBlockHeaderHex("bh")).toBe(header);
    expect(calls.at(-1)).toEqual({ method: "getblockheader", params: ["bh", false] });
    expect(await port.getRawTxHex("tx")).toBe("0100000001ab");
    expect(calls.at(-1)).toEqual({ method: "getrawtransaction", params: ["tx", false] });
  });
});
