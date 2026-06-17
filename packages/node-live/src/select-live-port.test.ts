// Slice 4 red battery — selectLivePort (go-live env-selected wiring).
// Pins CL's watches: memory is the default unless ONT_SOURCE=node; node mode runs the
// chain gate (assertExpectedChain) BEFORE the live port is built (so no live RPC until
// the chain is proven); unknown ONT_SOURCE / bad ONT_CHAIN fail closed without building
// live. Negatives assert the specific reason so the not-implemented stub can't pass.
import { describe, expect, it, vi } from "vitest";
import type { BitcoinRpcBlockchainInfo, BitcoinRpcChain, BitcoinRpcConfig } from "@ont/bitcoin";
import { selectLivePort, type ChainAssert } from "./index.js";

const RPC: BitcoinRpcConfig = { url: "http://127.0.0.1:18443" };
const okAssert = (): ChainAssert => vi.fn(async (_rpc, expected) => ({ chain: expected }) as BitcoinRpcBlockchainInfo);

describe("selectLivePort (G1 slice 4)", () => {
  it("defaults to memory when ONT_SOURCE is unset or 'memory' — never builds live or touches the chain", async () => {
    for (const source of [undefined, "memory"]) {
      const memory = vi.fn(() => "MEM");
      const live = vi.fn(() => "LIVE");
      const assertChain = okAssert();
      const out = await selectLivePort({ source, chain: "regtest", rpc: RPC, memory, live, assertChain });
      expect(out).toBe("MEM");
      expect(live).not.toHaveBeenCalled();
      expect(assertChain).not.toHaveBeenCalled();
    }
  });

  it("node mode runs the chain gate BEFORE building the live port", async () => {
    const order: string[] = [];
    const assertChain = vi.fn<ChainAssert>(async (_rpc, expected) => {
      order.push("assert");
      return { chain: expected } as BitcoinRpcBlockchainInfo;
    });
    const live = vi.fn(() => {
      order.push("live");
      return "LIVE";
    });
    const out = await selectLivePort({ source: "node", chain: "regtest", rpc: RPC, memory: () => "MEM", live, assertChain });
    expect(out).toBe("LIVE");
    expect(assertChain).toHaveBeenCalledWith(RPC, "regtest");
    expect(order).toEqual(["assert", "live"]); // gate first, then live
  });

  it("node mode with a bad/missing ONT_CHAIN fails closed before any chain RPC or live build", async () => {
    for (const chain of [undefined, "", "main", "mainnet"]) {
      const live = vi.fn(() => "LIVE");
      const assertChain = okAssert();
      await expect(
        selectLivePort({ source: "node", chain, rpc: RPC, memory: () => "MEM", live, assertChain }),
      ).rejects.toThrow(/ONT_CHAIN/);
      expect(assertChain).not.toHaveBeenCalled();
      expect(live).not.toHaveBeenCalled();
    }
  });

  it("node mode propagates a chain mismatch and does not build live", async () => {
    const live = vi.fn(() => "LIVE");
    const assertChain = vi.fn<ChainAssert>(async () => {
      throw new Error("bitcoin rpc chain mismatch: expected regtest, got main");
    });
    await expect(
      selectLivePort({ source: "node", chain: "regtest", rpc: RPC, memory: () => "MEM", live, assertChain }),
    ).rejects.toThrow(/chain mismatch/);
    expect(live).not.toHaveBeenCalled();
  });

  it("rejects an unknown ONT_SOURCE with an ONT_SOURCE reason, building nothing", async () => {
    const memory = vi.fn(() => "MEM");
    const live = vi.fn(() => "LIVE");
    await expect(
      selectLivePort({ source: "esplora", chain: "regtest", rpc: RPC, memory, live, assertChain: okAssert() }),
    ).rejects.toThrow(/ONT_SOURCE/);
    expect(memory).not.toHaveBeenCalled();
    expect(live).not.toHaveBeenCalled();
  });
});
