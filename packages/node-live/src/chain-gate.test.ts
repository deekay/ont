// G1 slice 2 red battery — chain-safety gate (go-live phase).
// Pins CL's boundary: allow only regtest|signet; reject unset/empty/main/mainnet/test;
// assert the node chain before any wiring; never call the assertion for a rejected
// ONT_CHAIN (fail closed BEFORE any RPC — so a mispointed URL can't reach mainnet).
// Negative tests assert the SPECIFIC reason so the not-implemented stub cannot
// satisfy them — RED until green. See docs/core/GO_LIVE_PLAN.md (G1).
import { describe, expect, it, vi } from "vitest";
import type { BitcoinRpcBlockchainInfo, BitcoinRpcChain, BitcoinRpcConfig } from "@ont/bitcoin/node";
import { assertExpectedChain, parseAllowedChain, type ChainAssert } from "./chain-gate.js";

const RPC: BitcoinRpcConfig = { url: "http://127.0.0.1:18443" };
const infoFor = (chain: BitcoinRpcChain): BitcoinRpcBlockchainInfo =>
  ({ chain } as BitcoinRpcBlockchainInfo);

describe("parseAllowedChain (G1)", () => {
  it("accepts the two live chains", () => {
    expect(parseAllowedChain("regtest")).toBe("regtest");
    expect(parseAllowedChain("signet")).toBe("signet");
  });

  it("rejects unset / empty / main / mainnet / test with an ONT_CHAIN reason", () => {
    for (const bad of [undefined, "", "main", "mainnet", "test", "MAINNET", "Regtest"]) {
      expect(() => parseAllowedChain(bad as string | undefined)).toThrow(/ONT_CHAIN/);
    }
  });

  it("rejects whitespace-padded values — exact env value only (CL hardening)", () => {
    for (const bad of [" regtest", "regtest ", " regtest ", "regtest\n", "\tsignet", "signet\r\n"]) {
      expect(() => parseAllowedChain(bad)).toThrow(/ONT_CHAIN/);
    }
  });
});

describe("assertExpectedChain (G1)", () => {
  it("asserts the parsed expected chain via the injected seam and returns its info", async () => {
    const assertChain = vi.fn<ChainAssert>(async (_rpc, expected) => infoFor(expected));

    const info = await assertExpectedChain(RPC, "regtest", assertChain);

    expect(assertChain).toHaveBeenCalledTimes(1);
    expect(assertChain).toHaveBeenCalledWith(RPC, "regtest");
    expect(info.chain).toBe("regtest");
  });

  it("fails closed BEFORE any RPC when ONT_CHAIN is rejected (assert never called)", async () => {
    const assertChain = vi.fn<ChainAssert>(async (_rpc, expected) => infoFor(expected));

    await expect(assertExpectedChain(RPC, "main", assertChain)).rejects.toThrow(/ONT_CHAIN/);
    expect(assertChain).not.toHaveBeenCalled();
  });
});
