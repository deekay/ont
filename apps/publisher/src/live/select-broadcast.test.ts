// Slice 4b red battery — selectPublisherBroadcastPort (go-live entrypoint wiring).
// Pins CL's watches: in-memory is the hermetic default (unset OR ONT_SOURCE=memory) and the
// chain gate is NEVER consulted there; node mode threads resolveNodeRuntime (so a missing
// ONT_RPC_URL fails closed BEFORE the gate, never reaching an RPC); node mode runs the chain
// gate with the resolved rpc + chain and only builds the live port after it passes; and a
// rejecting gate fails the selection closed. RED until implemented.
import { describe, expect, it, vi } from "vitest";
import type { LegacyTransaction } from "@ont/bitcoin";
import type {
  BitcoinRpcBlockchainInfo,
  BitcoinRpcChain,
  BitcoinRpcConfig,
} from "@ont/bitcoin/node";
import type { ChainAssert } from "@ont/node-live";
import { selectPublisherBroadcastPort } from "./select-broadcast.js";

const okChain = (chain: BitcoinRpcChain): BitcoinRpcBlockchainInfo => ({
  chain,
  blocks: 0,
  headers: 0,
  bestblockhash: "00".repeat(32),
});

// A minimal serializable signed tx — the in-memory port assigns it a txid via legacyTxidOf.
const sampleTx: LegacyTransaction = {
  version: 2,
  inputs: [{ prevoutTxid: "11".repeat(32), prevoutVout: 0, scriptSigHex: "", sequence: 0xffffffff }],
  outputs: [{ valueSats: 0n, scriptPubKeyHex: "6a0100" }],
  locktime: 0,
};

describe("selectPublisherBroadcastPort (G1 slice 4b entrypoint wiring)", () => {
  it("unset ONT_SOURCE → in-memory broadcast port, chain gate untouched", async () => {
    const assertChain = vi.fn<ChainAssert>(async () => okChain("regtest"));
    const port = await selectPublisherBroadcastPort({}, assertChain);
    expect(assertChain).not.toHaveBeenCalled();
    expect(await port.broadcast(sampleTx)).toMatchObject({ ok: true });
  });

  it("ONT_SOURCE=memory → in-memory broadcast port, chain gate untouched", async () => {
    const assertChain = vi.fn<ChainAssert>(async () => okChain("regtest"));
    const port = await selectPublisherBroadcastPort({ ONT_SOURCE: "memory" }, assertChain);
    expect(assertChain).not.toHaveBeenCalled();
    expect(await port.broadcast(sampleTx)).toMatchObject({ ok: true });
  });

  it("node mode threads resolveNodeRuntime — missing ONT_RPC_URL fails closed BEFORE the gate", async () => {
    const assertChain = vi.fn<ChainAssert>(async () => okChain("regtest"));
    await expect(
      selectPublisherBroadcastPort({ ONT_SOURCE: "node", ONT_CHAIN: "regtest" }, assertChain),
    ).rejects.toThrow(/ONT_RPC_URL/);
    expect(assertChain).not.toHaveBeenCalled();
  });

  it("node mode runs the chain gate with the resolved rpc + chain, then returns a live port", async () => {
    let seenRpc: BitcoinRpcConfig | undefined;
    let seenChain: BitcoinRpcChain | undefined;
    const assertChain = vi.fn<ChainAssert>(async (rpc, expected) => {
      seenRpc = rpc;
      seenChain = expected;
      return okChain(expected);
    });
    const port = await selectPublisherBroadcastPort(
      {
        ONT_SOURCE: "node",
        ONT_CHAIN: "regtest",
        ONT_RPC_URL: "http://127.0.0.1:18443",
        ONT_RPC_USER: "u",
        ONT_RPC_PASSWORD: "p",
      },
      assertChain,
    );
    expect(assertChain).toHaveBeenCalledTimes(1);
    expect(seenChain).toBe("regtest");
    expect(seenRpc).toEqual({ url: "http://127.0.0.1:18443", username: "u", password: "p" });
    expect(typeof port.broadcast).toBe("function");
  });

  it("node mode fails closed when the chain gate rejects (gate before the live build)", async () => {
    const assertChain = vi.fn<ChainAssert>(async () => {
      throw new Error("node chain is main, expected regtest");
    });
    await expect(
      selectPublisherBroadcastPort(
        { ONT_SOURCE: "node", ONT_CHAIN: "regtest", ONT_RPC_URL: "http://127.0.0.1:18443" },
        assertChain,
      ),
    ).rejects.toThrow(/chain/);
  });
});
